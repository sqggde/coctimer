(function (global) {
    'use strict';

    function requireModules() {
        const CocTool = global.CocTool;
        const missing = [];
        if (!CocTool) missing.push('core');
        if (!CocTool || !CocTool.features.progress) missing.push('progress');
        if (!CocTool || !CocTool.features.accounts) missing.push('accounts');
        if (!CocTool || !CocTool.features.settings) missing.push('settings');
        if (!CocTool || !CocTool.features.services) missing.push('services');
        if (!CocTool || !CocTool.features.clan) missing.push('clan');
        if (!CocTool || !CocTool.features.overview) missing.push('overview');
        if (missing.length) throw new Error('缺少前端模块: ' + missing.join(', '));
        return CocTool;
    }

    function run(name, action) {
        try {
            return action();
        } catch (error) {
            console.error(name + ' 初始化失败', error);
            return undefined;
        }
    }

    function requestNotificationPermission(CocTool) {
        if (!CocTool.platform.has('hasNotificationPermission') || !CocTool.platform.has('requestNotificationPermission')) return;
        if (!CocTool.platform.call('hasNotificationPermission')) {
            CocTool.platform.call('requestNotificationPermission');
        }
    }

    function updateForegroundNotificationFromCalc() {
        if (!window.AndroidApp || !window.AndroidApp.updateForegroundNotification) return;

        try {
            const stats = global.CocTool.calc.getStatsForNotification();
            window.AndroidApp.updateForegroundNotification(stats.completedCount, stats.nextCompletionTime);
        } catch (e) {
            console.error('updateForegroundNotificationFromCalc failed:', e);
        }
    }

    function init() {
        const CocTool = requireModules();
        const progress = CocTool.features.progress;
        const accounts = CocTool.features.accounts;
        const settings = CocTool.features.settings;
        const services = CocTool.features.services;

        CocTool.storage.loadSettings();
        CocTool.theme.initialize();
        CocTool.storage.loadAccounts();

        run('渲染缓存', () => progress.hydrateCache());
        run('进度模块', () => progress.init());
        run('账号模块', () => accounts.init());
        run('设置模块', () => settings.init());
        run('日志模块', () => { if (CocTool.features.warlog) CocTool.features.warlog.init(); });
        const servicesReady = run('服务模块', () => {
            services.init();
            return true;
        });
        run('导航模块', () => CocTool.navigation.init());

        const hasAccounts = run('账号启动', () => accounts.start());
        run('设置应用', () => settings.apply());
        if (hasAccounts && servicesReady) run('后台检测', () => services.start());
        run('快捷导入', () => accounts.performAutoImport());
        run('通知权限', () => requestNotificationPermission(CocTool));
        setTimeout(function() { CocTool.checkForUpdate(); }, 3000);
        setInterval(function() { CocTool.checkForUpdate(); }, 30 * 60 * 1000);
        setTimeout(function() { updateForegroundNotificationFromCalc(); }, 1000);
        setTimeout(function() { if (typeof CocTool.syncWidgetData === 'function') CocTool.syncWidgetData(); }, 2000);
        CocTool.updateForegroundNotificationFromCalc = updateForegroundNotificationFromCalc;
        document.addEventListener('visibilitychange', function() {
            if (!document.hidden) CocTool.checkForUpdate();
        });
    }

    document.addEventListener('DOMContentLoaded', init, { once: true });
})(window);
