// ===== 计算引擎 — 完成时间计算 & 升级项提取 =====
function calculateCompletionTimestamp(item, data) {
    const { timer, category } = item;
    const { timestamp } = data;
    let completionTimestamp = timestamp + timer;

    const boosts = data.boosts || {};
    const helpers = data.helpers || [];
    const workerHelper = helpers.find(h => h.data === 93000000 || h.data === 124000000);
    const labHelper = helpers.find(h => h.data === 93000001 || h.data === 124000001);
    const itemHelperTimer = item.helper_timer || 0;

    if (category === "buildings" || category === "buildings2" || category === "traps" || category === "traps2") {
        if (workerHelper) {
            const helperLevel = workerHelper.lvl;
            const helperReduction = itemHelperTimer * helperLevel;
            if (itemHelperTimer > 0 && helperLevel > 0) {
                completionTimestamp = timestamp + (timer - helperReduction);
                const boostMultiplier = helperLevel + 1;
                if (boosts.builder_boost && boosts.builder_boost > 0) {
                    const boostReduction = boosts.builder_boost * 9;
                    const boostReduction2 = boosts.builder_boost * 10;
                    let completionTimestamp2 = completionTimestamp - boostReduction;
                    if (completionTimestamp2 < completionTimestamp - boostReduction2) {
                        completionTimestamp2 = completionTimestamp - boostReduction2;
                    }
                    if (completionTimestamp2 < completionTimestamp) completionTimestamp = completionTimestamp2;
                }
                if (boosts.builder_consumable && boosts.builder_consumable > 0 && (category === "buildings" || category === "buildings2")) {
                    const boostReduction = boosts.builder_consumable;
                    const boostReduction2 = boosts.builder_consumable * 2;
                    let completionTimestamp2 = completionTimestamp - boostReduction;
                    if (completionTimestamp2 < completionTimestamp - boostReduction2) completionTimestamp2 = completionTimestamp - boostReduction2;
                    if (completionTimestamp2 < completionTimestamp) {
                        const currentRemaining = completionTimestamp - timestamp;
                        const boostedTime = Math.ceil(currentRemaining / 2);
                        completionTimestamp = timestamp + boostedTime;
                    }
                }
            }
        }
        if (!workerHelper || itemHelperTimer === 0) {
            if (boosts.builder_boost && boosts.builder_boost > 0) {
                const boostReduction = boosts.builder_boost * 9;
                const boostReduction2 = boosts.builder_boost * 10;
                let completionTimestamp2 = completionTimestamp - boostReduction;
                if (completionTimestamp2 < completionTimestamp - boostReduction2) completionTimestamp2 = completionTimestamp - boostReduction2;
                if (completionTimestamp2 < completionTimestamp) completionTimestamp = completionTimestamp2;
            }
            if (boosts.builder_consumable && boosts.builder_consumable > 0 && (category === "buildings" || category === "buildings2")) {
                const currentRemaining = completionTimestamp - timestamp;
                const boostedTime = Math.ceil(currentRemaining / 2);
                if (boostedTime < currentRemaining) completionTimestamp = timestamp + boostedTime;
            }
        }
    }

    if (category === "units" || category === "units2" || category === "spells" || category === "heroes" || category === "heroes2" || category === "siege_machines" || category === "guardians") {
        if (labHelper) {
            const helperLevel = labHelper.lvl;
            const helperReduction = itemHelperTimer * helperLevel;
            if (itemHelperTimer > 0 && helperLevel > 0) {
                completionTimestamp = timestamp + (timer - helperReduction);
                const boostMultiplier = helperLevel + 1;
                if (boosts.lab_boost && boosts.lab_boost > 0) {
                    const boostReduction = boosts.lab_boost * 23;
                    const boostReduction2 = boosts.lab_boost * 24;
                    let completionTimestamp2 = completionTimestamp - boostReduction;
                    if (completionTimestamp2 < completionTimestamp - boostReduction2) completionTimestamp2 = completionTimestamp - boostReduction2;
                    if (completionTimestamp2 < completionTimestamp) completionTimestamp = completionTimestamp2;
                }
                if (boosts.lab_consumable && boosts.lab_consumable > 0) {
                    const boostReduction = boosts.lab_consumable * 3;
                    const boostReduction2 = boosts.lab_consumable * 4;
                    let completionTimestamp2 = completionTimestamp - boostReduction;
                    if (completionTimestamp2 < completionTimestamp - boostReduction2) completionTimestamp2 = completionTimestamp - boostReduction2;
                    if (completionTimestamp2 < completionTimestamp) {
                        const currentRemaining = completionTimestamp - timestamp;
                        const boostedTime = Math.ceil(currentRemaining / 4);
                        completionTimestamp = timestamp + boostedTime;
                    }
                }
            }
        }
        if (!labHelper || itemHelperTimer === 0) {
            if (boosts.lab_boost && boosts.lab_boost > 0) {
                const boostReduction = boosts.lab_boost * 23;
                const boostReduction2 = boosts.lab_boost * 24;
                let completionTimestamp2 = completionTimestamp - boostReduction;
                if (completionTimestamp2 < completionTimestamp - boostReduction2) completionTimestamp2 = completionTimestamp - boostReduction2;
                if (completionTimestamp2 < completionTimestamp) completionTimestamp = completionTimestamp2;
            }
            if (boosts.lab_consumable && boosts.lab_consumable > 0) {
                const currentRemaining = completionTimestamp - timestamp;
                const boostedTime = Math.ceil(currentRemaining / 4);
                if (boostedTime < currentRemaining) completionTimestamp = timestamp + boostedTime;
            }
        }
    }

    if (category === "pets") {
        if (boosts.pet_boost && boosts.pet_boost > 0) {
            const boostReduction = boosts.pet_boost * 23;
            const boostReduction2 = boosts.pet_boost * 24;
            let petCompletionTimestamp = completionTimestamp - boostReduction;
            if (petCompletionTimestamp < completionTimestamp - boostReduction2) petCompletionTimestamp = completionTimestamp - boostReduction2;
            if (petCompletionTimestamp < completionTimestamp) completionTimestamp = petCompletionTimestamp;
        }
        if (boosts.lab_consumable && boosts.lab_consumable > 0) {
            const boostReduction = boosts.lab_consumable * 3;
            const boostReduction2 = boosts.lab_consumable * 4;
            let petCompletionTimestamp = completionTimestamp - boostReduction;
            if (petCompletionTimestamp < completionTimestamp - boostReduction2) petCompletionTimestamp = completionTimestamp - boostReduction2;
            if (petCompletionTimestamp < completionTimestamp) {
                const currentRemaining = completionTimestamp - timestamp;
                const boostedTime = Math.ceil(currentRemaining / 4);
                completionTimestamp = timestamp + boostedTime;
            }
        }
    }

    if (category === "buildings2") {
        if (boosts.clocktower_boost && boosts.clocktower_boost > 0) {
            const boostReduction = boosts.clocktower_boost * 9;
            const boostReduction2 = boosts.clocktower_boost * 10;
            let clockCompletionTimestamp = completionTimestamp - boostReduction;
            if (clockCompletionTimestamp < completionTimestamp - boostReduction2) clockCompletionTimestamp = completionTimestamp - boostReduction2;
            if (clockCompletionTimestamp < completionTimestamp) completionTimestamp = clockCompletionTimestamp;
        }
    }

    return completionTimestamp;
}

