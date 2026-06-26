// ===== 主入口 — 全局状态 + DOM 引用 + init() 事件绑定 =====

// ---------- 全局变量 ----------
let accounts = {};
let accountNotes = {};
let accountOrder = [];
let currentAccount = null;

// DOM 元素
const jsonModal = document.getElementById('json-modal');
const jsonInput = document.getElementById('json-input');
const importBtn = document.getElementById('import-btn');
const parseBtn = document.getElementById('parse-btn');
const cancelBtn = document.getElementById('cancel-btn');
const loadingIndicator = document.getElementById('loading-indicator');
const errorMessage = document.getElementById('error-message');
const emptyState = document.getElementById('empty-state');
const upgradesContainer = document.getElementById('upgrades-container');
const upgradesCountBadge = document.getElementById('upgrades-count-badge');
const dataInfoDiv = document.getElementById('data-info');
const accountTagSpan = document.getElementById('account-tag');
const exportTimeSpan = document.getElementById('export-time');
const currentTimeSpan = document.getElementById('current-time');
const tabContainer = document.getElementById('tab-container');
const accountActionsDiv = document.getElementById('account-actions');
const setNoteBtn = document.getElementById('set-note-btn');
const removeAccountBtn = document.getElementById('remove-account-btn');
const helperBtn = document.getElementById('helper-btn');
const helperModal = document.getElementById('helper-modal');
const helperContent = document.getElementById('helper-content');
const helperCloseBtn = document.getElementById('helper-close-btn');
const sortContent = document.getElementById('sort-content');
const sortListContainer = document.getElementById('sort-list-container');
const sortApplyBtn = document.getElementById('sort-apply-btn');
const sortCancelBtn = document.getElementById('sort-cancel-btn');
const mainDisplayArea = document.getElementById('main-display-area');

const categoryContainers = {
    buildings: document.getElementById('buildings-list'),
    lab: document.getElementById('lab-list'),
    pets: document.getElementById('pets-list'),
    buildings2: document.getElementById('buildings2-list'),
    units2: document.getElementById('units2-list')
};

const categoryCountBadges = {
    buildings: document.getElementById('buildings-count'),
    lab: document.getElementById('lab-count'),
    pets: document.getElementById('pets-count'),
    buildings2: document.getElementById('buildings2-count'),
    units2: document.getElementById('units2-count')
};

// 设置功能 DOM
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const settingsCloseBtn = document.getElementById('settings-close-btn');
const supportBtn = document.getElementById('support-btn');
const supportModal = document.getElementById('support-modal');
const supportCloseBtn = document.getElementById('support-close-btn');
const hideDataInfoToggle = document.getElementById('hide-data-info-toggle');
const chestDetectToggle = document.getElementById('chest-detect-toggle');
const sleepTimeBtn = document.getElementById('sleep-time-btn');
const sleepModal = document.getElementById('sleep-modal');
const sleepCloseBtn = document.getElementById('sleep-close-btn');
const sleepStartInput = document.getElementById('sleep-start-input');
const sleepEndInput = document.getElementById('sleep-end-input');
const sleepCancelBtn = document.getElementById('sleep-cancel-btn');
const sleepEnableBtn = document.getElementById('sleep-enable-btn');
const darkModeToggle = document.getElementById('dark-mode-toggle');
const darkModeAutoBtn = document.getElementById('dark-mode-auto-btn');

