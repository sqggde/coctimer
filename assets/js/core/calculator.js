// ========== 核心修复：计算完成时间（支持循环助手，统一 helper_timer 逻辑） ==========
function calculateCompletionTimestamp(item, data) {
    const { timer, category } = item;
    const { timestamp } = data;
    let completionTimestamp = timestamp + timer;

    // ---------- 新规则：循环助手（helper_recurrent === true） ----------
    if (item.helper_recurrent === true) {
        const supportedCategories = ["buildings", "heroes", "traps", "guardians", "units", "siege_machines", "spells"];
        if (!supportedCategories.includes(category)) {
            return timestamp + timer; // 不支持的类别直接回退
        }

        // 1. 初始剩余时间 = timer
        let remaining = timer;
        const boosts = data.boosts || {};
        const helpers = data.helpers || [];

        // 获取对应的助手
        let workerHelper = null;
        let labHelper = null;
        if (["buildings", "heroes", "traps", "guardians"].includes(category)) {
            workerHelper = helpers.find(h => h.data === 124000000 || h.data === 93000000);
        } else if (["units", "siege_machines", "spells"].includes(category)) {
            labHelper = helpers.find(h => h.data === 124000001 || h.data === 93000001);
        }

        // ---- 第一步：应用 helper_timer（统一新逻辑） ----
        let helper = workerHelper || labHelper;
        if (helper) {
            const itemHelperTimer = item.helper_timer || 0;
            if (itemHelperTimer > 0) {
                const helperLevel = helper.lvl;
                // 新增两个值
                const helperReduction = itemHelperTimer * helperLevel;          // 净减少
                const helperReduction2 = itemHelperTimer * (helperLevel + 1);   // 阈值
                if (timer <= helperReduction2) {
                    // 使用倍率
                    remaining = Math.ceil(timer / (helperLevel + 1));
                } else {
                    // 减去净减少
                    remaining = timer - helperReduction;
                }
            }
        }

        // ---- 第二步：应用一次性药水（与原逻辑完全一致） ----
        if (["buildings", "heroes", "traps", "guardians"].includes(category)) {
            if (boosts.builder_boost) {
                const is24 = settings.builderBoostMode24 && settings.builderBoostMode24[data.tag];
                const mult = is24 ? 24 : 10;
                const boostReduction = boosts.builder_boost * (mult - 1);
                const boostReduction2 = boosts.builder_boost * mult;
                let newRemaining = remaining - boostReduction;
                if (remaining <= boostReduction2) {
                    newRemaining = Math.ceil(remaining / mult);
                }
                remaining = Math.min(remaining, newRemaining);
            } else if (boosts.builder_consumable) {
                const boostReduction = boosts.builder_consumable;
                const boostReduction2 = boosts.builder_consumable * 2;
                let newRemaining = remaining - boostReduction;
                if (remaining <= boostReduction2) {
                    newRemaining = Math.ceil(remaining / 2);
                }
                remaining = Math.min(remaining, newRemaining);
            }
        } else if (["units", "siege_machines", "spells"].includes(category)) {
            if (boosts.lab_boost) {
                const boostReduction = boosts.lab_boost * 23;
                const boostReduction2 = boosts.lab_boost * 24;
                let newRemaining = remaining - boostReduction;
                if (remaining <= boostReduction2) {
                    newRemaining = Math.ceil(remaining / 24);
                }
                remaining = Math.min(remaining, newRemaining);
            } else if (boosts.lab_consumable) {
                const boostReduction = boosts.lab_consumable * 3;
                const boostReduction2 = boosts.lab_consumable * 4;
                let newRemaining = remaining - boostReduction;
                if (remaining <= boostReduction2) {
                    newRemaining = Math.ceil(remaining / 4);
                }
                remaining = Math.min(remaining, newRemaining);
            }
        }

        if (remaining <= 0) {
            return timestamp;
        }

        // ---- 第三步：循环模拟周期性助手（冷却 → 加速1小时 → 等待22小时） ----
        let currentTime = timestamp;
        if (!helper) {
            return currentTime + remaining;
        }

        const helperLevel = helper.lvl || 0;
        const boostTime = 3600;
        const boostReduction = helperLevel * boostTime;
        const boostReduction2 = (helperLevel + 1) * boostTime;
        const waitTime = 22 * 3600;
        let helperCooldown = helper.helper_cooldown || 0;

        while (true) {
            if (helperCooldown > 0) {
                if (remaining <= helperCooldown) {
                    return currentTime + remaining;
                }
                remaining -= helperCooldown;
                currentTime += helperCooldown;
                helperCooldown = 0;
            }

            if (remaining <= boostReduction2) {
                return currentTime + Math.ceil(remaining / (helperLevel + 1));
            } else {
                remaining -= boostReduction2;
                currentTime += boostTime;
                if (remaining <= waitTime) {
                    return currentTime + remaining;
                } else {
                    remaining -= waitTime;
                    currentTime += waitTime;
                }
            }
        }
    }

    // ---------- 原有计算逻辑（修正 helper_timer 为统一逻辑） ----------
    const boosts = data.boosts || {};
    const helpers = data.helpers || [];
    const workerHelper = helpers.find(h => h.data === 124000000 || h.data === 93000000);
    const labHelper = helpers.find(h => h.data === 124000001 || h.data === 93000001);
    const itemHelperTimer = item.helper_timer || 0;

    // 修正：统一 helper_timer 逻辑
    const applyHelperTimer = (remaining, helper) => {
        if (!helper || itemHelperTimer <= 0) return remaining;
        const helperLevel = helper.lvl;
        const helperReduction = itemHelperTimer * helperLevel;
        const helperReduction2 = itemHelperTimer * (helperLevel + 1);
        if (remaining <= helperReduction2) {
            return Math.ceil(remaining / (helperLevel + 1));
        } else {
            return remaining - helperReduction;
        }
    };

    // 先应用 helper_timer
    let remaining = timer;
    if (["buildings", "heroes", "traps", "guardians"].includes(category) && workerHelper) {
        remaining = applyHelperTimer(remaining, workerHelper);
    } else if (["units", "siege_machines", "spells"].includes(category) && labHelper) {
        remaining = applyHelperTimer(remaining, labHelper);
    }

    // 再应用药水
    if (["buildings", "heroes", "traps", "guardians"].includes(category)) {
        if (boosts.builder_boost) {
            const is24 = settings.builderBoostMode24 && settings.builderBoostMode24[data.tag];
            const mult = is24 ? 24 : 10;
            const boostReduction = boosts.builder_boost * (mult - 1);
            const boostReduction2 = boosts.builder_boost * mult;
            let newRemaining = remaining - boostReduction;
            if (remaining <= boostReduction2) {
                newRemaining = Math.ceil(remaining / mult);
            }
            remaining = Math.min(remaining, newRemaining);
        } else if (boosts.builder_consumable) {
            const boostReduction = boosts.builder_consumable;
            const boostReduction2 = boosts.builder_consumable * 2;
            let newRemaining = remaining - boostReduction;
            if (remaining <= boostReduction2) {
                newRemaining = Math.ceil(remaining / 2);
            }
            remaining = Math.min(remaining, newRemaining);
        }
    } else if (["units", "siege_machines", "spells"].includes(category)) {
        if (boosts.lab_boost) {
            const boostReduction = boosts.lab_boost * 23;
            const boostReduction2 = boosts.lab_boost * 24;
            let newRemaining = remaining - boostReduction;
            if (remaining <= boostReduction2) {
                newRemaining = Math.ceil(remaining / 24);
            }
            remaining = Math.min(remaining, newRemaining);
        } else if (boosts.lab_consumable) {
            const boostReduction = boosts.lab_consumable * 3;
            const boostReduction2 = boosts.lab_consumable * 4;
            let newRemaining = remaining - boostReduction;
            if (remaining <= boostReduction2) {
                newRemaining = Math.ceil(remaining / 4);
            }
            remaining = Math.min(remaining, newRemaining);
        }
    } else if (category === "pets") {
        if (boosts.pet_boost) {
            const boostReduction = boosts.pet_boost * 23;
            const boostReduction2 = boosts.pet_boost * 24;
            let newRemaining = remaining - boostReduction;
            if (remaining <= boostReduction2) {
                newRemaining = Math.ceil(remaining / 24);
            }
            remaining = Math.min(remaining, newRemaining);
        } else if (boosts.lab_consumable) {
            const boostReduction = boosts.lab_consumable * 3;
            const boostReduction2 = boosts.lab_consumable * 4;
            let newRemaining = remaining - boostReduction;
            if (remaining <= boostReduction2) {
                newRemaining = Math.ceil(remaining / 4);
            }
            remaining = Math.min(remaining, newRemaining);
        }
    } else if (["buildings2", "traps2", "heroes2", "units2"].includes(category)) {
        if (boosts.clocktower_boost) {
            const boostReduction = boosts.clocktower_boost * 9;
            const boostReduction2 = boosts.clocktower_boost * 10;
            let newRemaining = remaining - boostReduction;
            if (remaining <= boostReduction2) {
                newRemaining = Math.ceil(remaining / 10);
            }
            remaining = Math.min(remaining, newRemaining);
        }
    }

    completionTimestamp = timestamp + remaining;
    if (isNaN(completionTimestamp) || completionTimestamp < timestamp) return timestamp + timer;
    return completionTimestamp;
}

