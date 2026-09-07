(function (global) {
    'use strict';

    const CocTool = global.CocTool;
    if (!CocTool || !CocTool.state || !CocTool.storage) {
        throw new Error('services.js requires core.js');
    }

    const state = CocTool.state;
    const settings = state.settings;
    const accounts = state.accounts;
    const accountNotes = state.accountNotes;
    const accountOrder = state.accountOrder;
    const { STORAGE_KEY, SETTINGS_KEY } = CocTool.storage;
    const advanceNotifyBtn = document.getElementById('advance-notify-btn');
    const advancePickerModal = document.getElementById('advance-picker-modal');
    const advancePickerCloseBtn = document.getElementById('advance-picker-close-btn');
    let initialized = false;
    let updateTimer = null;
    var autoCloudBackupRef = null;        // init() 内赋值（自动备份函数在 init 作用域，供 accounts.js 导入成功后调用）
    var maybeAutoRestoreRef = null;       // init() 内赋值（自动恢复检测在 init 作用域，供外部手动触发/测试）
    var webdavUploadRef = null;           // init() 内赋值（WebDAV 统一上传核心在 init 作用域，供模块级 autoWebdavUpload 委托）
    var maybeWebdavAutoRestoreRef = null; // init() 内赋值（WebDAV 自动恢复检测在 init 作用域，供外部手动触发/测试）
    var refreshCloudAutoBackupUiRef = null;
    const calc = CocTool.calc;

    function progress() { return CocTool.features.progress; }
    function settingsModule() { return CocTool.features.settings; }
    function saveSettings() { return CocTool.storage.saveSettings(); }
    function showToast(message, duration) { CocTool.ui.showToast(message, duration); }
    function applySettings() {
        const module = settingsModule();
        if (module) module.apply();
    }
    function extractUpgradingItems(...args) { return calc.extractUpgradingItems(...args); }
    function calculateCompletionTimestamp(...args) { return calc.calculateCompletionTimestamp(...args); }
    function getItemName(...args) { return calc.getItemName(...args); }
    function hasRecurrentItem(...args) { return calc.hasRecurrentItem(...args); }
    function filterDismissedCategories(...args) { return calc.filterDismissedCategories(...args); }
    function updateTimersOnly() { var p = progress(); if (p) p.tick(); }

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

    // ========== 通知监控模块 ==========
    var notificationMonitor = (function() {
        var LOG_KEY = 'clash_notification_log';
        var MERGE_KEY_STORAGE = 'clash_notification_merge';
        var MAX_MEM = 2000;
        var MAX_DISK = 1000;
        var logs = [];
        var idSeq = 0;
        var persistTimer = null;
        var lastMerge = Object.create(null);

        function load() {
            try {
                var raw = localStorage.getItem(LOG_KEY);
                if (raw) {
                    var parsed = JSON.parse(raw);
                    // 过滤旧版本残留（旧条目只有 action 字段，无 type）
                    logs = parsed.filter(function(e) { return e && e.type && typeof e.ts === 'number'; });
                    idSeq = logs.length;
                }
                // 恢复会话级去重表（跨重启）：App 重启后相同条目（如重启全量清单）不再重放
                var mergeRaw = localStorage.getItem(MERGE_KEY_STORAGE);
                if (mergeRaw) {
                    var keys = JSON.parse(mergeRaw);
                    for (var i = 0; i < keys.length; i++) lastMerge[keys[i]] = Date.now();
                }
            } catch(e) {}
        }
        function persist() {
            var slice = logs.slice(-MAX_DISK);
            try { localStorage.setItem(LOG_KEY, JSON.stringify(slice)); } catch(e) {}
        }
        function persistMergeKeys() {
            try { localStorage.setItem(MERGE_KEY_STORAGE, JSON.stringify(Object.keys(lastMerge))); } catch(e) {}
        }
        function schedulePersist() {
            if (persistTimer) clearTimeout(persistTimer);
            persistTimer = setTimeout(function() {
                persist();
                persistMergeKeys();
            }, 3000);
        }
        function fmtTime(ts) {
            var d = new Date(ts);
            return String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' ' +
                   String(d.getHours()).padStart(2, '0') + ':' +
                   String(d.getMinutes()).padStart(2, '0') + ':' +
                   String(d.getSeconds()).padStart(2, '0');
        }
        function formatMeta(meta) {
            if (!meta) return '';
            var keys = Object.keys(meta);
            if (!keys.length) return '';
            var parts = [];
            for (var i = 0; i < keys.length; i++) {
                parts.push(keys[i] + ': ' + meta[keys[i]]);
            }
            return '  [' + parts.join(', ') + ']';
        }
        function formatGroup(g) {
            var lines = [];
            var headTs = fmtTime(g.ts);
            if (g.type === '调度') {
                if (g.account) {
                    lines.push('[' + headTs + '] [调度] 注册闹钟: ' + g.account);
                    for (var i = 0; i < g.items.length; i++) {
                        lines.push('    ' + g.items[i].detail + formatMeta(g.items[i].meta));
                    }
                } else {
                    // 空账号调度组：摘要/诊断行逐条显示（含 Java 回传的取消/轮次/触发行）
                    for (var k = 0; k < g.items.length; k++) {
                        lines.push('[' + headTs + '] [调度] ' + g.items[k].detail);
                    }
                }
            } else if (g.type === '导入') {
                lines.push('[' + headTs + '] [导入] ' + (g.account || '') + ' ' + (g.items[0] ? g.items[0].detail : ''));
                if (g.items[0] && g.items[0].meta) {
                    lines.push('    timestamp: ' + g.items[0].meta.timestamp + ' | boosts: ' + g.items[0].meta.boosts);
                }
            } else if (g.type === 'skip') {
                lines.push('[' + headTs + '] [skip] ' + (g.account || '') + ' ' + (g.items[0] ? g.items[0].detail : ''));
            } else if (g.type === '通知') {
                lines.push('[' + headTs + '] [通知] ' + (g.account || '') + ' ' + (g.items[0] ? g.items[0].detail : ''));
            } else {
                lines.push('[' + headTs + '] [' + g.type + '] ' + (g.account ? g.account + ' ' : '') + (g.items[0] ? g.items[0].detail : ''));
            }
            return lines.join('\n');
        }

        load();

        return {
            log: function(type, detail, opts) {
                opts = opts || {};
                var account = opts.account || '';
                var now = Date.now();
                // 条目去重键排除 timer（剩余毫秒每次 build 都变）：timer 变化不刷屏，完成时刻变化（detail）仍可见
                var metaForKey = null;
                if (opts.meta) {
                    metaForKey = {};
                    for (var mk in opts.meta) if (mk !== 'timer') metaForKey[mk] = opts.meta[mk];
                }
                var mergeKey = account + '|' + type + '|' + (detail || '') + '|' + JSON.stringify(metaForKey);
                // 会话级去重：同内容（数据未变的重调度）不再记录；summarize 摘要行总是记录；Java 回传诊断行（noMerge）不参与去重
                if (!opts.summarize && !opts.noMerge) {
                    if (lastMerge[mergeKey]) {
                        lastMerge[mergeKey] = now;
                        return;
                    }
                    lastMerge[mergeKey] = now;
                }
                var entry = { id: ++idSeq, ts: now, type: type, detail: detail || '' };
                if (account) entry.account = account;
                if (opts.meta) entry.meta = opts.meta;
                logs.push(entry);
                if (logs.length > MAX_MEM) logs.shift();
                schedulePersist();
            },
            getLogs: function() { return logs.slice(-MAX_DISK); },
            getGroupedLogs: function() {
                // 正序：从旧到新；调度组收集时跳过中间同账号的 skip/通知（不中断分组），跳过条目随后独立显示
                var groups = [];
                var i = 0;
                while (i < logs.length) {
                    var e = logs[i];
                    if (e.type === '调度' || e.type === '导入') {
                        var account = e.account || '';
                        var items = [];
                        var skipped = [];
                        var j = i;
                        while (j < logs.length) {
                            var x = logs[j];
                            if (x.type === e.type) {
                                if ((x.account || '') !== account) break;
                                items.push(x);
                                j++;
                            } else if (e.type === '调度' && (x.type === 'skip' || x.type === '通知') && (x.account || '') === account) {
                                skipped.push(x);
                                j++;
                            } else {
                                break;
                            }
                        }
                        groups.push({ type: e.type, account: account, items: items, ts: items[0].ts });
                        for (var s = 0; s < skipped.length; s++) {
                            groups.push({ type: skipped[s].type, account: skipped[s].account || '', items: [skipped[s]], ts: skipped[s].ts });
                        }
                        i = j;
                    } else {
                        groups.push({ type: e.type, account: e.account || '', items: [e], ts: e.ts });
                        i++;
                    }
                }
                return groups;
            },
            clear: function() {
                logs = [];
                idSeq = 0;
                lastMerge = Object.create(null);
                try { localStorage.removeItem(LOG_KEY); } catch(e) {}
                try { localStorage.removeItem(MERGE_KEY_STORAGE); } catch(e) {}
            },
            export: function() {
                var groups = this.getGroupedLogs();
                var version = '';
                try {
                    if (window.AndroidApp && typeof window.AndroidApp.getVersionName === 'function') {
                        version = ' | 版本: v' + window.AndroidApp.getVersionName();
                        if (typeof window.AndroidApp.getVersionCode === 'function') {
                            version += ' (' + window.AndroidApp.getVersionCode() + ')';
                        }
                    }
                } catch(e) {}
                var text = '===== 通知运行日志 =====\n导出时间: ' + new Date().toLocaleString('zh-CN') + version + '\n条目数: ' + logs.length + '\n==============================\n\n';
                for (var i = 0; i < groups.length; i++) {
                    text += formatGroup(groups[i]) + '\n\n';
                }
                if (window.AndroidApp) window.AndroidApp.exportLogToFile(text);
            }
        };
    })();

    function parseJavaLog(detail) {
        // 注册闹钟由 JS 侧 buildNotificationSchedule 埋点记录（带 meta 更完整），忽略 Java 回传避免重复
        if (detail.indexOf('注册闹钟: ') === 0) return null;
        var prefixes = {
            '跳过(已发)': { type: 'skip', suffix: '' },
            '闹钟跳过': { type: 'skip', suffix: '（闹钟）' },
            '精确触发': { type: '通知', suffix: '（精确）' },
            '立即发送(已过期)': { type: '通知', suffix: '（补发）' },
            '闹钟推送': { type: '通知', suffix: '（闹钟）' },
            '推送成功': { type: '通知', suffix: '（服务）' },
            '闹钟触发': { type: '调度', suffix: '', raw: true },
            '残留闹钟拦截': { type: '调度', suffix: '', raw: true },
            '注册轮次': { type: '调度', suffix: '', raw: true }
        };
        for (var p in prefixes) {
            if (detail.indexOf(p) === 0) {
                var sepIdx = detail.indexOf(': ');
                var rest = sepIdx >= 0 ? detail.slice(sepIdx + 2) : detail.slice(p.length);
                if (prefixes[p].raw) return { type: prefixes[p].type, account: '', detail: rest };
                var nl = rest.indexOf('\n');
                var account = '';
                var content = rest;
                if (nl > 0) { account = rest.slice(0, nl); content = rest.slice(nl + 1); }
                return { type: prefixes[p].type, account: account, detail: content + prefixes[p].suffix };
            }
        }
        return { type: '服务', account: '', detail: detail };
    }

    function serviceLog(type, detail) {
        var parsed = parseJavaLog(detail);
        if (!parsed) return;
        // 只有"跳过(已发)"是轮次内的静态检查结果（同任务每次轮次相同），保留会话级去重防刷屏；
        // 其余回传行（触发/推送/拦截/轮次/补发）是实时事件，总是记录
        var keepMerged = detail.indexOf('跳过(已发): ') === 0;
        notificationMonitor.log(parsed.type, parsed.detail, { account: parsed.account, noMerge: !keepMerged });
    }

    // ========== Android 通知功能 ==========
    function applyAdvance(time, threshold, now) {
        if (threshold <= 0) return time;
        const adv = time - threshold;
        return adv > now ? adv : time;
    }
    function helperNotification(helpers, dataIds, categories, label, data, now, threshold, schedule, accountName) {
        const h = helpers.find(h => dataIds.includes(h.data));
        if (!h) return;
        if (hasRecurrentItem(data, categories)) { notificationMonitor.log('skip', label + ' 持续指派中', { account: accountName }); return; }
        const cooldown = h.helper_cooldown || 0;
        if (cooldown <= 0) {
            // 已就绪：不生成通知，仅记录日志
            notificationMonitor.log('skip', label + ' 已就绪', { account: accountName });
            return;
        }
        const ts = (data.timestamp || now) + cooldown;
        if (ts > now) {
            schedule.push({ timestamp: applyAdvance(ts, threshold, now), message: `${accountName}\n${label} 已就绪`, id: accountName + '_' + label, type: 'other' });
            notificationMonitor.log('调度', label + ' 已就绪 于 ' + fmtClock(applyAdvance(ts, threshold, now)), { account: accountName, meta: { helper_cooldown: cooldown } });
        }
        // ts <= now（快照过期，实际已就绪）→ 不通知
    }
    function fmtClock(sec) {
        var d = new Date(sec * 1000);
        return String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' ' +
               String(d.getHours()).padStart(2, '0') + ':' +
               String(d.getMinutes()).padStart(2, '0') + ':' +
               String(d.getSeconds()).padStart(2, '0');
    }
    function addWarNotification(tsMs, msg, id, nowMs, schedule) {
        if (tsMs > nowMs) {
            schedule.push({ timestamp: Math.floor(tsMs / 1000), message: msg, id: id, type: 'other' });
            var nl = msg.indexOf('\n');
            notificationMonitor.log('调度', (nl > 0 ? msg.slice(nl + 1) : msg) + ' 于 ' + fmtClock(Math.floor(tsMs / 1000)), { account: nl > 0 ? msg.slice(0, nl) : '' });
        }
    }
    function pushInternationalWarNotifications(now, schedule) {
        const HOUR_MS = 3600000;
        function parseCocTime(str) {
            if (!str) return 0;
            return new Date(str.slice(0,4)+'-'+str.slice(4,6)+'-'+str.slice(6,8)+'T'+str.slice(9,11)+':'+str.slice(11,13)+':'+str.slice(13,15)+'.'+str.slice(16,19)+'Z').getTime();
        }
        try {
            const raw = localStorage.getItem('clash_clan_list');
            if (!raw) return;
            const list = JSON.parse(raw);
            for (const clan of list) {
                const tag = clan.tag;
                const name = clan.name || tag;
                const warRaw = localStorage.getItem('clash_war_' + tag.replace(/^#/, ''));
                if (!warRaw) continue;
                const cache = JSON.parse(warRaw);
                const war = cache.data;
                if (!war || !war.endTime) continue;
                if (war.state !== 'inWar' && war.state !== 'preparation') continue;
                const endMs = parseCocTime(war.endTime);
                const startMs = parseCocTime(war.startTime);
                const nowMs = now * 1000;
                const warKey = tag + '_' + war.endTime;
                if (war.state === 'preparation') {
                    addWarNotification(startMs, name + '\n战斗日已开始', warKey + '_warstart', nowMs, schedule);
                    addWarNotification(endMs - 4 * HOUR_MS, name + '\n战斗日还有4小时结束', warKey + '_war4h', nowMs, schedule);
                    addWarNotification(endMs - HOUR_MS, name + '\n战斗日将在1小时后结束', warKey + '_war1h', nowMs, schedule);
                    addWarNotification(endMs, name + '\n部落对战已结束', warKey + '_warend', nowMs, schedule);
                } else if (war.state === 'inWar') {
                    addWarNotification(endMs - 4 * HOUR_MS, name + '\n战斗日还有4小时结束', warKey + '_war4h', nowMs, schedule);
                    addWarNotification(endMs - HOUR_MS, name + '\n战斗日将在1小时后结束', warKey + '_war1h', nowMs, schedule);
                    addWarNotification(endMs, name + '\n部落对战已结束', warKey + '_warend', nowMs, schedule);
                }
            }
        } catch(e) { /* international war notification error */ }
    }
    function pushChinaWarNotifications(now, schedule) {
        const HOUR_MS = 3600000;
        try {
            const raw = localStorage.getItem('clash_china_clan_list');
            if (!raw) return;
            const list = JSON.parse(raw);
            for (const clan of list) {
                const name = clan.name || clan.id;
                const warRaw = localStorage.getItem('china_war_state_' + clan.id);
                if (!warRaw) continue;
                const war = JSON.parse(warRaw);
                if (!war.endTime) continue;
                const endMs = war.endTime;
                const nowMs = now * 1000;
                const warKey = clan.id + '_' + war.endTime;
                if (war.state === 'preparation') {
                    addWarNotification(endMs, name + '\n战斗日已开始', warKey + '_warstart', nowMs, schedule);
                    const assumedWarEnd = endMs + 24 * HOUR_MS;
                    addWarNotification(assumedWarEnd - 4 * HOUR_MS, name + '\n战斗日还有4小时结束', warKey + '_war4h', nowMs, schedule);
                    addWarNotification(assumedWarEnd - HOUR_MS, name + '\n战斗日将在1小时后结束', warKey + '_war1h', nowMs, schedule);
                    addWarNotification(assumedWarEnd, name + '\n部落对战已结束', warKey + '_warend', nowMs, schedule);
                } else if (war.state === 'inWar') {
                    addWarNotification(endMs - 4 * HOUR_MS, name + '\n战斗日还有4小时结束', warKey + '_war4h', nowMs, schedule);
                    addWarNotification(endMs - HOUR_MS, name + '\n战斗日将在1小时后结束', warKey + '_war1h', nowMs, schedule);
                    addWarNotification(endMs, name + '\n部落对战已结束', warKey + '_warend', nowMs, schedule);
                }
            }
        } catch(e) { /* china war notification error */ }
    }
    // ========== 联赛提醒（24h 规律推算，与卡片/缓存同源） ==========
    const LEAGUE_CN_NUM = ['第一', '第二', '第三', '第四', '第五', '第六', '第七'];
    function readLeagueWarRaw(warTag) {
        try {
            const raw = localStorage.getItem('clash_league_war_' + warTag.replace(/^#/, ''));
            if (!raw) return null;
            return JSON.parse(raw).data;
        } catch (e) { return null; }
    }
    function parseLeagueCocTime(str) {
        if (!str) return 0;
        return new Date(str.slice(0,4)+'-'+str.slice(4,6)+'-'+str.slice(6,8)+'T'+str.slice(9,11)+':'+str.slice(11,13)+':'+str.slice(13,15)+'.'+str.slice(16,19)+'Z').getTime();
    }
    function pushLeagueNotifications(now, schedule) {
        const HOUR_MS = 3600000;
        try {
            const raw = localStorage.getItem('clash_clan_list');
            if (!raw) return;
            const list = JSON.parse(raw);
            for (const clan of list) {
                const tag = clan.tag;
                const name = clan.name || tag;
                const cleanTag = tag.replace(/^#/, '');
                let gRaw = null;
                try { gRaw = localStorage.getItem('clash_league_' + cleanTag); } catch (e) {}
                if (!gRaw) continue;
                const group = JSON.parse(gRaw).data;
                if (!group || !group.rounds || !group.season) continue;
                let L = -1;
                for (let i = 6; i >= 0; i--) {
                    const tags = (group.rounds[i] && group.rounds[i].warTags) || [];
                    if (tags.some(t => t && t !== '#0' && t.indexOf('#') === 0)) { L = i; break; }
                }
                if (L < 0) continue;
                // 锚轮 A = 最后解锁轮 L 优先（真实 startTime/endTime），L 无缓存时往前找最近有缓存的轮
                let mineMap = {};
                try { mineMap = JSON.parse(localStorage.getItem('clash_league_mine_' + cleanTag) || '{}'); } catch (e) {}
                let A = -1, war = null;
                for (let i = L; i >= 0; i--) {
                    const tags = (group.rounds[i] && group.rounds[i].warTags) || [];
                    if (!tags.some(t => t && t !== '#0' && t.indexOf('#') === 0)) continue;
                    const mineTag = mineMap[i];
                    let w = mineTag ? readLeagueWarRaw(mineTag) : null;
                    if (!w) {
                        for (let j = 0; j < tags.length; j++) { w = readLeagueWarRaw(tags[j]); if (w) break; }
                    }
                    if (w && w.startTime && w.endTime) { A = i; war = w; break; }
                }
                if (A < 0 || !war) continue;
                const startKA = parseLeagueCocTime(war.startTime);
                const endKA = parseLeagueCocTime(war.endTime);
                if (!endKA || endKA <= 0) continue;
                const DAY = 24 * 3600 * 1000;
                // L 轮边界：A === L 用真实值；A < L 用 endTime 链式反推（官方 endTime_n = startTime_{n+1}）
                let startL = startKA, endL = endKA;
                if (A < L) {
                    startL = endKA + (L - A - 1) * DAY;
                    endL = endKA + (L - A) * DAY;
                }
                const nowMs = now * 1000;
                const key = cleanTag + '_' + group.season;
                // 从 L 轮（L+1，1-based）起：L 轮用真实/推算边界，后续轮 endL 链式反推
                for (let n = L + 1; n <= 7; n++) {
                    const cn = LEAGUE_CN_NUM[n - 1];
                    const t = n === L + 1
                        ? { start: startL, end: endL }
                        : { start: endL + (n - L - 2) * DAY, end: endL + (n - L - 1) * DAY };
                    addWarNotification(t.start, name + '\n联赛·' + cn + '场对战已开始', key + '_l' + n + '_start', nowMs, schedule);
                    addWarNotification(t.end - 4 * HOUR_MS, name + '\n联赛·' + cn + '场对战将于4小时后结束', key + '_l' + n + '_4h', nowMs, schedule);
                    addWarNotification(t.end - HOUR_MS, name + '\n联赛·' + cn + '场对战将于1小时后结束', key + '_l' + n + '_1h', nowMs, schedule);
                }
                // 结束通知：仅第 7 场结束时
                const end7 = endL + (7 - L - 1) * DAY;
                addWarNotification(end7, name + '\n联赛已结束', key + '_leagueend', nowMs, schedule);
            }
        } catch(e) { /* league notification error */ }
    }
    function buildNotificationSchedule() {
        const now = Math.floor(Date.now() / 1000);
        const schedule = [];
        const advanceThreshold = settings.advanceNotify ? settings.advanceNotifyTime : 0;
        for (const tag of accountOrder) {
            const data = accounts[tag];
            if (!data) continue;
            // 按账号类目屏蔽过滤：被屏蔽分类不推送升级完成通知
            const items = filterDismissedCategories(extractUpgradingItems(data, now, true), tag);
            const accountName = accountNotes[tag] || tag;
            const helpers = data.helpers || [];
            const boosts = data.boosts || {};
            const timestamp = data.timestamp || now;

            // 建筑完成通知
            if (settings.notifyBuilding) {
                for (const item of items) {
                    const completionTs = calculateCompletionTimestamp(item, data);
                    const name = getItemName(item.data);
                    if (completionTs > now) {
                        var msg;
                        if (item.supercharge !== undefined) {
                            msg = accountName + '\n' + name + ' 充能·等级' + (item.supercharge + 1) + '完成';
                        } else if (calc.isMultiStageWeapon(item)) {
                            msg = accountName + '\n' + name + ' 武器·等级' + (item.weapon + 1) + '完成';
                        } else if (item.gear_up === 0) {
                            msg = accountName + '\n' + name + ' 改装完成';
                        } else {
                            msg = accountName + '\n' + name + ' 已升级为 ' + (item.lvl + 1) + '级';
                        }
                        // 第三行追加备忘（仅当该项目有备忘）
                        const note = CocTool.features.progress && CocTool.features.progress.getNoteForItem
                            ? CocTool.features.progress.getNoteForItem(tag, item, data)
                            : '';
                        if (note) msg += '\n' + note;
                        schedule.push({ timestamp: applyAdvance(completionTs, advanceThreshold, now), message: msg, id: item.uniqueId, type: 'upgrade' });
                        var itemMeta = { timer: item.timer };
                        if (item.helper_timer && item.helper_timer > 0) itemMeta.helper_timer = item.helper_timer;
                        if (item.helper_recurrent === true) itemMeta.recurrent = true;
                        notificationMonitor.log('调度', msg.slice(msg.indexOf('\n') + 1) + ' 于 ' + fmtClock(applyAdvance(completionTs, advanceThreshold, now)), { account: accountName, meta: itemMeta });
                    }
                }
            }

            // 助手冷却完成通知
            if (settings.notifyHelper) {
                helperNotification(helpers, [124000000, 93000000], ["buildings", "heroes", "traps", "guardians"], "工人助手", data, now, advanceThreshold, schedule, accountName);
                helperNotification(helpers, [124000001, 93000001], ["units", "siege_machines", "spells"], "实验室助手", data, now, advanceThreshold, schedule, accountName);
            }

            // 钟楼冷却完成通知
            if (settings.notifyClocktower) {
                const clockCooldown = boosts.clocktower_cooldown;
                if (!clockCooldown || clockCooldown <= 0) {
                    // 已就绪：不生成通知，仅记录日志
                    notificationMonitor.log('skip', '时光钟楼 已就绪', { account: accountName });
                } else {
                    const cooldownEnd = timestamp + clockCooldown;
                    if (cooldownEnd > now) {
                        schedule.push({ timestamp: applyAdvance(cooldownEnd, advanceThreshold, now), message: `${accountName}\n时光钟楼 已就绪`, id: accountName + '_clocktower', type: 'other' });
                        notificationMonitor.log('调度', '时光钟楼 已就绪 于 ' + fmtClock(applyAdvance(cooldownEnd, advanceThreshold, now)), { account: accountName });
                    }
                    // cooldownEnd <= now（快照过期，实际已就绪）→ 不通知
                }
            }
        }
        // 部落战提醒
        if (settings.notifyClanwar !== false) {
            pushInternationalWarNotifications(now, schedule);
            pushChinaWarNotifications(now, schedule);
        }
        // 联赛提醒
        if (settings.notifyLeague !== false) {
            pushLeagueNotifications(now, schedule);
        }
        // 调度摘要行（总是记录，便于确认每次调度发生；条目级详情由会话级去重控制）
        notificationMonitor.log('调度', '重建调度: ' + accountOrder.length + '个账号 ' + schedule.length + '条', { summarize: true });
        return JSON.stringify(schedule);
    }

    function pushSchedule() {
        // 守卫检查方法存在（网页版 shim 桩无 setNotificationSchedule）
        if (window.AndroidApp && window.AndroidApp.setNotificationSchedule) {
            var json = buildNotificationSchedule();
            window.AndroidApp.setNotificationSchedule(json);
        }
        // 更新前台通知统计信息（每次调度重建时同步更新）
        if (typeof CocTool.updateForegroundNotificationFromCalc === 'function') {
            CocTool.updateForegroundNotificationFromCalc();
        }
        // 更新重调度节流时间戳：导入等流程直接调 pushSchedule 时，避免下一秒的 5 分钟 tick 再次重复推送
        lastReschedule = Date.now();
    }

    var lastReschedule = 0;

    function startBackgroundCheck() {
        if (updateTimer) { clearInterval(updateTimer); updateTimer = null; }
        notificationMonitor.log('服务', '启动后台检测');
        // 守卫检查方法存在（网页版 shim 桩无 startBackgroundService）
        if (window.AndroidApp && window.AndroidApp.startBackgroundService) window.AndroidApp.startBackgroundService();
        lastReschedule = Date.now();
        try { pushSchedule(); } catch (e) { notificationMonitor.log('错误', `pushSchedule: ${e.message}`); }
        updateTimer = setInterval(() => {
            try {
                updateTimersOnly();
                if (Date.now() - lastReschedule > 300000) {
                    lastReschedule = Date.now();
                    try { pushSchedule(); } catch (e) { notificationMonitor.log('错误', `重调度: ${e.message}`); }
                }
            } catch (e) { notificationMonitor.log('错误', `循环: ${e.message}`); }
        }, 1000);
    }

    function stopBackgroundCheck() {
        notificationMonitor.log('服务', '停止后台检测');
        if (updateTimer) { clearInterval(updateTimer); updateTimer = null; }
        if (window.AndroidApp && window.AndroidApp.stopBackgroundService) window.AndroidApp.stopBackgroundService();
    }

    function pauseTicker() {
        if (!updateTimer) return;
        clearInterval(updateTimer);
        updateTimer = null;
    }

    function resumeTicker() {
        if (updateTimer) return;
        updateTimer = setInterval(() => {
            try {
                updateTimersOnly();
            } catch (error) {
                notificationMonitor.log('错误', `循环: ${error.message}`);
            }
        }, 1000);
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

        // 通知设置
        const notifyModal = document.getElementById('notify-modal');
        const notifyCloseBtn = document.getElementById('notify-close-btn');
        const notifyBuildingToggle = document.getElementById('notify-building-toggle');
        const notifyHelperToggle = document.getElementById('notify-helper-toggle');
        const notifyClocktowerToggle = document.getElementById('notify-clocktower-toggle');
        const notifyClanwarToggle = document.getElementById('notify-clanwar-toggle');
        const notifyLeagueToggle = document.getElementById('notify-league-toggle');

        notifyCloseBtn.addEventListener('click', () => { notifyModal.classList.add('hidden'); });
        notifyModal.addEventListener('click', (e) => { if (e.target === notifyModal) notifyModal.classList.add('hidden'); });

        notifyBuildingToggle.addEventListener('change', () => {
            settings.notifyBuilding = notifyBuildingToggle.checked;
            saveSettings();
            if (window.AndroidApp) pushSchedule();
        });
        notifyHelperToggle.addEventListener('change', () => {
            settings.notifyHelper = notifyHelperToggle.checked;
            saveSettings();
            if (window.AndroidApp) pushSchedule();
        });
        notifyClocktowerToggle.addEventListener('change', () => {
            settings.notifyClocktower = notifyClocktowerToggle.checked;
            saveSettings();
            if (window.AndroidApp) pushSchedule();
        });
        notifyClanwarToggle.addEventListener('change', () => {
            settings.notifyClanwar = notifyClanwarToggle.checked;
            saveSettings();
            if (window.AndroidApp) pushSchedule();
        });
        if (notifyLeagueToggle) notifyLeagueToggle.addEventListener('change', () => {
            settings.notifyLeague = notifyLeagueToggle.checked;
            saveSettings();
            if (window.AndroidApp) pushSchedule();
        });

        // 提前通知（在通知设置弹窗内）
        advanceNotifyBtn.addEventListener('click', () => {
            if (settings.advanceNotify) {
                settings.advanceNotify = false;
                saveSettings();
                applySettings();
                pushSchedule();
            } else {
                advancePickerModal.classList.remove('hidden');
            }
        });
        document.getElementById('notify-settings-btn').addEventListener('click', () => {
            // 也刷新提前通知按钮状态
            advanceNotifyBtn.className = settings.advanceNotify
                ? 'px-3 py-1 rounded-lg transition-all duration-200 text-xs bg-blue-500 text-white'
                : 'px-3 py-1 rounded-lg transition-all duration-200 text-xs bg-gray-300 text-gray-500';
            advanceNotifyBtn.textContent = settings.advanceNotify ? '开启' : '关闭';
            notifyBuildingToggle.checked = settings.notifyBuilding;
            notifyHelperToggle.checked = settings.notifyHelper;
            notifyClocktowerToggle.checked = settings.notifyClocktower;
            if (notifyClanwarToggle) notifyClanwarToggle.checked = settings.notifyClanwar !== false;
            if (notifyLeagueToggle) notifyLeagueToggle.checked = settings.notifyLeague !== false;
            notifyModal.classList.remove('hidden');
        });
        // 导出备份
        document.getElementById('export-backup-btn').addEventListener('click', () => {
            const btn = document.getElementById('export-backup-btn');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i>导出中...';
            setTimeout(() => {
                const backup = {
                    version: 1,
                    exportDate: new Date().toISOString(),
                    data: {
                        accounts,
                        accountNotes,
                        accountOrder,
                        currentAccount: state.currentAccount
                    },
                    settings: { ...settings }
                };
                const jsonStr = JSON.stringify(backup, null, 2);
                if (window.AndroidApp && window.AndroidApp.exportBackupToFile) {
                    window.AndroidApp.exportBackupToFile(jsonStr);
                } else {
                    const blob = new Blob([jsonStr], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    const dateStr = new Date().toISOString().slice(0, 10);
                    a.download = `coc_backup_${dateStr}.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    showToast('备份已导出', 1500);
                }
                btn.disabled = false;
                btn.innerHTML = '导出备份';
            }, 100);
        });
        // 导入备份
        document.getElementById('import-backup-btn').addEventListener('click', () => {
            document.getElementById('backup-file-input').click();
        });
        document.getElementById('backup-file-input').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const btn = document.getElementById('import-backup-btn');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i>导入中...';
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const backup = JSON.parse(ev.target.result);
                    if (!backup.data || !backup.data.accounts) {
                        showToast('备份文件格式无效', 2000);
                        btn.disabled = false;
                        btn.innerHTML = '导入备份';
                        return;
                    }
                    CocTool.ui.showConfirm({
                        title: '导入备份',
                        text: '导入备份将覆盖当前所有数据，确定继续？',
                        confirmText: '继续导入',
                        cancelText: '取消',
                        onConfirm: () => {
                            localStorage.setItem('clash_upgrade_assistant_v3_fixed', JSON.stringify(backup.data));
                            localStorage.setItem('clash_upgrade_settings', JSON.stringify(backup.settings));
                            showToast('备份导入成功！即将刷新', 1500);
                            setTimeout(() => location.reload(), 1500);
                        },
                        onCancel: () => {
                            btn.disabled = false;
                            btn.innerHTML = '导入备份';
                        }
                    });
                } catch (err) {
                    showToast('文件解析失败：' + err.message, 3000);
                    btn.disabled = false;
                    btn.innerHTML = '导入备份';
                }
            };
            reader.readAsText(file);
            e.target.value = '';
        });
        // === 账号认证 + 云端备份/恢复 ===
        const CLOUD_API = 'https://coctool.top/api/account';
        const AUTH_KEY = 'coc_cloud_auth';
        const TOKEN_KEY = 'coc_cloud_token';

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
                    }
                });
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
                    localStorage.setItem(TOKEN_KEY, result.token);
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
                    localStorage.setItem(TOKEN_KEY, result.token);
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
            const token = localStorage.getItem(TOKEN_KEY);
            if (!token) {
                showToast('登录已失效，请重新登录', 2000);
                return;
            }

            const btn = document.getElementById('cloud-backup-btn');
            const origHtml = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fa fa-spinner fa-spin mr-2"></i>备份中...';

            try {
                const result = await postCloudBackup(token, buildBackupPayload());
                if (result.success) {
                    markCloudSyncedNow();
                    showToast('云端备份已更新', 2000);
                } else {
                    if (result.error && (result.error.includes('登录已失效') || result.error.includes('未登录'))) {
                        localStorage.removeItem(TOKEN_KEY);
                        localStorage.removeItem(AUTH_KEY);
                        authData = null;
                        updateLoginUI();
                        showToast('登录已失效，请重新登录', 2000);
                        return;
                    }
                    showToast('备份失败：' + (result.error || '未知错误'), 3000);
                }
            } catch (err) {
                showToast('恢复失败（网络错误）：' + err.message, 3000);
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
        //   用户设置1 + 版本检测最新版 → 开关1     用户设置1 + 版本检测旧版 → 开关0
        //   用户设置0 + 任意检测结果   → 开关0
        // 版本未知（启动首次检测前的窗口）按旧版处理（开关0、不上传），检测完成自动刷新；
        // 更新到最新版后开关自动恢复开态（用户设置仍为 1），无需重新开启
        const AUTO_BACKUP_PREF_KEY = 'coc_cloud_auto_backup_enabled';
        const AUTO_RESTORE_PREF_KEY = 'coc_cloud_auto_restore_enabled';
        const LOCAL_CHANGE_KEY = 'coc_last_local_data_change';
        // WebDAV 独立键：自动恢复开关（默认关，不进备份快照）与上传/恢复一致性标记（与云端标记分开互不干扰）
        const WEBDAV_SYNC_KEY = 'coc_webdav_last_sync';
        const AUTO_RESTORE_WEBDAV_KEY = 'coc_webdav_auto_restore_enabled';
        function userWantsAutoBackup() {
            try { return localStorage.getItem(AUTO_BACKUP_PREF_KEY) === '1'; } catch (e) { return false; }
        }

        function isLocalOutdated() {
            var latest = state.latestServerVersionCode || 0;
            if (!latest) return false;
            var local = 0;
            try { local = window.AndroidApp.getVersionCode(); } catch (e) {}
            return local < latest;
        }

        function isAutoBackupActive() {
            if (!userWantsAutoBackup()) return false;
            var latest = state.latestServerVersionCode || 0;
            if (!latest) return false;
            return !isLocalOutdated();
        }
        // 网页版不支持：shim 桩伪造超大 versionCode，须以真机专有桥方法识别
        function isRealAndroidApp() {
            return Boolean(window.AndroidApp && window.AndroidApp.isSystemDarkMode);
        }

        // 开关行展示状态：unsupported 隐藏整行 / nologin 登录后生效 / off 用户设置关 / checking 版本检测中 / outdated 需更新 / '' 正常开
        function cloudAutoBackupUiState() {
            if (!isRealAndroidApp()) return 'unsupported';
            if (!userWantsAutoBackup()) return 'off';
            if (!localStorage.getItem(TOKEN_KEY)) return 'nologin';
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
            if (uiState === 'unsupported') {
                group.style.display = 'none';
                return;
            }
            group.style.display = '';
            var toggle = document.getElementById('cloud-auto-backup-toggle');
            var label = document.getElementById('cloud-auto-backup-label');
            if (toggle) toggle.checked = uiState === '';
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

        async function autoCloudBackup() {
            try {
                if (!isRealAndroidApp()) return;
                const token = localStorage.getItem(TOKEN_KEY);
                if (!token || !authData || !authData.email) return;
                if (!isAutoBackupActive()) {
                    // 导入后本应自动备份并提示「云端备份已更新」；用户设置开着但因旧版被压时，
                    // 在同一位置改弹失效提示（每次导入都提示，与正常流程一一对应）
                    if (userWantsAutoBackup() && isLocalOutdated()) {
                        notificationMonitor.log('云端', '自动备份已失效：当前不是最新版本', { noMerge: true });
                        showToast('自动备份已失效，请更新至最新版本', 3000);
                    }
                    return;
                }
                const result = await postCloudBackup(token, buildBackupPayload());
                if (result && result.success) {
                    markCloudSyncedNow();
                    notificationMonitor.log('云端', '自动备份成功（导入后）', { noMerge: true });
                    showToast('云端备份已更新', 2000);
                } else {
                    notificationMonitor.log('云端', '自动备份失败：' + ((result && result.error) || '未知错误'), { noMerge: true });
                    showToast('云端备份失败：' + ((result && result.error) || '未知错误'), 3000);
                }
            } catch (err) {
                notificationMonitor.log('云端', '自动备份失败（网络错误）：' + err.message, { noMerge: true });
                showToast('云端备份失败（网络错误）', 3000);
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
                // 开启：先弹确认（默认关闭，按需开启；取消/点遮罩关闭弹窗后开关由 updateCloudAutoBackupUi 回弹到关）
                CocTool.ui.showConfirm({
                    title: '开启云端自动备份',
                    text: '此功能仅限最新版本使用，开启前请确认已更新至最新版本。<br>每次导入游戏数据都会自动上传云端备份，会增加服务器压力，请按需开启。<br>若没有多设备同步需求，不建议开启。',
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
        // 启动 2s 后做一次自动恢复检测（待页面渲染与登录态就绪；只读比对，云端不新则完全静默）
        setTimeout(() => { maybeAutoRestore(); }, 2000);
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
                CocTool.ui.showConfirm({
                    title: 'WebDAV 自动恢复',
                    text: '检测到 WebDAV 备份较新（' + timeStr + '），是否恢复到本地？',
                    confirmText: '恢复',
                    cancelText: '取消',
                    onConfirm: () => { performWebdavRestore(backupData).catch(() => {}); },
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
        refreshCloudAutoBackupUiRef = updateCloudAutoBackupUi;

        // 云端恢复
        // 恢复核心：写本地 + 补部落 + 刷新（云端恢复按钮与自动恢复共用）；返回是否执行了恢复
        async function performCloudRestore(backup) {
            const dataToRestore = backup.accounts ? backup : backup.data;
            if (!dataToRestore || !dataToRestore.accounts) {
                showToast('备份数据格式无效', 3000);
                return false;
            }
            localStorage.setItem('clash_upgrade_assistant_v3_fixed', JSON.stringify(dataToRestore));
            if (backup.settings || dataToRestore.settings) {
                localStorage.setItem('clash_upgrade_settings', JSON.stringify(backup.settings || dataToRestore.settings));
            }
            // 本地最后数据变更标记 = 云端备份时间：防止自动恢复后又被判「云端较新」造成回环
            try { localStorage.setItem(LOCAL_CHANGE_KEY, String(Date.parse(backup.exportDate) || Date.now())); } catch (e) {}
            var clanTags = dataToRestore.clans || [];
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
            try { return localStorage.getItem(AUTO_RESTORE_PREF_KEY) === '1'; } catch (e) { return false; }
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

        function localDataChangedAt() {
            return parseInt(localStorage.getItem(LOCAL_CHANGE_KEY), 10) || 0;
        }

        // 备份成功（自动/手动）→ 本地与云端内容已一致，标记同步为备份时刻：
        // 否则云端 exportDate 恒比导入标记晚，双开时每次重启都会误报「云端较新」
        function markCloudSyncedNow() {
            try { localStorage.setItem(LOCAL_CHANGE_KEY, String(Date.now())); } catch (e) {}
        }

        // 统一备份载荷组装（云端备份模块内手动/自动共用，一处修改全局生效；WebDAV 独立不依赖此函数）
        function buildBackupPayload() {
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

        // 统一备份上传核心（云端手动/自动共用同一接口与头；网页版无桥接时版本头为 0/空，服务器不校验）
        async function postCloudBackup(token, payload) {
            var vCode = 0, vName = '';
            try { vCode = window.AndroidApp.getVersionCode(); vName = window.AndroidApp.getVersionName(); } catch (e) {}
            const headers = {
                'Content-Type': 'application/json',
                'X-Auth-Token': token,
                'X-App-Version-Code': String(vCode)
            };
            // HTTP 头只允许 Latin-1：网页版 shim 的 getVersionName 返回中文「Web 版」，直接放进请求头
            // 会在 fetch 发送前抛 "String contains non ISO-8859-1 code point"——手动/自动备份全部静默失败，
            // 而恢复只发 ASCII 的 X-Auth-Token 因此正常（表现=能恢复不能上传）。中文版本名省略该头
            // （服务器不校验版本号），App 的 ASCII 版本号 1.4.x 照常携带。
            if (vName && /^[\x00-\xFF]+$/.test(vName)) {
                headers['X-App-Version'] = vName;
            }
            const res = await fetch(`${CLOUD_API}/backup`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(payload)
            });
            return res.json();
        }

        // 两个自动恢复互斥（用户拍板）：WebDAV 恢复优先——它读用户自己的网盘，不给自有服务器增压；
        // WebDAV 自动恢复开启时，云端自动恢复「开关看着开着但不执行」
        function webdavAutoRestoreOn() {
            try { return localStorage.getItem(AUTO_RESTORE_WEBDAV_KEY) === '1'; } catch (e) { return false; }
        }

        // 启动触发：登录 + 开关开 → 拉云端比对 exportDate 与本地最后变更标记，云端较新则询问后恢复
        async function maybeAutoRestore() {
            try {
                if (!cloudAutoRestoreEnabled()) return;
                if (webdavAutoRestoreOn()) return; // WebDAV 自动恢复优先，云端让位（不发请求）
                const token = localStorage.getItem(TOKEN_KEY);
                if (!token || !authData || !authData.email) return;
                const res = await fetch(`${CLOUD_API}/backup`, {
                    method: 'GET',
                    headers: { 'X-Auth-Token': token }
                });
                const result = await res.json();
                if (!result || !result.success || !result.data) return;
                const backup = result.data;
                if (!(backup.accounts ? backup : backup.data)) return;
                var cloudAt = Date.parse(backup.exportDate) || 0;
                if (cloudAt <= localDataChangedAt()) return;
                var timeStr = new Date(cloudAt);
                var pad = function (n) { return String(n).padStart(2, '0'); };
                timeStr = (timeStr.getMonth() + 1) + '-' + pad(timeStr.getDate()) + ' ' + pad(timeStr.getHours()) + ':' + pad(timeStr.getMinutes());
                CocTool.ui.showConfirm({
                    title: '自动恢复',
                    text: '检测到云端备份较新（' + timeStr + '），是否恢复到本地？',
                    confirmText: '恢复',
                    cancelText: '取消',
                    onConfirm: () => { performCloudRestore(backup).catch(() => {}); },
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
            const token = localStorage.getItem(TOKEN_KEY);
            if (!token) {
                showToast('登录已失效，请重新登录', 2000);
                return;
            }

            const btn = document.getElementById('cloud-restore-btn');
            const origHtml = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fa fa-spinner fa-spin mr-2"></i>恢复中...';

            try {
                const res = await fetch(`${CLOUD_API}/backup`, {
                    method: 'GET',
                    headers: { 'X-Auth-Token': token },
                });
                const result = await res.json();
                if (result.success && result.data) {
                    await performCloudRestore(result.data);
                } else {
                    if (result.error && (result.error.includes('登录已失效') || result.error.includes('未登录'))) {
                        localStorage.removeItem(TOKEN_KEY);
                        localStorage.removeItem(AUTH_KEY);
                        authData = null;
                        updateLoginUI();
                        showToast('登录已失效，请重新登录', 2000);
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
        }

        // 读取国际服部落标签（clash_clan_list，仅 tag 数组）
        function getIntlClanTags() {
            try {
                var list = JSON.parse(localStorage.getItem('clash_clan_list') || '[]');
                var tags = [];
                for (var i = 0; i < list.length; i++) {
                    if (list[i] && list[i].tag) tags.push(list[i].tag);
                }
                return tags;
            } catch (e) {
                return [];
            }
        }
        advancePickerCloseBtn.addEventListener('click', () => advancePickerModal.classList.add('hidden'));
        advancePickerModal.addEventListener('click', (e) => {
            if (e.target === advancePickerModal) advancePickerModal.classList.add('hidden');
        });
        document.querySelectorAll('.advance-option').forEach(btn => {
            btn.addEventListener('click', () => {
                const seconds = parseInt(btn.getAttribute('data-seconds'));
                settings.advanceNotify = true;
                settings.advanceNotifyTime = seconds;
                saveSettings();
                applySettings();
                pushSchedule();
                advancePickerModal.classList.add('hidden');
            });
        });
    }

    global.serviceLog = serviceLog;
    CocTool.features.services = Object.freeze({
        init,
        start: startBackgroundCheck,
        stop: stopBackgroundCheck,
        pauseTicker,
        resumeTicker,
        pushSchedule,
        autoWebdavUpload,
        maybeWebdavAutoRestore: function () { return maybeWebdavAutoRestoreRef ? maybeWebdavAutoRestoreRef() : Promise.resolve(); },
        autoCloudBackup: function () { return autoCloudBackupRef ? autoCloudBackupRef() : Promise.resolve(); },
        maybeAutoRestore: function () { return maybeAutoRestoreRef ? maybeAutoRestoreRef() : Promise.resolve(); },
        refreshCloudAutoBackupUi: function () { if (refreshCloudAutoBackupUiRef) refreshCloudAutoBackupUiRef(); },
        log: function(type, detail, opts) { notificationMonitor.log(type, detail, opts); },
        getNotificationLogs: function() { return notificationMonitor.getLogs(); },
        getGroupedNotificationLogs: function() { return notificationMonitor.getGroupedLogs(); },
        clearNotificationLogs: function() { notificationMonitor.clear(); },
        exportNotificationLog: function() { notificationMonitor.export(); }
    });
})(window);
