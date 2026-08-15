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
        image.nextElementSibling.style.display = 'flex';
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
                const remainFmt = calc.formatRemainingTime(remainingSec);
                const doneTimeFmt = calc.formatDoneTime(completionTs);
                const name = calc.getItemName(item.data);
                const originCat = CocTool.names.CATEGORY_NAMES[item.category] || item.category;
                const icon = CocTool.names.CATEGORY_ICONS[item.category] || "fa-question";
                let textColor = 'text-primary', borderClr = 'border-primary';
                if (remainingSec <= 0) { textColor = 'text-success'; borderClr = 'border-success'; }
                else if (remainingSec < 1800) { textColor = 'text-danger_red'; borderClr = 'border-danger_red'; }
                else if (remainingSec < 3600) { textColor = 'text-warning_orangered'; borderClr = 'border-warning_orangered'; }
                else if (remainingSec < 14400) { textColor = 'text-warning_orange'; borderClr = 'border-warning_orange'; }
                else if (remainingSec < 28800) { textColor = 'text-warning_yellow'; borderClr = 'border-warning_yellow'; }
                const card = document.createElement('div');
                card.style.minHeight = '46px';
                card.className = `upgrade-card bg-gray-50 rounded-lg p-1 border-l-4 border-r-4 ${borderClr} flex items-center justify-between ${remainingSec <= 0 ? 'cursor-pointer' : ''}${calc.isInSleepRange(completionTs) ? ' sleep-highlight' : ''}`;
                card.setAttribute('data-unique', item.uniqueId);
                card.setAttribute('data-completion', completionTs);
                card.setAttribute('data-cat', item.category);
                card.setAttribute('data-item-id', item.data);
                card.setAttribute('data-item-timer', item.timer);
                card.setAttribute('data-item-lvl', item.lvl);
                if (remainingSec <= 0) {
                    card.setAttribute('data-del-listener', '1');
                    card.addEventListener('click', () => {
                        if (confirm(`确认删除已完成项目「${name}」？`)) {
                            const cat = item.category;
                            const arr = data[cat];
                            if (arr && Array.isArray(arr)) {
                                const idx = arr.findIndex(a => a.data === item.data && a.timer === item.timer && a.lvl === item.lvl);
                                if (idx !== -1) {
                                    arr.splice(idx, 1);
                                    saveToLocalStorage();
                                    refreshCurrentAccountDisplay();
                                }
                            }
                        }
                    });
                }
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
                card.innerHTML = '<div class="flex items-center">' + iconHtml + '<div class="min-w-0"><h3 class="font-semibold text-gray-800" style="font-size:13px;">' + calc.escapeHtml(name) + phaseIcon + '</h3><p class="text-xs text-gray-500">' + catLine + ' · ' + lvLine + '</p></div></div><div class="text-right flex-shrink-0"><div class="text-sm ' + textColor + ' card-time-container" style="font-size:14px;font-weight:500;"><span class="card-remain">' + remainFmt + '</span></div><div class="text-xs text-gray-500">' + doneTimeFmt + '</div></div>';
                const iconImage = card.querySelector('img[data-cachekey]');
                if (iconImage) iconImage.addEventListener('error', handleIconError);
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
    const BORDER_COLORS = ['border-success','border-danger_red','border-warning_orangered','border-warning_orange','border-warning_yellow','border-primary'];
    function updateCardTimers() {
        const now = Date.now() / 1000;
        document.querySelectorAll('.upgrade-card').forEach(card => {
            const completionTs = parseFloat(card.getAttribute('data-completion'));
            if (isNaN(completionTs)) return;
            const remainingSec = Math.max(0, completionTs - now);
            const fmt = calc.formatRemainingTime(remainingSec);
            const remainSpan = card.querySelector('.card-remain');
            if (remainSpan && remainSpan.textContent !== fmt) remainSpan.textContent = fmt;

            // 更新文字颜色 + 边框颜色
            let textColor = 'text-primary', borderClr = 'border-primary';
            if (remainingSec <= 0) { textColor = 'text-success'; borderClr = 'border-success'; }
            else if (remainingSec < 1800) { textColor = 'text-danger_red'; borderClr = 'border-danger_red'; }
            else if (remainingSec < 3600) { textColor = 'text-warning_orangered'; borderClr = 'border-warning_orangered'; }
            else if (remainingSec < 14400) { textColor = 'text-warning_orange'; borderClr = 'border-warning_orange'; }
            else if (remainingSec < 28800) { textColor = 'text-warning_yellow'; borderClr = 'border-warning_yellow'; }
            const tc = card.querySelector('.card-time-container');
            if (tc) {
                tc.className = tc.className.replace(/\btext-\S+/g, '').trim() + ' ' + textColor + ' card-time-container';
            }
            BORDER_COLORS.forEach(cls => card.classList.remove(cls));
            card.classList.add(borderClr);

            // 更新睡眠高亮
            card.classList.toggle('sleep-highlight', calc.isInSleepRange(completionTs));

            // 更新完成项目的 cursor-pointer + 绑定删除事件
            if (remainingSec <= 0) {
                card.classList.add('cursor-pointer');
                if (!card.hasAttribute('data-del-listener')) {
                    card.setAttribute('data-del-listener', '1');
                    card.addEventListener('click', function () {
                        const cat = this.getAttribute('data-cat');
                        const id = this.getAttribute('data-item-id');
                        const timer = this.getAttribute('data-item-timer');
                        const lvl = this.getAttribute('data-item-lvl');
                        const nameEl = this.querySelector('.card-name');
                        const name = nameEl ? nameEl.textContent : '';
                        if (confirm('确认删除已完成项目「' + name + '」？')) {
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
                                    refreshCurrentAccountDisplay();
                                }
                            }
                        }
                    });
                }
            }
            else { card.classList.remove('cursor-pointer'); }
        });
    }

    // ========== 轻量定时刷新（每秒调用，不重建 DOM）==========
    function updateTimersOnly() {
        if (!state.currentAccount || !accounts[state.currentAccount]) return;
        const data = accounts[state.currentAccount];
        const nowTs = Math.floor(Date.now() / 1000);
        updateCardTimers();
        updateSortTimers();
        updateCurrentTime();
        const upgradingItems = calc.extractUpgradingItems(data, nowTs, true);
        updateCategorySummary(calc.getCategoryCounts(upgradingItems), calc.getCategoryDenominators(data), calc.getCategoryCompletedCounts(upgradingItems, data));
        updateBuilderBoostToggle(data);
        updateAllAccountTabColors();
        updateMainTitle();
        renderHelperOverview(data);
        updateBoostTimers(data);
        renderEventBoostSelector(data);
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
        const data = accounts[state.currentAccount];
        const upgradingItems = calc.extractUpgradingItems(data, Math.floor(Date.now() / 1000), true);
        displayUpgradingItems(upgradingItems, data);
        updateCategorySummary(calc.getCategoryCounts(upgradingItems), calc.getCategoryDenominators(data), calc.getCategoryCompletedCounts(upgradingItems, data));
        updateBuilderBoostToggle(data);
        updateAllAccountTabColors();
        updateMainTitle();
        renderHelperOverview(data); // 每秒更新助手/钟楼倒计时
        updateBoostTimers(data);
        renderEventBoostSelector(data);
    }

    // ========== 活动加速挡位选择器 ==========
    function renderEventBoostSelector(data) {
        const container = document.getElementById('event-boost-selector');
        if (!container) { console.log('[DBG] 容器null'); return; }

        console.log('[DBG] 时间', Math.floor(Date.now()/1000), 'END', calc.EVENT_END);
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
            const countEl = document.getElementById(cat.headingId);
            if (!countEl) return;
            // 查找或创建 boost-timer 元素（紧跟在 count 后面）
            let timerEl = countEl.nextElementSibling;
            if (timerEl && !timerEl.classList.contains('boost-timer')) timerEl = null;
            if (!timerEl) {
                timerEl = document.createElement('span');
                timerEl.className = 'boost-timer';
                timerEl.style.cssText = 'display:inline-flex;align-items:center;gap:2px;margin-left:6px';
                countEl.parentNode.insertBefore(timerEl, countEl.nextSibling);
            }

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
                    } else {
                        timeSpan.textContent = timeStr;
                    }
                } else {
                    timerEl.remove();
                }
            } else {
                timerEl.remove();
            }
        });
    }

    function updateCategorySummary(counts, denominators, completedCounts) {
        const card = document.getElementById('category-summary-card');
        if (!card) return;
        card.classList.remove('hidden');
        const keys = ['buildings', 'lab', 'pets', 'buildings2', 'units2'];
        keys.forEach(key => {
            const el = document.getElementById('summary-' + key);
            if (el) el.textContent = (counts[key] || 0) + '/' + (denominators[key] || 0);
            const greenBadge = document.getElementById('summary-badge-' + key);
            if (greenBadge) {
                const completed = (completedCounts && completedCounts[key]) || 0;
                if (completed > 0) {
                    greenBadge.textContent = '' + completed;
                    greenBadge.style.display = 'flex';
                } else {
                    greenBadge.style.display = 'none';
                }
            }
            const redBadge = document.getElementById('summary-badge-red-' + key);
            if (redBadge) {
                const c = counts[key] || 0;
                const d = denominators[key] || 0;
                const isDismissed = (sessionDismissedCategories[state.currentAccount] && sessionDismissedCategories[state.currentAccount][key]) || (settings.dismissedCategories && settings.dismissedCategories[state.currentAccount] && settings.dismissedCategories[state.currentAccount][key]);
                redBadge.style.opacity = (d === 0 || c >= d || isDismissed) ? '0' : '1';
            }
            const iconEl = document.getElementById('summary-icon-' + key);
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
        resetIconCache
    });
})(window);
