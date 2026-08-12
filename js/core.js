(function (global) {
    'use strict';

    const CocTool = global.CocTool = global.CocTool || {};
    CocTool.features = CocTool.features || {};

    const STORAGE_KEY = 'clash_upgrade_assistant_v3_fixed';
    const SETTINGS_KEY = 'clash_upgrade_settings';
    const DEFAULT_SETTINGS = Object.freeze({
        hideDataInfo: false,
        chestDetect: true,
        autoImport: false,
        advanceNotify: false,
        advanceNotifyTime: 300,
        nightMode: false,
        sleepStart: '22:00',
        sleepEnd: '08:00',
        darkMode: false,
        darkModeAuto: false,
        logEnabled: false,
        appIcon: 'helper_hut',
        webdavEnabled: false,
        webdavAutoUpload: false,
        webdavServer: '',
        webdavAccount: '',
        webdavPassword: '',
        webdavFolder: '',
        webdavLastUploadTime: '',
        stealthMode: false,
        hideNightWorld: false,
        vibrate: true,
        notifyBuilding: true,
        notifyHelper: false,
        notifyClocktower: false,
        notifyClanwar: true,
        notifyLeague: true,
        dismissedUpdateVersion: 0
    });

    function createSettingsDefaults(includeLoadedFields) {
        const defaults = {
            ...DEFAULT_SETTINGS,
            dismissedCategories: {},
            builderBoostMode24: {}
        };
        if (includeLoadedFields) {
            defaults.sessionDismissedCategories = {};
            defaults.builderMonthlyPass = {};
        }
        return defaults;
    }

    const state = CocTool.state = {
        accounts: {},
        accountNotes: {},
        accountOrder: [],
        currentAccount: null,
        settings: createSettingsDefaults(false),
        sessionDismissedCategories: {},
        latestVersionData: null,
        hasUpdate: false,
        checkingUpdate: false
    };

    function replaceObject(target, source) {
        Object.keys(target).forEach(key => delete target[key]);
        Object.assign(target, source || {});
    }

    function replaceArray(target, source) {
        target.splice(0, target.length, ...(source || []));
    }

    function saveAccounts() {
        const value = {
            accounts: state.accounts,
            accountNotes: state.accountNotes,
            accountOrder: state.accountOrder,
            currentAccount: state.currentAccount,
            version: 5
        };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
            return true;
        } catch (error) {
            console.warn('保存账号数据失败', error);
            return false;
        }
    }

    function loadAccounts() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return false;
            const saved = JSON.parse(raw);
            if (!saved || !saved.accounts || typeof saved.accounts !== 'object') return false;
            replaceObject(state.accounts, saved.accounts);
            replaceObject(state.accountNotes, saved.accountNotes || {});
            replaceArray(state.accountOrder, saved.accountOrder || Object.keys(state.accounts));
            state.currentAccount = saved.currentAccount || null;
            const validOrder = state.accountOrder.filter(tag => state.accounts[tag]);
            const missingTags = Object.keys(state.accounts).filter(tag => !validOrder.includes(tag));
            replaceArray(state.accountOrder, [...validOrder, ...missingTags]);
            if (state.currentAccount && !state.accounts[state.currentAccount]) {
                state.currentAccount = state.accountOrder.length ? state.accountOrder[0] : null;
            }
            return true;
        } catch (error) {
            console.warn('读取账号数据失败', error);
            return false;
        }
    }

    function loadSettings() {
        replaceObject(state.settings, createSettingsDefaults(false));
        try {
            const raw = localStorage.getItem(SETTINGS_KEY);
            if (!raw) {
                replaceObject(state.sessionDismissedCategories, {});
                return state.settings;
            }
            replaceObject(state.settings, { ...createSettingsDefaults(true), ...JSON.parse(raw) });
            replaceObject(state.sessionDismissedCategories, state.settings.sessionDismissedCategories || {});
        } catch (error) {
            replaceObject(state.settings, createSettingsDefaults(true));
            replaceObject(state.sessionDismissedCategories, {});
            console.error('读取设置失败，保留原始数据并使用默认设置', error);
        }
        return state.settings;
    }

    function saveSettings() {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
            return true;
        } catch (error) {
            console.warn('保存设置失败', error);
            return false;
        }
    }

    CocTool.storage = Object.freeze({
        STORAGE_KEY,
        SETTINGS_KEY,
        loadAccounts,
        saveAccounts,
        loadSettings,
        saveSettings
    });

    function hasAndroidMethod(name) {
        return Boolean(global.AndroidApp && typeof global.AndroidApp[name] === 'function');
    }

    function callAndroid(name, ...args) {
        if (!hasAndroidMethod(name)) return undefined;
        return global.AndroidApp[name](...args);
    }

    function openExternal(url) {
        if (hasAndroidMethod('openInBrowser')) {
            callAndroid('openInBrowser', url);
        } else {
            global.open(url, '_blank');
        }
    }

    CocTool.platform = Object.freeze({
        has: hasAndroidMethod,
        call: callAndroid,
        openExternal
    });

    CocTool.apiBase = 'https://coctool.top';
    CocTool.appToken = 'coc-timer-2026';

    let mediaQuery;
    let mediaListenerBound = false;

    function applyTheme(isDark) {
        document.documentElement.classList.toggle('dark', Boolean(isDark));
    }

    function getSystemDarkMode() {
        try {
            if (hasAndroidMethod('isSystemDarkMode')) {
                return Boolean(callAndroid('isSystemDarkMode'));
            }
        } catch (error) {
            console.warn('读取 Android 系统主题失败', error);
        }
        return Boolean(global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches);
    }

    function syncAutomaticTheme() {
        if (!state.settings.darkModeAuto) {
            applyTheme(state.settings.darkMode);
            return state.settings.darkMode;
        }
        const isDark = getSystemDarkMode();
        if (state.settings.darkMode !== isDark) {
            state.settings.darkMode = isDark;
            saveSettings();
        }
        applyTheme(isDark);
        return isDark;
    }

    function watchSystemTheme() {
        if (mediaListenerBound || !global.matchMedia) return;
        mediaQuery = global.matchMedia('(prefers-color-scheme: dark)');
        const listener = () => {
            if (state.settings.darkModeAuto) syncAutomaticTheme();
        };
        if (typeof mediaQuery.addEventListener === 'function') {
            mediaQuery.addEventListener('change', listener);
        } else if (typeof mediaQuery.addListener === 'function') {
            mediaQuery.addListener(listener);
        }
        mediaListenerBound = true;
    }

    CocTool.theme = Object.freeze({
        apply: applyTheme,
        syncAutomatic: syncAutomaticTheme,
        initialize() {
            syncAutomaticTheme();
            watchSystemTheme();
        }
    });

    function showToast(message, duration) {
        const toast = document.getElementById('toast');
        const toastText = document.getElementById('toast-text');
        if (!toast || !toastText) return;
        toastText.textContent = message;
        toast.classList.remove('hidden');
        global.setTimeout(() => toast.classList.add('hidden'), duration || 2000);
    }

    CocTool.ui = Object.freeze({ showToast });

    let navigationBound = false;

    // 关闭所有详情覆盖层（与 handleBack 关闭顺序一致）：
    // 对战详情 → 对战日志 → 部落详情 → 图鉴 → 账号详情
    function closeDetailOverlays() {
        var hd = document.getElementById('war-history-detail');
        if (hd && hd.style.display !== 'none') {
            hd.style.display = 'none'; hd.classList.add('hidden');
            var lv = document.getElementById('clan-log-view');
            if (lv) { lv.style.display = 'flex'; lv.classList.remove('hidden'); }
        }
        var lv2 = document.getElementById('clan-log-view');
        if (lv2 && lv2.style.display !== 'none') {
            lv2.style.display = 'none'; lv2.classList.add('hidden');
        }
        var clanDetail = document.getElementById('clan-detail-page');
        if (clanDetail && clanDetail.style.display !== 'none') {
            var clanClosed = false;
            if (CocTool.features.clan && CocTool.features.clan.goBack) {
                clanClosed = CocTool.features.clan.goBack();
            }
            if (!clanClosed) {
                clanDetail.style.display = 'none';
                clanDetail.classList.add('hidden');
            }
        }
        var pokedexPage = document.getElementById('pokedex-detail-page');
        if (pokedexPage && pokedexPage.style.display !== 'none') {
            if (CocTool.features.pokedex && CocTool.features.pokedex.goBack) {
                CocTool.features.pokedex.goBack();
            } else {
                pokedexPage.style.display = 'none';
                pokedexPage.classList.add('hidden');
            }
        }
        var overviewDetail = document.getElementById('overview-detail-page');
        if (overviewDetail && overviewDetail.style.display !== 'none') {
            if (CocTool.features.overview && CocTool.features.overview.goBack) {
                CocTool.features.overview.goBack();
            } else {
                overviewDetail.style.display = 'none';
            }
        }
    }

    function showPage(page) {
        closeDetailOverlays();
        const navButtons = document.querySelectorAll('.nav-btn');
        const progressPage = document.getElementById('main-display-area');
        const helpPage = document.getElementById('help-page');
        const clanPage = document.getElementById('clan-page');
        const settingsPage = document.getElementById('settings-page');
        const overviewPage = document.getElementById('overview-page');
        const stickyTopBar = document.getElementById('sticky-top-bar');
        navButtons.forEach(button => button.classList.toggle('active', button.dataset.page === page));
        const isProgress = page === 'progress';
        if (stickyTopBar) stickyTopBar.classList.toggle('hidden', !isProgress);
        if (progressPage) progressPage.classList.toggle('hidden', !isProgress);
        if (helpPage) helpPage.classList.toggle('hidden', page !== 'help');
        if (clanPage) clanPage.classList.toggle('hidden', page !== 'clan');
        if (settingsPage) settingsPage.classList.toggle('hidden', page !== 'settings');
        if (overviewPage) overviewPage.classList.toggle('hidden', page !== 'overview');
        if (page === 'settings') {
            updateRedDot();
        }
        if (page === 'clan' && CocTool.features.clan) {
            CocTool.features.clan.init();
        }
        if (page === 'overview' && CocTool.features.overview) {
            CocTool.features.overview.init();
        }
    }

    function initNavigation() {
        if (navigationBound) return;
        document.querySelectorAll('.nav-btn').forEach(button => {
            button.addEventListener('click', () => showPage(button.dataset.page));
        });
        navigationBound = true;
    }

    CocTool.navigation = Object.freeze({ init: initNavigation, showPage });

    CocTool.handleBack = function () {
        var openModal = document.querySelector('.modal-overlay:not(.hidden)');
        if (openModal) {
            openModal.classList.add('hidden');
            return 'true';
        }
        var hd = document.getElementById('war-history-detail');
        if (hd && hd.style.display !== 'none') {
            hd.style.display = 'none'; hd.classList.add('hidden');
            var lv = document.getElementById('clan-log-view');
            if (lv) { lv.style.display = 'flex'; lv.classList.remove('hidden') }
            return 'true';
        }
        var lv2 = document.getElementById('clan-log-view');
        if (lv2 && lv2.style.display !== 'none') {
            lv2.style.display = 'none'; lv2.classList.add('hidden');
            return 'true';
        }
        var detailPage = document.getElementById('clan-detail-page');
        if (detailPage && detailPage.style.display !== 'none') {
            if (CocTool.features.clan && CocTool.features.clan.goBack) {
                CocTool.features.clan.goBack();
            } else {
                detailPage.style.display = 'none';
            }
            return 'true';
        }
        var pokedexPage = document.getElementById('pokedex-detail-page');
        if (pokedexPage && pokedexPage.style.display !== 'none') {
            if (CocTool.features.pokedex && CocTool.features.pokedex.goBack) {
                CocTool.features.pokedex.goBack();
            } else {
                pokedexPage.style.display = 'none';
            }
            return 'true';
        }
        var overviewDetail = document.getElementById('overview-detail-page');
        if (overviewDetail && overviewDetail.style.display !== 'none') {
            if (CocTool.features.overview && CocTool.features.overview.goBack) {
                CocTool.features.overview.goBack();
            } else {
                overviewDetail.style.display = 'none';
            }
            return 'true';
        }
        var progressPage = document.getElementById('main-display-area');
        if (progressPage && progressPage.classList.contains('hidden')) {
            var activeBtn = document.querySelector('.nav-btn.active');
            if (activeBtn && activeBtn.dataset.page !== 'progress') {
                var progressBtn = document.querySelector('.nav-btn[data-page="progress"]');
                if (progressBtn) progressBtn.click();
                return 'true';
            }
        }
        return 'false';
    };

    function updateRedDot() {
        var show = state.hasUpdate;
        var nd = document.getElementById('nav-settings-dot');
        if (nd) {
            nd.classList.toggle('hidden', !show);
            nd.style.display = show ? '' : 'none';
        }
        var cd = document.getElementById('check-update-dot');
        if (cd) {
            cd.classList.toggle('hidden', !show);
            cd.style.display = show ? '' : 'none';
        }
    }

    CocTool.checkForUpdate = function() {
        if (state.checkingUpdate) return;
        state.checkingUpdate = true;
        var url = CocTool.apiBase + '/api/coc/version';
        var controller = new AbortController();
        var timeout = setTimeout(function() { controller.abort(); }, 8000);
        fetch(url, { headers: { 'X-App-Token': CocTool.appToken }, signal: controller.signal })
        .then(function(r) {
            clearTimeout(timeout);
            if (!r.ok) return Promise.reject();
            return r.json();
        })
        .then(function(data) {
            clearTimeout(timeout);
            var local = window.AndroidApp ? window.AndroidApp.getVersionCode() : -1;
            if (data.versionCode > local && data.versionCode > state.settings.dismissedUpdateVersion) {
                state.latestVersionData = data;
                state.hasUpdate = true;
            } else {
                state.hasUpdate = false;
            }
            updateRedDot();
        })
        .catch(function() {
            clearTimeout(timeout);
        })
        .finally(function() {
            state.checkingUpdate = false;
        });
    };

    CocTool.dismissUpdate = function() {
        if (state.latestVersionData) {
            state.settings.dismissedUpdateVersion = state.latestVersionData.versionCode;
            CocTool.storage.saveSettings();
        }
        state.hasUpdate = false;
        state.latestVersionData = null;
        updateRedDot();
    };
})(window);
