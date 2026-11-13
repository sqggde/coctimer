/**
 * 道具使用推演域（2026-11-08 自 progress.js 拆出：模块 80KB 提醒线，F-20261108-2）
 *
 * 副本推演：药水步进器 / 24x 倍率切换 / 钟楼启动 / 助手指派与互斥 / 应用=副本转正。
 * 与首页渲染经 features.progress 协作：renderItems 回渲、getActiveSlideRoot 取活动 slide、
 * refresh 收尾；services.pauseTicker/resumeTicker 冻结每秒时钟。core.showPage 切出首页经
 * features.progress.exitSimIfActive 自动退出（出口仍在 progress，内部委托本模块）。
 * 依赖：core.js。
 */
(function (global) {
    'use strict';

    const CocTool = global.CocTool;
    if (!CocTool || !CocTool.state || !CocTool.calc) {
        throw new Error('sim.js requires core.js');
    }

    const state = CocTool.state;
    const settings = state.settings;
    const accounts = state.accounts;
    const calc = CocTool.calc;
    const storage = CocTool.storage;
    function callAccounts(method, ...args) {
        const module = CocTool.features.accounts;
        if (module && typeof module[method] === 'function') return module[method](...args);
        return undefined;
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
    // 推演步进器里可点图标切倍率的道具（与首页 timer 同一套字段）
    const SIM_BOOST = {
        builder_boost: { field: 'builderBoostMode24', icons: ['builder_boost_24.webp', 'builder_boost.webp'] },
        builder_consumable: { field: 'builderConsumableMode24', icons: ['builder_consumable24.webp', 'builder_consumable.webp'] },
        lab_consumable: { field: 'labConsumableMode24', icons: ['lab_consumable24.webp', 'lab_consumable.webp'] }
    };

    function simBoostIcon(key) {
        const b = SIM_BOOST[key];
        if (!b) return null;
        // 24× 形态仅国服可用：国际服固定基础图标（设置里残留的 24× 标记不采纳）
        const cn24 = calc.isCnAccount(sim.copy);
        const is24 = cn24 && settings[b.field] && settings[b.field][sim.tag];
        return b.icons[is24 ? 0 : 1];
    }

    // 推演中切倍率：只改 settings 并重算副本列表，不退出推演（国际服锁死基础倍率，不允许切）
    function toggleSimBoost(key) {
        const b = SIM_BOOST[key];
        if (!b || !sim.active) return;
        if (!calc.isCnAccount(sim.copy)) return;
        if (!settings[b.field]) settings[b.field] = {};
        settings[b.field][sim.tag] = !settings[b.field][sim.tag];
        storage.saveSettings();
        renderSimFrame();   // 图标换 24 版
        renderSimList();    // 完成时间按新倍率重算
    }

    function hideSimEl(el) {
        if (!el || el.__simHidden) return;
        el.__simHidden = true;   // 幂等标记用 JS property（同 bindCardDelete 的 data-* 教训）
        sim.hiddenEls.push(el);
        el.style.display = 'none';
    }

    function renderSimList() {
        const items = calc.filterDismissedCategories(calc.extractUpgradingItems(sim.copy, sim.frozenNow, true), sim.copy.tag);
        CocTool.features.progress.renderItems(items, sim.copy, sim.frozenNow);
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
        const icon = simBoostIcon(p.key) || p.icon;
        // 国际服锁死基础倍率：不挂 data-boost-key（无 pointer 手势、点击委托也不绑定）
        const canToggle = SIM_BOOST[p.key] && calc.isCnAccount(sim.copy);
        const boostAttr = canToggle ? ' data-boost-key="' + p.key + '"' : '';
        return '<span class="sim-potion" title="' + p.name + '">' +
            '<img src="img/icons/' + icon + '" width="16" height="16" alt=""' + boostAttr + '>' +
            '<button type="button" class="sim-btn" data-key="' + p.key + '" data-delta="-1">−</button>' +
            '<input type="number" min="0" step="1" class="sim-input" data-key="' + p.key + '" value="' + (sim.counts[p.key] || 0) + '">' +
            '<button type="button" class="sim-btn" data-key="' + p.key + '" data-delta="1">+</button>' +
            '</span>';
    }

    function renderSimFrame() {
        const root = CocTool.features.progress.getActiveSlideRoot();
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
            // 推演中：点有 24× 形态的道具图标直接切倍率（药水 10/24、大餐 2/24、浓汤 4/24）
            wrap.querySelectorAll('img[data-boost-key]').forEach(img => img.addEventListener('click', () => toggleSimBoost(img.dataset.boostKey)));
        });
        // 推演操作栏：升级列表容器顶部插入独立条（原锚定标题行 h2，该行已删 2026-11-01；exitSim 按 id 移除）
        const listWrap = root.querySelector('#upgrades-container');
        if (listWrap && !listWrap.parentNode.querySelector('#sim-actions')) {
            const actions = document.createElement('div');
            actions.id = 'sim-actions';
            actions.className = 'sim-actions';
            actions.innerHTML = '<button type="button" id="sim-exit-btn">退出</button><button type="button" id="sim-apply-btn">应用</button>';
            listWrap.parentNode.insertBefore(actions, listWrap);
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

    // 吸顶后合并卡会多出账号信息两行（比原总览卡高）——进推演时临时折叠、退出恢复；
    // 只动类不写 settings（用户的折叠偏好不被推演改写）。用户推演中手动点箭头以设置为准。
    function collapseDataInfoForSim() {
        const card = document.getElementById('category-summary-card');
        if (!card) return;
        sim.infoWasExpanded = !card.classList.contains('info-collapsed');
        if (sim.infoWasExpanded) card.classList.add('info-collapsed');
    }

    function restoreDataInfoAfterSim() {
        if (!sim.infoWasExpanded) return;
        sim.infoWasExpanded = false;
        const card = document.getElementById('category-summary-card');
        if (card) card.classList.remove('info-collapsed');
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
        collapseDataInfoForSim();
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
        const root = CocTool.features.progress.getActiveSlideRoot();
        root.querySelectorAll('.sim-steppers').forEach(el => el.remove());
        const actions = root.querySelector('#sim-actions');
        if (actions) actions.remove();
        sim.hiddenEls.forEach(el => { el.style.display = ''; el.__simHidden = false; });   // 分类头/标题行原内容恢复
        sim.hiddenEls = [];
        sim.active = false;
        unpinSummaryCard();
        restoreDataInfoAfterSim();
        if (apply && sim.copy) {
            sim.copy.timestamp = Math.floor(Date.now() / 1000);   // 推演的未来变成现在
            accounts[sim.tag] = sim.copy;
            try { storage.saveAccounts(); } catch (e) {}
        }
        sim.copy = null; sim.tag = null; sim.baseBoosts = {}; sim.counts = {};
        CocTool.features.services.resumeTicker();
        CocTool.features.progress.refresh();
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


    CocTool.features.sim = Object.freeze({
        simActive: () => sim.active,
        exitSimIfActive: () => { if (sim.active) exitSim(false); },
        simDebug: () => sim.copy ? JSON.parse(JSON.stringify(sim.copy)) : null,
        enterSim,
        handleSimCardClick,
        activateClockTower
    });
})(window);
