/**
 * security-upgrade.js — 1.5.9 账号安全升级弹窗（2026-11-15）
 *
 * 流程：旧密码（登录）→ 本机数据核对 + 人机验证 + 新密码 → 服务端 /security/upgrade。
 * 只在安全提示弹窗确认后 / 登录返回 security_upgrade_required 时打开；未登录用户不弹。
 * 成功后写 coc_cloud_token / coc_cloud_auth / coc_security_v4，reload 让正常启动流程接管。
 */
(function () {
    var CocTool = window.CocTool;
    if (!CocTool) return;

    var CLOUD_API = 'https://coctool.top/api/account';
    var CAPTCHA_API = 'https://coctool.top/api/captcha/get';
    var AUTH_KEY = 'coc_cloud_auth';
    var TOKEN_KEY = 'coc_cloud_token';
    var NOTICE_KEY = 'coc_security_notice_160';
    var VERSION_KEY = 'coc_security_v4';
    var REQUIRED_KEY = 'coc_security_required_v4';

    var state = { email: '', upgradeToken: '', captcha: { uid: '', points: [] }, busy: false, locked: false, opening: false, configAt: 0, configEnabled: false };
    var el = null;

    function $(id) { return document.getElementById(id); }

    function initEls() {
        el = {
            modal: $('security-upgrade-modal'),
            title: $('security-upgrade-title'),
            desc: $('security-upgrade-desc'),
            localNote: $('security-upgrade-local-note'),
            email: $('security-upgrade-email'),
            oldWrap: $('security-upgrade-old-wrap'),
            oldPassword: $('security-upgrade-old-password'),
            step2: $('security-upgrade-step2'),
            newPassword: $('security-upgrade-new-password'),
            confirmPassword: $('security-upgrade-confirm-password'),
            summary: $('security-upgrade-local-summary'),
            captchaBox: $('security-upgrade-captcha-box'),
            captchaSprite: $('security-upgrade-captcha-sprite'),
            captchaHint: $('security-upgrade-captcha-hint'),
            captchaReset: $('security-upgrade-captcha-reset'),
            captchaRefresh: $('security-upgrade-captcha-refresh'),
            error: $('security-upgrade-error'),
            support: $('security-upgrade-support'),
            supportCode: $('security-upgrade-support-code'),
            submit: $('security-upgrade-submit'),
            logout: $('security-upgrade-logout')
        };
        if (!el.modal || !el.submit) return false;
        if (el.captchaBox) {
            el.captchaBox.addEventListener('click', function (e) {
                if (!state.captcha.uid) { loadCaptcha(); return; }
                var rect = el.captchaBox.getBoundingClientRect();
                var x = Math.round(e.clientX - rect.left);
                var y = Math.round(e.clientY - rect.top);
                if (x < 0 || y < 0 || x > 200 || y > 200) return;
                state.captcha.points.push({ x: x, y: y });
                var dot = document.createElement('div');
                dot.className = 'captcha-dot';
                dot.style.left = x + 'px';
                dot.style.top = y + 'px';
                el.captchaBox.appendChild(dot);
            });
        }
        if (el.captchaReset) {
            el.captchaReset.addEventListener('click', function () {
                state.captcha.points = [];
                clearDots();
            });
        }
        if (el.captchaRefresh) {
            el.captchaRefresh.addEventListener('click', function () {
                if (el.captchaRefresh.disabled) return;
                el.captchaRefresh.disabled = true;
                Promise.resolve(loadCaptcha()).finally(function () {
                    setTimeout(function () { el.captchaRefresh.disabled = false; }, 3000);
                });
            });
        }
        el.submit.addEventListener('click', submit);
        if (el.logout) {
            el.logout.addEventListener('click', function () {
                try {
                    localStorage.removeItem(AUTH_KEY);
                    localStorage.removeItem(TOKEN_KEY);
                    localStorage.removeItem(REQUIRED_KEY);
                } catch (e) {}
                if (el.modal) el.modal.classList.add('hidden');
                if (CocTool.ui && CocTool.ui.showToast) CocTool.ui.showToast('已退出登录，可继续使用本地功能', 2200);
            });
        }
        el.newPassword.addEventListener('keydown', function (e) { if (e.keyCode === 13) el.confirmPassword.focus(); });
        el.confirmPassword.addEventListener('keydown', function (e) { if (e.keyCode === 13) submit(); });
        return true;
    }

    function showError(msg) {
        if (!el || !el.error) return;
        el.error.textContent = msg || '';
        if (msg) el.error.classList.remove('hidden'); else el.error.classList.add('hidden');
    }

    function showSupport(code, msg) {
        state.locked = true;
        state.captcha.points = [];
        clearDots();
        if (el.submit) { el.submit.disabled = true; el.submit.textContent = '请联系作者处理'; }
        if (el.support) {
            el.support.classList.remove('hidden');
            if (el.supportCode) el.supportCode.textContent = code || '（未生成）';
            if (el.error) { el.error.textContent = msg || '本机数据核对未通过，请加群联系作者。'; el.error.classList.remove('hidden'); }
        }
    }

    function clearDots() {
        if (el.captchaBox) el.captchaBox.querySelectorAll('.captcha-dot').forEach(function (d) { d.remove(); });
    }

    function applyTokenUI() {
        if (!el.oldWrap || !el.oldPassword) return;
        if (state.upgradeToken) {
            el.oldWrap.classList.add('hidden');
            el.oldPassword.value = '';
        } else {
            el.oldWrap.classList.remove('hidden');
        }
    }

    // 两步式：先只让用户验证当前密码；服务端确认账号仍需升级后才展开新密码/核对/验证码。
    // 这样“手机已改密、网页再打开”的场景只会看到一次登录验证，不会误以为要再改一次。
    function applyStepUI() {
        var needUpgrade = !!state.upgradeToken;
        if (el.step2) el.step2.classList.toggle('hidden', !needUpgrade);
        if (el.title) el.title.textContent = needUpgrade ? '账号安全升级' : '账号验证';
        if (el.desc) {
            el.desc.textContent = needUpgrade
                ? '小工具服务器遭恶意攻击，该账号尚未完成安全升级。请完成本机数据核对并设置新密码。'
                : '请输入当前密码验证账号。已在本机或其他设备完成安全升级的账号，验证后直接登录，不需要再次改密。';
        }
        if (el.localNote) el.localNote.classList.toggle('hidden', !needUpgrade);
        if (el.submit && !state.locked && !state.busy) {
            el.submit.textContent = needUpgrade ? '核对并修改密码' : '验证当前密码';
        }
    }

    function localSummary() {
        var s = CocTool.state || {};
        var accounts = s.accounts || {};
        var tags = Object.keys(accounts).filter(Boolean);
        var order = (Array.isArray(s.accountOrder) ? s.accountOrder : []).filter(function (t) { return tags.indexOf(t) >= 0; });
        if (!order.length) order = tags.slice();
        var names = {};
        var timestamps = {};
        var notes = s.accountNotes || {};
        tags.forEach(function (tag) {
            var name = notes[tag];
            if (typeof name === 'string' && name.trim()) names[tag] = name.trim();
            var ts = Number(accounts[tag] && accounts[tag].timestamp);
            if (isFinite(ts) && ts > 0) timestamps[tag] = ts;
        });
        return { tags: tags, order: order, current: s.currentAccount || null, names: names, timestamps: timestamps };
    }

    function renderSummary() {
        if (!el.summary) return;
        var s = localSummary();
        if (!s.tags.length) {
            el.summary.textContent = '未检测到本机账号数据（新设备/清过数据时可能为空）。';
            return;
        }
        var names = s.tags.slice(0, 3).map(function (t) { return s.names[t] || t; }).join('、');
        el.summary.textContent = '本机 ' + s.tags.length + ' 个账号：' + names + (s.tags.length > 3 ? ' 等' : '') + '；核对时会与云端备份比对，不会上传完整数据。';
    }

    async function loadCaptcha() {
        if (!el) return;
        state.captcha = { uid: '', points: [] };
        clearDots();
        if (!el.captchaSprite || !el.captchaHint) return;
        el.captchaSprite.classList.remove('playing');
        el.captchaSprite.style.backgroundImage = '';
        el.captchaHint.style.display = 'flex';
        el.captchaHint.textContent = '加载验证码…';
        try {
            var r = await fetch(CAPTCHA_API);
            var j = await r.json();
            if (!j.success) { el.captchaHint.textContent = (j.msg || '加载失败') + '（点击重试）'; return; }
            state.captcha.uid = j.uid;
            el.captchaSprite.style.backgroundImage = 'url(' + j.image + ')';
            el.captchaSprite.classList.add('playing');
            el.captchaHint.style.display = 'none';
        } catch (e) {
            el.captchaHint.textContent = '网络错误（点击重试）';
        }
    }

    function getConfig() {
        var now = Date.now();
        if (state.configAt && now - state.configAt < 60000) return Promise.resolve(state.configEnabled);
        return fetch(CLOUD_API + '/security/config').then(function (r) { return r.json(); }).then(function (j) {
            state.configAt = Date.now();
            state.configEnabled = !!(j && j.success && j.enabled);
            return state.configEnabled;
        }).catch(function () { return false; });
    }

    function saveAuth(email, token) {
        try {
            localStorage.setItem(AUTH_KEY, JSON.stringify({ email: email }));
            if (token) localStorage.setItem(TOKEN_KEY, token);
            localStorage.setItem(VERSION_KEY, '1');
            localStorage.removeItem(REQUIRED_KEY);
        } catch (e) {}
    }

    function reloadAfterSuccess(email, token) {
        saveAuth(email, token);
        showError('');
        if (el.modal) el.modal.classList.add('hidden');
        if (CocTool.ui && CocTool.ui.showToast) CocTool.ui.showToast('账号验证完成，正在重新加载…', 1500);
        setTimeout(function () { location.reload(); }, 350);
    }

    async function submit() {
        if (!el || state.busy || state.locked) return;
        var email = String(el.email.value || '').trim().toLowerCase();
        var oldPassword = String(el.oldPassword.value || '');
        var newPassword = String(el.newPassword.value || '');
        var confirmPassword = String(el.confirmPassword.value || '');
        showError('');
        if (!email) { showError('请输入邮箱'); return; }
        if (!state.upgradeToken && !oldPassword) { showError('请输入当前密码'); return; }

        state.busy = true;
        el.submit.disabled = true;
        el.submit.textContent = '核对中…';
        try {
            // 先验证密码：该账号可能已在其他设备完成升级——此时输入当前密码直接登录即可，
            // 不再要求设置新密码/过人机验证（2026-11-15 用户反馈：手机改完网页又要求改一次）。
            if (!state.upgradeToken) {
                var loginRes = await fetch(CLOUD_API + '/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: email, password: oldPassword })
                });
                var login = await loginRes.json();
                if (login.success) {
                    if (Number(login.securityVersion) >= 2) {
                        reloadAfterSuccess(email, login.token);
                        return;
                    }
                    showError('账号暂不需要升级或服务端尚未开放，请稍后再试');
                    return;
                }
                if (login.code === 'security_locked') {
                    showSupport(login.supportCode, '账号存在异常，请联系作者。');
                    return;
                }
                if (login.code !== 'security_upgrade_required' || !login.upgradeToken) {
                    showError(login.error || '密码验证失败');
                    return;
                }
                state.upgradeToken = login.upgradeToken;
                applyTokenUI();
                applyStepUI();
                if (el.newPassword) el.newPassword.focus();
            }

            if (newPassword.length < 6) { showError('该账号需要安全升级，请设置新密码（至少 6 位）'); return; }
            if (newPassword !== confirmPassword) { showError('两次输入的新密码不一致'); return; }
            if (!state.captcha.uid || !state.captcha.points.length) { showError('请先完成人机验证'); return; }

            var upRes = await fetch(CLOUD_API + '/security/upgrade', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    upgradeToken: state.upgradeToken,
                    newPassword: newPassword,
                    localData: localSummary(),
                    captchaUid: state.captcha.uid,
                    captchaPoints: state.captcha.points
                })
            });
            var up = await upRes.json();
            if (up.success) {
                reloadAfterSuccess(email, up.token);
                return;
            }
            if (up.code === 'manual_required' || up.code === 'security_hold' || up.code === 'security_locked') {
                showSupport(up.supportCode, up.error || '本机数据核对未通过，请加群联系作者。');
                return;
            }
            if (up.code === 'upgrade_token_invalid') {
                state.upgradeToken = '';
                applyTokenUI();
                applyStepUI();
                showError('升级会话已过期，请重新输入当前密码');
                return;
            }
            if (up.code === 'check_failed') {
                showError(up.error || '本机数据核对未通过，请重试或联系作者');
                await loadCaptcha();
                return;
            }
            if (up.code === 'already_upgraded') {
                reloadAfterSuccess(email, '');
                return;
            }
            showError(up.error || '升级失败，请稍后再试');
            if (/验证码|顺时针|物体/.test(String(up.error || ''))) await loadCaptcha();
        } catch (e) {
            showError('网络错误：' + (e && e.message ? e.message : '请稍后再试'));
        } finally {
            state.busy = false;
            if (!state.locked) {
                if (el.submit) el.submit.disabled = false;
                applyStepUI();
            }
        }
    }

    // 改密弹窗是否正在打开/已打开：cloud-backup 的自动备份与自动恢复据此让位，
    // 避免阻塞弹窗背后拉云包或覆盖本地数据。
    function isActive() {
        if (state.opening) return true;
        try {
            var modal = $('security-upgrade-modal');
            return !!(modal && !modal.classList.contains('hidden'));
        } catch (e) { return false; }
    }

    function open(opts) {
        var options = opts || {};
        var hasToken = !!String(options.upgradeToken || '');
        state.opening = true;
        // 服务端已返回 upgradeToken = 功能已开启；此时不再依赖 /security/config，
        // 避免配置接口抖动把登录后的改密弹窗吞掉（2026-11-15 补充）。
        return (hasToken ? Promise.resolve(true) : getConfig()).then(function (enabled) {
            if (!enabled) { state.opening = false; return false; }
            if (!initEls()) { state.opening = false; return false; }
            state.upgradeToken = String(options.upgradeToken || '');
            state.locked = false;
            state.busy = false;
            state.configAt = Date.now();
            state.configEnabled = true;
            var auth = null;
            try { auth = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null'); } catch (e) {}
            var email = String(options.email || (auth && auth.email) || '').trim().toLowerCase();
            state.email = email;
            el.email.value = email;
            el.oldPassword.value = '';
            el.newPassword.value = '';
            el.confirmPassword.value = '';
            el.error.classList.add('hidden');
            if (el.support) el.support.classList.add('hidden');
            if (el.submit) el.submit.disabled = false;
            applyTokenUI();
            applyStepUI();
            renderSummary();
            el.modal.classList.remove('hidden');
            loadCaptcha();
            if (state.upgradeToken) el.newPassword.focus(); else el.oldPassword.focus();
            state.opening = false;
            return true;
        }).catch(function () { state.opening = false; return false; });
    }

    function maybeOpen() {
        try {
            if (localStorage.getItem(NOTICE_KEY) !== '1') return false;
            var auth = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
            if (!auth || !auth.email) return false;
            if (localStorage.getItem(VERSION_KEY) === '1') return false;
            return open({ email: auth.email });
        } catch (e) { return false; }
    }

    CocTool.securityUpgrade = { open: open, maybeOpen: maybeOpen, isActive: isActive };
})();