function extractUpgradingItems(data, nowTimestamp = Math.floor(Date.now() / 1000), includeCompleted = false) {
    const upgrading = [];
    const categories = ["buildings","buildings2","heroes","heroes2","units","units2","spells","siege_machines","pets","traps","traps2","guardians"];
    for (const cat of categories) {
        const items = data[cat];
        if (!items || !Array.isArray(items)) continue;
        for (const item of items) {
            if (typeof item !== 'object' || item === null) continue;
            if (item.timer && item.timer > 0) {
                if (item.data === 1000097) {
                    if (item.refine && Array.isArray(item.refine)) {
                        item.refine.forEach((type, tIdx) => {
                            if (type.module && Array.isArray(type.module)) {
                                type.module.forEach((module, mIdx) => {
                                    if (module.timer && module.timer > 0) {
                                        const uniqueId = `refine_${cat}_${item.data}_${type.data}_${module.data}_${module.timer}_${tIdx}_${mIdx}`;
                                        const helperTimer = module.helper_timer || item.helper_timer || 0;
                                        const refinedItem = { ...module, category: cat, isRefiningTable: true, uniqueId, helper_timer: helperTimer, originalTimer: module.timer, lvl: module.lvl || 0 };
                                        const completion = calculateCompletionTimestamp(refinedItem, data);
                                        if (includeCompleted || completion > nowTimestamp) upgrading.push(refinedItem);
                                    }
                                });
                            }
                        });
                    }
                    continue;
                }
                const uniqueId = `${cat}_${item.data}_${item.timer}_${item.lvl}`;
                const newItem = { ...item, category: cat, uniqueId, originalTimer: item.timer };
                const completion = calculateCompletionTimestamp(newItem, data);
                if (includeCompleted || completion > nowTimestamp) upgrading.push(newItem);
            }
        }
    }
    return upgrading;
}

function getItemCategory(item) {
    const cat = item.category;
    if (cat === "buildings" || cat === "heroes" || cat === "traps" || (cat === "buildings2" && item.isRefiningTable)) return "buildings";
    if (cat === "units" || cat === "spells" || cat === "siege_machines" || cat === "guardians") return "lab";
    if (cat === "pets") return "pets";
    if (cat === "buildings2" || cat === "heroes2" || cat === "traps2") return "buildings2";
    if (cat === "units2") return "units2";
    return "buildings";
}

function getItemName(id) {
    return ITEM_NAMES[id?.toString()] || `未知(${id})`;
}
