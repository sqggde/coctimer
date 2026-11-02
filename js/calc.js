(function (global) {
    'use strict';

    const CocTool = global.CocTool;
    if (!CocTool || !CocTool.state || !CocTool.storage || !CocTool.names) {
        throw new Error('calc.js requires core.js and names.js');
    }

    const state = CocTool.state;
    const settings = state.settings;
    const accounts = state.accounts;
    const accountNotes = state.accountNotes;
    const accountOrder = state.accountOrder;
    const ITEM_NAMES = CocTool.names.ITEM_NAMES;
    const CATEGORY_NAMES = CocTool.names.CATEGORY_NAMES;
    const CATEGORY_ICONS = CocTool.names.CATEGORY_ICONS;

    // ========== 2026 盛夏活动加速计算 ==========
    const EVENT_START = 1783267200;
    const EVENT_MID   = 1784534400;
    const EVENT_END   = 1785945600;

    const EVENT_TABLE = {
        3:  [1.5, 2.0], 4:  [1.5, 2.0], 5:  [1.5, 2.0],
        6:  [1.5, 2.0], 7:  [1.5, 2.0], 8:  [1.5, 2.0],
        9:  [1.5, 2.0], 10: [1.5, 2.0], 11: [1.5, 2.0],
        12: [1.5, 2.0], 13: [1.5, 2.0], 14: [1.5, 2.0],
        15: [1.5, 2.0], 16: [1.5, 2.0],
        17: [1.25, 1.5], 18: [1.25, 1.5],
    };

    function getEventPeriod() {
        const now = Math.floor(Date.now() / 1000);
        if (now < EVENT_MID) return 1;
        return 2;
    }

    function getTownHallLevel(data) {
        if (!data || !data.buildings) return null;
        const th = data.buildings.find(b => b.data === 1000001);
        return th ? (th.lvl || 0) : null;
    }

    function isCnAccount(data) {
        if (!data) return false;
        if (data._server) return data._server === 'cn';
        // 老数据未检测区服：沿用历史近似判断（存在国服工人助手 124000000 视为国服）
        return (data.helpers || []).some(h => h.data === 124000000);
    }

    function shouldApplyEventBoost(data) {
        if (!data) return false;
        const thLevel = getTownHallLevel(data);
        if (thLevel === null || thLevel < 3 || thLevel > 18) return false;
        // 夏日活动仅国服账号生效；权威区服判断见 accounts.detectAccountServer
        if (data._server === 'intl') return false;
        if (data._server === undefined) {
            // 老数据未检测区服：沿用历史近似判断（存在国际服实验室助手 93000001 视为国际服）
            const helpers = data.helpers || [];
            return !helpers.some(h => h.data === 93000001 && h.lvl > 0);
        }
        return true;
    }

    function getEffectiveEventMultiplier(data) {
        if (!data || !shouldApplyEventBoost(data)) return 1;
        // 活动窗口外（未开始/已结束）一律 ×1，忽略用户选择
        const now = Math.floor(Date.now() / 1000);
        if (now < EVENT_START || now >= EVENT_END) return 1;
        if (settings && settings.eventBoostOverride && settings.eventBoostOverride[data.tag] !== undefined) {
            const override = settings.eventBoostOverride[data.tag];
            if (override === 0) return 1;
            if ([1, 1.25, 1.5, 2].includes(override)) return override;
        }
        return 1;
    }

    function getEventRecommendation(data) {
        const now = Math.floor(Date.now() / 1000);
        if (now < EVENT_START) return '活动未开始';
        if (now >= EVENT_END) return '';
        const thLevel = getTownHallLevel(data);
        if (thLevel === null) return '';
        const row = EVENT_TABLE[thLevel];
        if (!row) return '';
        const period = getEventPeriod();
        const recMult = row[period - 1];
        return '建议选择×' + recMult;
    }

    // ========== 助手冷却功能 ==========
    function hasRecurrentItem(data, categories) {
        for (const cat of categories) {
            if (data[cat] && Array.isArray(data[cat])) {
                for (const item of data[cat]) {
                    if (item.helper_recurrent === true) return true;
                    if (item.data === 1000097 && item.types && Array.isArray(item.types)) {
                        for (const type of item.types) {
                            if (type.modules && Array.isArray(type.modules)) {
                                for (const module of type.modules) {
                                    if (module.helper_recurrent === true) return true;
                                }
                            }
                        }
                    }
                }
            }
        }
        return false;
    }

    function hasActiveRecurrent(data, categories) {
        for (const cat of categories) {
            const items = data[cat];
            if (!items || !Array.isArray(items)) continue;
            for (const item of items) {
                if (item.helper_recurrent === true && item.timer > 0) return true;
                if (item.data === 1000097 && item.types) {
                    for (const type of item.types) {
                        if (type.modules) {
                            for (const mod of type.modules) {
                                if (mod.helper_recurrent === true && mod.timer > 0) return true;
                            }
                        }
                    }
                }
            }
        }
        return false;
    }

    function isHelperReady(data, dataId, categories) {
        const h = (data.helpers || []).find(x => x.data === dataId);
        if (!h) return false;
        const elapsed = Math.floor(Date.now() / 1000) - (data.timestamp || 0);
        if ((h.helper_cooldown || 0) > elapsed) return false;
        if (categories && hasActiveRecurrent(data, categories)) return false;
        return true;
    }

    function isClockTowerReady(data) {
        var boosts = data.boosts || {};
        var b2 = data.buildings2 || [];
        var upgrading = b2.some(function(x) { return x.data === 1000039 && x.timer > 0; });
        if (upgrading) return false;
        var elapsed = Math.floor(Date.now() / 1000) - (data.timestamp || Math.floor(Date.now() / 1000));
        return (boosts.clocktower_cooldown || 0) - elapsed <= 0;
    }

    function getRecurrentCooldown(initialCooldown, elapsed) {
        if (elapsed < initialCooldown) {
            return initialCooldown - elapsed;
        }
        const cycleElapsed = (elapsed - initialCooldown) % 82800;
        return 82800 - cycleElapsed;
    }

    function getRecurrentPhase(item, data) {
        const scheduledAt = item.helper_scheduled || 0;
        if (scheduledAt > 0 && item.helper_recurrent !== true) {
            // 单次预约窗（推演指派）：hc 归零后加速一次，结束即无图标
            const timestamp0 = data.timestamp || Math.floor(Date.now() / 1000);
            const elapsed0 = Math.floor(Date.now() / 1000) - timestamp0;
            if (elapsed0 < scheduledAt) return 'wait';
            if (elapsed0 < scheduledAt + 3600) return 'boost';
            return null;
        }
        if (item.helper_recurrent !== true) return null;
        const helpers = data.helpers || [];
        const timestamp = data.timestamp || Math.floor(Date.now() / 1000);
        const now = Math.floor(Date.now() / 1000);
        const elapsed = now - timestamp;

        let helper;
        if (["buildings", "heroes", "traps", "guardians"].includes(item.category)) {
            helper = helpers.find(h => h.data === 124000000 || h.data === 93000000);
        } else if (["units", "siege_machines", "spells"].includes(item.category)) {
            helper = helpers.find(h => h.data === 124000001 || h.data === 93000001);
        }
        if (!helper) return null;

        const initialCooldown = helper.helper_cooldown || 82800;
        const boostRemaining = item.helper_timer || 0;
        if (elapsed < boostRemaining) return 'boost';
        if (elapsed < initialCooldown) return 'wait';
        const cycleElapsed = (elapsed - initialCooldown) % 82800;
        return cycleElapsed < 3600 ? 'boost' : 'wait';
    }

    function escapeHtml(str) { return String(str).replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m])); }

    function getItemPhaseIcon(item, data) {
        const buildBtn = (icon, phase, helperTimer, recurrent) => {
            const usage = getHelperUsage(item, data);
            const countHtml = usage ? '<span class="phase-count">' + usage.count + '</span>' : '';
            return ' <span class="phase-icon-btn" data-phase="' + phase + '" data-unique="' + escapeHtml(item.uniqueId) + '" data-helper-timer="' + helperTimer + '" data-helper-recurrent="' + recurrent + '" data-helper-scheduled="' + (item.helper_scheduled || 0) + '" data-usage-count="' + (usage ? usage.count : '') + '" data-usage-saved="' + (usage ? usage.savedSec : 0) + '" style="cursor:pointer;" title="点击查看详情"><i class="' + icon + '"></i>' + countHtml + '</span>';
        };
        const phase = getRecurrentPhase(item, data);
        if (phase === 'boost') return buildBtn('fa fa-bolt', 'boost', (item.helper_timer || 0), 'true');
        if (phase === 'wait') return buildBtn('fa fa-hourglass', 'wait', (item.helper_timer || 0), 'true');

        if (item.helper_timer > 0) {
            const helpers = data.helpers || [];
            const timestamp = data.timestamp || Math.floor(Date.now() / 1000);
            const now = Math.floor(Date.now() / 1000);
            const elapsed = now - timestamp;
            if (elapsed < item.helper_timer) {
                return buildBtn('fa fa-bolt', 'boost', item.helper_timer, 'false');
            }
        }
        return '';
    }

    // 助手生效用量：count = 完成时刻前开始的工作窗个数（整数；首段被游戏消耗、末次被完成截断
    // 都计整次，不出现小数）；savedSec = 无助手完成时刻 − 有助手完成时刻。
    // 窗口表与 calculateStaged 的锚定一致（ht>0：[0,ht) 后每 82800 一个 1h 窗；ht=0：[hc,hc+3600) 起）。
    function getHelperUsage(item, data) {
        const helpers = data.helpers || [];
        let helper = null;
        if (["buildings", "heroes", "traps", "guardians"].includes(item.category)) {
            helper = helpers.find(h => h.data === 124000000 || h.data === 93000000);
        } else if (["units", "siege_machines", "spells"].includes(item.category)) {
            helper = helpers.find(h => h.data === 124000001 || h.data === 93000001);
        }
        if (!helper) return null;

        const doneAt = calculateCompletionTimestamp(item, data);
        const bare = Object.assign({}, item);
        delete bare.helper_timer;
        delete bare.helper_recurrent;
        const savedSec = Math.max(0, calculateCompletionTimestamp(bare, data) - doneAt);
        const horizon = doneAt - (data.timestamp || Math.floor(Date.now() / 1000));   // 导出时刻 → 完成时刻

        const ht = item.helper_timer || 0;
        const sched = item.helper_scheduled || 0;
        const wins = [];
        if (helper.lvl > 0 && sched > 0 && item.helper_recurrent !== true) {
            wins.push([sched, 3600]);   // 单次预约窗：hc 归零后加速一次
        } else if (helper.lvl > 0 && item.helper_recurrent === true) {
            if (ht > 0) {
                wins.push([0, ht]);
                for (let s = ht + 79200; wins.length < 2000; s += 82800) wins.push([s, 3600]);
            } else {
                const hc = helper.helper_cooldown || 0;
                wins.push([hc, 3600]);
                for (let s = hc + 82800; wins.length < 2000; s += 82800) wins.push([s, 3600]);
            }
        } else if (helper.lvl > 0 && ht > 0) {
            wins.push([0, ht]);
        }
        let count = 0;
        for (const w of wins) {
            if (w[0] >= horizon) break;
            count++;
        }
        return { count: count, savedSec: savedSec };
    }

    // ===== 道具使用推演（字面截断副本，2026-09-19 定稿）=====
    // 药水一瓶 → 秒：钟楼 1800s，其余 3600s
    function potionUnitSec(key) {
        return key === 'clocktower_boost' ? 1800 : 3600;
    }

    // 钟楼自身启动的加速时长：1级14分钟，每级+2分钟（10级32分钟）
    function clockTowerBoostSec(lvl) {
        return (12 + 2 * (lvl || 1)) * 60;
    }

    // 已消耗工程量：max{W : completion(timer=W) ≤ now}——完成时刻对 timer 单调，
    // 二分反演公开的完成时刻函数（黑盒），calculateStaged 内部零改动
    function workDoneBy(item, data, now) {
        if (calculateCompletionTimestamp(item, data) <= now) return item.timer;   // 整项已完成
        const probe = Object.assign({}, item);
        let lo = 0, hi = item.timer;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            probe.timer = mid;
            if (calculateCompletionTimestamp(probe, data) <= now) lo = mid; else hi = mid - 1;
        }
        return lo;
    }

    // 助手时间线截断：e<冷却结束 → 线性减（htBase=null 表示逐项 max(0, ht−e)）；
    // 已进 82800 循环 → 窗口中 htBase=3600−cyc、cooldown=htBase+79200；冷却中 htBase=0、cooldown=82800−cyc
    function truncateHelperTiming(cooldown, e) {
        const C = cooldown || 0;
        if (e < C) return { cooldown: C - e, htBase: null };
        const cyc = (e - C) % 82800;
        if (cyc < 3600) {
            const ht = 3600 - cyc;
            return { cooldown: ht + 79200, htBase: ht };
        }
        return { cooldown: 82800 - cyc, htBase: 0 };
    }

    const SNAPSHOT_CATEGORIES = ["buildings", "buildings2", "heroes", "heroes2", "units", "units2", "spells", "siege_machines", "pets", "traps", "traps2", "guardians"];
    function snapshotHelperIds(cat) {
        if (["buildings", "heroes", "traps", "guardians"].includes(cat)) return [124000000, 93000000];
        if (["units", "siege_machines", "spells"].includes(cat)) return [124000001, 93000001];
        return null;
    }

    // 快照 = 字面截断副本：timestamp=now、boosts 换剩余、升级项 timer 折算剩余工程量、助手字段取模截断。
    // 纯游戏格式（无私有字段）；不变量：截断后每个计时条目的完成时刻与截断前位级相等（性质测试钉死）。
    function snapshotAccount(data, now) {
        const snap = JSON.parse(JSON.stringify(data));
        const e = now - (data.timestamp || now);
        snap.timestamp = now;
        if (e <= 0) return snap;
        // ① 剩余工程量：对原始时间轴二分（须在 boosts/助手截断之前收集）
        SNAPSHOT_CATEGORIES.forEach(cat => {
            const arr = Array.isArray(snap[cat]) ? snap[cat] : [];
            arr.forEach(entry => {
                const objs = entry.types && Array.isArray(entry.types)
                    ? entry.types.reduce((acc, t) => acc.concat(t.modules || []), [])
                    : [entry];
                objs.forEach(obj => {
                    if (!(obj.timer > 0)) return;
                    const probe = Object.assign({}, obj, { category: cat, helper_timer: obj.helper_timer || entry.helper_timer || 0 });
                    // 注意：反演必须对**原始时间轴**（data）——snap.timestamp 已改为 now；
                    // 已完成项（完成时刻 ≤ now）清零：避免其在推演中复活为未来完成（应用时等价"清理已完成"）
                    if (calculateCompletionTimestamp(probe, data) > now) {
                        obj.timer = obj.timer - workDoneBy(probe, data, now);
                    } else {
                        obj.timer = 0;
                    }
                });
            });
        });
        // ② 助手时间线截断：按**助手分组**判定循环（与总览区 getHelperCooldowns 的 hasRecurrentItem 同口径，
        // 分组内任一条目带循环标记即为该助手走周期投影），整组共用；无循环条目（含完全未指派）→ 线性递减
        //（否则就绪助手会被误判为"窗口进行中"投影出 23h，且实验室的循环条目在 spells 时会漏判 units）
        const HELPER_GROUPS = [["buildings", "heroes", "traps", "guardians"], ["units", "spells", "siege_machines"]];
        const groupHasRec = cats => cats.some(c => {
            const arr = Array.isArray(snap[c]) ? snap[c] : [];
            let r = false;
            arr.forEach(entry => {
                if (entry.helper_recurrent === true) r = true;
                (entry.types || []).forEach(t => (t.modules || []).forEach(m => { if (m.helper_recurrent === true) r = true; }));
            });
            return r;
        });
        const catParams = {};
        SNAPSHOT_CATEGORIES.forEach(cat => {
            const ids = snapshotHelperIds(cat);
            if (!ids) return;
            const helper = (snap.helpers || []).find(h => ids.includes(h.data));
            const C = helper ? (helper.helper_cooldown || 0) : 0;
            const group = HELPER_GROUPS.find(g => g.includes(cat));
            catParams[cat] = groupHasRec(group)
                ? truncateHelperTiming(C, e)
                : { cooldown: Math.max(0, C - e), htBase: null };
        });
        (snap.helpers || []).forEach(h => {
            for (const cat in catParams) {
                if (snapshotHelperIds(cat).includes(h.data)) { h.helper_cooldown = catParams[cat].cooldown; break; }
            }
        });
        SNAPSHOT_CATEGORIES.forEach(cat => {
            const params = catParams[cat];
            if (!params) return;
            const arr = Array.isArray(snap[cat]) ? snap[cat] : [];
            arr.forEach(entry => {
                const targets = entry.types && Array.isArray(entry.types)
                    ? entry.types.reduce((acc, t) => (t.modules || []).forEach(m => acc.push({
                        obj: m,
                        recurrent: m.helper_recurrent === true || entry.helper_recurrent === true,
                        ht: m.helper_timer || entry.helper_timer || 0
                    })) || acc, []).concat([{ obj: entry, recurrent: entry.helper_recurrent === true, ht: entry.helper_timer || 0 }])
                    : [{ obj: entry, recurrent: entry.helper_recurrent === true, ht: entry.helper_timer || 0 }];
                targets.forEach(t => {
                    if (params.htBase !== null) {
                        if (t.recurrent) t.obj.helper_timer = params.htBase;
                        else if (t.ht > 0) t.obj.helper_timer = Math.max(0, t.ht - e);
                    } else if (t.ht > 0) {
                        t.obj.helper_timer = Math.max(0, t.ht - e);
                    }
                    // 单次预约窗截断：未到点→平移；进行中→转为会话（helper_timer）；已结束→清除
                    if (t.obj.helper_scheduled > 0) {
                        const ws = t.obj.helper_scheduled;
                        if (e < ws) t.obj.helper_scheduled = ws - e;
                        else if (e < ws + 3600) { delete t.obj.helper_scheduled; if (!(t.obj.helper_timer > 0)) t.obj.helper_timer = ws + 3600 - e; }
                        else delete t.obj.helper_scheduled;
                    }
                });
            });
        });
        // ③ boosts 换剩余时长（钟楼冷却等同规则线性折算）
        if (snap.boosts) Object.keys(snap.boosts).forEach(k => { snap.boosts[k] = Math.max(0, (snap.boosts[k] || 0) - e); });
        return snap;
    }

    function getHelperCooldowns() {
        if (!state.currentAccount || !accounts[state.currentAccount]) return null;
        const data = accounts[state.currentAccount];
        const timestamp = data.timestamp || Math.floor(Date.now() / 1000);
        const now = Math.floor(Date.now() / 1000);
        const helpers = data.helpers || [];
        const boosts = data.boosts || {};

        const worker = helpers.find(h => h.data === 124000000 || h.data === 93000000);
        const lab = helpers.find(h => h.data === 124000001 || h.data === 93000001);

        const hasRecurrentWorker = hasRecurrentItem(data, ["buildings", "heroes", "traps", "guardians"]);
        const hasRecurrentLab = hasRecurrentItem(data, ["units", "siege_machines", "spells"]);

        const elapsed = now - timestamp;

        let workerCooldown = 0;
        if (worker) {
            if (hasRecurrentWorker) {
                const initial = worker.helper_cooldown || 82800;
                workerCooldown = getRecurrentCooldown(initial, elapsed);
            } else {
                workerCooldown = worker.helper_cooldown ? Math.max(0, worker.helper_cooldown - elapsed) : 0;
            }
        }

        let labCooldown = 0;
        if (lab) {
            if (hasRecurrentLab) {
                const initial = lab.helper_cooldown || 82800;
                labCooldown = getRecurrentCooldown(initial, elapsed);
            } else {
                labCooldown = lab.helper_cooldown ? Math.max(0, lab.helper_cooldown - elapsed) : 0;
            }
        }

        const clockCooldown = boosts.clocktower_cooldown ? Math.max(0, boosts.clocktower_cooldown - elapsed) : 0;
        const clockUpgrading = data.buildings2 && Array.isArray(data.buildings2) && data.buildings2.some(item => item.data === 1000039 && item.timer > 0);
        return { worker: workerCooldown, lab: labCooldown, clock: clockCooldown, clockUpgrading, hasRecurrentWorker, hasRecurrentLab };
    }

    // ========== 分阶段叠加计算 ==========
    // 药水与辅食（工人药水+工人大餐、实验室药水/战宠药水+研究浓汤）可同时生效：
    // 两者都是自 timestamp 起的前缀窗口，重叠段速率 = A + B − 1（倍率相加扣回基准 1：
    // 实测 10+2=11、国服 24h 模式 24+2=25、24+4=27）。
    function mergeBoostPhases(a, b) {
        const wins = [a, b].filter(w => w && w.duration > 0 && w.mult > 0);
        if (wins.length === 2) {
            const [x, y] = wins;
            const lo = Math.min(x.duration, y.duration);
            const hi = Math.max(x.duration, y.duration);
            const phases = [];
            if (lo > 0) phases.push({ duration: lo, mult: x.mult + y.mult - 1 });
            if (hi > lo) phases.push({ duration: hi - lo, mult: x.duration >= y.duration ? x.mult : y.mult });
            return phases;
        }
        if (wins.length === 1) return [{ duration: wins[0].duration, mult: wins[0].mult }];
        return [];
    }

    // boostA/boostB：{duration, mult} | null，均为自 timestamp 起的前缀加速窗口
    function calculateStaged(timer, helperLevel, helperDuration, helperCooldown, boostA, boostB, recurrent, eventMult = 1, scheduledAt = 0, startDelay = 0) {
        const em = eventMult || 1;
        const phases = mergeBoostPhases(boostA, boostB).map(p => ({ ...p }));
        let remaining = timer;
        let elapsed = 0;
        const segs = [];
        const pushSeg = (dur, rate) => { if (dur > 0) segs.push({ dur, rate }); };
        let phaseIdx = 0;
        // 排队项：开工前还要等 startDelay 秒——先按时间轴消耗这段时间里流逝的加速窗口（不做工），
        // 助手冷却/工作窗/预约窗也同步前移；startDelay=0（普通项）时整段逻辑不生效，与旧行为完全一致。
        if (startDelay > 0) {
            let skip = startDelay;
            while (skip > 0 && phaseIdx < phases.length) {
                const t = Math.min(skip, phases[phaseIdx].duration);
                phases[phaseIdx].duration -= t;
                skip -= t;
                if (phases[phaseIdx].duration <= 0) phaseIdx++;
            }
            if (helperCooldown > 0) helperCooldown = Math.max(0, helperCooldown - startDelay);
            if (helperDuration > 0) helperDuration = Math.max(0, helperDuration - startDelay);
            if (scheduledAt > 0) scheduledAt = Math.max(0, scheduledAt - startDelay);
        }
        // 从当前加速位置起取 want 秒加速段（速率 = 段倍率 + extra），返回加速段未覆盖的剩余时长
        const takePhases = (want, extra) => {
            let left = want;
            while (left > 0 && phaseIdx < phases.length) {
                const t = Math.min(left, phases[phaseIdx].duration);
                pushSeg(t, phases[phaseIdx].mult + extra);
                phases[phaseIdx].duration -= t;
                left -= t;
                if (phases[phaseIdx].duration <= 0) phaseIdx++;
            }
            return left;
        };

        let hasHelper = helperDuration > 0 && helperLevel > 0;
        let workStart = 0;
        let workDur = 0;

        if (helperLevel > 0 && helperDuration === 0 && helperCooldown > 0) {
            // 助手冷却段：加速窗口覆盖其前缀（按段倍率），未被覆盖的余量按常速
            const uncovered = takePhases(helperCooldown, 0);
            pushSeg(uncovered, em);
        }
        if (recurrent === true && !hasHelper && helperLevel > 0) {
            hasHelper = true;
            workDur = 3600;
            workStart = helperCooldown;   // 循环注入：工作窗从冷却结束后开始
        } else if (hasHelper) {
            workDur = helperDuration;
        } else if (scheduledAt > 0 && helperLevel > 0) {
            hasHelper = true;             // 单次预约窗（推演指派）：hc 归零后加速一次，不循环
            workDur = 3600;
            workStart = scheduledAt;
        }

        if (hasHelper) {
            const uncovered = takePhases(workDur, helperLevel);   // 工作窗 ∩ 加速段
            pushSeg(uncovered, helperLevel + em);                 // 工作窗在加速段外的部分
        }
        takePhases(Infinity, 0);                                  // 加速段余量（工作窗之后，无助手加成）

        for (const s of segs) {
            if (remaining <= s.dur * s.rate) return elapsed + Math.ceil(remaining / s.rate);
            remaining -= s.dur * s.rate;
            elapsed += s.dur;
        }

        if (recurrent === true && helperLevel > 0) {
            // 下一工作窗起点：首个会话结束后，若共享冷却时钟（hc）晚于会话结束则对齐它（助手共享冷却：
            // 后进入冷却的一方对齐先进入方，hc 归零后双方同时开工），否则标准 22h；之后按 82800 周期
            let nextWindow = workStart + workDur + 22 * 3600;
            if (helperDuration > 0 && helperCooldown > 0) {
                nextWindow = Math.max(workStart + workDur, helperCooldown);   // 共享冷却对齐（含 hc < 会话时长：会话结束即开工）
            }
            let cooldownRemaining = Math.max(0, nextWindow - elapsed);
            while (remaining > 0) {
                if (cooldownRemaining > 0) {
                    if (remaining <= cooldownRemaining * em) {
                        return elapsed + Math.ceil(remaining / em);
                    }
                    remaining -= cooldownRemaining * em;
                    elapsed += cooldownRemaining;
                }

                const workPerCycle = 3600 * (helperLevel + em);
                if (remaining <= workPerCycle) {
                    return elapsed + Math.ceil(remaining / (helperLevel + em));
                }
                remaining -= workPerCycle;
                elapsed += 3600;

                cooldownRemaining = 22 * 3600;
            }
        }

        return elapsed + Math.ceil(remaining / em);
    }

    // ========== 核心：计算完成时间 ==========
    // 按类别取当前生效的加速窗口（药水与辅食可同时生效，各自独立计时）
    function getBoostWindows(data, category) {
        const boosts = data.boosts || {};
        if (["buildings", "heroes", "traps", "guardians"].includes(category)) {
            const is24 = settings.builderBoostMode24 && settings.builderBoostMode24[data.tag];
            return [
                boosts.builder_boost ? { duration: boosts.builder_boost, mult: is24 ? 24 : 10 } : null,
                boosts.builder_consumable ? { duration: boosts.builder_consumable, mult: 2 } : null
            ];
        }
        if (["units", "siege_machines", "spells"].includes(category)) {
            return [
                boosts.lab_boost ? { duration: boosts.lab_boost, mult: 24 } : null,
                boosts.lab_consumable ? { duration: boosts.lab_consumable, mult: 4 } : null
            ];
        }
        if (category === "pets") {
            return [
                boosts.pet_boost ? { duration: boosts.pet_boost, mult: 24 } : null,
                boosts.lab_consumable ? { duration: boosts.lab_consumable, mult: 4 } : null
            ];
        }
        if (["buildings2", "traps2", "heroes2", "units2"].includes(category)) {
            return [boosts.clocktower_boost ? { duration: boosts.clocktower_boost, mult: 10 } : null, null];
        }
        return [null, null];
    }

    // 排队标记读写（localStorage clash_upgrade_queue，结构同 clash_upgrade_notes：{tag:{键:{pos,dur}}}）。
    // 放 calc 层是刻意的：extract 是所有消费方（列表/通知/小组件/总进度）的单一取数口，
    // 在这里注入模拟结果即可让全链路自动生效；交互 UI（设排队/取消）在 progress.js，经此读写。
    function loadQueueMap(tag) {
        if (!tag) return {};
        try {
            const all = JSON.parse(localStorage.getItem('clash_upgrade_queue')) || {};
            const m = all[tag];
            return (m && typeof m === 'object') ? m : {};
        } catch (e) { return {}; }
    }
    function saveQueueMap(tag, map) {
        try {
            const all = JSON.parse(localStorage.getItem('clash_upgrade_queue')) || {};
            all[tag] = map || {};
            localStorage.setItem('clash_upgrade_queue', JSON.stringify(all));
        } catch (e) {}
    }
    // 排队基础时长：+升级 条目带本地名义值 local_nominal（游戏导出没有这个字段），有则用名义值，
    // 否则用原始 timer（游戏直接导入的条目永远走这条，保证与游戏内显示一致）。
    function getQueueBaseDuration(item) {
        const nominal = Math.round(Number(item && item.local_nominal) || 0);
        return nominal > 0 ? nominal : Math.max(1, Math.round(Number(item && item.timer) || 0));
    }
    // 清单条排队标记（取消排队/完成删除/固化共用；unique 含 tag 前缀）
    function clearQueueMark(tag, unique) {
        if (!tag || !unique) return;
        const qm = loadQueueMap(tag);
        const k = unique.slice(tag.length + 1);
        if (qm[k]) { delete qm[k]; saveQueueMap(tag, qm); }
    }

    // ===== 排队模拟（纯函数）：工人队列的事件流模型 =====
    // 每个非排队升级项的完成时刻 = 一次"工人空出"事件；排队项按 pos 依次消费最早的空出事件开工，
    // 自己的完成时刻又产生新的空出事件（供后续排队项）。精工/充能/改装等形态同样占工人，事件流零排除。
    // poolItems：该池全部提取条目（含已完成未删除）；queueMap：{uniqueId键:{pos,dur}}（键不含 tag 前缀）
    // 返回 { [uniqueId]: {start, finish} }（仅排队项；start=开工时刻，finish=完成时刻）
    function simulateQueue(poolItems, queueMap, data, tagPrefix) {
        const events = [];
        const queued = [];
        poolItems.forEach(it => {
            const key = tagPrefix && it.uniqueId && it.uniqueId.indexOf(tagPrefix) === 0
                ? it.uniqueId.slice(tagPrefix.length) : it.uniqueId;
            const q = key ? queueMap[key] : null;
            if (q) queued.push({ id: it.uniqueId, pos: Number(q.pos) || 0, dur: Math.max(0, Number(q.dur) || 0), item: it });
            else events.push(calculateCompletionTimestamp(it, data));
        });
        events.sort((a, b) => a - b);
        queued.sort((a, b) => a.pos - b.pos);
        const now = Math.floor(Date.now() / 1000);
        const baseTs = Number(data.timestamp) || now;
        const result = {};
        queued.forEach(q => {
            // 无空出事件（池内开工项被删空）= 工人全闲，立即开工
            const start = events.length ? events.shift() : now;
            // 排队项的实际耗时：按「开工前等待」把加速/助手窗口前移后再折算（药水在排队期间生效的场景）。
            // 取不到有效值时退回标记里的原始 timer（q.dur）。
            let dur = q.dur;
            try {
                const probe = Object.assign({}, q.item, { timer: q.dur });
                const eff = stagedDuration(probe, data, Math.max(0, start - baseTs));
                if (!isNaN(eff) && eff >= 0) dur = eff;
            } catch (e) {}
            const finish = start + dur;
            // 插入并保持升序（数量小，线性插入足够）
            let i = 0;
            while (i < events.length && events[i] < finish) i++;
            events.splice(i, 0, finish);
            result[q.id] = { start: start, finish: finish };
        });
        return result;
    }

    // 标记键解析：cat_data_lvl_idx（cat 名可能含下划线，如 siege_machines，从尾部截 3 段数字）
    function parseQueueKey(key) {
        const m = key.match(/^(.+)_(\d+)_(\d+)_(\d+)$/);
        return m ? { cat: m[1], id: Number(m[2]), lvl: Number(m[3]), idx: Number(m[4]) } : null;
    }

    // 导入后重放排队条目（accounts.js 调用）：游戏导出不含手动录入的排队 timer——
    // 找同实例未开工条目重放「+升级」写入（分裂/挂载），标记保留（跨导入存活）；
    // 游戏里已开工（真实 timer）→ 清标记由真实数据接管；实例消失（已升完）→ 清标记。
    function reconcileQueue(tag, newData) {
        if (!tag || !newData) return;
        const qmap = loadQueueMap(tag);
        if (!Object.keys(qmap).length) return;
        const nowSec = Math.floor(Date.now() / 1000);
        Object.keys(qmap).forEach(key => {
            const p = parseQueueKey(key);
            if (!p) { delete qmap[key]; return; }
            const arr = newData[p.cat];
            if (!arr || !Array.isArray(arr)) { delete qmap[key]; return; }
            if (arr.some(a => Number(a.data) === p.id && Number(a.lvl) === p.lvl && a.timer > 0)) { delete qmap[key]; return; }   // 已开工
            const entry = arr.find(a => Number(a.data) === p.id && Number(a.lvl) === p.lvl && !(a.timer > 0) && a.gear_up !== 0);
            if (!entry) { delete qmap[key]; return; }   // 实例不存在（已升完/建筑消失）
            const timer = Math.max(1, Math.floor(nowSec - (newData.timestamp || 0) + (Number(qmap[key].dur) || 0)));
            // 重放 applyAddToUpgrades 的写入口径（timer 仅作提取门票，完成时刻由队列模拟覆盖）
            if (entry.cnt !== undefined && entry.cnt !== null) {
                const cnt = Number(entry.cnt) || 0;
                if (cnt > 1) { entry.cnt = cnt - 1; arr.push({ data: entry.data, lvl: entry.lvl, timer: timer }); }
                else { delete entry.cnt; entry.timer = timer; }
            } else {
                entry.timer = timer;
            }
        });
        saveQueueMap(tag, qmap);
    }

    // 固化已触发的排队项（开工后时刻落定）：timer = 完成时刻 − 导出时刻、清标记，此后药水/助手
    // 折算按普通项接管。删除已完成卡前调用（触发者被删会让模拟挂靠漂移）。不落盘账号数据（调用方管）。
    function solidifyQueues(tag, data) {
        if (!tag || !data || !data.tag) return;
        const qmap = loadQueueMap(tag);
        if (!Object.keys(qmap).length) return;
        const nowSec = Math.floor(Date.now() / 1000);
        let changed = false;
        extractUpgradingItems(data, nowSec, true).forEach(item => {
            if (item.queueStart == null || item.queueStart > nowSec) return;   // 未触发
            const key = item.uniqueId.slice(data.tag.length + 1);
            if (!qmap[key]) return;
            const p = parseQueueKey(key);
            const arr = p ? data[p.cat] : null;
            const target = (arr && Array.isArray(arr)) ? arr[p.idx] : null;
            if (target && Number(target.data) === Number(item.data) && target.timer > 0) {
                target.timer = Math.max(1, item.queueFinish - data.timestamp);
                delete qmap[key];
                changed = true;
            }
        });
        if (changed) saveQueueMap(tag, qmap);
    }

    // 从 item 开工时刻起算的耗时（秒）。startDelay = 开工前还要等待的秒数（排队项用）：
    // calculateStaged 先按 startDelay 消耗这段时间里流逝的加速/助手窗口，再把剩余 timer 按剩余窗口折算；
    // 普通项 startDelay=0 时与旧实现完全等价。
    function stagedDuration(item, data, startDelay) {
        const { timer, category } = item;

        const eligibleForEvent = ["buildings", "heroes", "traps", "guardians", "units", "siege_machines", "spells", "pets"];
        // 超级充能建筑始终走正常计算，不享受活动加速
        const isSupercharge = item.supercharge !== undefined;
        const eventMult = (!isSupercharge && eligibleForEvent.includes(category)) ? getEffectiveEventMultiplier(data) : 1;

        if (item.helper_recurrent === true) {
            const supportedCategories = ["buildings", "heroes", "traps", "guardians", "units", "siege_machines", "spells"];
            if (!supportedCategories.includes(category)) return timer;

            const helpers = data.helpers || [];

            let helper = null;
            if (["buildings", "heroes", "traps", "guardians"].includes(category)) {
                helper = helpers.find(h => h.data === 124000000 || h.data === 93000000);
            } else if (["units", "siege_machines", "spells"].includes(category)) {
                helper = helpers.find(h => h.data === 124000001 || h.data === 93000001);
            }

            const helperLevel = helper ? helper.lvl : 0;
            const itemHelperTimer = item.helper_timer || 0;
            const helperCooldown = helper ? (helper.helper_cooldown || 0) : 0;

            const [boostA, boostB] = getBoostWindows(data, category);
            return calculateStaged(timer, helperLevel, itemHelperTimer, helperCooldown, boostA, boostB, true, eventMult, 0, startDelay);
        }

        const helpers = data.helpers || [];
        const scheduledAt = item.helper_scheduled || 0;   // 单次预约窗（推演指派）：hc 归零后加速一次
        const hasHelperSession = (item.helper_timer || 0) > 0 || scheduledAt > 0;
        const workerHelper = helpers.find(h => h.data === 124000000 || h.data === 93000000);
        const labHelper = helpers.find(h => h.data === 124000001 || h.data === 93000001);
        const itemHelperTimer = hasHelperSession ? (item.helper_timer || 0) : 0;

        const helperLevel = hasHelperSession ? (() => {
            if (["buildings", "heroes", "traps", "guardians"].includes(category)) return workerHelper ? workerHelper.lvl : 0;
            if (["units", "siege_machines", "spells"].includes(category)) return labHelper ? labHelper.lvl : 0;
            return 0;
        })() : 0;

        let helperCooldown = 0;
        if (hasHelperSession) {
            if (["buildings", "heroes", "traps", "guardians"].includes(category)) {
                helperCooldown = workerHelper ? (workerHelper.helper_cooldown || 0) : 0;
            } else if (["units", "siege_machines", "spells"].includes(category)) {
                helperCooldown = labHelper ? (labHelper.helper_cooldown || 0) : 0;
            }
        }

        const [boostA, boostB] = getBoostWindows(data, category);
        // 夜世界（钟楼）无活动倍率；无道具无助手时 calculateStaged 退化为 ceil(timer / em)
        const isNightWorld = ["buildings2", "traps2", "heroes2", "units2"].includes(category);
        return calculateStaged(timer, helperLevel, itemHelperTimer, helperCooldown, boostA, boostB, false, isNightWorld ? 1 : eventMult, scheduledAt, startDelay);
    }

    function calculateCompletionTimestamp(item, data) {
        // 排队项：完成时刻由队列模拟给出（开工时刻 + 时长），不走 timer 折算
        if (item.queueFinish != null) return item.queueFinish;
        const { timestamp } = data;
        const duration = stagedDuration(item, data, 0);
        if (isNaN(duration) || duration < 0) return timestamp + item.timer;
        return timestamp + duration;
    }

    function extractUpgradingItems(data, nowTimestamp, includeCompleted = false, dismissLevel = 'progress') {
        // 三段结构：①收集全量条目（不算完成时刻）→ ②排队队列模拟（写 queueStart/queueFinish 派生字段）
        // → ③算完成时刻 + 完成过滤。模拟必须基于含已完成的全量事件流（与 includeCompleted 参数无关），
        // 否则已完成未删除的触发者缺席会让排队项挂靠漂移。
        const collected = [];
        // 通知去重键（uniqueId）加账号前缀：跨账号同建筑同级别互不干扰（requestCode/notifyId/sentMessages 隔离）
        const tagPrefix = data.tag ? data.tag + '_' : '';
        const categories = ["buildings","buildings2","heroes","heroes2","units","units2","spells","siege_machines","pets","traps","traps2","guardians"];
        categories.forEach(cat => {
            if (data[cat] && Array.isArray(data[cat])) {
                data[cat].forEach((item, idx) => {
                    if (item.data === 1000097 && item.types && Array.isArray(item.types)) {
                        item.types.forEach((type, tIdx) => {
                            if (type.modules && Array.isArray(type.modules)) {
                                type.modules.forEach((module, mIdx) => {
                                    if (module.timer > 0) {
                                        // 通知去重键（uniqueId）须跨 build 稳定：recurrent（每轮须不同 id）保留 timer，其余用稳定下标
                                        const recurrent = module.helper_recurrent === true || item.helper_recurrent === true;
                                        const uniqueId = tagPrefix + (recurrent
                                            ? `refine_${cat}_${item.data}_${type.data}_${module.data}_${module.timer}_${tIdx}_${mIdx}`
                                            : `refine_${cat}_${item.data}_${type.data}_${module.data}_${tIdx}_${mIdx}`);
                                        const helperTimer = module.helper_timer || item.helper_timer || 0;
                                        const parentTargetLevel = type.modules.reduce((sum, m) => {
                                            if (m === module) return sum + (module.lvl || 0) + 1;
                                            return sum + (m.lvl || 0);
                                        }, 0);
                                        collected.push({ ...module, category: cat, isRefiningTable: true, uniqueId, helper_timer: helperTimer, originalTimer: module.timer, lvl: module.lvl || 0, parentData: type.data, parentTargetLevel });
                                    }
                                });
                            }
                        });
                    } else if (item.timer > 0) {
                        // 通知去重键（uniqueId）须跨 build 稳定：recurrent（每轮须不同 id）保留 timer，其余去 timer 用数组下标（多座区分）
                        const uniqueId = tagPrefix + (item.helper_recurrent === true
                            ? `${cat}_${item.data}_${item.timer}_${item.lvl}`
                            : `${cat}_${item.data}_${item.lvl}_${idx}`);
                        collected.push({ ...item, category: cat, uniqueId, originalTimer: item.timer });
                    }
                });
            }
        });
        // ② 排队模拟：有标记才跑（零标记零开销）；按展示池分组各自模拟
        if (data.tag) {
            const queueMap = loadQueueMap(data.tag);
            if (queueMap && Object.keys(queueMap).length) {
                const pools = {};
                collected.forEach(it => {
                    const g = getItemCategory(it);
                    (pools[g] = pools[g] || []).push(it);
                });
                Object.keys(pools).forEach(g => {
                    const r = simulateQueue(pools[g], queueMap, data, tagPrefix);
                    pools[g].forEach(it => {
                        const qr = r[it.uniqueId];
                        if (qr) { it.queueStart = qr.start; it.queueFinish = qr.finish; }
                    });
                });
            }
        }
        // ③ 完成时刻 + 完成过滤
        const upgrading = [];
        collected.forEach(it => {
            const completion = calculateCompletionTimestamp(it, data);
            if (includeCompleted || completion > nowTimestamp) upgrading.push(it);
        });
        // 源头阻断：被屏蔽分类（按账号两层记忆）的条目不进入解析结果，
        // 下游（升级列表/总览区/主标题环/排序弹窗/通知调度）全链路自然免扰。
        // dismissLevel：默认 progress（列表/通知链路沿用）；账号切换 tab 传 'any'——
        // 被任意档屏蔽的类目不参与 tab 配色/睡眠高亮（用户 2026-10-20）
        return data.tag ? filterDismissedCategories(upgrading, data.tag, dismissLevel) : upgrading;
    }

    function getItemCategory(item) {
        const cat = item.category;
        if (["buildings","heroes","traps","guardians"].includes(cat)) {
            if (item.gear_up === 0) return "buildings2";
            return "buildings";
        }
        if (["units","siege_machines","spells"].includes(cat)) return "lab";
        if (cat === "pets") return "pets";
        if (["buildings2","traps2","heroes2"].includes(cat)) return "buildings2";
        if (cat === "units2") return "units2";
        return "buildings";
    }

    function getItemName(id) { return ITEM_NAMES[CocTool.names.canonicalId(id)] || `未知(${id})`; }

    function formatRemainingTime(sec) {
        if (sec <= 0) return "就绪";
        const d = Math.floor(sec/86400);
        const h = Math.floor((sec%86400)/3600);
        const m = Math.floor((sec%3600)/60);
        const s = Math.floor(sec%60);
        let result = "";
        if (d > 0) result += `${d}天`;
        if (h > 0 || result) result += `${h}时`;
        if (m > 0 || result) result += `${m}分`;
        result += `${s}秒`;
        return result;
    }

    // 百分比统一显示（用户 2026-11-02 全站口径）：非 100% 固定 2 位小数、100% 不带小数；null/NaN → '-'。
    function formatPercent(value) {
        if (value === null || value === undefined) return '-';
        const n = Number(value);
        if (!isFinite(n)) return '-';
        const rounded = Math.round(n * 100) / 100;
        return (rounded === 100 ? '100' : rounded.toFixed(2)) + '%';
    }

    function formatDateTime(ts) { const d = new Date(ts*1000); return `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`; }

    function formatDoneTime(ts) {
        if (!ts || ts <= 0) return '';
        const d = new Date(ts * 1000);
        const timeStr = `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const doneDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const diffDays = Math.floor((doneDate.getTime() - today.getTime()) / 86400000);
        if (diffDays === 0) return `今天 ${timeStr}`;
        if (diffDays === 1) return `明天 ${timeStr}`;
        if (diffDays === 2) return `后天 ${timeStr}`;
        return `${d.getMonth() + 1}/${d.getDate()} ${timeStr}`;
    }

    function formatExportTime(ts) {
        if (!ts) return '未知';
        const d = new Date(ts * 1000);
        const timeStr = `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`;
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const exportDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const diffDays = Math.floor((today.getTime() - exportDate.getTime()) / 86400000);
        if (diffDays === 0) return `今天 ${timeStr}`;
        if (diffDays === 1) return `昨天 ${timeStr}`;
        return `${d.getMonth() + 1}/${d.getDate()} ${timeStr}`;
    }

    function isMultiStageWeapon(item) {
        return item && item.data === 1000001 && item.lvl === 17 && item.weapon !== undefined && item.weapon < 5;
    }

    function getItemIconUrl(item) {
        const { data, lvl, category, parentData, parentTargetLevel } = item;
        // 图标只有一套（国际服基址）：国服基址 ID 先归一再拼路径
        const iconId = CocTool.names.canonicalId(data);
        if (parentData && parentTargetLevel) {
            const base = `img/icons/buildings/${CocTool.names.canonicalId(parentData)}`;
            return [`${base}_${parentTargetLevel}.webp`, `${base}.webp`, 'img/icons/20260627.webp'];
        }
        const targetLvl = (item.supercharge !== undefined || isMultiStageWeapon(item) || item.gear_up === 0) ? lvl : lvl + 1;
        let base;
        if (category === 'buildings' || category === 'traps' || category === 'guardians') {
            base = `img/icons/buildings/${iconId}`;
            return [`${base}_${targetLvl}.webp`, `${base}.webp`, 'img/icons/20260627.webp'];
        }
        if (category === 'buildings2' || category === 'traps2') {
            base = `img/icons/buildings2/${iconId}`;
            return [`${base}_${targetLvl}.webp`, `${base}.webp`, 'img/icons/20260627.webp'];
        }
        if (['units', 'spells', 'siege_machines'].includes(category)) {
            base = `img/icons/lab/${iconId}`;
        } else if (['heroes', 'heroes2'].includes(category)) {
            base = `img/icons/heroes/${iconId}`;
        } else if (['pets'].includes(category)) {
            base = `img/icons/pets/${iconId}`;
        } else if (['units2'].includes(category)) {
            base = `img/icons/units2/${iconId}`;
        } else {
            return null;
        }
        return [`${base}.webp`, 'img/icons/20260627.webp'];
    }

    function getColorPriority(sec) {
        if (sec <= 0) return 5;
        if (sec < 1800) return 4;
        if (sec < 3600) return 3;
        if (sec < 14400) return 2;
        if (sec < 28800) return 1;
        return 0;
    }

    function priorityToBorderClass(priority, defaultCls) {
        return { 5: 'border-success', 4: 'border-danger_red', 3: 'border-warning_orangered', 2: 'border-warning_orange', 1: 'border-warning_yellow', 0: defaultCls }[priority] || defaultCls;
    }

    // 剩余时间 → 文字+边框颜色类（阈值与 getColorPriority 同源，禁止在业务层再硬编码阈值链）
    function getRemainingClasses(remainingSec, defaults) {
        const priority = getColorPriority(remainingSec);
        return {
            text: priorityToColorClass(priority, (defaults && defaults.text) || 'text-primary'),
            border: priorityToBorderClass(priority, (defaults && defaults.border) || 'border-primary')
        };
    }

    // ========== 升级卡片备忘：完成时刻 = 实例身份 ==========
    // 键 = 分类_data_lvl_绝对完成时刻（timestamp+timer）。不用药水/助手时跨导入稳定；
    // 药水/助手改变时刻 → 由 reconcileNoteKeys 在剩余池按最近时刻归位。
    function getNoteKey(item, data) {
        return (item.category || 'x') + '_' + item.data + '_' + (item.lvl || 0) + '_' + ((data.timestamp || 0) + (item.timer || 0));
    }
    function noteKeyBase(key) {
        const i = key.lastIndexOf('_');
        return i > 0 ? key.slice(0, i) : key;
    }
    function noteKeyTs(key) {
        const i = key.lastIndexOf('_');
        return parseInt(i > 0 ? key.slice(i + 1) : '0', 10) || 0;
    }
    // 导入后重对齐（纯函数）：oldMap = 旧备忘 {键:文本}，oldKeys = 旧实例键（按旧数据数组顺序），
    // newKeys = 新实例键（按新数据数组顺序），now = 当前秒
    // 规则：1) 精确匹配（同前缀 + 时刻差 <60s）优先锁定；2) 时刻已过去的旧键 → 完成清理删除；
    //       3) 剩余旧键与剩余新实例按「同前缀分组 + 保持各自顺序」一一对应（药水全体加速/顺序不变时零错配）；
    //       4) 无新实例可配且时刻在未来 → 保守保留（悬空，显示层兜底）。
    function reconcileNoteKeys(oldMap, oldKeys, newKeys, now) {
        const result = {};
        const used = {};
        const oldKeyList = (oldKeys || []).filter(k => Object.prototype.hasOwnProperty.call(oldMap, k));
        if (!oldKeyList.length) return { map: result, removed: 0 };
        let removed = 0;
        // 1. 精确匹配锁定（同前缀 + 时刻差 <60s）
        const unmatchedOld = [];
        oldKeyList.forEach(k => {
            const base = noteKeyBase(k);
            const ts = noteKeyTs(k);
            let hit = -1;
            for (let i = 0; i < newKeys.length; i++) {
                if (used[i] || noteKeyBase(newKeys[i]) !== base) continue;
                if (Math.abs(ts - noteKeyTs(newKeys[i])) < 60) { hit = i; break; }
            }
            if (hit !== -1) { used[hit] = true; result[newKeys[hit]] = oldMap[k]; }
            else unmatchedOld.push(k);
        });
        // 2. 时刻已过去的旧键 → 完成清理（不可能匹配任何未完成实例）
        const pendingOld = [];
        unmatchedOld.forEach(k => {
            if (noteKeyTs(k) < now) removed++;
            else pendingOld.push(k);
        });
        // 3. 剩余按前缀分组，组内按顺序一一对应
        const unmatchedNew = [];
        newKeys.forEach((k, i) => { if (!used[i]) unmatchedNew.push({ k, i }); });
        const groups = {};
        pendingOld.forEach(k => {
            const b = noteKeyBase(k);
            if (!groups[b]) groups[b] = { old: [], news: [] };
            groups[b].old.push(k);
        });
        unmatchedNew.forEach(x => {
            const b = noteKeyBase(x.k);
            if (!groups[b]) groups[b] = { old: [], news: [] };
            groups[b].news.push(x);
        });
        Object.keys(groups).forEach(b => {
            const g = groups[b];
            g.old.forEach((k, idx) => {
                const x = g.news[idx];
                if (x) { used[x.i] = true; result[x.k] = oldMap[k]; }
                else result[k] = oldMap[k]; // 4. 保守保留（悬空）
            });
        });
        return { map: result, removed };
    }

    function priorityToColorClass(priority, defaultColor) {
        return { 5: 'text-success', 4: 'text-danger_red', 3: 'text-warning_orangered', 2: 'text-warning_orange', 1: 'text-warning_yellow', 0: defaultColor }[priority] || defaultColor;
    }

    // ========== 分类目屏蔽（按账号记忆：settings.dismissedCategories = {tag: {key: {dot,notify,progress}}}） ==========
    // 三档程度：dot=首页总览红点 / notify=升级完成通知 / progress=升级列表及首页进度（解析源头不产出被屏蔽条目
    // → 升级列表/总览区灰态/账号 tab 配色/主标题环/排序弹窗/道具推演 全链路免扰）
    // level='any' = 任一档被勾（账号进度页与桌面小组件用：任意程度屏蔽即不显示该分类的升级项目）
    // 兼容旧数据：值为 true 时视为三档全屏蔽（未升级端读到对象按 truthy 也当全屏蔽，降级安全）
    function getDismissFlags(tag, categoryKey) {
        const none = { dot: false, notify: false, progress: false };
        if (!tag || !categoryKey) return none;
        const permMap = settings.dismissedCategories && settings.dismissedCategories[tag];
        const value = permMap && permMap[categoryKey];
        if (!value) return none;
        if (value === true) return { dot: true, notify: true, progress: true };
        return { dot: !!value.dot, notify: !!value.notify, progress: !!value.progress };
    }

    function isCategoryDismissed(tag, categoryKey, level) {
        const flags = getDismissFlags(tag, categoryKey);
        if (level === 'any') return flags.dot || flags.notify || flags.progress;
        return !!flags[level || 'progress'];
    }

    function filterDismissedCategories(items, tag, level) {
        if (!items) return [];
        if (!tag) return items;
        return items.filter(i => !isCategoryDismissed(tag, getItemCategory(i), level));
    }

    function getAccountTabColor(data) {
        const now = Math.floor(Date.now() / 1000);
        const allItems = extractUpgradingItems(data, now, true, 'any');
        let highestPriority = 0;
        for (const item of allItems) {
            const completionTs = calculateCompletionTimestamp(item, data);
            const remainingSec = Math.max(0, completionTs - now);
            const priority = getColorPriority(remainingSec);
            if (priority === 5) return 'text-success';
            highestPriority = Math.max(highestPriority, priority);
        }
        return priorityToColorClass(highestPriority, '');
    }

    function getRemainingColor(remainingSec) {
        return priorityToColorClass(getColorPriority(remainingSec), 'text-gray-800');
    }

    function formatCompactTime(sec) {
        if (sec <= 0) return "就绪";
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        const mm = String(m).padStart(2, '0');
        const ss = String(s).padStart(2, '0');
        return h > 0 ? h + '时' + mm + ':' + ss : mm + ':' + ss;
    }

    // ===== 分类概览函数 =====
    function getCategoryDenominators(data) {
        const buildings = data.buildings || [];
        const buildings2 = data.buildings2 || [];
        const monthlyPassBonus = (settings.builderMonthlyPass && settings.builderMonthlyPass[data.tag]) ? 1 : 0;
        return {
            buildings: buildings.filter(b => b.data === 1000015 || b.data === 1000064).reduce((s, b) => s + (b.cnt || 1), 0) + monthlyPassBonus,
            lab: buildings.filter(b => b.data === 1000007).reduce((s, b) => s + (b.cnt || 1), 0),
            pets: buildings.filter(b => b.data === 1000068).reduce((s, b) => s + (b.cnt || 1), 0),
            buildings2: buildings2.filter(b => b.data === 1000034 || b.data === 1000047 || b.data === 1000078).reduce((s, b) => s + (b.cnt || 1), 0),
            units2: buildings2.filter(b => b.data === 1000046).reduce((s, b) => s + (b.cnt || 1), 0)
        };
    }

    function getCategoryCounts(items) {
        const counts = { buildings:0, lab:0, pets:0, buildings2:0, units2:0 };
        items.forEach(it => {
            const g = getItemCategory(it);
            if (counts[g] !== undefined) counts[g]++;
        });
        return counts;
    }

    // 分类占用计数（首页摘要卡口径，2026-11-01 用户拍板）：排队中（未开工）的项不占工人。
    // 主标题空闲判定与排队池满校验仍用 getCategoryCounts——排队项预定了下一个空位，剔除会误报"有空闲"。
    function getActiveCategoryCounts(items, now) {
        const counts = { buildings:0, lab:0, pets:0, buildings2:0, units2:0 };
        const nowSec = now || Math.floor(Date.now() / 1000);
        items.forEach(it => {
            if (it.queueStart != null && it.queueStart > nowSec) return;   // 排队中不占
            const g = getItemCategory(it);
            if (counts[g] !== undefined) counts[g]++;
        });
        return counts;
    }

    function getCategoryCompletedCounts(items, data) {
        const counts = { buildings:0, lab:0, pets:0, buildings2:0, units2:0 };
        const now = Math.floor(Date.now() / 1000);
        items.forEach(it => {
            const g = getItemCategory(it);
            if (counts[g] !== undefined) {
                const completion = calculateCompletionTimestamp(it, data);
                if (completion <= now) counts[g]++;
            }
        });
        return counts;
    }

    function getSummaryIconUrl(key) {
        const data = accounts[state.currentAccount];
        if (!data) return 'img/icons/20260627.webp';
        const buildings = data.buildings || [];
        const buildings2 = data.buildings2 || [];
        let bldData, bldLvl = 1;
        switch (key) {
            case 'buildings': bldData = 1000001; break;
            case 'lab':       bldData = 1000007; break;
            case 'pets':      bldData = 1000068; break;
            case 'buildings2': bldData = 1000034; break;
            case 'units2':    bldData = 1000046; break;
        }
        const bld = buildings.find(b => b.data === bldData) || buildings2.find(b => b.data === bldData);
        if (bld && bld.lvl) bldLvl = bld.lvl;
        const base = (key === 'buildings2' || key === 'units2') ? 'img/icons/buildings2/' : 'img/icons/buildings/';
        return base + bldData + '_' + bldLvl + '.webp';
    }

    // ===== 睡眠区间计算 =====
    let _cachedSleepRange = null;
    let _lastSleepCheck = 0;

    function getSleepRange() {
        if (!settings.nightMode) {
            if (_cachedSleepRange) _cachedSleepRange = null;
            return null;
        }
        const nowSec = Math.floor(Date.now() / 1000);
        if (_cachedSleepRange && nowSec - _lastSleepCheck < 60) {
            return _cachedSleepRange;
        }
        _lastSleepCheck = nowSec;

        const now = new Date();
        const [startHour, startMin] = settings.sleepStart.split(':').map(Number);
        const [endHour, endMin] = settings.sleepEnd.split(':').map(Number);
        const nowMin = now.getHours() * 60 + now.getMinutes();
        const startMinTotal = startHour * 60 + startMin;
        const endMinTotal = endHour * 60 + endMin;

        function makeDate(h, m, dayOffset) {
            const d = new Date(now);
            d.setDate(d.getDate() + dayOffset);
            d.setHours(h, m, 0, 0);
            return d;
        }

        let start, end;

        if (endMinTotal <= startMinTotal) {
            if (nowMin < endMinTotal) {
                start = makeDate(startHour, startMin, -1);
                end = makeDate(endHour, endMin, 0);
            } else if (nowMin >= startMinTotal) {
                start = makeDate(startHour, startMin, 0);
                end = makeDate(endHour, endMin, 1);
            } else {
                start = makeDate(startHour, startMin, 0);
                end = makeDate(endHour, endMin, 1);
            }
        } else {
            if (nowMin < startMinTotal) {
                start = makeDate(startHour, startMin, 0);
                end = makeDate(endHour, endMin, 0);
            } else if (nowMin >= endMinTotal) {
                start = makeDate(startHour, startMin, 1);
                end = makeDate(endHour, endMin, 1);
            } else {
                start = makeDate(startHour, startMin, 0);
                end = makeDate(endHour, endMin, 0);
            }
        }

        const range = {
            start: Math.floor(start.getTime() / 1000),
            end: Math.floor(end.getTime() / 1000)
        };
        if (!_cachedSleepRange || _cachedSleepRange.start !== range.start || _cachedSleepRange.end !== range.end) {
            _cachedSleepRange = range;
        }
        return range;
    }

    function isInSleepRange(completionTs) {
        if (!settings.nightMode) return false;
        if (completionTs <= Math.floor(Date.now() / 1000)) return false;
        const range = getSleepRange();
        if (!range) return false;
        return completionTs >= range.start && completionTs <= range.end;
    }

    function hasSleepHighlight(data) {
        if (!settings.nightMode || !data) return false;
        const now = Math.floor(Date.now() / 1000);
        const items = extractUpgradingItems(data, now, true, 'any');
        for (const item of items) {
            const completionTs = calculateCompletionTimestamp(item, data);
            if (isInSleepRange(completionTs)) return true;
        }
        return false;
    }

    function invalidateSleepRange() {
        _cachedSleepRange = null;
        _lastSleepCheck = 0;
    }

    // ===== 联赛阶段推算（24h 规律，单一实现：卡片/缓存过期/通知共用） =====
    // startK = 基准轮 K（1-based）的战斗日开始时间戳；每 24h 推进一轮
    // 返回 { n, kind }：n = 当前战斗日编号（n<1 → 尚未开始 prep；n>7 → 已结束 ended）
    function leaguePhaseInfo(startK, K, now) {
        var DAY = 86400000;
        var n = K - 1 + Math.ceil((now - startK) / DAY);
        return { n: n, kind: n < 1 ? 'prep' : (n > 7 ? 'ended' : 'war') };
    }

    // 第 n 轮的战斗日时间点（n 任意整数，可为过去/未来）
    function leagueRoundTimes(startK, K, n) {
        var DAY = 86400000;
        return { start: startK + (n - K) * DAY, end: startK + (n - K + 1) * DAY };
    }

    // 联赛阶段推算（锚轮 A 真实 endTime 链式反推）：
    // 官方链式规律：endTime_n = startTime_{n+1}（下一轮开战 = 本轮结束；第 n 轮准备日与第 n-1 轮战斗日并行）
    // 官方延迟规则：服务器维护只延迟未发生的动作（preparationStartTime 匹配即定永不延迟；startTime/endTime 延迟），
    //   延迟后 start→end 间隔不再是 24h 整，但 end→下一轮 start 的链式关系不变 → 以 endTime 为锚反推
    // endK = 锚轮 K（1-based）的真实战斗结束时间戳；startK = 锚轮真实开战时间戳
    // 锚轮内（now < endK）→ 返回真实边界；锚轮后 → endK + k×24h 反推
    // 返回 { n, kind, start, end }：n = 当前轮编号；kind: prep/war/ended；start/end = 当前轮边界（锚轮内为真实值）
    function leaguePhaseFromEnd(endK, K, startK, now) {
        var DAY = 86400000;
        if (now < startK) return { n: K, kind: 'prep', start: startK, end: endK };
        if (now < endK) return { n: K, kind: 'war', start: startK, end: endK };
        var k = Math.ceil((now - endK) / DAY);
        var n = K + k;
        if (n > 7) return { n: n, kind: 'ended', start: endK + (k - 1) * DAY, end: endK + k * DAY };
        return { n: n, kind: 'war', start: endK + (k - 1) * DAY, end: endK + k * DAY };
    }

    // 联赛卡片阶段（基于最后解锁轮 L 的真实/推算边界）：
    // startK/endK = L 轮（1-based K）开战/结束（真实或从锚轮 endTime 链式反推）；prevEndK = L-1 轮结束（真实/链式）
    // 链式并行结构 → L 轮准备日期间若上一轮仍在战斗，显示上一轮战斗日（倒计时到 prevEndK）
    // 返回 { label, kind, target }：联赛·D{n}（紫）/ 联赛准备（蓝）；联赛结束 → null
    function leagueCardPhase(endK, K, startK, prevEndK, now) {
        var DAY = 86400000;
        if (now >= endK) {
            var k = Math.ceil((now - endK) / DAY);
            var n = K + k;
            if (n > 7) return null;
            return { label: '联赛·D' + n, kind: 'war', target: endK + k * DAY };
        }
        if (now >= startK) return { label: '联赛·D' + K, kind: 'war', target: endK };
        if (prevEndK && now < prevEndK) return { label: '联赛·D' + (K - 1), kind: 'war', target: prevEndK };
        return { label: '联赛准备', kind: 'prep', target: startK };
    }

    // ========== 前台通知统计 ==========
    function getStatsForNotification() {
        let completedCount = 0;
        let nextCompletionTime = '--';
        let earliestTs = Infinity;
        const now = Math.floor(Date.now() / 1000);

        // state.accounts 是对象，需要遍历其值
        const accounts = Object.values(state.accounts);
        for (const account of accounts) {
            // 前台统计属于"通知"通道：按 notify 档排除被屏蔽分类（源头已按 progress 过滤，此处叠加）
            const items = filterDismissedCategories(extractUpgradingItems(account, now, true), account.tag, 'notify');
            for (const item of items) {
                const completionTs = calculateCompletionTimestamp(item, account);
                if (completionTs <= now) {
                    completedCount++;
                } else if (completionTs < earliestTs) {
                    earliestTs = completionTs;
                    nextCompletionTime = formatDoneTime(completionTs);
                }
            }
        }

        return { completedCount, nextCompletionTime };
    }

    CocTool.calc = Object.freeze({
        EVENT_END,
        getEventPeriod,
        getEffectiveEventMultiplier,
        getEventRecommendation,
        hasRecurrentItem,
        hasActiveRecurrent,
        isHelperReady,
        isClockTowerReady,
        getRecurrentPhase,
        getItemPhaseIcon,
        getHelperUsage,
        potionUnitSec,
        clockTowerBoostSec,
        snapshotAccount,
        escapeHtml,
        getHelperCooldowns,
        calculateStaged,
        calculateCompletionTimestamp,
        extractUpgradingItems,
        simulateQueue,
        loadQueueMap,
        saveQueueMap,
        getQueueBaseDuration,
        clearQueueMark,
        reconcileQueue,
        solidifyQueues,
        getItemCategory,
        getItemName,
        formatRemainingTime,
        formatPercent,
        formatDateTime,
        formatDoneTime,
        formatExportTime,
        getItemIconUrl,
        getColorPriority,
        priorityToColorClass,
        priorityToBorderClass,
        getRemainingClasses,
        getNoteKey,
        noteKeyBase,
        noteKeyTs,
        reconcileNoteKeys,
        isCategoryDismissed,
        getDismissFlags,
        filterDismissedCategories,
        getAccountTabColor,
        getRemainingColor,
        formatCompactTime,
        getCategoryDenominators,
        getCategoryCounts,
        getActiveCategoryCounts,
        getCategoryCompletedCounts,
        getSummaryIconUrl,
        isMultiStageWeapon,
        isCnAccount,
        getSleepRange,
        isInSleepRange,
        hasSleepHighlight,
        invalidateSleepRange,
        leaguePhaseInfo,
        leagueRoundTimes,
        leaguePhaseFromEnd,
        leagueCardPhase,
        getStatsForNotification
    });
})(window);
