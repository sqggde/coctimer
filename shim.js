/**
 * 网页版浏览器适配层（web/browser-shim.js → dist/shim.js）
 *
 * 作用：让 App 前端（app/src/main/assets/，面向 WebView + AndroidApp 桥接）无需改动即可在浏览器运行。
 * 原理：App 前端所有 AndroidApp 调用均有守卫，无桥接时自动降级（剪贴板/打开外链/Blob 导出等）；
 *       本文件仅补充：更新检查短路 + 隐藏 App 专属设置 UI（小组件等）+ 链式启动按钮改造为强制拉取最新版 + PWA 注册。
 */

(function () {
    'use strict';

    // 1. AndroidApp 桩：仅提供 getVersionCode（返回超大值使 core.js 更新红点短路，
    //    检查更新轮询不弹 APK 下载弹窗）与 getVersionName（设置页版本显示）；
    //    其余桥接方法不定义，前端守卫自动走浏览器回退。
    if (!window.AndroidApp) {
        window.AndroidApp = {
            getVersionCode: function () { return 999999999; },
            getVersionName: function () { return 'Web 版'; }
        };
    }

    // 2. 隐藏 6 项 App 专属设置行（元素保留 display:none，settings.js 事件绑定不报错）
    function hideEl(sel) {
        var el = document.getElementById(sel);
        if (!el) return;
        el.style.display = 'none';
        var hr = el.nextElementSibling;
        if (hr && hr.tagName === 'HR') hr.style.display = 'none';
        hr = el.previousElementSibling;
        if (hr && hr.tagName === 'HR') hr.style.display = 'none';
    }

    // 3. PWA：仅 HTTPS 或 localhost 注册（GitHub Pages / Cloudflare Pages 均 HTTPS；
    //    scope 用相对路径兼容子路径部署）
    function registerSW() {
        if (!('serviceWorker' in navigator)) return;
        var isSecure = location.protocol === 'https:' || ['localhost', '127.0.0.1'].indexOf(location.hostname) !== -1;
        if (!isSecure) return;
        navigator.serviceWorker.register('./service-worker.js').catch(function () {});
    }

    // 4. 网页版上「获取网页版链接/跳转至网页版」改为 App 下载链接（原按钮语义在网页版无意义）
    //    覆盖方式：capture 阶段监听器先于 settings.js 冒泡监听器执行，stopImmediatePropagation 阻断原逻辑
    function setupDownloadLinks() {
        var BAIDU_URL = 'https://pan.baidu.com/s/1qzvS6ASRObo0orXa3nG3PQ?pwd=4uuw';
        var QUARK_URL = 'https://pan.quark.cn/s/81f54352d73e';

        function setText(btnId, text) {
            var btn = document.getElementById(btnId);
            if (!btn) return;
            var span = btn.querySelector('.flex-1');
            if (span) span.textContent = text;
        }
        function bindOnce(btnId, handler) {
            var btn = document.getElementById(btnId);
            if (!btn) return;
            btn.addEventListener('click', function (e) {
                e.stopImmediatePropagation();
                e.preventDefault();
                handler(e);
            }, true);
        }

        setText('copy-web-link-btn', '获取APP下载链接（百度）');
        setText('open-web-link-btn', '获取APP下载链接（夸克）');
        bindOnce('copy-web-link-btn', function () {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(BAIDU_URL).catch(function () {});
            }
            var toast = window.CocTool && CocTool.ui && CocTool.ui.showToast;
            if (toast) toast('百度网盘链接已复制到剪贴板', 2000);
        });
        bindOnce('open-web-link-btn', function () {
            window.open(QUARK_URL, '_blank');
        });
    }

    // 4. 链式启动按钮改造为「强制拉取最新版网页」（位置对齐 App 链式启动按钮）：
    //    普通刷新只重载页面不更新 SW 缓存；点击后清除全部 Cache Storage + 卸载 SW + 重新加载
    //    覆盖方式：capture 阶段监听器先于 accounts.js 冒泡监听器执行，stopImmediatePropagation 阻断原启动逻辑
    function setupForceReload() {
        var btn = document.getElementById('launch-game-btn');
        if (!btn) return;
        btn.title = '强制拉取最新版网页';
        // 用样式表 !important 固定背景（accounts.js updateLaunchGameBtn 的内联 background 赋值无法覆盖；
        // 若直接改内联 !important 会被 style.background setter 移除）
        var st = document.createElement('style');
        st.textContent = '#launch-game-btn{background:#3b82f6 !important;}';
        document.head.appendChild(st);
        var ic = btn.querySelector('i');
        if (ic) ic.className = 'fa fa-refresh';
        btn.addEventListener('click', function (e) {
            e.stopImmediatePropagation();
            e.preventDefault();
            if (!confirm('即将拉取最新版网页，将清除本地缓存并重新加载。确定继续？')) return;
            function reload() { location.reload(); }
            if (window.caches && caches.keys) {
                caches.keys().then(function (keys) {
                    return Promise.all(keys.map(function (k) { return caches.delete(k); }));
                }).then(function () {
                    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
                        return navigator.serviceWorker.getRegistrations().then(function (regs) {
                            return Promise.all(regs.map(function (r) { return r.unregister(); }));
                        });
                    }
                }).then(reload, reload);
            } else {
                reload();
            }
        }, true);
    }

    function onReady() {
        // 设置页：检查更新/选择应用图标/后台隐身/WebDAV备份/通知设置/查看运行日志
        hideEl('check-update-btn');
        hideEl('select-icon-btn');
        hideEl('webdav-settings-btn');
        hideEl('notify-settings-btn');
        hideEl('notify-log-btn');

        // 小组件为 Android 专属功能，网页版隐藏设置行与对应弹窗
        hideEl('widget-settings-btn');
        hideEl('widget-log-btn');

        // 后台隐身行（无 id 的 div，位于 select-icon-btn 与 webdav-settings-btn 之间）
        var stealthRow = document.getElementById('webdav-settings-btn');
        if (stealthRow) {
            var s = stealthRow.previousElementSibling; // hr
            if (s && s.previousElementSibling && !s.previousElementSibling.id) {
                s.previousElementSibling.style.display = 'none';
            }
        }

        // 对应弹窗
        ['notify-modal', 'log-modal', 'webdav-modal', 'update-modal',
         'widget-list-page', 'widget-config-page', 'widget-log-modal'].forEach(function (id) {
            var m = document.getElementById(id);
            if (m) m.style.display = 'none';
        });

        setupDownloadLinks();
        setupForceReload();
        registerSW();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onReady);
    } else {
        onReady();
    }
})();