function extractUpgradingItems(data, nowTimestamp = Math.floor(Date.now() / 1000), includeCompleted = false) {
    const upgrading = [];
    const categories = ["buildings","buildings2","heroes","heroes2","units","units2","spells","siege_machines","pets","traps","traps2","guardians"];
    categories.forEach(cat => {
        if (data[cat] && Array.isArray(data[cat])) {
            data[cat].forEach((item, idx) => {
                if (item.data === 1000097 && item.types && Array.isArray(item.types)) {
                    item.types.forEach((type, tIdx) => {
                        if (type.modules && Array.isArray(type.modules)) {
                            type.modules.forEach((module, mIdx) => {
                                if (module.timer > 0) {
                                    const uniqueId = `refine_${cat}_${item.data}_${type.data}_${module.data}_${module.timer}_${tIdx}_${mIdx}`;
                                    const helperTimer = module.helper_timer || item.helper_timer || 0;
                                    const refinedItem = { ...module, category: cat, isRefiningTable: true, uniqueId, helper_timer: helperTimer, originalTimer: module.timer, lvl: module.lvl || 0 };
                                    const completion = calculateCompletionTimestamp(refinedItem, data);
                                    if (includeCompleted || completion > nowTimestamp) upgrading.push(refinedItem);
                                }
                            });
                        }
                    });
                } else if (item.timer > 0) {
                    const uniqueId = `${cat}_${item.data}_${item.timer}_${item.lvl}`;
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
    if (cat === "buildings" || cat === "heroes" || cat === "traps" || cat === "guardians" || (cat === "buildings2" && item.isRefiningTable)) return "buildings";
    if (cat === "units" || cat === "spells" || cat === "siege_machines") return "lab";
    if (cat === "pets") return "pets";
    if (cat === "buildings2" || cat === "heroes2" || cat === "traps2") return "buildings2";
    if (cat === "units2") return "units2";
    return "buildings";
}

function getItemName(id) { return ITEM_NAMES[id?.toString()] || `未知(${id})`; }

// ===== 分母：各类别可升级建筑的总数 =====
function getCategoryDenominators(data) {
    const buildings = data.buildings || [];
    const buildings2 = data.buildings2 || [];
    return {
        buildings: buildings.filter(b => b.data === 1000015 || b.data === 1000064).reduce((s, b) => s + (b.cnt || 1), 0),
        lab: buildings.filter(b => b.data === 1000007).reduce((s, b) => s + (b.cnt || 1), 0),
        pets: buildings.filter(b => b.data === 1000068).reduce((s, b) => s + (b.cnt || 1), 0),
        buildings2: buildings2.filter(b => b.data === 1000034 || b.data === 1000047 || b.data === 1000078).reduce((s, b) => s + (b.cnt || 1), 0),
        units2: buildings2.filter(b => b.data === 1000046).reduce((s, b) => s + (b.cnt || 1), 0)
    };
}
