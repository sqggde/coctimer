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
                index.set(id, { cat: cat, maxLevel: section.levels[id], times: section.times[id], thReq: (section.thReq && section.thReq[id]) || null, resources: (section.resources && section.resources[id]) || null, instances: (section.instances && section.instances[id]) || null, caps: (section.caps && section.caps[id]) || null });
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

    // 数量型实体的「大本解锁座数」：caps = [[大本等级, 座数], ...] → 取当前大本可达座数
    // （与 overview-detail.thCap 同口径；无记录返回 null = 不限制）
    function capAtTh(caps, thLv) {
        if (!caps || !caps.length || thLv === null) return null;
        let best = null;
        for (let i = 0; i < caps.length; i++) {
            if (caps[i][0] <= thLv) best = caps[i]; else break;
        }
        return best ? best[1] : 0;
    }

    // 常规实体在当前大本可达的最高等级（thReq 紧凑串逐级求「所需大本 ≤ 当前大本」的最大 lv；
    // 与 overview-detail.thMaxLv 同口径，thReq 为 null = 不限制 → 满级）
    function thCapLevel(entry, thLv) {
        if (thLv === null || !entry.thReq) return entry.maxLevel;
        let max = 0;
        for (let lv = 1; lv <= entry.maxLevel; lv++) {
            const req = parseThReq(entry.thReq, lv);
            if (req === 0 || req <= thLv) max = lv; else break;
        }
        return max || 1;
    }

    function getIndexForAccount(data) {
        const isCn = CocTool.calc && CocTool.calc.isCnAccount ? CocTool.calc.isCnAccount(data) : false;
        const key = isCn ? 'cn' : 'intl';
        if (!indexCache[key]) {
            indexCache[key] = buildIdIndex(global[key === 'cn' ? 'PROGRESS_META_CN' : 'PROGRESS_META_INTL']);
        }
        return indexCache[key];
    }

    function searchUpgrades(data, idIndex, hour, tab, filter, order, resource, discount, progressMode) {
        // progressMode：'full' 满防（默认，「到满级」= meta 满级）| 'th' 当前大本（「到上限」= 当前大本可达最高级/座数；
        // 列表集合不变——下方 thReq 过滤本就只留当前大本升得动的项，差的只是终点等级/时长）
        const thMode = progressMode === 'th';
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
                // 数量型实体（夜世界兵营/预备营）：lvl 是建筑等级（每座恒 1 级），座数看 cnt
                // （与 buildUserLevelListMap 同口径：cnt 按座数、无 cnt 按 1 座）；「已建满」= 当前大本解锁座数
                // （caps，取不到退回实例总数）→ 建下一座 = times[owned+1]-times[owned]
                const isInst = !!entry.instances;
                const owned = isInst ? (Number(item.cnt) || 1) : 0;
                // 终点：th 模式取当前大本可达上限（座数/等级），满防模式取全量
                const capCount = isInst ? (capAtTh(entry.caps, thLevel) === null ? entry.instances : capAtTh(entry.caps, thLevel)) : 0;
                const capLv = isInst ? capCount : (thMode ? thCapLevel(entry, thLevel) : entry.maxLevel);
                if (isInst) {
                    if (owned >= capCount) return;
                } else if (lvl + 1 > capLv) return;
                if (!isInst && thLevel !== null && parseThReq(entry.thReq, lvl + 1) > thLevel) return;
                if (allowed && allowed.indexOf(entry.cat) === -1) return;
                const res = entry.resources ? entry.resources[isInst ? owned : lvl] : undefined;
                if (!matchesResource(res, resource)) return;
                // times[lv] = 升到 lv 级前累计（0 基，前两项恒 0）；当前 lvl → 升到 lvl+1 级耗时 = times[lvl+2]-times[lvl+1]
                // 数量型实体（instances）times = 实例累计前缀 [0, t1, t1+t2, ...]，建第 owned+1 座 = times[owned+1]-times[owned]
                const t1 = entry.times[isInst ? owned : lvl + 1];
                const t2 = entry.times[isInst ? owned + 1 : lvl + 2];
                if (t1 === undefined || t2 === undefined) return;
                const seconds = t2 - t1;
                if (seconds <= 0) return;
                // 到满级/到上限：当前等级 → 终点 的总耗时（同 times 前缀口径：常规 = times[终点+1]-times[lvl+1]；
                // 数量型实体 = times[终点座数]-times[已建座数]；数据异常取不到时退回本级耗时）
                const m1 = entry.times[isInst ? owned : lvl + 1];
                const m2 = entry.times[isInst ? capCount : capLv + 1];
                const maxRaw = (m1 !== undefined && m2 !== undefined && m2 > m1) ? m2 - m1 : seconds;
                // 月卡折扣：所有时间 ×(1-折扣/100)，小时匹配与显示均用扣减后时间
                const eff = discount ? Math.round(seconds * (1 - discount / 100)) : seconds;
                const effMax = discount ? Math.round(maxRaw * (1 - discount / 100)) : maxRaw;
                if (hour !== null && hour !== undefined && Math.floor(eff / 3600) % 24 !== hour) return;
                const key = String(item.data) + '_' + (isInst ? owned : lvl);
                const inst = item.cnt || 1;
                if (grouped[key]) {
                    grouped[key].count += inst;
                } else {
                    grouped[key] = {
                        id: String(item.data), cat: entry.cat, accountCat: cat,
                        lvl: isInst ? owned : lvl, nextLvl: isInst ? owned + 1 : lvl + 1,
                        maxLevel: capLv,
                        seconds: eff, maxSeconds: effMax,
                        count: isInst ? 1 : inst,
                        instances: isInst || undefined
                    };
                }
            });
        });
        const results = Object.keys(grouped).map(k => grouped[k]);
        const names = (CocTool.names && CocTool.names.ITEM_NAMES) || {};
        const dir = order === 'desc' ? -1 : 1;
        results.sort((a, b) => {
            if (a.seconds !== b.seconds) return (a.seconds - b.seconds) * dir;
            const na = names[CocTool.names.canonicalId(a.id)] || a.id;
            const nb = names[CocTool.names.canonicalId(b.id)] || b.id;
            return (na.localeCompare(nb, 'zh') || a.id.localeCompare(b.id)) * dir;
        });
        return results;
    }

    // ====== 添加到升级列表 ======
    // 把搜索结果里的一个"未升级实例"改写为"升级中"（写 timer）。
    // timer 换算口径与游戏导出一致：timer = 导出时刻(timestamp)起的剩余秒 →
    // 要让新条目「从现在起 seconds 秒完成」，写 timer = now秒 - timestamp + seconds。
    // 条目规则：cnt:1 → 同条目删 cnt 挂 timer；cnt>1 → cnt-1 并追加独立 {data,lvl,timer}；
    // 无 cnt（兵/法术/英雄/战宠/攻城车等单实例）→ 直接挂 timer。
    // 只挑未升级实例（timer>0 / gear_up===0 的条目跳过，与 searchUpgrades 同口径），找不到返回 false。
    function applyAddToUpgrades(data, item, meta) {
        if (!data || !item || !Array.isArray(data[item.accountCat])) return false;
        const secs = item.seconds || 0;
        const timer = data.timestamp ? Math.floor(Date.now() / 1000) - data.timestamp + secs : secs;
    const entry = data[item.accountCat].find(a =>
        a && Number(a.data) === Number(item.id) &&
        // 数量型实体（item.instances）：条目 lvl 恒为建筑等级（1）、座数在 cnt —— 按 data 匹配即可
        (item.instances || Number(a.lvl) === Number(item.lvl)) &&
        !(a.timer > 0) && a.gear_up !== 0);
        if (!entry) return false;
        let target = entry;
        if (entry.cnt !== undefined && entry.cnt !== null) {
            const cnt = Number(entry.cnt) || 0;
            if (cnt > 1) {
                entry.cnt = cnt - 1;
                target = { data: entry.data, lvl: entry.lvl, timer: timer };
                data[item.accountCat].push(target);
            } else {
                delete entry.cnt;
                entry.timer = timer;
            }
        } else {
            entry.timer = timer;
        }
        // 名义时长写成条目上的本地字段：游戏导出没有这个字段，重导入后自动消失——
        // 游戏直接导入的条目永远命中不到它（排队只认这个字段，不查任何共享记录），保证显示游戏自己的 timer。
        if (secs > 0) target.local_nominal = secs;
        // +排队 需要条目在数组里的下标算 uniqueId（cat_data_lvl_idx）；失败路径不写 meta
        if (meta) { meta.entry = target; meta.index = data[item.accountCat].indexOf(target); }
        return true;
    }

    const uiState = { tab: 'home', hour: 12, filter: 'all', resource: 'all', discount: 0, futureHours: null, mode: 'allDesc', progressMode: 'full' };
    const ALL_BUTTON_LABELS = { search: '所有可升级项', allAsc: '所有可升级项↓', allDesc: '所有可升级项↑' };
    const DISCOUNT_OPTIONS = [0, 5, 10, 15, 20];
    const MAX_ROWS = 500;
    let lastShown = [];   // 当前渲染的结果行（data-ds-add 按下标回查）
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
                mode: ['search', 'allAsc', 'allDesc'].includes(s.mode) ? s.mode : 'allDesc',
                progressMode: s.progressMode === 'th' ? 'th' : 'full'
            };
        } catch (e) { return null; }
    }

    function saveDsState() {
        try {
            global.localStorage.setItem(DS_STATE_KEY, JSON.stringify({
                tab: uiState.tab, hour: uiState.hour, filter: uiState.filter,
                resource: uiState.resource, futureHours: uiState.futureHours, mode: uiState.mode,
                progressMode: uiState.progressMode
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

    // 「到满级」只精确到时（分秒无参考价值）
    function formatDurationToHour(seconds) {
        if (seconds <= 0) return '0时';
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        let text = '';
        if (d > 0) text += d + '天';
        if (h > 0) text += h + '时';
        return text || '不足1时';
    }

    function currentAccountData() {
        return CocTool.state && CocTool.state.currentAccount && CocTool.state.accounts
            ? CocTool.state.accounts[CocTool.state.currentAccount] : null;
    }

    // ===== 升级时间折扣组件（详情页/图鉴共用；自 overview-detail.js 迁入——该文件逼近 100KB 上限，
    // 且矿石折扣组件也要挂这里。onclick 硬引用统一指向 CocTool.durationSearch.*）=====
    var upgradeDiscount = 0;      // 当前折扣账号语境的折扣（0-99，百分数）
    var activeDiscountTag = null; // 折扣归属账号（= 详情页 currentDetailTag，图鉴语境恒一致）
    function getUpgradeDiscount(tag) {
        try {
            var m = JSON.parse(localStorage.getItem('clash_upgrade_discount') || '{}');
            var v = parseInt(m[tag], 10);
            return (v >= 0 && v <= 99) ? v : 0;
        } catch (e) { return 0; }
    }
    function saveUpgradeDiscount(tag, pct) {
        try {
            var m = JSON.parse(localStorage.getItem('clash_upgrade_discount') || '{}');
            m[tag] = (pct >= 0 && pct <= 99) ? pct : 0;
            localStorage.setItem('clash_upgrade_discount', JSON.stringify(m));
        } catch (e) {}
    }
    // 详情页 renderHomeDetail / 图鉴 open 时调用：设定折扣归属账号并读取
    function setCurrentDiscount(tag) { activeDiscountTag = tag; upgradeDiscount = getUpgradeDiscount(tag); return upgradeDiscount; }
    // 数据查询语境：只对齐内存当前值（组件按钮/菜单/自定义输入行的显示），不绑账号、不落存储
    function setCurrentDqDiscount(pct) { upgradeDiscount = pct; return pct; }
    function setCurrentDqOreDiscount(pct) { oreDiscount = pct; return pct; }
    function getCurrentDiscount() { return upgradeDiscount; }
    function isCustomDiscount(pct) {
        return pct > 0 && DISCOUNT_OPTIONS.indexOf(pct) === -1;
    }
    function discOptsHtml(customMode) {
        return DISCOUNT_OPTIONS.map(function (p) {
            return '<div class="ov-disc-opt' + (p === upgradeDiscount && !customMode ? ' active' : '') + '" onclick="CocTool.durationSearch.setDiscount(event, ' + p + ')">' + p + '%</div>';
        }).join('');
    }
    // mode === 'ore'：装备图鉴的矿石折扣形态（品字三矿石图标 + 10/50/自定义；装备升级即时完成、
    // 只耗矿石不涉及时间，与时间折扣语义无关 → 独立键 clash_ore_discount）
    var ORE_DISCOUNT_OPTIONS = [0, 10, 50];
    var oreDiscount = 0;
    var activeOreTag = null;
    function getOreDiscount(tag) {
        try {
            var mo = JSON.parse(localStorage.getItem('clash_ore_discount') || '{}');
            var vo = parseInt(mo[tag], 10);
            return (vo >= 0 && vo <= 99) ? vo : 0;
        } catch (e) { return 0; }
    }
    function saveOreDiscount(tag, pct) {
        try {
            var mo = JSON.parse(localStorage.getItem('clash_ore_discount') || '{}');
            mo[tag] = (pct >= 0 && pct <= 99) ? pct : 0;
            localStorage.setItem('clash_ore_discount', JSON.stringify(mo));
        } catch (e) {}
    }
    // 图鉴 open 时调用：设定矿石折扣归属账号并读取
    function setCurrentOreDiscount(tag) { activeOreTag = tag; oreDiscount = getOreDiscount(tag); return oreDiscount; }
    function isOreCustom(pct) {
        return pct > 0 && ORE_DISCOUNT_OPTIONS.indexOf(pct) === -1;
    }
    // 三种矿石品字折叠（蓝矿左下 / 紫矿右下 / 黄矿上）
    function oreTriHtml() {
        return '<span class="ore-tri">' +
            '<img src="img/icons/Shiny_Ore.webp" alt="" onerror="this.style.display=\'none\'">' +
            '<img src="img/icons/Glowy_Ore.webp" alt="" onerror="this.style.display=\'none\'">' +
            '<img src="img/icons/Starry_Ore.webp" alt="" onerror="this.style.display=\'none\'">' +
        '</span>';
    }
    function discountBtnHtml(mode) {
        if (mode === 'ore') {
            return '<div class="ov-disc-wrap">' +
                '<button class="ov-disc-btn" onclick="CocTool.durationSearch.toggleDiscountMenu()" title="矿石折扣（升级矿石花费减免）">' +
                    oreTriHtml() +
                    '<span class="ov-disc-val">' + oreDiscount + '%</span>' +
                '</button>' +
                '<div class="ov-disc-menu" style="display:none;">' +
                    ORE_DISCOUNT_OPTIONS.map(function (p) {
                        return '<div class="ov-disc-opt' + (p === oreDiscount ? ' active' : '') + '" onclick="CocTool.durationSearch.setOreDiscount(event, ' + p + ')">' + p + '%</div>';
                    }).join('') +
                    '<div class="ov-disc-opt' + (isOreCustom(oreDiscount) ? ' active' : '') + '" data-pct="custom" onclick="CocTool.durationSearch.customOreDiscount(event)">' + (isOreCustom(oreDiscount) ? '自定义 ' + oreDiscount + '%' : '自定义…') + '</div>' +
                '</div>' +
            '</div>';
        }
        var pct = upgradeDiscount;
        return '<div class="ov-disc-wrap">' +
            '<button class="ov-disc-btn" onclick="CocTool.durationSearch.toggleDiscountMenu()" title="升级时间折扣">' +
                '<img src="img/icons/icon_goldmodel.webp" class="ov-disc-icon" onerror="this.style.display=\'none\'">' +
                '<span class="ov-disc-val">' + pct + '%</span>' +
            '</button>' +
            '<div class="ov-disc-menu" style="display:none;">' +
                discOptsHtml(false) +
                '<div class="ov-disc-opt' + (isCustomDiscount(pct) ? ' active' : '') + '" data-pct="custom" onclick="CocTool.durationSearch.customDiscount(event)">' + (isCustomDiscount(pct) ? '自定义 ' + pct + '%' : '自定义…') + '</div>' +
            '</div>' +
        '</div>';
    }
    // 点「自定义…」：菜单原地切成输入行（档位项保留在上方），✓ 或回车确认
    function customDiscount(e) {
        if (e && e.stopPropagation) e.stopPropagation();
        var wrap = e.target ? e.target.closest('.ov-disc-wrap') : null;
        var menu = wrap ? wrap.querySelector('.ov-disc-menu') : null;
        if (!menu) return;
        menu.innerHTML = discOptsHtml(true) +
            '<div class="ov-disc-custom">' +
                '<input class="ov-disc-input" type="number" inputmode="numeric" min="1" max="99" value="' + (isCustomDiscount(upgradeDiscount) ? upgradeDiscount : '') + '" onfocus="this.select()" onkeydown="if(event.keyCode===13)CocTool.durationSearch.setCustomDiscount(event)">' +
                '<button class="ov-disc-ok" onclick="CocTool.durationSearch.setCustomDiscount(event)">✓</button>' +
            '</div>';
        var input = menu.querySelector('.ov-disc-input');
        if (input) { input.focus(); }
    }
    function setCustomDiscount(e) {
        if (e && e.stopPropagation) e.stopPropagation();
        var wrap = e.target ? e.target.closest('.ov-disc-wrap') : null;
        var input = wrap ? wrap.querySelector('.ov-disc-input') : null;
        var v = input ? parseInt(input.value, 10) : NaN;
        if (isNaN(v)) return;   // 空值/非数字不动，等用户输入
        setDiscount(e, Math.max(0, Math.min(99, v)));
    }
    function customOreDiscount(e) {
        if (e && e.stopPropagation) e.stopPropagation();
        var wrap = e.target ? e.target.closest('.ov-disc-wrap') : null;
        var menu = wrap ? wrap.querySelector('.ov-disc-menu') : null;
        if (!menu) return;
        menu.innerHTML = ORE_DISCOUNT_OPTIONS.map(function (p) {
            return '<div class="ov-disc-opt" onclick="CocTool.durationSearch.setOreDiscount(event, ' + p + ')">' + p + '%</div>';
        }).join('') +
        '<div class="ov-disc-custom">' +
            '<input class="ov-disc-input" type="number" inputmode="numeric" min="1" max="99" value="' + (isOreCustom(oreDiscount) ? oreDiscount : '') + '" onfocus="this.select()" onkeydown="if(event.keyCode===13)CocTool.durationSearch.setCustomOreDiscount(event)">' +
            '<button class="ov-disc-ok" onclick="CocTool.durationSearch.setCustomOreDiscount(event)">✓</button>' +
        '</div>';
        var input = menu.querySelector('.ov-disc-input');
        if (input) { input.focus(); }
    }
    function setCustomOreDiscount(e) {
        if (e && e.stopPropagation) e.stopPropagation();
        var wrap = e.target ? e.target.closest('.ov-disc-wrap') : null;
        var input = wrap ? wrap.querySelector('.ov-disc-input') : null;
        var v = input ? parseInt(input.value, 10) : NaN;
        if (isNaN(v)) return;
        setOreDiscount(e, Math.max(0, Math.min(99, v)));
    }
    function toggleDiscountMenu() {
        var wrap = event.target ? event.target.closest('.ov-disc-wrap') : null;
        if (!wrap) wrap = document.querySelector('.ov-disc-wrap');
        var menu = wrap ? wrap.querySelector('.ov-disc-menu') : null;
        if (!menu) return;
        var showing = menu.style.display !== 'none';
        document.querySelectorAll('.ov-disc-menu').forEach(function (m) { m.style.display = 'none'; });
        menu.style.display = showing ? 'none' : '';
        if (!showing) document.addEventListener('click', dismissDiscountMenu);
    }
    function dismissDiscountMenu(e) {
        if (e.target && e.target.closest && e.target.closest('.ov-disc-wrap')) return;
        document.querySelectorAll('.ov-disc-menu').forEach(function (m) { m.style.display = 'none'; });
        document.removeEventListener('click', dismissDiscountMenu);
    }
    function setDiscount(e, pct) {
        if (e && e.stopPropagation) e.stopPropagation();
        // 数据查询语境（图鉴 forcedServer 态）：折扣写 pokedex 的会话级 dqDiscount，不落账号键
        if (CocTool.features.pokedex && CocTool.features.pokedex.isDataQuery && CocTool.features.pokedex.isDataQuery()) {
            CocTool.features.pokedex.applyDqDiscount(pct);
            try { CocTool.ui.showToast('已设置升级时间折扣 ' + pct + '%'); } catch (e4) {}
            return;
        }
        var tag = activeDiscountTag;
        if (!tag) return;
        upgradeDiscount = pct;
        saveUpgradeDiscount(tag, pct);
        // 详情页重渲染 + 图鉴同步：晚绑定（点击时各模块均已加载）
        try { if (CocTool.features.overview && CocTool.features.overview.renderAfterDiscount) CocTool.features.overview.renderAfterDiscount(tag); } catch (e2) {}
        try { if (CocTool.features.pokedex && CocTool.features.pokedex.refreshDiscount) CocTool.features.pokedex.refreshDiscount(); } catch (e3) {}
        try { CocTool.ui.showToast('已设置升级时间折扣 ' + pct + '%'); } catch (e4) {}
    }
    function setOreDiscount(e, pct) {
        if (e && e.stopPropagation) e.stopPropagation();
        // 数据查询语境：矿石折扣写 pokedex 的会话级 dqOreDiscount，不落账号键
        if (CocTool.features.pokedex && CocTool.features.pokedex.isDataQuery && CocTool.features.pokedex.isDataQuery()) {
            CocTool.features.pokedex.applyDqOreDiscount(pct);
            try { CocTool.ui.showToast('已设置矿石折扣 ' + pct + '%'); } catch (e4) {}
            return;
        }
        if (!activeOreTag) return;
        oreDiscount = pct;
        saveOreDiscount(activeOreTag, pct);
        try { if (CocTool.features.pokedex && CocTool.features.pokedex.refreshDiscount) CocTool.features.pokedex.refreshDiscount(); } catch (e2) {}
        try { CocTool.ui.showToast('已设置矿石折扣 ' + pct + '%'); } catch (e3) {}
    }

    // 月卡折扣：与详情页共用 clash_upgrade_discount（读写走迁入的组件函数，弹窗只转发）
    function getAccountDiscount() {
        return getUpgradeDiscount(CocTool.state && CocTool.state.currentAccount);
    }

    function saveAccountDiscount(tag, pct) {
        saveUpgradeDiscount(tag, pct);
    }

    function discountButtons() {
        const custom = uiState.discount > 0 && DISCOUNT_OPTIONS.indexOf(uiState.discount) === -1;
        return DISCOUNT_OPTIONS.map(p =>
            '<div class="ov-disc-opt' + (p === uiState.discount ? ' active' : '') + '" data-ds-disc="' + p + '">' + p + '%</div>'
        ).join('') +
        '<div class="ov-disc-opt' + (custom ? ' active' : '') + '" data-ds-disc="custom">' + (custom ? '自定义 ' + uiState.discount + '%' : '自定义…') + '</div>';
    }

    function applyDiscountStyles(modal) {
        const val = modal.querySelector('[data-ds-disc-val]');
        if (val) val.textContent = uiState.discount + '%';
        // 重建菜单（含自定义项/自定义态 active）——输入态确认后也回到标准形态
        const menu = modal.querySelector('[data-ds-disc-menu]');
        if (menu) menu.innerHTML = discountButtons();
        modal.querySelectorAll('[data-ds-disc]').forEach(opt => {
            const v = opt.getAttribute('data-ds-disc');
            const active = v === 'custom'
                ? (uiState.discount > 0 && DISCOUNT_OPTIONS.indexOf(uiState.discount) === -1)
                : parseInt(v, 10) === uiState.discount;
            opt.className = 'ov-disc-opt' + (active ? ' active' : '');
        });
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
            '<button data-ds-mode class="ov-mode-btn" style="position:static;margin-left:8px;align-self:center;flex-shrink:0;" title="满防时长（点击切换当前大本）"><i class="fa fa-refresh"></i></button>' +
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
            const addBtn = e.target.closest('[data-ds-add]');
            if (addBtn) {
                handleAddClick(modal, parseInt(addBtn.getAttribute('data-ds-add'), 10));
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
                const v = discOpt.getAttribute('data-ds-disc');
                if (v === 'custom') {   // 原地切输入行（1-99，✓ 或回车确认）
                    const dm = modal.querySelector('[data-ds-disc-menu]');
                    dm.innerHTML = DISCOUNT_OPTIONS.map(p =>
                        '<div class="ov-disc-opt" data-ds-disc="' + p + '">' + p + '%</div>'
                    ).join('') +
                    '<div class="ov-disc-custom">' +
                        '<input class="ov-disc-input" data-ds-disc-input type="number" inputmode="numeric" min="1" max="99" value="' + (uiState.discount > 0 ? uiState.discount : '') + '" onfocus="this.select()">' +
                        '<button class="ov-disc-ok" data-ds-disc-ok>✓</button>' +
                    '</div>';
                    const inp = dm.querySelector('[data-ds-disc-input]');
                    if (inp) inp.focus();
                    return;
                }
                uiState.discount = parseInt(v, 10) || 0;
                saveAccountDiscount(CocTool.state && CocTool.state.currentAccount, uiState.discount);
                applyDiscountStyles(modal);
                renderResults(modal);
                return;
            }
            const discOk = e.target.closest('[data-ds-disc-ok]');
            if (discOk) {
                const inp = modal.querySelector('[data-ds-disc-input]');
                const v = inp ? parseInt(inp.value, 10) : NaN;
                if (!isNaN(v)) {
                    uiState.discount = Math.max(0, Math.min(99, v));
                    saveAccountDiscount(CocTool.state && CocTool.state.currentAccount, uiState.discount);
                    applyDiscountStyles(modal);
                    renderResults(modal);
                }
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
            const modeBtn = e.target.closest('[data-ds-mode]');
            if (modeBtn) {
                uiState.progressMode = uiState.progressMode === 'th' ? 'full' : 'th';
                saveDsState();
                applyModeBtn(modal);
                renderResults(modal);
                return;
            }
        });
        // 折扣输入行：回车 = 点 ✓（click 委托抓不到 keydown，单独挂）
        modal.addEventListener('keydown', function (e) {
            if (e.keyCode !== 13) return;
            const inp = e.target.closest ? e.target.closest('[data-ds-disc-input]') : null;
            if (!inp) return;
            const v = parseInt(inp.value, 10);
            if (isNaN(v)) return;
            uiState.discount = Math.max(0, Math.min(99, v));
            saveAccountDiscount(CocTool.state && CocTool.state.currentAccount, uiState.discount);
            applyDiscountStyles(modal);
            renderResults(modal);
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

    // 满防/当前大本切换钮：黄 = 满防（到满级）、蓝 = 当前大本（到上限），样式与详情页 ov-mode-btn 同款
    function applyModeBtn(modal) {
        const btn = modal.querySelector('[data-ds-mode]');
        if (!btn) return;
        const th = uiState.progressMode === 'th';
        btn.title = th ? '当前大本时长（点击切换满防）' : '满防时长（点击切换当前大本）';
        btn.className = 'ov-mode-btn' + (th ? ' th' : '');
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

    function rowHtml(item, idx, simOn) {
        const names = (CocTool.names && CocTool.names.ITEM_NAMES) || {};
        const name = names[CocTool.names.canonicalId(item.id)] || ('未知(' + item.id + ')');
        let iconHtml = '<i class="fa fa-cube text-primary" style="font-size:16px;"></i>';
        try {
            if (CocTool.calc && CocTool.calc.getItemIconUrl) {
                // 数量型实体每座恒 1 级：getItemIconUrl 内部按 lvl+1 取图 → 传 0 落到 1 级图（<id>_1.webp）
                const urls = CocTool.calc.getItemIconUrl({ data: item.id, lvl: item.instances ? 0 : item.lvl, category: item.accountCat });
                if (urls && urls.length) {
                    iconHtml = '<img src="' + urls[0] + '" width="24" height="24" class="object-contain" alt="" data-fallback="' + urls.slice(1).join(',') + '" onerror="this.onerror=null;var f=this.getAttribute(\'data-fallback\');if(f){var c=f.split(\',\');if(c.length){this.src=c.shift();this.setAttribute(\'data-fallback\',c.join(\',\'));}}else{this.style.display=\'none\';}">';
                }
            }
        } catch (e) { /* 图标失败用 fa 兜底 */ }
        const countHtml = item.count > 1
            ? '<span class="text-xs text-gray-500 flex-shrink-0" style="background:#e5e7eb;border-radius:999px;padding:0 6px;">×' + item.count + '</span>'
            : '';
        // 三列排版（图标跨两行垂直居中）：左列 名称+×N / 当前等级/满级；右列 下一级：时间 / 到满级：时间 +升级
        // （右列两行左对齐成列——两个标签同宽，值与标签紧邻；+升级 恒在行尾）
        const addHtml = simOn ? '' :
            '<span class="text-xs text-green-600 flex-shrink-0" style="cursor:pointer;-webkit-tap-highlight-color:transparent;" data-ds-add="' + idx + '">+升级</span>';
        const maxLvText = item.maxLevel !== undefined ? item.lvl + '/' + item.maxLevel : String(item.nextLvl);
        return '<div class="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-50 mb-0.5">' +
            '<div class="w-6 h-6 flex items-center justify-center flex-shrink-0 ds-icon-jump" data-ds-id="' + item.id + '" data-ds-lvl="' + item.lvl + '" style="cursor:pointer;" title="查看图鉴">' + iconHtml + '</div>' +
            '<div class="flex-1 min-w-0">' +
            '<div class="flex items-center gap-2">' +
            '<span class="text-sm text-gray-800 truncate" style="min-width:0;">' + name + '</span>' +
            countHtml +
            '</div>' +
            '<div class="text-xs text-gray-500">' + maxLvText + '</div>' +
            '</div>' +
            '<div class="flex-shrink-0">' +
            '<div class="flex items-center" style="white-space:nowrap;">' +
            '<span class="text-xs text-gray-500">下一级：</span>' +
            '<span class="text-sm font-medium text-primary">' + formatDuration(item.seconds) + '</span>' +
            '</div>' +
            '<div class="flex items-center gap-3">' +
            '<span style="white-space:nowrap;">' +
            '<span class="text-xs text-gray-500">' + (uiState.progressMode === 'th' ? '到上限：' : '到满级：') + '</span>' +
            '<span class="text-xs font-medium text-gray-600">' + formatDurationToHour(item.maxSeconds) + '</span>' +
            '</span>' +
            addHtml +
            '</div>' +
            '</div>' +
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
        const list = searchUpgrades(data, getIndexForAccount(data), hour, uiState.tab, uiState.filter, order, uiState.resource, uiState.discount, uiState.progressMode);
        if (!list.length) {
            container.innerHTML = '<p class="text-sm text-gray-500 text-center py-6">无匹配升级项</p>';
            return;
        }
        const shown = list.slice(0, MAX_ROWS);
        lastShown = shown;
        const simOn = !!(CocTool.features.progress && CocTool.features.progress.simActive && CocTool.features.progress.simActive());
        container.innerHTML = shown.map((it, i) => rowHtml(it, i, simOn)).join('') +
            (list.length > MAX_ROWS ? '<p class="text-xs text-gray-400 text-center py-2">仅显示前 ' + MAX_ROWS + ' 条（共 ' + list.length + ' 条）</p>' : '');
    }

    function handleAddClick(modal, idx) {
        const item = lastShown[idx];
        if (!item) return;
        if (CocTool.features.progress && CocTool.features.progress.simActive && CocTool.features.progress.simActive()) return;   // 推演中禁用（保护副本语义）
        const names = (CocTool.names && CocTool.names.ITEM_NAMES) || {};
        const name = names[CocTool.names.canonicalId(item.id)] || ('未知(' + item.id + ')');
        // 数量型实体按「第 N 座」表述（lvl 是座数、建筑等级恒 1，写「等级 x→y」会误导）
        const lvlText = item.instances ? ('第 ' + item.nextLvl + ' 座') : ('等级 ' + item.lvl + '→' + item.nextLvl);
        const durText = formatDuration(item.seconds);
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML =
            '<div class="modal-card w-xs item-actions-modal">' +
                '<h3 class="font-semibold text-gray-800 mb-3 text-center" style="font-size: 15px;">添加到升级列表</h3>' +
                '<p class="text-sm text-gray-600 mb-4 text-center" style="word-break: break-all;">确认将「' + CocTool.calc.escapeHtml(name) + '」' + lvlText + '（' + durText + '）添加到升级列表中？</p>' +
                '<div class="flex flex-col space-y-2">' +
                    '<button class="__ds-queue w-full px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-all duration-200 text-sm">+排队</button>' +
                    '<button class="__ds-upgrade w-full px-3 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-all duration-200 text-sm">+升级</button>' +
                    '<button class="__ds-cancel modal-cancel-link">取消</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(overlay);
        const close = () => overlay.remove();
        function commit(queue) {
            close();
            const data = currentAccountData();
            const meta = {};
            if (!applyAddToUpgrades(data, item, meta)) return;
            CocTool.storage.saveAccounts();
            // +排队：条目刚写入、还没有卡片 DOM，按 uniqueId（账号tag_分类_实体_等级_下标）直接落排队标记
            if (queue) {
                const q = CocTool.features.queue;
                if (q && q.queueByUnique && data.tag) {
                    q.queueByUnique(data.tag + '_' + item.accountCat + '_' + meta.entry.data + '_' + meta.entry.lvl + '_' + meta.index);
                }
            }
            if (CocTool.features.progress && CocTool.features.progress.refresh) CocTool.features.progress.refresh();
            if (CocTool.features.services && CocTool.features.services.pushSchedule) CocTool.features.services.pushSchedule();
            renderResults(modal);
        }
        overlay.querySelector('.__ds-queue').addEventListener('click', () => commit(true));
        overlay.querySelector('.__ds-upgrade').addEventListener('click', () => commit(false));
        overlay.querySelector('.__ds-cancel').addEventListener('click', close);
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
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
        applyModeBtn(modal);
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
        // 结果行图标点击 → 与首页升级图标**同一条**「直达图鉴」链路（统一入口 openPokedexViaOverview）：
        // 去程自动停靠 账号进度（导航选中态同步）→ 账号详情页 → 图鉴；返程逐层：图鉴 → 详情页 → 账号进度。
        // 搜索弹窗先显式关闭（切页时 closeAllModals 也会关，这里关掉避免残留盖住新页面）。
        document.addEventListener('click', function (e) {
            const box = e.target.closest ? e.target.closest('.ds-icon-jump') : null;
            if (!box) return;
            e.stopPropagation();
            const modal = document.getElementById('duration-search-modal');
            if (modal) modal.classList.add('hidden');
            const fn = CocTool.features.progress && CocTool.features.progress.openPokedexViaOverview;
            if (fn) fn(box.getAttribute('data-ds-id'), Number(box.getAttribute('data-ds-lvl')) || 1);
        });
    }

    CocTool.durationSearch = {
        init: init,
        openSearchModal: openSearchModal,
        buildIdIndex: buildIdIndex,
        searchUpgrades: searchUpgrades,
        applyAddToUpgrades: applyAddToUpgrades,
        getIndexForAccount: getIndexForAccount,
        normalizeResource: normalizeResource,
        matchesResource: matchesResource,
        formatDuration: formatDuration,
        formatDurationToHour: formatDurationToHour,
        // 折扣组件（详情页/图鉴共用；自 overview-detail 迁入 + 矿石形态）
        discountBtnHtml: discountBtnHtml,
        setCurrentDiscount: setCurrentDiscount,
        setCurrentDqDiscount: setCurrentDqDiscount,
        setCurrentDqOreDiscount: setCurrentDqOreDiscount,
        getCurrentDiscount: getCurrentDiscount,
        getUpgradeDiscount: getUpgradeDiscount,
        toggleDiscountMenu: toggleDiscountMenu,
        setDiscount: setDiscount,
        customDiscount: customDiscount,
        setCustomDiscount: setCustomDiscount,
        setCurrentOreDiscount: setCurrentOreDiscount,
        setOreDiscount: setOreDiscount,
        customOreDiscount: customOreDiscount,
        setCustomOreDiscount: setCustomOreDiscount
    };
})(window);
