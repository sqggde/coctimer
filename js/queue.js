// queue.js —— 升级排队交互（工人队列模拟的 UI 层）
// 数据层（simulateQueue / 标记读写 / 导入重放 / 固化）在 calc.js；卡片渲染与 tick 在 progress.js。
// 排队中的升级倒计时静止，按队列位置依次消费"工人空出"事件（池内升级逐个完成）才开工；
// 完成时刻由 extract 注入（queueStart/queueFinish 派生字段），列表/通知/小组件全链路自动生效。
(function (global) {
    'use strict';

    const CocTool = global.CocTool;
    if (!CocTool || !CocTool.calc || !CocTool.state) {
        throw new Error('queue.js requires core.js');
    }

    const calc = CocTool.calc;
    const state = CocTool.state;
    const settings = state.settings;
    const accounts = state.accounts;

    function toastSafe(msg) {
        if (CocTool.ui && CocTool.ui.showToast) CocTool.ui.showToast(msg, 1500);
    }
    function pushScheduleSafe() {
        try { const svc = CocTool.features.services; if (svc && svc.pushSchedule) svc.pushSchedule(); } catch (e) {}
    }
    function refreshDisplay() {
        const p = CocTool.features.progress;
        if (p && p.refresh) p.refresh();
    }
    // 设为排队：池满校验（有空闲工人无需排队；口径对齐主标题的 includeCompleted 计数）→ 存标记
    //（dur = 账号 JSON 里的原始 timer（导入时/录入时的值，不随时间递减）——用户 2026-11-02：
    // 导入时 timer=3600、过去 600s 后再排队，显示 1 小时而不是 50 分钟；pos 全局自增，组内有序即可）
    function queueItem(card) {
        const tag = state.currentAccount;
        const data = accounts[tag];
        if (!data || !data.tag) return;
        const p = CocTool.features.progress;
        if (p && p.simActive && p.simActive()) { toastSafe('推演中不可排队'); return; }
        const unique = card.getAttribute('data-unique');
        if (!unique) return;
        const nowSec = Math.floor(Date.now() / 1000);
        const items = calc.extractUpgradingItems(data, nowSec, true);
        const item = items.find(it => it.uniqueId === unique);
        if (!item) return;
        if (item.isRefiningTable || item.helper_recurrent === true) { toastSafe('该类型暂不支持排队'); return; }
        const g = calc.getItemCategory(item);
        const denoms = calc.getCategoryDenominators(data);
        if ((calc.getCategoryCounts(items)[g] || 0) < (denoms[g] || 0)) { toastSafe('该分类当前有空闲工人，无需排队'); return; }
        const qmap = calc.loadQueueMap(tag);
        // 基础时长只认条目上的本地字段 local_nominal（+升级 写入；游戏导出没有它，重导入即消失）——
        // 游戏直接导入的条目永远用原始 timer；程序内 +升级 的条目用名义值，避免「录入-导出」时差错算。
        const dur = calc.getQueueBaseDuration(item);
        qmap[unique.slice(data.tag.length + 1)] = { pos: 1 + Object.values(qmap).reduce((mx, m) => Math.max(mx, Number(m.pos) || 0), 0), dur: dur };
        calc.saveQueueMap(tag, qmap);
        refreshDisplay();
        pushScheduleSafe();
    }

    // 取消排队：仅清除排队标记——条目保持「升级中」原状（timer 未被排队动过，倒计时按录入时刻恢复），
    // 不删条目（2026-11-01 用户拍板：取消排队就只是取消排队）。已开工项不提供取消（模态不给按钮）。
    function cancelQueue(card) {
        const tag = state.currentAccount;
        if (!tag) return;
        const p = CocTool.features.progress;
        if (p && p.simActive && p.simActive()) { toastSafe('推演中不可操作'); return; }
        const unique = card.getAttribute('data-unique');
        if (!unique) return;
        calc.clearQueueMark(tag, unique);
        refreshDisplay();
        pushScheduleSafe();
    }

    // 立即完成（等级+1）/ 删除项目（等级不变）：终结一条升级，数据操作走 progress.finalizeCard 共用实现
    //（清 timer + 备忘/排队标记清理 + 落盘）；破坏性操作二次确认（对齐绿卡删除口径）
    function finishCard(card, addLevel, name) {
        const p = CocTool.features.progress;
        if (!p || !p.finalizeCard) return;
        if (p.simActive && p.simActive()) { toastSafe('推演中不可操作'); return; }
        CocTool.ui.showConfirm({
            title: addLevel ? '立即完成' : '删除项目',
            text: addLevel ? ('确认将「' + name + '」标记为已完成（等级+1）？') : ('确认删除「' + name + '」的升级记录（等级不变）？'),
            confirmText: addLevel ? '完成' : '删除',
            onConfirm: function () {
                if (p.finalizeCard(card, addLevel)) { refreshDisplay(); pushScheduleSafe(); }
            }
        });
    }

    // 长按动作选择：长按卡片先出「排队/立即完成/删除项目/备注」选择，点「编辑备注」才进备忘编辑（progress 的 openNoteModal）。
    // 排队中未触发可取消；已开工的排队项不可取消（对齐游戏"开工不可撤"）；
    // 已完成绿卡只给备注（完成确认/删除走卡片的点击链路）。
    function openItemActionsModal(card) {
        const tag = state.currentAccount;
        if (!tag) return;
        const unique = card.getAttribute('data-unique');
        const mark = unique ? calc.loadQueueMap(tag)[unique.slice(tag.length + 1)] : null;
        const qs = parseFloat(card.getAttribute('data-queue-start'));
        const queueStarted = !!mark && !isNaN(qs) && qs <= Date.now() / 1000;
        const completionTs = parseFloat(card.getAttribute('data-completion'));
        const isDone = !isNaN(completionTs) && completionTs <= Date.now() / 1000;
        const name = (card.querySelector('.card-name') || {}).textContent || '该项目';
        const btn = (cls, label) => '<button class="' + cls + ' w-full px-3 py-2 rounded-lg transition-all duration-200 text-sm">' + label + '</button>';
        // 按钮顺序（2026-11-01 用户拍板）：设为排队 → 编辑备注（紫）→ 删除项目 → 立即完成
        let actionBtns = '';
        if (!isDone) {
            if (mark) {
                if (!queueStarted) actionBtns += btn('__act-cancelq bg-orange-500 hover:bg-orange-600 text-white', '取消排队');
            } else {
                actionBtns += btn('__act-queue bg-blue-500 hover:bg-blue-600 text-white', '设为排队');
            }
        }
        actionBtns += btn('__act-note bg-purple-500 hover:bg-purple-600 text-white', '编辑备注');
        if (!isDone) {
            actionBtns += btn('__act-remove bg-red-500 hover:bg-red-600 text-white', '删除项目') +
                btn('__act-finish bg-green-600 hover:bg-green-700 text-white', '立即完成');
        }
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML =
            '<div class="modal-card w-xs item-actions-modal">' +
                '<h3 class="font-semibold text-gray-800 mb-3 text-center" style="font-size: 15px;">' + calc.escapeHtml(name) + '</h3>' +
                '<div class="flex flex-col space-y-2">' +
                    actionBtns +
                    btn('__act-close bg-gray-200 hover:bg-gray-300 text-gray-800', '取消') +
                '</div>' +
            '</div>';
        document.body.appendChild(overlay);
        // 模态关闭时同步解除卡片的长按抑制标记：长按抬指的合成 click 落在全屏 overlay 上、到不了卡片，
        // __noteLongPress 会卡在 true——不清掉的话下一次点卡被 bindCardDelete 的抑制检查吞掉（点两次才响应）
        const close = () => { overlay.remove(); card.__noteLongPress = false; };
        overlay.querySelector('.__act-queue')?.addEventListener('click', () => { close(); queueItem(card); });
        overlay.querySelector('.__act-cancelq')?.addEventListener('click', () => { close(); cancelQueue(card); });
        overlay.querySelector('.__act-finish')?.addEventListener('click', () => { close(); finishCard(card, true, name); });
        overlay.querySelector('.__act-remove')?.addEventListener('click', () => { close(); finishCard(card, false, name); });
        overlay.querySelector('.__act-note').addEventListener('click', () => {
            close();
            const p = CocTool.features.progress;
            if (p && p.openNoteModal) p.openNoteModal(card);
        });
        overlay.querySelector('.__act-close').addEventListener('click', close);
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    }

    // ========== 胜利之星（星标行）：主世界 / 夜世界各自独立的 24h 刷新计时器 ==========
    // 每颗星独立计数（0-2，最多囤 2 颗）+ 下一颗刷新时刻：到点计数+1（计 2 停表囤满）。
    // 点击按计数三分支：满 2 → 领一颗 + 重开 24h；计 1 → 领一颗、表不动（下一颗继续走）；
    // 计 0 → 没星可领，弹校准框手动设置下一颗的剩余时间（≤24h）。按账号隔离（tag 维度）。
    const STAR_KEY = 'clash_victory_stars';
    const STAR_DEFS = { home: '主世界', builder: '夜世界' };
    function loadStarAll() {
        try { return JSON.parse(localStorage.getItem(STAR_KEY)) || {}; } catch (e) { return {}; }
    }
    function saveStarAll(all) {
        try { localStorage.setItem(STAR_KEY, JSON.stringify(all)); } catch (e) {}
    }
    function saveStar(tag, key, st) {
        const all = loadStarAll();
        const acc = all[tag] || (all[tag] = {});
        acc[key] = st;
        saveStarAll(all);
    }
    // 读状态：无记录则从现在起 24h 起算（首见即开始倒计时）；到点惰性推进（App 关闭期间到点也能补计）。
    // 两个开关每星每账号独立：countEnabled = 计数（显示/领取），notifyEnabled = 重置通知（以计数为前提）。
    // 旧记录只有单一 enabled（启用=计数+通知都开）：读时迁移成两个字段并删旧键，保持原有行为。
    function starState(tag, key, nowSec) {
        const all = loadStarAll();
        const acc = all[tag] || (all[tag] = {});
        let st = acc[key];
        if (!st || typeof st.nextAt !== 'number') {
            st = acc[key] = { countEnabled: false, notifyEnabled: false, count: 0, nextAt: nowSec + 86400 };
            saveStarAll(all);
            return st;
        }
        let changed = false;
        if (typeof st.countEnabled !== 'boolean') { st.countEnabled = st.enabled === true; changed = true; }
        if (typeof st.notifyEnabled !== 'boolean') { st.notifyEnabled = st.enabled === true; changed = true; }
        if ('enabled' in st) { delete st.enabled; changed = true; }
        while (st.count < 2 && nowSec >= st.nextAt) {
            st.lastAt = st.nextAt;   // 刚过去的这次重置时刻（调度宽限条目用，见 starScheduleEntries）
            st.count++;
            st.lastCount = st.count; // 该次重置后的计数（宽限条目据此判「（已满）」——之后领星不影响这条的文案）
            st.nextAt += 86400;
            changed = true;
        }
        if (changed) saveStarAll(all);
        return st;
    }
    // 倒计时无秒格式化（一行要装两组计时器+宝箱，秒位省略；秒变化引起的宽度抖动也随之消失）
    function fmtNoSec(sec) {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        return h > 0 ? h + '时' + m + '分' : m + '分';
    }
    function renderStars() {
        const tag = state.currentAccount;
        const nowSec = Math.floor(Date.now() / 1000);
        [['home', 'helper-star'], ['builder', 'helper-star3']].forEach(pair => {
            const key = pair[0], pfx = pair[1];
            const timeEl = document.getElementById(pfx + '-time');
            const cntEl = document.getElementById(pfx + '-count');
            if (!timeEl || !cntEl) return;
            if (!tag) { timeEl.textContent = ''; cntEl.style.display = 'none'; return; }
            const st = starState(tag, key, nowSec);
            // 计数徽章仿助手等级徽章：<1（计 0）不显示；颜色走 CSS 类（.star-timer 两主题适配，.star-full 绿色强调）。
            // 计数未启用（每星独立开关）：显示「未启用」、无徽章；点击弹校准框可启用（只开计数不开通知也照常显示）
            if (st.countEnabled !== true) {
                timeEl.textContent = '未启用';
                timeEl.className = 'star-timer';
                cntEl.style.display = 'none';
                return;
            }
            if (st.count >= 2) {
                timeEl.textContent = '已满';
                timeEl.className = 'star-timer star-full';
                cntEl.textContent = '2';
                cntEl.style.display = 'inline-flex';
            } else {
                timeEl.textContent = fmtNoSec(Math.max(0, st.nextAt - nowSec));
                timeEl.className = 'star-timer';
                if (st.count >= 1) { cntEl.textContent = String(st.count); cntEl.style.display = 'inline-flex'; }
                else cntEl.style.display = 'none';
            }
        });
    }
    function starClick(key) {
        const tag = state.currentAccount;
        if (!tag) return;
        const nowSec = Math.floor(Date.now() / 1000);
        const st = starState(tag, key, nowSec);
        // 计数未启用：一律弹校准框（开关在框顶部启用后进入完整状态机；滚轮可顺带校准）
        if (st.countEnabled !== true) { starEditModal(tag, key); return; }
        if (st.count >= 2) {
            st.count = 1;                                   // 领一颗
            st.nextAt = nowSec + 86400;                     // 同时开始倒计时（重开 24h）
            saveStar(tag, key, st);
        } else if (st.count === 1) {
            st.count = 0;                                   // 领一颗，下一颗的表不动（不影响计时）
            saveStar(tag, key, st);
        } else {
            starEditModal(tag, key);                        // 计 0：没星可领 → 校准倒计时
            return;
        }
        pushScheduleSafe();                                 // 计数变化会改下一颗的消息/时刻（计 2→1 还重开表），必须重推调度
        renderStars();
    }
    // 计 0/未启用 校准框：两个开关（启用计数 / 启用通知）+ 滚轮（时 0-24 / 分 0-59，合计 clamp ≤24h；打开预填当前剩余）。
    // 计数是通知的前提：可以只开计数不开通知；开通知自动开计数；关计数连通知一起关。
    // 开关切换即时保存 + 重推调度；两者都关时隐藏时间区与「确定」（没有可校准的对象）。
    function starEditModal(tag, key) {
        const nowSec = Math.floor(Date.now() / 1000);
        const st = starState(tag, key, nowSec);
        const remain = Math.max(0, (st.nextAt || nowSec) - nowSec);
        const preH = Math.min(24, Math.floor(remain / 3600));
        const preM = Math.floor((remain % 3600) / 60);
        const pad = n => String(n).padStart(2, '0');
        const showTime = st.countEnabled === true || st.notifyEnabled === true;
        const toggle = (cls, on) =>
            '<label class="relative inline-flex items-center cursor-pointer">' +
                '<input type="checkbox" class="' + cls + ' sr-only peer"' + (on ? ' checked' : '') + '>' +
                '<div class="w-9 h-5 bg-gray-300 rounded-full peer peer-checked:bg-primary after:content-[\'\'] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>' +
            '</label>';
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML =
            '<div class="modal-card w-xs">' +
                '<h3 class="font-semibold text-gray-800 mb-2 text-center" style="font-size: 15px;">校准' + STAR_DEFS[key] + '胜利之星</h3>' +
                '<div class="flex items-center justify-between mb-2">' +
                    '<span class="text-sm text-gray-700">启用计数</span>' +
                    toggle('__star-count', st.countEnabled === true) +
                '</div>' +
                '<div class="flex items-center justify-between mb-2">' +
                    '<span class="text-sm text-gray-700">启用通知</span>' +
                    toggle('__star-notify', st.notifyEnabled === true) +
                '</div>' +
                '<p class="text-xs text-gray-500 mb-2">开启通知会自动开启计数</p>' +
                '<div class="__star-time"' + (showTime ? '' : ' style="display:none"') + '>' +
                    '<p class="text-xs text-gray-500 text-center mb-2">设置下一颗星的剩余时间（最长 24 小时）</p>' +
                    '<div class="flex items-start justify-center space-x-0.5 mb-2">' +
                        '<div class="picker-column" data-field="__star-h"><div class="picker-scroll"></div></div>' +
                        '<span class="text-xs text-gray-400" style="line-height:144px">时</span>' +
                        '<div class="picker-column" data-field="__star-m"><div class="picker-scroll"></div></div>' +
                        '<span class="text-xs text-gray-400" style="line-height:144px">分</span>' +
                    '</div>' +
                '</div>' +
                '<div class="flex flex-col space-y-2">' +
                    '<button class="__star-save w-full px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-all duration-200 text-sm"' + (showTime ? '' : ' style="display:none"') + '>确定</button>' +
                    '<button class="__star-cancel w-full px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition-all duration-200 text-sm">取消</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(overlay);

        const countEl = overlay.querySelector('.__star-count');
        const notifyEl = overlay.querySelector('.__star-notify');
        const timeEl = overlay.querySelector('.__star-time');
        const saveBtn = overlay.querySelector('.__star-save');
        const hourCol = overlay.querySelector('.picker-column[data-field="__star-h"]');
        const minCol = overlay.querySelector('.picker-column[data-field="__star-m"]');
        let wheelReady = false;
        // 时间区随开关显隐；首次显示时才初始化滚轮（隐藏元素没有布局，scrollPickerTo 定位不上）
        function syncTimeSection() {
            const show = st.countEnabled === true || st.notifyEnabled === true;
            timeEl.style.display = show ? '' : 'none';
            saveBtn.style.display = show ? '' : 'none';
            if (show && !wheelReady) {
                wheelReady = true;
                CocTool.ui.initScrollPicker(hourCol, Array.from({ length: 25 }, (_, i) => pad(i)));   // 0-24 时
                CocTool.ui.initScrollPicker(minCol, Array.from({ length: 60 }, (_, i) => pad(i)));    // 0-59 分
                CocTool.ui.scrollPickerTo(hourCol, pad(preH));
                CocTool.ui.scrollPickerTo(minCol, pad(preM));
            }
        }
        syncTimeSection();
        countEl.addEventListener('change', function () {
            if (this.checked) {
                st.countEnabled = true;
            } else {
                st.countEnabled = false;
                st.notifyEnabled = false;   // 计数是通知的前提：关计数连通知一起关
                notifyEl.checked = false;
            }
            saveStar(tag, key, st);
            syncTimeSection();
            pushScheduleSafe();             // 开关即时生效（重推调度）
        });
        notifyEl.addEventListener('change', function () {
            if (this.checked) {
                st.notifyEnabled = true;
                st.countEnabled = true;     // 开通知自动开计数
                countEl.checked = true;
            } else {
                st.notifyEnabled = false;
            }
            saveStar(tag, key, st);
            syncTimeSection();
            pushScheduleSafe();
        });
        const close = () => overlay.remove();
        saveBtn.addEventListener('click', () => {
            const h = Math.floor(Number(CocTool.ui.getPickerValue(hourCol)) || 0);
            const m = Math.floor(Number(CocTool.ui.getPickerValue(minCol)) || 0);
            const now2 = Math.floor(Date.now() / 1000);
            const stNow = starState(tag, key, now2);
            stNow.nextAt = now2 + Math.min(86400, h * 3600 + m * 60);
            saveStar(tag, key, stNow);
            close();
            pushScheduleSafe();   // 校准改的是下一颗的时刻，必须立刻重推调度（否则设备上还是旧闹钟）
            renderStars();
        });
        overlay.querySelector('.__star-cancel').addEventListener('click', close);
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    }

    // 胜利之星重置通知的调度条目（services.buildNotificationSchedule 按账号调用拼进总调度）：
    // ① 未来的一次重置：表在走（count<2）时排 nextAt，message 按到点后的计数预测——计 2 带「（已满）」；
    // ② 刚过去的一次重置（lastAt，宽限 10 分钟）：闹钟到点与「每 5 分钟重调度」同刻时，重调度会把条目改成
    //    下一颗（id/消息都换）→ 已排的闹钟会被 Java 判成残留副本而拦掉；保留这条到期条目走 Java 的「补发」，
    //    已正常发过的由已发记录去重跳过（不会重复通知）。
    // id 含事件时刻：同事件重推幂等，换事件（重置/校准）即换 dedupKey（recurrent 同款）。
    // 计 2 停表 / 通知未启用（st.notifyEnabled，每星独立）→ 不排未来条目；计数未启用时通知也不排（前提关系）。
    function starScheduleEntries(tag, accountName, now) {
        const out = [];
        [['home', '主世界'], ['builder', '夜世界']].forEach(pair => {
            const key = pair[0], world = pair[1];
            const st = starState(tag, key, now);
            if (st.notifyEnabled !== true || st.countEnabled !== true) return;   // 通知未启用 / 计数未启用（前提）→ 不排
            const msg = full => accountName + '\n' + world + '胜利之星已重置' + (full ? '（已满）' : '');
            if (st.count < 2 && st.nextAt > now) {
                out.push({
                    timestamp: st.nextAt,
                    message: msg(st.count + 1 >= 2),
                    id: tag + '_star_' + key + '_' + st.nextAt,
                    type: 'other'
                });
            }
            if (typeof st.lastAt === 'number' && now >= st.lastAt && now - st.lastAt <= 600) {
                const lastFull = typeof st.lastCount === 'number' ? st.lastCount >= 2 : st.count >= 2;
                out.push({
                    timestamp: st.lastAt,
                    message: msg(lastFull),
                    id: tag + '_star_' + key + '_' + st.lastAt,
                    type: 'other'
                });
            }
        });
        return out;
    }

    CocTool.features.queue = Object.freeze({ queueItem, cancelQueue, openItemActionsModal, renderStars, starClick, starScheduleEntries });
})(window);
