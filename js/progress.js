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

    /* 渲染缓存（clash_cached_view）的版本号：缓存里存的是升级列表的**整段 innerHTML**，
       模板结构一变，冷启动就会把旧 class 的 DOM 原样塞回来（组标题/行卡的间距、类名全按旧的来，
       表现为"改了没生效"，DESIGN.md §4.9 记过这次踩坑）。
       **改升级列表的模板（行卡 / 组标题 / 组包装）时把这个数 +1**，老缓存自动失效、重新渲染。 */
    const VIEW_CACHE_V = 5;

    // 渲染目标：当前账号 slide（Swiper 每账号一页，模板元素仅作克隆源）；无 slide 时回退 document
    function getActiveSlideRoot() {
        const acc = CocTool.features.accounts;
        if (acc && typeof acc.getActiveSlide === 'function') {
            const s = acc.getActiveSlide();
            if (s) return s;
        }
        return document;
    }

    function getSlideEls() {
        const root = getActiveSlideRoot();
        const q = id => root.querySelector('#' + id);
        return {
            loadingIndicator: q('loading-indicator'),
            emptyState: q('empty-state'),
            upgradesContainer: q('upgrades-container'),
            upgradesCountBadge: q('upgrades-count-badge'),
            categoryContainers: {
                buildings: q('buildings-list'),
                lab: q('lab-list'),
                pets: q('pets-list'),
                buildings2: q('buildings2-list'),
                units2: q('units2-list')
            },
            categoryCountBadges: {
                buildings: q('buildings-count'),
                lab: q('lab-count'),
                pets: q('pets-count'),
                buildings2: q('buildings2-count'),
                units2: q('units2-count')
            }
        };
    }

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

    // 节省时长：天时分、零高位级联省略（现成的三个格式化器都带秒，不合用）
    function formatDHM(sec) {
        const d = Math.floor(sec / 86400);
        const h = Math.floor((sec % 86400) / 3600);
        const m = Math.floor((sec % 3600) / 60);
        let out = '';
        if (d > 0) out += d + '天';
        if (h > 0 || out) out += h + '时';
        if (m > 0 || out) out += m + '分';
        return out || '0分';
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
            const schedAt = parseInt(btn.dataset.helperScheduled) || 0;
            if (schedAt > 0 && !isRecurrent) {   // 单次预约窗：hc 归零后加速一次
                return {
                    boostRemaining: Math.max(0, schedAt + 3600 - elapsed),
                    cooldownRemaining: Math.max(0, schedAt - elapsed),
                };
            }
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

        // 节省行（胶囊生成时算好的静态值，不随秒变）
        const savedSec = parseInt(btn.dataset.usageSaved) || 0;
        let usageHtml = '';
        if (savedSec > 0) {
            const savedTime = '<span class="tooltip-time">' + formatDHM(savedSec) + '</span>';
            usageHtml = isRecurrent
                ? '<div><span class="tooltip-label">生效' + (btn.dataset.usageCount || '0') + '次，共节省：</span>' + savedTime + '</div>'
                : '<div><span class="tooltip-label">节省：</span>' + savedTime + '</div>';
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
            html += usageHtml;
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
                leftHtml.push('<span class="ho-helper" data-helper="worker" style="display:inline-flex;align-items:center;gap:2px;margin-right:4px"><span style="display:inline-flex;position:relative"><img src="img/icons/BHelper.webp" width="' + iconSize + '" height="' + iconSize + '" style="vertical-align:middle;display:inline-block;border-radius:4px"></span><span style="background:#dbeafe;color:#1d4ed8;border-radius:999px;padding:0 5px;font-size:11px;font-weight:600;line-height:1.4">' + (worker.lvl || 0) + '</span></span>');
            }
            if (lab) {
                leftHtml.push('<span class="ho-helper" data-helper="lab" style="display:inline-flex;align-items:center;gap:2px"><span style="display:inline-flex;position:relative"><img src="img/icons/LHelper.webp" width="' + iconSize + '" height="' + iconSize + '" style="vertical-align:middle;display:inline-block;border-radius:4px"></span><span style="background:#f3e8ff;color:#7c3aed;border-radius:999px;padding:0 5px;font-size:11px;font-weight:600;line-height:1.4">' + (lab.lvl || 0) + '</span></span>');
            }
            leftHtml.push('<span class="ho-timer-left" style="font-weight:500;white-space:nowrap"></span>');

            let clockHtml = '<span style="display:inline-flex;align-items:center;gap:2px"><span style="display:inline-flex;position:relative"><img src="img/icons/CT.webp" width="' + iconSize + '" height="' + iconSize + '" style="vertical-align:middle;display:inline-block;border-radius:4px"></span><span style="background:#fef3c7;color:#d97706;border-radius:999px;padding:0 5px;font-size:11px;font-weight:600;line-height:1.4">' + clockLvl + '</span></span><span class="ho-timer-right" style="font-weight:500;white-space:nowrap"></span>';

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
            if (sim.active) return;   // 推演中禁用已完成项删除（保护副本语义）
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
                    let removed = false;
                    if (arr && Array.isArray(arr)) {
                        const idx = arr.findIndex(function (a) {
                            return Number(a.data) === Number(id) && Number(a.timer) === Number(timer) && Number(a.lvl) === Number(lvl);
                        });
                        if (idx !== -1) {
                            // 完成确认：不清除条目（实体等级信息供详情页/总进度使用），只清除 timer（升级结束）+ 等级 +1（升级完成的目的就是 +1 级）
                            arr[idx].lvl = Number(arr[idx].lvl) + 1;
                            delete arr[idx].timer;
                            removed = true;
                        } else {
                            // 精工台嵌套模块（data=1000097 的 types[].modules[]，如精工形态 103000011-13）：
                            // 平铺匹配找不到，需递归定位；同样只清 timer + 等级 +1，条目/module 保留
                            for (let i = 0; i < arr.length; i++) {
                                const it = arr[i];
                                if (Number(it.data) !== 1000097 || !it.types || !Array.isArray(it.types)) continue;
                                const ts = it.types;
                                for (let ti = 0; ti < ts.length; ti++) {
                                    const ms = ts[ti].modules;
                                    if (!ms || !Array.isArray(ms)) continue;
                                    for (let mi = 0; mi < ms.length; mi++) {
                                        if (Number(ms[mi].data) === Number(id) && Number(ms[mi].timer) === Number(timer) && Number(ms[mi].lvl) === Number(lvl)) {
                                            ms[mi].lvl = Number(ms[mi].lvl) + 1;
                                            delete ms[mi].timer;
                                            removed = true;
                                        }
                                    }
                                }
                            }
                        }
                        if (removed) {
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
    // ========== 图标点击 → 图鉴详情页（条目 item.data 与图鉴数据同源；点图标不触发整卡的完成删除/长按备忘） ==========
    // 精工形态（103000011+）：从精制台 1000097 的 types[].modules[] 取该形态模块等级数组（对齐 overview-detail.js craftModuleLevels）
    function craftModulesFor(craftId, tag) {
        if (!tag || !accounts[tag]) return null;
        const b = accounts[tag].buildings || [];
        for (let i = 0; i < b.length; i++) {
            if (b[i] && b[i].data === 1000097 && b[i].types) {
                for (let t = 0; t < b[i].types.length; t++) {
                    const type = b[i].types[t];
                    if (type && String(type.data) === String(craftId)) {
                        return (type.modules || []).map(m => m.lvl || 0);
                    }
                }
            }
        }
        return null;
    }
    // ===== 「直达图鉴」小路（单一入口：首页升级图标与时间搜索结果图标共用）=====
    // 用户口径：首页/时间搜索 → 图鉴 是**单向小路**（直达）；返程只能走原大路（图鉴 → 账号详情页 → 账号进度 → 首页）。
    // 实现上不需要任何"补站"机制，只要在同一次同步执行里把大路铺在下面、图鉴盖在最上——
    // 图鉴 open() 现在点击即显示加载态（数据拉取期间也盖住下面的页面），所以用户全程看不到中间页 = 直达观感；
    // 返回时逐层露出下面本就有的大路页面，天然就是"返程走大路"。
    function openPokedexViaOverview(id, lvl) {
        if (!id || !CocTool.features.pokedex) return;
        const tag = state.currentAccount;
        if (CocTool.navigation && CocTool.navigation.showPage) {
            try { CocTool.navigation.showPage('overview'); } catch (err) { /* 导航异常时仍直接开图鉴 */ }
        }
        if (CocTool.overviewDetail && CocTool.overviewDetail.openDetail && tag) {
            try {
                if (CocTool.overviewList && CocTool.overviewList.el && !CocTool.overviewList.el.detailPage) CocTool.overviewDetail.initDetail();
                CocTool.overviewDetail.openDetail(tag);
            } catch (err) { /* 详情层数据未就绪时仅开图鉴（渐进降级） */ }
        }
        const modules = String(id).indexOf('10300001') === 0 ? craftModulesFor(id, tag) : null;
        CocTool.features.pokedex.open(id, lvl, tag, modules);
    }

    function onIconTap(e) {
        e.stopPropagation();   // 已完成条目整卡点击是删除确认：点图标不算（须在推演守卫之前，避免冒泡进卡片分发）
        if (sim.active) {   // 推演中禁用图标跳图鉴
            if (CocTool.ui && CocTool.ui.showToast) CocTool.ui.showToast('推演中不可查看图鉴');
            return;
        }
        const card = e.target.closest('.upgrade-card');
        if (!card) return;
        e.stopPropagation(); // 已完成条目整卡点击是删除确认：点图标不算
        const id = card.getAttribute('data-item-id');
        if (!id) return;
        openPokedexViaOverview(id, Number(card.getAttribute('data-item-lvl')) || 1);
    }
    // 渲染路径与缓存恢复路径共用（幂等标记用 JS property，同 bindCardDelete 的 data-* 教训）
    function bindIconPokedex(card) {
        const img = card.querySelector('img[data-cachekey]');
        if (!img || img.__pdxBound) return;
        img.__pdxBound = true;
        img.style.cursor = 'pointer';
        img.addEventListener('click', onIconTap);
    }

    function displayUpgradingItems(items, data, nowSec) {
        // 刷新容器引用（hydrateCache 可能已替换 DOM 节点；Swiper 每账号 slide 独立容器）
        const els = getSlideEls();
        const { upgradesContainer, upgradesCountBadge, emptyState, loadingIndicator, categoryContainers, categoryCountBadges } = els;
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
                const remainingSec = Math.max(0, completionTs - (nowSec || Date.now()/1000));
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
                    ? '<img src="' + iconSrc + '" width="36" height="36" class="w-9 h-9 object-contain rounded-lg" data-cachekey="' + cacheKey + '" data-fallback="' + (iconUrls ? iconUrls.slice(1).join(',') : '') + '" alt=""><i class="fa ' + icon + ' text-primary" style="display:none;font-size:20px;"></i>' + scOverlay
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
                    ? '<p class="text-xs card-note-line" style="color:#b45309;">📝 ' + calc.escapeHtml(note) + '</p>'
                    : '<p class="text-xs text-gray-500">' + catLine + ' · ' + lvLine + '</p>';
                // 倒计时与完成时刻的排版走 app.css 的 .card-time-container / .card-done-time（方案 05 口径）；
                // 这里**不写 text-sm / 行内字号**——Tailwind 是运行时注入、同权重时它赢，会把 15px/600 压回 14px/400
                card.innerHTML = '<div class="flex items-center">' + iconHtml + '<div class="min-w-0"><h3 class="card-name font-semibold text-gray-800" style="font-size:13px;">' + h3Inner + phaseIcon + '</h3>' + subLine + '</div></div><div class="text-right flex-shrink-0"><div class="' + textColor + ' card-time-container"><span class="card-remain">' + remainHtml(remainingSec) + '</span></div><div class="card-done-time">' + doneTimeFmt + '</div></div>';
                const iconImage = card.querySelector('img[data-cachekey]');
                if (iconImage) iconImage.addEventListener('error', handleIconError);
                bindIconPokedex(card);
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
        try { if (!sim.active && Date.now() - lastCacheWrite > 30000) { lastCacheWrite = Date.now(); localStorage.setItem('clash_cached_view', JSON.stringify({ v: VIEW_CACHE_V, html: upgradesContainer.innerHTML, tag: state.currentAccount, time: Date.now() })); } } catch(e) {}
    }

    // ========== 增量更新卡片倒计时（不重建 DOM，仅更新文本+颜色）==========
    // 剩余时间渲染（方案 05 口径）：数字与单位分开（.cr-digit/.cr-unit）——单位小一号、次文字色、两侧各留 1px；
    // 末位秒只显数字不显「秒」字；已完成走 .cr-done（12px 绿）
    function remainHtml(sec) {
        if (sec <= 0) return '<span class="cr-done">就绪</span>';
        const d = Math.floor(sec / 86400);
        const h = Math.floor((sec % 86400) / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        let html = '';
        if (d > 0) html += '<span class="cr-digit">' + d + '</span><span class="cr-unit">天</span>';
        if (h > 0 || html) html += '<span class="cr-digit cr-digit-fixed">' + h + '</span><span class="cr-unit">时</span>';
        if (m > 0 || html) html += '<span class="cr-digit cr-digit-fixed">' + m + '</span><span class="cr-unit">分</span>';
        html += '<span class="cr-digit cr-digit-fixed">' + s + '</span>';
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
                // 直接写死这两个类：旧写法是"删掉 text-* 再追加"，`card-time-container` 每轮都会被追加一次、
                // 永不回收（实测 4 秒涨 4 份，页面开着就一直涨）。这里只该有"分级色 + 容器类"两件套。
                tc.className = 'card-time-container ' + remCls.text;
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
            // 补绑图标跳图鉴（缓存恢复路径由此生效）
            bindIconPokedex(card);
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
            const selector = getActiveSlideRoot().querySelector('#event-boost-selector');
            if (selector && !selector.classList.contains('hidden')) selector.classList.add('hidden');
        }
    }

    function updateBuilderBoostToggle(data) {
        const root = getActiveSlideRoot();
        const toggle = root.querySelector('#builder-boost-toggle');
        const isCn = calc.isCnAccount(data);
        if (!isCn) {
            if (toggle) toggle.style.display = 'none';
            // 隐藏月卡图标
            const passIcon = root.querySelector('#builder-monthly-pass-icon');
            if (passIcon) passIcon.classList.add('hidden');
            return;
        }
        if (toggle) toggle.style.display = 'inline-flex';
        const is24Mode = settings.builderBoostMode24 && settings.builderBoostMode24[data.tag];
        const label = root.querySelector('#builder-boost-label');
        if (label) label.textContent = is24Mode ? '24x' : '10x';
        const icon = root.querySelector('#builder-boost-icon');
        if (icon) {
            icon.src = is24Mode ? 'img/icons/builder_boost_24.webp' : 'img/icons/builder_boost.webp';
        }
        if (label) label.style.color = is24Mode ? '#ea580c' : '';
        // 更新建筑工人月卡图标
        updateBuilderMonthlyPassIcon(data.tag);
    }

    function updateBuilderMonthlyPassIcon(tag) {
        var passIcon = getActiveSlideRoot().querySelector('#builder-monthly-pass-icon');
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
        if (sim.active) exitSim(false);   // 任何整页刷新（切号/导入/挡位切换）都会退出推演
        if (!state.currentAccount || !accounts[state.currentAccount]) return;
        render(accounts[state.currentAccount]);
    }

    // ========== 道具使用推演（字面截断副本，2026-09-19）==========
    // 副本 = calc.snapshotAccount(源数据, 点击时刻)；推演中新增药水 = 副本 boosts 普通叠加延长；
    // 页面冻结（pauseTicker + 固定 now 重渲染）；应用 = 副本 timestamp 改为应用时刻后替换源数据。
    const SIM_GROUPS = [
        { gid: 'buildings', countId: 'buildings-count', potions: [
            { key: 'builder_boost', icon: 'builder_boost.webp', name: '工人药水' },
            { key: 'builder_consumable', icon: 'builder_consumable.webp', name: '工人大餐' }] },
        { gid: 'lab', countId: 'lab-count', potions: [
            { key: 'lab_boost', icon: 'lab_boost.webp', name: '实验室药水' },
            { key: 'lab_consumable', icon: 'lab_consumable.webp', name: '研究浓汤' }] },
        { gid: 'pets', countId: 'pets-count', potions: [
            { key: 'pet_boost', icon: 'pet_boost.webp', name: '战宠药水' },
            { key: 'lab_consumable', icon: 'lab_consumable.webp', name: '研究浓汤' }] },
        { gid: 'buildings2', countId: 'buildings2-count', potions: [
            { key: 'clocktower_boost', icon: 'clocktower_boost.webp', name: '钟楼' }] },
        { gid: 'units2', countId: 'units2-count', potions: [
            { key: 'clocktower_boost', icon: 'clocktower_boost.webp', name: '钟楼' }] },
    ];
    const sim = { active: false, tag: null, copy: null, frozenNow: 0, baseBoosts: {}, counts: {}, hiddenEls: [], towerBoost: 0 };

    function hideSimEl(el) {
        if (!el || el.__simHidden) return;
        el.__simHidden = true;   // 幂等标记用 JS property（同 bindCardDelete 的 data-* 教训）
        sim.hiddenEls.push(el);
        el.style.display = 'none';
    }

    function renderSimList() {
        const items = calc.filterDismissedCategories(calc.extractUpgradingItems(sim.copy, sim.frozenNow, true), sim.copy.tag);
        displayUpgradingItems(items, sim.copy, sim.frozenNow);
    }

    function setSimCount(key, n) {
        n = Math.max(0, Math.floor(Number(n) || 0));
        if (sim.counts[key] === n) return;
        sim.counts[key] = n;
        const total = (sim.baseBoosts[key] || 0) + n * calc.potionUnitSec(key)
            + (key === 'clocktower_boost' ? (sim.towerBoost || 0) : 0);   // 钟楼启动的加速时长叠加
        if (total > 0) sim.copy.boosts[key] = total; else delete sim.copy.boosts[key];
        document.querySelectorAll('.sim-input[data-key="' + key + '"]').forEach(inp => { if (inp.value !== String(n)) inp.value = String(n); });
        renderSimList();
    }

    function stepperHtml(p) {
        return '<span class="sim-potion" title="' + p.name + '">' +
            '<img src="img/icons/' + p.icon + '" width="16" height="16" alt="">' +
            '<button type="button" class="sim-btn" data-key="' + p.key + '" data-delta="-1">−</button>' +
            '<input type="number" min="0" step="1" class="sim-input" data-key="' + p.key + '" value="' + (sim.counts[p.key] || 0) + '">' +
            '<button type="button" class="sim-btn" data-key="' + p.key + '" data-delta="1">+</button>' +
            '</span>';
    }

    function renderSimFrame() {
        const root = getActiveSlideRoot();
        // 分类头：原内容（图标/标题/数量/药水倒计时/24x 键）整行隐藏，只留步进器
        SIM_GROUPS.forEach(g => {
            const badge = root.querySelector('#' + g.countId);
            const h3 = badge ? badge.closest('h3') : null;
            if (!h3) return;
            h3.querySelectorAll(':scope > *:not(.sim-steppers)').forEach(el => hideSimEl(el));
            let wrap = h3.querySelector('.sim-steppers');
            if (!wrap) {
                wrap = document.createElement('span');
                wrap.className = 'sim-steppers';
                h3.appendChild(wrap);
            }
            wrap.innerHTML = g.potions.map(stepperHtml).join('');
            wrap.querySelectorAll('.sim-btn').forEach(btn => btn.addEventListener('click', () => setSimCount(btn.dataset.key, (sim.counts[btn.dataset.key] || 0) + Number(btn.dataset.delta))));
            wrap.querySelectorAll('.sim-input').forEach(inp => inp.addEventListener('change', () => setSimCount(inp.dataset.key, inp.value)));
        });
        // 标题行：原内容（图标/标题/数量/宝箱）隐藏，只留居中的退出/应用
        const anchor = root.querySelector('#chest-notification') || root.querySelector('#upgrade-title-text');
        const head = anchor ? anchor.closest('h2') : null;
        if (head && !head.querySelector('#sim-actions')) {
            const actions = document.createElement('span');
            actions.id = 'sim-actions';
            actions.className = 'sim-actions';
            actions.innerHTML = '<button type="button" id="sim-exit-btn">退出</button><button type="button" id="sim-apply-btn">应用</button>';
            head.appendChild(actions);
            head.querySelectorAll(':scope > *:not(#sim-actions)').forEach(el => hideSimEl(el));
            actions.querySelector('#sim-exit-btn').addEventListener('click', () => exitSim(false));
            actions.querySelector('#sim-apply-btn').addEventListener('click', applySim);
        }
        // 总览区钟楼：冷却归零时点击启动（= 使用钟楼加速，时长随钟楼等级）
        const ov = root.querySelector('#helper-overview');
        const clockBlock = ov ? (ov.querySelector('.ho-timer-right') || {}).parentElement : null;
        if (clockBlock) {
            const ctReady = !((sim.copy.boosts || {}).clocktower_cooldown > 0);
            clockBlock.setAttribute('data-sim-clock', '1');
            clockBlock.style.cursor = ctReady ? 'pointer' : '';
            clockBlock.title = ctReady ? '点击启动钟楼' : '';
        }
        renderSimList();
    }

    function activateClockTower() {
        if (!sim.active || !sim.copy) return;
        const boosts = sim.copy.boosts || (sim.copy.boosts = {});
        if ((boosts.clocktower_cooldown || 0) > 0) {
            CocTool.ui.showToast('钟楼冷却中');
            return;
        }
        const ct = (sim.copy.buildings2 || []).find(b => b.data === 1000039);
        if (!ct || !(ct.lvl > 0)) {
            CocTool.ui.showToast('没有可用的钟楼');
            return;
        }
        const dur = calc.clockTowerBoostSec(ct.lvl);
        boosts.clocktower_boost = (boosts.clocktower_boost || 0) + dur;
        boosts.clocktower_cooldown = dur + 79200;   // 冷却 = 生效时长 + 22h
        sim.towerBoost = (sim.towerBoost || 0) + dur;
        CocTool.ui.showToast('钟楼已启动：夜世界 +' + Math.round(dur / 60) + ' 分钟加速');
        const rt = document.querySelector('#helper-overview .ho-timer-right');
        if (rt) rt.textContent = '加速中 ' + Math.round(dur / 60) + '分';
        renderSimList();
    }

    // 推演中把总览卡钉在顶栏（含时间搜索那行按键）正下方 —— 见 app.css 的 `body.sim-pinned` 段。
    // 顶栏高度随"标签栏 / 操作行是否显示"和顶部留白令牌变，所以量一次写进 CSS 变量（不是常量）。
    function pinSummaryCard() {
        const bar = document.getElementById('sticky-top-bar');
        if (!bar) return;
        document.body.style.setProperty('--sim-pin-top', Math.round(bar.getBoundingClientRect().height) + 'px');
        document.body.classList.add('sim-pinned');
    }

    function unpinSummaryCard() {
        document.body.classList.remove('sim-pinned');
        document.body.style.removeProperty('--sim-pin-top');
    }

    function enterSim() {
        if (sim.active) { exitSim(false); return; }   // 推演中再点入口键 = 退出
        if (!state.currentAccount || !accounts[state.currentAccount]) return;
        sim.active = true;
        sim.tag = state.currentAccount;
        sim.frozenNow = Math.floor(Date.now() / 1000);
        sim.copy = calc.snapshotAccount(accounts[sim.tag], sim.frozenNow);
        sim.baseBoosts = Object.assign({}, sim.copy.boosts);
        sim.counts = {};
        CocTool.features.services.pauseTicker();
        renderSimFrame();
        pinSummaryCard();
    }

    function applySim() {
        CocTool.ui.showConfirm({
            title: '应用推演',
            text: '应用后推演数据将会替代源数据，且无法回退。是否确认应用到当前？',
            confirmText: '应用',
            cancelText: '取消',
            onConfirm: () => exitSim(true)
        });
    }

    function exitSim(apply) {
        if (!sim.active) return;
        const root = getActiveSlideRoot();
        root.querySelectorAll('.sim-steppers').forEach(el => el.remove());
        const actions = root.querySelector('#sim-actions');
        if (actions) actions.remove();
        sim.hiddenEls.forEach(el => { el.style.display = ''; el.__simHidden = false; });   // 分类头/标题行原内容恢复
        sim.hiddenEls = [];
        sim.active = false;
        unpinSummaryCard();
        if (apply && sim.copy) {
            sim.copy.timestamp = Math.floor(Date.now() / 1000);   // 推演的未来变成现在
            accounts[sim.tag] = sim.copy;
            try { storage.saveAccounts(); } catch (e) {}
        }
        sim.copy = null; sim.tag = null; sim.baseBoosts = {}; sim.counts = {};
        CocTool.features.services.resumeTicker();
        refreshCurrentAccountDisplay();
        if (apply && accounts[state.currentAccount]) callAccounts('updateDataInfo', accounts[state.currentAccount]);   // 宝箱判定恢复
    }

    // ===== 推演：助手指派 / 取消持续指派（点击卡片，2026-09-19）=====
    // 排队不变量：helper_cooldown = 下一可用工作窗起点（0/缺省 = 现在空闲）。
    // 未来工作窗只有持续指派能表达（ht=0 非循环 = 无任何加速），故忙碌时只提供持续选项。
    function findSimEntry(uniqueId) {
        if (!sim.copy || !uniqueId || uniqueId.indexOf('refine_') === 0) return null;
        const prefix = (sim.copy.tag || '') + '_';
        const rest = uniqueId.startsWith(prefix) ? uniqueId.slice(prefix.length) : uniqueId;
        const parts = rest.split('_');
        if (parts.length < 4) return null;
        const cat = parts[0];
        const arr = Array.isArray(sim.copy[cat]) ? sim.copy[cat] : [];
        const data = Number(parts[1]), a = Number(parts[2]), b = Number(parts[3]);
        // recurrent 形态：cat_data_timer_lvl；非 recurrent 形态：cat_data_lvl_数组下标
        let obj = arr.find(en => en.data === data && en.helper_recurrent === true && (en.timer || 0) === a && (en.lvl || 0) === b);
        if (!obj) obj = arr.find((en, idx) => en.data === data && (en.lvl || 0) === a && idx === b);
        return obj ? { obj: obj, cat: cat } : null;
    }

    function simHelperOf(cat) {
        const ids = ["buildings", "heroes", "traps", "guardians"].includes(cat) ? [124000000, 93000000]
            : ["units", "siege_machines", "spells"].includes(cat) ? [124000001, 93000001] : null;
        if (!ids) return null;
        return (sim.copy.helpers || []).find(h => ids.includes(h.data)) || null;
    }

    function findAssignedItem(cat) {
        const arr = Array.isArray(sim.copy[cat]) ? sim.copy[cat] : [];
        return arr.find(en => en.helper_timer > 0 || en.helper_recurrent === true || (en.helper_scheduled || 0) > 0) || null;
    }

    function handleSimCardClick(card) {
        console.log('SIM-CLICK handler enter, unique=' + card.getAttribute('data-unique'));
        if (!sim.active || !sim.copy) return;
        const found = findSimEntry(card.getAttribute('data-unique'));
        if (!found) return;
        const target = found.obj;
        const helper = simHelperOf(found.cat);
        if (!helper || !(helper.lvl > 0)) {
            CocTool.ui.showToast('当前账号没有可指派的助手');
            return;
        }
        const assigned = findAssignedItem(found.cat);
        if (assigned === target) {
            if (target.helper_recurrent === true) {
                showSimAssignModal(target, helper, { cancel: true });       // 取消持续指派
            } else if ((target.helper_scheduled || 0) > 0) {
                showSimAssignModal(target, helper, { unschedule: true });   // 取消单次预约
            } else {
                CocTool.ui.showToast('单次加速中，无法取消或变更');
            }
            return;
        }
        if (assigned && assigned !== target) {
            if (assigned.helper_recurrent === true) {
                CocTool.ui.showToast('助手已被持续指派，请先取消指派');      // 持续指派互斥
                return;
            }
            if ((assigned.helper_scheduled || 0) > 0) {
                CocTool.ui.showToast('助手已有单次预约，请先取消');          // 预约窗占用 hc 槽位
                return;
            }
            // assigned = 单次加速中（其他卡片）：可继续指派（hc 归零后生效），即「A 单次 + B 持续」合法场景
        }
        const ready = !(helper.helper_cooldown > 0);   // hc=0 助手就绪（总览区绿点）
        showSimAssignModal(target, helper, ready
            ? { single: true, recurrent: true, ready: true }
            : { scheduledSingle: true, recurrent: true });
    }

    // 就绪助手（hc=0）指派后的共享冷却对齐：另一助手冷却中（剩余 > 1h 会话）→ hc 对齐其倒计时；
    // 另一方也就绪/即将就绪 → 完整 23h（22h + 1h 会话）
    function simAlignedCooldown(helper) {
        const workerIds = [124000000, 93000000], labIds = [124000001, 93000001];
        const otherIds = workerIds.includes(helper.data) ? labIds : workerIds;
        const other = (sim.copy.helpers || []).find(h => otherIds.includes(h.data));
        const w = other ? (other.helper_cooldown || 0) : 0;
        return w > 0 ? w : 82800;
    }

    function showSimAssignModal(target, helper, opts) {
        const name = calc.getItemName(target.data) || '选中项目';
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'sim-assign-modal';
        let buttons = '';
        if (opts.cancel) {
            buttons = '<button type="button" class="sim-modal-btn" data-act="cancel">取消持续指派</button>';
        } else if (opts.unschedule) {
            buttons = '<button type="button" class="sim-modal-btn" data-act="unschedule">取消单次预约</button>';
        } else {
            if (opts.single) buttons += '<button type="button" class="sim-modal-btn" data-act="single">单次指派（立即加速 1 小时）</button>';
            if (opts.scheduledSingle) buttons += '<button type="button" class="sim-modal-btn" data-act="scheduled">单次指派（助手就绪后加速 1 小时）</button>';
            if (opts.recurrent) buttons += '<button type="button" class="sim-modal-btn secondary" data-act="recurrent">持续指派（' + (!(helper.helper_cooldown > 0) ? '立即加速 + 每 23 小时循环' : '助手就绪后开始 23h 循环') + '）</button>';
        }
        buttons += '<button type="button" class="sim-modal-btn close" data-act="close">关闭</button>';
        overlay.innerHTML = '<div class="modal-card w-sm">' +
            '<h3 class="font-semibold text-gray-800 mb-1" style="font-size:14px;">' + (opts.cancel ? '取消持续指派' : (opts.unschedule ? '取消单次预约' : '助手指派')) + '</h3>' +
            '<p class="text-xs text-gray-500 mb-3">助手 ' + helper.lvl + ' 级 · 「' + calc.escapeHtml(name) + '」' +
            (opts.cancel ? '<br>当前加速中的会话将继续至结束，之后不再循环' : '') +
            (opts.scheduledSingle ? '<br>助手就绪（hc 归零）后加速 1 小时' : '') + '</p>' +
            '<div class="flex flex-col gap-2">' + buttons + '</div>';
        document.body.appendChild(overlay);
        const close = () => overlay.remove();
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
        overlay.querySelectorAll('.sim-modal-btn').forEach(btn => btn.addEventListener('click', () => {
            const act = btn.dataset.act;
            if (act === 'close') { close(); return; }
            if (act === 'cancel') {
                delete target.helper_recurrent;   // ⚡：ht 保留（加速不可中断）；⏳：ht 已 0。helper_cooldown = 总览区倒计时，不改动
                CocTool.ui.showToast('已取消持续指派');
            } else if (act === 'unschedule') {
                delete target.helper_scheduled;
                CocTool.ui.showToast('已取消单次预约');
            } else if (act === 'single') {
                target.helper_timer = 3600;
                delete target.helper_recurrent;
                helper.helper_cooldown = simAlignedCooldown(helper);   // 共享冷却对齐
                CocTool.ui.showToast('已单次指派');
            } else if (act === 'scheduled') {
                target.helper_scheduled = helper.helper_cooldown || 0;   // hc 归零后加速一次
                CocTool.ui.showToast('已单次指派（预约）');
            } else if (act === 'recurrent') {
                if (opts.ready) {
                    target.helper_timer = 3600;                           // 就绪：立即加速
                    helper.helper_cooldown = simAlignedCooldown(helper);  // 共享冷却对齐
                } else {
                    target.helper_timer = 0;                              // hc 归零后开始第一次加速，之后按周期
                }
                target.helper_recurrent = true;
                CocTool.ui.showToast('已持续指派');
            }
            close();
            renderSimList();
        }));
    }

    // ========== 活动加速挡位选择器 ==========
    function renderEventBoostSelector(data) {
        const container = getActiveSlideRoot().querySelector('#event-boost-selector');
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
        const daysEl = getActiveSlideRoot().querySelector('#event-boost-days');
        if (daysEl) {
            daysEl.textContent = calc.getEventRecommendation(data);
        }
    }

    // ========== 升级列表分类标题旁显示加速道具剩余时间 ==========
    // 每轮扫描 countEl 后的 boost-timer（复用第一个/清理孤儿），不依赖元素引用缓存
    function updateBoostTimers(data) {
        const boosts = data.boosts || {};
        const now = Math.floor(Date.now() / 1000);
        const timestamp = data.timestamp || now;
        const elapsed = now - timestamp;

        // 类别 → { headingId, timers: [{ key, iconFile, remaining }]，剩余久的在前 }
        const cats = [
            { key: 'buildings', headingId: 'buildings-count', timers: [] },
            { key: 'lab', headingId: 'lab-count', timers: [] },
            { key: 'pets', headingId: 'pets-count', timers: [] },
            { key: 'buildings2', headingId: 'buildings2-count', timers: [] },
            { key: 'units2', headingId: 'units2-count', timers: [] }
        ];

        // 各分类当前生效的道具（药水与辅食可叠加）：剩余久的排前，显示为「图标 时间  图标 时间」
        const collectTimers = list => list.map(c => ({ key: c.key, iconFile: c.iconFile, remaining: (boosts[c.key] || 0) - elapsed }))
            .filter(t => t.remaining > 0)
            .sort((a, b) => b.remaining - a.remaining);
        const is24 = settings.builderBoostMode24 && settings.builderBoostMode24[data.tag];
        cats[0].timers = collectTimers([
            { key: 'builder_boost', iconFile: is24 ? 'builder_boost_24.webp' : 'builder_boost.webp' },
            { key: 'builder_consumable', iconFile: 'builder_consumable.webp' }
        ]);
        cats[1].timers = collectTimers([
            { key: 'lab_boost', iconFile: 'lab_boost.webp' },
            { key: 'lab_consumable', iconFile: 'lab_consumable.webp' }
        ]);
        cats[2].timers = collectTimers([
            { key: 'pet_boost', iconFile: 'pet_boost.webp' },
            { key: 'lab_consumable', iconFile: 'lab_consumable.webp' }
        ]);
        cats[3].timers = collectTimers([{ key: 'clocktower_boost', iconFile: 'clocktower_boost.webp' }]);
        cats[4].timers = collectTimers([{ key: 'clocktower_boost', iconFile: 'clocktower_boost.webp' }]);

        cats.forEach(cat => {
            const countEl = document.getElementById(cat.headingId);
            if (!countEl) return;
            // 扫描 countEl 之后的既有 boost-timer（hydrateCache 恢复的旧 HTML 也会带进来），按位复用、多余移除
            const existing = [];
            let s = countEl.nextElementSibling;
            while (s && s !== countEl.parentElement) {
                const next = s.nextElementSibling;
                if (s.classList && s.classList.contains('boost-timer')) existing.push(s);
                s = next;
            }
            const timers = cat.timers || [];
            let anchor = countEl;
            timers.forEach((t, i) => {
                let timerEl = existing[i];
                if (!timerEl) {
                    timerEl = document.createElement('span');
                    timerEl.className = 'boost-timer';
                    timerEl.style.cssText = 'display:inline-flex;align-items:center;gap:2px;margin-left:6px';
                }
                // 按排序落位：第 i 组紧挨第 i-1 组（insertBefore 对既有节点是移动，顺带纠正缓存恢复时的错位）
                anchor.parentNode.insertBefore(timerEl, anchor.nextSibling);
                anchor = timerEl;
                const h = Math.floor(t.remaining / 3600);
                const m = Math.floor((t.remaining % 3600) / 60);
                const sec = Math.floor(t.remaining % 60);
                const timeStr = String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(sec).padStart(2,'0');
                // 图标类型变化（换位/缓存恢复的旧 HTML 图标可能不匹配）→ 重建完整结构；否则只更新文字
                const img = timerEl.querySelector('img');
                if (!img || img.src.indexOf(t.iconFile) === -1) {
                    timerEl.innerHTML = '<img src="img/icons/' + t.iconFile + '" width="16" height="16" style="vertical-align:middle;display:inline-block;border-radius:4px"><span class="boost-time-text">' + timeStr + '</span>';
                } else {
                    const timeSpan = timerEl.querySelector('.boost-time-text');
                    if (timeSpan && timeSpan.textContent !== timeStr) timeSpan.textContent = timeStr;
                }
            });
            // 道具耗尽/缓存残留的多余 timer 移除
            existing.slice(timers.length).forEach(el => el.remove());
        });
    }

    // 摘要元素引用（每次从当前账号 slide 查询——Swiper 每账号独立 summary，缓存会指向克隆前的模板）
    function getSummaryEls() {
        const root = getActiveSlideRoot();
        const summaryEls = {
            card: root.querySelector('#category-summary-card'),
            els: {}, badges: {}, redBadges: {}, icons: {}, columns: {}
        };
        ['buildings', 'lab', 'pets', 'buildings2', 'units2'].forEach(key => {
            summaryEls.els[key] = root.querySelector('#summary-' + key);
            summaryEls.badges[key] = root.querySelector('#summary-badge-' + key);
            summaryEls.redBadges[key] = root.querySelector('#summary-badge-red-' + key);
            summaryEls.icons[key] = root.querySelector('#summary-icon-' + key);
            summaryEls.columns[key] = root.querySelector('[data-category="' + key + '"]');
        });
        return summaryEls;
    }

    function updateCategorySummary(counts, denominators, completedCounts) {
        const refs = getSummaryEls();
        if (!refs.card) return;
        refs.card.classList.remove('hidden');
        const keys = ['buildings', 'lab', 'pets', 'buildings2', 'units2'];
        keys.forEach(key => {
            const dismissed = calc.isCategoryDismissed(state.currentAccount, key);
            const el = refs.els[key];
            if (el) {
                // 屏蔽列分数显示 -/-（图标保留灰色可点击恢复）
                const text = dismissed ? '-/-' : (counts[key] || 0) + '/' + (denominators[key] || 0);
                if (el.textContent !== text) el.textContent = text;
            }
            const greenBadge = refs.badges[key];
            if (greenBadge) {
                const completed = (completedCounts && completedCounts[key]) || 0;
                if (completed > 0 && !dismissed) {
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
                const isDismissed = dismissed || (sessionDismissedCategories[state.currentAccount] && sessionDismissedCategories[state.currentAccount][key]) || (settings.dismissedCategories && settings.dismissedCategories[state.currentAccount] && settings.dismissedCategories[state.currentAccount][key]);
                const opacity = (d === 0 || c >= d || isDismissed) ? '0' : '1';
                if (redBadge.style.opacity !== opacity) redBadge.style.opacity = opacity;
            }
            const iconEl = refs.icons[key];
            if (iconEl) {
                iconEl.src = calc.getSummaryIconUrl(key);
            }
            // 类目屏蔽：图标正常显示、分数 -/-（无独立样式，类仅作状态标记），仍可点击（连点3次恢复）
            const col = refs.columns[key];
            if (col) {
                col.classList.toggle('summary-dismissed', dismissed);
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
            const card = getActiveSlideRoot().querySelector('#category-summary-card');
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
        const els = getSlideEls();
        const elLoad = els.loadingIndicator;
        const elEmpty = els.emptyState;
        const elUpgrades = els.upgradesContainer;
        const elBadge = els.upgradesCountBadge;
        const elTitle = getActiveSlideRoot().querySelector('#upgrade-title-text');
        const elDataInfo = getActiveSlideRoot().querySelector('#data-info');
        const elActions = document.getElementById('account-actions');
        try {
            const cached = JSON.parse(localStorage.getItem('clash_cached_view'));
            // 版本不符（含老缓存没有 v 字段）→ 不恢复，走真实渲染后重写缓存
            if (cached && cached.v === VIEW_CACHE_V && cached.html && cached.time && Date.now() - cached.time < 86400000) {
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

        // 事件委托到 main-display-area（Swiper 每账号 slide 克隆模板，模板上的直接绑定不会随克隆复制）
        const displayArea = document.getElementById('main-display-area');
        if (displayArea) {
            displayArea.addEventListener('click', event => {
                const target = event.target.closest('[data-category]');
                if (target) handleCategoryClick(target.dataset.category);
            });
        }
        // 道具推演：卡片点击 = 助手指派/取消（图标跳图鉴与 ⚡/⏳ 胶囊气泡各自处理，不进这里）
        if (displayArea) {
            displayArea.addEventListener('click', function(e) {
                console.log('SIM-DELEGATE fired, simActive=' + sim.active);
                if (!sim.active) return;   // 指派/取消只在推演模式下生效
                if (e.target.closest('.phase-icon-btn') || e.target.closest('img[data-cachekey]')) return;
                const card = e.target.closest('.upgrade-card');
                if (card) handleSimCardClick(card);
            });
        }
        // 道具推演：点击总览区钟楼启动（冷却归零时可用）
        const helperOverview = document.getElementById('helper-overview');
        if (helperOverview) {
            helperOverview.addEventListener('click', function(e) {
                if (!sim.active) return;
                if (e.target.closest('[data-sim-clock]')) activateClockTower();
            });
        }
        // 道具推演入口（时间搜索键左侧）；推演中再点 = 退出
        const simBtn = document.getElementById('sim-entry-btn');
        if (simBtn) simBtn.addEventListener('click', enterSim);
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
            // 助手阶段图标点击气泡提示（委托，slide 克隆后模板绑定不复制）
            displayArea.addEventListener('click', function(e) {
                const btn = e.target.closest('.phase-icon-btn');
                if (btn) handlePhaseTooltip({ currentTarget: btn });
            });

            // builderBoost 10x/24x 切换（点击图标切换；委托到 displayArea）
            displayArea.addEventListener('click', function(e) {
                if (!e.target.closest('#builder-boost-toggle')) return;
                if (!state.currentAccount || !accounts[state.currentAccount]) return;
                const data = accounts[state.currentAccount];
                if (!settings.builderBoostMode24) settings.builderBoostMode24 = {};
                const current = settings.builderBoostMode24[data.tag] || false;
                settings.builderBoostMode24[data.tag] = !current;
                saveSettings();
                updateBuilderBoostToggle(data);
                // 倍率影响完成时间计算：立即重渲染卡片（data-completion 重算）+ 重调度通知，不等切换页面
                refreshCurrentAccountDisplay();
                try {
                    const svc = CocTool.features.services;
                    if (svc && svc.pushSchedule) svc.pushSchedule();
                } catch (e) {}
            });

            // 建筑工人月卡图标点击 → 弹窗（委托到 displayArea）
            displayArea.addEventListener('click', function(e) {
                if (!e.target.closest('#builder-monthly-pass-icon')) return;
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
                    const items = calc.filterDismissedCategories(calc.extractUpgradingItems(data, Math.floor(Date.now() / 1000), true), data.tag);
                    const counts = calc.getCategoryCounts(items);
                    const denominators = calc.getCategoryDenominators(data);
                    const completed = calc.getCategoryCompletedCounts(items, data);
                    updateCategorySummary(counts, denominators, completed);
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
                    const items = calc.filterDismissedCategories(calc.extractUpgradingItems(data, Math.floor(Date.now() / 1000), true), data.tag);
                    const counts = calc.getCategoryCounts(items);
                    const denominators = calc.getCategoryDenominators(data);
                    const completed = calc.getCategoryCompletedCounts(items, data);
                    updateCategorySummary(counts, denominators, completed);
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
        // 按当前账号类目屏蔽过滤：被屏蔽分类从升级列表消失（分组 count=0 自动隐藏），总览列由 updateCategorySummary 切灰态
        const upgradingItems = calc.filterDismissedCategories(calc.extractUpgradingItems(data, Math.floor(Date.now() / 1000), true), data.tag);
        displayUpgradingItems(upgradingItems, data);
        const counts = calc.getCategoryCounts(upgradingItems);
        const denominators = calc.getCategoryDenominators(data);
        const completed = calc.getCategoryCompletedCounts(upgradingItems, data);
        updateCategorySummary(counts, denominators, completed);
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
        simActive: () => sim.active,
        exitSimIfActive: () => { if (sim.active) exitSim(false); },   // 切出首页时自动退出推演（core.showPage 调用）
        simDebug: () => sim.copy ? JSON.parse(JSON.stringify(sim.copy)) : null,   // 诊断导出（探针用）：推演副本当前状态
        openPokedexViaOverview, // 统一「直达图鉴」链路（首页图标/时间搜索结果共用）
        refresh: refreshCurrentAccountDisplay,
        tick: updateTimersOnly,
        calculateCompletionTimestamp: calc.calculateCompletionTimestamp,
        extractUpgradingItems: calc.extractUpgradingItems,
        getItemName: calc.getItemName,
        formatRemainingTime: calc.formatRemainingTime,
        formatExportTime: calc.formatExportTime,
        escapeHtml: calc.escapeHtml,
        filterDismissedCategories: calc.filterDismissedCategories,
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
