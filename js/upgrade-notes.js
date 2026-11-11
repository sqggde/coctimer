/**
 * 升级卡片备忘域（2026-11-08 自 progress.js 拆出：模块 80KB 提醒线，F-20261108-2）
 *
 * 数据（clash_upgrade_notes，键 = 分类_data_lvl_完成时刻）+ 长按手势（长按出 queue 的动作模态）
 * + 备忘编辑模态。消费方出口不变：accounts.js 导入重对齐 / queue.js「编辑备注」/ services.js 通知第三行
 * 均经 CocTool.features.progress 委托（本模块不改变 features.progress 面）。
 * 依赖：core.js；回渲经 features.progress.refresh。
 */
(function (global) {
    'use strict';

    const CocTool = global.CocTool;
    if (!CocTool || !CocTool.state || !CocTool.calc) {
        throw new Error('upgrade-notes.js requires core.js');
    }

    const state = CocTool.state;
    const calc = CocTool.calc;

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

    // 长按卡片（touch/mouse 通用，500ms，位移>10px 取消）→ 动作模态（排队/备注/立即完成；已完成卡不再提供长按动作）
    // 长按后抑制本次 click（删除弹窗不弹出）
    function bindNoteLongPress(card) {
        if (card.__noteBound) return;
        card.__noteBound = true;
        let timer = null, startX = 0, startY = 0;
        function start(e) {
            // 清掉上一次长按没走到 click 的残留（长按后把手指移出卡片再释放不会产生 click）：
            // 否则残留标记会吞掉下一次正常点击（点两次才响应）
            card.__noteLongPress = false;
            const pt = e.touches ? e.touches[0] : e;
            startX = pt.clientX; startY = pt.clientY;
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                timer = null;
                card.__noteLongPress = true;
                CocTool.features.queue.openItemActionsModal(card);   // 长按动作选择（queue.js）：排队/备注
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
                    '<button class="__note-cancel modal-cancel-link">取消</button>' +
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
            CocTool.features.progress.refresh();
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


    CocTool.features.upgradeNotes = Object.freeze({
        loadNotes,
        saveNotes,
        getNoteForItem,
        reconcileNotes,
        bindNoteLongPress,
        openNoteModal
    });
})(window);