// ===== 初始化 =====
async function init() {
    await checkSingleInstance();
    loadSettings();
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);

    // === 按钮事件绑定 ===
    importBtn.addEventListener('click', showJsonModal);
    document.getElementById('quick-import-btn').addEventListener('click', quickImportJsonData);
    parseBtn.addEventListener('click', parseJsonData);
    cancelBtn.addEventListener('click', hideJsonModal);
    jsonModal.addEventListener('click', (e) => { if(e.target === jsonModal) hideJsonModal(); });
    document.getElementById('json-modal-close').addEventListener('click', hideJsonModal);
    document.getElementById('note-modal-close').addEventListener('click', () => { document.getElementById('note-modal').classList.add('hidden'); });
    setNoteBtn.addEventListener('click', () => { if(currentAccount) setAccountNote(currentAccount); });
    removeAccountBtn.addEventListener('click', () => { if(currentAccount && confirm('删除当前账号？')) removeAccount(currentAccount); });
    helperBtn.addEventListener('click', openHelperModal);
    helperCloseBtn.addEventListener('click', closeHelperModal);
    helperModal.addEventListener('click', (e) => { if (e.target === helperModal) closeHelperModal(); });

    // Builder Boost 国服 10x/24x 切换
    document.getElementById('builder-boost-toggle-btn')?.addEventListener('click', () => {
        if (!currentAccount || !accounts[currentAccount]) return;
        const data = accounts[currentAccount];
        if (!settings.builderBoostMode24) settings.builderBoostMode24 = {};
        const current = settings.builderBoostMode24[data.tag] || false;
        settings.builderBoostMode24[data.tag] = !current;
        saveSettings();
        refreshCurrentAccountDisplay();
    });

    settingsBtn.addEventListener('click', showSettingsModal);
    settingsCloseBtn.addEventListener('click', hideSettingsModal);
    settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) hideSettingsModal(); });
    supportBtn.addEventListener('click', () => { hideSettingsModal(); showSupportModal(); });
    supportCloseBtn.addEventListener('click', hideSupportModal);
    supportModal.addEventListener('click', (e) => { if (e.target === supportModal) hideSupportModal(); });

    hideDataInfoToggle.addEventListener('change', () => {
        settings.hideDataInfo = hideDataInfoToggle.checked;
        saveSettings();
        applySettings();
    });

    // 导出备份
    document.getElementById('export-backup-btn').addEventListener('click', () => {
        const backup = {
            version: 1,
            exportDate: new Date().toISOString(),
            data: {
                accounts,
                accountNotes,
                accountOrder,
                currentAccount
            },
            settings: { ...settings }
        };
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dateStr = new Date().toISOString().slice(0, 10);
        a.download = `coc_backup_${dateStr}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('备份已导出', 1500);
    });

    // 导入备份
    document.getElementById('import-backup-btn').addEventListener('click', () => {
        document.getElementById('backup-file-input').click();
    });
    document.getElementById('backup-file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const backup = JSON.parse(ev.target.result);
                if (!backup.data || !backup.data.accounts) {
                    showToast('备份文件格式无效', 2000);
                    return;
                }
                if (!confirm('导入备份将覆盖当前所有数据，确定继续？')) return;
                localStorage.setItem('clash_upgrade_assistant_v3_fixed', JSON.stringify(backup.data));
                localStorage.setItem('clash_upgrade_settings', JSON.stringify(backup.settings));
                showToast('备份导入成功！即将刷新', 1500);
                setTimeout(() => location.reload(), 1500);
            } catch (err) {
                showToast('文件解析失败：' + err.message, 3000);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    });

    // === 设置相关 ===
    chestDetectToggle.addEventListener('change', () => {
        settings.chestDetect = chestDetectToggle.checked;
        saveSettings();
        applySettings();
        const chestEl = document.getElementById('chest-notification');
        if (chestEl && currentAccount && accounts[currentAccount]) {
            const data = accounts[currentAccount];
            const hasChest = settings.chestDetect && data.obstacles && Array.isArray(data.obstacles) && data.obstacles.some(o => o.data === 8000030 && o.cnt > 0);
            chestEl.classList.toggle('hidden', !hasChest);
        }
    });

    darkModeToggle.addEventListener('change', () => {
        settings.darkMode = darkModeToggle.checked;
        saveSettings();
        applySettings();
    });

    darkModeAutoBtn.addEventListener('click', () => {
        settings.darkModeAuto = !settings.darkModeAuto;
        saveSettings();
        applySettings();
        if (settings.darkModeAuto) {
            checkAutoDarkMode();
        } else if (systemDarkMedia) {
            settings.darkMode = false;
            saveSettings();
            applySettings();
        }
    });

    sleepTimeBtn.addEventListener('click', () => {
        if (!settings.nightMode) {
            sleepStartInput.value = settings.sleepStart;
            sleepEndInput.value = settings.sleepEnd;
            sleepModal.classList.remove('hidden');
        } else {
            settings.nightMode = false;
            saveSettings();
            applySettings();
            if (currentAccount) refreshCurrentAccountDisplay();
            rebuildAllTabs();
        }
    });

    sleepCloseBtn.addEventListener('click', () => { sleepModal.classList.add('hidden'); });
    sleepCancelBtn.addEventListener('click', () => { sleepModal.classList.add('hidden'); });
    sleepEnableBtn.addEventListener('click', () => {
        settings.sleepStart = sleepStartInput.value;
        settings.sleepEnd = sleepEndInput.value;
        settings.nightMode = true;
        saveSettings();
        applySettings();
        sleepModal.classList.add('hidden');
        if (currentAccount) refreshCurrentAccountDisplay();
        rebuildAllTabs();
    });
    sleepModal.addEventListener('click', (e) => { if (e.target === sleepModal) sleepModal.classList.add('hidden'); });

    // 排序按钮
    sortApplyBtn.addEventListener('click', () => exitSortMode(true));
    sortCancelBtn.addEventListener('click', () => exitSortMode(false));

    // 标签栏点击
    tabContainer.addEventListener('click', (e) => {
        const tab = e.target.closest('.account-tab');
        if (tab) {
            if (tab.getAttribute('data-sort') === 'true') {
                if (!isSortMode) enterSortMode();
            } else {
                const accountTag = tab.getAttribute('data-account');
                if (accountTag) switchAccount(accountTag);
            }
        }
    });

    // 从本地存储加载
    if (loadFromLocalStorage() && Object.keys(accounts).length) {
        rebuildAllTabs();
        if (currentAccount && accounts[currentAccount]) switchAccount(currentAccount);
        else switchAccount(accountOrder[0]);
    } else {
        showEmptyState('点击「导入数据」添加账号，数据将永久保存');
        accountActionsDiv.classList.add('hidden');
        dataInfoDiv.classList.add('hidden');
        updateMainTitle();
    }

    // 最终初始化
    applySettings();
    setupSystemDarkListener();
    checkAutoDarkMode();
    initSwipeGesture();
    updateHelperButtonState();

    // 云端同步 (setupCloudSync 在 sync-client.js 中定义)
    if (typeof setupCloudSync === 'function') {
        setupCloudSync();
    }
}

document.addEventListener('DOMContentLoaded', init);
