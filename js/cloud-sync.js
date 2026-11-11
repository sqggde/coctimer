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
const LEDGER_RESET_KEY = 'coc_cloud_ledger_reset_v2';   // 一次性账本重置标记（清旧版遗留虚高账本）
const REQUEST_TIMEOUT_MS = 15000;   // 单次请求超时；网络挂起不允许永久 pending
const MAX_ATTEMPTS = 3;            // 首次 + 2 次重试（仅网络/408/425/429/5xx）
const RETRY_BASE_MS = 600;

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

    function sleep(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    // 可重试状态：网络类瞬时故障（408 超时 / 425 / 429 限流 / 5xx）。429 优先用 Retry-After（秒或日期都按秒解析）
    function isRetryableStatus(status) {
        return status === 408 || status === 425 || status === 429 || status >= 500;
    }
    function retryDelayMs(attempt, retryAfter) {
        var ra = parseInt(retryAfter, 10);
        if (isFinite(ra) && ra > 0) return Math.min(ra * 1000, 5000);
        return RETRY_BASE_MS * (attempt + 1) * 2;   // 600ms → 2400ms
    }

    async function fetchOnce(path, options) {
        const token = getToken();
        const opts = options || {};
        const controller = new AbortController();
        const timer = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);
        try {
            const res = await fetch(`${CLOUD_API}${path}`, {
                method: opts.method || 'GET',
                headers: Object.assign({
                    'Content-Type': 'application/json',
                    'X-Auth-Token': token
                }, opts.headers || {}),
                body: opts.body,
                signal: controller.signal
            });
            const json = await res.json().catch(function () { return {}; });
            return {
                status: res.status,
                ok: res.ok,
                json: json,
                retryAfter: res.headers && res.headers.get ? res.headers.get('Retry-After') : null
            };
        } finally {
            clearTimeout(timer);
        }
    }

    // 统一请求：超时 + 网络/408/425/429/5xx 重试；4xx（除上述）与 409 直接返回由调用方处理
    async function request(path, options) {
        const token = getToken();
        if (!token) return { success: false, error: '未登录' };
        var lastError = null;
        for (var attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            try {
                const r = await fetchOnce(path, options);
                if (r.status === 409) {
                    return { success: false, conflict: true, revision: Number(r.json.revision) || 0 };
                }
                if (r.ok) return r.json;
                const errText = r.json.error || ('HTTP ' + r.status);
                if (isRetryableStatus(r.status) && attempt < MAX_ATTEMPTS - 1) {
                    lastError = errText;
                    await sleep(retryDelayMs(attempt, r.retryAfter));
                    continue;
                }
                return { success: false, error: errText, status: r.status };
            } catch (e) {
                lastError = e && e.name === 'AbortError' ? '网络超时' : ((e && e.message) || '网络错误');
                if (attempt < MAX_ATTEMPTS - 1) {
                    await sleep(RETRY_BASE_MS * (attempt + 1));
                    continue;
                }
                return { success: false, error: lastError, network: true };
            }
        }
        return { success: false, error: lastError || '网络错误', network: true };
    }

    function getVersion() {
        return request('/backup/version', { method: 'GET' });
    }

    function getBackup() {
        return request('/backup', { method: 'GET' });
    }

    async function postBackup(data, baseRevision) {
        var result = await request('/backup', {
            method: 'POST',
            body: JSON.stringify({ baseRevision: baseRevision, data: data })
        });
        // 409 自愈：线上若仍是旧版（按 baseRevision 条件写）→ 拉最新 revision 校准账本后重试一次。
        // 整包备份是「用户声明本地为最新」的权威覆写，重试安全（2026-11-08 口径）。
        if (result && result.conflict) {
            const status = await getVersion();
            if (status && status.success) markRevision(Number(status.revision) || 0);
            result = await request('/backup', {
                method: 'POST',
                body: JSON.stringify({ baseRevision: syncedRevision(), data: data })
            });
        }
        return result;
    }

    function postAccountUnit(unit, baseRevision) {
        return request('/account', {
            method: 'POST',
            body: JSON.stringify(Object.assign({ baseRevision: baseRevision }, unit))
        });
    }

    /** 账号单元上传 + 云端权威收敛（2026-11-07）：
     *  成功回执的 revision 含本地未见过的云端变更，一律不 markRevision——回写会让账本虚高：
     *  启动校核不再拉取（第三方数据永远进不来）、手动整包备份 CAS 基线失真误覆盖云端。
     *  回执高于「本地应有的下一版」＝上传前云端有本地没见过的变更（第三方导入/其他设备）
     *  → 整包拉取交 onCloudSnapshot(data, revision) 应用（其内部 markRevision 跟拉取走）；
     *  拉取失败账本留旧值，由启动校核兜底。
     *  返回 { ...回执, pulled: 是否已整包应用, pullFailed: 拉取过但内容不可用 } */
    async function postAccountUnitSyncedRun(unit, onCloudSnapshot) {
        const baseRevision = syncedRevision();
        var result = await postAccountUnit(unit, baseRevision);
        // 409 自愈：服务端 /account 是「读最新 → 合并 → 条件写」语义，重试安全（最多 2 次短退避）
        var retried = 0;
        while (result && result.conflict && retried < 2) {
            retried++;
            await sleep(400 * retried);
            result = await postAccountUnit(unit, syncedRevision());
        }
        if (!result || !result.success) return result;
        const acked = Number(result.revision) || 0;
        const expected = baseRevision + (result.changed !== false ? 1 : 0);
        // skipped = 云端该账号更新、本地导入被 timestamp 防回退拒绝 → 必须拉整包让云端权威校正本地
        const skipped = result.accountResult === 'skipped';
        if ((acked > expected || skipped) && onCloudSnapshot) {
            const full = await getBackup();
            if (full && full.success && full.data && Object.keys(full.data.accounts || {}).length) {
                await onCloudSnapshot(full.data, full.revision);
                return Object.assign({}, result, { pulled: true });
            }
            return Object.assign({}, result, { pulled: false, pullFailed: true });
        }
        // 账本纪律：回执高于本地应有版本却没有整包应用回调 → 不推进账本（否则账本虚高、版本号相同内容不一致）
        if (acked > expected) return Object.assign({}, result, { pulled: false, needPull: true });
        markRevision(acked);
        return Object.assign({}, result, { pulled: false });
    }

    // 在途上传队列（单飞）：恢复整包前等整条队列落地，否则会把还没合并进云端的本地写入盖掉
    // （恢复与上传并发竞态）；并发上传也串行化，避免 lastUploadPromise 只记最后一个导致互相踩。
    var lastUploadPromise = null;
    var uploadChain = Promise.resolve();

    function postAccountUnitSynced(unit, onCloudSnapshot) {
        const run = uploadChain.then(function () {
            return postAccountUnitSyncedRun(unit, onCloudSnapshot);
        });
        uploadChain = run.catch(function () {});
        lastUploadPromise = run;
        run.then(function () { if (lastUploadPromise === run) lastUploadPromise = null; });
        return run;
    }

    /** 恢复流程等在途上传落地（≤10s）：整包须含刚导入还没合并进云端的数据，也避免恢复先写、回执后到的账本互踩 */
    async function awaitSettledUpload() {
        if (!lastUploadPromise) return;
        try { await Promise.race([uploadChain, new Promise(function (r) { setTimeout(r, 10000); })]); } catch (e) {}
    }

    async function removeAccountCloud(tag, baseRevision) {
        var result = await request(
            '/account?tag=' + encodeURIComponent(tag) + '&baseRevision=' + encodeURIComponent(baseRevision),
            { method: 'DELETE' }
        );
        // 409 自愈：拉最新 revision 校准账本后重试一次（单删是幂等操作）
        if (result && result.conflict) {
            const status = await getVersion();
            if (status && status.success) markRevision(Number(status.revision) || 0);
            result = await request(
                '/account?tag=' + encodeURIComponent(tag) + '&baseRevision=' + encodeURIComponent(syncedRevision()),
                { method: 'DELETE' }
            );
        }
        return result;
    }

    async function pushServer(tag, server, baseRevision) {
        var result = await request('/server', {
            method: 'POST',
            body: JSON.stringify({ baseRevision: baseRevision, tag: tag, server: server })
        });
        // 409 自愈：拉最新 revision 校准账本后重试一次（补区服是幂等操作）
        if (result && result.conflict) {
            const status = await getVersion();
            if (status && status.success) markRevision(Number(status.revision) || 0);
            result = await request('/server', {
                method: 'POST',
                body: JSON.stringify({ baseRevision: syncedRevision(), tag: tag, server: server })
            });
        }
        return result;
    }

    // 一次性账本迁移（2026-11-11）：旧版客户端可能留下「没实际拉取就推进」的虚高账本，
    // 会让「回执只差 1 → 不拉整包」的增量假设失效（表现为账本版本号 = 云端、内容却不一致）。
    // 清一次账本，交给本轮启动的「先备份再恢复」流程按云端最新版本重建。
    (function migrateLedgerOnce() {
        try {
            if (localStorage.getItem(LEDGER_RESET_KEY) === '1') return;
            localStorage.removeItem(SYNCED_REVISION_KEY);
            localStorage.setItem(LEDGER_RESET_KEY, '1');
        } catch (e) {}
    })();

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
        postAccountUnitSynced,
        awaitSettledUpload,
        removeAccountCloud,
        pushServer
    });
})(window);
