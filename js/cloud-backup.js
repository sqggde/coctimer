/**
 * 云端备份域（2026-11-07 自 services.js 拆出：services.js 触及 100KB 单模块上限）
 *
 * 职责：云端账号认证（登录/注册）+ 云备份/恢复（v2，协议层在 cloud-sync.js）+ WebDAV 备份。
 * services.js 保留通知调度/联赛提醒/日志监控/本地导出导入，并对本模块做同名委托——
 * CocTool.features.services.autoCloudBackup 等出口不变，accounts.js 等调用方零改动。
 * 依赖：core.js + cloud-sync.js（index.html 加载顺序：cloud-sync.js 之后、services.js 之前）。
 */
(function (global) {
    'use strict';

    const CocTool = global.CocTool;
    if (!CocTool || !CocTool.state || !CocTool.storage || !CocTool.cloudSync) {
        throw new Error('cloud-backup.js requires core.js + cloud-sync.js');
    }

    const state = CocTool.state;
    const settings = state.settings;
    const accounts = state.accounts;
    const accountNotes = state.accountNotes;
    const accountOrder = state.accountOrder;
    const { STORAGE_KEY, SETTINGS_KEY } = CocTool.storage;
    let initialized = false;
    var autoCloudBackupRef = null;        // init() 内赋值（自动备份函数在 init 作用域，供 accounts.js 导入成功后调用）
    var maybeAutoRestoreRef = null;       // init() 内赋值（自动恢复检测在 init 作用域，供外部手动触发/测试）
    var webdavUploadRef = null;           // init() 内赋值（WebDAV 统一上传核心在 init 作用域，供模块级 autoWebdavUpload 委托）
    var maybeWebdavAutoRestoreRef = null; // init() 内赋值（WebDAV 自动恢复检测在 init 作用域，供外部手动触发/测试）
    var refreshCloudAutoBackupUiRef = null;
    var openCloudLoginRef = null;         // init() 内赋值（打开云端登录弹窗，供阵型中心「去登录」调用）
    var deleteCloudAccountRef = null;     // init() 内赋值（删号后单账号删除同步）
    var pushAccountServerRef = null;      // init() 内赋值（选服后回传云端补齐 _server）

    function showToast(message, duration) { CocTool.ui.showToast(message, duration); }
    function saveSettings() { return CocTool.storage.saveSettings(); }
    function applySettings() {
        const module = CocTool.features.settings;
        if (module) module.apply();
    }
    // 日志走 services 的通知监控（跨模块薄别名，调用点维持原写法）
    var notificationMonitor = {
        log: function (type, detail, opts) {
            if (CocTool.features.services && CocTool.features.services.log) CocTool.features.services.log(type, detail, opts);
        }
    };

    // ===== WebDAV 核心函数（手动上传/导入后自动上传/自动恢复共用，仿云端备份模块模型） =====
    function getWebdavAuth() {
        const user = settings.webdavAccount;
        const pass = settings.webdavPassword;
        if (!user || !pass) return null;
        return 'Basic ' + btoa(user + ':' + pass);
    }

    function getWebdavBaseUrl() {
        let server = settings.webdavServer.replace(/\/+$/, '');
        let folder = settings.webdavFolder.replace(/^\/+|\/+$/g, '');
        return server + '/' + folder + '/';
    }

    // WebDAV 异步桥回调（挂 CocTool 命名空间——契约约定 window 全局只允许 CocTool/serviceLog 等；
    // MainActivity evaluateJavascript 调用 CocTool.webdavBridge.onResult，支持多请求并发）
    let webdavCallbackSeq = 0;
    const webdavPending = {};
    CocTool.webdavBridge = {
        onResult: function (callbackId, result) {
            const pending = webdavPending[callbackId];
            if (!pending) return;
            delete webdavPending[callbackId];
            const response = {
                ok: result.ok,
                status: result.status,
                text: () => Promise.resolve(result.body || ''),
                clone: function () { return this; }
            };
            if (!result.ok) {
                response.statusText = 'HTTP ' + result.status;
                if (result.error) response.statusText += ' (' + result.error + ')';
            }
            pending.resolve(response);
        }
    };

    async function doWebdavRequest(path, method, body) {
        const auth = getWebdavAuth();
        if (!auth) throw new Error('账号或密码未设置');
        const baseUrl = getWebdavBaseUrl().replace(/\/+$/, '');
        // 对路径中的每个分段做 URL 编码（处理 # 等特殊字符）
        const cleanPath = path.split('/').map(s => encodeURIComponent(s)).join('/');
        const url = baseUrl + (cleanPath ? '/' + cleanPath : '');
        const bodyArg = (method === 'MKCOL' || !body) ? null : body;

        // 真机：优先异步桥（OkHttp enqueue + evaluateJavascript 回调），网络期间不阻塞 JS 线程（旧同步版会卡前端最长 15s）
        if (typeof AndroidApp !== 'undefined' && AndroidApp.doWebdavHttpRequestAsync) {
            return new Promise((resolve, reject) => {
                const cbId = 'wdv' + (++webdavCallbackSeq);
                webdavPending[cbId] = { resolve, reject };
                AndroidApp.doWebdavHttpRequestAsync(url, method, settings.webdavAccount, settings.webdavPassword, bodyArg, cbId);
            });
        }

        // 旧真机兜底：同步桥（阻塞但可用）
        if (typeof AndroidApp !== 'undefined' && AndroidApp.doWebdavHttpRequest) {
            return new Promise((resolve, reject) => {
                try {
                    const resultJson = AndroidApp.doWebdavHttpRequest(url, method, settings.webdavAccount, settings.webdavPassword, bodyArg);
                    const result = JSON.parse(resultJson);
                    const response = {
                        ok: result.ok,
                        status: result.status,
                        text: () => Promise.resolve(result.body),
                        clone: function () { return this; }
                    };
                    if (!result.ok) {
                        response.statusText = 'HTTP ' + result.status;
                        if (result.error) response.statusText += ' (' + result.error + ')';
                    }
                    resolve(response);
                } catch (e) { reject(e); }
            });
        }

        // 浏览器（网页版）：原生 fetch
        const headers = { 'Authorization': auth };
        if (body) headers['Content-Type'] = 'application/json';
        const res = await fetch(url, { method, headers, body });
        return res;
    }

    async function ensureWebdavFolder() {
        const res = await doWebdavRequest('', 'MKCOL');
        if (res.status === 405 || res.status === 409 || res.status === 301 || res.status === 302) {
            return;
        }
        if (res.ok) return;
        const errText = await res.text().catch(() => '');
        throw new Error('创建文件夹失败: HTTP ' + res.status + (errText ? ' ' + errText : ''));
    }

    async function ensureWebdavFolder() {
        const res = await doWebdavRequest('', 'MKCOL');
        if (res.status === 405 || res.status === 409 || res.status === 301 || res.status === 302) {
            return;
        }
        if (res.ok) return;
        const errText = await res.text().catch(() => '');
        throw new Error('创建文件夹失败: HTTP ' + res.status + (errText ? ' ' + errText : ''));
    }

    // 导入后自动上传入口：委托 init() 内统一上传核心 webdavUpload(true)（原此处有一份重复实现，
    // 载荷缺 clans、与手动上传行为漂移，已收敛删除）
    function autoWebdavUpload() {
        return webdavUploadRef ? webdavUploadRef(true) : Promise.resolve();
    }

    function init() {
        if (initialized) return;
        initialized = true;
        // ===== WebDAV 备份功能 =====
        const webdavModal = document.getElementById('webdav-modal');
        const webdavCloseBtn = document.getElementById('webdav-close-btn');
        const webdavSettingsBtn = document.getElementById('webdav-settings-btn');
        const webdavEnabledToggle = document.getElementById('webdav-enabled-toggle');
        const webdavAutoToggle = document.getElementById('webdav-auto-toggle');
        const webdavServerInput = document.getElementById('webdav-server-input');
        const webdavAccountInput = document.getElementById('webdav-account-input');
        const webdavPasswordInput = document.getElementById('webdav-password-input');
        const webdavFolderInput = document.getElementById('webdav-folder-input');
        const webdavUploadBtn = document.getElementById('webdav-upload-btn');
        const webdavImportBtn = document.getElementById('webdav-import-btn');
        const webdavSaveBtn = document.getElementById('webdav-save-btn');

        function loadWebdavToUI() {
            webdavEnabledToggle.checked = settings.webdavEnabled;
            webdavAutoToggle.checked = settings.webdavAutoUpload;
            webdavServerInput.value = settings.webdavServer;
            webdavAccountInput.value = settings.webdavAccount;
            webdavPasswordInput.value = settings.webdavPassword;
            webdavFolderInput.value = settings.webdavFolder;
            const timeEl = document.getElementById('webdav-last-upload-time');
            if (timeEl) {
                timeEl.textContent = settings.webdavLastUploadTime
                    ? '最近上传时间：' + settings.webdavLastUploadTime
                    : '最近上传时间：--';
            }
        }

        function saveWebdavFromUI() {
            settings.webdavEnabled = webdavEnabledToggle.checked;
            settings.webdavAutoUpload = webdavAutoToggle.checked;
            settings.webdavServer = webdavServerInput.value.trim();
            settings.webdavAccount = webdavAccountInput.value.trim();
            settings.webdavPassword = webdavPasswordInput.value;
            settings.webdavFolder = webdavFolderInput.value.trim() || 'ClashAssistant';
            saveSettings();
        }

        // WebDAV 统一备份载荷（与云端 buildBackupPayload 同构含 clans；独立函数不与云端互染）
        function buildWebdavPayload() {
            return {
                version: 1,
                exportDate: new Date().toISOString(),
                accounts,
                accountNotes,
                accountOrder,
                currentAccount: state.currentAccount,
                settings: { ...settings },
                clans: getIntlClanTags()   // 国际服部落标签（仅标签，恢复时按需拉取详情）
            };
        }

        async function webdavUpload(silent) {
            try {
                // 不用 pretty-print：几百 KB 数据的格式化会加重主线程负担，文件可读性无价值
                const jsonStr = JSON.stringify(buildWebdavPayload());
                const filename = 'webdav_backup.json';
                try { await ensureWebdavFolder(); } catch (folderErr) {
                }
                const res = await doWebdavRequest(filename, 'PUT', jsonStr);
                if (!res.ok) {
                    const errText = await res.text().catch(() => '');
                    throw new Error('HTTP ' + res.status + (errText ? ': ' + errText : ''));
                }
                // 上传成功 → 本地与 WebDAV 内容一致，标记同步为备份时刻（自动恢复比对用）
                try { localStorage.setItem(WEBDAV_SYNC_KEY, String(Date.now())); } catch (markErr) {}
                const now = new Date();
                settings.webdavLastUploadTime =
                    now.getFullYear() + '-' +
                    String(now.getMonth() + 1).padStart(2, '0') + '-' +
                    String(now.getDate()).padStart(2, '0') + ' ' +
                    String(now.getHours()).padStart(2, '0') + ':' +
                    String(now.getMinutes()).padStart(2, '0') + ':' +
                    String(now.getSeconds()).padStart(2, '0');
                saveSettings();
                const timeEl = document.getElementById('webdav-last-upload-time');
                if (timeEl) timeEl.textContent = '最近上传时间：' + settings.webdavLastUploadTime;
                if (!silent) showToast('备份上传成功', 2000);
            } catch (e) {
                if (!silent) {
                    const detail = e.name === 'TypeError'
                        ? '网络错误，请检查服务器地址和网络连接'
                        : e.message;
                    showToast('上传失败：' + detail, 4000);
                }
            }
        }

        // WebDAV 恢复核心（手动导入/启动自动恢复共用，对齐云端 performCloudRestore）；返回是否执行了恢复
        async function performWebdavRestore(backupData) {
            // 兼容两种格式：新版标准格式 或 旧版扁平格式
            const dataToRestore = backupData.accounts ? backupData : (backupData.data || backupData);
            if (!dataToRestore || !dataToRestore.accounts) {
                showToast('备份数据格式无效', 3000);
                return false;
            }
            // 与云端恢复一致的写入逻辑
            localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToRestore));
            if (backupData.settings || dataToRestore.settings) {
                localStorage.setItem(SETTINGS_KEY, JSON.stringify(backupData.settings || dataToRestore.settings));
            }
            // 恢复成功 → 本地与 WebDAV 内容一致，标记同步为备份时刻（防自动恢复回环）
            try { localStorage.setItem(WEBDAV_SYNC_KEY, String(Date.parse(backupData.exportDate) || Date.now())); } catch (e) {}
            var clanTags = dataToRestore.clans || [];
            var addedClans = 0;
            if (clanTags.length > 0 && CocTool.features.clan && CocTool.features.clan.restoreClansFromTags) {
                try {
                    addedClans = await CocTool.features.clan.restoreClansFromTags(clanTags);
                } catch (e) { addedClans = 0; }
            }
            showToast(addedClans > 0
                ? ('WebDAV 恢复成功！已补 ' + addedClans + ' 个部落，即将刷新')
                : 'WebDAV 恢复成功！即将刷新', 1800);
            setTimeout(() => location.reload(), 1800);
            return true;
        }

        async function webdavImport() {
            try {
                const filename = 'webdav_backup.json';
                const res = await doWebdavRequest(filename, 'GET');
                if (!res.ok) {
                    const errText = await res.text().catch(() => '');
                    throw new Error('HTTP ' + res.status + (errText ? ': ' + errText : ''));
                }
                const jsonStr = await res.text();
                const backupData = JSON.parse(jsonStr);
                await performWebdavRestore(backupData);
            } catch (e) {
                const detail = e.name === 'TypeError' ? '网络错误，请检查服务器地址和网络连接' : e.message;
                showToast('导入失败：' + detail, 4000);
            }
        }

        // WebDAV 弹窗关闭守卫：打开时快照表单，任何路径（✕/遮罩/返回键/切导航页）关闭若检测到未保存
        // 修改，先拦截并询问「保存并关闭 / 不保存」——统一经 MutationObserver 拦截，避免逐个关闭入口打补丁
        let webdavModalSnapshot = null;
        function webdavFormSnapshot() {
            return JSON.stringify({
                server: webdavServerInput.value,
                account: webdavAccountInput.value,
                password: webdavPasswordInput.value,
                folder: webdavFolderInput.value,
                enabled: webdavEnabledToggle.checked,
                auto: webdavAutoToggle.checked,
                autoRestore: document.getElementById('webdav-auto-restore-toggle').checked
            });
        }
        function webdavModalDirty() {
            return webdavModalSnapshot !== null && webdavFormSnapshot() !== webdavModalSnapshot;
        }

        function openWebdavModal() {
            loadWebdavToUI();
            webdavModalSnapshot = webdavFormSnapshot();
            webdavModal.classList.remove('hidden');
        }

        function closeWebdavModal() {
            webdavModal.classList.add('hidden');
        }

        new MutationObserver(() => {
            if (!webdavModal.classList.contains('hidden') || !webdavModalDirty()) return;
            webdavModal.classList.remove('hidden'); // 拦截本次关闭
            CocTool.ui.showConfirm({
                title: '未保存的修改',
                text: '检测到 WebDAV 设置有修改，是否保存后关闭？',
                confirmText: '保存并关闭',
                cancelText: '不保存',
                onConfirm: () => {
                    saveWebdavFromUI();
                    webdavModalSnapshot = webdavFormSnapshot();
                    showToast('WebDAV 设置已保存', 2000);
                    closeWebdavModal();
                },
                onCancel: () => {
                    webdavModalSnapshot = null;
                    closeWebdavModal();
                }
            });
        }).observe(webdavModal, { attributes: true, attributeFilter: ['class'] });

        webdavSettingsBtn.addEventListener('click', openWebdavModal);
        webdavCloseBtn.addEventListener('click', closeWebdavModal);
        webdavModal.addEventListener('click', (e) => { if (e.target === webdavModal) closeWebdavModal(); });
        webdavSaveBtn.addEventListener('click', () => {
            saveWebdavFromUI();
            webdavModalSnapshot = webdavFormSnapshot(); // 已保存即非脏，关闭不触发询问
            showToast('WebDAV 设置已保存', 2000);
            closeWebdavModal();
        });
        if (webdavUploadBtn) webdavUploadBtn.addEventListener('click', async () => {
            const btn = document.getElementById('webdav-upload-btn');
            if (!btn) return;
            btn.disabled = true;
            btn.innerHTML = '<i class="fa fa-spinner fa-spin mr-2"></i>上传中...';
            try { await webdavUpload(false); }
            finally { btn.disabled = false; btn.innerHTML = '上传备份'; }
        });
        if (webdavImportBtn) webdavImportBtn.addEventListener('click', async () => {
            const btn = document.getElementById('webdav-import-btn');
            if (!btn) return;
            btn.disabled = true;
            btn.innerHTML = '<i class="fa fa-spinner fa-spin mr-2"></i>导入中...';
            try { await webdavImport(); }
            finally { btn.disabled = false; btn.innerHTML = '导入备份'; }
        });


        // === 账号认证 + 云端备份/恢复 ===
        const CLOUD_API = 'https://coctool.top/api/account';
        const AUTH_KEY = 'coc_cloud_auth';
        const TOKEN_KEY = 'coc_cloud_token';
        // 本机安全标记（版本号可随测试/发版递增：老 key 不删，只换新 key 即可重新触发一次流程）
        const SECURITY_NOTICE_KEY = 'coc_security_notice_160';
        const SECURITY_VERSION_KEY = 'coc_security_v4';
        const SECURITY_REQUIRED_KEY = 'coc_security_required_v4';

        // 1.5.9：安全提示未确认、服务端已明确返回“需要升级”、或改密弹窗正在打开/已打开时，
        // 自动恢复/自动备份都不跑。
        // 注意：不能只凭「已登录但版本标记缺失」判断——服务端开关还没打开时，老账号仍可正常登录；
        // 弹窗打开期间的让位由 securityUpgrade.isActive() 兜住（含正在拉 config 的短窗口）。
        function securityUpgradePending() {
            try {
                if (localStorage.getItem(SECURITY_NOTICE_KEY) !== '1') return true;
                if (localStorage.getItem(SECURITY_REQUIRED_KEY) === '1') return true;
            } catch (e) { return false; }
            try {
                if (CocTool.securityUpgrade && CocTool.securityUpgrade.isActive && CocTool.securityUpgrade.isActive()) return true;
            } catch (e) {}
            return false;
        }
        function markSecurityVersion(version) {
            if (Number(version) >= 2) {
                try {
                    localStorage.setItem(SECURITY_VERSION_KEY, '1');
                    localStorage.removeItem(SECURITY_REQUIRED_KEY);
                } catch (e) {}
            }
        }
        function markSecurityRequired() {
            try { localStorage.setItem(SECURITY_REQUIRED_KEY, '1'); } catch (e) {}
        }

        // DOM 引用
        const cloudLoginText = document.getElementById('cloud-login-text');
        const loginModal = document.getElementById('login-modal');
        const loginCloseBtn = document.getElementById('login-close-btn');
        const loginEmail = document.getElementById('login-email');
        const loginPassword = document.getElementById('login-password');
        const loginError = document.getElementById('login-error');
        const loginSubmitBtn = document.getElementById('login-submit-btn');
        const loginToRegister = document.getElementById('login-to-register');
        const registerModal = document.getElementById('register-modal');
        const registerCloseBtn = document.getElementById('register-close-btn');
        const registerEmail = document.getElementById('register-email');
        const registerPassword = document.getElementById('register-password');
        const registerConfirmPwd = document.getElementById('register-confirm-pwd');
        const registerError = document.getElementById('register-error');
        const registerSubmitBtn = document.getElementById('register-submit-btn');
        const registerToLogin = document.getElementById('register-to-login');

        // 加载缓存的登录信息
        let authData = (() => {
            try { return JSON.parse(localStorage.getItem(AUTH_KEY)); } catch { return null; }
        })();

        // 旧版登录态（coc_cloud_auth/coc_cloud_pwd，对应 coctimer.pages.dev 旧体系）静默清理：
        // 旧账号库已废弃，无 token 即未登录；顺带清掉明文密码键，不弹任何提示
        if (!localStorage.getItem(TOKEN_KEY) && localStorage.getItem(AUTH_KEY)) {
            localStorage.removeItem(AUTH_KEY);
            localStorage.removeItem('coc_cloud_pwd');
            authData = null;
        }

        // 更新登录显示状态
        function updateLoginUI() {
            const token = localStorage.getItem(TOKEN_KEY);
            if (token && authData && authData.email) {
                cloudLoginText.textContent = authData.email;
                cloudLoginText.className = 'text-sm cursor-pointer hover:text-blue-700';
                cloudLoginText.style.color = '#3b82f6';
            } else {
                cloudLoginText.textContent = '登录账号';
                cloudLoginText.className = 'text-blue-500 text-sm cursor-pointer hover:text-blue-700';
            }
            if (refreshCloudAutoBackupUiRef) refreshCloudAutoBackupUiRef();
            updateAutoRestoreUi();
        }
        updateLoginUI();

        // 点击登录文字/邮箱
        cloudLoginText.addEventListener('click', () => {
            if (authData && authData.email) {
                CocTool.ui.showConfirm({
                    title: '退出登录',
                    text: '是否退出当前账号？',
                    confirmText: '退出',
                    cancelText: '取消',
                    onConfirm: () => {
                        localStorage.removeItem(AUTH_KEY);
                        localStorage.removeItem(TOKEN_KEY);
                        localStorage.removeItem('coc_cloud_pwd');
                        authData = null;
                        updateLoginUI();
                        showToast('已退出登录', 1500);
                        // 阵型中心随登录态变化刷新：我的上传回到仅本机匿名视角（已归账号的阵型不再显示）
                        window.dispatchEvent(new CustomEvent('cloud-auth-changed'));
                    }
                });
            } else {
                openCloudLogin();
            }
        });

        // 打开云端备份登录弹窗（register-modal 对侧，复用同一套登录逻辑）
        function openCloudLogin() {
            loginEmail.value = '';
            loginPassword.value = '';
            loginError.classList.add('hidden');
            loginModal.classList.remove('hidden');
        }
        openCloudLoginRef = openCloudLogin;

        // 登录弹窗操作
        loginCloseBtn.addEventListener('click', () => loginModal.classList.add('hidden'));
        loginModal.addEventListener('click', (e) => { if (e.target === loginModal) loginModal.classList.add('hidden'); });

        loginSubmitBtn.addEventListener('click', async () => {
            const email = loginEmail.value.trim();
            const password = loginPassword.value;
            if (!email) { loginError.textContent = '请输入邮箱'; loginError.classList.remove('hidden'); return; }
            if (!password) { loginError.textContent = '请输入密码'; loginError.classList.remove('hidden'); return; }

            loginError.classList.add('hidden');
            const orig = loginSubmitBtn.innerHTML;
            loginSubmitBtn.disabled = true;
            loginSubmitBtn.innerHTML = '<i class="fa fa-spinner fa-spin mr-2"></i>登录中...';

            try {
                const res = await fetch(`${CLOUD_API}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password }),
                });
                const result = await res.json();
                if (result.success) {
                    authData = { email };
                    localStorage.setItem(AUTH_KEY, JSON.stringify(authData));
                    localStorage.setItem(TOKEN_KEY, result.token);
                    markSecurityVersion(result.securityVersion);
                    updateLoginUI();
                    loginModal.classList.add('hidden');
                    showToast('登录成功', 1500);
                    // 新库为空时用本地旧结构补初始化（升级用户登录后不能看到“云端空”）
                    try { CocTool.cloudSync.ensureCloudInitialized().catch(function () {}); } catch (e) {}
                    // 阵型中心：登录态变化，我的上传会触发本机旧阵型认领并刷新
                    window.dispatchEvent(new CustomEvent('cloud-auth-changed'));
                } else if (result.code === 'security_upgrade_required') {
                    // 1.5.9：账号需要先改密；不保存 token，直接打开改密弹窗
                    markSecurityRequired();
                    loginModal.classList.add('hidden');
                    if (CocTool.securityUpgrade && CocTool.securityUpgrade.open) {
                        CocTool.securityUpgrade.open({ email: email, upgradeToken: result.upgradeToken });
                    } else {
                        loginError.textContent = '账号需要安全升级，请更新到最新版本';
                        loginError.classList.remove('hidden');
                        loginModal.classList.remove('hidden');
                    }
                } else if (result.code === 'security_locked') {
                    loginError.textContent = '账号存在异常，请联系作者' + (result.supportCode ? '（支持码：' + result.supportCode + '）' : '');
                    loginError.classList.remove('hidden');
                } else {
                    loginError.textContent = result.error || '登录失败';
                    loginError.classList.remove('hidden');
                }
            } catch (err) {
                loginError.textContent = '网络错误：' + err.message;
                loginError.classList.remove('hidden');
            } finally {
                loginSubmitBtn.disabled = false;
                loginSubmitBtn.innerHTML = orig;
            }
        });

        loginToRegister.addEventListener('click', () => {
            loginModal.classList.add('hidden');
            registerEmail.value = '';
            registerPassword.value = '';
            registerConfirmPwd.value = '';
            registerError.classList.add('hidden');
            registerModal.classList.remove('hidden');
            loadCaptcha();
        });

        // 注册弹窗操作
        // 人机验证（2026-11-14）：服务端图池出图 → 本机播放 spritesheet → 点击坐标回传
        const captchaBox = document.getElementById('register-captcha-box');
        const captchaSprite = document.getElementById('register-captcha-sprite');
        const captchaHint = document.getElementById('register-captcha-hint');
        let captchaState = { uid: '', points: [] };

        async function loadCaptcha() {
            captchaState = { uid: '', points: [] };
            if (captchaBox) {
                captchaBox.querySelectorAll('.captcha-dot').forEach(function (d) { d.remove(); });
            }
            captchaSprite.classList.remove('playing');
            captchaSprite.style.backgroundImage = '';
            captchaHint.style.display = 'flex';
            captchaHint.textContent = '加载验证码…';
            try {
                const r = await fetch('https://coctool.top/api/captcha/get');
                const j = await r.json();
                if (!j.success) { captchaHint.textContent = (j.msg || '加载失败') + '（点击重试）'; return; }
                captchaState.uid = j.uid;
                captchaSprite.style.backgroundImage = 'url(' + j.image + ')';
                captchaSprite.classList.add('playing');
                captchaHint.style.display = 'none';
            } catch (e) {
                captchaHint.textContent = '网络错误（点击重试）';
            }
        }

        if (captchaBox) {
            captchaBox.addEventListener('click', function (e) {
                if (!captchaState.uid) { loadCaptcha(); return; }
                const rect = captchaBox.getBoundingClientRect();
                const x = Math.round(e.clientX - rect.left);
                const y = Math.round(e.clientY - rect.top);
                if (x < 0 || y < 0 || x > 200 || y > 200) return;
                captchaState.points.push({ x: x, y: y });
                const dot = document.createElement('div');
                dot.className = 'captcha-dot';
                dot.style.left = x + 'px';
                dot.style.top = y + 'px';
                captchaBox.appendChild(dot);
            });
        }

        // 点错救急：重置选择（清空点，不换图） / 刷新图片（换一张）
        const captchaReset = document.getElementById('register-captcha-reset');
        const captchaRefresh = document.getElementById('register-captcha-refresh');

        if (captchaReset) {
            captchaReset.addEventListener('click', function () {
                captchaState.points = [];
                if (captchaBox) captchaBox.querySelectorAll('.captcha-dot').forEach(function (d) { d.remove(); });
            });
        }

        if (captchaRefresh) {
            captchaRefresh.addEventListener('click', function () {
                if (captchaRefresh.disabled) return;
                captchaRefresh.disabled = true;
                // 服务端 get 限流 3 次/分钟：连点会被 429，禁用 3 秒做节流，失败时 loadCaptcha 会显示原因
                Promise.resolve(loadCaptcha()).finally(function () {
                    setTimeout(function () { captchaRefresh.disabled = false; }, 3000);
                });
            });
        }

        registerCloseBtn.addEventListener('click', () => registerModal.classList.add('hidden'));
        registerModal.addEventListener('click', (e) => { if (e.target === registerModal) registerModal.classList.add('hidden'); });

        registerSubmitBtn.addEventListener('click', async () => {
            const email = registerEmail.value.trim();
            const password = registerPassword.value;
            const confirm = registerConfirmPwd.value;

            if (!email) { registerError.textContent = '请输入邮箱'; registerError.classList.remove('hidden'); return; }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { registerError.textContent = '邮箱格式无效'; registerError.classList.remove('hidden'); return; }
            if (!password) { registerError.textContent = '请输入密码'; registerError.classList.remove('hidden'); return; }
            if (password.length < 6) { registerError.textContent = '密码至少6位'; registerError.classList.remove('hidden'); return; }
            if (password !== confirm) { registerError.textContent = '两次密码不一致'; registerError.classList.remove('hidden'); return; }

            registerError.classList.add('hidden');
            const orig = registerSubmitBtn.innerHTML;
            registerSubmitBtn.disabled = true;
            registerSubmitBtn.innerHTML = '<i class="fa fa-spinner fa-spin mr-2"></i>注册中...';

            try {
                const res = await fetch(`${CLOUD_API}/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password, captchaUid: captchaState.uid, captchaPoints: captchaState.points }),
                });
                const result = await res.json();
                if (result.success) {
                    authData = { email };
                    localStorage.setItem(AUTH_KEY, JSON.stringify(authData));
                    localStorage.setItem(TOKEN_KEY, result.token);
                    markSecurityVersion(result.securityVersion);
                    updateLoginUI();
                    registerModal.classList.add('hidden');
                    showToast('注册成功', 1500);
                    // 新库为空时用本地旧结构补初始化
                    try { CocTool.cloudSync.ensureCloudInitialized().catch(function () {}); } catch (e) {}
                    window.dispatchEvent(new CustomEvent('cloud-auth-changed'));
                } else {
                    registerError.textContent = result.error || '注册失败';
                    registerError.classList.remove('hidden');
                    // 验证码错/过期 → 换一张（一次性 uid 已作废）
                    if (/验证码|顺时针|物体/.test(String(result.error || ''))) loadCaptcha();
                }
            } catch (err) {
                registerError.textContent = '网络错误：' + err.message;
                registerError.classList.remove('hidden');
            } finally {
                registerSubmitBtn.disabled = false;
                registerSubmitBtn.innerHTML = orig;
            }
        });

        registerToLogin.addEventListener('click', () => {
            registerModal.classList.add('hidden');
            loginModal.classList.remove('hidden');
        });

        // 云端备份（v2）：整包上传（账号 + 备注 + 偏好 + 完整设置 + 部落）
        document.getElementById('cloud-backup-btn').addEventListener('click', async () => {
            if (!authData || !authData.email) {
                showToast('请先登录账号', 2000);
                return;
            }
            if (securityUpgradePending()) {
                showToast('请先完成账号安全升级，再备份', 2500);
                return;
            }
            const btn = document.getElementById('cloud-backup-btn');
            const origHtml = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fa fa-spinner fa-spin mr-2"></i>备份中...';

            try {
                const cloud = CocTool.cloudSync;
                // 手动整包备份 = 用户声明「本地为最新」（云端校准）：服务端无条件覆写，不会 409
                const result = await cloud.postBackup(cloud.buildBackupData(), cloud.syncedRevision());
                if (result.success) {
                    cloud.markRevision(result.revision);
                    showToast('云端备份已更新', 2000);
                } else if (result.error && (result.error.includes('登录已失效') || result.error.includes('未登录'))) {
                    localStorage.removeItem(TOKEN_KEY);
                    localStorage.removeItem(AUTH_KEY);
                    authData = null;
                    updateLoginUI();
                    showToast('登录已失效，请重新登录', 2000);
                } else if (result.conflict) {
                    // 协议层已自动重试过；仍冲突才提示（不再落成「未知错误」）
                    showToast('云端版本冲突，已自动重试，请稍后再试', 3000);
                } else {
                    showToast('备份失败：' + (result.error || '未知错误'), 3000);
                }
            } catch (err) {
                showToast('备份失败（网络错误）：' + err.message, 3000);
            } finally {
                btn.disabled = false;
                btn.innerHTML = origHtml;
            }
        });

        // === 云端自动备份（App 独有）：导入游戏数据成功后自动上传云端 ===
        // 开关状态单独存 localStorage（AUTO_BACKUP_PREF_KEY），刻意不放进 settings——settings 会随
        // 云端/WebDAV/本地备份整体快照并在恢复时整包写回，若开关存 settings，App 的开态会被带到
        // 没有此功能的网页版（网页版恢复后无开关可见却处于开启状态）
        // 自动备份开关真值表（用户拍板）——「用户设置」（持久意愿，AUTO_BACKUP_PREF_KEY）与「开关显示/生效」分离：
        //   开关位置只反映用户设置（左拨=真关、右拨=开）：用户设置1 + 版本检测最新版 → 真开（正常高亮）
        //   用户设置1 + 版本检测旧版 → 假开（右拨但整体灰度，提示需更新；仍可拨动，左拨即真关）
        //   用户设置0 + 任意检测结果   → 真关（左拨，不灰度）
        // 版本未知（启动首次检测前的窗口）按旧版处理（假开、不上传），检测完成经 updateRedDot 自动刷新；
        // 更新到最新版后开关自动恢复开态（用户设置仍为 1），无需重新开启
        const AUTO_BACKUP_PREF_KEY = 'coc_cloud_auto_backup_enabled';
        const AUTO_RESTORE_PREF_KEY = 'coc_cloud_auto_restore_enabled';
        // WebDAV 独立键：自动恢复开关（默认关，不进备份快照）与上传/恢复一致性标记（与云端标记分开互不干扰）
        const WEBDAV_SYNC_KEY = 'coc_webdav_last_sync';
        const AUTO_RESTORE_WEBDAV_KEY = 'coc_webdav_auto_restore_enabled';
        // 「不再提醒，直接更新」勾选的本地记录（独立键不进快照，换设备/重装需重新勾选）；勾选时点「恢复」才记，取消不记
        const SILENT_RESTORE_CLOUD_KEY = 'coc_cloud_auto_restore_silent';
        const SILENT_RESTORE_WEBDAV_KEY = 'coc_webdav_auto_restore_silent';
        function silentRestoreOn(key) {
            try { return localStorage.getItem(key) === '1'; } catch (e) { return false; }
        }
        function rememberSilentRestore(key) {
            try { localStorage.setItem(key, '1'); } catch (e) {}
        }
        function userWantsAutoBackup() {
            try { return localStorage.getItem(AUTO_BACKUP_PREF_KEY) === '1'; } catch (e) { return false; }
        }

        function isLocalOutdated() {
            // 网页版没有 APK 版本概念（刷新即最新），版本闸门只对真机生效
            if (!isRealAndroidApp()) return false;
            var latest = state.latestServerVersionCode || 0;
            if (!latest) return false;
            var local = 0;
            try { local = window.AndroidApp.getVersionCode(); } catch (e) {}
            return local < latest;
        }

        function isAutoBackupActive() {
            if (!userWantsAutoBackup()) return false;
            if (!isRealAndroidApp()) return true;   // 网页版：无版本闸门
            var latest = state.latestServerVersionCode || 0;
            // 版本未知（启动首次检测前的窗口 / 检测失败）：放行。账号单元上传是服务端合并语义
            // （timestamp 防回退），不会写坏云端；只有明确 local < latest 才拦——否则启动时的
            // 超快捷导入备份会被静默跳过，「先备份再恢复」的启动工作流永远无法完成。
            if (!latest) return true;
            return !isLocalOutdated();
        }
        // 真机专有桥方法识别（shim 桩会伪造 getVersionCode，不能拿它判端）
        function isRealAndroidApp() {
            return Boolean(window.AndroidApp && window.AndroidApp.isSystemDarkMode);
        }

        // 开关行展示状态：nologin 登录后生效 / off 用户设置关 / checking 版本检测中 / outdated 需更新 / '' 正常开
        // （网页版无版本检测，登录后直接走 ''）
        function cloudAutoBackupUiState() {
            if (!userWantsAutoBackup()) return 'off';
            if (!localStorage.getItem(TOKEN_KEY)) return 'nologin';
            if (!isRealAndroidApp()) return '';
            var latest = state.latestServerVersionCode || 0;
            if (!latest) return 'checking';
            var local = 0;
            try { local = window.AndroidApp.getVersionCode(); } catch (e) {}
            if (local < latest) return 'outdated';
            return '';
        }

        function updateCloudAutoBackupUi() {
            var group = document.getElementById('cloud-auto-backup-group');
            if (!group) return;
            var uiState = cloudAutoBackupUiState();
            group.style.display = '';
            var toggle = document.getElementById('cloud-auto-backup-toggle');
            var label = document.getElementById('cloud-auto-backup-label');
            // 开关位置 = 用户设定（左拨真关/右拨开），不再展示生效态；版本旧或检测中 = 假开：右拨但灰度，仍可拨动（左拨即真关）
            if (toggle) toggle.checked = userWantsAutoBackup();
            var fakeOn = Boolean(toggle && toggle.checked && (uiState === 'outdated' || uiState === 'checking'));
            var switchLabel = group.querySelector('label');
            if (switchLabel) switchLabel.classList.toggle('opacity-40', fakeOn);
            if (label) {
                if (uiState === 'nologin') {
                    label.textContent = '自动备份（登录后生效）';
                    label.className = 'text-xs text-gray-400';
                } else if (uiState === 'outdated') {
                    label.textContent = '自动备份（需更新到最新版）';
                    label.className = 'text-xs text-orange-500';
                } else if (uiState === 'checking') {
                    label.textContent = '自动备份（版本检测中）';
                    label.className = 'text-xs text-gray-400';
                } else {
                    label.textContent = '自动备份';
                    label.className = 'text-xs text-gray-700';
                }
            }
        }

        // ==== 启动备份门控（2026-11-11，用户拍板的工作流）====
        // 超快捷导入（本次确实导入了新数据）→ 等这次导入的自动备份落地（ok）才允许自动恢复；
        // 没有导入（未开超快捷 / 剪贴板无新数据）→ 不建门控，自动恢复尽快执行（抢在用户点导入前）。
        // 门控状态 pending / ok / failed / skipped；timeout 由等待方按 failed 处理。
        // 用户明确关闭自动备份时不建门控（「关备份 + 开恢复」维持现状）。
        var startupBackupGate = null;
        function openStartupBackupGate() {
            if (startupBackupGate && startupBackupGate.state === 'pending') return startupBackupGate;
            var g = { state: 'pending', promise: null, resolve: null };
            g.promise = new Promise(function (resolve) { g.resolve = resolve; });
            startupBackupGate = g;
            return g;
        }
        function settleStartupBackup(state) {
            var g = startupBackupGate;
            if (!g || g.state !== 'pending') return;
            g.state = state;
            if (g.resolve) g.resolve(state);
        }
        async function awaitStartupBackup(timeoutMs) {
            var g = startupBackupGate;
            if (!g) return null;                        // 本次启动没有导入 → 不等待
            if (g.state !== 'pending') return g.state;
            return await Promise.race([
                g.promise,
                new Promise(function (resolve) { setTimeout(function () { resolve('timeout'); }, timeoutMs || 25000); })
            ]);
        }

        async function autoCloudBackup(tag) {
            // 用户明确关闭自动备份：不建立启动门控（恢复不等待）
            var gate = userWantsAutoBackup() ? openStartupBackupGate() : null;
            try {
                const token = localStorage.getItem(TOKEN_KEY);
                if (!token || !authData || !authData.email) {
                    if (gate) settleStartupBackup('skipped');
                    return;
                }
                if (securityUpgradePending()) {
                    if (gate) settleStartupBackup('skipped');
                    return;
                }
                if (!isAutoBackupActive()) {
                    if (gate) settleStartupBackup('failed');   // 旧版被压：备份不可用 → 本次自动恢复跳过
                    // 导入后本应自动备份并提示「云端备份已更新」；用户设置开着但因旧版被压时，
                    // 在同一位置改弹失效提示（每次导入都提示，与正常流程一一对应）
                    if (userWantsAutoBackup() && isLocalOutdated()) {
                        notificationMonitor.log('云端', '自动备份已失效：当前不是最新版本', { noMerge: true });
                        showToast('自动备份已失效，请更新至最新版本', 3000);
                    }
                    return;
                }
                const cloud = CocTool.cloudSync;
                const unit = tag ? cloud.buildAccountUnit(tag) : null;
                if (!unit) {
                    if (gate) settleStartupBackup('skipped');
                    return;
                }
                // 收敛封装在协议层：回执不涨账本，云端有本地没见过的变更时整包拉取（performCloudRestore 应用）
                const result = await cloud.postAccountUnitSynced(unit, performCloudRestore);
                if (result && result.success) {
                    if (gate) settleStartupBackup('ok');    // 备份已落地（含 pulled/无需变更）→ 允许自动恢复
                    if (!result.pulled) {
                        notificationMonitor.log('云端', result.pullFailed ? '自动备份成功，拉取云端更新失败' : '自动备份成功（账号单元）', { noMerge: true });
                        showToast('云端备份已更新', 2000);
                    }
                } else if (result && result.conflict) {
                    if (gate) settleStartupBackup('failed');
                    notificationMonitor.log('云端', '自动备份冲突：云端已有更新（已自动重试）', { noMerge: true });
                    showToast('云端已有更新，已自动重试，请稍后再恢复', 3000);
                } else {
                    if (gate) settleStartupBackup('failed');
                    notificationMonitor.log('云端', '自动备份失败：' + ((result && result.error) || '未知错误'), { noMerge: true });
                    showToast('云端备份失败：' + ((result && result.error) || '未知错误'), 3000);
                }
            } catch (err) {
                if (gate) settleStartupBackup('failed');
                notificationMonitor.log('云端', '自动备份失败（网络错误）：' + err.message, { noMerge: true });
                showToast('云端备份失败（网络错误）', 3000);
            }
        }

        // 删号/补服成功回执不 markRevision：回执 revision 含本地未见过的云端变更，mark 会让手动整包备份基线虚高、误覆盖云端
        /** 删号后的单账号删除同步（不属于自动备份，也不整包） */
        async function deleteCloudAccount(tag) {
            try {
                const cloud = CocTool.cloudSync;
                const result = await cloud.removeAccountCloud(tag, cloud.syncedRevision());
                if (result && result.conflict) {
                    notificationMonitor.log('云端', '删号同步冲突：云端已有更新', { noMerge: true });
                }
                return result;
            } catch (err) {
                return null;
            }
        }

        /** 选服后回传云端补齐 _server */
        async function pushAccountServer(tag, server) {
            try {
                const cloud = CocTool.cloudSync;
                const result = await cloud.pushServer(tag, server, cloud.syncedRevision());
                return result;
            } catch (err) {
                return null;
            }
        }

        var cloudAutoBackupToggle = document.getElementById('cloud-auto-backup-toggle');
        if (cloudAutoBackupToggle) {
            cloudAutoBackupToggle.addEventListener('change', () => {
                if (!cloudAutoBackupToggle.checked) {
                    // 关闭：直接生效，无需确认
                    try { localStorage.setItem(AUTO_BACKUP_PREF_KEY, '0'); } catch (e) {}
                    updateCloudAutoBackupUi();
                    return;
                }
                // 开启：先弹确认（默认关闭，按需开启；取消/点遮罩关闭弹窗后开关由 updateCloudAutoBackupUi 回弹到用户设定）
                CocTool.ui.showConfirm({
                    title: '开启云端自动备份',
                    text: '此功能仅限最新版本使用，开启前请确认已更新至最新版本。<br>开启后，每次导入游戏数据只会自动上传该账号（含该账号备注与账号偏好）；备注、设置等改动不会自动上传，需要到「云端备份」手动整包备份。<br>删除账号会自动从云端删除该账号。若没有多设备同步需求，不建议开启。',
                    confirmText: '确认开启',
                    cancelText: '取消',
                    onConfirm: () => {
                        try { localStorage.setItem(AUTO_BACKUP_PREF_KEY, '1'); } catch (e) {}
                        updateCloudAutoBackupUi();
                    },
                    onCancel: () => updateCloudAutoBackupUi()
                });
                // 弹窗关闭（含点遮罩无回调）后同步开关回真实状态
                setTimeout(updateCloudAutoBackupUi, 50);
            });
        }
        var cloudAutoRestoreToggle = document.getElementById('cloud-auto-restore-toggle');
        if (cloudAutoRestoreToggle) {
            cloudAutoRestoreToggle.addEventListener('change', () => {
                try { localStorage.setItem(AUTO_RESTORE_PREF_KEY, cloudAutoRestoreToggle.checked ? '1' : '0'); } catch (e) {}
                updateAutoRestoreUi();
            });
        }
        updateAutoRestoreUi();
        // 启动后 300ms 做一次自动恢复检测（登录态是同步读 localStorage，页面此时已可用；
        // 原 2000ms 是保守等待，实测没有依赖——用户 2026-11-05 报「自动恢复响应慢」）
        setTimeout(() => { maybeAutoRestore(); }, 300);
        maybeAutoRestoreRef = maybeAutoRestore;

        // === WebDAV 自动恢复（仿云端自动恢复；与云端自动恢复互斥，WebDAV 优先） ===
        function webdavAutoRestoreReady() {
            return webdavAutoRestoreOn() && settings.webdavEnabled &&
                settings.webdavServer && getWebdavAuth();
        }

        function webdavSyncedAt() {
            return parseInt(localStorage.getItem(WEBDAV_SYNC_KEY), 10) || 0;
        }

        // 启动触发（5s，晚于云端检测）：开关开 + WebDAV 已配置 → 拉云端文件比对 exportDate，较新则询问后恢复
        async function maybeWebdavAutoRestore() {
            try {
                // 1.5.9：安全提示未确认 / 改密弹窗打开期间，WebDAV 自动恢复也不在弹窗背后跑
                if (securityUpgradePending()) return;
                if (!webdavAutoRestoreReady()) return;
                const filename = 'webdav_backup.json';
                const res = await doWebdavRequest(filename, 'GET');
                if (!res.ok) return;
                const jsonStr = await res.text();
                const backupData = JSON.parse(jsonStr);
                if (!(backupData.accounts ? backupData : (backupData.data || backupData))) return;
                var cloudAt = Date.parse(backupData.exportDate) || 0;
                if (cloudAt <= webdavSyncedAt()) return;
                var t = new Date(cloudAt);
                var pad = function (n) { return String(n).padStart(2, '0'); };
                var timeStr = (t.getMonth() + 1) + '-' + pad(t.getDate()) + ' ' + pad(t.getHours()) + ':' + pad(t.getMinutes());
                // 勾过「不再提醒，直接更新」：跳过询问直接恢复（互斥规则不变——WebDAV 优先在前已 return）
                if (silentRestoreOn(SILENT_RESTORE_WEBDAV_KEY)) {
                    performWebdavRestore(backupData).catch(() => {});
                    return;
                }
                CocTool.ui.showConfirm({
                    title: 'WebDAV 自动恢复',
                    text: '检测到 WebDAV 备份较新（' + timeStr + '），是否恢复到本地？',
                    checkbox: { text: '不再提醒，直接更新', checked: false },
                    confirmText: '恢复',
                    cancelText: '取消',
                    noOutsideClose: true, // 特例：自动恢复弹窗必须点按钮关闭，不允许点外部区域关闭
                    onConfirm: (dontAsk) => {
                        if (dontAsk) rememberSilentRestore(SILENT_RESTORE_WEBDAV_KEY);
                        performWebdavRestore(backupData).catch(() => {});
                    },
                    onCancel: () => {}
                });
            } catch (err) {
                // 静默：启动检测失败不打扰（WebDAV 未配置/网络不可达等）
            }
        }
        setTimeout(() => { maybeWebdavAutoRestore(); }, 5000);
        maybeWebdavAutoRestoreRef = maybeWebdavAutoRestore;
        webdavUploadRef = webdavUpload;

        var webdavAutoRestoreToggle = document.getElementById('webdav-auto-restore-toggle');
        if (webdavAutoRestoreToggle) {
            webdavAutoRestoreToggle.addEventListener('change', () => {
                try { localStorage.setItem(AUTO_RESTORE_WEBDAV_KEY, webdavAutoRestoreToggle.checked ? '1' : '0'); } catch (e) {}
                updateAutoRestoreUi(); // 云端自动恢复标签同步显示让位状态
            });
            webdavAutoRestoreToggle.checked = webdavAutoRestoreOn();
        }
        updateCloudAutoBackupUi();
        autoCloudBackupRef = autoCloudBackup;
        deleteCloudAccountRef = deleteCloudAccount;
        pushAccountServerRef = pushAccountServer;
        refreshCloudAutoBackupUiRef = updateCloudAutoBackupUi;

        // 恢复核心（v2）：账号/备注/偏好/order/current/clans 写本地；
        // globalSettings 只在手动恢复时应用（自动校核不覆盖本机设置）
        async function performCloudRestore(data, revision, applyGlobalSettings) {
            if (!data || !data.accounts) {
                showToast('备份数据格式无效', 3000);
                return false;
            }
            // 不倒退：云端包版本低于本地账本（预取到备份前的旧包/缓存）→ 拒绝应用，避免旧数据覆盖本地
            var revNum = Number(revision) || 0;
            if (revNum > 0 && revNum < CocTool.cloudSync.syncedRevision()) {
                showToast('云端备份版本较旧，已取消恢复', 2500);
                return false;
            }
            // 空账号包不覆盖本地（防新库空文档/误恢复把本机账号清空）
            if (!Object.keys(data.accounts).length) {
                showToast('云端备份为空，未覆盖本地', 3000);
                return false;
            }
            const localAccounts = {
                accounts: data.accounts,
                accountNotes: data.accountNotes || {},
                accountOrder: data.accountOrder || Object.keys(data.accounts),
                currentAccount: data.currentAccount || null,
                version: 5
            };
            // localStorage 配额不足时（多账号+长日志+渲染缓存可能顶满源配额）：先清**可再生**的渲染缓存
            // （下次渲染自动重建）再试一次；仍失败 → 诚实提示，不 markRevision、不 reload（避免半套数据）
            function trySetLocal(key, val) {
                try { localStorage.setItem(key, val); return true; } catch (e) { return false; }
            }
            const accountsJson = JSON.stringify(localAccounts);
            if (!trySetLocal('clash_upgrade_assistant_v3_fixed', accountsJson)) {
                try { localStorage.removeItem('clash_cached_view'); } catch (e) {}
                if (!trySetLocal('clash_upgrade_assistant_v3_fixed', accountsJson)) {
                    showToast('本地存储空间不足，恢复失败（可尝试清理浏览器站点数据）', 4000);
                    return false;
                }
            }

            // 偏好分片写回 settings 的 5 个按账号字段（其余设置不动）
            const prefFields = CocTool.cloudSync.PREF_FIELDS;
            const nextSettings = Object.assign({}, settings);
            Object.keys(data.accountPrefs || {}).forEach(function (tag) {
                const pref = data.accountPrefs[tag] || {};
                prefFields.forEach(function (field) {
                    if (!Object.prototype.hasOwnProperty.call(pref, field)) return;
                    if (!nextSettings[field] || typeof nextSettings[field] !== 'object') {
                        nextSettings[field] = {};
                    } else {
                        nextSettings[field] = Object.assign({}, nextSettings[field]);
                    }
                    nextSettings[field][tag] = pref[field];
                });
            });
            localStorage.setItem('clash_upgrade_settings', JSON.stringify(nextSettings));
            // 手动恢复：整包设置覆盖（用户主动选择）
            if (applyGlobalSettings && data.globalSettings && typeof data.globalSettings === 'object') {
                localStorage.setItem('clash_upgrade_settings', JSON.stringify(data.globalSettings));
            }
            CocTool.cloudSync.markRevision(revision);

            var clanTags = data.clans || [];
            var addedClans = 0;
            if (clanTags.length > 0 && CocTool.features.clan && CocTool.features.clan.restoreClansFromTags) {
                try {
                    addedClans = await CocTool.features.clan.restoreClansFromTags(clanTags);
                } catch (e) { addedClans = 0; }
            }
            showToast(addedClans > 0
                ? ('云端恢复成功！已补 ' + addedClans + ' 个部落，即将刷新')
                : '云端恢复成功！即将刷新', 1800);
            setTimeout(() => location.reload(), 1800);
            return true;
        }

        // === 云端自动恢复（App + 网页版）：启动时比对云端与本地时间，云端较新则询问后自动触发云端恢复 ===
        // 开关独立存储（不进备份快照，同自动备份做法）；无版本闸门（只读不上传，对服务器无压力）
        function cloudAutoRestoreEnabled() {
            // 无偏好记录时默认开启（2026-11-01 放宽）；明确存过 '0' 的老用户保持关闭
            try { var v = localStorage.getItem(AUTO_RESTORE_PREF_KEY); return v === null ? true : v === '1'; } catch (e) { return true; }
        }

        function updateAutoRestoreUi() {
            var label = document.getElementById('cloud-auto-restore-label');
            var toggle = document.getElementById('cloud-auto-restore-toggle');
            if (toggle) toggle.checked = cloudAutoRestoreEnabled();
            if (label) {
                const token = localStorage.getItem(TOKEN_KEY);
                if (!token) {
                    label.textContent = '自动恢复（登录后生效）';
                    label.className = 'text-xs text-gray-400';
                } else if (cloudAutoRestoreEnabled() && webdavAutoRestoreOn()) {
                    // 互斥让位态：开关开着但不会执行，明示用户原因
                    label.textContent = '自动恢复（WebDAV 恢复优先）';
                    label.className = 'text-xs text-gray-400';
                } else {
                    label.textContent = '自动恢复';
                    label.className = 'text-xs text-gray-700';
                }
            }
        }

        // 两个自动恢复互斥（用户拍板）：WebDAV 恢复优先——它读用户自己的网盘，不给自有服务器增压；
        // WebDAV 自动恢复开启时，云端自动恢复「开关看着开着但不执行」
        function webdavAutoRestoreOn() {
            try { return localStorage.getItem(AUTO_RESTORE_WEBDAV_KEY) === '1'; } catch (e) { return false; }
        }

        // 启动触发：登录 + 开关开 → 拉云端 revision，云端有更新才询问后恢复。
        // 新库还没有文档时，用本机数据自动初始化（不弹窗）。
        async function maybeAutoRestore() {
            try {
                // 1.5.9 安全提示未确认 / 已登录未改密：不跑自动恢复（避免弹窗盖着还拉云包）
                try { if (localStorage.getItem(SECURITY_NOTICE_KEY) !== '1') return; } catch (e) { return; }
                if (securityUpgradePending()) return;
                if (!cloudAutoRestoreEnabled()) return;
                if (webdavAutoRestoreOn()) return; // WebDAV 自动恢复优先，云端让位（不发请求）
                const token = localStorage.getItem(TOKEN_KEY);
                if (!token || !authData || !authData.email) return;
                const cloud = CocTool.cloudSync;
                // 启动工作流门控（用户 2026-11-11 拍板）：本次超快捷导入触发的备份必须先落地，
                // 才允许自动恢复——否则会用备份前的旧云包覆盖刚导入的账号。
                // 没有导入（未开超快捷 / 剪贴板无新数据）时 gate 为 null，立刻继续（恢复尽快执行）。
                var gateState = await awaitStartupBackup(25000);
                if (gateState === 'failed' || gateState === 'timeout') {
                    notificationMonitor.log('云端', '本地导入尚未备份成功，已跳过自动恢复', { noMerge: true });
                    showToast('本地导入尚未备份成功，已跳过自动恢复', 3000);
                    return;
                }
                await cloud.awaitSettledUpload();

                const status = await cloud.getVersion();
                if (!status || !status.success) {
                    if (status && status.code === 'security_upgrade_required' && CocTool.securityUpgrade) {
                        markSecurityRequired();
                        CocTool.securityUpgrade.open({ email: authData.email });
                    }
                    return;
                }
                if (!status.exists) {
                    // 新库为空：用内存 state；state 空则读本地旧结构转换后初始化
                    const data = Object.keys(accounts).length ? cloud.buildBackupData() : cloud.convertLegacyLocal();
                    if (!Object.keys(data.accounts || {}).length) return;
                    const init = await cloud.postBackup(data, 0);
                    if (init && init.success) cloud.markRevision(init.revision);
                    return;
                }
                const cloudRevision = Number(status.revision) || 0;
                if (cloudRevision <= cloud.syncedRevision()) return;

                // 提速（2026-11-05）：version 命中即弹窗（时间来自轻量接口），整包在后台并行下载；
                // 用户确认时再 await（通常数据已到）——不再等整包下载完才弹窗
                const backupPromise = cloud.getBackup();
                backupPromise.catch(() => {});   // 预取失败在确认路径统一提示

                const applyBackup = async (dontAsk) => {
                    if (dontAsk) rememberSilentRestore(SILENT_RESTORE_CLOUD_KEY);
                    const cloudSync = CocTool.cloudSync;
                    let res = null;
                    try { res = await backupPromise; } catch (e) { res = null; }
                    // 预取包可能早于本次备份/其他设备更新：低于当前账本 → 重取一次，仍旧放弃（绝不用旧包覆盖本地）
                    if (!res || !res.success || !res.data || (Number(res.revision) || 0) < cloudSync.syncedRevision()) {
                        res = await cloudSync.getBackup();
                    }
                    if (!res || !res.success || !res.data) {
                        showToast('云端备份获取失败，请稍后重试', 2500);
                        return;
                    }
                    if ((Number(res.revision) || 0) < cloudSync.syncedRevision()) {
                        showToast('云端备份版本较旧，已取消恢复', 2500);
                        return;
                    }
                    if (!res.data.accounts || !Object.keys(res.data.accounts).length) {
                        showToast('云端备份为空，未恢复', 2500);
                        return;
                    }
                    performCloudRestore(res.data, res.revision, false).catch(() => {});
                };

                // 勾过「不再提醒，直接更新」：跳过询问直接恢复
                if (silentRestoreOn(SILENT_RESTORE_CLOUD_KEY)) {
                    applyBackup(false);
                    return;
                }
                // 提示只给「最后更新时刻」（MM-DD HH:mm）；版本号留在同步逻辑里，不给用户看
                const updatedMs = status.updatedAt ? Date.parse(status.updatedAt) : 0;
                let updatedText = '';
                if (updatedMs) {
                    const d = new Date(updatedMs);
                    const pad = n => String(n).padStart(2, '0');
                    updatedText = '（' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + '）';
                }
                CocTool.ui.showConfirm({
                    title: '自动恢复',
                    text: '检测到云端备份已更新' + updatedText + '，是否恢复到本地？',
                    checkbox: { text: '不再提醒，直接更新', checked: false },
                    confirmText: '恢复',
                    cancelText: '取消',
                    noOutsideClose: true, // 特例：自动恢复弹窗必须点按钮关闭，不允许点外部区域关闭
                    onConfirm: (dontAsk) => { applyBackup(dontAsk); },
                    onCancel: () => {}
                });
            } catch (err) {
                // 静默：启动检测失败不打扰
            }
        }

        document.getElementById('cloud-restore-btn').addEventListener('click', async () => {
            if (!authData || !authData.email) {
                showToast('请先登录账号', 2000);
                return;
            }
            // 统一风格确认弹窗（替代原生 confirm）
            CocTool.ui.showConfirm({
                title: '云端恢复',
                text: '云端恢复将覆盖当前所有本地数据，确定继续？',
                confirmText: '继续恢复',
                cancelText: '取消',
                onConfirm: doCloudRestore
            });
        });

        async function doCloudRestore() {
            const btn = document.getElementById('cloud-restore-btn');
            const origHtml = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fa fa-spinner fa-spin mr-2"></i>恢复中...';

            try {
                const cloud = CocTool.cloudSync;
                await cloud.awaitSettledUpload();
                const result = await cloud.getBackup();
                if (result.success && result.data) {
                    await performCloudRestore(result.data, result.revision, true);
                } else if (result.error && (result.error.includes('登录已失效') || result.error.includes('未登录'))) {
                    localStorage.removeItem(TOKEN_KEY);
                    localStorage.removeItem(AUTH_KEY);
                    authData = null;
                    updateLoginUI();
                    showToast('登录已失效，请重新登录', 2000);
                } else {
                    showToast('恢复失败：' + (result.error || '未找到备份数据'), 3000);
                }
            } catch (err) {
                showToast('恢复失败（网络错误）：' + err.message, 3000);
            } finally {
                btn.disabled = false;
                btn.innerHTML = origHtml;
            }
        }

        // 读取国际服部落标签（统一卡片列表里的 tag 数组，国服卡片不带 tag）
        function getIntlClanTags() {
            if (CocTool.clan && typeof CocTool.clan.getIntlClanTags === 'function') {
                return CocTool.clan.getIntlClanTags();
            }
            var rawCards = null;
            try { rawCards = JSON.parse(localStorage.getItem('clash_clan_cards') || localStorage.getItem('clash_clan_list') || '[]'); } catch (e) {}
            var list = (Array.isArray(rawCards) ? rawCards : []).filter(function (c) { return c && c.type !== 'china'; });
            var tags = [];
            for (var i = 0; i < list.length; i++) {
                if (list[i] && list[i].tag) tags.push(list[i].tag);
            }
            return tags;
        }
    }

    CocTool.features.cloudBackup = Object.freeze({
        init,
        autoWebdavUpload,
        maybeWebdavAutoRestore: function () { return maybeWebdavAutoRestoreRef ? maybeWebdavAutoRestoreRef() : Promise.resolve(); },
        autoCloudBackup: function (tag) { return autoCloudBackupRef ? autoCloudBackupRef(tag) : Promise.resolve(); },
        deleteCloudAccount: function (tag) { return deleteCloudAccountRef ? deleteCloudAccountRef(tag) : Promise.resolve(null); },
        pushAccountServer: function (tag, server) { return pushAccountServerRef ? pushAccountServerRef(tag, server) : Promise.resolve(null); },
        maybeAutoRestore: function () { return maybeAutoRestoreRef ? maybeAutoRestoreRef() : Promise.resolve(); },
        refreshCloudAutoBackupUi: function () { if (refreshCloudAutoBackupUiRef) refreshCloudAutoBackupUiRef(); },
        openCloudLogin: function () { if (openCloudLoginRef) openCloudLoginRef(); }
    });
})(window);
