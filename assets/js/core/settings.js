// ===== 设置管理 =====
let settings = { hideDataInfo: false, chestDetect: true, nightMode: false, sleepStart: '22:00', sleepEnd: '08:00', darkMode: false, darkModeAuto: false, dismissedCategories: {} };

function loadSettings() {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (raw) settings = { ...{ hideDataInfo: false, chestDetect: true, nightMode: false, sleepStart: '22:00', sleepEnd: '08:00', darkMode: false, darkModeAuto: false }, ...JSON.parse(raw) };
    } catch (e) { settings = { hideDataInfo: false, chestDetect: true, nightMode: false, sleepStart: '22:00', sleepEnd: '08:00', darkMode: false, darkModeAuto: false, dismissedCategories: {} }; }
}

function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
}

function applySettings() {
    hideDataInfoToggle.checked = settings.hideDataInfo;
    chestDetectToggle.checked = settings.chestDetect;
    darkModeToggle.checked = settings.darkMode;
    darkModeAutoBtn.className = settings.darkModeAuto
        ? 'px-2 py-1 rounded transition-all duration-200 text-xs bg-blue-500 text-white'
        : 'px-2 py-1 rounded transition-all duration-200 text-xs bg-gray-300 text-gray-500';
    darkModeAutoBtn.textContent = settings.darkModeAuto ? '跟随系统' : '跟随系统';
    dataInfoDiv.classList.toggle('hidden', settings.hideDataInfo);
    sleepTimeBtn.className = settings.nightMode
        ? 'px-3 py-1 rounded-lg transition-all duration-200 text-xs bg-blue-200 text-blue-700 cursor-pointer hover:bg-blue-300'
        : 'px-3 py-1 rounded-lg transition-all duration-200 text-xs bg-gray-300 text-gray-500 cursor-not-allowed';
    sleepTimeBtn.textContent = settings.nightMode ? '设置睡眠时间' : '设置睡眠时间';
    applyDarkMode();
}

function applyDarkMode() {
    document.documentElement.classList.toggle('dark', settings.darkMode);
}

let systemDarkMedia = null;

function checkAutoDarkMode() {
    if (!settings.darkModeAuto) return;
    const shouldBeDark = systemDarkMedia ? systemDarkMedia.matches : window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (settings.darkMode !== shouldBeDark) {
        settings.darkMode = shouldBeDark;
        saveSettings();
        applySettings();
    }
}

function setupSystemDarkListener() {
    systemDarkMedia = window.matchMedia('(prefers-color-scheme: dark)');
    systemDarkMedia.addEventListener('change', () => {
        if (settings.darkModeAuto) checkAutoDarkMode();
    });
}

function getNextSleepRange() {
    if (!settings.nightMode) return null;
    const now = new Date();
    const [startHour, startMin] = settings.sleepStart.split(':').map(Number);
    const [endHour, endMin] = settings.sleepEnd.split(':').map(Number);

    let startDate = new Date(now);
    startDate.setHours(startHour, startMin, 0, 0);

    let endDate = new Date(now);
    endDate.setHours(endHour, endMin, 0, 0);

    if (endDate <= startDate) {
        endDate.setDate(endDate.getDate() + 1);
    }

    if (now >= endDate) {
        startDate.setDate(startDate.getDate() + 1);
        endDate.setDate(endDate.getDate() + 1);
    }

    return {
        start: Math.floor(startDate.getTime() / 1000),
        end: Math.floor(endDate.getTime() / 1000)
    };
}

function isInSleepRange(completionTs) {
    const range = getNextSleepRange();
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

function showSettingsModal() { settingsModal.classList.remove('hidden'); }
function hideSettingsModal() { settingsModal.classList.add('hidden'); }
function showSupportModal() { supportModal.classList.remove('hidden'); }
function hideSupportModal() { supportModal.classList.add('hidden'); }
