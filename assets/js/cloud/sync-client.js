// ===== 云端同步 — 登录/注册/备份/恢复 (前端 Client) =====
const CLOUD_API = 'https://coctimer.pages.dev/api/sync';
const AUTH_KEY = 'coc_cloud_auth';

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

// 更新登录显示状态
function updateLoginUI() {
    if (authData && authData.email) {
        cloudLoginText.textContent = authData.email;
        cloudLoginText.className = 'text-sm cursor-pointer hover:text-blue-700';
        cloudLoginText.style.color = '#3b82f6';
    } else {
        cloudLoginText.textContent = '登录账号';
        cloudLoginText.className = 'text-blue-500 text-sm cursor-pointer hover:text-blue-700';
    }
}

function setupCloudSync() {
    updateLoginUI();

    // 点击登录文字/邮箱
    cloudLoginText.addEventListener('click', () => {
        if (authData && authData.email) {
            if (confirm('是否退出当前账号？')) {
                localStorage.removeItem(AUTH_KEY);
                localStorage.removeItem('coc_cloud_pwd');
                authData = null;
                updateLoginUI();
                showToast('已退出登录', 1500);
            }
        } else {
            loginEmail.value = '';
            loginPassword.value = '';
            loginError.classList.add('hidden');
            loginModal.classList.remove('hidden');
        }
    });

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
                localStorage.setItem('coc_cloud_pwd', password);
                updateLoginUI();
                loginModal.classList.add('hidden');
                showToast('登录成功', 1500);
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
    });

    // 注册弹窗操作
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
                body: JSON.stringify({ email, password }),
            });
            const result = await res.json();
            if (result.success) {
                authData = { email };
                localStorage.setItem(AUTH_KEY, JSON.stringify(authData));
                localStorage.setItem('coc_cloud_pwd', password);
                updateLoginUI();
                registerModal.classList.add('hidden');
                showToast('注册成功', 1500);
            } else {
                registerError.textContent = result.error || '注册失败';
                registerError.classList.remove('hidden');
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

    // 云端备份
    document.getElementById('cloud-backup-btn').addEventListener('click', async () => {
        if (!authData || !authData.email) {
            showToast('请先登录账号', 2000);
            return;
        }

        const password = localStorage.getItem('coc_cloud_pwd');
        if (!password) {
            showToast('登录信息已过期，请重新登录', 2000);
            return;
        }

        const backupData = {
            version: 1,
            exportDate: new Date().toISOString(),
            accounts,
            accountNotes,
            accountOrder,
            currentAccount,
            settings: { ...settings }
        };

        const btn = document.getElementById('cloud-backup-btn');
        const origHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fa fa-spinner fa-spin mr-2"></i>备份中...';

        try {
            const res = await fetch(CLOUD_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: authData.email, password, data: backupData }),
            });
            const result = await res.json();
            if (result.success) {
                const actionText = result.action === 'created' ? '已创建云端备份' : '云端备份已更新';
                showToast(actionText, 2000);
            } else {
                if (result.error && result.error.includes('密码错误')) {
                    localStorage.removeItem('coc_cloud_pwd');
                    showToast('密码错误，请重新登录', 2000);
                    return;
                }
                showToast('备份失败：' + (result.error || '未知错误'), 3000);
            }
        } catch (err) {
            showToast('备份失败（网络错误）：' + err.message, 3000);
        } finally {
            btn.disabled = false;
            btn.innerHTML = origHtml;
        }
    });

    // 云端恢复
    document.getElementById('cloud-restore-btn').addEventListener('click', async () => {
        if (!authData || !authData.email) {
            showToast('请先登录账号', 2000);
            return;
        }

        if (!confirm('云端恢复将覆盖当前所有本地数据，确定继续？')) return;

        const password = localStorage.getItem('coc_cloud_pwd');
        if (!password) {
            showToast('登录信息已过期，请重新登录', 2000);
            return;
        }

        const btn = document.getElementById('cloud-restore-btn');
        const origHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fa fa-spinner fa-spin mr-2"></i>恢复中...';

        try {
            const res = await fetch(`${CLOUD_API}?email=${encodeURIComponent(authData.email)}&password=${encodeURIComponent(password)}`);
            const result = await res.json();
            if (result.success && result.data) {
                const backup = result.data;
                const dataToRestore = backup.accounts ? backup : backup.data;
                if (!dataToRestore || !dataToRestore.accounts) {
                    showToast('备份数据格式无效', 3000);
                    return;
                }
                localStorage.setItem('clash_upgrade_assistant_v3_fixed', JSON.stringify(dataToRestore));
                if (backup.settings || dataToRestore.settings) {
                    localStorage.setItem('clash_upgrade_settings', JSON.stringify(backup.settings || dataToRestore.settings));
                }
                showToast('云端恢复成功！即将刷新', 1500);
                setTimeout(() => location.reload(), 1500);
            } else {
                if (result.error && result.error.includes('密码错误')) {
                    localStorage.removeItem('coc_cloud_pwd');
                    showToast('密码错误，请重新登录', 2000);
                    return;
                }
                showToast('恢复失败：' + (result.error || '未找到备份数据'), 3000);
            }
        } catch (err) {
            showToast('恢复失败（网络错误）：' + err.message, 3000);
        } finally {
            btn.disabled = false;
            btn.innerHTML = origHtml;
        }
    });
}
