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
            if (typeof CocTool.syncWidgetData === 'function') {
                setTimeout(function() { CocTool.syncWidgetData(); }, 500);
            }
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

    // ========== 小组件诊断日志（独立于通知日志，localStorage 持久化） ==========
    CocTool.widgetLog = (function() {
        var KEY = 'clash_widget_log';
        var MAX = 300;
        var logs = [];
        function load() {
            try {
                var raw = localStorage.getItem(KEY);
                if (raw) logs = JSON.parse(raw);
            } catch (e) { logs = []; }
        }
        function persist() {
            try { localStorage.setItem(KEY, JSON.stringify(logs.slice(-MAX))); } catch (e) {}
        }
        function fmtTime(ts) {
            var d = new Date(ts);
            return String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' ' +
                   String(d.getHours()).padStart(2, '0') + ':' +
                   String(d.getMinutes()).padStart(2, '0') + ':' +
                   String(d.getSeconds()).padStart(2, '0');
        }
        load();
        return {
            log: function(detail) {
                logs.push({ ts: Date.now(), detail: String(detail) });
                if (logs.length > MAX) logs.shift();
                persist();
            },
            getLogs: function() { return logs.slice(); },
            getFormatted: function() {
                var lines = [];
                for (var i = 0; i < logs.length; i++) {
                    lines.push('[' + fmtTime(logs[i].ts) + '] ' + logs[i].detail);
                }
                return lines.join('\n');
            },
            clear: function() { logs = []; persist(); }
        };
    })();

    CocTool.syncWidgetData = function() {
        if (!window.AndroidApp || typeof window.AndroidApp.syncWidgetData !== 'function') {
            CocTool.widgetLog.log('桥接不可用：window.AndroidApp.syncWidgetData 未注册');
            return;
        }

        try {
            var accounts = state.accounts || {};
            var selectedJson = localStorage.getItem('widget_selected_accounts') || '[]';
            var selectedAccounts = JSON.parse(selectedJson);

            // If no accounts selected, use all accounts
            var accountsToSync = selectedAccounts.length > 0 ? selectedAccounts : Object.keys(accounts);
            var settings = state.settings || {};
            var calc = CocTool.calc;

            var upgradeData = {};
            var totalUpgrades = 0;
            var nowSec = Math.floor(Date.now() / 1000);
            for (var i = 0; i < accountsToSync.length; i++) {
                var tag = accountsToSync[i];
                var account = accounts[tag];
                if (!account) continue;

                // 复用权威提取逻辑（含加速/精工台/递归处理）；includeCompleted=true 以区分已完成节点（绿色）；屏蔽夜世界时过滤夜世界分类
                var items = calc.filterNightWorld(calc.extractUpgradingItems(account, Math.floor(Date.now() / 1000), true));
                var upgrades = [];
                for (var j = 0; j < items.length; j++) {
                    var item = items[j];
                    var completionSec = calc.calculateCompletionTimestamp(item, account, settings);

                    var iconPath = null;
                    var iconCandidates = calc.getItemIconUrl(item);
                    if (iconCandidates && iconCandidates.length) {
                        iconPath = iconCandidates[0].replace(/^img\/icons\//, '');
                    }

                    upgrades.push({
                        id: item.uniqueId || (item.category + '_' + item.data + '_' + item.timer + '_' + item.lvl),
                        building: calc.getItemName(item.data),
                        icon: iconPath || '',
                        fromLevel: item.lvl,
                        toLevel: item.lvl + 1,
                        finishTime: completionSec * 1000,
                        completed: completionSec <= nowSec
                    });
                }

                upgrades.sort(function(a, b) { return a.finishTime - b.finishTime; });

                var noteName = (state.accountNotes && state.accountNotes[tag]) || '';
                upgradeData[tag] = {
                    name: noteName || account.name || tag,
                    upgrades: upgrades.slice(0, 50)
                };
                totalUpgrades += upgradeData[tag].upgrades.length;
            }

            var jsonStr = JSON.stringify(upgradeData);
            CocTool.widgetLog.log('同步：账号 ' + Object.keys(upgradeData).length + ' 个，升级节点 ' + totalUpgrades + ' 个，数据 ' + (jsonStr.length / 1024).toFixed(1) + 'KB');
            window.AndroidApp.syncWidgetData(selectedJson, jsonStr);
            CocTool.widgetLog.log('已调用 AndroidApp.syncWidgetData 提交给 Java');
        } catch (e) {
            CocTool.widgetLog.log('同步异常：' + (e && e.message ? e.message : e));
        }
    };

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

    // 通用确认弹窗：动态创建 .modal-overlay/.modal-card（与 index.html 静态模态同一套样式），避免原生 confirm
    let confirmModalEl = null;
    function closeConfirm() {
        if (confirmModalEl) {
            confirmModalEl.remove();
            confirmModalEl = null;
        }
    }
    function showConfirm(options) {
        const opts = options || {};
        closeConfirm();
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML =
            '<div class="modal-card w-xs">' +
                '<h3 class="font-semibold text-gray-800 mb-3 text-center" style="font-size: 15px;">' + (opts.title || '确认') + '</h3>' +
                '<p class="text-sm text-gray-600 mb-4 text-center" style="word-break: break-all;">' + (opts.text || '') + '</p>' +
                '<div class="flex flex-col space-y-2">' +
                    '<button class="__confirm-ok w-full px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all duration-200 text-sm">' + (opts.confirmText || '确定') + '</button>' +
                    '<button class="__confirm-cancel w-full px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition-all duration-200 text-sm">' + (opts.cancelText || '取消') + '</button>' +
                '</div>' +
            '</div>';
        confirmModalEl = overlay;
        document.body.appendChild(overlay);
        overlay.querySelector('.__confirm-ok').addEventListener('click', () => {
            closeConfirm();
            if (typeof opts.onConfirm === 'function') opts.onConfirm();
        });
        overlay.querySelector('.__confirm-cancel').addEventListener('click', () => {
            closeConfirm();
            if (typeof opts.onCancel === 'function') opts.onCancel();
        });
        overlay.addEventListener('click', e => {
            if (e.target === overlay) closeConfirm();
        });
    }

    CocTool.ui = Object.freeze({ showToast, showConfirm, closeConfirm });

    let navigationBound = false;

    // 关闭所有详情覆盖层（与 handleBack 关闭顺序一致）：
    // 对战详情 → 对战日志 → 部落详情 → 图鉴 → 账号详情
    function closeDetailOverlays() {
        // 小组件管理覆盖层（设置页内多级页面）
        if (CocTool.widgetManager && CocTool.widgetManager.closeAll) {
            CocTool.widgetManager.closeAll();
        }
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
        // 切出首页时若处于排序模式则取消（等同点取消，不应用变更）；排序面板是独立容器，不会随页面隐藏
        if (page !== 'progress' && CocTool.features.accounts && CocTool.features.accounts.exitSortModeIfActive) {
            CocTool.features.accounts.exitSortModeIfActive();
        }
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

    // Android 后台切前台（MainActivity.onResume 经 evaluateJavascript 调用）：
    // 停留在账号进度列表页（且未打开详情）时整页刷新——倒计时/时间排序/已完成项全部重算
    CocTool.onAppResume = function () {
        try {
            if (!CocTool.features || !CocTool.features.overview) return;
            var overviewPage = document.getElementById('overview-page');
            var detailPage = document.getElementById('overview-detail-page');
            if (overviewPage && !overviewPage.classList.contains('hidden') &&
                (!detailPage || detailPage.style.display === 'none')) {
                CocTool.features.overview.init();
            }
        } catch (e) {}
    };

    CocTool.handleBack = function () {
        var openModal = document.querySelector('.modal-overlay:not(.hidden)');
        if (openModal) {
            openModal.classList.add('hidden');
            return 'true';
        }
        // 小组件管理覆盖层：配置页 → 列表页 → 未开则继续（对齐账号进度/部落逐级返回）
        if (CocTool.widgetManager && CocTool.widgetManager.goBack) {
            if (CocTool.widgetManager.goBack()) return 'true';
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
