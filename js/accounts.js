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
    const parseBtn = document.getElementById('parse-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const tabContainer = document.getElementById('tab-container');
    const accountActionsDiv = document.getElementById('account-actions');
    const setNoteBtn = document.getElementById('set-note-btn');
    const launchGameBtn = document.getElementById('launch-game-btn');
    const removeAccountBtn = document.getElementById('remove-account-btn');
    const moreBtn = document.getElementById('more-btn');
    const moreMenu = document.getElementById('more-menu');
    const quickImportWrap = document.querySelector('.quick-import-wrap');
    const quickImportBtn = document.getElementById('quick-import-btn');
    const quickImportLabel = document.getElementById('quick-import-label');
    const quickImportCaret = document.getElementById('quick-import-caret');
    const quickImportMenu = document.getElementById('quick-import-menu');
    const sortModal = document.getElementById('sort-modal');
    const sortListContainer = document.getElementById('sort-list-container');
    const sortApplyBtn = document.getElementById('sort-apply-btn');
    const sortCancelBtn = document.getElementById('sort-cancel-btn');
    const sortBtn = document.getElementById('sort-btn');
    const mainDisplayArea = document.getElementById('main-display-area');

let initialized = false;
    let sortTimer = null;
    let importingGuard = false;
    let lastAutoImport = 0;

    // 渲染目标：单份 DOM（Swiper 方案已回退——真机 WebView 多页克隆卡手且拖慢启动）
    function getActiveSlide() {
        return document;
    }

    function slideEl(id) {
        return document.getElementById(id);
    }

    function progress() {
        return CocTool.features.progress;
    }

    function services() {
        return CocTool.features.services;
    }

    function saveToLocalStorage() { return storage.saveAccounts(); }
    function saveSettings() { return storage.saveSettings(); }
    // 链式启动按钮：背景色随当前账号区服（国际服紫 / 国服蓝 / 未设置灰）
    function updateLaunchGameBtn() {
        if (!launchGameBtn) return;
        var color = '#6b7280';
        const data = state.currentAccount ? accounts[state.currentAccount] : null;
        if (data && data._server === 'cn') color = '#3b82f6';
        else if (data && data._server === 'intl') color = '#8b5cf6';
        launchGameBtn.style.background = color;
    }

    function doLaunchGame(server) {
        if (!window.AndroidApp || typeof window.AndroidApp.launchGame !== 'function') return;
        var srvName = server === 'cn' ? '国服' : '国际服';
        var ok = false;
        try { ok = window.AndroidApp.launchGame(server); } catch (e) {}
        if (!ok) {
            // 延迟提示避免被选服弹窗的「已保存」toast 覆盖
            setTimeout(function () { showToast('未安装' + srvName + '部落冲突', 2000); }, 600);
        }
    }

    // 链式启动：按当前账号区服打开游戏；区服未设置时弹选服弹窗，选定后启动
    function launchGameForCurrent() {
        const tag = state.currentAccount;
        const data = tag ? accounts[tag] : null;
        if (!data) return;
        if (data._server) { doLaunchGame(data._server); return; }
        showServerPicker(tag, data, function () {
            if (CocTool.features.overview && CocTool.features.overview.refreshCard) {
                try { CocTool.features.overview.refreshCard(tag); } catch (e) {}
            }
            doLaunchGame(data._server);
        });
    }

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
        const root = getActiveSlide();
        const tagSpan = root.querySelector('#account-tag');
        const expSpan = root.querySelector('#export-time');
        const infoDiv = root.querySelector('#data-info');
        if (data.tag) {
            const note = accountNotes[data.tag] || data.tag;
            if (tagSpan) tagSpan.textContent = `${note} (${data.tag})`;
            const titleEl = root.querySelector('#upgrade-title-text');
            if (titleEl) titleEl.textContent = `${note}的升级项目`;
        } else {
            if (tagSpan) tagSpan.textContent = "未知账号";
            const titleEl = root.querySelector('#upgrade-title-text');
            if (titleEl) titleEl.textContent = '正在升级的项目';
        }
        if (expSpan) expSpan.textContent = formatExportTime(data.timestamp);
        if (infoDiv) infoDiv.classList.toggle('hidden', settings.hideDataInfo);
        const chestEl = root.querySelector('#chest-notification');
        if (chestEl) {
            const hasChest = settings.chestDetect && data.obstacles && Array.isArray(data.obstacles) && data.obstacles.some(o => o.data === 8000030 && o.cnt > 0);
            chestEl.classList.toggle('hidden', !hasChest);
        }
    }
    // ========== 排序功能 ==========
    let isSortMode = false;
    let sortModalOrder = [];
    let sortableInstance = null;

    function enterSortMode() {
        isSortMode = true;
        sortModalOrder = [...accountOrder];
        const serviceModule = services();
        if (serviceModule) serviceModule.pauseTicker();
        sortModal.classList.remove('hidden');
        renderSortList();
        rebuildAllTabs();
        if (sortTimer) clearInterval(sortTimer);
        sortTimer = setInterval(updateSortTimers, 1000);
    }

    function exitSortMode(applyChanges = false) {
        isSortMode = false;
        if (sortTimer) { clearInterval(sortTimer); sortTimer = null; }
        if (sortableInstance) { sortableInstance.destroy(); sortableInstance = null; }
        const serviceModule = services();
        if (serviceModule) serviceModule.resumeTicker();
        sortModal.classList.add('hidden');
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
        sortListContainer.innerHTML = '';
        const now = Math.floor(Date.now() / 1000);
        sortModalOrder.forEach(tag => {
            const note = accountNotes[tag] || tag;
            const div = document.createElement('div');
            const sortSleepClass = hasSleepHighlight(accounts[tag]) ? ' sleep-highlight' : '';
            div.className = `sort-item bg-gray-50 rounded-lg p-2 mb-1 flex items-center border border-gray-200${sortSleepClass}`;
            div.style.position = 'relative';
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

            div.innerHTML = `<div class="sort-drag-area" style="position:absolute;left:0;top:0;bottom:0;width:33.3%;display:flex;align-items:center;padding-left:10px;cursor:grab;"><i class="fa fa-bars text-gray-400"></i></div><span class="text-sm font-medium ${colorClass || 'text-gray-800'}" style="padding-left:30px;">${escapeHtml(note)}</span>${rightHtml}`;
            sortListContainer.appendChild(div);
        });
        // SortableJS 拖拽排序（成熟开源库：自动处理移动端触摸 touch-action/滚动/pointer 冲突）
        // 左侧 1/3 区域为拖拽手柄，右侧区域保留滚动（对齐原自研版左右分区交互）
        if (typeof Sortable !== 'undefined') {
            if (sortableInstance) sortableInstance.destroy();
            sortableInstance = Sortable.create(sortListContainer, {
                handle: '.sort-drag-area',
                animation: 150,
                ghostClass: 'sort-ghost',
                onEnd: function () {
                    sortModalOrder = Array.from(sortListContainer.querySelectorAll('.sort-item'))
                        .map(el => el.getAttribute('data-account')).filter(Boolean);
                }
            });
        }
    }

    function updateSortTimers() {
        if (!sortModal || sortModal.classList.contains('hidden')) return;
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

    // ========== 左右滑动切换账号 ==========
    // 自研手势（Swiper 方案已回退——真机 WebView 多页克隆卡手；touchend 判定零开销）
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
                    if (dx > 0) { if (currentIndex > 0) { switchAccount(accountOrder[currentIndex - 1], 'right'); if (settings.vibrate !== false) CocTool.platform.call('vibrate', 40); } }
                    else { if (currentIndex < accountOrder.length - 1) { switchAccount(accountOrder[currentIndex + 1], 'left'); if (settings.vibrate !== false) CocTool.platform.call('vibrate', 40); } }
                }
            }
        }, { passive: true });
    }
    // 切换账号后把选中 tab 自动滚动到可视区域（左右滑切换时选中 tab 可能滚出视野）
    function scrollActiveTabIntoView() {
        if (!tabContainer) return;
        const active = tabContainer.querySelector('.account-tab.active-tab');
        if (!active) return;
        const containerRect = tabContainer.getBoundingClientRect();
        const tabRect = active.getBoundingClientRect();
        const margin = 8;
        if (tabRect.left < containerRect.left + margin) {
            tabContainer.scrollLeft -= (containerRect.left + margin - tabRect.left);
        } else if (tabRect.right > containerRect.right - margin) {
            tabContainer.scrollLeft += (tabRect.right - containerRect.right + margin);
        }
    }

    function updateTabActiveState(accountTag) {
        document.querySelectorAll('.account-tab').forEach(tab => {
            if (tab.getAttribute('data-account') === accountTag) {
                tab.classList.add('active-tab');
                tab.classList.remove('text-gray-500', 'hover:text-gray-700', 'hover:bg-gray-50');
            } else {
                tab.classList.remove('active-tab');
                tab.classList.add('text-gray-500', 'hover:text-gray-700', 'hover:bg-gray-50');
            }
        });
        scrollActiveTabIntoView();
    }

    // 渲染当前账号（单份 DOM 直接重渲染 + 入场动画）
    function renderCurrentAccount() {
        const tag = state.currentAccount;
        if (!tag || !accounts[tag]) return;
        const data = accounts[tag];
        updateDataInfo(data);
        var p = progress();
        if (p) p.render(data);
        updateMainTitle();
        applySettings();
        accountActionsDiv.classList.remove('hidden');
        updateLaunchGameBtn();
    }

    function switchAccount(accountTag, direction) {
        if (isSortMode) exitSortMode(false);
        if (!accounts[accountTag]) return;
        state.currentAccount = accountTag;
        saveToLocalStorage();
        updateTabActiveState(accountTag);
        renderCurrentAccount();
        // 切换内容入场动画（左右滑按方向滑入，其余从右滑入；重触发需强制 reflow）
        if (mainDisplayArea) {
            const cls = direction === 'left' ? 'tab-slide-right' : 'tab-slide-left';
            mainDisplayArea.classList.remove('tab-slide-left', 'tab-slide-right');
            void mainDisplayArea.offsetWidth;
            mainDisplayArea.classList.add(cls);
        }
    }

    function rebuildAllTabs() {
        if (!tabContainer) return;
        tabContainer.innerHTML = '';
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
            scrollActiveTabIntoView();
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
            const root = getActiveSlide();
            const infoDiv = root.querySelector('#data-info');
            const uc = root.querySelector('#upgrades-container');
            const ub = root.querySelector('#upgrades-count-badge');
            const es = root.querySelector('#empty-state');
            if (infoDiv) infoDiv.classList.add('hidden');
            accountActionsDiv.classList.add('hidden');
            if (uc) uc.classList.add('hidden');
            if (ub) ub.classList.add('hidden');
            if (es) es.classList.remove('hidden');
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

    function showLoading() {
        const root = getActiveSlide();
        const li = root.querySelector('#loading-indicator');
        const uc = root.querySelector('#upgrades-container');
        const es = root.querySelector('#empty-state');
        if (li) li.classList.remove('hidden');
        if (uc) uc.classList.add('hidden');
        if (es) es.classList.add('hidden');
    }
    function hideLoading() {
        const li = getActiveSlide().querySelector('#loading-indicator');
        if (li) li.classList.add('hidden');
    }

    function showEmptyState(msg) {
        const root = getActiveSlide();
        const es = root.querySelector('#empty-state');
        const uc = root.querySelector('#upgrades-container');
        const ub = root.querySelector('#upgrades-count-badge');
        const li = root.querySelector('#loading-indicator');
        if (es) { es.innerHTML = `<i class="fa fa-info-circle text-gray-300 text-5xl mb-4"></i><p class="text-gray-500">${msg}</p>`; es.classList.remove('hidden'); }
        if (uc) uc.classList.add('hidden');
        if (ub) ub.classList.add('hidden');
        if (li) li.classList.add('hidden');
    }
    function updateCurrentTime() {
        const d = new Date();
        const el = getActiveSlide().querySelector('#current-time');
        if (el) el.textContent = `${d.getMonth()+1}/${d.getDate()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`;
    }
    function hideJsonModal() { jsonModal.classList.add('hidden'); jsonInput.value = ''; }
    function showJsonModal() { jsonModal.classList.remove('hidden'); jsonInput.focus(); }
    function importAccountData(data) {
        const tag = data.tag || `账号_${Date.now()}`;
        // 如果 timestamp 和上次相同，跳过解析更新
        if (accounts[tag] && accounts[tag].timestamp === data.timestamp) return;
        const oldData = accounts[tag] || null;
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
        // 数据更新后备忘键重对齐（完成清理/药水归位/歧义保守）
        if (oldData && progressModule && progressModule.reconcileNotes) {
            try { progressModule.reconcileNotes(tag, oldData, data); } catch (e) {}
        }
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
            updateLaunchGameBtn();
            if (CocTool.features.overview && CocTool.features.overview.refreshCard) {
                try { CocTool.features.overview.refreshCard(tag); } catch (e) {}
            }
        };
        // 物品 ID 判断（助手 + 建筑/兵种 ID），无需网络、不走 API
        var s = detectServerFromIds(data);
        if (s) {
            data._server = s;
            try { saveToLocalStorage(); } catch (e) {}
            refreshAfter();
            return;
        }
        // 无法判断 → 模态弹窗询问用户（手动选择，不回退 API）
        showServerPicker(tag, data, refreshAfter);
    }

    // 物品 ID → 区服：助手 124*/93* 优先，其余物品 ID 前缀兜底；无法判断返回 null
    function detectServerFromIds(data) {
        var helpers = data.helpers || [];
        for (var i = 0; i < helpers.length; i++) {
            var hid = String(helpers[i].data);
            if (hid.startsWith('124')) return 'cn';
            if (hid.startsWith('93')) return 'intl';
        }
        return guessServerFromIds(data);
    }

    // 区服选择弹窗：国际服（紫）/ 国服（蓝），选择后落盘并刷新渲染
    function showServerPicker(tag, data, refreshAfter) {
        var overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML =
            '<div class="modal-card w-xs">' +
                '<h3 class="font-semibold text-gray-800 mb-3 text-center" style="font-size: 15px;">无法自动判断区服</h3>' +
                '<p class="text-sm text-gray-600 mb-4 text-center" style="word-break: break-all;">由于大本等级偏低，无法自动判断区服，请手动选择：</p>' +
                '<div class="flex flex-col space-y-2">' +
                    '<button class="__server-intl w-full px-3 py-2 text-white rounded-lg transition-all duration-200 text-sm" style="background:#8b5cf6;">国际服</button>' +
                    '<button class="__server-cn w-full px-3 py-2 text-white rounded-lg transition-all duration-200 text-sm" style="background:#3b82f6;">国服</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(overlay);
        function pickServer(s) {
            data._server = s;
            try { saveToLocalStorage(); } catch (e) {}
            overlay.remove();
            updateLaunchGameBtn();
            refreshAfter();
            // 区服影响首页/总览/进度渲染，选择后重刷当前账号
            if (state.currentAccount === tag && CocTool.features.progress && CocTool.features.progress.refresh) {
                try { CocTool.features.progress.refresh(); } catch (e) {}
            }
            showToast((s === 'intl' ? '国际服' : '国服') + ' · 已保存', 1500);
        }
        overlay.querySelector('.__server-intl').addEventListener('click', function () { pickServer('intl'); });
        overlay.querySelector('.__server-cn').addEventListener('click', function () { pickServer('cn'); });
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) overlay.remove();
        });
    }

    // API 全等判定：主大本营 + 夜大本营 + 野蛮人 + 弓箭手 + 哥布林 + 巨人 六项全部一致才判国际服
    // （AND 关系，任一缺失/不等即 false；旧实现「任一英雄等级一致即判国际服」过松导致误判，未解锁英雄的账号尤甚）
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
        parseBtn.addEventListener('click', parseJsonData);
        cancelBtn.addEventListener('click', hideJsonModal);
        jsonModal.addEventListener('click', (e) => { if(e.target === jsonModal) hideJsonModal(); });
        document.getElementById('json-modal-close').addEventListener('click', hideJsonModal);
        document.getElementById('note-modal-close').addEventListener('click', () => { document.getElementById('note-modal').classList.add('hidden'); });
        setNoteBtn.addEventListener('click', () => { if(state.currentAccount) setAccountNote(state.currentAccount); });
        if (launchGameBtn) launchGameBtn.addEventListener('click', launchGameForCurrent);
        removeAccountBtn.addEventListener('click', () => {
            if (!state.currentAccount) return;
            CocTool.ui.showConfirm({
                title: '删除账号',
                text: '删除当前账号？',
                confirmText: '删除',
                cancelText: '取消',
                onConfirm: () => removeAccount(state.currentAccount)
            });
        });
        sortApplyBtn.addEventListener('click', () => exitSortMode(true));
        sortCancelBtn.addEventListener('click', () => exitSortMode(false));
        sortBtn.addEventListener('click', () => { if (!isSortMode) enterSortMode(); });
        // 更多操作展开菜单：点击切换显隐，点菜单项/外部/账号切换时收起
        moreBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            moreMenu.classList.toggle('hidden');
        });
        moreMenu.addEventListener('click', (e) => {
            if (e.target.closest('button')) moreMenu.classList.add('hidden');
        });
        document.addEventListener('click', (e) => {
            if (!moreMenu.classList.contains('hidden') && !e.target.closest('.more-wrap')) {
                moreMenu.classList.add('hidden');
            }
            if (quickImportMenu && !quickImportMenu.classList.contains('hidden') && !e.target.closest('.quick-import-wrap')) {
                quickImportMenu.classList.add('hidden');
            }
        });
        // 快捷导入分体按钮：左 70% 执行当前模式，右 30%（▾）切换模式（持久化 settings.quickImportMode）
        // 模式视觉：快捷导入=紫、粘贴导入=蓝（按钮背景随模式变化）
        function updateQuickImportMode() {
            if (!quickImportLabel) return;
            quickImportLabel.textContent = settings.quickImportMode === 'paste' ? '粘贴导入' : '快捷导入';
            quickImportBtn.classList.remove('bg-violet-500', 'bg-blue-500', 'hover:bg-violet-600', 'hover:bg-blue-600');
            if (settings.quickImportMode === 'paste') {
                quickImportBtn.classList.add('bg-blue-500', 'hover:bg-blue-600');
            } else {
                quickImportBtn.classList.add('bg-violet-500', 'hover:bg-violet-600');
            }
        }
        updateQuickImportMode();
        quickImportBtn.addEventListener('click', () => {
            if (settings.quickImportMode === 'paste') showJsonModal();
            else quickImportJsonData();
        });
        quickImportCaret.addEventListener('click', (e) => {
            e.stopPropagation();
            quickImportMenu.classList.toggle('hidden');
        });
        quickImportMenu.addEventListener('click', (e) => {
            const item = e.target.closest('.more-menu-item');
            if (item) {
                const mode = item.getAttribute('data-quick-mode');
                if (mode && settings.quickImportMode !== mode) {
                    settings.quickImportMode = mode;
                    saveSettings();
                    updateQuickImportMode();
                }
            }
            quickImportMenu.classList.add('hidden');
        });
        // 点击遮罩关闭排序弹窗（等同取消，不应用变更）
        sortModal.addEventListener('click', (e) => {
            if (e.target === sortModal) exitSortMode(false);
        });
        // 排序弹窗：点击条目右侧区域 → 切换对应账号并关闭弹窗（左 1/3 拖拽区不响应）
        sortListContainer.addEventListener('click', (e) => {
            if (e.target.closest('.sort-drag-area')) return;
            const item = e.target.closest('.sort-item');
            if (!item) return;
            const tag = item.getAttribute('data-account');
            if (tag) switchAccount(tag);
        });

        tabContainer.addEventListener('click', (e) => {
            const tab = e.target.closest('.account-tab');
            if (tab) {
                const accountTag = tab.getAttribute('data-account');
                if (accountTag) switchAccount(accountTag);
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
        const infoDiv = getActiveSlide().querySelector('#data-info');
        if (infoDiv) infoDiv.classList.add('hidden');
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
        exitSortModeIfActive,
        quickImportJsonData,
        getActiveSlide
    });
})(window);
