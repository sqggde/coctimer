(function (g) {
    'use strict';
    var C = g.CocTool;
    if (!C) return;
    var B = C.apiBase, T = C.appToken;
    var EL = {};
    var _tag = '';
    var _clanName = '';
    var _clanBadge = '';
    var CACHE_PREFIX = 'clash_war_stats_';
    var _fromVal = '', _toVal = '', _calField = '', _calYear = 0, _calMonth = 0;
    var _cacheHint = '', _lastNote = '';

    function pad2(n) { return String(n).padStart(2, '0'); }
    function todayStr(offsetDays) {
        var d = new Date(Date.now() + (offsetDays || 0) * 86400000);
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }

    function fmtTime(ts) {
        var d = new Date(ts);
        return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }
    function saveCache(html, note) {
        try { localStorage.setItem(CACHE_PREFIX + _tag, JSON.stringify({ v: 7, html: html, note: note || '', ts: Date.now() })); } catch (e) {}
    }
    function loadCache() {
        try {
            var r = localStorage.getItem(CACHE_PREFIX + _tag);
            if (!r) return null;
            var c = JSON.parse(r);
            // 版本校验：旧格式缓存（布局/结构变更）不恢复，避免残留显示
            if (!c || c.v !== 7 || !c.html) return null;
            return c;
        } catch (e) { return null; }
    }

    // ====== 工具 ======
    function $(id) { return document.getElementById(id); }
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
    function fp(v) { return (Math.round((v || 0) * 10) / 10) + '%'; }
    function api(p, cb) {
        var x = new XMLHttpRequest();
        x.open('GET', B + p, true);
        x.setRequestHeader('X-App-Token', T);
        x.onload = function () { if (x.status === 200) { try { cb(null, JSON.parse(x.responseText)); } catch (e) { cb(e); } } else cb(new Error('HTTP ' + x.status)); };
        x.onerror = function () { cb(new Error('网络错误')); };
        x.send();
    }
    function parseDate(s) { return new Date(s + 'T00:00:00').getTime(); }
    function parseCocTime(s) {
        if (!s) return 0;
        if (s.length >= 15 && s[8] === 'T') {
            return Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(9, 11), +s.slice(11, 13), +s.slice(13, 15), +(s.slice(16, 19) || 0));
        }
        var p = s.replace(/Z$/, '').split(/[-T:.]/);
        return Date.UTC(+p[0], +p[1] - 1, +p[2], +p[3] || 0, +p[4] || 0, +p[5] || 0, +(p[6] || 0));
    }
    function show(msg) { $('ws-result').innerHTML = '<div style="text-align:center;padding:40px;color:#9ca3af;font-size:14px;"><div style="width:28px;height:28px;border:3px solid #e5e7eb;border-top-color:#3b82f6;border-radius:50%;animation:clan-spin 0.8s linear infinite;margin:0 auto 12px;"></div><p>' + msg + '</p></div>'; }
    function err(msg) { $('ws-result').innerHTML = '<div style="text-align:center;padding:40px;color:#9ca3af;font-size:14px;"><i class="fa fa-exclamation-triangle" style="color:#ef4444;font-size:28px;margin-bottom:12px;display:block;"></i><p>' + msg + '</p></div>'; }

    // ====== 查询入口 ======
    function query() {
        var tag = _tag;
        if (!tag) { err('请从部落详情进入对战统计'); return; }
        var from = parseDate(_fromVal);
        var to = parseDate(_toVal) + 86400000 - 1;
        if (isNaN(from) || isNaN(to)) { err('请选择有效日期'); return; }
        show('正在获取战争日志...');
        api('/api/coc/warlog/' + encodeURIComponent(tag), function (e, d) {
            if (e) { err('获取失败: ' + e.message); return; }
            var items = (d && d.items) ? d.items : [];
            var wars = items.filter(function (i) { return i.attacksPerMember === 2 && i.result && i.endTime; });
            var filtered = wars.filter(function (w) { var t = parseCocTime(w.endTime); return t >= from && t <= to; });
            if (!filtered.length) { $('ws-result').innerHTML = '<div style="text-align:center;padding:40px;color:#9ca3af;font-size:14px;"><i class="fa fa-inbox" style="font-size:28px;margin-bottom:12px;display:block;"></i><p>该日期范围内没有找到部落战记录</p></div>'; return; }
            // 按 endTime 去重
            var dedup = {}, dupCount = 0, deduped = [];
            for (var i = 0; i < filtered.length; i++) {
                if (dedup[filtered[i].endTime]) { dupCount++; continue; }
                dedup[filtered[i].endTime] = 1;
                deduped.push(filtered[i]);
            }
            fetchDetails(deduped, tag, dupCount);
        });
    }

    // ====== 服务器模式：并发拉取详情 ======
    function fetchDetails(entries, tag, preDup) {
        var total = entries.length, loaded = 0, failed = 0, details = [];
        var CONCURRENCY = 4, queue = entries.slice(), idx = 0;
        function update() {
            $('ws-result').innerHTML = '<div style="text-align:center;padding:40px;color:#9ca3af;font-size:14px;"><div style="width:28px;height:28px;border:3px solid #e5e7eb;border-top-color:#3b82f6;border-radius:50%;animation:clan-spin 0.8s linear infinite;margin:0 auto 12px;"></div><p>已加载 <span>' + loaded + '</span>/' + total + ' 场</p><div style="width:220px;height:4px;background:#e5e7eb;border-radius:2px;margin:12px auto;overflow:hidden"><div style="height:100%;background:#3b82f6;border-radius:2px;width:' + (loaded / total * 100) + '%"></div></div></div>';
        }
        update();
        function worker() {
            if (idx >= queue.length) return;
            var et = queue[idx++].endTime;
            api('/api/coc/war-history/' + encodeURIComponent(tag) + '/' + encodeURIComponent(et), function (e, data) {
                loaded++;
                if (!e && data && data.state === 'warEnded') details.push(data);
                else failed++;
                if (loaded === total) { computeStats(details, tag, total, failed, preDup); return; }
                if (loaded % 4 === 0) update();
                worker();
            });
        }
        for (var i = 0; i < Math.min(CONCURRENCY, total); i++) worker();
    }

    // ====== 单场分析 ======
    function warResult(myStars, myDest, oppStars, oppDest) {
        if (myStars > oppStars) return 'win';
        if (myStars < oppStars) return 'lose';
        if (myDest > oppDest) return 'win';
        if (myDest < oppDest) return 'lose';
        return 'tie';
    }
    function analyzeWar(war, cleanTag) {
        var home = war.clan, away = war.opponent;
        if (!home || !away) return null;
        var isHome = home.tag === cleanTag;
        var myClan = isHome ? home : away;
        var oppClan = isHome ? away : home;
        var result = warResult(myClan.stars || 0, myClan.destructionPercentage || 0, oppClan.stars || 0, oppClan.destructionPercentage || 0);
        var allAttacks = [];
        var members = myClan.members || [];
        for (var i = 0; i < members.length; i++) {
            var m = members[i];
            (m.attacks || []).forEach(function (a) {
                allAttacks.push({ member: m, attack: a });
            });
        }
        allAttacks.sort(function (a, b) { return (a.attack.order || 99999) - (b.attack.order || 99999); });
        var defBest = {};
        var oppPosMap = {};
        (oppClan.members || []).forEach(function (om) {
            if (om.tag) oppPosMap[om.tag] = om.mapPosition || 0;
        });
        var stats = {};
        members.forEach(function (m) { stats[m.tag] = { war: 1 }; });
        var teamAttacks = 0, teamStars = 0, teamDest = 0;
        for (var i2 = 0; i2 < allAttacks.length; i2++) {
            var item = allAttacks[i2], mm = item.member, a = item.attack;
            var st = stats[mm.tag] || (stats[mm.tag] = { war: 1 });
            var def = a.defenderTag;
            var prev = defBest[def] || 0;
            var newS = Math.max(0, a.stars - prev);
            defBest[def] = Math.max(prev, a.stars);
            st.attacks = (st.attacks || 0) + 1;
            st.totalStars = (st.totalStars || 0) + a.stars;
            st.newStars = (st.newStars || 0) + newS;
            st.destSum = (st.destSum || 0) + (a.destructionPercentage || 0);
            st.attackStars = st.attackStars || [0, 0, 0, 0];
            st.attackStars[Math.min(3, Math.max(0, a.stars))]++;
            if (oppPosMap[def]) { st.oppPosSum = (st.oppPosSum || 0) + oppPosMap[def]; st.oppPosCnt = (st.oppPosCnt || 0) + 1; }
            teamAttacks++; teamStars += a.stars; teamDest += a.destructionPercentage || 0;
        }
        members.forEach(function (m2) {
            var st2 = stats[m2.tag];
            st2.defended = (m2.opponentAttacks || 0);
            st2.defBestStars = (m2.bestOpponentAttack && m2.bestOpponentAttack.stars) || 0;
        });
        return { result: result, stats: stats, teamAttacks: teamAttacks, teamStars: teamStars, teamDest: teamDest, myStars: myClan.stars || 0, oppStars: oppClan.stars || 0, myDest: myClan.destructionPercentage || 0, oppDest: oppClan.destructionPercentage || 0, teamSize: war.teamSize || (members.length * 2) };
    }

    // ====== 汇总统计 ======
    function computeStats(wars, tag, totalWars, failed, dupCount) {
        var cleanTag = '#' + tag;
        var agg = {};
        var totalAttacks = 0, totalStars = 0, totalDest = 0;
        var starDist = { 0: 0, 1: 0, 2: 0, 3: 0 };
        var wins = 0, losses = 0, ties = 0;
        var totalNewStars = 0;
        var analyzed = 0;
        var warRows = [];
        for (var wi = 0; wi < wars.length; wi++) {
            var r = analyzeWar(wars[wi], cleanTag);
            if (!r) continue;
            analyzed++;
            if (r.result === 'win') wins++; else if (r.result === 'lose') losses++; else ties++;
            totalAttacks += r.teamAttacks; totalStars += r.teamStars; totalDest += r.teamDest;
            var rawEnd = wars[wi].endTime;
            var endMs = (typeof rawEnd === 'number' && rawEnd < 1e12) ? rawEnd * 1000 : parseCocTime(rawEnd);
            var endLocal = new Date(endMs || 0);
            var row = { date: (endLocal.getMonth() + 1) + '/' + endLocal.getDate(), members: {}, _endMs: endMs };
            var myClan = (wars[wi].clan.tag === cleanTag ? wars[wi].clan : wars[wi].opponent);
            (myClan.members || []).forEach(function (mm) {
                var atkArr = mm.attacks || [];
                var atkList = [];
                for (var ai = 0; ai < atkArr.length && ai < 2; ai++) atkList.push({ stars: atkArr[ai].stars || 0, dest: atkArr[ai].destructionPercentage || 0 });
                row.members[mm.tag] = { present: true, atks: atkList };
            });
            warRows.push(row);
            for (var t2 in r.stats) {
                var s = r.stats[t2];
                var ag = agg[t2] || (agg[t2] = { tag: t2, name: '', th: 0, pos: 0, wars: 0, attacks: 0, totalStars: 0, newStars: 0, destSum: 0, attackStars: [0, 0, 0, 0], defended: 0, defBestSum: 0, defBestCount: 0, oppPosSum: 0, oppPosCnt: 0 });
                ag.wars++;
                ag.attacks += (s.attacks || 0);
                ag.totalStars += (s.totalStars || 0);
                ag.newStars += (s.newStars || 0);
                ag.destSum += (s.destSum || 0);
                ag.defended += (s.defended || 0);
                ag.defBestSum += (s.defBestStars || 0);
                if (s.defBestStars > 0) ag.defBestCount++;
                if (s.oppPosSum) { ag.oppPosSum += s.oppPosSum; ag.oppPosCnt += s.oppPosCnt; }
                for (var k = 0; k <= 3; k++) ag.attackStars[k] += (s.attackStars && s.attackStars[k]) || 0;
            }
            var myMembers = (wars[wi].clan.tag === cleanTag ? wars[wi].clan : wars[wi].opponent).members || [];
            for (var mi = 0; mi < myMembers.length; mi++) {
                var mm2 = myMembers[mi];
                var ag2 = agg[mm2.tag];
                if (ag2) { ag2.name = mm2.name || ag2.name; ag2.th = mm2.townhallLevel || ag2.th; ag2.pos = mm2.mapPosition || ag2.pos; }
            }
        }
        warRows.sort(function (a, b) { return (a._endMs || 0) - (b._endMs || 0); });
        for (var t3 in agg) {
            var ag3 = agg[t3];
            for (var k2 = 0; k2 <= 3; k2++) starDist[k2] += ag3.attackStars[k2];
            totalNewStars += ag3.newStars;
        }
        var members = Object.values(agg);
        members.forEach(function (m) {
            m.avgDest = m.attacks > 0 ? m.destSum / m.attacks : 0;
            m.avgOppPos = m.oppPosCnt > 0 ? m.oppPosSum / m.oppPosCnt : 0;
            m.defRate = m.defended > 0 ? Math.round(m.defBestSum / m.defended / 3 * 100) : 0;
            m.threeRate = m.attacks > 0 ? Math.round(m.attackStars[3] / m.attacks * 100) : 0;
            m.zeroRate = m.attacks > 0 ? Math.round(m.attackStars[0] / m.attacks * 100) : 0;
            m.avgStarsPerAtk = m.attacks > 0 ? m.totalStars / m.attacks : 0;
        });
        members.sort(function (a, b) { return b.newStars - a.newStars; });
        renderResults({ wars: analyzed, totalQueried: totalWars, failed: failed || 0, dupCount: dupCount || 0, wins: wins, losses: losses, ties: ties, totalAttacks: totalAttacks, totalStars: totalStars, avgDest: totalAttacks > 0 ? totalDest / totalAttacks : 0, starDist: starDist, members: members, totalNewStars: totalNewStars, warRows: warRows });
    }

    // ====== 渲染（概览/统计/进攻/防御 四 tab，参考图鉴页 ov-tab-bar 切换） ======
    function buildOverview(s) {
        var h = '<div class="ws-stats-grid">';
        h += '<div class="ws-stat-card"><div class="ws-stat-val">' + s.wars + '</div><div class="ws-stat-label">统计场次</div></div>';
        h += '<div class="ws-stat-card green"><div class="ws-stat-val">' + s.wins + '</div><div class="ws-stat-label">胜利</div></div>';
        h += '<div class="ws-stat-card red"><div class="ws-stat-val">' + s.losses + '</div><div class="ws-stat-label">失败</div></div>';
        h += '<div class="ws-stat-card yellow"><div class="ws-stat-val">' + s.ties + '</div><div class="ws-stat-label">平局</div></div>';
        h += '<div class="ws-stat-card"><div class="ws-stat-val">' + (s.wars > 0 ? Math.round(s.wins / s.wars * 100) : 0) + '%</div><div class="ws-stat-label">胜率</div></div>';
        h += '<div class="ws-stat-card purple"><div class="ws-stat-val">' + s.totalStars + '</div><div class="ws-stat-label">总星数</div></div>';
        h += '<div class="ws-stat-card"><div class="ws-stat-val">' + s.totalAttacks + '</div><div class="ws-stat-label">总进攻</div></div>';
        h += '<div class="ws-stat-card"><div class="ws-stat-val">' + fp(s.avgDest) + '</div><div class="ws-stat-label">平均破坏率</div></div>';
        h += '</div>';
        h += '<div class="ws-section"><div class="ws-section-title"><i class="fa fa-star"></i> 星级分布 <span class="ws-section-sub">共 ' + s.totalAttacks + ' 次进攻</span></div>';
        var maxStar = Math.max(s.starDist[0], s.starDist[1], s.starDist[2], s.starDist[3], 1);
        var starColors = ['r', 'y', 'g', 'b']; var starNames = ['0星', '1星', '2星', '3星'];
        for (var i = 0; i <= 3; i++) {
            var cnt = s.starDist[i] || 0;
            var pct = s.totalAttacks > 0 ? Math.round(cnt / s.totalAttacks * 100) : 0;
            h += '<div class="ws-bar-row"><div class="ws-bar-label">' + starNames[i] + '</div>';
            h += '<div class="ws-bar-track"><div class="ws-bar-fill ' + starColors[i] + '" style="width:' + Math.max(cnt / maxStar * 100, 2) + '%">' + pct + '%</div></div>';
            h += '<div class="ws-bar-count">' + cnt + ' 次（' + pct + '%）</div></div>';
        }
        h += '</div>';
        return h;
    }
function buildMatches(s) {
        if (!s.warRows || !s.warRows.length) return '<div class="ws-empty">暂无每场详情数据</div>';
        // CSS Grid 矩阵（放弃 table：真机列塌缩反复出问题）：列 = 30px + 90px + 每场 76px，严格固定
        var n = s.warRows.length;
        var totalW = 30 + 90 + 76 * n;
        var cols = '30px 90px ' + new Array(n).fill('76px').join(' ');
        var h = '<div class="ws-section"><div class="ws-section-title"><i class="fa fa-table"></i> 每场详情' + shareBtnHtml() + '</div>';
        h += '<div class="ws-legend">'
            + '<span class="ws-lg"><i class="ws-lg-box s3"></i>三星</span>'
            + '<span class="ws-lg"><i class="ws-lg-box s2"></i>两星</span>'
            + '<span class="ws-lg"><i class="ws-lg-box s1"></i>一星</span>'
            + '<span class="ws-lg"><i class="ws-lg-box s0"></i>0星</span>'
            + '<span class="ws-lg"><i class="ws-lg-box na"></i>未进攻</span>'
            + '<span class="ws-lg"><i class="ws-lg-box none"></i>未参战</span>'
            + '</div>';
        h += '<div style="overflow-x:auto"><div class="ws-matrix" style="grid-template-columns:' + cols + ';width:' + totalW + 'px;">';
        h += '<div class="ws-mhead">#</div><div class="ws-mhead left">成员</div>';
        for (var ri = 0; ri < n; ri++) h += '<div class="ws-mhead">' + esc(s.warRows[ri].date) + '</div>';
        for (var mi2 = 0; mi2 < s.members.length; mi2++) {
            var m2 = s.members[mi2];
            h += '<div class="ws-mcell">' + (mi2 + 1) + '</div>';
            h += '<div class="ws-mcell name">' + esc(m2.name) + '</div>';
            for (var rj = 0; rj < n; rj++) {
                var rm = s.warRows[rj].members[m2.tag];
                var cell;
                if (!rm) {
                    cell = '<div class="ws-atk-box none"></div><div class="ws-atk-box none"></div>';
                } else {
                    var parts = [];
                    for (var pk = 0; pk < 2; pk++) {
                        var atk = rm.atks[pk];
                        if (!atk) {
                            // 未进攻：纯红纯色块（无文字）
                            parts.push('<div class="ws-atk-box na"></div>');
                        } else {
                            parts.push('<div class="ws-atk-box s' + atk.stars + '"><span class="ws-atk-stars">' + atk.stars + '</span><span class="ws-atk-dest">' + (atk.dest || 0) + '%</span></div>');
                        }
                    }
                    cell = parts.join('');
                }
                h += '<div class="ws-atk-cell">' + cell + '</div>';
            }
        }
        h += '</div></div>';
        h += '</div>';
        return h;
    }
    function buildAttack(s) {
        var h = '<div class="ws-section"><div class="ws-section-title"><i class="fa fa-users"></i> 成员表现排行' + shareBtnHtml() + '</div>';
        h += '<div style="overflow-x:auto"><table class="ws-table"><thead><tr>';
        h += '<th>#</th><th>成员</th><th>TH</th><th>参战</th><th>进攻</th><th>总星</th><th>贡献星</th><th>三星</th><th>三星率</th><th>0星率</th><th>均破坏</th><th>均攻位</th>';
        h += '</tr></thead><tbody>';
        for (var i2 = 0; i2 < s.members.length; i2++) {
            var m = s.members[i2];
            h += '<tr>';
            h += '<td>' + (i2 + 1) + '</td>';
            h += '<td class="ws-name">' + esc(m.name) + '</td>';
            h += '<td>' + (m.th || '') + '</td>';
            h += '<td>' + m.wars + '/' + s.wars + '</td>';
            h += '<td>' + m.attacks + '</td>';
            h += '<td class="num" style="color:var(--ws-accent)">' + m.totalStars + '</td>';
            h += '<td class="num" style="color:var(--ws-purple)">' + m.newStars + '</td>';
            h += '<td class="num" style="color:var(--ws-green)">' + m.attackStars[3] + '</td>';
            h += '<td class="num">' + m.threeRate + '%</td>';
            h += '<td class="num">' + m.zeroRate + '%</td>';
            h += '<td class="num">' + fp(m.avgDest) + '</td>';
            h += '<td class="num">' + (m.avgOppPos > 0 ? m.avgOppPos.toFixed(1) : '-') + '</td>';
            h += '</tr>';
        }
        h += '</tbody></table></div>';
        h += '</div>';
        return h;
    }
    function buildDefense(s) {
        var h = '<div class="ws-section"><div class="ws-section-title"><i class="fa fa-shield"></i> 防守表现' + shareBtnHtml() + '</div>';
        h += '<div style="overflow-x:auto"><table class="ws-table"><thead><tr>';
        h += '<th>#</th><th>成员</th><th>参战</th><th>被攻次数</th><th>被拿星</th><th>被三星率</th><th>防守效率</th>';
        h += '</tr></thead><tbody>';
        var defSorted = s.members.slice().sort(function (a, b) { return b.defended - a.defended; });
        var defCount = 0;
        for (var i3 = 0; i3 < defSorted.length; i3++) {
            var m3 = defSorted[i3];
            if (m3.defended === 0) continue;
            defCount++;
            var efficiency = m3.defended > 0 ? Math.round((1 - m3.defBestSum / (m3.defended * 3)) * 100) : 100;
            h += '<tr>';
            h += '<td>' + (defCount) + '</td>';
            h += '<td class="ws-name">' + esc(m3.name) + '</td>';
            h += '<td>' + m3.wars + '/' + s.wars + '</td>';
            h += '<td>' + m3.defended + '</td>';
            h += '<td class="num" style="color:var(--ws-red)">' + m3.defBestSum + '</td>';
            h += '<td class="num" style="color:var(--ws-red)">' + m3.defRate + '%</td>';
            h += '<td class="num" style="color:var(--ws-green)">' + efficiency + '%</td>';
            h += '</tr>';
        }
        if (defCount === 0) h += '<tr><td colspan="7" style="text-align:center;color:var(--ws-sub)">无防守数据（全部成员未被攻击）</td></tr>';
        h += '</tbody></table></div>';
        h += '</div>';
        return h;
    }
    function renderResults(s) {
        var h = ''
            + '<div class="ws-tab-bar" id="ws-tab-bar">'
            + '<button class="ws-tab-btn active" data-ws-tab="overview">概览</button>'
            + '<button class="ws-tab-btn" data-ws-tab="matches">统计</button>'
            + '<button class="ws-tab-btn" data-ws-tab="attack">进攻</button>'
            + '<button class="ws-tab-btn" data-ws-tab="defense">防御</button>'
            + '</div>'
            + '<div class="ws-tab-pane" data-ws-pane="overview">' + buildOverview(s) + '</div>'
            + '<div class="ws-tab-pane hidden" data-ws-pane="matches">' + buildMatches(s) + '</div>'
            + '<div class="ws-tab-pane hidden" data-ws-pane="attack">' + buildAttack(s) + '</div>'
            + '<div class="ws-tab-pane hidden" data-ws-pane="defense">' + buildDefense(s) + '</div>';
$('ws-result').innerHTML = h;
        bindWsTabs();
        bindShareButtons();
        // 注意提示（重复记录/未加载）→ 融合进提示卡
        var noteParts = [];
        if (s.dupCount > 0) noteParts.push('发现 ' + s.dupCount + ' 条重复记录（同一场战争被多次存档）已自动去重');
        if (s.failed > 0) noteParts.push('共查询 ' + s.totalQueried + ' 场，其中 ' + s.failed + ' 场未加载成功（未存档或网络错误）');
        if (noteParts.length) noteParts.push('实际统计 ' + s.wars + ' 场');
        _lastNote = noteParts.join('；');
        _cacheHint = '';
        renderTips();
        saveCache(h, _lastNote);
        EL.body.scrollTop = 0;
    }

    // ====== 四 tab 切换（独立胶囊按键，参考图鉴页形态切换 e-btn 样式） ======
    // 注意：不能用 dataset 标记防重绑——data-* 会被序列化进缓存 html，恢复缓存时新 bar 带标记导致永不绑定
    function bindWsTabs() {
        var bar = document.getElementById('ws-tab-bar');
        if (!bar) return;
        bar.addEventListener('click', function (e) {
            var btn = e.target.closest ? e.target.closest('.ws-tab-btn') : null;
            if (!btn || !btn.getAttribute('data-ws-tab')) return;
            var key = btn.getAttribute('data-ws-tab');
            bar.querySelectorAll('.ws-tab-btn').forEach(function (b) { b.classList.toggle('active', b === btn); });
            document.querySelectorAll('.ws-tab-pane').forEach(function (p) { p.classList.toggle('hidden', p.getAttribute('data-ws-pane') !== key); });
        });
    }

    // ====== 提示（缓存/注意融合进配置面板，倒三角展开/折叠） ======
    function renderTips() {
        var toggle = document.getElementById('ws-tip-toggle');
        var content = document.getElementById('ws-tip-content');
        if (!toggle || !content) return;
        if (!_cacheHint && !_lastNote) {
            toggle.style.display = 'none';
            content.classList.add('hidden');
            return;
        }
        toggle.style.display = '';
        var html = '';
        if (_cacheHint) html += '<div class="ws-tip-line"><span class="ws-tip-badge">缓存</span>' + _cacheHint + '</div>';
        if (_lastNote) html += '<div class="ws-tip-line"><span class="ws-tip-badge">注意</span>' + _lastNote + '</div>';
        content.innerHTML = html;
        // 复位为折叠态（提示完全隐藏）
        content.classList.add('hidden');
        toggle.textContent = '\u25BE';
    }
    function bindTipToggle() {
        var toggle = document.getElementById('ws-tip-toggle');
        if (!toggle || toggle.dataset.tipBound) return;
        toggle.dataset.tipBound = '1';
        toggle.addEventListener('click', function () {
            var content = document.getElementById('ws-tip-content');
            if (!content) return;
            if (content.classList.contains('hidden')) {
                content.classList.remove('hidden');
                toggle.textContent = '\u25B4';
            } else {
                content.classList.add('hidden');
                toggle.textContent = '\u25BE';
            }
        });
    }

    // ====== 表格分享（生成完整图片 → 保存相册/社交分享） ======
    var SHARE_SVG = '<svg width="20" height="20" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M34 6H14C9.58172 6 6 9.58172 6 14V34C6 38.4183 9.58172 42 14 42H34C38.4183 42 42 38.4183 42 34V14C42 9.58172 38.4183 6 34 6Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M24 32C28.4183 32 32 28.4183 32 24C32 19.5817 28.4183 16 24 16C19.5817 16 16 19.5817 16 24C16 28.4183 19.5817 32 24 32Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M35 15C36.1046 15 37 14.1046 37 13C37 11.8954 36.1046 11 35 11C33.8954 11 33 11.8954 33 13C33 14.1046 33.8954 15 35 15Z" fill="currentColor"/></svg>';
    function shareBtnHtml() {
        return '<button class="ws-share-btn" title="分享表格">' + SHARE_SVG + '</button>';
    }
    function bindShareButtons() {
        document.querySelectorAll('.ws-share-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var section = btn.closest('.ws-section');
                if (!section) return;
                var root = section.querySelector('.ws-matrix') || section.querySelector('.ws-table');
                if (root) openSharePreview(root, section);
            });
        });
    }
    function roundRectPath(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }
    // 把表格 DOM 绘制为 canvas 图片（白底、含标题与颜色图例、按实际布局尺寸）
    function tableToCanvas(section) {
        var matrix = section.querySelector('.ws-matrix') || section.querySelector('.ws-table');
        if (!matrix) return '';
        var pad = 20;
        var title = section.querySelector('.ws-section-title');
        var topEl = title || matrix;
        var mRect = matrix.getBoundingClientRect();
        var tRect = topEl.getBoundingClientRect();
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(mRect.width, tRect.width) + pad * 2;
        canvas.height = (mRect.bottom - tRect.top) + pad * 2;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        var ox = tRect.left - pad, oy = tRect.top - pad;
        var legendInfo = null;
        // 滚动补偿：元素视口坐标受祖先滚动容器影响（矩阵横向滑动/页面纵向滚动后分享会错位）
        // 递归累计滚动量：元素文档坐标 = rect - 视口 + 祖先滚动量累计
        function paint(el, sox, soy, sticky) {
            var cls = el.className || '';
            if (cls.indexOf('ws-share-btn') >= 0) return;
            var cs = getComputedStyle(el);
            var isScroll = cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.overflowY === 'auto' || cs.overflowY === 'scroll';
            // sticky 元素视口坐标不随滚动变化（吸住），子树跳过滚动补偿（成员列滚动后仍正确）
            var isSticky = sticky || cs.position === 'sticky';
            var rect = el.getBoundingClientRect();
            var x = rect.left - ox + (isSticky ? 0 : sox);
            var y = rect.top - oy + (isSticky ? 0 : soy);
            var w = rect.width, h = rect.height;
            if (cls.indexOf('ws-legend') >= 0) {
                // 收集图例数据；分享图内固定一行绘制（不随手机宽度换行）
                legendInfo = { x: x, y: y, h: h, items: [] };
                Array.from(el.querySelectorAll('.ws-lg')).forEach(function (lg) {
                    var box = lg.querySelector('.ws-lg-box');
                    var bcs = box ? getComputedStyle(box) : null;
                    legendInfo.items.push({ text: lg.textContent.trim(), color: bcs ? bcs.backgroundColor : '#9ca3af' });
                });
                return;
            }
            if (cls.indexOf('ws-section-title') >= 0) {
                var t = (el.textContent || '').trim();
                if (t) {
                    ctx.fillStyle = cs.color;
                    ctx.font = 'bold 15px ' + (cs.fontFamily || 'sans-serif');
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(t, x + 2, y + h / 2);
                }
                return;
            }
            if (cls.indexOf('ws-lg-box') >= 0) {
                ctx.fillStyle = cs.backgroundColor;
                roundRectPath(ctx, x, y, w, h, 3);
                ctx.fill();
                return;
            }
            if (cls.indexOf('ws-atk-box') >= 0) {
                ctx.fillStyle = cs.backgroundColor;
                roundRectPath(ctx, x, y, w, h, 8);
                ctx.fill();
                for (var i = 0; i < el.children.length; i++) {
                    var sp = el.children[i];
                    var sr = sp.getBoundingClientRect();
                    var scs = getComputedStyle(sp);
                    ctx.fillStyle = scs.color;
                    ctx.font = (scs.fontWeight === '700' ? 'bold ' : '') + scs.fontSize + ' ' + (scs.fontFamily || 'sans-serif');
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    // 文字与色块同坐标系（加滚动补偿）
                    ctx.fillText(sp.textContent, sr.left - ox + (isSticky ? 0 : sox) + sr.width / 2, sr.top - oy + (isSticky ? 0 : soy) + sr.height / 2);
                }
                return;
            }
            var isCell = cls.indexOf('ws-mhead') >= 0 || cls.indexOf('ws-mcell') >= 0 || el.tagName === 'TH' || el.tagName === 'TD';
            if (isCell) {
                var txt = (el.textContent || '').trim();
                if (txt) {
                    ctx.fillStyle = cs.color;
                    ctx.font = (cs.fontWeight === '600' ? 'bold ' : '') + cs.fontSize + ' ' + (cs.fontFamily || 'sans-serif');
                    var align = cs.textAlign === 'left' ? 'left' : 'center';
                    ctx.textAlign = align;
                    ctx.textBaseline = 'middle';
                    ctx.fillText(txt, align === 'left' ? x + 8 : x + w / 2, y + h / 2, w - 12);
                }
                ctx.strokeStyle = '#e5e7eb';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x, y + h);
                ctx.lineTo(x + w, y + h);
                ctx.stroke();
                return;
            }
            for (var j = 0; j < el.children.length; j++) {
                paint(el.children[j], isSticky ? 0 : sox + (isScroll ? (el.scrollLeft || 0) : 0), isSticky ? 0 : soy + (isScroll ? (el.scrollTop || 0) : 0), isSticky);
            }
        }
        for (var k = 0; k < section.children.length; k++) paint(section.children[k], 0, 0, false);
        // 固定一行绘制图例（不受手机宽度换行影响）
        if (legendInfo && legendInfo.items.length) {
            var lx = legendInfo.x, ly = legendInfo.y + legendInfo.h / 2, lstep = 0;
            legendInfo.items.forEach(function (it) {
                ctx.fillStyle = it.color;
                roundRectPath(ctx, lx + lstep, ly - 7, 14, 14, 3);
                ctx.fill();
                ctx.fillStyle = '#6b7280';
                ctx.font = '12px sans-serif';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText(it.text, lx + lstep + 18, ly);
                lstep += 18 + it.text.length * 12 + 16;
            });
        }
        return canvas.toDataURL('image/png');
    }
    function dataUriToBlob(dataUrl) {
        var parts = dataUrl.split(',');
        var mime = (parts[0].match(/data:([^;]+)/) || [])[1] || 'image/png';
        var bin = atob(parts[1]);
        var arr = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return new Blob([arr], { type: mime });
    }
    // 网页版降级：下载 PNG
    function downloadImage(dataUrl) {
        var a = document.createElement('a');
        a.href = dataUrl;
        a.download = 'war_stats.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
    }
    // 网页版降级：Web Share API（不支持则下载）
    function webShareImage(dataUrl) {
        try {
            var file = new File([dataUriToBlob(dataUrl)], 'war_stats.png', { type: 'image/png' });
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                navigator.share({ files: [file], title: '部落战统计' });
            } else {
                downloadImage(dataUrl);
                showShareToast('已下载图片，可自行分享');
            }
        } catch (e) {
            downloadImage(dataUrl);
            showShareToast('已下载图片，可自行分享');
        }
    }
    function ensureShareModal() {
        if (document.getElementById('ws-share-modal')) return;
        var m = document.createElement('div');
        m.className = 'modal-overlay hidden';
        m.id = 'ws-share-modal';
        m.innerHTML = ''
            + '<div class="modal-card w-sm" style="text-align:center;">'
            + '<div style="font-size:15px;font-weight:600;color:#1f2937;margin-bottom:10px;">分享统计表</div>'
            + '<img id="ws-share-img" style="width:100%;border-radius:8px;background:#fff;">'
            + '<div style="display:flex;gap:8px;margin-top:12px;">'
            + '<button class="ws-share-action save" id="ws-share-save-btn">保存到相册</button>'
            + '<button class="ws-share-action send" id="ws-share-send-btn">分享</button>'
            + '<button class="ws-share-action cancel" id="ws-share-cancel-btn">取消</button>'
            + '</div>'
            + '</div>';
        document.body.appendChild(m);
        m.addEventListener('click', function (e) { if (e.target === m) m.classList.add('hidden'); });
        $('ws-share-cancel-btn').addEventListener('click', function () { m.classList.add('hidden'); });
        $('ws-share-save-btn').addEventListener('click', function () {
            var img = $('ws-share-img');
            if (!img || !img.dataset.b64) { showShareToast('图片生成失败'); return; }
            if (window.AndroidApp && window.AndroidApp.saveImageToGallery) {
                window.AndroidApp.saveImageToGallery(img.dataset.b64);
            } else {
                downloadImage(img.src);
                showShareToast('已下载图片，可自行分享');
            }
        });
        $('ws-share-send-btn').addEventListener('click', function () {
            var img = $('ws-share-img');
            if (!img || !img.dataset.b64) { showShareToast('图片生成失败'); return; }
            if (window.AndroidApp && window.AndroidApp.shareImage) {
                window.AndroidApp.shareImage(img.dataset.b64);
            } else {
                webShareImage(img.src);
            }
        });
    }
    function showShareToast(msg) {
        var t = document.getElementById('ws-share-toast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'ws-share-toast';
            t.style.cssText = 'position:fixed;left:50%;bottom:80px;transform:translateX(-50%);background:rgba(0,0,0,0.75);color:#fff;padding:8px 16px;border-radius:8px;font-size:13px;z-index:80;';
            document.body.appendChild(t);
        }
        t.textContent = msg;
        t.style.display = 'block';
        clearTimeout(showShareToast._t);
        showShareToast._t = setTimeout(function () { t.style.display = 'none'; }, 1500);
    }
    function openSharePreview(root, section) {
        var dataUrl;
        try {
            // 离屏无头 DOM 重建：复制 section 到离屏容器（无滚动状态、sticky 无容器失效、固定浅色变量）
            // 生成图片完全不受展示页滚动/布局影响，所有用户导出格式一致
            var off = document.createElement('div');
            off.style.cssText = 'position:fixed;left:-99999px;top:0;visibility:hidden;'
                + '--ws-card:#ffffff;--ws-text:#1f2937;--ws-sub:#6b7280;--ws-border:#e5e7eb;'
                + '--ws-accent:#3b82f6;--ws-green:#10b981;--ws-red:#ef4444;--ws-yellow:#f59e0b;--ws-purple:#8b5cf6;';
            off.innerHTML = section.outerHTML;
            document.body.appendChild(off);
            var offSection = off.querySelector('.ws-section');
            dataUrl = tableToCanvas(offSection);
            off.remove();
        } catch (e) {
            showShareToast('图片生成失败: ' + e.message);
            return;
        }
        if (!dataUrl) { showShareToast('图片生成失败'); return; }
        ensureShareModal();
        var img = $('ws-share-img');
        img.src = dataUrl;
        img.dataset.b64 = dataUrl.split(',')[1] || '';
        $('ws-share-modal').classList.remove('hidden');
    }

    // ====== 配置面板 ======
    function renderPanel() {
        _fromVal = todayStr(-90);
        _toVal = todayStr(0);
        $('ws-body-inner').innerHTML = ''
            + '<div class="ws-panel">'
            + '<div class="ws-clan-name">' + (_clanBadge ? '<img class="ws-clan-badge" src="' + esc(_clanBadge) + '" onerror="this.style.display=\'none\'">' : '<i class="fa fa-shield"></i>') + esc(_clanName) + '</div>'
            + '<div class="ws-date-row">'
            + '<div class="ws-field"><label>开始日期</label><button class="ws-date-btn" id="ws-date-from-btn">' + _fromVal + '</button></div>'
            + '<div class="ws-field"><label>结束日期</label><button class="ws-date-btn" id="ws-date-to-btn">' + _toVal + '</button></div>'
            + '</div>'
            + '<button class="ws-query-btn" id="ws-query-btn"><i class="fa fa-search" style="margin-right:6px;"></i>开始统计</button>'
            + '<button class="ws-tip-toggle" id="ws-tip-toggle" style="display:none;">&#x25BE;</button>'
            + '<div class="ws-tip-content hidden" id="ws-tip-content"></div>'
            + '</div>'
            + '<div id="ws-result"></div>';
        bindTipToggle();
        var fb = $('ws-date-from-btn');
        if (fb) fb.addEventListener('click', function () { openCalendar('from'); });
        var tb = $('ws-date-to-btn');
        if (tb) tb.addEventListener('click', function () { openCalendar('to'); });
        var btn = $('ws-query-btn');
        if (btn) btn.addEventListener('click', query);
    }

    // ====== 日历选择弹窗（App 风格 modal-overlay + modal-card） ======
    function ensureCalModal() {
        if (document.getElementById('ws-calendar-modal')) return;
        var m = document.createElement('div');
        m.className = 'modal-overlay hidden z-higher';
        m.id = 'ws-calendar-modal';
        m.innerHTML = ''
            + '<div class="modal-card w-xs">'
            + '<div class="ws-cal-head">'
            + '<button class="ws-cal-nav" id="ws-cal-prev">&#8249;</button>'
            + '<div class="ws-cal-title" id="ws-cal-title"></div>'
            + '<button class="ws-cal-nav" id="ws-cal-next">&#8250;</button>'
            + '</div>'
            + '<div class="ws-cal-week"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div>'
            + '<div class="ws-cal-grid" id="ws-cal-grid"></div>'
            + '<div class="ws-cal-foot">'
            + '<button class="ws-cal-today" id="ws-cal-today">今天</button>'
            + '<button class="ws-cal-cancel" id="ws-cal-cancel">取消</button>'
            + '</div>'
            + '</div>';
        document.body.appendChild(m);
        m.addEventListener('click', function (e) { if (e.target === m) closeCalendar(); });
        $('ws-cal-prev').addEventListener('click', function () { _calMonth--; if (_calMonth < 0) { _calMonth = 11; _calYear--; } renderCalendar(); });
        $('ws-cal-next').addEventListener('click', function () { _calMonth++; if (_calMonth > 11) { _calMonth = 0; _calYear++; } renderCalendar(); });
        $('ws-cal-today').addEventListener('click', function () { pickDate(todayStr(0)); });
        $('ws-cal-cancel').addEventListener('click', closeCalendar);
        $('ws-cal-grid').addEventListener('click', function (e) {
            var c = e.target.closest ? e.target.closest('.ws-cal-day') : null;
            if (c && c.dataset.date) pickDate(c.dataset.date);
        });
    }
    function openCalendar(field) {
        _calField = field;
        var v = field === 'from' ? _fromVal : _toVal;
        if (v) { var p = v.split('-'); _calYear = +p[0]; _calMonth = +p[1] - 1; }
        else { var d = new Date(); _calYear = d.getFullYear(); _calMonth = d.getMonth(); }
        ensureCalModal();
        $('ws-calendar-modal').classList.remove('hidden');
        renderCalendar();
    }
    function closeCalendar() {
        var m = document.getElementById('ws-calendar-modal');
        if (m) m.classList.add('hidden');
    }
    function renderCalendar() {
        $('ws-cal-title').textContent = _calYear + '年' + (_calMonth + 1) + '月';
        var grid = $('ws-cal-grid');
        grid.innerHTML = '';
        var startDow = new Date(_calYear, _calMonth, 1).getDay();
        var dim = new Date(_calYear, _calMonth + 1, 0).getDate();
        var sel = _calField === 'from' ? _fromVal : _toVal;
        var today = todayStr(0);
        for (var i = 0; i < startDow; i++) {
            var blank = document.createElement('span');
            blank.className = 'ws-cal-day blank';
            grid.appendChild(blank);
        }
        for (var d = 1; d <= dim; d++) {
            var ds = _calYear + '-' + pad2(_calMonth + 1) + '-' + pad2(d);
            var cell = document.createElement('span');
            cell.textContent = d;
            cell.className = 'ws-cal-day';
            if (ds === sel) cell.classList.add('sel');
            if (ds === today) cell.classList.add('today');
            cell.dataset.date = ds;
            grid.appendChild(cell);
        }
    }
    function pickDate(ds) {
        if (_calField === 'from') _fromVal = ds; else _toVal = ds;
        var btn = $('ws-date-' + _calField + '-btn');
        if (btn) btn.textContent = ds;
        closeCalendar();
    }

    // ====== 生命周期 ======
    function open(tag, name, badge) {
        if (!tag) return;
        _tag = tag.replace(/^#/, '');
        _clanName = name || _tag;
        _clanBadge = badge || '';
        EL.view.classList.remove('hidden');
        EL.view.style.display = 'flex';
        renderPanel();
        // 有本部落缓存：直接展示上次统计结果（点击「开始统计」才重新统计覆盖）
var c = loadCache();
        if (c && c.html) {
            _cacheHint = '显示上次统计结果（' + fmtTime(c.ts) + '）；点击「开始统计」重新统计';
            _lastNote = c.note || '';
            $('ws-result').innerHTML = c.html;
            bindWsTabs();
            bindShareButtons();
            renderTips();
        }
    }
    function close() {
        EL.view.classList.add('hidden');
        EL.view.style.display = 'none';
    }
    function init() {
        EL.view = document.getElementById('war-stats-view');
        EL.body = document.getElementById('war-stats-body');
        if (!EL.view || !EL.body) return;
        EL.body.innerHTML = '<div id="ws-body-inner"></div>';
        var back = document.getElementById('war-stats-back-btn');
        if (back) back.addEventListener('click', close);
        var refresh = document.getElementById('war-stats-refresh-btn');
        if (refresh) refresh.addEventListener('click', function () { if (_tag) { renderPanel(); query(); } });
    }

    C.features.warStats = { open: open, close: close, init: init };
})(window);



