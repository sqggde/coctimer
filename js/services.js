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
    function filterNightWorld(...args) { return calc.filterNightWorld(...args); }
    function updateTimersOnly() { var p = progress(); if (p) p.tick(); }

    // ===== WebDAV 核心函数（供导入时自动上传调用） =====
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

    async function doWebdavRequest(path, method, body) {
        const auth = getWebdavAuth();
        if (!auth) throw new Error('账号或密码未设置');
        const baseUrl = getWebdavBaseUrl().replace(/\/+$/, '');
        // 对路径中的每个分段做 URL 编码（处理 # 等特殊字符）
        const cleanPath = path.split('/').map(s => encodeURIComponent(s)).join('/');
        const url = baseUrl + (cleanPath ? '/' + cleanPath : '');

        // 优先使用原生 Java 方法（避免 WebView fetch 的网络限制）
        if (typeof AndroidApp !== 'undefined' && AndroidApp.doWebdavHttpRequest) {
            const bodyArg = (method === 'MKCOL' || !body) ? null : body;
            const resultJson = AndroidApp.doWebdavHttpRequest(url, method, settings.webdavAccount, settings.webdavPassword, bodyArg);
            const result = JSON.parse(resultJson);
            const response = {
                ok: result.ok,
                status: result.status,
                text: () => Promise.resolve(result.body),
                clone: function() { return this; }
            };
            if (!result.ok) {
                response.statusText = 'HTTP ' + result.status;
                if (result.error) response.statusText += ' (' + result.error + ')';
            }
            return response;
        }

        // 降级：浏览器 fetch
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

    async function autoWebdavUpload() {
        if (!accounts || Object.keys(accounts).length === 0 || !settings.webdavServer) return;
        try {
            const backupData = {
                version: 1,
                exportDate: new Date().toISOString(),
                accounts,
                accountNotes,
                accountOrder,
                currentAccount: state.currentAccount,
                settings: { ...settings }
            };
            const jsonStr = JSON.stringify(backupData, null, 2);
            const filename = 'webdav_backup.json';
            await ensureWebdavFolder().catch(() => {});
            const res = await doWebdavRequest(filename, 'PUT', jsonStr);
            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                throw new Error('HTTP ' + res.status + (errText ? ': ' + errText : ''));
            }
            const now = new Date();
            settings.webdavLastUploadTime =
                now.getFullYear() + '-' +
                String(now.getMonth() + 1).padStart(2, '0') + '-' +
                String(now.getDate()).padStart(2, '0') + ' ' +
                String(now.getHours()).padStart(2, '0') + ':' +
                String(now.getMinutes()).padStart(2, '0') + ':' +
                String(now.getSeconds()).padStart(2, '0');
            saveSettings();
        } catch (e) {
        }
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
            schedule.push({ timestamp: applyAdvance(ts, threshold, now), message: `${accountName}\n${label} 已就绪`, id: accountName + '_' + label });
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
            schedule.push({ timestamp: Math.floor(tsMs / 1000), message: msg, id: id });
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
                let war = null;
                let mineMap = {};
                try { mineMap = JSON.parse(localStorage.getItem('clash_league_mine_' + cleanTag) || '{}'); } catch (e) {}
                const mineTag = mineMap[L];
                if (mineTag) war = readLeagueWarRaw(mineTag);
                if (!war) {
                    const rt = group.rounds[L].warTags;
                    for (let j = 0; j < rt.length; j++) { war = readLeagueWarRaw(rt[j]); if (war) break; }
                }
                if (!war || !war.startTime) continue;
                const startK = parseLeagueCocTime(war.startTime);
                const K = L + 1;
                const nowMs = now * 1000;
                const key = cleanTag + '_' + group.season;
                for (let n = 1; n <= 7; n++) {
                    const t = CocTool.calc.leagueRoundTimes(startK, K, n);
                    const cn = LEAGUE_CN_NUM[n - 1];
                    addWarNotification(t.start, name + '\n联赛·' + cn + '场对战已开始', key + '_l' + n + '_start', nowMs, schedule);
                    addWarNotification(t.end - 4 * HOUR_MS, name + '\n联赛·' + cn + '场对战将于4小时后结束', key + '_l' + n + '_4h', nowMs, schedule);
                    addWarNotification(t.end - HOUR_MS, name + '\n联赛·' + cn + '场对战将于1小时后结束', key + '_l' + n + '_1h', nowMs, schedule);
                }
                // 结束通知：仅第 7 场结束时
                const t7 = CocTool.calc.leagueRoundTimes(startK, K, 7);
                addWarNotification(t7.end, name + '\n联赛已结束', key + '_leagueend', nowMs, schedule);
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
            const items = filterNightWorld(extractUpgradingItems(data, now, true));
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
                        schedule.push({ timestamp: applyAdvance(completionTs, advanceThreshold, now), message: msg, id: item.uniqueId });
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
                        schedule.push({ timestamp: applyAdvance(cooldownEnd, advanceThreshold, now), message: `${accountName}\n时光钟楼 已就绪`, id: accountName + '_clocktower' });
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
        if (window.AndroidApp) {
            var json = buildNotificationSchedule();
            window.AndroidApp.setNotificationSchedule(json);
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

        async function webdavUpload(silent) {
            try {
                const backupData = {
                    version: 1,
                    exportDate: new Date().toISOString(),
                    accounts,
                    accountNotes,
                    accountOrder,
                    currentAccount: state.currentAccount,
                    settings: { ...settings }
                };
                const jsonStr = JSON.stringify(backupData, null, 2);
                const filename = 'webdav_backup.json';
                try { await ensureWebdavFolder(); } catch (folderErr) {
                }
                const res = await doWebdavRequest(filename, 'PUT', jsonStr);
                if (!res.ok) {
                    const errText = await res.text().catch(() => '');
                    throw new Error('HTTP ' + res.status + (errText ? ': ' + errText : ''));
                }
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
                // 兼容两种格式：新版标准格式 或 旧版扁平格式
                const dataToRestore = backupData.accounts ? backupData : (backupData.data || backupData);
                if (!dataToRestore || !dataToRestore.accounts) {
                    showToast('备份数据格式无效', 3000);
                    return;
                }
                // 与云端恢复一致的写入逻辑
                localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToRestore));
                if (backupData.settings || dataToRestore.settings) {
                    localStorage.setItem(SETTINGS_KEY, JSON.stringify(backupData.settings || dataToRestore.settings));
                }
                showToast('备份导入成功！即将刷新', 1500);
                setTimeout(() => location.reload(), 1500);
            } catch (e) {
                const detail = e.name === 'TypeError' ? '网络错误，请检查服务器地址和网络连接' : e.message;
                showToast('导入失败：' + detail, 4000);
            }
        }

        function openWebdavModal() {
            loadWebdavToUI();
            webdavModal.classList.remove('hidden');
        }

        function closeWebdavModal() {
            webdavModal.classList.add('hidden');
        }

        webdavSettingsBtn.addEventListener('click', openWebdavModal);
        webdavCloseBtn.addEventListener('click', closeWebdavModal);
        webdavModal.addEventListener('click', (e) => { if (e.target === webdavModal) closeWebdavModal(); });
        webdavSaveBtn.addEventListener('click', () => {
            saveWebdavFromUI();
            showToast('WebDAV 设置已保存', 2000);
            closeWebdavModal();
        });
        if (webdavUploadBtn) webdavUploadBtn.addEventListener('click', async () => {
            const btn = document.getElementById('webdav-upload-btn');
            if (!btn) return;
            btn.disabled = true;
            btn.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i>上传中...';
            try { await webdavUpload(false); }
            finally { btn.disabled = false; btn.innerHTML = '上传备份'; }
        });
        if (webdavImportBtn) webdavImportBtn.addEventListener('click', async () => {
            const btn = document.getElementById('webdav-import-btn');
            if (!btn) return;
            btn.disabled = true;
            btn.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i>导入中...';
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
                    if (!confirm('导入备份将覆盖当前所有数据，确定继续？')) {
                        btn.disabled = false;
                        btn.innerHTML = '导入备份';
                        return;
                    }
                    localStorage.setItem('clash_upgrade_assistant_v3_fixed', JSON.stringify(backup.data));
                    localStorage.setItem('clash_upgrade_settings', JSON.stringify(backup.settings));
                    showToast('备份导入成功！即将刷新', 1500);
                    setTimeout(() => location.reload(), 1500);
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
                currentAccount: state.currentAccount,
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
        log: function(type, detail, opts) { notificationMonitor.log(type, detail, opts); },
        getNotificationLogs: function() { return notificationMonitor.getLogs(); },
        getGroupedNotificationLogs: function() { return notificationMonitor.getGroupedLogs(); },
        clearNotificationLogs: function() { notificationMonitor.clear(); },
        exportNotificationLog: function() { notificationMonitor.export(); }
    });
})(window);
