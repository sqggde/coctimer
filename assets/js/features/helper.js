// ===== 助手冷却功能 =====

/**
 * 检查指定类别中是否有持续指派（helper_recurrent === true）的项目
 */
function hasRecurrentItem(data, categories) {
    for (const cat of categories) {
        if (data[cat] && Array.isArray(data[cat])) {
            for (const item of data[cat]) {
                if (item.helper_recurrent === true) return true;
                // 精制台特殊处理：检查内部 modules
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

/**
 * 计算持续指派助手的循环冷却剩余时间
 * 周期：82800s (23h) = 3600s 加速 + 79200s 等待
 * @param {number} initialCooldown - 游戏导出的初始 helper_cooldown
 * @param {number} elapsed - 从导出到现在经过的秒数
 * @returns {number} 当前周期剩余秒数
 */
function getRecurrentCooldown(initialCooldown, elapsed) {
    if (elapsed < initialCooldown) {
        // 还在第一轮初始冷却中
        return initialCooldown - elapsed;
    }
    // 已进入循环：1h 加速 + 22h 等待 = 82800 循环
    const cycleElapsed = (elapsed - initialCooldown) % 82800;
    return 82800 - cycleElapsed;
}

function getHelperCooldowns() {
    if (!currentAccount || !accounts[currentAccount]) return null;
    const data = accounts[currentAccount];
    const timestamp = data.timestamp || Math.floor(Date.now() / 1000);
    const now = Math.floor(Date.now() / 1000);
    const helpers = data.helpers || [];
    const boosts = data.boosts || {};

    const worker = helpers.find(h => h.data === 124000000 || h.data === 93000000);
    const lab = helpers.find(h => h.data === 124000001 || h.data === 93000001);

    // 检测持续指派
    const hasRecurrentWorker = hasRecurrentItem(data, ["buildings", "heroes", "traps", "guardians"]);
    const hasRecurrentLab = hasRecurrentItem(data, ["units", "siege_machines", "spells"]);

    const elapsed = now - timestamp;

    // 工人助手冷却
    let workerCooldown = 0;
    if (worker) {
        if (hasRecurrentWorker) {
            const initial = worker.helper_cooldown || 82800;
            workerCooldown = getRecurrentCooldown(initial, elapsed);
        } else {
            workerCooldown = worker.helper_cooldown ? Math.max(0, worker.helper_cooldown - elapsed) : 0;
        }
    }

    // 实验室助手冷却
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

function updateHelperButtonState() {
    const cooldowns = getHelperCooldowns();
    if (!cooldowns) {
        helperBtn.classList.remove('bg-green-500', 'hover:bg-green-600');
        helperBtn.classList.add('bg-gray-400', 'hover:bg-gray-500');
        return;
    }
    const { worker, lab, clock, clockUpgrading } = cooldowns;
    if (worker > 0 && lab > 0 && (clock > 0 || clockUpgrading)) {
        helperBtn.classList.remove('bg-green-500', 'hover:bg-green-600');
        helperBtn.classList.add('bg-gray-400', 'hover:bg-gray-500');
    } else {
        helperBtn.classList.remove('bg-gray-400', 'hover:bg-gray-500');
        helperBtn.classList.add('bg-green-500', 'hover:bg-green-600');
    }
}

/**
 * 获取持续指派项目的当前阶段
 * @param {object} item - 项目对象
 * @param {object} data - 账号数据
 * @returns {string|null} 'boost' | 'wait' | null
 */
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
    if (elapsed < initialCooldown) {
        // 还在初始冷却阶段，未进入循环
        return 'wait';
    }

    // 已进入 boost-wait 循环
    const cycleElapsed = (elapsed - initialCooldown) % 82800;
    return cycleElapsed < 3600 ? 'boost' : 'wait';
}

function updateHelperModal() {
    if (helperModal.classList.contains('hidden')) return;
    const cooldowns = getHelperCooldowns();
    if (!cooldowns) return;

    const data = accounts[currentAccount];
    const helpers = data.helpers || [];
    const worker = helpers.find(h => h.data === 124000000 || h.data === 93000000);
    const lab = helpers.find(h => h.data === 124000001 || h.data === 93000001);
    const workerLv = worker ? ` Lv${worker.lvl}` : '';
    const labLv = lab ? ` Lv${lab.lvl}` : '';

    // 钟楼等级：从 buildings2 中找时光钟楼（data === 1000039）
    let clockLv = '';
    const buildings2 = data.buildings2 || [];
    const clockTower = buildings2.find(b => b.data === 1000039);
    if (clockTower && clockTower.lvl) clockLv = ` Lv${clockTower.lvl}`;

    const clockDisplay = cooldowns.clockUpgrading ? '升级中' : formatRemainingTime(cooldowns.clock);
    const clockClass = cooldowns.clockUpgrading ? 'text-primary' : (cooldowns.clock > 0 ? 'text-primary' : 'text-success');

    const workerLabel = cooldowns.hasRecurrentWorker ? '工人助手 ♻️' : '工人助手';
    const labLabel = cooldowns.hasRecurrentLab ? '实验室助手 ♻️' : '实验室助手';

    helperContent.innerHTML = `
        <div class="helper-row"><span class="text-sm font-medium">${workerLabel}${workerLv}</span><span class="text-sm ${cooldowns.worker > 0 ? 'text-primary' : 'text-success'}">${formatRemainingTime(cooldowns.worker)}</span></div>
        <div class="helper-row"><span class="text-sm font-medium">${labLabel}${labLv}</span><span class="text-sm ${cooldowns.lab > 0 ? 'text-primary' : 'text-success'}">${formatRemainingTime(cooldowns.lab)}</span></div>
        <div class="helper-row"><span class="text-sm font-medium">钟楼${clockLv}</span><span class="text-sm ${clockClass}">${clockDisplay}</span></div>
    `;
}

function openHelperModal() {
    helperModal.classList.remove('hidden');
    updateHelperModal();
}

function closeHelperModal() {
    helperModal.classList.add('hidden');
}
