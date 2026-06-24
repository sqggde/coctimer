// ===== 助手冷却功能 =====
function getHelperCooldowns() {
    if (!currentAccount || !accounts[currentAccount]) return null;
    const data = accounts[currentAccount];
    const timestamp = data.timestamp || Math.floor(Date.now() / 1000);
    const now = Math.floor(Date.now() / 1000);
    const helpers = data.helpers || [];
    const boosts = data.boosts || {};
    const worker = helpers.find(h => h.data === 124000000 || h.data === 93000000);
    const workerCooldown = worker && worker.helper_cooldown ? Math.max(0, worker.helper_cooldown - (now - timestamp)) : 0;
    const lab = helpers.find(h => h.data === 124000001 || h.data === 93000001);
    const labCooldown = lab && lab.helper_cooldown ? Math.max(0, lab.helper_cooldown - (now - timestamp)) : 0;
    const clockCooldown = boosts.clocktower_cooldown ? Math.max(0, boosts.clocktower_cooldown - (now - timestamp)) : 0;
    const clockUpgrading = data.buildings2 && Array.isArray(data.buildings2) && data.buildings2.some(item => item.data === 1000039 && item.timer > 0);
    return { worker: workerCooldown, lab: labCooldown, clock: clockCooldown, clockUpgrading };
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

function updateHelperModal() {
    if (helperModal.classList.contains('hidden')) return;
    const cooldowns = getHelperCooldowns();
    if (!cooldowns) return;
    const clockDisplay = cooldowns.clockUpgrading ? '升级中' : formatRemainingTime(cooldowns.clock);
    const clockClass = cooldowns.clockUpgrading ? 'text-primary' : (cooldowns.clock > 0 ? 'text-primary' : 'text-success');
    helperContent.innerHTML = `
        <div class="helper-row"><span class="text-sm font-medium">工人助手</span><span class="text-sm ${cooldowns.worker > 0 ? 'text-primary' : 'text-success'}">${formatRemainingTime(cooldowns.worker)}</span></div>
        <div class="helper-row"><span class="text-sm font-medium">实验室助手</span><span class="text-sm ${cooldowns.lab > 0 ? 'text-primary' : 'text-success'}">${formatRemainingTime(cooldowns.lab)}</span></div>
        <div class="helper-row"><span class="text-sm font-medium">钟楼</span><span class="text-sm ${clockClass}">${clockDisplay}</span></div>
    `;
}

function openHelperModal() {
    helperModal.classList.remove('hidden');
    updateHelperModal();
}

function closeHelperModal() {
    helperModal.classList.add('hidden');
}
