/**
 * 云端备份协议层（v2 新通道，2026-11-03）
 *
 * 与旧 userData/miniData/exportDate 结构彻底解耦：
 * - 一份云端文档 = accounts + accountNotes + accountPrefs + accountOrder + currentAccount + clans + globalSettings
 * - 唯一单调 revision；所有写入带 baseRevision 乐观锁（409 revision_conflict）
 * - 账号 JSON 整对象覆写；备注/偏好省略=不改，显式 null/空串=删除
 *
 * 依赖 core.js（CocTool.state）；不依赖 services.js。
 */
(function (global) {
    'use strict';

    const CocTool = global.CocTool;
    if (!CocTool || !CocTool.state) {
        throw new Error('cloud-sync.js requires core.js');
    }

    const CLOUD_API = 'https://coctool.top/api/v2';
    const TOKEN_KEY = 'coc_cloud_token';
    const SYNCED_REVISION_KEY = 'coc_cloud_synced_revision';

    // 按账号（第一层键 = tag）存在的偏好字段；账号单元只带本地确实有值的字段
    const PREF_FIELDS = [
        'dismissedCategories',
        'builderBoostMode24',
        'builderConsumableMode24',
        'labConsumableMode24',
        'builderMonthlyPass',
        'eventBoostOverride',
        'noteDisplayMode'
    ];

    function getToken() {
        try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
    }

    function syncedRevision() {
        try { return parseInt(localStorage.getItem(SYNCED_REVISION_KEY), 10) || 0; } catch (e) { return 0; }
    }

    function markRevision(revision) {
        try { localStorage.setItem(SYNCED_REVISION_KEY, String(Number(revision) || 0)); } catch (e) {}
    }

    function getIntlClanTags() {
        try {
            if (CocTool.clan && typeof CocTool.clan.getIntlClanTags === 'function') {
                return CocTool.clan.getIntlClanTags();
            }
            // 兜底（clan.js 未加载）：新键 → 旧键，只取国际服 tag
            const list = JSON.parse(localStorage.getItem('clash_clan_cards') || localStorage.getItem('clash_clan_list') || '[]');
            const tags = [];
            for (let i = 0; i < list.length; i++) {
                if (list[i] && list[i].type !== 'china' && list[i].tag) tags.push(list[i].tag);
            }
            return tags;
        } catch (e) {
            return [];
        }
    }

    /** 该账号的偏好分片；只取本地确实有值的字段（省略 = 云端不改） */
    function buildAccountPrefs(tag, settings) {
        const prefs = {};
        PREF_FIELDS.forEach(function (field) {
            const map = settings && settings[field];
            if (map && typeof map === 'object' && Object.prototype.hasOwnProperty.call(map, tag)) {
                prefs[field] = map[tag];
            }
        });
        return prefs;
    }

    /** 账号单元：账号 JSON + 该账号备注 + 该账号偏好（缺失字段省略） */
    function buildAccountUnit(tag) {
        const state = CocTool.state;
        const account = state.accounts && state.accounts[tag];
        if (!account) return null;
        const unit = { account: account };
        const notes = state.accountNotes || {};
        if (Object.prototype.hasOwnProperty.call(notes, tag)) unit.accountNote = notes[tag];
        const prefs = buildAccountPrefs(tag, state.settings || {});
        if (Object.keys(prefs).length) unit.prefs = prefs;
        return unit;
    }

    /** 手动备份 / 首次初始化用的整包 */
    function buildBackupData() {
        const state = CocTool.state;
        const prefs = {};
        Object.keys(state.accounts || {}).forEach(function (tag) {
            const p = buildAccountPrefs(tag, state.settings || {});
            if (Object.keys(p).length) prefs[tag] = p;
        });
        return {
            accounts: state.accounts || {},
            accountNotes: state.accountNotes || {},
            accountPrefs: prefs,
            accountOrder: state.accountOrder || [],
            currentAccount: state.currentAccount || null,
            clans: getIntlClanTags(),
            globalSettings: Object.assign({}, state.settings || {})
        };
    }

    /** 旧样式（App 本地/旧云备份）→ v2 整包：把 settings 里 5 项按账号偏好抽到 accountPrefs */
    function convertLegacyBackup(legacy) {
        const src = legacy || {};
        const accounts = src.accounts && typeof src.accounts === 'object' ? src.accounts : {};
        const settings = src.settings && typeof src.settings === 'object' ? src.settings : {};
        const prefs = {};
        Object.keys(accounts).forEach(function (tag) {
            const p = buildAccountPrefs(tag, settings);
            if (Object.keys(p).length) prefs[tag] = p;
        });
        return {
            accounts: accounts,
            accountNotes: src.accountNotes && typeof src.accountNotes === 'object' ? src.accountNotes : {},
            accountPrefs: prefs,
            accountOrder: Array.isArray(src.accountOrder) ? src.accountOrder : Object.keys(accounts),
            currentAccount: src.currentAccount || null,
            clans: Array.isArray(src.clans) ? src.clans : getIntlClanTags(),
            globalSettings: settings
        };
    }

    /** 读 App 本地旧样式（账号键 + 设置键），转成 v2 整包；state 为空时兜底 */
    function convertLegacyLocal() {
        let local = null;
        let settings = {};
        try { local = JSON.parse(localStorage.getItem('clash_upgrade_assistant_v3_fixed') || 'null'); } catch (e) {}
        try { settings = JSON.parse(localStorage.getItem('clash_upgrade_settings') || '{}') || {}; } catch (e) {}
        return convertLegacyBackup({
            accounts: local && local.accounts,
            accountNotes: local && local.accountNotes,
            accountOrder: local && local.accountOrder,
            currentAccount: local && local.currentAccount,
            settings: settings,
            clans: getIntlClanTags()
        });
    }

    /** 新库为空时补初始化：优先内存 state，空则读本地旧结构转换 */
    async function ensureCloudInitialized() {
        const token = getToken();
        if (!token) return { success: false, error: '未登录' };
        const status = await getVersion();
        if (!status || !status.success || status.exists) return status || { success: false };
        const state = CocTool.state;
        let data = Object.keys(state.accounts || {}).length ? buildBackupData() : convertLegacyLocal();
        if (!data || !Object.keys(data.accounts || {}).length) return status;
        const init = await postBackup(data, 0);
        if (init && init.success) markRevision(init.revision);
        return init;
    }

    async function request(path, options) {
        const token = getToken();
        if (!token) return { success: false, error: '未登录' };
        const opts = options || {};
        const res = await fetch(`${CLOUD_API}${path}`, {
            method: opts.method || 'GET',
            headers: Object.assign({
                'Content-Type': 'application/json',
                'X-Auth-Token': token
            }, opts.headers || {}),
            body: opts.body
        });
        const json = await res.json().catch(function () { return {}; });
        if (res.status === 409) {
            return { success: false, conflict: true, revision: Number(json.revision) || 0 };
        }
        if (!res.ok) {
            return { success: false, error: json.error || ('HTTP ' + res.status) };
        }
        return json;
    }

    function getVersion() {
        return request('/backup/version', { method: 'GET' });
    }

    function getBackup() {
        return request('/backup', { method: 'GET' });
    }

    function postBackup(data, baseRevision) {
        return request('/backup', {
            method: 'POST',
            body: JSON.stringify({ baseRevision: baseRevision, data: data })
        });
    }

    function postAccountUnit(unit, baseRevision) {
        return request('/account', {
            method: 'POST',
            body: JSON.stringify(Object.assign({ baseRevision: baseRevision }, unit))
        });
    }

    function removeAccountCloud(tag, baseRevision) {
        return request(
            '/account?tag=' + encodeURIComponent(tag) + '&baseRevision=' + encodeURIComponent(baseRevision),
            { method: 'DELETE' }
        );
    }

    function pushServer(tag, server, baseRevision) {
        return request('/server', {
            method: 'POST',
            body: JSON.stringify({ baseRevision: baseRevision, tag: tag, server: server })
        });
    }

    CocTool.cloudSync = Object.freeze({
        CLOUD_API,
        TOKEN_KEY,
        PREF_FIELDS,
        getToken,
        syncedRevision,
        markRevision,
        buildAccountPrefs,
        buildAccountUnit,
        buildBackupData,
        convertLegacyBackup,
        convertLegacyLocal,
        ensureCloudInitialized,
        getVersion,
        getBackup,
        postBackup,
        postAccountUnit,
        removeAccountCloud,
        pushServer
    });
})(window);
