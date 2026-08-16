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
        const phase = getRecurrentPhase(item, data);
        if (phase === 'boost') return ' <span class="phase-icon-btn" data-phase="boost" data-unique="' + escapeHtml(item.uniqueId) + '" data-helper-timer="' + (item.helper_timer || 0) + '" data-helper-recurrent="true" style="cursor:pointer;" title="点击查看详情">⚡</span>';
        if (phase === 'wait') return ' <span class="phase-icon-btn" data-phase="wait" data-unique="' + escapeHtml(item.uniqueId) + '" data-helper-timer="' + (item.helper_timer || 0) + '" data-helper-recurrent="true" style="cursor:pointer;" title="点击查看详情">⌛</span>';

        if (item.helper_timer > 0) {
            const helpers = data.helpers || [];
            const timestamp = data.timestamp || Math.floor(Date.now() / 1000);
            const now = Math.floor(Date.now() / 1000);
            const elapsed = now - timestamp;
            if (elapsed < item.helper_timer) {
                return ' <span class="phase-icon-btn" data-phase="boost" data-unique="' + escapeHtml(item.uniqueId) + '" data-helper-timer="' + item.helper_timer + '" data-helper-recurrent="false" style="cursor:pointer;" title="点击查看详情">⚡</span>';
            }
        }
        return '';
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
    function calculateStaged(timer, helperLevel, helperDuration, helperCooldown, boostDuration, boostMult, recurrent, eventMult = 1) {
        let remaining = timer;
        let elapsed = 0;

        let hasHelper = helperDuration > 0 && helperLevel > 0;

        if (helperLevel > 0 && helperDuration === 0 && helperCooldown > 0) {
            const cooldownBoostDuration = Math.min(helperCooldown, boostDuration);
            if (cooldownBoostDuration > 0 && boostDuration > 0) {
                const rate = boostMult;
                const maxReduce = cooldownBoostDuration * rate;
                if (remaining <= maxReduce) return elapsed + Math.ceil(remaining / rate);
                remaining -= maxReduce;
                elapsed += cooldownBoostDuration;
                helperCooldown -= cooldownBoostDuration;
                boostDuration -= cooldownBoostDuration;
            }
            if (helperCooldown > 0) {
                if (remaining <= helperCooldown * eventMult) return elapsed + Math.ceil(remaining / eventMult);
                remaining -= helperCooldown * eventMult;
                elapsed += helperCooldown;
            }
        }

        if (recurrent === true && !hasHelper && helperLevel > 0) {
            hasHelper = true;
            helperDuration = 3600;
        }

        const overlapDuration = hasHelper ? Math.min(helperDuration, boostDuration) : 0;
        if (overlapDuration > 0 && boostDuration > 0) {
            const rate = boostMult + helperLevel;
            const maxReduce = overlapDuration * rate;
            if (remaining <= maxReduce) return elapsed + Math.ceil(remaining / rate);
            remaining -= maxReduce;
            elapsed += overlapDuration;
        }

        const boostOnlyDuration = Math.max(0, boostDuration - overlapDuration);
        if (boostOnlyDuration > 0) {
            const rate = boostMult;
            const maxReduce = boostOnlyDuration * rate;
            if (remaining <= maxReduce) return elapsed + Math.ceil(remaining / rate);
            remaining -= maxReduce;
            elapsed += boostOnlyDuration;
        }

        let helperOnlyDuration = 0;
        if (hasHelper) {
            helperOnlyDuration = Math.max(0, helperDuration - overlapDuration);
            if (helperOnlyDuration > 0) {
                const rate = helperLevel + eventMult;
                const maxReduce = helperOnlyDuration * rate;
                if (remaining <= maxReduce) return elapsed + Math.ceil(remaining / rate);
                remaining -= maxReduce;
                elapsed += helperOnlyDuration;
            }
        }

        if (recurrent === true && helperLevel > 0) {
            let cooldownRemaining = 22 * 3600;
            if (helperOnlyDuration > 0) {
            } else if (overlapDuration > 0) {
                cooldownRemaining = Math.max(0, 22 * 3600 - boostOnlyDuration);
            }

            while (remaining > 0) {
                if (cooldownRemaining > 0) {
                    if (remaining <= cooldownRemaining * eventMult) {
                        return elapsed + Math.ceil(remaining / eventMult);
                    }
                    remaining -= cooldownRemaining * eventMult;
                    elapsed += cooldownRemaining;
                }

                const workPerCycle = 3600 * (helperLevel + eventMult);
                if (remaining <= workPerCycle) {
                    return elapsed + Math.ceil(remaining / (helperLevel + eventMult));
                }
                remaining -= workPerCycle;
                elapsed += 3600;

                cooldownRemaining = 22 * 3600;
            }
        }

        return elapsed + Math.ceil(remaining / eventMult);
    }

    // ========== 核心：计算完成时间 ==========
    function calculateCompletionTimestamp(item, data) {
        const { timer, category } = item;
        const { timestamp } = data;
        let completionTimestamp = timestamp + timer;

        const eligibleForEvent = ["buildings", "heroes", "traps", "guardians", "units", "siege_machines", "spells", "pets"];
        // 超级充能建筑始终走正常计算，不享受活动加速
        const isSupercharge = item.supercharge !== undefined;
        const eventMult = (!isSupercharge && eligibleForEvent.includes(category)) ? getEffectiveEventMultiplier(data) : 1;

        if (item.helper_recurrent === true) {
            const supportedCategories = ["buildings", "heroes", "traps", "guardians", "units", "siege_machines", "spells"];
            if (!supportedCategories.includes(category)) {
                return timestamp + timer;
            }

            const boosts = data.boosts || {};
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

            let boostDuration = 0;
            let boostMult = 1;
            if (["buildings", "heroes", "traps", "guardians"].includes(category)) {
                if (boosts.builder_boost) {
                    const is24 = settings.builderBoostMode24 && settings.builderBoostMode24[data.tag];
                    boostMult = is24 ? 24 : 10;
                    boostDuration = boosts.builder_boost;
                } else if (boosts.builder_consumable) {
                    boostMult = 2;
                    boostDuration = boosts.builder_consumable;
                }
            } else if (["units", "siege_machines", "spells"].includes(category)) {
                if (boosts.lab_boost) {
                    boostMult = 24;
                    boostDuration = boosts.lab_boost;
                } else if (boosts.lab_consumable) {
                    boostMult = 4;
                    boostDuration = boosts.lab_consumable;
                }
            }

            const additional = calculateStaged(timer, helperLevel, itemHelperTimer, helperCooldown, boostDuration, boostMult, true, eventMult);
            completionTimestamp = timestamp + additional;
            if (isNaN(completionTimestamp) || completionTimestamp < timestamp) return timestamp + timer;
            return completionTimestamp;
        }

        const boosts = data.boosts || {};
        const helpers = data.helpers || [];
        const hasHelperSession = item.helper_recurrent === true || (item.helper_timer || 0) > 0;
        const isRecurrent = item.helper_recurrent === true;
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

        let additional = Math.ceil(timer / eventMult);
        if (["buildings", "heroes", "traps", "guardians"].includes(category)) {
            if (boosts.builder_boost) {
                const is24 = settings.builderBoostMode24 && settings.builderBoostMode24[data.tag];
                const mult = is24 ? 24 : 10;
                additional = calculateStaged(timer, helperLevel, itemHelperTimer, helperCooldown, boosts.builder_boost, mult, false, eventMult);
            } else if (boosts.builder_consumable) {
                additional = calculateStaged(timer, helperLevel, itemHelperTimer, helperCooldown, boosts.builder_consumable, 2, false, eventMult);
            } else if (helperLevel > 0 && itemHelperTimer > 0) {
                additional = calculateStaged(timer, helperLevel, itemHelperTimer, helperCooldown, 0, 0, false, eventMult);
            }
        } else if (["units", "siege_machines", "spells"].includes(category)) {
            if (boosts.lab_boost) {
                additional = calculateStaged(timer, helperLevel, itemHelperTimer, helperCooldown, boosts.lab_boost, 24, false, eventMult);
            } else if (boosts.lab_consumable) {
                additional = calculateStaged(timer, helperLevel, itemHelperTimer, helperCooldown, boosts.lab_consumable, 4, false, eventMult);
            } else if (helperLevel > 0 && itemHelperTimer > 0) {
                additional = calculateStaged(timer, helperLevel, itemHelperTimer, helperCooldown, 0, 0, false, eventMult);
            }
        } else if (category === "pets") {
            if (boosts.pet_boost) {
                additional = calculateStaged(timer, 0, 0, 0, boosts.pet_boost, 24, false, eventMult);
            } else if (boosts.lab_consumable) {
                additional = calculateStaged(timer, 0, 0, 0, boosts.lab_consumable, 4, false, eventMult);
            }
        } else if (["buildings2", "traps2", "heroes2", "units2"].includes(category)) {
            if (boosts.clocktower_boost) {
                additional = calculateStaged(timer, 0, 0, 0, boosts.clocktower_boost, 10);
            }
        }

        completionTimestamp = timestamp + additional;
        if (isNaN(completionTimestamp) || completionTimestamp < timestamp) return timestamp + timer;
        return completionTimestamp;
    }

    function extractUpgradingItems(data, nowTimestamp, includeCompleted = false) {
        const upgrading = [];
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
                                        const refinedItem = { ...module, category: cat, isRefiningTable: true, uniqueId, helper_timer: helperTimer, originalTimer: module.timer, lvl: module.lvl || 0, parentData: type.data, parentTargetLevel };
                                        const completion = calculateCompletionTimestamp(refinedItem, data);
                                        if (includeCompleted || completion > nowTimestamp) upgrading.push(refinedItem);
                                    }
                                });
                            }
                        });
                    } else if (item.timer > 0) {
                        // 通知去重键（uniqueId）须跨 build 稳定：recurrent（每轮须不同 id）保留 timer，其余去 timer 用数组下标（多座区分）
                        const uniqueId = tagPrefix + (item.helper_recurrent === true
                            ? `${cat}_${item.data}_${item.timer}_${item.lvl}`
                            : `${cat}_${item.data}_${item.lvl}_${idx}`);
                        const newItem = { ...item, category: cat, uniqueId, originalTimer: item.timer };
                        const completion = calculateCompletionTimestamp(newItem, data);
                        if (includeCompleted || completion > nowTimestamp) upgrading.push(newItem);
                    }
                });
            }
        });
        return upgrading;
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

    function getItemName(id) { return ITEM_NAMES[id?.toString()] || `未知(${id})`; }

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
        if (parentData && parentTargetLevel) {
            const base = `img/icons/buildings/${parentData}`;
            return [`${base}_${parentTargetLevel}.webp`, `${base}.webp`, 'img/icons/20260627.webp'];
        }
        const targetLvl = (item.supercharge !== undefined || isMultiStageWeapon(item) || item.gear_up === 0) ? lvl : lvl + 1;
        let base;
        if (category === 'buildings' || category === 'traps' || category === 'guardians') {
            base = `img/icons/buildings/${data}`;
            return [`${base}_${targetLvl}.webp`, `${base}.webp`, 'img/icons/20260627.webp'];
        }
        if (category === 'buildings2' || category === 'traps2') {
            base = `img/icons/buildings2/${data}`;
            return [`${base}_${targetLvl}.webp`, `${base}.webp`, 'img/icons/20260627.webp'];
        }
        if (['units', 'spells', 'siege_machines'].includes(category)) {
            base = `img/icons/lab/${data}`;
        } else if (['heroes', 'heroes2'].includes(category)) {
            base = `img/icons/heroes/${data}`;
        } else if (['pets'].includes(category)) {
            base = `img/icons/pets/${data}`;
        } else if (['units2'].includes(category)) {
            base = `img/icons/units2/${data}`;
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

    const NIGHT_WORLD_CATS = ["buildings2", "heroes2", "traps2", "units2"];

    function filterNightWorld(items) {
        return settings.hideNightWorld ? items.filter(i => !NIGHT_WORLD_CATS.includes(i.category)) : items;
    }

    function getAccountTabColor(data) {
        const now = Math.floor(Date.now() / 1000);
        const allItems = filterNightWorld(extractUpgradingItems(data, now, true));
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
        const items = extractUpgradingItems(data, now, true);
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
        escapeHtml,
        getHelperCooldowns,
        calculateStaged,
        calculateCompletionTimestamp,
        extractUpgradingItems,
        getItemCategory,
        getItemName,
        formatRemainingTime,
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
        filterNightWorld,
        getAccountTabColor,
        getRemainingColor,
        formatCompactTime,
        getCategoryDenominators,
        getCategoryCounts,
        getCategoryCompletedCounts,
        getSummaryIconUrl,
        isMultiStageWeapon,
        isCnAccount,
        getSleepRange,
        isInSleepRange,
        hasSleepHighlight,
        invalidateSleepRange,
        leaguePhaseInfo,
        leagueRoundTimes
    });
})(window);
