(function (global) {
    'use strict';

    const CocTool = global.CocTool;
    if (!CocTool || !CocTool.state || !CocTool.storage) {
        throw new Error('accounts.js requires core.js');
    }

    const state = CocTool.state;
    const storage = CocTool.storage;
    const accounts = state.accounts;
    const accountNotes = state.accountNotes;
    const accountOrder = state.accountOrder;
    const settings = state.settings;
    const sessionDismissedCategories = state.sessionDismissedCategories;
    const calc = CocTool.calc;

    const jsonModal = document.getElementById('json-modal');
    const jsonInput = document.getElementById('json-input');
    const importBtn = document.getElementById('import-btn');
    const parseBtn = document.getElementById('parse-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const loadingIndicator = document.getElementById('loading-indicator');
    const emptyState = document.getElementById('empty-state');
    const upgradesContainer = document.getElementById('upgrades-container');
    const upgradesCountBadge = document.getElementById('upgrades-count-badge');
    const dataInfoDiv = document.getElementById('data-info');
    const accountTagSpan = document.getElementById('account-tag');
    const exportTimeSpan = document.getElementById('export-time');
    const currentTimeSpan = document.getElementById('current-time');
    const tabContainer = document.getElementById('tab-container');
    const accountActionsDiv = document.getElementById('account-actions');
    const setNoteBtn = document.getElementById('set-note-btn');
    const removeAccountBtn = document.getElementById('remove-account-btn');
    const sortContent = document.getElementById('sort-content');
    const sortListContainer = document.getElementById('sort-list-container');
    const sortApplyBtn = document.getElementById('sort-apply-btn');
    const sortCancelBtn = document.getElementById('sort-cancel-btn');
    const mainDisplayArea = document.getElementById('main-display-area');

    let initialized = false;
    let sortTimer = null;
    let importingGuard = false;
    let lastAutoImport = 0;

    function progress() {
        return CocTool.features.progress;
    }

    function services() {
        return CocTool.features.services;
    }

    function saveToLocalStorage() { return storage.saveAccounts(); }
    function saveSettings() { return storage.saveSettings(); }
    function showToast(message, duration) { CocTool.ui.showToast(message, duration); }
    function startBackgroundCheck() {
        const module = services();
        if (module) module.start();
    }
    function stopBackgroundCheck() {
        const module = services();
        if (module) module.stop();
    }
    function autoWebdavUpload() {
        const module = services();
        return module ? module.autoWebdavUpload() : Promise.resolve();
    }
    function applySettings() {
        const module = CocTool.features.settings;
        if (module) module.apply();
    }

    function calculateCompletionTimestamp(...args) { return calc.calculateCompletionTimestamp(...args); }
    function extractUpgradingItems(...args) { return calc.extractUpgradingItems(...args); }
    function getItemName(...args) { return calc.getItemName(...args); }
    function formatRemainingTime(...args) { return calc.formatRemainingTime(...args); }
    function formatExportTime(...args) { return calc.formatExportTime(...args); }
    function escapeHtml(...args) { return calc.escapeHtml(...args); }
    function filterNightWorld(...args) { return calc.filterNightWorld(...args); }
    function getAccountTabColor(...args) { return calc.getAccountTabColor(...args); }
    function getRemainingColor(...args) { return calc.getRemainingColor(...args); }
    function hasSleepHighlight(...args) { return calc.hasSleepHighlight(...args); }
    function addAccountToOrder(tag) {
        if (!accountOrder.includes(tag)) accountOrder.push(tag);
    }

    function removeAccountFromOrder(tag) {
        const index = accountOrder.indexOf(tag);
        if (index !== -1) accountOrder.splice(index, 1);
    }

    function updateAllAccountTabColors() {
        accountOrder.forEach(tag => {
            const tab = document.querySelector(`[data-account="${tag}"]`);
            if (tab) {
                const textSpan = tab.querySelector('span');
                if (textSpan) {
                    textSpan.classList.remove('text-success', 'text-danger_red', 'text-warning_orangered', 'text-warning_orange', 'text-warning_yellow');
                    const colorClass = getAccountTabColor(accounts[tag]);
                    if (colorClass) textSpan.classList.add(colorClass);
                }
                tab.classList.toggle('sleep-highlight-tab', hasSleepHighlight(accounts[tag]));
            }
        });
    }

    function updateMainTitle() {
        const titleEl = document.getElementById('main-title');
        if (!titleEl) return;
        if (accountOrder.length === 0) {
            titleEl.textContent = '部落小工具';
            return;
        }
        const now = Math.floor(Date.now() / 1000);
        let accountsWithDone = 0;
        accountOrder.forEach(tag => {
            const data = accounts[tag];
            if (!data) return;
            const items = filterNightWorld(extractUpgradingItems(data, now, true));
            for (const item of items) {
                const completionTs = calculateCompletionTimestamp(item, data);
                if (completionTs <= now) {
                    accountsWithDone++;
                    break;
                }
            }
        });
        if (accountsWithDone === 0) {
            titleEl.textContent = '部落小工具';
        } else {
            titleEl.textContent = `${accountsWithDone}个账号待处理`;
        }
    }

    function updateDataInfo(data) {
        if (data.tag) {
            const note = accountNotes[data.tag] || data.tag;
            accountTagSpan.textContent = `${note} (${data.tag})`;
            document.getElementById('upgrade-title-text').textContent = `${note}的升级项目`;
        } else {
            accountTagSpan.textContent = "未知账号";
            document.getElementById('upgrade-title-text').textContent = '正在升级的项目';
        }
        exportTimeSpan.textContent = formatExportTime(data.timestamp);
        dataInfoDiv.classList.remove('hidden');
        const chestEl = document.getElementById('chest-notification');
        if (chestEl) {
            const hasChest = settings.chestDetect && data.obstacles && Array.isArray(data.obstacles) && data.obstacles.some(o => o.data === 8000030 && o.cnt > 0);
            chestEl.classList.toggle('hidden', !hasChest);
        }
    }
    // ========== 排序功能 ==========
    let isSortMode = false;
    let sortModalOrder = [];
    let sortDragCleanup = null;

    function enterSortMode() {
        isSortMode = true;
        sortModalOrder = [...accountOrder];
        const serviceModule = services();
        if (serviceModule) serviceModule.pauseTicker();
        dataInfoDiv.classList.add('hidden');
        accountActionsDiv.classList.add('hidden');
        mainDisplayArea.classList.add('hidden');
        sortContent.classList.remove('hidden');
        updateSortListHeight();
        window.addEventListener('resize', onSortResize);
        renderSortList();
        rebuildAllTabs();
        if (sortTimer) clearInterval(sortTimer);
        sortTimer = setInterval(updateSortTimers, 1000);
    }

    function updateSortListHeight() {
        const sortRect = sortContent.getBoundingClientRect();
        const bottomArea = sortListContainer.nextElementSibling;
        const bottomHeight = bottomArea ? bottomArea.offsetHeight : 48;
        const availableHeight = (window.innerHeight*0.85) - sortRect.top - bottomHeight - 8;
        sortListContainer.style.maxHeight = Math.max(100, availableHeight) + 'px';
    }

    function onSortResize() {
        if (isSortMode) updateSortListHeight();
    }
    function exitSortMode(applyChanges = false) {
        isSortMode = false;
        window.removeEventListener('resize', onSortResize);
        if (sortDragCleanup) { sortDragCleanup(); sortDragCleanup = null; }
        if (sortTimer) { clearInterval(sortTimer); sortTimer = null; }
        const serviceModule = services();
        if (serviceModule) serviceModule.resumeTicker();
        sortContent.classList.add('hidden');
        mainDisplayArea.classList.remove('hidden');
        dataInfoDiv.classList.remove('hidden');
        if (applyChanges) {
            accountOrder.splice(0, accountOrder.length, ...sortModalOrder);
            saveToLocalStorage();
            if (state.currentAccount && !accountOrder.includes(state.currentAccount)) {
                state.currentAccount = accountOrder[0] || null;
            }
        }
        rebuildAllTabs();
        if (state.currentAccount &&
            accounts[state.currentAccount]) {
            switchAccount(state.currentAccount);
        } else if (accountOrder.length) {
            switchAccount(accountOrder[0]);
        }
    }

    // 仅在排序模式激活时退出（供 core.js 切换页面时调用，避免非排序状态重复重建）
    function exitSortModeIfActive() {
        if (isSortMode) exitSortMode(false);
    }

    function renderSortList() {
        if (sortDragCleanup) { sortDragCleanup(); sortDragCleanup = null; }
        sortListContainer.innerHTML = '';
        const now = Math.floor(Date.now() / 1000);
        sortModalOrder.forEach(tag => {
            const note = accountNotes[tag] || tag;
            const div = document.createElement('div');
            const sortSleepClass = hasSleepHighlight(accounts[tag]) ? ' sleep-highlight' : '';
            div.className = `sort-item bg-gray-50 rounded-lg p-2 mb-1 flex items-center border border-gray-200${sortSleepClass}`;
            div.setAttribute('data-account', tag);
            const colorClass = accounts[tag] ? getAccountTabColor(accounts[tag]) : '';

            let rightHtml = '';
            const data = accounts[tag];
            if (data) {
                const items = filterNightWorld(extractUpgradingItems(data, now, true));
                if (items.length > 0) {
                    let completedItems = [];
                    let inProgressItems = [];
                    for (const item of items) {
                        const completionTs = calculateCompletionTimestamp(item, data);
                        const remaining = completionTs - now;
                        if (remaining <= 0) {
                            completedItems.push({ item, completionTs });
                        } else {
                            inProgressItems.push({ item, completionTs, remaining });
                        }
                    }

                    if (completedItems.length > 0) {
                        completedItems.sort((a, b) => a.completionTs - b.completionTs);
                        const earliestName = getItemName(completedItems[0].item.data);
                        const count = completedItems.length;
                        if (count >= 2) {
                            rightHtml = `<span class="text-xs text-success ml-auto">${escapeHtml(earliestName)}等${count}个已完成</span>`;
                        } else {
                            rightHtml = `<span class="text-xs text-success ml-auto">${escapeHtml(earliestName)}已完成</span>`;
                        }
                    } else {
                        let shortestItem = null;
                        let shortestRemaining = Infinity;
                        for (const { item, completionTs, remaining } of inProgressItems) {
                            if (remaining < shortestRemaining) {
                                shortestRemaining = remaining;
                                shortestItem = item;
                            }
                        }
                        if (shortestItem) {
                            const completionTs = calculateCompletionTimestamp(shortestItem, data);
                            const remaining = completionTs - now;
                            const name = getItemName(shortestItem.data);
                            const remainFmt = formatRemainingTime(Math.max(0, remaining));
                            const timeColor = getRemainingColor(remaining);
                            rightHtml = `<span class="sort-timer text-xs ${timeColor} ml-auto" data-completion="${completionTs}" data-name="${escapeHtml(name)}">${escapeHtml(name)}：${remainFmt}</span>`;
                        }
                    }
                } else {
                    rightHtml = `<span class="text-xs text-gray-400 ml-auto">无升级项目</span>`;
                }
            }

            div.innerHTML = `<i class="fa fa-bars text-gray-400 mr-2"></i><span class="text-sm font-medium ${colorClass || 'text-gray-800'}">${escapeHtml(note)}</span>${rightHtml}`;
            sortListContainer.appendChild(div);
        });
        sortDragCleanup = initSortDrag();
    }

    function updateSortTimers() {
        if (sortContent.classList.contains('hidden')) return;
        const now = Date.now() / 1000;
        document.querySelectorAll('.sort-timer').forEach(el => {
            const completionTs = parseFloat(el.getAttribute('data-completion'));
            const name = el.getAttribute('data-name');
            const remaining = Math.max(0, completionTs - now);
            const remainFmt = formatRemainingTime(remaining);
            const colorClass = getRemainingColor(remaining);
            el.className = `sort-timer text-xs ${colorClass} ml-auto`;
            el.textContent = `${name}：${remainFmt}`;
        });
        document.querySelectorAll('.sort-item').forEach(el => {
            const tag = el.getAttribute('data-account');
            if (tag && accounts[tag]) {
                el.classList.toggle('sleep-highlight', hasSleepHighlight(accounts[tag]));
            }
        });
    }

    function initSortDrag() {
        const container = sortListContainer;
        if (!container) return null;
        let dragElement = null, startY = 0, currentIndex = -1, hasMoved = false;
        const MOVE_THRESHOLD = 5;

        function getSortItems() {
            return Array.from(container.querySelectorAll('.sort-item:not(.drag-placeholder)'));
        }

        function onPointerDown(e) {
            const item = e.target.closest('.sort-item');
            if (!item) return;
            const rect = item.getBoundingClientRect();
            const xInItem = e.clientX - rect.left;
            if (xInItem > rect.width / 3) return;
            dragElement = item;
            startY = e.clientY;
            currentIndex = getSortItems().indexOf(item);
            hasMoved = false;
            item.setPointerCapture(e.pointerId);
            e.preventDefault();
        }

        function onPointerMove(e) {
            if (!dragElement) return;
            const dy = e.clientY - startY;
            if (!hasMoved && Math.abs(dy) > MOVE_THRESHOLD) {
                hasMoved = true;
                container.style.overflowY = 'hidden';
                dragElement.classList.add('dragging');
                const placeholder = document.createElement('div');
                placeholder.className = 'sort-item drag-placeholder bg-gray-50 rounded-lg p-2 mb-1 border border-dashed border-primary';
                placeholder.style.height = dragElement.offsetHeight + 'px';
                dragElement.parentNode.insertBefore(placeholder, dragElement);
                const rect = dragElement.getBoundingClientRect();
                dragElement.style.position = 'fixed';
                dragElement.style.left = rect.left + 'px';
                dragElement.style.top = rect.top + 'px';
                dragElement.style.width = rect.width + 'px';
                dragElement.style.zIndex = '1000';
                dragElement.style.pointerEvents = 'none';
            }
            if (hasMoved) {
                dragElement.style.top = (e.clientY - dragElement.offsetHeight / 2) + 'px';
                const items = getSortItems();
                const placeholder = container.querySelector('.drag-placeholder');
                if (!placeholder) return;
                let targetIndex = items.indexOf(placeholder);
                for (let i = 0; i < items.length; i++) {
                    if (items[i] === placeholder) continue;
                    const rect = items[i].getBoundingClientRect();
                    const centerY = rect.top + rect.height / 2;
                    if (e.clientY < centerY) { targetIndex = i; break; }
                    targetIndex = i + 1;
                }
                if (targetIndex !== currentIndex) {
                    currentIndex = targetIndex;
                    if (targetIndex >= items.length) container.appendChild(placeholder);
                    else container.insertBefore(placeholder, items[targetIndex]);
                }
            }
        }

        function onPointerUp(e) {
            if (!dragElement) return;
            const placeholder = container.querySelector('.drag-placeholder');
            if (hasMoved && placeholder) {
                container.insertBefore(dragElement, placeholder);
                placeholder.remove();
                dragElement.style.position = '';
                dragElement.style.left = '';
                dragElement.style.top = '';
                dragElement.style.width = '';
                dragElement.style.zIndex = '';
                dragElement.style.pointerEvents = '';
                dragElement.classList.remove('dragging');
                sortModalOrder = getSortItems().map(item => item.getAttribute('data-account')).filter(Boolean);
            } else if (dragElement) {
                dragElement.classList.remove('dragging');
                if (!hasMoved) {
                    const tag = dragElement.getAttribute('data-account');
                    if (tag) switchAccount(tag);
                }
            }
            container.style.overflowY = 'auto';
            try { dragElement.releasePointerCapture(e.pointerId); } catch (ex) {}
            dragElement = null;
            hasMoved = false;
        }

        function onSortItemClick(e) {
            const item = e.target.closest('.sort-item');
            if (!item) return;
            const tag = item.getAttribute('data-account');
            if (tag) switchAccount(tag);
        }

        function onTouchStart(e) {
            if (e.touches.length !== 1) return;
            const item = e.target.closest('.sort-item');
            if (!item) return;
            const rect = item.getBoundingClientRect();
            const xInItem = e.touches[0].clientX - rect.left;
            if (xInItem <= rect.width / 3) {
                e.preventDefault();
            }
        }

        container.addEventListener('touchstart', onTouchStart, { passive: false });
        container.addEventListener('pointerdown', onPointerDown);
        container.addEventListener('pointermove', onPointerMove);
        container.addEventListener('pointerup', onPointerUp);
        container.addEventListener('pointercancel', onPointerUp);
        container.addEventListener('click', onSortItemClick);
        container.addEventListener('dragstart', (e) => e.preventDefault());

        return () => {
            container.removeEventListener('touchstart', onTouchStart);
            container.removeEventListener('pointerdown', onPointerDown);
            container.removeEventListener('pointermove', onPointerMove);
            container.removeEventListener('pointerup', onPointerUp);
            container.removeEventListener('pointercancel', onPointerUp);
            container.removeEventListener('click', onSortItemClick);
            container.removeEventListener('dragstart', (e) => e.preventDefault());
        };
    }

    // ========== 左右滑动切换账号 ==========
    function initSwipeGesture() {
        let startX = 0, startY = 0;
        const SWIPE_THRESHOLD = 50, ANGLE_THRESHOLD = 1.5;

        mainDisplayArea.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) { startX = e.touches[0].clientX; startY = e.touches[0].clientY; }
        }, { passive: true });

        mainDisplayArea.addEventListener('touchend', (e) => {
            if (e.changedTouches.length === 1 && accountOrder.length > 1 && state.currentAccount) {
                const endX = e.changedTouches[0].clientX, endY = e.changedTouches[0].clientY;
                const dx = endX - startX, dy = endY - startY;
                if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * ANGLE_THRESHOLD) {
                    const target = e.target;
                    if (target && target.closest('#tab-container')) return;
                    const currentIndex = accountOrder.indexOf(state.currentAccount);
                    if (currentIndex === -1) return;
                    if (dx > 0) { if (currentIndex > 0) { switchAccount(accountOrder[currentIndex - 1]); if (settings.vibrate !== false) CocTool.platform.call('vibrate', 40); } }
                    else { if (currentIndex < accountOrder.length - 1) { switchAccount(accountOrder[currentIndex + 1]); if (settings.vibrate !== false) CocTool.platform.call('vibrate', 40); } }
                }
            }
        }, { passive: true });
    }
    function switchAccount(accountTag) {
        if (isSortMode) exitSortMode(false);
        if (!accounts[accountTag]) return;
        state.currentAccount = accountTag;
        saveToLocalStorage();
        document.querySelectorAll('.account-tab').forEach(tab => {
            if (tab.getAttribute('data-sort') === 'true') return;
            if (tab.getAttribute('data-account') === accountTag) {
                tab.classList.add('active-tab');
                tab.classList.remove('text-gray-500', 'hover:text-gray-700', 'hover:bg-gray-50');
            } else {
                tab.classList.remove('active-tab');
                tab.classList.add('text-gray-500', 'hover:text-gray-700', 'hover:bg-gray-50');
            }
        });
        const data = accounts[accountTag];
        updateDataInfo(data);
        var p = progress();
        if (p) p.render(data);
        updateMainTitle();
        applySettings();
        accountActionsDiv.classList.remove('hidden');
    }

    function rebuildAllTabs() {
        if (!tabContainer) return;
        tabContainer.innerHTML = '';
        const sortTab = document.createElement('button');
        sortTab.className = 'account-tab px-1.5 py-1 text-sm font-medium rounded-t-lg transition-all duration-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50';
        sortTab.setAttribute('data-sort', 'true');
        sortTab.innerHTML = `<span><i class="fa fa-sort mr-0.5"></i>排序</span>`;
        sortTab.style.backgroundColor = '#f8fafc';
        if (isSortMode) {
            sortTab.classList.add('bg-white', 'text-primary', 'border', 'border-gray-200', 'border-b-white');
            sortTab.classList.remove('text-gray-500', 'hover:text-gray-700', 'hover:bg-gray-50');
            sortTab.style.backgroundColor = '';
        }
        tabContainer.appendChild(sortTab);
        if (accountOrder.length === 0) return;
        accountOrder.forEach(tag => {
            if (!accounts[tag]) return;
            const tab = document.createElement('button');
            tab.className = 'account-tab px-1.5 py-1 text-sm font-medium rounded-t-lg transition-all duration-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50';
            tab.setAttribute('data-account', tag);
            const note = accountNotes[tag] || tag;
            const mode = settings.noteDisplayMode && settings.noteDisplayMode[tag];
            let displayText = note;
            if (mode === '2') displayText = note.slice(0, 2);
            else if (mode === '3') displayText = note.slice(0, 3);
            tab.innerHTML = `<span>${escapeHtml(displayText)}</span>`;
            tabContainer.appendChild(tab);
            const textSpan = tab.querySelector('span');
            if (textSpan) {
                const colorClass = getAccountTabColor(accounts[tag]);
                if (colorClass) textSpan.classList.add(colorClass);
            }
            if (hasSleepHighlight(accounts[tag])) {
                tab.classList.add('sleep-highlight-tab');
            }
        });
        if (!isSortMode && state.currentAccount && accounts[state.currentAccount]) {
            const activeTab = document.querySelector(`[data-account="${state.currentAccount}"]`);
            if (activeTab) {
                activeTab.classList.add('active-tab');
                activeTab.classList.remove('text-gray-500', 'hover:text-gray-700', 'hover:bg-gray-50');
            }
        } else if (!isSortMode && accountOrder.length) switchAccount(accountOrder[0]);
    }

    function removeAccount(accountTag) {
        if (!accounts[accountTag]) return;
        delete accounts[accountTag];
        delete accountNotes[accountTag];
        removeAccountFromOrder(accountTag);
        rebuildAllTabs();
        const remaining = Object.keys(accounts);
        if (remaining.length) switchAccount(remaining[0]);
        else {
            state.currentAccount = null;
            showEmptyState('暂无账号，点击「导入数据」添加');
            dataInfoDiv.classList.add('hidden');
            accountActionsDiv.classList.add('hidden');
            upgradesContainer.classList.add('hidden');
            upgradesCountBadge.classList.add('hidden');
            emptyState.classList.remove('hidden');
            stopBackgroundCheck();
        }
        updateMainTitle();
        saveToLocalStorage();
    }

    function setAccountNote(accountTag) {
        const modal = document.getElementById('note-modal');
        const input = document.getElementById('note-input');
        input.value = accountNotes[accountTag] || '';
        // 恢复已保存的显示模式
        const radios = modal.querySelectorAll('.note-display-radio');
        const savedMode = settings.noteDisplayMode && settings.noteDisplayMode[accountTag];
        radios.forEach(r => r.checked = r.value === (savedMode || 'full'));
        modal.classList.remove('hidden');
        input.focus();
        const save = () => {
            const val = input.value.trim();
            if (val) accountNotes[accountTag] = val;
            else delete accountNotes[accountTag];
            // 保存显示模式
            const selected = modal.querySelector('.note-display-radio:checked');
            if (selected) {
                if (!settings.noteDisplayMode) settings.noteDisplayMode = {};
                settings.noteDisplayMode[accountTag] = selected.value;
                saveSettings();
            }
            rebuildAllTabs();
            if (state.currentAccount === accountTag) updateDataInfo(accounts[accountTag]);
            saveToLocalStorage();
            modal.classList.add('hidden');
        };
        document.getElementById('note-cancel-btn').onclick = () => modal.classList.add('hidden');
        document.getElementById('note-save-btn').onclick = save;
        input.onkeypress = (e) => { if (e.key === 'Enter') save(); };
    }

    function showLoading() { loadingIndicator.classList.remove('hidden'); upgradesContainer.classList.add('hidden'); emptyState.classList.add('hidden'); }
    function hideLoading() { loadingIndicator.classList.add('hidden'); }

    function showEmptyState(msg) { emptyState.innerHTML = `<i class="fa fa-info-circle text-gray-300 text-5xl mb-4"></i><p class="text-gray-500">${msg}</p>`; emptyState.classList.remove('hidden'); upgradesContainer.classList.add('hidden'); upgradesCountBadge.classList.add('hidden'); loadingIndicator.classList.add('hidden'); }
    function updateCurrentTime() {
        const d = new Date();
        currentTimeSpan.textContent = `${d.getMonth()+1}/${d.getDate()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`;
    }
    function hideJsonModal() { jsonModal.classList.add('hidden'); jsonInput.value = ''; }
    function showJsonModal() { jsonModal.classList.remove('hidden'); jsonInput.focus(); }
    function importAccountData(data) {
        const tag = data.tag || `账号_${Date.now()}`;
        // 如果 timestamp 和上次相同，跳过解析更新
        if (accounts[tag] && accounts[tag].timestamp === data.timestamp) return;
        const progressModule = progress();
        if (progressModule) progressModule.resetIconCache();
        importingGuard = true;
        // 清除该账号已发出的通知（传 tag：dedupKey 前缀含账号标识，显示名仅匹配消息内容）
        // 注意：调用时机在导入流程末尾（setSchedule 之后）——必须先让 Java 完成新调度注册+持久化，
        // 再清已发记录，否则 Handler 轮询旧调度会把刚推送过的任务再次补发（导入后重复通知）
        const displayName = accountNotes[tag] || tag;
        accounts[tag] = data;
        // 清除单次屏蔽（新数据导入后恢复）
        if (sessionDismissedCategories[tag]) { delete sessionDismissedCategories[tag]; settings.sessionDismissedCategories = sessionDismissedCategories; }
        if (!accountNotes[tag]) delete accountNotes[tag];
        addAccountToOrder(tag);
        // 记录导入日志（timestamp + boosts 便于比对调度计算）
        var svc = services();
        if (svc && svc.log) {
            svc.log('导入', '数据更新', { account: displayName, meta: { timestamp: data.timestamp, boosts: JSON.stringify(data.boosts || {}) } });
        }
        try { rebuildAllTabs(); } catch (e) {}
        try { switchAccount(tag); } catch (e) {}
        try { saveToLocalStorage(); } catch (e) {}
        try { startBackgroundCheck(); } catch (e) {}
        // 清除已发记录放在 setSchedule 之后（见上方注释）：避免 Handler 轮询旧调度重复补发刚推送过的任务
        // 守卫必须检查方法存在：网页版 shim 桩无 clearAccountNotifications，直接调用会抛错（2026-08-16 实测：导入成功但提示 json 数据不正确）
        if (window.AndroidApp && window.AndroidApp.clearAccountNotifications) window.AndroidApp.clearAccountNotifications(displayName, tag);
        // 自动上传 WebDAV（延迟执行，避免 blocking UI 渲染）
        if (settings.webdavEnabled && settings.webdavAutoUpload && settings.webdavServer) {
            setTimeout(() => {
                autoWebdavUpload().catch(e => {});
            }, 1500);
        }
        importingGuard = false;
        detectAccountServer(tag, data);
        if (CocTool.features.overview && CocTool.features.overview.refreshCard) {
            try { CocTool.features.overview.refreshCard(tag); } catch (e) {}
        }
        showToast(`${displayName}的信息已更新`, 1500);
    }

    function detectAccountServer(tag, data) {
        if (data._server) return;
        // 检测完成后刷新卡片（导入流程的 refreshCard 在检测前已执行，异步检测后必须重渲染，否则界面停留在默认区服）
        var refreshAfter = function () {
            if (CocTool.features.overview && CocTool.features.overview.refreshCard) {
                try { CocTool.features.overview.refreshCard(tag); } catch (e) {}
            }
        };
        // 通过助手 ID 判断区服（无需网络）
        var helpers = data.helpers || [];
        for (var hi = 0; hi < helpers.length; hi++) {
            var hid = String(helpers[hi].data);
            if (hid.startsWith('124')) { data._server = 'cn'; try { saveToLocalStorage(); } catch(e) {} refreshAfter(); return; }
            if (hid.startsWith('93')) { data._server = 'intl'; try { saveToLocalStorage(); } catch(e) {} refreshAfter(); return; }
        }
        // 无助手 → 请求 API + 英雄等级拟合
        var G = global.CocTool;
        fetch(G.apiBase + '/api/coc/player/' + tag.replace(/^#/, ''), {
            headers: { 'X-App-Token': G.appToken }
        })
        .then(function(r) {
            if (!r.ok) { data._server = 'cn'; try { saveToLocalStorage(); } catch(e) {} refreshAfter(); return; }
            r.json().then(function(apiData) {
                data._server = compareHeroLevels(apiData, data) ? 'intl' : 'cn';
                try { saveToLocalStorage(); } catch(e) {}
                refreshAfter();
            });
        })
        .catch(function() {
            data._server = guessServerFromIds(data);
            if (data._server) { try { saveToLocalStorage(); } catch(e) {} }
            refreshAfter();
        });
    }

    function compareHeroLevels(apiData, localData) {
        var MAP = {
            'Barbarian King': 28000000, 'Archer Queen': 28000001,
            'Grand Warden': 28000002, 'Battle Machine': 28000003,
            'Royal Champion': 28000004, 'Battle Copter': 28000005,
            'Minion Prince': 28000006, 'Dragon Duke': 28000007
        };
        var localLevels = {};
        var localHeroes = localData.heroes || [];
        for (var i = 0; i < localHeroes.length; i++) {
            localLevels[localHeroes[i].data] = localHeroes[i].lvl;
        }
        var apiHeroes = apiData.heroes || [];
        for (var i = 0; i < apiHeroes.length; i++) {
            var id = MAP[apiHeroes[i].name];
            if (id && localLevels[id] !== undefined && localLevels[id] === apiHeroes[i].level) {
                return true;
            }
        }
        return false;
    }

    function guessServerFromIds(data) {
        var fields = ['buildings','buildings2','heroes','heroes2','units','units2','spells','siege_machines','pets','traps','traps2','guardians','equipment'];
        for (var fi = 0; fi < fields.length; fi++) {
            var arr = data[fields[fi]];
            if (arr && Array.isArray(arr)) {
                for (var i = 0; i < arr.length; i++) {
                    var id = String(arr[i].data || arr[i].dataId || '');
                    if (id.startsWith('124') || id.startsWith('161') || id.startsWith('106')) return 'cn';
                    if (id.startsWith('9300000') || id.startsWith('10700000')) return 'intl';
                }
            }
        }
        return null;
    }

    function quickImportJsonData() {
        showLoading();
        let text = null;
        // 守卫必须检查方法存在：网页版 shim 桩只有 getVersionCode/getVersionName，
        // 直接调用 readClipboard 会 TypeError 中断（2026-08-16 实测复现）
        if (window.AndroidApp && window.AndroidApp.readClipboard) {
            text = window.AndroidApp.readClipboard();
            if (text) processImportText(text);
            else { hideLoading(); showToast('剪切板为空', 2000); }
        } else if (navigator.clipboard) {
            const timeout = setTimeout(() => { showJsonModal(); showToast('读取超时', 2000); hideLoading(); }, 5000);
            navigator.clipboard.readText().then(clipText => {
                clearTimeout(timeout);
                if (clipText) processImportText(clipText);
                else { hideLoading(); showToast('剪切板为空', 2000); }
            }).catch(err => {
                clearTimeout(timeout);
                showToast('剪贴板读取失败，请用「粘贴导入」', 2500);
                hideLoading();
                showJsonModal();
            });
        } else { showJsonModal(); showToast('浏览器不支持剪贴板', 2000); hideLoading(); }
    }

    function processImportText(text) {
        try {
            const data = JSON.parse(text.trim());
            if (!data || !data.timestamp) throw new Error();
            importAccountData(data);
        } catch (e) {
            showToast('json数据不正确', 2000);
        }
        hideLoading();
    }

    function parseJsonData() {
        const text = jsonInput.value.trim();
        if (!text) { showToast('json数据不正确', 2000); return; }
        showLoading();
        setTimeout(() => {
            try {
                const data = JSON.parse(text.trim());
                if (!data || !data.timestamp) throw new Error();
                hideJsonModal();
                importAccountData(data);
            } catch (err) { showToast('json数据不正确', 2000); }
            finally { hideLoading(); }
        }, 100);
    }
    function performAutoImport() {
        if (!settings.autoImport) return;
        // 防重入：上一次导入后 3 秒内不重复执行
        if (lastAutoImport && Date.now() - lastAutoImport < 3000) return;
        lastAutoImport = Date.now();
        // 守卫检查方法存在（网页版 shim 桩无 readClipboard）
        if (window.AndroidApp && window.AndroidApp.readClipboard) {
            const text = window.AndroidApp.readClipboard();
            if (text) {
                try {
                    const data = JSON.parse(text.trim());
                    if (data && data.timestamp) {
                        importAccountData(data);
                    }
                } catch (e) {}
            }
        }
    }

    function init() {
        if (initialized) return;
        initialized = true;
        updateCurrentTime();
        importBtn.addEventListener('click', showJsonModal);
        document.getElementById('quick-import-btn').addEventListener('click', quickImportJsonData);
        parseBtn.addEventListener('click', parseJsonData);
        cancelBtn.addEventListener('click', hideJsonModal);
        jsonModal.addEventListener('click', (e) => { if(e.target === jsonModal) hideJsonModal(); });
        document.getElementById('json-modal-close').addEventListener('click', hideJsonModal);
        document.getElementById('note-modal-close').addEventListener('click', () => { document.getElementById('note-modal').classList.add('hidden'); });
        setNoteBtn.addEventListener('click', () => { if(state.currentAccount) setAccountNote(state.currentAccount); });
        removeAccountBtn.addEventListener('click', () => { if(state.currentAccount && confirm('删除当前账号？')) removeAccount(state.currentAccount); });
        sortApplyBtn.addEventListener('click', () => exitSortMode(true));
        sortCancelBtn.addEventListener('click', () => exitSortMode(false));

        tabContainer.addEventListener('click', (e) => {
            const tab = e.target.closest('.account-tab');
            if (tab) {
                if (tab.getAttribute('data-sort') === 'true') {
                    if (!isSortMode) enterSortMode();
                } else {
                    const accountTag = tab.getAttribute('data-account');
                    if (accountTag) switchAccount(accountTag);
                }
            }
        });
        initSwipeGesture();
    }

    function start() {
        if (Object.keys(accounts).length) {
            rebuildAllTabs();
            if (state.currentAccount && accounts[state.currentAccount]) switchAccount(state.currentAccount);
            else switchAccount(accountOrder[0]);
            return true;
        }
        showEmptyState('点击「导入数据」添加账号，数据将永久保存');
        accountActionsDiv.classList.add('hidden');
        dataInfoDiv.classList.add('hidden');
        updateMainTitle();
        return false;
    }

    function isImporting() {
        return importingGuard;
    }

    CocTool.features.accounts = Object.freeze({
        init,
        start,
        rebuildTabs: rebuildAllTabs,
        switchAccount,
        performAutoImport,
        updateSortTimers,
        updateCurrentTime,
        updateAllAccountTabColors,
        updateMainTitle,
        updateDataInfo,
        showEmptyState,
        isImporting,
        exitSortModeIfActive
    });
})(window);
