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

    /** 部落卡片统一列表（clan.js 提供；未加载时兜底读新键/旧键，仅国际服旧数据） */
    function readClanCards() {
        if (CocTool.clan && typeof CocTool.clan.getClanCards === 'function') return CocTool.clan.getClanCards();
        try {
            const list = JSON.parse(localStorage.getItem('clash_clan_cards') || localStorage.getItem('clash_clan_list') || '[]');
            return Array.isArray(list) ? list : [];
        } catch (e) { return []; }
    }
    function intlClanCards() { return readClanCards().filter(c => c && c.type !== 'china'); }
    function chinaClanCards() { return readClanCards().filter(c => c && c.type === 'china'); }

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
            const list = intlClanCards();
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
            const list = chinaClanCards();
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
            const list = intlClanCards();
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
            // 按账号类目屏蔽过滤："通知"档勾选的分类不推送升级完成通知（源头已按"升级进度"档过滤，此处叠加）
            const items = filterDismissedCategories(extractUpgradingItems(data, now, true), tag, 'notify');
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
                        // 排队项（未开工）通知带前缀：完成时刻是队列模拟值，开工后（固化/转正）走正常通知
                        const qPrefix = (item.queueStart != null && item.queueStart > now) ? '排队·' : '';
                        var msg;
                        if (item.isMint) {
                            msg = accountName + '\n铸币已完成';   // 铸币坊手动卡片：两行、完成时刻不提前
                        } else if (item.supercharge !== undefined) {
                            msg = accountName + '\n' + qPrefix + name + ' 充能·等级' + (item.supercharge + 1) + '完成';
                        } else if (calc.isMultiStageWeapon(item)) {
                            msg = accountName + '\n' + qPrefix + name + ' 武器·等级' + (item.weapon + 1) + '完成';
                        } else if (item.gear_up === 0) {
                            msg = accountName + '\n' + qPrefix + name + ' 改装完成';
                        } else {
                            msg = accountName + '\n' + qPrefix + name + ' 已升级为 ' + (item.lvl + 1) + '级';
                        }
                        // 第三行追加备忘（仅当该项目有备忘）
                        const note = CocTool.features.progress && CocTool.features.progress.getNoteForItem
                            ? CocTool.features.progress.getNoteForItem(tag, item, data)
                            : '';
                        if (note) msg += '\n' + note;
                        // 铸币坊按用户设定时刻准点通知；普通升级仍按提前提醒档
                        const notifyTs = item.isMint ? completionTs : applyAdvance(completionTs, advanceThreshold, now);
                        schedule.push({ timestamp: notifyTs, message: msg, id: item.uniqueId, type: 'upgrade' });
                        var itemMeta = { timer: item.timer };
                        if (item.helper_timer && item.helper_timer > 0) itemMeta.helper_timer = item.helper_timer;
                        if (item.helper_recurrent === true) itemMeta.recurrent = true;
                        notificationMonitor.log('调度', msg.slice(msg.indexOf('\n') + 1) + ' 于 ' + fmtClock(notifyTs), { account: accountName, meta: itemMeta });
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

            // 胜利之星重置通知（主/夜各自独立；是否启用看每颗星的 st.enabled，数据层 queue.js）
            if (CocTool.features.queue && CocTool.features.queue.starScheduleEntries) {
                CocTool.features.queue.starScheduleEntries(tag, accountName, now).forEach(en => schedule.push(en));
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
        // WebDAV + 云端账号/备份域已拆至 cloud-backup.js（2026-11-07，services.js 超 100KB 拆分）
        var cloudModule = CocTool.features.cloudBackup;
        if (cloudModule && cloudModule.init) cloudModule.init();
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
        autoWebdavUpload: function () { var m = CocTool.features.cloudBackup; return m ? m.autoWebdavUpload() : Promise.resolve(); },
        maybeWebdavAutoRestore: function () { var m = CocTool.features.cloudBackup; return m ? m.maybeWebdavAutoRestore() : Promise.resolve(); },
        autoCloudBackup: function (tag) { var m = CocTool.features.cloudBackup; return m ? m.autoCloudBackup(tag) : Promise.resolve(); },
        deleteCloudAccount: function (tag) { var m = CocTool.features.cloudBackup; return m ? m.deleteCloudAccount(tag) : Promise.resolve(null); },
        pushAccountServer: function (tag, server) { var m = CocTool.features.cloudBackup; return m ? m.pushAccountServer(tag, server) : Promise.resolve(null); },
        maybeAutoRestore: function () { var m = CocTool.features.cloudBackup; return m ? m.maybeAutoRestore() : Promise.resolve(); },
        refreshCloudAutoBackupUi: function () { var m = CocTool.features.cloudBackup; if (m) m.refreshCloudAutoBackupUi(); },
        openCloudLogin: function () { var m = CocTool.features.cloudBackup; if (m) m.openCloudLogin(); },
        log: function(type, detail, opts) { notificationMonitor.log(type, detail, opts); },
        getNotificationLogs: function() { return notificationMonitor.getLogs(); },
        getGroupedNotificationLogs: function() { return notificationMonitor.getGroupedLogs(); },
        clearNotificationLogs: function() { notificationMonitor.clear(); },
        exportNotificationLog: function() { notificationMonitor.export(); }
    });
})(window);
