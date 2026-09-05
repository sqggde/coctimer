(function (global) {
    'use strict';

    const CocTool = global.CocTool;
    if (!CocTool || !CocTool.state || !CocTool.theme) {
        throw new Error('settings.js requires core.js');
    }

    const state = CocTool.state;
    const settings = state.settings;
    const accounts = state.accounts;
    const dataInfoDiv = document.getElementById('data-info');
    let initialized = false;
    const calc = CocTool.calc;

    function progress() { return CocTool.features.progress; }
    function accountModule() { return CocTool.features.accounts; }
    function serviceModule() { return CocTool.features.services; }
    function saveSettings() { return CocTool.storage.saveSettings(); }
    function showToast(message, duration) { CocTool.ui.showToast(message, duration); }
    function pushSchedule() {
        const module = serviceModule();
        if (module) module.pushSchedule();
    }
    function performAutoImport() {
        const module = accountModule();
        if (module) module.performAutoImport();
    }
    function refreshCurrentAccountDisplay() { var p = progress(); if (p) p.refresh(); }
    function escapeHtml(...args) { return calc.escapeHtml(...args); }
    function rebuildAllTabs() {
        const module = accountModule();
        if (module) module.rebuildTabs();
    }
    function updateMainTitle() {
        const module = accountModule();
        if (module) module.updateMainTitle();
    }
    function applyDarkMode() { CocTool.theme.apply(settings.darkMode); }
    function checkAutoDarkMode() { return CocTool.theme.syncAutomatic(); }

    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const settingsCloseBtn = document.getElementById('settings-close-btn');
    const supportBtn = document.getElementById('support-btn');
    const supportModal = document.getElementById('support-modal');
    const supportCloseBtn = document.getElementById('support-close-btn');
    const hideDataInfoToggle = document.getElementById('hide-data-info-toggle');
    const chestDetectToggle = document.getElementById('chest-detect-toggle');
    const autoImportToggle = document.getElementById('auto-import-toggle');
    const advanceNotifyBtn = document.getElementById('advance-notify-btn');
    const sleepTimeBtn = document.getElementById('sleep-time-btn');
    const sleepModal = document.getElementById('sleep-modal');
    const sleepCloseBtn = document.getElementById('sleep-close-btn');
    const sleepCancelBtn = document.getElementById('sleep-cancel-btn');
    const sleepEnableBtn = document.getElementById('sleep-enable-btn');
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const darkModeAutoBtn = document.getElementById('dark-mode-auto-btn');
    function applySettings() {
        hideDataInfoToggle.checked = settings.hideDataInfo;
        chestDetectToggle.checked = settings.chestDetect;
        autoImportToggle.checked = settings.autoImport;
        const stEl = document.getElementById('stealth-mode-toggle');
        if (stEl) stEl.checked = settings.stealthMode;
        const vibrateEl = document.getElementById('vibration-toggle');
        if (vibrateEl) vibrateEl.checked = settings.vibrate !== false;
        advanceNotifyBtn.className = settings.advanceNotify
            ? 'px-3 py-1 rounded-lg transition-all duration-200 text-xs bg-blue-500 text-white'
            : 'px-3 py-1 rounded-lg transition-all duration-200 text-xs bg-gray-300 text-gray-500';
        advanceNotifyBtn.textContent = settings.advanceNotify ? '开启' : '关闭';
        darkModeToggle.checked = settings.darkMode;
        darkModeAutoBtn.className = settings.darkModeAuto
            ? 'px-2 py-1 rounded transition-all duration-200 text-xs bg-blue-500 text-white'
            : 'px-2 py-1 rounded transition-all duration-200 text-xs bg-gray-300 text-gray-500';
        dataInfoDiv.classList.toggle('hidden', settings.hideDataInfo);
        sleepTimeBtn.className = settings.nightMode
            ? 'px-3 py-1 rounded-lg transition-all duration-200 text-xs bg-blue-200 text-blue-700 cursor-pointer hover:bg-blue-300'
            : 'px-3 py-1 rounded-lg transition-all duration-200 text-xs bg-gray-300 text-gray-500 cursor-not-allowed';
        sleepTimeBtn.textContent = settings.nightMode ? '设置睡眠时间' : '设置睡眠时间';
        calc.invalidateSleepRange();
        applyDarkMode();
    }
    function showSettingsModal() { settingsModal.classList.remove('hidden'); }
    function hideSettingsModal() { settingsModal.classList.add('hidden'); }
    function showSupportModal() { supportModal.classList.remove('hidden'); }
    function hideSupportModal() { supportModal.classList.add('hidden'); }

    const aboutModal = document.getElementById('about-modal');
    function showAboutModal() { aboutModal.classList.remove('hidden'); }
    function hideAboutModal() { aboutModal.classList.add('hidden'); }
    function initSleepPicker() {
        const hours = Array.from({length: 24}, (_, i) => String(i).padStart(2, '0'));
        const minutes = Array.from({length: 60}, (_, i) => String(i).padStart(2, '0'));
        document.querySelectorAll('.picker-column').forEach(col => {
            const field = col.dataset.field;
            const values = field.includes('hour') ? hours : minutes;
            const scroll = col.querySelector('.picker-scroll');
            scroll.innerHTML = values.map(v => `<div class="picker-item" data-value="${v}">${v}</div>`).join('');
            col.addEventListener('scroll', () => updatePickerActive(col));
        });
    }

    function updatePickerActive(column) {
        const items = column.querySelectorAll('.picker-item');
        const colRect = column.getBoundingClientRect();
        const centerY = colRect.top + colRect.height / 2;
        let closest = items[0], minDist = Infinity;
        items.forEach(item => {
            const rect = item.getBoundingClientRect();
            const itemCenter = rect.top + rect.height / 2;
            const dist = Math.abs(itemCenter - centerY);
            if (dist < minDist) { minDist = dist; closest = item; }
        });
        items.forEach(item => item.classList.remove('active'));
        closest.classList.add('active');
    }

    function scrollPickerTo(column, value) {
        const items = column.querySelectorAll('.picker-item');
        let targetIndex = 0;
        items.forEach((item, i) => { if (item.dataset.value === value) targetIndex = i; });
        column.scrollTop = targetIndex * 36;
        // 直接按值标记选中
        items.forEach(item => item.classList.remove('active'));
        items[targetIndex].classList.add('active');
    }

    function getSleepPickerValues() {
        const getVal = (field) => {
            const col = document.querySelector(`.picker-column[data-field="${field}"]`);
            const active = col.querySelector('.picker-item.active');
            return active ? active.dataset.value : '00';
        };
        return {
            startHour: getVal('start-hour'),
            startMinute: getVal('start-minute'),
            endHour: getVal('end-hour'),
            endMinute: getVal('end-minute')
        };
    }

    function init() {
        if (initialized) return;
        initialized = true;
        initSleepPicker();
        // 初始化图标显示名称
        const iconNameEl = document.getElementById('current-icon-name');
        if (iconNameEl) {
            iconNameEl.textContent = settings.appIcon === 'helper_hut' ? '帮手小屋' : settings.appIcon === 'zzhus' ? 'zzhus' : '默认';
        }

        // 初始化隐身模式
        if (settings.stealthMode && window.AndroidApp && window.AndroidApp.setHideFromRecents) {
            window.AndroidApp.setHideFromRecents(true);
        }
        // ===== 检查更新 =====
        const VERSION_CHECK_URL = CocTool.apiBase + '/api/coc/version';
        const updateModal = document.getElementById('update-modal');
        const updateModalTitle = document.getElementById('update-modal-title');
        const updateModalBody = document.getElementById('update-modal-body');
        const updateModalCloseBtn = document.getElementById('update-modal-close-btn');
        const updateModalLaterBtn = document.getElementById('update-modal-later-btn');
        const updateModalDirectBtn = document.getElementById('update-modal-direct-btn');
        const updateModalBaiduBtn = document.getElementById('update-modal-baidu-btn');
        const updateModalQuarkBtn = document.getElementById('update-modal-quark-btn');
        const downloadBtnsContainer = document.getElementById('update-modal-download-btns');
        const currentVersionText = document.getElementById('current-version-text');

        let localVersionCode = -1;
        let localVersionName = '0.0';
        let baiduUrl = '';
        let quarkUrl = '';
        let directDownloadUrl = '';

        if (window.AndroidApp && typeof window.AndroidApp.getVersionCode === 'function') {
            localVersionCode = window.AndroidApp.getVersionCode();
        }
        if (window.AndroidApp && typeof window.AndroidApp.getVersionName === 'function') {
            localVersionName = window.AndroidApp.getVersionName();
        }
        currentVersionText.textContent = localVersionName;

        function closeUpdateModal() {
            updateModal.classList.add('hidden');
        }

        function copyToClipboard(url, label) {
            if (window.AndroidApp && typeof window.AndroidApp.copyToClipboard === 'function') {
                window.AndroidApp.copyToClipboard(url);
            } else {
                navigator.clipboard.writeText(url).catch(() => {});
            }
            showToast(`已复制 ${label} 链接到剪贴板`, 2000);
        }

        updateModalCloseBtn.addEventListener('click', closeUpdateModal);
        updateModalLaterBtn.addEventListener('click', function() {
            if (typeof CocTool.dismissUpdate === 'function') CocTool.dismissUpdate();
            closeUpdateModal();
        });
        updateModal.addEventListener('click', (e) => {
            if (e.target === updateModal) closeUpdateModal();
        });

        updateModalDirectBtn.addEventListener('click', () => {
            if (directDownloadUrl) {
                if (window.AndroidApp && window.AndroidApp.openInBrowser) {
                    window.AndroidApp.openInBrowser(directDownloadUrl);
                } else {
                    window.open(directDownloadUrl, '_blank');
                }
                closeUpdateModal();
            } else {
                showToast('暂无可用的下载链接', 2000);
            }
        });

        updateModalBaiduBtn.addEventListener('click', () => {
            if (baiduUrl) copyToClipboard(baiduUrl, '百度网盘');
        });

        updateModalQuarkBtn.addEventListener('click', () => {
            if (quarkUrl) copyToClipboard(quarkUrl, '夸克网盘');
        });

        function showUpdateResult(data) {
            var remoteCode = data.versionCode || 0;
            if (remoteCode > localVersionCode) {
                updateModalTitle.textContent = '发现新版本';
                updateModalBody.innerHTML = [
                    '<div class="mb-3">',
                        '<span class="text-gray-500">最新版本：</span>',
                        '<span class="font-semibold text-primary">', escapeHtml(data.versionName || '0.0'), '</span>',
                        '<span class="text-xs text-gray-400 ml-2">（当前 ', escapeHtml(localVersionName), '）</span>',
                    '</div>',
                    '<div class="bg-gray-50 rounded-lg p-3">',
                        '<p class="text-xs text-gray-500 mb-1 font-medium">更新内容</p>',
                        '<div class="text-xs text-gray-600 whitespace-pre-line">', escapeHtml(data.changelog || '暂无更新内容'), '</div>',
                    '</div>'
                ].join('');
                if (data.baiduUrl || data.quarkUrl || data.directDownloadUrl) {
                    updateModalLaterBtn.classList.remove('hidden');
                    downloadBtnsContainer.classList.remove('hidden');
                    if (data.directDownloadUrl) updateModalDirectBtn.classList.remove('hidden'); else updateModalDirectBtn.classList.add('hidden');
                    if (data.baiduUrl) updateModalBaiduBtn.classList.remove('hidden'); else updateModalBaiduBtn.classList.add('hidden');
                    if (data.quarkUrl) updateModalQuarkBtn.classList.remove('hidden'); else updateModalQuarkBtn.classList.add('hidden');
                }
            } else {
                updateModalTitle.textContent = '检查更新';
                updateModalBody.innerHTML = [
                    '<div class="flex items-center justify-center py-2 text-success">',
                        '<i class="fa fa-check-circle text-lg mr-2"></i>',
                        '<span>当前已是最新版本</span>',
                    '</div>',
                    '<p class="text-xs text-center text-gray-400">版本 ', escapeHtml(localVersionName), '</p>'
                ].join('');
            }
        }

        document.getElementById('check-update-btn').addEventListener('click', function() {
            updateModalTitle.textContent = '检查更新';
            updateModalBody.innerHTML = '<div class="flex items-center justify-center py-4"><i class="fa fa-spinner fa-spin text-primary text-xl mr-2"></i><span>正在检查更新...</span></div>';
            updateModalLaterBtn.classList.add('hidden');
            downloadBtnsContainer.classList.add('hidden');
            updateModal.classList.remove('hidden');

            // 已有缓存数据，直接展示
            if (CocTool.state && CocTool.state.latestVersionData) {
                baiduUrl = CocTool.state.latestVersionData.baiduUrl || '';
                quarkUrl = CocTool.state.latestVersionData.quarkUrl || '';
                directDownloadUrl = CocTool.state.latestVersionData.directDownloadUrl || '';
                showUpdateResult(CocTool.state.latestVersionData);
                return;
            }

            // 请求服务器
            doFetchUpdate(VERSION_CHECK_URL, function(data) {
                baiduUrl = data.baiduUrl || '';
                quarkUrl = data.quarkUrl || '';
                directDownloadUrl = data.directDownloadUrl || '';
                showUpdateResult(data);
            }, function(err) {
                updateModalTitle.textContent = '检查失败';
                updateModalBody.innerHTML = [
                    '<div class="flex items-center justify-center py-2 text-warning_orangered">',
                        '<i class="fa fa-exclamation-triangle mr-2"></i>',
                        '<span>', (err && err.name === 'AbortError') ? '请求超时，请检查网络' : '无法连接更新服务器', '</span>',
                    '</div>',
                    '<p class="text-xs text-center text-gray-400 mt-1">请稍后重试</p>'
                ].join('');
            });
        });

        function doFetchUpdate(url, onSuccess, onError) {
            var controller = new AbortController();
            var timeout = setTimeout(function() { controller.abort(); }, 10000);
            fetch(url, { signal: controller.signal })
            .then(function(r) {
                clearTimeout(timeout);
                if (!r.ok) throw new Error('服务器返回 ' + r.status);
                return r.json();
            })
            .then(onSuccess)
            .catch(function(err) {
                clearTimeout(timeout);
                if (onError) onError(err);
            });
        }

        // ===== 图标选择功能 =====
        const iconPickerModal = document.getElementById('icon-picker-modal');
        const iconPickerCloseBtn = document.getElementById('icon-picker-close-btn');
        const iconPickerCancelBtn = document.getElementById('icon-picker-cancel-btn');
        const iconPickerSaveBtn = document.getElementById('icon-picker-save-btn');
        const selectIconBtn = document.getElementById('select-icon-btn');
        const currentIconNameSpan = document.getElementById('current-icon-name');
        let selectedIcon = 'helper_hut';

        function updateIconPickerUI() {
            document.querySelectorAll('[data-icon]').forEach(el => {
                const icon = el.dataset.icon;
                const checkEl = document.getElementById('check-' + icon);
                const previewEl = document.getElementById('icon-preview-' + icon);
                const isSelected = icon === selectedIcon;
                checkEl.className = isSelected
                    ? 'w-5 h-5 rounded bg-primary border-primary flex items-center justify-center'
                    : 'w-5 h-5 rounded border-2 border-gray-300 flex items-center justify-center';
                const checkIcon = checkEl.querySelector('i');
                if (isSelected) checkIcon.classList.remove('hidden');
                else checkIcon.classList.add('hidden');
                previewEl.className = isSelected
                    ? 'w-20 h-20 rounded-2xl shadow-lg mb-2 border-2 border-primary flex items-center justify-center overflow-hidden'
                    : 'w-20 h-20 rounded-2xl shadow-lg mb-2 border-2 border-transparent flex items-center justify-center overflow-hidden';
            });
        }

        function openIconPicker() {
            if (window.AndroidApp) {
                selectedIcon = window.AndroidApp.getCurrentIcon();
            } else {
                selectedIcon = settings.appIcon || 'helper_hut';
            }
            updateIconPickerUI();
            iconPickerModal.classList.remove('hidden');
        }

        document.querySelectorAll('[data-icon]').forEach(el => {
            el.addEventListener('click', () => {
                selectedIcon = el.dataset.icon;
                updateIconPickerUI();
            });
        });

        function saveIconSelection() {
            if (window.AndroidApp) {
                window.AndroidApp.setAppIcon(selectedIcon);
            }
            settings.appIcon = selectedIcon;
            saveSettings();
            currentIconNameSpan.textContent = selectedIcon === 'helper_hut' ? '帮手小屋' : selectedIcon === 'zzhus' ? 'zzhus' : '默认';
            iconPickerModal.classList.add('hidden');
            showToast('应用图标已更换，返回桌面即可看到变化', 2000);
        }

        iconPickerCloseBtn.addEventListener('click', () => iconPickerModal.classList.add('hidden'));
        iconPickerCancelBtn.addEventListener('click', () => iconPickerModal.classList.add('hidden'));
        iconPickerSaveBtn.addEventListener('click', saveIconSelection);
        selectIconBtn.addEventListener('click', openIconPicker);
        iconPickerModal.addEventListener('click', (e) => { if (e.target === iconPickerModal) iconPickerModal.classList.add('hidden'); });

        // ===== 网页版链接 =====
        const WEB_APP_URL = 'https://sqggde.github.io/coctimer/';
        document.getElementById('copy-web-link-btn').addEventListener('click', () => {
            if (typeof AndroidApp !== 'undefined' && AndroidApp.copyToClipboard) {
                window.AndroidApp.copyToClipboard(WEB_APP_URL);
            } else {
                navigator.clipboard.writeText(WEB_APP_URL).catch(() => {});
            }
            showToast('网页版链接已复制到剪贴板', 2000);
        });
        document.getElementById('open-web-link-btn').addEventListener('click', () => {
            if (typeof AndroidApp !== 'undefined' && AndroidApp.openInBrowser) {
                window.AndroidApp.openInBrowser(WEB_APP_URL);
            } else {
                window.open(WEB_APP_URL, '_blank');
            }
        });
        document.getElementById('qq-group-btn').addEventListener('click', () => {
            const qqGroup = '941992024';
            if (typeof AndroidApp !== 'undefined' && AndroidApp.copyToClipboard) {
                window.AndroidApp.copyToClipboard(qqGroup);
            } else if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(qqGroup).catch(() => {});
            } else {
                const ta = document.createElement('textarea');
                ta.value = qqGroup;
                ta.style.position = 'fixed';
                ta.style.left = '-9999px';
                document.body.appendChild(ta);
                ta.select();
                try { document.execCommand('copy'); } catch(e) {}
                document.body.removeChild(ta);
            }
            showToast('QQ群号 941992024 已复制到剪贴板', 2000);
        });

        // 后台隐身运行
        const stealthToggle = document.getElementById('stealth-mode-toggle');
        if (stealthToggle) {
            stealthToggle.addEventListener('change', () => {
                settings.stealthMode = stealthToggle.checked;
                saveSettings();
                if (window.AndroidApp && window.AndroidApp.setHideFromRecents) {
                    window.AndroidApp.setHideFromRecents(stealthToggle.checked);
                }
            });
        }
        const vibrateToggle = document.getElementById('vibration-toggle');
        if (vibrateToggle) {
            vibrateToggle.addEventListener('change', () => {
                settings.vibrate = vibrateToggle.checked;
                saveSettings();
            });
        }
        settingsBtn.addEventListener('click', showSettingsModal);
        settingsCloseBtn.addEventListener('click', hideSettingsModal);
        settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) hideSettingsModal(); });
        supportBtn.addEventListener('click', showSupportModal);
        supportCloseBtn.addEventListener('click', hideSupportModal);
        supportModal.addEventListener('click', (e) => { if (e.target === supportModal) hideSupportModal(); });
        document.getElementById('about-btn').addEventListener('click', showAboutModal);
        document.getElementById('about-close-btn').addEventListener('click', hideAboutModal);
        aboutModal.addEventListener('click', (e) => { if (e.target === aboutModal) hideAboutModal(); });
        chestDetectToggle.addEventListener('change', () => {
            settings.chestDetect = chestDetectToggle.checked;
            saveSettings();
            applySettings();
            const chestEl = document.getElementById('chest-notification');
            if (chestEl && state.currentAccount && accounts[state.currentAccount]) {
                const data = accounts[state.currentAccount];
                const hasChest = settings.chestDetect && data.obstacles && Array.isArray(data.obstacles) && data.obstacles.some(o => o.data === 8000030 && o.cnt > 0);
                chestEl.classList.toggle('hidden', !hasChest);
            }
        });
        autoImportToggle.addEventListener('change', () => {
            settings.autoImport = autoImportToggle.checked;
            saveSettings();
            applySettings();
            if (settings.autoImport) {
                performAutoImport();
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
            if (settings.darkModeAuto) checkAutoDarkMode();
        });

        sleepTimeBtn.addEventListener('click', () => {
            if (!settings.nightMode) {
                sleepModal.classList.remove('hidden');
                // 弹窗显示后才能正确计算元素位置
                requestAnimationFrame(() => {
                    const [sh, sm] = settings.sleepStart.split(':');
                    const [eh, em] = settings.sleepEnd.split(':');
                    scrollPickerTo(document.querySelector('.picker-column[data-field="start-hour"]'), sh);
                    scrollPickerTo(document.querySelector('.picker-column[data-field="start-minute"]'), sm);
                    scrollPickerTo(document.querySelector('.picker-column[data-field="end-hour"]'), eh);
                    scrollPickerTo(document.querySelector('.picker-column[data-field="end-minute"]'), em);
                });
            } else {
                settings.nightMode = false;
                saveSettings();
                applySettings();
                if (state.currentAccount) refreshCurrentAccountDisplay();
                rebuildAllTabs();
            }
        });
        sleepCloseBtn.addEventListener('click', () => { sleepModal.classList.add('hidden'); });
        sleepCancelBtn.addEventListener('click', () => { sleepModal.classList.add('hidden'); });
        sleepEnableBtn.addEventListener('click', () => {
            const vals = getSleepPickerValues();
            settings.sleepStart = vals.startHour + ':' + vals.startMinute;
            settings.sleepEnd = vals.endHour + ':' + vals.endMinute;
            settings.nightMode = true;
            saveSettings();
            applySettings();
            sleepModal.classList.add('hidden');
            if (state.currentAccount) refreshCurrentAccountDisplay();
            rebuildAllTabs();
        });
        sleepModal.addEventListener('click', (e) => { if (e.target === sleepModal) sleepModal.classList.add('hidden'); });

        document.querySelectorAll('[data-external-url]').forEach(link => {
            link.addEventListener('click', event => {
                event.preventDefault();
                CocTool.platform.openExternal(link.dataset.externalUrl);
            });
        });

        hideDataInfoToggle.addEventListener('change', () => {
            settings.hideDataInfo = hideDataInfoToggle.checked;
            saveSettings();
            applySettings();
        });

        document.getElementById('notify-log-btn').addEventListener('click', () => {
            const modal = document.getElementById('log-modal');
            const entries = document.getElementById('log-entries');
            modal.classList.remove('hidden');
            var services = CocTool.features.services;
            if (!services || !services.getGroupedNotificationLogs) return;
            var groups = services.getGroupedNotificationLogs();
            entries.innerHTML = '';
            for (var i = 0; i < groups.length; i++) {
                var g = groups[i];
                var gd = new Date(g.ts);
                var t = String(gd.getMonth() + 1).padStart(2, '0') + '-' + String(gd.getDate()).padStart(2, '0') + ' ' +
                        String(gd.getHours()).padStart(2, '0') + ':' +
                        String(gd.getMinutes()).padStart(2, '0') + ':' +
                        String(gd.getSeconds()).padStart(2, '0');
                var icon = '•';
                var color = 'text-gray-600';
                if (g.type === '调度') { icon = '✓'; color = 'text-green-600'; }
                else if (g.type === '通知') { icon = '🔔'; color = 'text-blue-600'; }
                else if (g.type === 'skip') { icon = '⏭'; color = 'text-yellow-600'; }
                else if (g.type === '导入') { icon = '📥'; color = 'text-purple-600'; }
                else if (g.type === '错误') { icon = '✕'; color = 'text-red-500'; }
                else if (g.type === '服务') { icon = '▶'; color = 'text-gray-500'; }
                if (g.type === '调度') {
                    if (g.account) {
                        var head = document.createElement('div');
                        head.className = 'text-xs font-medium ' + color + ' mt-1';
                        head.textContent = '[' + t + '] ' + icon + ' 注册闹钟: ' + g.account;
                        entries.appendChild(head);
                        for (var j = 0; j < g.items.length; j++) {
                            var it = g.items[j];
                            var line = document.createElement('div');
                            line.className = 'text-xs ' + color + ' leading-relaxed pl-3';
                            line.textContent = it.detail + (it.meta ? '  [' + Object.keys(it.meta).map(k => k + ': ' + it.meta[k]).join(', ') + ']' : '');
                            entries.appendChild(line);
                        }
                    } else {
                        // 空账号调度组：摘要/诊断行逐条显示（含 Java 回传的取消/轮次/触发行）
                        for (var k = 0; k < g.items.length; k++) {
                            var head = document.createElement('div');
                            head.className = 'text-xs font-medium ' + color + ' mt-1';
                            head.textContent = '[' + t + '] ' + icon + ' ' + g.items[k].detail;
                            entries.appendChild(head);
                        }
                    }
                } else if (g.type === '导入') {
                    var head = document.createElement('div');
                    head.className = 'text-xs font-medium ' + color + ' mt-1';
                    head.textContent = '[' + t + '] ' + icon + ' ' + (g.account || '') + ' ' + (g.items[0] ? g.items[0].detail : '');
                    entries.appendChild(head);
                    if (g.items[0] && g.items[0].meta) {
                        var metaLine = document.createElement('div');
                        metaLine.className = 'text-xs text-gray-500 leading-relaxed pl-3';
                        metaLine.textContent = 'timestamp: ' + g.items[0].meta.timestamp + ' | boosts: ' + g.items[0].meta.boosts;
                        entries.appendChild(metaLine);
                    }
                } else {
                    var div = document.createElement('div');
                    div.className = 'text-xs ' + color + ' leading-relaxed';
                    div.textContent = '[' + t + '] ' + icon + ' ' + (g.account ? g.account + ' ' : '') + (g.items[0] ? g.items[0].detail : '');
                    entries.appendChild(div);
                }
            }
        });
        document.getElementById('log-close-btn').addEventListener('click', () => {
            document.getElementById('log-modal').classList.add('hidden');
        });
        document.getElementById('log-modal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('log-modal')) {
                document.getElementById('log-modal').classList.add('hidden');
            }
        });
        document.getElementById('log-clear-btn').addEventListener('click', () => {
            var services = CocTool.features.services;
            if (services && services.clearNotificationLogs) services.clearNotificationLogs();
            document.getElementById('log-entries').innerHTML = '';
        });
        document.getElementById('log-export-btn').addEventListener('click', () => {
            var services = CocTool.features.services;
            if (services && services.exportNotificationLog) services.exportNotificationLog();
        });

        // ===== 小组件管理 =====
        var widgetListPage = document.getElementById('widget-list-page');
        var widgetListBackBtn = document.getElementById('widget-list-back-btn');
        var widgetListContainer = document.getElementById('widget-list-container');
        var widgetConfigPage = document.getElementById('widget-config-page');
        var widgetConfigBackBtn = document.getElementById('widget-config-back-btn');
        var widgetConfigTitle = document.getElementById('widget-config-title');
        var widgetConfigList = document.getElementById('widget-config-list');
        var widgetConfigCancelBtn = document.getElementById('widget-config-cancel-btn');
        var widgetConfigSaveBtn = document.getElementById('widget-config-save-btn');
        var widgetSettingsBtn = document.getElementById('widget-settings-btn');

        var widgetSelectedAccounts = [];
        var currentWidgetType = null;

        var WIDGET_TYPES = [
            { id: 'timeline', name: '横向时间轴', desc: '显示6个升级节点，自动滑动', storageKey: 'widget_selected_accounts' }
        ];

        function loadWidgetAccounts(storageKey) {
            try {
                var saved = localStorage.getItem(storageKey);
                return saved ? JSON.parse(saved) : [];
            } catch (e) {
                return [];
            }
        }

        function saveWidgetAccounts(storageKey, accounts) {
            localStorage.setItem(storageKey, JSON.stringify(accounts));
            if (window.AndroidApp && typeof window.AndroidApp.syncWidgetData === 'function' && typeof CocTool.syncWidgetData === 'function') {
                CocTool.syncWidgetData();
            }
        }

        function renderWidgetListPage() {
            widgetListContainer.innerHTML = '';
            WIDGET_TYPES.forEach(function(wt) {
                var item = document.createElement('button');
                item.className = 'w-full flex items-center px-4 py-3.5 hover:bg-gray-50 transition-all duration-200 border-none bg-transparent cursor-pointer text-left';
                item.style.fontSize = '14px';
                item.innerHTML = '<span class="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center mr-3 flex-shrink-0"><i class="fa fa-th-large text-orange-600" style="font-size: 15px;"></i></span><span class="flex-1 text-left"><span class="text-gray-800 block">' + wt.name + '</span><span class="text-xs text-gray-400">' + wt.desc + '</span></span><i class="fa fa-chevron-right text-gray-300" style="font-size: 14px;"></i>';
                item.addEventListener('click', function() {
                    openWidgetConfig(wt);
                });
                widgetListContainer.appendChild(item);
            });
        }

        function renderWidgetConfigPage(wt) {
            widgetConfigTitle.textContent = wt.name + ' - 账号选择';
            var accountList = (state && state.accounts) || {};
            var accountOrder = (state && state.accountOrder) || [];
            var notes = (state && state.accountNotes) || {};
            widgetSelectedAccounts = loadWidgetAccounts(wt.storageKey);
            if (widgetSelectedAccounts.length === 0) {
                widgetSelectedAccounts = accountOrder.slice();
            }
            widgetConfigList.innerHTML = '';
            if (accountOrder.length === 0) {
                widgetConfigList.innerHTML = '<div class="text-center text-gray-500 text-sm py-4">暂无账号数据</div>';
            } else {
                accountOrder.forEach(function(tag) {
                    var account = accountList[tag];
                    if (!account) return;
                    var displayName = notes[tag] || account.name || tag;
                    var isSelected = widgetSelectedAccounts.indexOf(tag) !== -1;
                    var item = document.createElement('div');
                    item.className = 'bg-white rounded-xl shadow-md overflow-hidden flex items-center px-4 py-3 cursor-pointer hover:bg-gray-50 transition-all duration-200';
                    item.innerHTML = '<input type="checkbox" class="w-4 h-4 rounded border-gray-300 mr-3" ' + (isSelected ? 'checked' : '') + '><span class="flex-1 text-sm text-gray-700">' + displayName + '</span><span class="text-xs text-gray-400">' + tag + '</span>';
                    item.addEventListener('click', function(e) {
                        var cb = item.querySelector('input[type="checkbox"]');
                        if (e.target.tagName !== 'INPUT') cb.checked = !cb.checked;
                        if (cb.checked) {
                            if (widgetSelectedAccounts.indexOf(tag) === -1) widgetSelectedAccounts.push(tag);
                        } else {
                            widgetSelectedAccounts = widgetSelectedAccounts.filter(function(t) { return t !== tag; });
                        }
                    });
                    widgetConfigList.appendChild(item);
                });
            }
        }

        // ===== 小组件多级页面统一开关（对齐 overview/clan：状态 + goBack + 切 tab 自动关）=====
        function openWidgetList() {
            closeWidgetConfig();
            renderWidgetListPage();
            if (widgetListPage) widgetListPage.classList.remove('hidden');
        }
        function closeWidgetList() {
            if (widgetListPage) widgetListPage.classList.add('hidden');
        }
        function openWidgetConfig(wt) {
            currentWidgetType = wt;
            renderWidgetConfigPage(wt);
            if (widgetConfigPage) widgetConfigPage.classList.remove('hidden');
        }
        function closeWidgetConfig() {
            if (widgetConfigPage) widgetConfigPage.classList.add('hidden');
            currentWidgetType = null;
        }
        // 供 handleBack 逐级关闭：配置页 → 列表页 → 未处理
        function widgetGoBack() {
            if (widgetConfigPage && !widgetConfigPage.classList.contains('hidden')) {
                closeWidgetConfig();
                return true;
            }
            if (widgetListPage && !widgetListPage.classList.contains('hidden')) {
                closeWidgetList();
                return true;
            }
            return false;
        }
        // 供切 tab 时全部关闭（closeDetailOverlays）
        function closeWidgetOverlays() {
            closeWidgetConfig();
            closeWidgetList();
        }

        if (widgetSettingsBtn) {
            widgetSettingsBtn.addEventListener('click', function() { openWidgetList(); });
        }
        if (widgetListBackBtn) {
            widgetListBackBtn.addEventListener('click', closeWidgetList);
        }
        if (widgetConfigBackBtn) {
            widgetConfigBackBtn.addEventListener('click', closeWidgetConfig);
        }
        if (widgetConfigCancelBtn) {
            widgetConfigCancelBtn.addEventListener('click', closeWidgetConfig);
        }
        if (widgetConfigSaveBtn) {
            widgetConfigSaveBtn.addEventListener('click', function() {
                if (currentWidgetType) saveWidgetAccounts(currentWidgetType.storageKey, widgetSelectedAccounts);
                closeWidgetConfig();
                showToast('小组件账号设置已保存', 1500);
            });
        }

        // 供 core.js handleBack / closeDetailOverlays 调用（init 内闭包函数，须在此挂载）
        CocTool.widgetManager = Object.freeze({
            openList: openWidgetList,
            openConfig: openWidgetConfig,
            goBack: widgetGoBack,
            closeAll: closeWidgetOverlays
        });

        // ===== 小组件日志 =====
        var widgetLogBtn = document.getElementById('widget-log-btn');
        var widgetLogModal = document.getElementById('widget-log-modal');
        var widgetLogCloseBtn = document.getElementById('widget-log-close-btn');
        var widgetLogRefreshBtn = document.getElementById('widget-log-refresh-btn');
        var widgetLogClearBtn = document.getElementById('widget-log-clear-btn');
        var widgetLogContent = document.getElementById('widget-log-content');

        function getJavaWidgetLog() {
            if (window.AndroidApp && typeof window.AndroidApp.getWidgetLog === 'function') {
                try { return window.AndroidApp.getWidgetLog() || ''; } catch (e) { return ''; }
            }
            return '';
        }

        function buildWidgetLogText() {
            var parts = [];
            if (CocTool.widgetLog && typeof CocTool.widgetLog.getFormatted === 'function') {
                var jsLog = CocTool.widgetLog.getFormatted();
                parts.push('===== 前端(JS) =====');
                parts.push(jsLog || '(暂无)');
            }
            var javaLog = getJavaWidgetLog();
            parts.push('');
            parts.push('===== 原生(Java) =====');
            parts.push(javaLog || '(暂无)');
            return parts.join('\n');
        }

        function refreshWidgetLog() {
            if (!widgetLogContent) return;
            widgetLogContent.textContent = buildWidgetLogText();
        }

        function exportWidgetLog() {
            var text = '===== 小组件日志 =====\n导出时间: ' + new Date().toLocaleString('zh-CN') + '\n\n' + buildWidgetLogText();
            if (window.AndroidApp && typeof window.AndroidApp.exportLogToFile === 'function') {
                try {
                    window.AndroidApp.exportLogToFile(text);
                    showToast('日志已导出', 1200);
                    return;
                } catch (e) {}
            }
            try {
                var ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                showToast('日志已复制', 1200);
            } catch (e2) {
                showToast('导出失败', 1200);
            }
        }

        if (widgetLogBtn) {
            widgetLogBtn.addEventListener('click', function() {
                refreshWidgetLog();
                if (widgetLogModal) widgetLogModal.classList.remove('hidden');
            });
        }
        var widgetLogExportBtn = document.getElementById('widget-log-export-btn');
        if (widgetLogExportBtn) {
            widgetLogExportBtn.addEventListener('click', exportWidgetLog);
        }
        if (widgetLogCloseBtn) {
            widgetLogCloseBtn.addEventListener('click', function() {
                if (widgetLogModal) widgetLogModal.classList.add('hidden');
            });
        }
        if (widgetLogRefreshBtn) {
            widgetLogRefreshBtn.addEventListener('click', refreshWidgetLog);
        }
        if (widgetLogClearBtn) {
            widgetLogClearBtn.addEventListener('click', function() {
                if (CocTool.widgetLog && typeof CocTool.widgetLog.clear === 'function') CocTool.widgetLog.clear();
                if (window.AndroidApp && typeof window.AndroidApp.clearWidgetLog === 'function') {
                    try { window.AndroidApp.clearWidgetLog(); } catch (e) {}
                }
                refreshWidgetLog();
                showToast('小组件日志已清空', 1200);
            });
        }
        if (widgetLogModal) {
            widgetLogModal.addEventListener('click', function(e) {
                if (e.target === widgetLogModal) widgetLogModal.classList.add('hidden');
            });
        }

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible') return;
            checkAutoDarkMode();
            const accounts = accountModule();
            if (!accounts || !accounts.isImporting()) performAutoImport();
        });
    }

    CocTool.features.settings = Object.freeze({
        init,
        apply: applySettings
    });
})(window);
