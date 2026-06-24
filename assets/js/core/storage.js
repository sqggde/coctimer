// ===== 存储管理 — localStorage 读写 =====
const STORAGE_KEY = "clash_upgrade_assistant_v3_fixed";
const INSTANCE_KEY = "clash_upgrade_assistant_instance";
const SETTINGS_KEY = "clash_upgrade_settings";

function saveToLocalStorage() {
    const storeData = { accounts, accountNotes, accountOrder, currentAccount, version: 5 };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(storeData)); } catch (e) {}
}

function loadFromLocalStorage() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
        try {
            const saved = JSON.parse(raw);
            accounts = saved.accounts || {};
            accountNotes = saved.accountNotes || {};
            accountOrder = saved.accountOrder || [];
            currentAccount = saved.currentAccount || null;
            if (saved.version && saved.version < 5) {
                const validOrder = accountOrder.filter(tag => accounts[tag]);
                const missingTags = Object.keys(accounts).filter(tag => !validOrder.includes(tag));
                accountOrder = [...validOrder, ...missingTags];
            }
            return true;
        } catch (e) { return false; }
    }
    return false;
}

function addAccountToOrder(tag) {
    if (!accountOrder.includes(tag)) accountOrder.push(tag);
}

function removeAccountFromOrder(tag) {
    accountOrder = accountOrder.filter(t => t !== tag);
}
