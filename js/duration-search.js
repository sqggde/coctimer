(function (global) {
    'use strict';

    const CocTool = global.CocTool;
    if (!CocTool) {
        throw new Error('duration-search.js requires core.js');
    }

    const HOME_CATS = ['buildings', 'heroes', 'traps', 'guardians', 'pets', 'units', 'spells', 'siege_machines'];
    const BUILDER_CATS = ['buildings2', 'heroes2', 'traps2', 'units2'];
    // 筛选组按 tab：主世界 全部/工人/实验室/战宠；夜世界 全部/工人/星空实验室（按升级占用划分）
    const FILTER_GROUPS = {
        home: {
            all: null,
            worker: ['defense_buildings', 'traps', 'resources', 'army', 'other', 'town_hall', 'research', 'wall', 'heroes', 'guardians'],
            lab: ['units', 'spells', 'siege_machines'],
            pet: ['pets']
        },
        builder: {
            all: null,
            worker: ['defenses2', 'traps2', 'resources2', 'army2', 'other2', 'wall2', 'buildings2', 'heroes2'],
            lab: ['units2']
        }
    };
    const FILTER_LABELS = {
        home: { all: '全部', worker: '工人', lab: '实验室', pet: '战宠' },
        builder: { all: '全部', worker: '工人', lab: '星空实验室' }
    };
    // 目标资源筛选（按 tab：主世界 金币/圣水/黑油；夜世界 金币/圣水）
    const RESOURCE_LABELS = {
        home: { all: '所有', gold: '金币', elixir: '圣水', dark: '黑油' },
        builder: { all: '所有', gold: '金币', elixir: '圣水' }
    };

    const indexCache = { intl: null, cn: null };

    function buildIdIndex(meta) {
        const index = new Map();
        if (!meta) return index;
        Object.keys(meta).forEach(cat => {
            const section = meta[cat];
            if (!section || !section.levels || !section.times) return;
            Object.keys(section.levels).forEach(id => {
                index.set(id, { cat: cat, maxLevel: section.levels[id], times: section.times[id], thReq: (section.thReq && section.thReq[id]) || null, resources: (section.resources && section.resources[id]) || null, instances: (section.instances && section.instances[id]) || null });
            });
        });
        return index;
    }

    // 成本资源归一化：gold/elixir/dark/flex（弹性二选一）/null（宝石等不可筛选）
    function normalizeResource(raw) {
        if (!raw) return null;
        const r = String(raw).toLowerCase();
        if (r.indexOf(' or ') !== -1) return 'flex';
        if (r.indexOf('dark') !== -1) return 'dark';
        if (r.indexOf('gold') !== -1) return 'gold';
        if (r.indexOf('elixir') !== -1) return 'elixir';
        return null;
    }

    // 短码匹配（构建期归一化：g=金币 e=圣水 d=黑油 f=弹性 x=不可筛选）
    const RES_CODES = { gold: 'g', elixir: 'e', dark: 'd' };
    function matchesResource(code, filter) {
        if (filter === 'all' || filter === null || filter === undefined) return true;
        if (!code || code === 'x') return false;
        if (code === RES_CODES[filter]) return true;
        if (code === 'f' && (filter === 'gold' || filter === 'elixir')) return true;
        return false;
    }

    function getThLevel(data, accountCat, id) {
        const list = data && data[accountCat];
        if (!Array.isArray(list)) return null;
        const found = list.find(b => b && b.data === id);
        return found ? (found.lvl || null) : null;
    }

    function parseThReq(thReq, lv) {
        const i = (lv - 1) * 2;
        if (!thReq || i + 2 > thReq.length) return 0;
        return parseInt(thReq.substr(i, 2), 10) || 0;
    }

    function getIndexForAccount(data) {
        const isCn = CocTool.calc && CocTool.calc.isCnAccount ? CocTool.calc.isCnAccount(data) : false;
        const key = isCn ? 'cn' : 'intl';
        if (!indexCache[key]) {
            indexCache[key] = buildIdIndex(global[key === 'cn' ? 'PROGRESS_META_CN' : 'PROGRESS_META_INTL']);
        }
        return indexCache[key];
    }

    function searchUpgrades(data, idIndex, hour, tab, filter, order, resource, discount) {
        const grouped = {};
        if (!data || !idIndex) return [];
        const allowed = (FILTER_GROUPS[tab] && FILTER_GROUPS[tab][filter]) || null;
        const cats = tab === 'builder' ? BUILDER_CATS : HOME_CATS;
        // 大本限制：下一级升级的大本/工坊要求超过账号当前等级 → 当前不可升级，排除（找不到记录则不限制）
        const thLevel = tab === 'builder'
            ? getThLevel(data, 'buildings2', 1000034)
            : getThLevel(data, 'buildings', 1000001);
        cats.forEach(cat => {
            const list = data[cat];
            if (!Array.isArray(list)) return;
            list.forEach(item => {
                if (!item || item.data === undefined) return;
                if (item.timer > 0) return;
                if (item.gear_up === 0) return;
                const entry = idIndex.get(String(item.data));
                if (!entry) return;
                const lvl = item.lvl || 0;
                if (lvl + 1 > entry.maxLevel) return;
                if (thLevel !== null && parseThReq(entry.thReq, lvl + 1) > thLevel) return;
                if (allowed && allowed.indexOf(entry.cat) === -1) return;
                const res = entry.resources ? entry.resources[lvl] : undefined;
                if (!matchesResource(res, resource)) return;
                // times[lv] = 升到 lv 级前累计（0 基，前两项恒 0）；当前 lvl → 升到 lvl+1 级耗时 = times[lvl+2]-times[lvl+1]
                // 数量型实体（instances）times = 实例累计前缀 [0, t1, t1+t2, ...]，lvl 0 基 → 建第 lvl+1 座耗时 = times[lvl+1]-times[lvl]
                const isInst = !!entry.instances;
                const t1 = entry.times[isInst ? lvl : lvl + 1];
                const t2 = entry.times[isInst ? lvl + 1 : lvl + 2];
                if (t1 === undefined || t2 === undefined) return;
                const seconds = t2 - t1;
                if (seconds <= 0) return;
                // 月卡折扣：所有时间 ×(1-折扣/100)，小时匹配与显示均用扣减后时间
                const eff = discount ? Math.round(seconds * (1 - discount / 100)) : seconds;
                if (hour !== null && hour !== undefined && Math.floor(eff / 3600) % 24 !== hour) return;
                const key = String(item.data) + '_' + lvl;
                const inst = item.cnt || 1;
                if (grouped[key]) {
                    grouped[key].count += inst;
                } else {
                    grouped[key] = { id: String(item.data), cat: entry.cat, accountCat: cat, lvl: lvl, nextLvl: lvl + 1, seconds: eff, count: inst };
                }
            });
        });
        const results = Object.keys(grouped).map(k => grouped[k]);
        const names = (CocTool.names && CocTool.names.ITEM_NAMES) || {};
        const dir = order === 'desc' ? -1 : 1;
        results.sort((a, b) => {
            if (a.seconds !== b.seconds) return (a.seconds - b.seconds) * dir;
            const na = names[a.id] || a.id;
            const nb = names[b.id] || b.id;
            return (na.localeCompare(nb, 'zh') || a.id.localeCompare(b.id)) * dir;
        });
        return results;
    }

    const uiState = { tab: 'home', hour: 12, filter: 'all', resource: 'all', discount: 0, futureHours: null, mode: 'allDesc' };
    const ALL_BUTTON_LABELS = { search: '所有可升级项', allAsc: '所有可升级项↓', allDesc: '所有可升级项↑' };
    const DISCOUNT_OPTIONS = [0, 5, 10, 15, 20];
    const MAX_ROWS = 500;
    // 弹窗所有选择持久化（tab/hour/filter/resource/futureHours/mode 全局偏好；discount 仍按账号走 clash_upgrade_discount）
    const DS_STATE_KEY = 'clash_ds_state';

    function loadDsState() {
        try {
            const s = JSON.parse(global.localStorage.getItem(DS_STATE_KEY) || '{}');
            return {
                tab: s.tab === 'builder' ? 'builder' : 'home',
                hour: (typeof s.hour === 'number' && s.hour >= 0 && s.hour <= 23) ? s.hour : 12,
                filter: typeof s.filter === 'string' ? s.filter : 'all',
                resource: typeof s.resource === 'string' ? s.resource : 'all',
                futureHours: (typeof s.futureHours === 'number' && s.futureHours > 0) ? s.futureHours : null,
                mode: ['search', 'allAsc', 'allDesc'].includes(s.mode) ? s.mode : 'allDesc'
            };
        } catch (e) { return null; }
    }

    function saveDsState() {
        try {
            global.localStorage.setItem(DS_STATE_KEY, JSON.stringify({
                tab: uiState.tab, hour: uiState.hour, filter: uiState.filter,
                resource: uiState.resource, futureHours: uiState.futureHours, mode: uiState.mode
            }));
        } catch (e) {}
    }

    function formatDuration(seconds) {
        if (seconds <= 0) return '0秒';
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        let text = '';
        if (d > 0) text += d + '天';
        if (h > 0) text += h + '时';
        if (m > 0) text += m + '分';
        if (s > 0) text += s + '秒';
        return text || '不足1秒';
    }

    function currentAccountData() {
        return CocTool.state && CocTool.state.currentAccount && CocTool.state.accounts
            ? CocTool.state.accounts[CocTool.state.currentAccount] : null;
    }

    // 月卡折扣：与总进度详情页共用 clash_upgrade_discount（按账号记忆 0|5|10|15|20 百分数）
    function getAccountDiscount() {
        try {
            const tag = CocTool.state && CocTool.state.currentAccount;
            if (!tag) return 0;
            const m = JSON.parse(global.localStorage.getItem('clash_upgrade_discount') || '{}');
            const v = parseInt(m[tag], 10);
            return (v === 5 || v === 10 || v === 15 || v === 20) ? v : 0;
        } catch (e) { return 0; }
    }

    function saveAccountDiscount(pct) {
        try {
            const tag = CocTool.state && CocTool.state.currentAccount;
            if (!tag) return;
            const m = JSON.parse(global.localStorage.getItem('clash_upgrade_discount') || '{}');
            m[tag] = (pct === 5 || pct === 10 || pct === 15 || pct === 20) ? pct : 0;
            global.localStorage.setItem('clash_upgrade_discount', JSON.stringify(m));
        } catch (e) {}
    }

    function discountButtons() {
        return DISCOUNT_OPTIONS.map(p =>
            '<div class="ov-disc-opt' + (p === uiState.discount ? ' active' : '') + '" data-ds-disc="' + p + '">' + p + '%</div>'
        ).join('');
    }

    function applyDiscountStyles(modal) {
        const val = modal.querySelector('[data-ds-disc-val]');
        if (val) val.textContent = uiState.discount + '%';
        modal.querySelectorAll('[data-ds-disc]').forEach(opt => {
            const active = parseInt(opt.getAttribute('data-ds-disc'), 10) === uiState.discount;
            opt.className = 'ov-disc-opt' + (active ? ' active' : '');
        });
        const menu = modal.querySelector('[data-ds-disc-menu]');
        if (menu) menu.style.display = 'none';
    }

    // 几小时后推算：基于当前时间（24 小时制，跨天取模，精确到分）
    function futureResultText() {
        if (uiState.futureHours === null) return '—';
        const now = new Date();
        const total = now.getHours() * 60 + now.getMinutes() + uiState.futureHours * 60;
        const h = Math.floor(total / 60) % 24;
        const m = total % 60;
        return m === 0 ? h + '点' : h + '点' + m + '分';
    }

    function applyFutureStyles(modal) {
        const check = modal.querySelector('[data-ds-future-check]');
        if (check) check.textContent = uiState.futureHours === null ? '' : uiState.futureHours;
        const result = modal.querySelector('[data-ds-future-result]');
        if (result) result.textContent = futureResultText();
        const panel = modal.querySelector('[data-ds-future-panel]');
        if (panel) panel.classList.add('hidden');
    }

    function futureHourButtons() {
        let html = '';
        for (let h = 0; h < 24; h++) {
            html += '<button data-ds-future-hour="' + h + '" class="px-2 py-1 rounded-lg text-sm ' +
                (h === uiState.futureHours ? 'bg-primary text-white' : 'bg-gray-200 text-gray-700') + '">' + h + '</button>';
        }
        return html;
    }

    function hourButtons() {
        let html = '';
        for (let h = 0; h < 24; h++) {
            html += '<button data-ds-hour="' + h + '" class="px-2 py-1 rounded-lg text-sm ' +
                (h === uiState.hour ? 'bg-primary text-white' : 'bg-gray-200 text-gray-700') + '">' + h + '</button>';
        }
        return html;
    }

    function applyHourStyles(modal) {
        // 目标时间模式下显示所选小时；全部模式下显示 "-"
        const label = modal.querySelector('[data-ds-hour-label]');
        if (label) label.textContent = uiState.mode === 'search' ? uiState.hour : '-';
        modal.querySelectorAll('[data-ds-hour]').forEach(btn => {
            const active = parseInt(btn.getAttribute('data-ds-hour'), 10) === uiState.hour;
            btn.className = 'px-1 py-1 rounded-lg text-sm ' +
                (active ? 'bg-primary text-white' : 'bg-gray-200 text-gray-700');
        });
        const panel = modal.querySelector('[data-ds-hour-panel]');
        if (panel) panel.classList.add('hidden');
    }

    function filterButtons() {
        const labels = FILTER_LABELS[uiState.tab] || FILTER_LABELS.home;
        return Object.keys(labels).map(key =>
            '<button data-ds-filter="' + key + '" class="ds-filter flex-1 px-2 py-1 rounded-lg text-sm ' +
            (key === uiState.filter ? 'bg-primary text-white' : 'bg-gray-200 text-gray-700') + '">' +
            labels[key] + '</button>'
        ).join('');
    }

    function rebuildFilterRow(modal) {
        const row = modal.querySelector('[data-ds-filter-row]');
        if (row) row.innerHTML = filterButtons();
    }

    function resourceOptions() {
        const labels = RESOURCE_LABELS[uiState.tab] || RESOURCE_LABELS.home;
        return Object.keys(labels).map(key =>
            '<button data-ds-res="' + key + '" class="ds-res flex-1 px-2 py-1 rounded-lg text-sm ' +
            (key === uiState.resource ? 'bg-primary text-white' : 'bg-gray-200 text-gray-700') + '">' +
            labels[key] + '</button>'
        ).join('');
    }

    function rebuildResOptions(modal) {
        const opts = modal.querySelector('[data-ds-res-options]');
        if (opts) opts.innerHTML = resourceOptions();
    }

    function applyResStyles(modal) {
        const label = modal.querySelector('[data-ds-res-label]');
        if (label) {
            const labels = RESOURCE_LABELS[uiState.tab] || RESOURCE_LABELS.home;
            label.textContent = labels[uiState.resource] || labels.all;
        }
        modal.querySelectorAll('[data-ds-res]').forEach(btn => {
            const active = btn.getAttribute('data-ds-res') === uiState.resource;
            btn.className = 'ds-res flex-1 px-2 py-1 rounded-lg text-sm ' +
                (active ? 'bg-primary text-white' : 'bg-gray-200 text-gray-700');
        });
        const panel = modal.querySelector('[data-ds-res-panel]');
        if (panel) panel.classList.add('hidden');
    }

    function buildModal() {
        const modal = document.createElement('div');
        modal.id = 'duration-search-modal';
        modal.className = 'modal-overlay hidden';
        modal.innerHTML =
            '<div class="modal-card w-lg" style="max-height:80vh;display:flex;flex-direction:column;">' +
            '<div class="flex items-center mb-2">' +
            '<h3 class="font-semibold text-gray-800" style="font-size:15px;"><i class="fa fa-clock-o mr-1 text-primary"></i>升级时长搜索</h3>' +
            '<div class="ov-disc-wrap" style="margin-left:10px;align-self:center;">' +
            '<button data-ds-disc-toggle class="ov-disc-btn" title="升级时间折扣">' +
            '<img src="img/icons/icon_goldmodel.webp" class="ov-disc-icon" onerror="this.style.display=\'none\'">' +
            '<span data-ds-disc-val class="ov-disc-val">' + uiState.discount + '%</span>' +
            '</button>' +
            '<div data-ds-disc-menu class="ov-disc-menu" style="display:none;">' + discountButtons() + '</div>' +
            '</div>' +
            '<button data-ds-close class="ml-auto text-gray-500 hover:text-gray-700 p-1"><i class="fa fa-times text-lg"></i></button>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">' +
            '<div style="position:relative;">' +
            '<button data-ds-future-toggle class="w-6 h-6 flex items-center justify-center rounded" style="border:1.5px solid #9ca3af;color:#3b82f6;font-size:14px;line-height:1;background:#ffffff;" title="选择几小时后">' +
            '<span data-ds-future-check>' + (uiState.futureHours === null ? '' : '✓') + '</span>' +
            '</button>' +
            '<div data-ds-future-panel class="hidden bg-white border border-gray-300" style="position:absolute;top:calc(100% + 4px);left:0;min-width:224px;z-index:30;border-radius:8px;padding:6px;box-shadow:0 4px 12px rgba(0,0,0,.12);">' +
            '<div class="grid" style="grid-template-columns:repeat(4,1fr);gap:4px;">' + futureHourButtons() + '</div>' +
            '</div>' +
            '</div>' +
            '<span class="text-sm text-gray-600">小时后</span>' +
            '<span data-ds-future-result class="text-sm font-medium text-primary">' + futureResultText() + '</span>' +
            '</div>' +
            '<div style="display:flex;gap:6px;margin-bottom:8px;">' +
            '<button data-ds-tab="home" class="ds-tab flex-1 px-2 py-1 rounded-lg text-sm bg-primary text-white">主世界</button>' +
            '<button data-ds-tab="builder" class="ds-tab flex-1 px-2 py-1 rounded-lg text-sm bg-gray-200 text-gray-700">夜世界</button>' +
            '</div>' +
            '<div style="display:flex;gap:8px;margin-bottom:8px;">' +
            '<div style="flex:1;">' +
            '<span class="text-sm text-gray-600" style="display:block;margin-bottom:4px;">目标小时</span>' +
            '<div style="position:relative;">' +
            '<button data-ds-hour-toggle class="w-full flex items-center justify-between px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-800">' +
            '<span data-ds-hour-label>' + uiState.hour + '</span><i class="fa fa-chevron-down text-xs text-gray-500"></i>' +
            '</button>' +
            '<div data-ds-hour-panel class="hidden bg-white border border-gray-300" style="position:absolute;top:calc(100% + 4px);left:0;right:0;min-width:224px;z-index:30;border-radius:8px;padding:6px;box-shadow:0 4px 12px rgba(0,0,0,.12);">' +
            '<div class="grid" style="grid-template-columns:repeat(4,1fr);gap:4px;">' + hourButtons() + '</div>' +
            '</div>' +
            '</div>' +
            '</div>' +
            '<div style="flex:1;">' +
            '<span class="text-sm text-gray-600" style="display:block;margin-bottom:4px;">目标资源</span>' +
            '<div style="position:relative;">' +
            '<button data-ds-res-toggle class="w-full flex items-center justify-between px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-800">' +
            '<span data-ds-res-label>' + (RESOURCE_LABELS[uiState.tab] || RESOURCE_LABELS.home).all + '</span><i class="fa fa-chevron-down text-xs text-gray-500"></i>' +
            '</button>' +
            '<div data-ds-res-panel class="hidden bg-white border border-gray-300" style="position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:30;border-radius:8px;padding:6px;box-shadow:0 4px 12px rgba(0,0,0,.12);">' +
            '<div data-ds-res-options style="display:flex;gap:4px;">' + resourceOptions() + '</div>' +
            '</div>' +
            '</div>' +
            '</div>' +
            '</div>' +
            '<div data-ds-filter-row style="display:flex;gap:6px;margin-bottom:8px;">' + filterButtons() + '</div>' +
            '<button data-ds-all class="w-full px-2 py-1.5 rounded-lg text-sm mb-2 bg-gray-100 text-gray-700">' + ALL_BUTTON_LABELS[uiState.mode] + '</button>' +
            '<div data-ds-results class="overflow-y-auto" style="flex:1;min-height:120px;max-height:45vh;"></div>' +
            '</div>';
        modal.addEventListener('click', function (e) {
            const closeBtn = e.target.closest('[data-ds-close]');
            if (closeBtn) {
                modal.classList.add('hidden');
                return;
            }
            if (e.target === modal) {
                modal.classList.add('hidden');
                return;
            }
            const panel = modal.querySelector('[data-ds-hour-panel]');
            if (panel && !panel.classList.contains('hidden') &&
                !e.target.closest('[data-ds-hour-panel]') && !e.target.closest('[data-ds-hour-toggle]')) {
                panel.classList.add('hidden');
            }
            const resPanel = modal.querySelector('[data-ds-res-panel]');
            if (resPanel && !resPanel.classList.contains('hidden') &&
                !e.target.closest('[data-ds-res-panel]') && !e.target.closest('[data-ds-res-toggle]')) {
                resPanel.classList.add('hidden');
            }
            const discMenu = modal.querySelector('[data-ds-disc-menu]');
            if (discMenu && discMenu.style.display !== 'none' &&
                !e.target.closest('[data-ds-disc-menu]') && !e.target.closest('[data-ds-disc-toggle]')) {
                discMenu.style.display = 'none';
            }
            const futurePanel = modal.querySelector('[data-ds-future-panel]');
            if (futurePanel && !futurePanel.classList.contains('hidden') &&
                !e.target.closest('[data-ds-future-panel]') && !e.target.closest('[data-ds-future-toggle]')) {
                futurePanel.classList.add('hidden');
            }
            const futureToggle = e.target.closest('[data-ds-future-toggle]');
            if (futureToggle) {
                modal.querySelector('[data-ds-future-panel]').classList.toggle('hidden');
                return;
            }
            const futureHour = e.target.closest('[data-ds-future-hour]');
            if (futureHour) {
                uiState.futureHours = parseInt(futureHour.getAttribute('data-ds-future-hour'), 10) || 0;
                saveDsState();
                applyFutureStyles(modal);
                return;
            }
            const discToggle = e.target.closest('[data-ds-disc-toggle]');
            if (discToggle) {
                const dm = modal.querySelector('[data-ds-disc-menu]');
                dm.style.display = dm.style.display === 'none' ? '' : 'none';
                return;
            }
            const discOpt = e.target.closest('[data-ds-disc]');
            if (discOpt) {
                uiState.discount = parseInt(discOpt.getAttribute('data-ds-disc'), 10) || 0;
                saveAccountDiscount(uiState.discount);
                applyDiscountStyles(modal);
                renderResults(modal);
                return;
            }
            const hourToggle = e.target.closest('[data-ds-hour-toggle]');
            if (hourToggle) {
                modal.querySelector('[data-ds-hour-panel]').classList.toggle('hidden');
                return;
            }
            const hourBtn = e.target.closest('[data-ds-hour]');
            if (hourBtn) {
                uiState.hour = parseInt(hourBtn.getAttribute('data-ds-hour'), 10) || 0;
                uiState.mode = 'search';
                saveDsState();
                applyHourStyles(modal);
                applyAllButton(modal);
                renderResults(modal);
                return;
            }
            const resToggle = e.target.closest('[data-ds-res-toggle]');
            if (resToggle) {
                modal.querySelector('[data-ds-res-panel]').classList.toggle('hidden');
                return;
            }
            const resBtn = e.target.closest('[data-ds-res]');
            if (resBtn) {
                uiState.resource = resBtn.getAttribute('data-ds-res');
                saveDsState();
                applyResStyles(modal);
                applyAllButton(modal);
                renderResults(modal);
                return;
            }
            const tabBtn = e.target.closest('[data-ds-tab]');
            if (tabBtn) {
                uiState.tab = tabBtn.getAttribute('data-ds-tab');
                if (!FILTER_GROUPS[uiState.tab] || !FILTER_GROUPS[uiState.tab][uiState.filter]) {
                    uiState.filter = 'all';
                }
                if (!RESOURCE_LABELS[uiState.tab] || !RESOURCE_LABELS[uiState.tab][uiState.resource]) {
                    uiState.resource = 'all';
                }
                saveDsState();
                applyTabStyles(modal);
                rebuildFilterRow(modal);
                applyFilterStyles(modal);
                rebuildResOptions(modal);
                applyResStyles(modal);
                renderResults(modal);
                return;
            }
            const filterBtn = e.target.closest('[data-ds-filter]');
            if (filterBtn) {
                uiState.filter = filterBtn.getAttribute('data-ds-filter');
                saveDsState();
                applyFilterStyles(modal);
                renderResults(modal);
                return;
            }
            const allBtn = e.target.closest('[data-ds-all]');
            if (allBtn) {
                cycleAllButton(modal);
                return;
            }
        });
        return modal;
    }

    function applyTabStyles(modal) {
        modal.querySelectorAll('[data-ds-tab]').forEach(btn => {
            const active = btn.getAttribute('data-ds-tab') === uiState.tab;
            btn.className = 'ds-tab flex-1 px-2 py-1 rounded-lg text-sm ' +
                (active ? 'bg-primary text-white' : 'bg-gray-200 text-gray-700');
        });
    }

    function applyFilterStyles(modal) {
        modal.querySelectorAll('[data-ds-filter]').forEach(btn => {
            const active = btn.getAttribute('data-ds-filter') === uiState.filter;
            btn.className = 'ds-filter flex-1 px-2 py-1 rounded-lg text-sm ' +
                (active ? 'bg-primary text-white' : 'bg-gray-200 text-gray-700');
        });
    }

    function applyAllButton(modal) {
        const btn = modal.querySelector('[data-ds-all]');
        if (!btn) return;
        btn.textContent = ALL_BUTTON_LABELS[uiState.mode];
        const active = uiState.mode === 'allAsc' || uiState.mode === 'allDesc';
        btn.className = 'w-full px-2 py-1.5 rounded-lg text-sm mb-2 ' +
            (active ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-700');
    }

    function cycleAllButton(modal) {
        // 仅 ↑↓ 切换；目标时间模式点按进入全部降序
        uiState.mode = uiState.mode === 'allDesc' ? 'allAsc' : 'allDesc';
        saveDsState();
        applyAllButton(modal);
        applyHourStyles(modal);
        renderResults(modal);
    }

    function rowHtml(item) {
        const names = (CocTool.names && CocTool.names.ITEM_NAMES) || {};
        const name = names[item.id] || ('未知(' + item.id + ')');
        let iconHtml = '<i class="fa fa-cube text-primary" style="font-size:16px;"></i>';
        try {
            if (CocTool.calc && CocTool.calc.getItemIconUrl) {
                const urls = CocTool.calc.getItemIconUrl({ data: item.id, lvl: item.lvl, category: item.accountCat });
                if (urls && urls.length) {
                    iconHtml = '<img src="' + urls[0] + '" width="24" height="24" class="object-contain" alt="" data-fallback="' + urls.slice(1).join(',') + '" onerror="this.onerror=null;var f=this.getAttribute(\'data-fallback\');if(f){var c=f.split(\',\');if(c.length){this.src=c.shift();this.setAttribute(\'data-fallback\',c.join(\',\'));}}else{this.style.display=\'none\';}">';
                }
            }
        } catch (e) { /* 图标失败用 fa 兜底 */ }
        const countHtml = item.count > 1
            ? '<span class="text-xs text-gray-500 flex-shrink-0" style="background:#e5e7eb;border-radius:999px;padding:0 6px;">×' + item.count + '</span>'
            : '';
        return '<div class="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-50 mb-0.5">' +
            '<div class="w-6 h-6 flex items-center justify-center flex-shrink-0">' + iconHtml + '</div>' +
            '<span class="text-sm text-gray-800 flex-1 truncate">' + name + '</span>' +
            countHtml +
            '<span class="text-xs text-gray-500 flex-shrink-0">等级 ' + item.lvl + '→' + item.nextLvl + '</span>' +
            '<span class="text-sm font-medium text-primary flex-shrink-0" style="min-width:70px;text-align:right;">' +
            formatDuration(item.seconds) + '</span>' +
            '</div>';
    }

    function renderResults(modal) {
        const container = modal.querySelector('[data-ds-results]');
        if (!container) return;
        const data = currentAccountData();
        if (!data) {
            container.innerHTML = '<p class="text-sm text-gray-500 text-center py-6">请先导入账号数据</p>';
            return;
        }
        const isAll = uiState.mode === 'allAsc' || uiState.mode === 'allDesc';
        const order = uiState.mode === 'allDesc' ? 'desc' : 'asc';
        const hour = isAll ? null : uiState.hour;
        const list = searchUpgrades(data, getIndexForAccount(data), hour, uiState.tab, uiState.filter, order, uiState.resource, uiState.discount);
        if (!list.length) {
            container.innerHTML = '<p class="text-sm text-gray-500 text-center py-6">无匹配升级项</p>';
            return;
        }
        const shown = list.slice(0, MAX_ROWS);
        container.innerHTML = shown.map(rowHtml).join('') +
            (list.length > MAX_ROWS ? '<p class="text-xs text-gray-400 text-center py-2">仅显示前 ' + MAX_ROWS + ' 条（共 ' + list.length + ' 条）</p>' : '');
    }

    function openSearchModal() {
        const data = currentAccountData();
        if (!data) {
            if (CocTool.ui && CocTool.ui.showToast) CocTool.ui.showToast('请先导入账号数据', 1500);
            return;
        }
        let modal = document.getElementById('duration-search-modal');
        if (!modal) {
            modal = buildModal();
            document.body.appendChild(modal);
        }
        // 恢复持久化选择（tab/hour/filter/resource/futureHours/mode）
        const savedState = loadDsState();
        if (savedState) Object.assign(uiState, savedState);
        uiState.discount = getAccountDiscount();
        applyTabStyles(modal);
        applyFilterStyles(modal);
        applyHourStyles(modal);
        rebuildResOptions(modal);
        applyResStyles(modal);
        applyDiscountStyles(modal);
        applyFutureStyles(modal);
        applyAllButton(modal);
        modal.classList.remove('hidden');
        renderResults(modal);
    }

    function init() {
        const btn = document.getElementById('duration-search-btn');
        if (btn) btn.addEventListener('click', openSearchModal);
        setInterval(function () {
            const modal = document.getElementById('duration-search-modal');
            if (modal && !modal.classList.contains('hidden') && uiState.futureHours !== null) {
                const result = modal.querySelector('[data-ds-future-result]');
                if (result) result.textContent = futureResultText();
            }
        }, 60000);
    }

    CocTool.durationSearch = {
        init: init,
        openSearchModal: openSearchModal,
        buildIdIndex: buildIdIndex,
        searchUpgrades: searchUpgrades,
        getIndexForAccount: getIndexForAccount,
        normalizeResource: normalizeResource,
        matchesResource: matchesResource,
        formatDuration: formatDuration
    };
})(window);
