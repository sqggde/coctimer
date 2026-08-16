(function (global) {
    'use strict';

    const CocTool = global.CocTool;
    if (!CocTool || !CocTool.state || !CocTool.storage) {
        throw new Error('progress.js requires core.js');
    }

    const state = CocTool.state;
    const storage = CocTool.storage;
    const accounts = state.accounts;
    const accountNotes = state.accountNotes;
    const accountOrder = state.accountOrder;
    const settings = state.settings;
    const sessionDismissedCategories = state.sessionDismissedCategories;
    const calc = CocTool.calc;

    const loadingIndicator = document.getElementById('loading-indicator');
    const emptyState = document.getElementById('empty-state');
    const upgradesContainer = document.getElementById('upgrades-container');
    const upgradesCountBadge = document.getElementById('upgrades-count-badge');
    const categoryContainers = {
        buildings: document.getElementById('buildings-list'),
        lab: document.getElementById('lab-list'),
        pets: document.getElementById('pets-list'),
        buildings2: document.getElementById('buildings2-list'),
        units2: document.getElementById('units2-list')
    };
    const categoryCountBadges = {
        buildings: document.getElementById('buildings-count'),
        lab: document.getElementById('lab-count'),
        pets: document.getElementById('pets-count'),
        buildings2: document.getElementById('buildings2-count'),
        units2: document.getElementById('units2-count')
    };

    let initialized = false;
    let tooltipTimer = null;
    let iconCache = Object.create(null);
    let lastCacheWrite = 0;

    function resetIconCache() {
        iconCache = Object.create(null);
    }

    function handleIconError(event) {
        const image = event.currentTarget;
        const cacheKey = image.dataset.cachekey;
        const fallback = image.dataset.fallback;
        if (fallback) {
            const next = fallback.split(',')[0];
            image.dataset.fallback = fallback.substring(next.length + 1);
            image.src = next;
            if (cacheKey) iconCache[cacheKey] = next;
            return;
        }
        image.style.display = 'none';
        // 兜底 fa 图标在图标容器内查找（不依赖兄弟节点顺序）
        const container = image.parentElement;
        const fallbackIcon = container ? container.querySelector('i.fa') : null;
        if (fallbackIcon) fallbackIcon.style.display = 'flex';
    }

    function saveToLocalStorage() {
        return storage.saveAccounts();
    }

    function saveSettings() {
        return storage.saveSettings();
    }

    function callAccounts(method, ...args) {
        const module = CocTool.features.accounts;
        if (module && typeof module[method] === 'function') return module[method](...args);
        return undefined;
    }

    function updateSortTimers() { callAccounts('updateSortTimers'); }
    function updateCurrentTime() { callAccounts('updateCurrentTime'); }
    function updateAllAccountTabColors() { callAccounts('updateAllAccountTabColors'); }
    function updateMainTitle() { callAccounts('updateMainTitle'); }
    function showEmptyState(message) { callAccounts('showEmptyState', message); }

    // ========== 助手阶段气泡提示 ==========
    function formatHHMMSS(sec) {
        if (sec <= 0) return '00:00:00';
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }

    function formatMMSS(sec) {
        if (sec <= 0) return '00:00';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }

    function handlePhaseTooltip(event) {
        const btn = event.currentTarget;
        const tooltip = document.getElementById('phase-tooltip');
        if (!tooltip || !state.currentAccount || !accounts[state.currentAccount]) return;

        // 切换：同一图标点击关闭
        if (!tooltip.classList.contains('hidden') && tooltip.dataset.target === btn.dataset.unique) {
            hidePhaseTooltip();
            return;
        }

        const data = accounts[state.currentAccount];
        const helpers = data.helpers || [];
        const timestamp = data.timestamp || Math.floor(Date.now() / 1000);

        const worker = helpers.find(h => h.data === 124000000 || h.data === 93000000);
        const lab = helpers.find(h => h.data === 124000001 || h.data === 93000001);
        const helper = worker || lab;
        if (!helper) return;

        const initialCooldown = helper.helper_cooldown || 82800;

        // 尝试从按钮 data 属性获取 helper_timer 和是否循环，避免在原始数据中查找 uniqueId
        let boostTotal = parseInt(btn.dataset.helperTimer) || 0;
        let isRecurrent = btn.dataset.helperRecurrent === 'true';

        // 计算一次位置，后面更新时不再重复计算
        function calcRemaining() {
            const now = Math.floor(Date.now() / 1000);
            const elapsed = now - timestamp;
            let boostRemaining = 0, cooldownRemaining = 0;
            if (elapsed < boostTotal) {
                boostRemaining = boostTotal - elapsed;
                if (isRecurrent) cooldownRemaining = initialCooldown - elapsed;
            } else if (isRecurrent && elapsed < initialCooldown) {
                cooldownRemaining = initialCooldown - elapsed;
            } else if (isRecurrent) {
                const cycleElapsed = (elapsed - initialCooldown) % 82800;
                const cycleRemaining = 82800 - cycleElapsed;
                if (cycleElapsed < 3600) boostRemaining = 3600 - cycleElapsed;
                cooldownRemaining = cycleRemaining;
            }
            return { boostRemaining, cooldownRemaining };
        }

        // 渲染内容
        function renderContent() {
            const rem = calcRemaining();
            let html = '';
            if (rem.boostRemaining > 0) {
                html += '<div><span class="tooltip-label">加速中：</span><span class="tooltip-time">' + formatMMSS(rem.boostRemaining) + '</span></div>';
            }
            if (rem.cooldownRemaining > 0) {
                html += '<div><span class="tooltip-label">冷却中：</span><span class="tooltip-time">' + formatHHMMSS(rem.cooldownRemaining) + '</span></div>';
            }
            tooltip.innerHTML = html;
        }

        renderContent();
        tooltip.dataset.target = btn.dataset.unique || '';

        // 测量大小并定位
        tooltip.classList.remove('hidden');
        tooltip.style.left = '-9999px';
        tooltip.style.top = '-9999px';
        const tw = tooltip.offsetWidth;
        const th = tooltip.offsetHeight;

        const rect = btn.getBoundingClientRect();
        let left = rect.left + rect.width / 2 - tw / 2;
        let top = rect.top - 10 - th;
        if (top < 4) top = rect.bottom + 10;
        if (left < 4) left = 4;
        if (left + tw > window.innerWidth - 4) left = window.innerWidth - 4 - tw;

        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';

        // 启动动态倒计时
        if (tooltipTimer) clearInterval(tooltipTimer);
        tooltipTimer = setInterval(renderContent, 1000);

        // 点击其他地方关闭
        setTimeout(() => {
            document.addEventListener('click', hidePhaseTooltipOnClick);
        }, 10);
        // 滚动/触摸关闭
        document.addEventListener('scroll', hidePhaseTooltip, { passive: true, once: true });
        document.addEventListener('touchstart', hidePhaseTooltip, { passive: true, once: true });
        document.addEventListener('touchmove', hidePhaseTooltip, { passive: true, once: true });
    }

    function hidePhaseTooltipOnClick(e) {
        if (!e.target.closest('.phase-icon-btn') && !e.target.closest('#phase-tooltip')) {
            hidePhaseTooltip();
            document.removeEventListener('click', hidePhaseTooltipOnClick);
        }
    }

    function hidePhaseTooltip() {
        const tooltip = document.getElementById('phase-tooltip');
        if (tooltip) tooltip.classList.add('hidden');
        if (tooltipTimer) { clearInterval(tooltipTimer); tooltipTimer = null; }
        document.removeEventListener('click', hidePhaseTooltipOnClick);
        document.removeEventListener('scroll', hidePhaseTooltip);
        document.removeEventListener('touchstart', hidePhaseTooltip);
        document.removeEventListener('touchmove', hidePhaseTooltip);
    }

    function renderHelperOverview(data) {
        const container = document.getElementById('helper-overview');
        if (!container) return;
        const helpers = data.helpers || [];
        const boosts = data.boosts || {};

        const worker = helpers.find(h => h.data === 124000000 || h.data === 93000000);
        const lab = helpers.find(h => h.data === 124000001 || h.data === 93000001);
        const clockTower = (data.buildings2 || []).find(b => b.data === 1000039);
        const clockLvl = clockTower ? clockTower.lvl || 0 : 0;

        // 判断结构是否变化（工人/实验室/钟楼的存在性+等级）
        const structKey = (worker ? 'w'+worker.lvl:'') + '_' + (lab ? 'l'+lab.lvl:'') + '_' + clockLvl;

        // 冷却时间取两者中非 0 的那个
        const cooldowns = calc.getHelperCooldowns();
        const workerRemaining = cooldowns ? cooldowns.worker : 0;
        const labRemaining = cooldowns ? cooldowns.lab : 0;
        const clockCooldown = cooldowns ? cooldowns.clock : 0;
        const clockUpgrading = cooldowns ? cooldowns.clockUpgrading : false;
        const helperRemaining = Math.max(workerRemaining, labRemaining);

        if (container.getAttribute('data-helper-key') !== structKey) {
            // 结构变化 → 全量重建
            const iconSize = 18;
            const leftHtml = [];
            if (worker) {
                leftHtml.push('<span class="ho-helper" data-helper="worker" style="display:inline-flex;align-items:center;gap:2px;margin-right:4px"><span style="display:inline-flex;position:relative"><img src="img/icons/BHelper.webp" width="' + iconSize + '" height="' + iconSize + '" style="vertical-align:middle;display:inline-block"></span><span style="background:#dbeafe;color:#1d4ed8;border-radius:999px;padding:0 5px;font-size:11px;font-weight:600;line-height:1.4">' + (worker.lvl || 0) + '</span></span>');
            }
            if (lab) {
                leftHtml.push('<span class="ho-helper" data-helper="lab" style="display:inline-flex;align-items:center;gap:2px"><span style="display:inline-flex;position:relative"><img src="img/icons/LHelper.webp" width="' + iconSize + '" height="' + iconSize + '" style="vertical-align:middle;display:inline-block"></span><span style="background:#f3e8ff;color:#7c3aed;border-radius:999px;padding:0 5px;font-size:11px;font-weight:600;line-height:1.4">' + (lab.lvl || 0) + '</span></span>');
            }
            leftHtml.push('<span class="ho-timer-left" style="font-weight:500;white-space:nowrap"></span>');

            let clockHtml = '<span style="display:inline-flex;align-items:center;gap:2px"><span style="display:inline-flex;position:relative"><img src="img/icons/CT.webp" width="' + iconSize + '" height="' + iconSize + '" style="vertical-align:middle;display:inline-block"></span><span style="background:#fef3c7;color:#d97706;border-radius:999px;padding:0 5px;font-size:11px;font-weight:600;line-height:1.4">' + clockLvl + '</span></span><span class="ho-timer-right" style="font-weight:500;white-space:nowrap"></span>';

            container.innerHTML = '<span style="display:flex;align-items:center;gap:4px">' + leftHtml.join('') + '</span><span style="margin-left:auto;display:flex;align-items:center;gap:2px">' + clockHtml + '</span>';
            container.setAttribute('data-helper-key', structKey);
        }

        // 仅更新倒数文字
        const leftTimer = container.querySelector('.ho-timer-left');
        const rightTimer = container.querySelector('.ho-timer-right');
        if (leftTimer) {
            if (helperRemaining > 0) {
                leftTimer.textContent = calc.formatCompactTime(helperRemaining);
                leftTimer.style.color = '#374151';
            } else if (worker || lab) {
                leftTimer.textContent = '已就绪';
                leftTimer.style.color = '#10b981';
            } else {
                leftTimer.textContent = '';
            }
        }
        if (rightTimer) {
            if (clockUpgrading) {
                rightTimer.textContent = '升级中';
                rightTimer.style.color = '#374151';
            } else if (clockCooldown > 0) {
                rightTimer.textContent = calc.formatCompactTime(clockCooldown);
                rightTimer.style.color = '#374151';
            } else {
                rightTimer.textContent = '已就绪';
                rightTimer.style.color = '#10b981';
            }
        }

        const workerReady = worker && workerRemaining <= 0 && !calc.hasActiveRecurrent(data, ["buildings", "heroes", "traps", "guardians"]);
        const labReady = lab && labRemaining <= 0 && !calc.hasActiveRecurrent(data, ["units", "siege_machines", "spells"]);
        container.querySelectorAll('.ho-helper').forEach(wrapper => {
            const type = wrapper.getAttribute('data-helper');
            const isReady = (type === 'worker' && workerReady) || (type === 'lab' && labReady);
            const posSpan = wrapper.querySelector('span[style*="position:relative"]');
            if (!posSpan) return;
            let dot = posSpan.querySelector('.ho-ready-dot');
            if (isReady) {
                if (!dot) {
                    dot = document.createElement('span');
                    dot.className = 'ho-ready-dot';
                    dot.style.cssText = 'position:absolute;top:-2px;right:-2px;width:14px;height:14px;border-radius:50%;background:#10b981;border:2px solid #fff;';
                    posSpan.appendChild(dot);
                }
                dot.style.display = 'block';
            } else if (dot) {
                dot.style.display = 'none';
            }
        });
    }

    // ========== 升级卡片备忘（长按编辑，本地存储 clash_upgrade_notes） ==========
    const NOTES_KEY = 'clash_upgrade_notes';
    function loadNotes() {
        try { return JSON.parse(localStorage.getItem(NOTES_KEY)) || {}; } catch (e) { return {}; }
    }
    function saveNotes(notes) {
        try { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); } catch (e) {}
    }
    // 精确键匹配；歧义保守保留的悬空键不显示（数据保留，下次导入顺序配对归位）
    function getNoteForItem(tag, item, data, notesMap) {
        const notes = notesMap || loadNotes();
        const map = notes[tag];
        if (!map) return '';
        return map[calc.getNoteKey(item, data)] || '';
    }
    // 导入数据更新后重对齐备忘键（accounts.js 调用）
    function reconcileNotes(tag, oldData, newData) {
        const notes = loadNotes();
        const map = notes[tag];
        if (!map || !Object.keys(map).length) return;
        const now = Math.floor(Date.now() / 1000);
        const oldItems = oldData ? calc.extractUpgradingItems(oldData, now, true) : [];
        const oldKeys = oldItems.map(it => calc.getNoteKey(it, oldData));
        const items = calc.extractUpgradingItems(newData, now, true);
        const newKeys = items.map(it => calc.getNoteKey(it, newData));
        const r = calc.reconcileNoteKeys(map, oldKeys, newKeys, now);
        // 兜底清理：悬空且完成时刻已过去的键（数据中已不存在）
        Object.keys(r.map).forEach(k => {
            if (!newKeys.includes(k) && calc.noteKeyTs(k) < now) delete r.map[k];
        });
        notes[tag] = r.map;
        saveNotes(notes);
    }

    // 长按卡片（touch/mouse 通用，500ms，位移>10px 取消）→ 备忘编辑模态；长按后抑制本次 click（删除弹窗不弹出）
    function bindNoteLongPress(card) {
        if (card.__noteBound) return;
        card.__noteBound = true;
        let timer = null, startX = 0, startY = 0;
        function start(e) {
            const pt = e.touches ? e.touches[0] : e;
            startX = pt.clientX; startY = pt.clientY;
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                timer = null;
                card.__noteLongPress = true;
                openNoteModal(card);
            }, 500);
        }
        function move(e) {
            if (!timer) return;
            const pt = e.touches ? e.touches[0] : e;
            if (Math.abs(pt.clientX - startX) > 10 || Math.abs(pt.clientY - startY) > 10) cancel();
        }
        function cancel() { if (timer) { clearTimeout(timer); timer = null; } }
        card.addEventListener('touchstart', start, { passive: true });
        card.addEventListener('touchmove', move, { passive: true });
        card.addEventListener('touchend', cancel);
        card.addEventListener('touchcancel', cancel);
        card.addEventListener('mousedown', start);
        card.addEventListener('mousemove', move);
        card.addEventListener('mouseup', cancel);
        card.addEventListener('mouseleave', cancel);
        card.addEventListener('click', function (e) {
            if (card.__noteLongPress) { card.__noteLongPress = false; e.preventDefault(); e.stopPropagation(); }
        });
    }

    function openNoteModal(card) {
        const tag = state.currentAccount;
        const key = card.getAttribute('data-note-key');
        if (!key || !tag) return;
        const notes = loadNotes();
        const map = notes[tag] || {};
        const current = map[key] || '';
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML =
            '<div class="modal-card w-xs">' +
                '<h3 class="font-semibold text-gray-800 mb-3 text-center" style="font-size: 15px;">备忘</h3>' +
                '<textarea class="w-full border border-gray-300 rounded-lg p-2 text-sm mb-4" style="min-height:80px;resize:vertical;box-sizing:border-box;" maxlength="100" placeholder="输入备忘内容（最多100字）"></textarea>' +
                '<div class="flex flex-col space-y-2">' +
                    (current ? '<button class="__note-clear w-full px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all duration-200 text-sm">清除备忘</button>' : '') +
                    '<button class="__note-save w-full px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-all duration-200 text-sm">保存</button>' +
                    '<button class="__note-cancel w-full px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition-all duration-200 text-sm">取消</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(overlay);
        const ta = overlay.querySelector('textarea');
        ta.value = current;
        setTimeout(() => { try { ta.focus(); } catch (e) {} }, 100);
        function close() { overlay.remove(); }
        // 保存/清除后：刷新首页渲染 + 立即重调度通知（通知 message 第三行备忘即时生效，不等 5 分钟周期）
        function applyAndClose() {
            close();
            refreshCurrentAccountDisplay();
            try {
                const svc = CocTool.features.services;
                if (svc && svc.pushSchedule) svc.pushSchedule();
            } catch (e) {}
        }
        overlay.querySelector('.__note-save').addEventListener('click', () => {
            const text = ta.value.trim();
            if (text) { if (!notes[tag]) notes[tag] = {}; notes[tag][key] = text; }
            else if (notes[tag]) delete notes[tag][key];
            saveNotes(notes);
            applyAndClose();
        });
        overlay.querySelector('.__note-clear')?.addEventListener('click', () => {
            if (notes[tag]) delete notes[tag][key];
            saveNotes(notes);
            applyAndClose();
        });
        overlay.querySelector('.__note-cancel').addEventListener('click', close);
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    }

    // 完成卡片删除统一绑定（渲染路径与缓存恢复补绑定共用同一实现；确认用程序模态弹窗，非原生 confirm）
    // 幂等标记用 JS property 而非 data-* 属性：data-* 会被缓存 innerHTML 序列化带走，恢复后误判为已绑定（曾导致缓存路径删除失效）
    function bindCardDelete(card) {
        if (card.__delBound) return;
        card.__delBound = true;
        card.classList.add('cursor-pointer');
        card.addEventListener('click', function () {
            if (this.__noteLongPress) return;
            const self = this;
            const cat = this.getAttribute('data-cat');
            const id = this.getAttribute('data-item-id');
            const timer = this.getAttribute('data-item-timer');
            const lvl = this.getAttribute('data-item-lvl');
            const nameEl = this.querySelector('.card-name');
            const name = nameEl ? nameEl.textContent : '';
            CocTool.ui.showConfirm({
                title: '删除已完成项目',
                text: '确认删除已完成项目「' + name + '」？',
                confirmText: '删除',
                onConfirm: function () {
                    const d = accounts[state.currentAccount];
                    if (!d) return;
                    const arr = d[cat];
                    if (arr && Array.isArray(arr)) {
                        const idx = arr.findIndex(function (a) {
                            return Number(a.data) === Number(id) && Number(a.timer) === Number(timer) && Number(a.lvl) === Number(lvl);
                        });
                        if (idx !== -1) {
                            arr.splice(idx, 1);
                            saveToLocalStorage();
                            // 删除卡片的同时清理该实例备忘（实例结束）
                            const noteKey = self.getAttribute('data-note-key');
                            if (noteKey) {
                                const notes = loadNotes();
                                if (notes[state.currentAccount]) {
                                    delete notes[state.currentAccount][noteKey];
                                    saveNotes(notes);
                                }
                            }
                            refreshCurrentAccountDisplay();
                        }
                    }
                }
            });
        });
    }

    // 单实例检查
    function displayUpgradingItems(items, data) {
        // 刷新容器引用（hydrateCache 可能已替换 DOM 节点）
        categoryContainers.buildings = document.getElementById('buildings-list');
        categoryContainers.lab = document.getElementById('lab-list');
        categoryContainers.pets = document.getElementById('pets-list');
        categoryContainers.buildings2 = document.getElementById('buildings2-list');
        categoryContainers.units2 = document.getElementById('units2-list');
        Object.values(categoryContainers).forEach(c => { if(c) c.innerHTML = ''; });
        const counts = { buildings:0, lab:0, pets:0, buildings2:0, units2:0 };
        if (items.length === 0) {
            showEmptyState('当前账号没有正在升级的项目');
            upgradesContainer.classList.add('hidden');
            upgradesCountBadge.classList.add('hidden');
            return;
        }
        upgradesCountBadge.textContent = items.length;
        upgradesCountBadge.classList.remove('hidden');
        const grouped = { buildings:[], lab:[], pets:[], buildings2:[], units2:[] };
        items.forEach(it => { const g = calc.getItemCategory(it); grouped[g].push(it); });
        for (let g in grouped) {
            grouped[g].sort((a,b)=> calc.calculateCompletionTimestamp(a,data) - calc.calculateCompletionTimestamp(b,data));
            grouped[g].forEach(item => {
                counts[g]++;
                const completionTs = calc.calculateCompletionTimestamp(item, data);
                const remainingSec = Math.max(0, completionTs - (Date.now()/1000));
                const doneTimeFmt = calc.formatDoneTime(completionTs);
                const name = calc.getItemName(item.data);
                const originCat = CocTool.names.CATEGORY_NAMES[item.category] || item.category;
                const icon = CocTool.names.CATEGORY_ICONS[item.category] || "fa-question";
                const remCls = calc.getRemainingClasses(remainingSec);
                const textColor = remCls.text, borderClr = remCls.border;
                const card = document.createElement('div');
                card.style.minHeight = '46px';
                card.className = `upgrade-card bg-gray-50 rounded-lg p-1 border-l-4 border-r-4 ${borderClr} flex items-center justify-between ${calc.isInSleepRange(completionTs) ? ' sleep-highlight' : ''}`;
                card.setAttribute('data-unique', item.uniqueId);
                card.setAttribute('data-completion', completionTs);
                card.setAttribute('data-cat', item.category);
                card.setAttribute('data-item-id', item.data);
                card.setAttribute('data-item-timer', item.timer);
                card.setAttribute('data-item-lvl', item.lvl);
                card.setAttribute('data-note-key', calc.getNoteKey(item, data));
                if (remainingSec <= 0) bindCardDelete(card);
                const phaseIcon = calc.getItemPhaseIcon(item, data);
                const iconUrls = calc.getItemIconUrl(item);
                // 图标URL缓存：避免反复尝试不存在的等级图标导致频闪（上限200项防泄漏）
                if (Object.keys(iconCache).length > 200) resetIconCache();
                const cacheKey = item.uniqueId || `${item.data}_${item.lvl}`;
                let iconSrc;
                if (iconCache[cacheKey]) {
                    iconSrc = iconCache[cacheKey];
                } else {
                    iconSrc = iconUrls ? iconUrls[0] : null;
                }
                var sc = item.supercharge;
                var wp = item.weapon;
                var isSC = sc !== undefined;
                var isWp = calc.isMultiStageWeapon(item);
                var isGear = item.gear_up === 0;
                var scOverlay = '';
                if (isSC) {
                    if (sc === 0) {
                        scOverlay = '<img src="img/icons/Icon_Supercharge.webp" style="position:absolute;bottom:-1px;left:50%;transform:translateX(-50%);width:14px;height:14px;">';
                    } else {
                        scOverlay = '<span style="position:absolute;bottom:-1px;left:50%;transform:translateX(-50%);display:flex;gap:1px;line-height:0;"><img src="img/icons/Icon_Supercharge.webp" style="width:14px;height:14px;"><img src="img/icons/Icon_Supercharge.webp" style="width:14px;height:14px;"></span>';
                    }
                }
                var iconInner = iconSrc
                    ? '<img src="' + iconSrc + '" width="36" height="36" class="w-9 h-9 object-contain" data-cachekey="' + cacheKey + '" data-fallback="' + (iconUrls ? iconUrls.slice(1).join(',') : '') + '" alt=""><i class="fa ' + icon + ' text-primary" style="display:none;font-size:20px;"></i>' + scOverlay
                    : '<i class="fa ' + icon + ' text-primary" style="font-size:20px;"></i>';
                var iconHtml = '<div class="w-9 h-9 flex items-center justify-center flex-shrink-0" style="margin-right:10px;position:relative;overflow:visible;">' + iconInner + '</div>';
                var catLine = isSC ? '充能' : isWp ? '武器' : isGear ? '改装中' : originCat;
                var lvLine;
                if (isSC) lvLine = '等级' + sc + '→' + (sc + 1);
                else if (isWp) lvLine = '等级' + wp + '→' + (wp + 1);
                else if (isGear) lvLine = '';
                else lvLine = '等级 ' + item.lvl + ' → ' + (item.lvl + 1);
                const noteMap = loadNotes();
                const note = getNoteForItem(state.currentAccount, item, data, noteMap);
                // 有备忘时：说明行被备忘覆盖，等级信息挪到名称后（lvShort，改装无等级则不显示）
                let h3Inner = calc.escapeHtml(name);
                if (note) {
                    const lvShort = isGear ? '' : (isSC ? sc + '→' + (sc + 1) : isWp ? wp + '→' + (wp + 1) : item.lvl + '→' + (item.lvl + 1));
                    if (lvShort) h3Inner += '<span class="card-lv"> ' + lvShort + '</span>';
                }
                const subLine = note
                    ? '<p class="text-xs text-gray-500 card-note-line">📝 ' + calc.escapeHtml(note) + '</p>'
                    : '<p class="text-xs text-gray-500">' + catLine + ' · ' + lvLine + '</p>';
                card.innerHTML = '<div class="flex items-center">' + iconHtml + '<div class="min-w-0"><h3 class="card-name font-semibold text-gray-800" style="font-size:13px;">' + h3Inner + phaseIcon + '</h3>' + subLine + '</div></div><div class="text-right flex-shrink-0"><div class="text-sm ' + textColor + ' card-time-container" style="font-size:14px;font-weight:500;"><span class="card-remain">' + remainHtml(remainingSec) + '</span></div><div class="text-xs text-gray-500">' + doneTimeFmt + '</div></div>';
                const iconImage = card.querySelector('img[data-cachekey]');
                if (iconImage) iconImage.addEventListener('error', handleIconError);
                bindNoteLongPress(card);
                if (categoryContainers[g]) categoryContainers[g].appendChild(card);
            });
        }
        for (let g of Object.keys(counts)) {
            const badge = categoryCountBadges[g];
            const parentDiv = categoryContainers[g]?.parentElement;
            if (counts[g] > 0) { if(badge) { badge.textContent = counts[g]; badge.classList.remove('hidden'); } if(parentDiv) parentDiv.classList.remove('hidden'); }
            else { if(badge) badge.classList.add('hidden'); if(parentDiv) parentDiv.classList.add('hidden'); }
        }
        upgradesContainer.classList.remove('hidden');
        emptyState.classList.add('hidden');
        loadingIndicator.classList.add('hidden');
        // 缓存渲染结果，用于冷启动瞬间显示（最多每30秒写一次）
        try { if (Date.now() - lastCacheWrite > 30000) { lastCacheWrite = Date.now(); localStorage.setItem('clash_cached_view', JSON.stringify({ html: upgradesContainer.innerHTML, tag: state.currentAccount, time: Date.now() })); } } catch(e) {}
    }

    // ========== 增量更新卡片倒计时（不重建 DOM，仅更新文本+颜色）==========
    // 剩余时间渲染：数字与单位分开（.cr-digit/.cr-unit），单位字号小/黑色/不加粗
    function remainHtml(sec) {
        if (sec <= 0) return '就绪';
        const d = Math.floor(sec / 86400);
        const h = Math.floor((sec % 86400) / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        let html = '';
        if (d > 0) html += '<span class="cr-digit">' + d + '</span><span class="cr-unit">天</span>';
        if (h > 0 || html) html += '<span class="cr-digit cr-digit-fixed">' + h + '</span><span class="cr-unit">时</span>';
        if (m > 0 || html) html += '<span class="cr-digit cr-digit-fixed">' + m + '</span><span class="cr-unit">分</span>';
        html += '<span class="cr-digit cr-digit-fixed">' + s + '</span><span class="cr-unit">秒</span>';
        return html;
    }
    function updateCardTimers() {
        const now = Date.now() / 1000;
        document.querySelectorAll('.upgrade-card').forEach(card => {
            const completionTs = parseFloat(card.getAttribute('data-completion'));
            if (isNaN(completionTs)) return;
            const remainingSec = Math.max(0, completionTs - now);
            const fmt = remainHtml(remainingSec);
            const remainSpan = card.querySelector('.card-remain');
            if (remainSpan && remainSpan.innerHTML !== fmt) remainSpan.innerHTML = fmt;

            // 更新文字颜色 + 边框颜色（阈值链收敛在 calc.getRemainingClasses）
            const remCls = calc.getRemainingClasses(remainingSec);
            const tc = card.querySelector('.card-time-container');
            if (tc) {
                tc.className = tc.className.replace(/\btext-\S+/g, '').trim() + ' ' + remCls.text + ' card-time-container';
            }
            card.classList.remove('border-success', 'border-danger_red', 'border-warning_orangered', 'border-warning_orange', 'border-warning_yellow', 'border-primary');
            card.classList.add(remCls.border);

            // 更新睡眠高亮
            card.classList.toggle('sleep-highlight', calc.isInSleepRange(completionTs));

            // 完成项目补绑定删除事件（缓存恢复路径由此生效）
            if (remainingSec <= 0) bindCardDelete(card);
            else card.classList.remove('cursor-pointer');
            // 补绑长按备忘监听（缓存恢复路径由此生效）
            bindNoteLongPress(card);
        });
    }

    // ========== 轻量定时刷新（每秒调用，不重建 DOM）==========
    // 分层原则：tick 只做秒级变化项（倒计时/时钟/完成态）；结构项（挡位/月卡/摘要/分类计数）在 render/refresh 时更新，
    // tab 颜色与标题节流到 10 秒（其变化只发生在项目完成瞬间，秒级全量遍历 N 个账号成本过高）
    let lastTabTitleTick = 0;
    function updateTimersOnly() {
        if (!state.currentAccount || !accounts[state.currentAccount]) return;
        const now = Date.now();
        const data = accounts[state.currentAccount];
        const nowTs = Math.floor(now / 1000);
        updateCardTimers();
        updateSortTimers();
        updateCurrentTime();
        renderHelperOverview(data);
        updateBoostTimers(data);
        if (now - lastTabTitleTick >= 10000) {
            lastTabTitleTick = now;
            updateAllAccountTabColors();
            updateMainTitle();
        }
        // 活动结束轻量检查：隐藏挡位选择器（完整渲染由 render 负责）
        if (nowTs >= calc.EVENT_END) {
            const selector = document.getElementById('event-boost-selector');
            if (selector && !selector.classList.contains('hidden')) selector.classList.add('hidden');
        }
    }

    function updateBuilderBoostToggle(data) {
        const toggle = document.getElementById('builder-boost-toggle');
        const isCn = calc.isCnAccount(data);
        if (!isCn) {
            if (toggle) toggle.style.display = 'none';
            // 隐藏月卡图标
            const passIcon = document.getElementById('builder-monthly-pass-icon');
            if (passIcon) passIcon.classList.add('hidden');
            return;
        }
        if (toggle) toggle.style.display = 'inline-flex';
        const is24Mode = settings.builderBoostMode24 && settings.builderBoostMode24[data.tag];
        const label = document.getElementById('builder-boost-label');
        if (label) label.textContent = is24Mode ? '24x' : '10x';
        const icon = document.getElementById('builder-boost-icon');
        if (icon) {
            icon.src = is24Mode ? 'img/icons/builder_boost_24.webp' : 'img/icons/builder_boost.webp';
        }
        if (label) label.style.color = is24Mode ? '#ea580c' : '';
        // 更新建筑工人月卡图标
        updateBuilderMonthlyPassIcon(data.tag);
    }

    function updateBuilderMonthlyPassIcon(tag) {
        var passIcon = document.getElementById('builder-monthly-pass-icon');
        if (!passIcon) return;
        // 仅国服账号显示（不检查工人助手是否存在）
        var data = accounts[state.currentAccount];
        if (!data) { passIcon.classList.add('hidden'); return; }
        var isCn = calc.isCnAccount(data);
        if (!isCn) { passIcon.classList.add('hidden'); return; }
        passIcon.classList.remove('hidden');
        // 根据状态设置滤镜
        var isActive = settings.builderMonthlyPass && settings.builderMonthlyPass[tag];
        if (isActive) {
            passIcon.style.filter = '';
        } else {
            passIcon.style.filter = 'grayscale(100%) brightness(0.6)';
        }
    }

    function refreshCurrentAccountDisplay() {
        if (!state.currentAccount || !accounts[state.currentAccount]) return;
        render(accounts[state.currentAccount]);
    }

    // ========== 活动加速挡位选择器 ==========
    function renderEventBoostSelector(data) {
        const container = document.getElementById('event-boost-selector');
        if (!container) return;

        if (Math.floor(Date.now() / 1000) >= calc.EVENT_END) {
            container.classList.add('hidden');
            return;
        }

        // 检查是否有 93000001 实验室助手 → 不显示选择器
        const helpers = data.helpers || [];
        if (helpers.some(h => h.data === 93000001 && h.lvl > 0)) {
            container.classList.add('hidden');
            return;
        }

        container.classList.remove('hidden');

        // 取当前生效倍率（默认 ×1）
        const currentMult = calc.getEffectiveEventMultiplier(data);

        // 高亮对应按钮
        const btns = container.querySelectorAll('.event-boost-btn');
        btns.forEach(btn => {
            const mult = parseFloat(btn.dataset.mult);
            if (mult === currentMult) {
                btn.classList.add('bg-primary', 'text-white', 'border-primary');
                btn.classList.remove('text-gray-600', 'hover:bg-gray-100', 'border-gray-300');
            } else {
                btn.classList.remove('bg-primary', 'text-white', 'border-primary');
                btn.classList.add('text-gray-600', 'hover:bg-gray-100', 'border-gray-300');
            }
        });

        // 显示推荐文字（×2 按钮右侧）
        const daysEl = document.getElementById('event-boost-days');
        if (daysEl) {
            daysEl.textContent = calc.getEventRecommendation(data);
        }
    }

    // boost 计时元素引用缓存（避免每秒扫描 DOM / 依赖兄弟顺序）
    const boostTimerRefs = new Map();
    function getBoostTimerEl(headingId) {
        let ref = boostTimerRefs.get(headingId);
        if (ref && ref.countEl && ref.countEl.isConnected && ref.timerEl && ref.timerEl.isConnected) return ref;
        const countEl = document.getElementById(headingId);
        if (!countEl) return null;
        let timerEl = null;
        if (ref && ref.timerEl && ref.timerEl.isConnected) timerEl = ref.timerEl;
        else {
            timerEl = document.createElement('span');
            timerEl.className = 'boost-timer';
            timerEl.style.cssText = 'display:inline-flex;align-items:center;gap:2px;margin-left:6px';
            countEl.parentNode.insertBefore(timerEl, countEl.nextSibling);
        }
        ref = { countEl, timerEl };
        boostTimerRefs.set(headingId, ref);
        return ref;
    }

    // ========== 升级列表分类标题旁显示加速道具剩余时间 ==========
    function updateBoostTimers(data) {
        const boosts = data.boosts || {};
        const now = Math.floor(Date.now() / 1000);
        const timestamp = data.timestamp || now;
        const elapsed = now - timestamp;

        // 类别 → { boostKey, iconFile, headingId }
        const cats = [
            { key: 'buildings', headingId: 'buildings-count', boostKey: null, iconFile: null },
            { key: 'lab', headingId: 'lab-count', boostKey: null, iconFile: null },
            { key: 'pets', headingId: 'pets-count', boostKey: null, iconFile: null },
            { key: 'buildings2', headingId: 'buildings2-count', boostKey: null, iconFile: null },
            { key: 'units2', headingId: 'units2-count', boostKey: null, iconFile: null }
        ];

        // 判断各分类使用哪个药水
        if (boosts.builder_boost) {
            cats[0].boostKey = 'builder_boost';
            const is24 = settings.builderBoostMode24 && settings.builderBoostMode24[data.tag];
            cats[0].iconFile = is24 ? 'builder_boost_24.webp' : 'builder_boost.webp';
        }
        else if (boosts.builder_consumable) { cats[0].boostKey = 'builder_consumable'; cats[0].iconFile = 'builder_consumable.webp'; }
        if (boosts.lab_boost) { cats[1].boostKey = 'lab_boost'; cats[1].iconFile = 'lab_boost.webp'; }
        else if (boosts.lab_consumable) { cats[1].boostKey = 'lab_consumable'; cats[1].iconFile = 'lab_consumable.webp'; }
        if (boosts.pet_boost) { cats[2].boostKey = 'pet_boost'; cats[2].iconFile = 'pet_boost.webp'; }
        else if (boosts.lab_consumable) { cats[2].boostKey = 'lab_consumable'; cats[2].iconFile = 'lab_consumable.webp'; }
        if (boosts.clocktower_boost) { cats[3].boostKey = 'clocktower_boost'; cats[3].iconFile = 'clocktower_boost.webp'; cats[4].boostKey = 'clocktower_boost'; cats[4].iconFile = 'clocktower_boost.webp'; }

        cats.forEach(cat => {
            const ref = getBoostTimerEl(cat.headingId);
            if (!ref) return;
            const timerEl = ref.timerEl;

            if (cat.boostKey) {
                const boostVal = boosts[cat.boostKey];
                const remaining = Math.max(0, boostVal - elapsed);
                if (remaining > 0) {
                    const h = Math.floor(remaining / 3600);
                    const m = Math.floor((remaining % 3600) / 60);
                    const s = Math.floor(remaining % 60);
                    const timeStr = String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
                    // 首次创建包含完整结构，后续只更新文字
                    let timeSpan = timerEl.querySelector('.boost-time-text');
                    if (!timeSpan) {
                        timerEl.innerHTML = '<img src="img/icons/' + cat.iconFile + '" width="16" height="16" style="vertical-align:middle;display:inline-block"><span class="boost-time-text">' + timeStr + '</span>';
                    } else if (timeSpan.textContent !== timeStr) {
                        timeSpan.textContent = timeStr;
                    }
                } else {
                    timerEl.remove();
                    boostTimerRefs.delete(cat.headingId);
                }
            } else {
                timerEl.remove();
                boostTimerRefs.delete(cat.headingId);
            }
        });
    }

    // 摘要元素引用缓存（避免每次渲染重复 getElementById）
    let summaryEls = null;
    function getSummaryEls() {
        if (summaryEls && summaryEls.card && summaryEls.card.isConnected) return summaryEls;
        summaryEls = {
            card: document.getElementById('category-summary-card'),
            els: {}, badges: {}, redBadges: {}, icons: {}
        };
        ['buildings', 'lab', 'pets', 'buildings2', 'units2'].forEach(key => {
            summaryEls.els[key] = document.getElementById('summary-' + key);
            summaryEls.badges[key] = document.getElementById('summary-badge-' + key);
            summaryEls.redBadges[key] = document.getElementById('summary-badge-red-' + key);
            summaryEls.icons[key] = document.getElementById('summary-icon-' + key);
        });
        return summaryEls;
    }

    function updateCategorySummary(counts, denominators, completedCounts) {
        const refs = getSummaryEls();
        if (!refs.card) return;
        refs.card.classList.remove('hidden');
        const keys = ['buildings', 'lab', 'pets', 'buildings2', 'units2'];
        keys.forEach(key => {
            const el = refs.els[key];
            if (el) {
                const text = (counts[key] || 0) + '/' + (denominators[key] || 0);
                if (el.textContent !== text) el.textContent = text;
            }
            const greenBadge = refs.badges[key];
            if (greenBadge) {
                const completed = (completedCounts && completedCounts[key]) || 0;
                if (completed > 0) {
                    if (greenBadge.textContent !== String(completed)) greenBadge.textContent = String(completed);
                    greenBadge.style.display = 'flex';
                } else {
                    greenBadge.style.display = 'none';
                }
            }
            const redBadge = refs.redBadges[key];
            if (redBadge) {
                const c = counts[key] || 0;
                const d = denominators[key] || 0;
                const isDismissed = (sessionDismissedCategories[state.currentAccount] && sessionDismissedCategories[state.currentAccount][key]) || (settings.dismissedCategories && settings.dismissedCategories[state.currentAccount] && settings.dismissedCategories[state.currentAccount][key]);
                const opacity = (d === 0 || c >= d || isDismissed) ? '0' : '1';
                if (redBadge.style.opacity !== opacity) redBadge.style.opacity = opacity;
            }
            const iconEl = refs.icons[key];
            if (iconEl) {
                iconEl.src = calc.getSummaryIconUrl(key);
            }
        });
    }

    // ===== 屏蔽弹窗交互 =====
    let dismissTargetKey = null;
    let undismissTargetKey = null;

    // 全局函数：点击分类概览图标
    function handleCategoryClick(key) {
        const isDismissed = (sessionDismissedCategories[state.currentAccount] && sessionDismissedCategories[state.currentAccount][key]) || (settings.dismissedCategories && settings.dismissedCategories[state.currentAccount] && settings.dismissedCategories[state.currentAccount][key]);
        if (!isDismissed) {
            dismissTargetKey = key;
            document.getElementById('dismiss-modal').classList.remove('hidden');
        } else {
            // 已屏蔽 → 连点3次取消屏蔽
            const card = document.getElementById('category-summary-card');
            const clickKey = 'dismiss_click_' + key;
            const now = Date.now();
            const lastClick = parseInt(card.dataset[clickKey + '_time'] || '0');
            const count = parseInt(card.dataset[clickKey + '_count'] || '0');
            if (now - lastClick > 1000) {
                card.dataset[clickKey + '_count'] = '1';
            } else {
                const newCount = count + 1;
                card.dataset[clickKey + '_count'] = String(newCount);
                if (newCount >= 3) {
                    card.dataset[clickKey + '_count'] = '0';
                    undismissTargetKey = key;
                    document.getElementById('undismiss-modal').classList.remove('hidden');
                    return;
                }
            }
            card.dataset[clickKey + '_time'] = String(now);
        }
    }

    function hydrateCache() {
        const elLoad = document.getElementById('loading-indicator');
        const elEmpty = document.getElementById('empty-state');
        const elUpgrades = document.getElementById('upgrades-container');
        const elBadge = document.getElementById('upgrades-count-badge');
        const elTitle = document.getElementById('upgrade-title-text');
        const elDataInfo = document.getElementById('data-info');
        const elActions = document.getElementById('account-actions');
        try {
            const cached = JSON.parse(localStorage.getItem('clash_cached_view'));
            if (cached && cached.html && cached.time && Date.now() - cached.time < 86400000) {
                elUpgrades.innerHTML = cached.html;
                elUpgrades.classList.remove('hidden');
                // 恢复后重新绑定图标 error 监听（fallback 链依赖事件绑定，innerHTML 恢复不会自带）
                elUpgrades.querySelectorAll('img[data-cachekey]').forEach(img => img.addEventListener('error', handleIconError));
                elLoad.classList.add('hidden');
                if (elBadge) {
                    elBadge.classList.remove('hidden');
                    elBadge.textContent = (cached.html.match(/data-unique=/g) || []).length;
                }
                if (elTitle && cached.tag) elTitle.textContent = cached.tag + '的升级项目';
                if (elDataInfo) elDataInfo.classList.remove('hidden');
                if (elActions) elActions.classList.remove('hidden');
                return true;
            }
        } catch (error) {
            console.warn('恢复渲染缓存失败', error);
        }
        let hasData = false;
        try {
            const raw = localStorage.getItem('clash_upgrade_data');
            if (raw) {
                const data = JSON.parse(raw);
                hasData = Boolean(data.accounts && Object.keys(data.accounts).length);
            }
        } catch (error) {
            console.warn('读取遗留缓存失败', error);
        }
        if (!hasData) {
            elLoad.classList.add('hidden');
            elEmpty.classList.remove('hidden');
        }
        return false;
    }

    function init() {
        if (initialized) return;
        initialized = true;

        const summary = document.getElementById('category-summary-card');
        if (summary) {
            summary.addEventListener('click', event => {
                const target = event.target.closest('[data-category]');
                if (target) handleCategoryClick(target.dataset.category);
            });
        }
        // 挡位按钮点击事件 — 保存手动挡位到 settings
        document.addEventListener('click', function(e) {
            const btn = e.target.closest('.event-boost-btn');
            if (!btn) return;
            const mult = parseFloat(btn.dataset.mult);
            if (isNaN(mult)) return;
            if (!state.currentAccount || !accounts[state.currentAccount]) return;

            if (!settings.eventBoostOverride) settings.eventBoostOverride = {};
            const tag = accounts[state.currentAccount].tag || state.currentAccount;
            settings.eventBoostOverride[tag] = mult;
            saveSettings();

            refreshCurrentAccountDisplay();
        });
        document.getElementById('dismiss-session-btn')?.addEventListener('click', () => {
            if (dismissTargetKey && state.currentAccount) {
                if (!sessionDismissedCategories[state.currentAccount]) sessionDismissedCategories[state.currentAccount] = {};
                sessionDismissedCategories[state.currentAccount][dismissTargetKey] = true;
                settings.sessionDismissedCategories = sessionDismissedCategories;
                saveSettings();
                refreshCurrentAccountDisplay();
            }
            document.getElementById('dismiss-modal').classList.add('hidden');
            dismissTargetKey = null;
        });
        document.getElementById('dismiss-forever-btn')?.addEventListener('click', () => {
            if (dismissTargetKey && state.currentAccount) {
                if (!sessionDismissedCategories[state.currentAccount]) sessionDismissedCategories[state.currentAccount] = {};
                sessionDismissedCategories[state.currentAccount][dismissTargetKey] = true;
                settings.sessionDismissedCategories = sessionDismissedCategories;
                if (!settings.dismissedCategories) settings.dismissedCategories = {};
                if (!settings.dismissedCategories[state.currentAccount]) settings.dismissedCategories[state.currentAccount] = {};
                settings.dismissedCategories[state.currentAccount][dismissTargetKey] = true;
                saveSettings();
                refreshCurrentAccountDisplay();
            }
            document.getElementById('dismiss-modal').classList.add('hidden');
            dismissTargetKey = null;
        });
        document.getElementById('dismiss-cancel-btn')?.addEventListener('click', () => {
            document.getElementById('dismiss-modal').classList.add('hidden');
            dismissTargetKey = null;
        });
        document.getElementById('dismiss-modal')?.addEventListener('click', (e) => {
            if (e.target === document.getElementById('dismiss-modal')) {
                document.getElementById('dismiss-modal').classList.add('hidden');
                dismissTargetKey = null;
            }
        });

        document.getElementById('undismiss-confirm-btn')?.addEventListener('click', () => {
            if (undismissTargetKey && state.currentAccount) {
                if (sessionDismissedCategories[state.currentAccount]) delete sessionDismissedCategories[state.currentAccount][undismissTargetKey];
                if (settings.dismissedCategories && settings.dismissedCategories[state.currentAccount]) delete settings.dismissedCategories[state.currentAccount][undismissTargetKey];
                saveSettings();
                refreshCurrentAccountDisplay();
            }
            document.getElementById('undismiss-modal').classList.add('hidden');
            undismissTargetKey = null;
        });
        document.getElementById('undismiss-cancel-btn')?.addEventListener('click', () => {
            document.getElementById('undismiss-modal').classList.add('hidden');
            undismissTargetKey = null;
        });
        document.getElementById('undismiss-modal')?.addEventListener('click', (e) => {
            if (e.target === document.getElementById('undismiss-modal')) {
                document.getElementById('undismiss-modal').classList.add('hidden');
                undismissTargetKey = null;
            }
        });
            // 助手阶段图标点击气泡提示
            document.getElementById('upgrades-container').addEventListener('click', function(e) {
                const btn = e.target.closest('.phase-icon-btn');
                if (btn) handlePhaseTooltip({ currentTarget: btn });
            });

            // builderBoost 10x/24x 切换（点击图标切换）
            document.getElementById('builder-boost-toggle')?.addEventListener('click', () => {
                if (!state.currentAccount || !accounts[state.currentAccount]) return;
                const data = accounts[state.currentAccount];
                if (!settings.builderBoostMode24) settings.builderBoostMode24 = {};
                const current = settings.builderBoostMode24[data.tag] || false;
                settings.builderBoostMode24[data.tag] = !current;
                saveSettings();
                updateBuilderBoostToggle(data);
            });

            // 建筑工人月卡图标点击 → 弹窗
            document.getElementById('builder-monthly-pass-icon')?.addEventListener('click', () => {
                document.getElementById('builder-monthly-pass-modal').classList.remove('hidden');
            });
            // 月卡弹窗：是
            document.getElementById('builder-monthly-pass-yes-btn')?.addEventListener('click', () => {
                if (!state.currentAccount) return;
                if (!settings.builderMonthlyPass) settings.builderMonthlyPass = {};
                settings.builderMonthlyPass[state.currentAccount] = true;
                saveSettings();
                updateBuilderMonthlyPassIcon(state.currentAccount);
                // 刷新总览卡片显示
                if (state.currentAccount && accounts[state.currentAccount]) {
                    const data = accounts[state.currentAccount];
                    const items = calc.extractUpgradingItems(data, Math.floor(Date.now() / 1000), true);
                    updateCategorySummary(calc.getCategoryCounts(items), calc.getCategoryDenominators(data), calc.getCategoryCompletedCounts(items, data));
                }
                document.getElementById('builder-monthly-pass-modal').classList.add('hidden');
            });
            // 月卡弹窗：否
            document.getElementById('builder-monthly-pass-no-btn')?.addEventListener('click', () => {
                if (!state.currentAccount) return;
                if (!settings.builderMonthlyPass) settings.builderMonthlyPass = {};
                settings.builderMonthlyPass[state.currentAccount] = false;
                saveSettings();
                updateBuilderMonthlyPassIcon(state.currentAccount);
                // 刷新总览卡片显示
                if (state.currentAccount && accounts[state.currentAccount]) {
                    const data = accounts[state.currentAccount];
                    const items = calc.extractUpgradingItems(data, Math.floor(Date.now() / 1000), true);
                    updateCategorySummary(calc.getCategoryCounts(items), calc.getCategoryDenominators(data), calc.getCategoryCompletedCounts(items, data));
                }
                document.getElementById('builder-monthly-pass-modal').classList.add('hidden');
            });
            // 月卡弹窗遮罩关闭
            document.getElementById('builder-monthly-pass-modal')?.addEventListener('click', function(e) {
                if (e.target === document.getElementById('builder-monthly-pass-modal')) {
                    document.getElementById('builder-monthly-pass-modal').classList.add('hidden');
                }
            });
    }

    function render(data) {
        const upgradingItems = calc.extractUpgradingItems(data, Math.floor(Date.now() / 1000), true);
        displayUpgradingItems(upgradingItems, data);
        updateCategorySummary(calc.getCategoryCounts(upgradingItems), calc.getCategoryDenominators(data), calc.getCategoryCompletedCounts(upgradingItems, data));
        renderHelperOverview(data);
        updateBoostTimers(data);
        updateBuilderBoostToggle(data);
        renderEventBoostSelector(data);
        updateAllAccountTabColors();
        updateMainTitle();
    }

    CocTool.features.progress = Object.freeze({
        init,
        hydrateCache,
        render,
        renderItems: displayUpgradingItems,
        refresh: refreshCurrentAccountDisplay,
        tick: updateTimersOnly,
        calculateCompletionTimestamp: calc.calculateCompletionTimestamp,
        extractUpgradingItems: calc.extractUpgradingItems,
        getItemName: calc.getItemName,
        formatRemainingTime: calc.formatRemainingTime,
        formatExportTime: calc.formatExportTime,
        escapeHtml: calc.escapeHtml,
        filterNightWorld: calc.filterNightWorld,
        getAccountTabColor: calc.getAccountTabColor,
        getRemainingColor: calc.getRemainingColor,
        hasSleepHighlight: calc.hasSleepHighlight,
        invalidateSleepRange: calc.invalidateSleepRange,
        hasRecurrentItem: calc.hasRecurrentItem,
        resetIconCache,
        getNoteForItem,
        reconcileNotes
    });
})(window);
