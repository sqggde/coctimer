// ========== 核心修复：计算完成时间（变量声明完备） ==========
function calculateCompletionTimestamp(item, data) {
    const { timer, category } = item;
    const { timestamp } = data;
    let completionTimestamp = timestamp + timer;

    // 计算加速效果
    const boosts = data.boosts || {};
    const helpers = data.helpers || [];
    const workerHelper = helpers.find(h => h.data === 93000000 || h.data === 124000000);
    const labHelper = helpers.find(h => h.data === 93000001 || h.data === 124000001);
    const itemHelperTimer = item.helper_timer || 0;

    // 根据不同类别应用不同的加速规则
    switch (category) {
        case "buildings":
        case "heroes":
        case "traps":
        case "guardians":
            // 第一步：计算helper_timer（与boost道具同样的逻辑：两种算法取最小值）
            if (itemHelperTimer > 0 && workerHelper) {
                const helperLevel = workerHelper.lvl;
                const helperReduction = itemHelperTimer * helperLevel;           // 固定减 (倍数-1)
                const helperReduction2 = itemHelperTimer * (helperLevel + 1);   // 倍速阈值 (实际倍数)
                let completionTimestamp2 = completionTimestamp - helperReduction;

                // 如果剩余时间小于等于倍速阈值，改用加速倍数计算
                if (completionTimestamp - timestamp <= helperReduction2) {
                    completionTimestamp2 = timestamp + Math.ceil((completionTimestamp - timestamp) / (helperLevel + 1));
                }

                completionTimestamp = Math.min(completionTimestamp, completionTimestamp2);
            }

            // 第二步：计算boosts
            if (boosts.builder_boost) {
                const boostReduction = boosts.builder_boost * 9;
                const boostReduction2 = boosts.builder_boost * 10;
                let completionTimestamp2 = completionTimestamp - boostReduction;

                // 如果结果剩余时间小于等于加速时间，使用加速倍数计算
                if (completionTimestamp - timestamp <= boostReduction2) {
                    completionTimestamp2 = timestamp + Math.ceil((completionTimestamp - timestamp) / 10);
                }

                completionTimestamp = Math.min(completionTimestamp, completionTimestamp2);
            } else if (boosts.builder_consumable) {
                // 工人大餐先尝试减少固定时间，再使用2倍加速
                const boostReduction = boosts.builder_consumable;
                const boostReduction2 = boosts.builder_consumable * 2;
                let completionTimestamp2 = completionTimestamp - boostReduction;

                // 如果结果剩余时间小于等于加速时间，使用加速倍数计算
                if (completionTimestamp - timestamp <= boostReduction2) {
                    const currentRemaining = completionTimestamp - timestamp;
                    const boostedTime = Math.ceil(currentRemaining / 2);
                    completionTimestamp2 = timestamp + boostedTime;
                }

                completionTimestamp = Math.min(completionTimestamp, completionTimestamp2);
            }
            break;

        case "units":
        case "siege_machines":
        case "spells":
            // 第一步：计算helper_timer（与boost道具同样的逻辑：两种算法取最小值）
            if (itemHelperTimer > 0 && labHelper) {
                const helperLevel = labHelper.lvl;
                const helperReduction = itemHelperTimer * helperLevel;           // 固定减 (倍数-1)
                const helperReduction2 = itemHelperTimer * (helperLevel + 1);   // 倍速阈值 (实际倍数)
                let completionTimestamp2 = completionTimestamp - helperReduction;

                // 如果剩余时间小于等于倍速阈值，改用加速倍数计算
                if (completionTimestamp - timestamp <= helperReduction2) {
                    completionTimestamp2 = timestamp + Math.ceil((completionTimestamp - timestamp) / (helperLevel + 1));
                }

                completionTimestamp = Math.min(completionTimestamp, completionTimestamp2);
            }

            // 第二步：计算boosts
            if (boosts.lab_boost) {
                const boostReduction = boosts.lab_boost * 23;
                const boostReduction2 = boosts.lab_boost * 24;
                let completionTimestamp2 = completionTimestamp - boostReduction;

                // 如果结果剩余时间小于等于加速时间，使用加速倍数计算
                if (completionTimestamp - timestamp <= boostReduction2) {
                    completionTimestamp2 = timestamp + Math.ceil((completionTimestamp - timestamp) / 24);
                }

                completionTimestamp = Math.min(completionTimestamp, completionTimestamp2);
            } else if (boosts.lab_consumable) {
                const boostReduction = boosts.lab_consumable * 3;
                const boostReduction2 = boosts.lab_consumable * 4;
                let completionTimestamp2 = completionTimestamp - boostReduction;

                // 如果结果剩余时间小于等于加速时间，使用加速倍数计算
                if (completionTimestamp - timestamp <= boostReduction2) {
                    const currentRemaining = completionTimestamp - timestamp;
                    const boostedTime = Math.ceil(currentRemaining / 4);
                    completionTimestamp2 = timestamp + boostedTime;
                }

                completionTimestamp = Math.min(completionTimestamp, completionTimestamp2);
            }
            break;

        case "pets":
            // 计算boosts
            if (boosts.pet_boost) {
                const boostReduction = boosts.pet_boost * 23;
                const boostReduction2 = boosts.pet_boost * 24;
                let petCompletionTimestamp = completionTimestamp - boostReduction;

                // 如果结果剩余时间小于等于加速时间，使用加速倍数计算
                if (completionTimestamp - timestamp <= boostReduction2) {
                    petCompletionTimestamp = timestamp + Math.ceil((completionTimestamp - timestamp) / 24);
                }

                completionTimestamp = Math.min(completionTimestamp, petCompletionTimestamp);
            } else if (boosts.lab_consumable) {
                // 研究浓汤先尝试减少固定时间，再使用4倍加速
                const boostReduction = boosts.lab_consumable * 3;
                const boostReduction2 = boosts.lab_consumable * 4;
                let petCompletionTimestamp = completionTimestamp - boostReduction;

                // 如果结果剩余时间小于等于加速时间，使用加速倍数计算
                if (completionTimestamp - timestamp <= boostReduction2) {
                    petCompletionTimestamp = timestamp + Math.ceil((completionTimestamp - timestamp) / 4);
                }

                completionTimestamp = Math.min(completionTimestamp, petCompletionTimestamp);
            }
            break;

        case "buildings2":
        case "traps2":
        case "heroes2":
        case "units2":
            // 计算clocktower_boost
            if (boosts.clocktower_boost) {
                const boostReduction = boosts.clocktower_boost * 9;
                const boostReduction2 = boosts.clocktower_boost * 10;
                let clockCompletionTimestamp = completionTimestamp - boostReduction;

                // 如果结果剩余时间小于等于加速时间，使用加速倍数计算
                if (completionTimestamp - timestamp <= boostReduction2) {
                    clockCompletionTimestamp = timestamp + Math.ceil((completionTimestamp - timestamp) / 10);
                }

                completionTimestamp = Math.min(completionTimestamp, clockCompletionTimestamp);
            }
            break;
    }
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
