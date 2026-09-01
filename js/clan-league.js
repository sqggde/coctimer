// ========== 部落联赛模块 ==========

(function(global) {
    'use strict';

    var CocTool = global.CocTool;
    if (!CocTool || !CocTool.clan || !CocTool.clan.shared) {
        throw new Error('clan-league.js requires clan.js');
    }

    var shared = CocTool.clan.shared;
    var el = shared.el;
    var showToast = shared.showToast;
    var parseCocTime = shared.parseCocTime;
    var saveModeMap = shared.saveModeMap;
    var hideAllDetailViews = shared.hideAllDetailViews;
    var fetchCurrentWar = shared.fetchCurrentWar;
    var CLAN_API_BASE = CocTool.apiBase;
    var APP_TOKEN = CocTool.appToken;

    var _leagueGroup = null;
    var _leagueWars = {};
    var _leagueRound = -1;
    var _leagueFallbacked = false;
    var _leagueForceAdvance = false;
    var _leagueForceWar = false;

    // ====== 联赛 ======

    var LEAGUE_CACHE_TTL = 60000;       // leaguegroup 固定 TTL 兜底（正常按自然过期推算）
    var LEAGUE_WAR_CACHE_TTL = 10 * 60 * 1000; // inWar war 缓存（10 分钟，对齐部落战 CACHE_TTL_INWAR）
    var LEAGUE_WAR_ENDED_TTL = 90 * 24 * 3600 * 1000; // warEnded 长期缓存（赛季内）
    var _leagueGroupKey = null;

    function getLeagueCacheKey(tag) { return 'clash_league_' + tag.replace(/^#/, ''); }

    function getLeagueWarCacheKey(warTag) { return 'clash_league_war_' + warTag.replace(/^#/, ''); }

    function getLeagueCached(key, ttl) {
        try {
            var raw = localStorage.getItem(key);
            if (!raw) return null;
            var obj = JSON.parse(raw);
            if (obj && obj.ts && (Date.now() - obj.ts) < ttl) return obj.data;
        } catch (e) {}
        return null;
    }

    function setLeagueCached(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data: data }));
        } catch (e) {}
    }

    // war 详情缓存：按状态自然过期（preparation → 该轮 startTime；inWar → 30s；warEnded → 长期）
    function getLeagueWarCached(key) {
        try {
            var raw = localStorage.getItem(key);
            if (!raw) return null;
            var obj = JSON.parse(raw);
            if (obj && obj.expiry && Date.now() < obj.expiry) return obj.data;
        } catch (e) {}
        return null;
    }

    function setLeagueWarCached(key, data) {
        try {
            var expiry;
            if (data.state === 'preparation' && data.startTime) {
                var st = parseCocTime(data.startTime);
                expiry = st > Date.now() ? st : Date.now() + LEAGUE_WAR_CACHE_TTL;
            } else if (data.state === 'warEnded') {
                expiry = Date.now() + LEAGUE_WAR_ENDED_TTL;
            } else {
                expiry = Date.now() + LEAGUE_WAR_CACHE_TTL;
            }
            localStorage.setItem(key, JSON.stringify({ ts: Date.now(), expiry: expiry, data: data }));
        } catch (e) {}
    }

    // 本部落 warTag 记忆（轮次→warTag，跨天持久，联赛期间固定）
    var LEAGUE_MINE_KEY = 'clash_league_mine_';
    var _leagueMine = {};

    function loadLeagueMine(cleanTag) {
        _leagueMine = {};
        try {
            var raw = localStorage.getItem(LEAGUE_MINE_KEY + cleanTag);
            if (raw) {
                var p = JSON.parse(raw);
                if (p && typeof p === 'object') _leagueMine = p;
            }
        } catch (e) {}
    }

    function saveLeagueMine(cleanTag) {
        try { localStorage.setItem(LEAGUE_MINE_KEY + cleanTag, JSON.stringify(_leagueMine)); } catch (e) {}
    }

    // leaguegroup 组标识：season + '|' + 8 部落 tag 排序拼接（同组任一部落计算一致）
    function computeGroupKey(group) {
        if (!group || !group.season || !group.clans || !group.clans.length) return null;
        return group.season + '|' + group.clans.map(function(c) { return c.tag; }).sort().join(',');
    }

    // 读取 war 详情原始缓存（无视 TTL，数据长期保留用于推算）
    function getLeagueWarRaw(warTag) {
        try {
            var raw = localStorage.getItem(getLeagueWarCacheKey(warTag));
            if (!raw) return null;
            return JSON.parse(raw).data;
        } catch (e) { return null; }
    }

    // 找某轮有缓存数据的 war（记忆 warTag 优先，否则遍历）
    function findRoundWarRaw(group, roundIdx, cleanTag) {
        var war = null;
        var mineMap = {};
        try { mineMap = JSON.parse(localStorage.getItem(LEAGUE_MINE_KEY + cleanTag) || '{}'); } catch (e) {}
        var mineTag = mineMap[roundIdx];
        if (mineTag) war = getLeagueWarRaw(mineTag);
        if (!war) {
            var rt = (group.rounds[roundIdx] && group.rounds[roundIdx].warTags) || [];
            for (var j = 0; j < rt.length; j++) {
                war = getLeagueWarRaw(rt[j]);
                if (war) break;
            }
        }
        return war;
    }

    // 联赛阶段推算（24h 规律，纯本地零请求）：基于 calc.leaguePhaseInfo 单一实现
    // 基准 = 最后解锁轮 L' 的 war startTime（该轮战斗日开始）
    // 返回 { label, kind, target }：联赛准备（蓝）/ 联赛·D{n}（紫）；联赛结束或数据不足 → null
    function getLeaguePhase(cleanTag) {
        try {
            var raw = localStorage.getItem(getLeagueCacheKey(cleanTag));
            if (!raw) return null;
            var group = JSON.parse(raw).data;
            if (!group || !group.rounds) return null;
            var L = -1;
            for (var i = 6; i >= 0; i--) {
                var tags = (group.rounds[i] && group.rounds[i].warTags) || [];
                if (tags.some(function(t) { return t && t !== '#0' && t.indexOf('#') === 0; })) { L = i; break; }
            }
            if (L < 0) return null;
            var war = findRoundWarRaw(group, L, cleanTag);
            if (!war || !war.startTime) return null;
            var startK = parseCocTime(war.startTime);
            var K = L + 1;
            var info = CocTool.calc.leaguePhaseInfo(startK, K, Date.now());
            if (info.kind === 'ended') return null;
            var DAY = 24 * 3600 * 1000;
            if (info.kind === 'prep') {
                return { label: '联赛准备', kind: 'prep', target: startK - (K - 1) * DAY };
            }
            var times = CocTool.calc.leagueRoundTimes(startK, K, info.n);
            return { label: '联赛·D' + info.n, kind: 'war', target: times.end };
        } catch (e) { return null; }
    }

    // leaguegroup 缓存自然过期：leaguegroup 只在每个战斗日开始时刻变化（新增下一轮 4 个 warTag）
    // 缓存有效 ⟺ 最后解锁轮 L' 的战斗日尚未开始（rounds 未变化）；无 war 基准 → 视为过期（重新请求）
    function getLeagueCachedNatural(cleanTag) {
        try {
            var raw = localStorage.getItem(getLeagueCacheKey(cleanTag));
            if (!raw) return null;
            var obj = JSON.parse(raw);
            if (!obj || !obj.data || !obj.data.rounds) return null;
            var group = obj.data;
            var L = -1;
            for (var i = 6; i >= 0; i--) {
                var tags = (group.rounds[i] && group.rounds[i].warTags) || [];
                if (tags.some(function(t) { return t && t !== '#0' && t.indexOf('#') === 0; })) { L = i; break; }
            }
            if (L < 0) return null;
            var war = findRoundWarRaw(group, L, cleanTag);
            if (!war || !war.startTime) return null;
            return Date.now() < parseCocTime(war.startTime) ? obj.data : null;
        } catch (e) { return null; }
    }

    // 清空对战视图动态内容（防跨部落残留：上个部落的对战渲染遗留在 detailPrep，
    // 后续部落 404/失败显示提示时会露出旧数据——小程序数据驱动渲染无此问题）
    function clearPrepDynamicContent() {
        ['prep-home-members', 'prep-away-members', 'prep-war-stats'].forEach(function(id) {
            var e = document.getElementById(id);
            if (e) e.innerHTML = '';
        });
        ['prep-home-badge', 'prep-away-badge'].forEach(function(id) {
            var e = document.getElementById(id);
            if (e) e.src = '';
        });
        ['prep-home-name', 'prep-away-name', 'prep-state-label', 'prep-team-size', 'prep-countdown', 'prep-result-label'].forEach(function(id) {
            var e = document.getElementById(id);
            if (e) e.textContent = '';
        });
        var cd = document.getElementById('prep-countdown-mode');
        var rs = document.getElementById('prep-result-mode');
        if (cd) cd.style.display = '';
        if (rs) rs.style.display = 'none';
    }

    function resetLeagueState() {
        // 仅清理联赛视图数据，保留 shared._leagueMode 模式记忆（部落战/联赛平级，跨部落保持）
        _leagueGroup = null;
        _leagueGroupKey = null;
        _leagueWars = {};
        _leagueRound = -1;
        shared._leagueClanTag = null;
        _leagueFallbacked = false;
        _leagueForceAdvance = false;
        _leagueForceWar = false;
        clearPrepDynamicContent();
        if (el.leagueTabList) el.leagueTabList.innerHTML = '';
        if (el.leagueTabs) el.leagueTabs.classList.add('hidden');
        if (el.detailPrep) el.detailPrep.style.paddingTop = '';
        if (shared._countdownTimer) { clearInterval(shared._countdownTimer); shared._countdownTimer = null; }
        if (el.detailEmpty) {
            var p = el.detailEmpty.querySelector('p');
            if (p && p.textContent !== '暂无数据') p.textContent = '暂无数据';
        }
    }

    function switchToWarMode() {
        if (!shared._leagueMode) return;
        shared._leagueMode = false;
        if (shared._currentClan) shared._modeMap[(shared._currentClan.tag || '').replace(/^#/, '')] = 'war';
        saveModeMap();
        resetLeagueState();
        updateModeTabs();
        hideAllDetailViews();
        if (el.detailLoading) el.detailLoading.classList.remove('hidden');
        if (shared._currentClan) fetchCurrentWar(shared._currentClan.tag.replace(/^#/, ''));
    }

    function switchToLeagueMode() {
        if (shared._leagueMode || !shared._currentClan) return;
        shared._leagueMode = true;
        if (shared._currentClan) shared._modeMap[(shared._currentClan.tag || '').replace(/^#/, '')] = 'league';
        saveModeMap();
        loadLeagueMine((shared._currentClan.tag || '').replace(/^#/, ''));
        _leagueFallbacked = false;
        shared._leagueClanTag = (shared._currentClan.tag || '').indexOf('#') === 0 ? shared._currentClan.tag : '#' + shared._currentClan.tag;
        updateModeTabs();
        hideAllDetailViews();
        if (el.detailLoading) el.detailLoading.classList.remove('hidden');
        fetchLeagueGroup(shared._leagueClanTag, false);
    }

    function updateModeTabs() {
        if (!el.modeWarTab || !el.modeLeagueTab) return;
        if (shared._leagueMode) {
            el.modeWarTab.classList.add('inactive');
            el.modeLeagueTab.classList.remove('inactive');
        } else {
            el.modeWarTab.classList.remove('inactive');
            el.modeLeagueTab.classList.add('inactive');
        }
        // 部落战刷新键独占一行，仅部落战模式显示；联赛刷新键在联赛标题行内
        if (el.detailToolbar) el.detailToolbar.style.display = shared._leagueMode ? 'none' : '';
    }

    function fetchLeagueGroup(tag, force) {
        var key = getLeagueCacheKey(tag);
        if (!force) {
            // 自然过期：leaguegroup 只在战斗日开始时刻变化，缓存有效则零请求；换轮后自动重新请求
            var cached = getLeagueCachedNatural(tag.replace(/^#/, ''));
            if (cached) {
                renderLeague(cached);
                return;
            }
        }
        var url = CLAN_API_BASE + '/api/coc/warleague/' + encodeURIComponent(tag);
        fetch(url, {
            headers: { 'X-App-Token': APP_TOKEN }
        })
            .then(function(r) {
                if (r.status === 404) throw { leagueNotFound: true };
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function(group) {
                setLeagueCached(key, group);
                // 赛季变化 → 清空轮次→warTag 记忆（防跨月残留：8 月 warTag 被 9 月轮次复用显示旧对战）
                var newSeason = (group.season || '').slice(0, 7);
                if ((_leagueMine.season || '') !== newSeason) {
                    _leagueMine = { season: newSeason };
                    if (shared._currentClan) saveLeagueMine(shared._currentClan.tag.replace(/^#/, ''));
                }
                _leagueGroupKey = computeGroupKey(group);
                renderLeague(group);
            })
            .catch(function(err) {
                _leagueForceWar = false;
                if (!shared._leagueMode) return;
                if (err && err.leagueNotFound) {
                    // 模式切换由用户控制（点哪个就是哪个）：不自动切回部落战，停留联赛模式显示提示
                    showToast('该部落未参加联赛或非联赛期间', 2000);
                    hideAllDetailViews();
                    if (el.leagueTabs) el.leagueTabs.classList.remove('hidden');
                    if (el.detailPrep) el.detailPrep.classList.remove('hidden');
                    if (el.detailEmpty) {
                        var p = el.detailEmpty.querySelector('p');
                        if (p) p.textContent = '该部落未参加联赛或非联赛期间';
                        el.detailEmpty.classList.remove('hidden');
                    }
                    return;
                }
                showToast('获取联赛信息失败', 2000);
                // 无任何可用数据：显示联赛标题行 + 刷新键作为重试入口（prep 视图承载）
                var hasData = cached || (_leagueGroup && _leagueGroup.rounds);
                if (!hasData) {
                    hideAllDetailViews();
                    if (el.detailPrep) el.detailPrep.classList.remove('hidden');
                    if (el.leagueTabs) el.leagueTabs.classList.remove('hidden');
                    if (el.detailEmpty) {
                        var p = el.detailEmpty.querySelector('p');
                        if (p) p.textContent = '加载失败，请点击刷新重试';
                        el.detailEmpty.classList.remove('hidden');
                    }
                } else if (force && _leagueRound >= 0) {
                    selectLeagueRound(_leagueRound);
                }
            });
    }

    function refreshLeague(force) {
        if (!shared._leagueMode || !shared._leagueClanTag) return;
        // 强制刷新：同时重拉当前轮 war 详情（战况数据实时变化，不能命中缓存）
        if (force) _leagueForceWar = true;
        // 立即给加载反馈（与部落战刷新一致）
        hideAllDetailViews();
        if (el.detailLoading) el.detailLoading.classList.remove('hidden');
        fetchLeagueGroup(shared._leagueClanTag, !!force);
    }

    // 手动刷新战况：只请求本部落 warTag（记忆缺失时该轮全量补齐），不刷 leaguegroup
    function refreshLeagueWar() {
        if (!shared._leagueMode || !shared._currentClan) return;
        if (_leagueRound < 0 || !_leagueGroup) return;
        _leagueForceWar = true;
        selectLeagueRound(_leagueRound);
    }

    function isRoundUnlocked(group, i) {
        var tags = (group.rounds[i] && group.rounds[i].warTags) || [];
        return tags.some(function(t) { return t && t !== '#0' && t.indexOf('#') === 0; });
    }

    function renderLeague(group) {
        _leagueGroup = group;
        _leagueGroupKey = computeGroupKey(group);
        if (el.leagueTabs) el.leagueTabs.classList.remove('hidden');

        var season = group.season || '';
        var m = season.length >= 7 ? parseInt(season.slice(5, 7), 10) : 0;
        if (el.leagueTitle) {
            el.leagueTitle.textContent = '联赛' + (season ? ' ' + season.slice(0, 7) : '');
        }

        var unlocked = [];
        for (var i = 0; i < 7; i++) unlocked.push(isRoundUnlocked(group, i));

        var cur = -1;
        for (var i = 6; i >= 0; i--) {
            if (unlocked[i]) { cur = i; break; }
        }
        renderLeagueTabList(unlocked, cur);

        if (_leagueForceAdvance) {
            // 战斗日结束自动推进到最新解锁轮
            _leagueForceAdvance = false;
            _leagueRound = cur;
        } else if (_leagueRound < 0 || !unlocked[_leagueRound]) {
            _leagueRound = cur;
        }

        if (cur < 0) {
            hideAllDetailViews();
            // 显示联赛标题行 + 刷新键（prep 视图承载），等待匹配期间可刷新
            if (el.detailPrep) el.detailPrep.classList.remove('hidden');
            if (el.detailEmpty) {
                var p = el.detailEmpty.querySelector('p');
                if (p) p.textContent = '报名已提交，等待匹配对战…';
                el.detailEmpty.classList.remove('hidden');
            }
            return;
        }
        selectLeagueRound(_leagueRound);
    }

    function renderLeagueTabList(unlocked, cur) {
        if (!el.leagueTabList) return;
        el.leagueTabList.innerHTML = '';
        for (var i = 0; i < 7; i++) {
            (function(i) {
                var b = document.createElement('button');
                b.textContent = '第' + (i + 1) + '天';
                b.className = 'league-tab';
                if (unlocked[i]) {
                    if (i === cur) b.classList.add('active');
                    b.addEventListener('click', function() { _leagueFallbacked = true; selectLeagueRound(i); });
                } else {
                    b.classList.add('locked');
                    b.addEventListener('click', function() { showToast('该轮对战尚未开始', 1500); });
                }
                el.leagueTabList.appendChild(b);
            })(i);
        }
    }

    function updateLeagueTabActive(i) {
        if (!el.leagueTabList) return;
        var bs = el.leagueTabList.querySelectorAll('.league-tab');
        for (var k = 0; k < bs.length; k++) {
            if (k === i) bs[k].classList.add('active');
            else bs[k].classList.remove('active');
        }
    }

    function selectLeagueRound(i) {
        if (!_leagueGroup || !_leagueGroup.rounds || !_leagueGroup.rounds[i]) return;
        var tags = _leagueGroup.rounds[i].warTags || [];
        var realTags = [];
        for (var t = 0; t < tags.length; t++) {
            if (tags[t] && tags[t] !== '#0' && tags[t].indexOf('#') === 0) realTags.push(tags[t]);
        }
        if (!realTags.length) { showToast('该轮对战尚未开始', 1500); return; }
        _leagueRound = i;
        updateLeagueTabActive(i);

        var cached = _leagueWars[i];
        if (cached && cached.mine && !_leagueForceWar) {
            hideAllDetailViews();
            showLeagueWar(cached.mine);
            return;
        }

        if (el.detailLoading) el.detailLoading.classList.remove('hidden');

        var mineTag = _leagueMine[i];
        if (mineTag) {
            // 记忆 warTag：只请求 1 个（缓存命中 0 请求）
            fetchLeagueWar(mineTag).then(function(w) {
                _leagueForceWar = false;
                if (_leagueRound !== i) return;
                if (w && w.clan && (w.clan.tag === shared._leagueClanTag || (w.opponent && w.opponent.tag === shared._leagueClanTag))) {
                    _leagueWars[i] = { mine: w };
                    hideAllDetailViews();
                    showLeagueWar(w);
                    maybeFallbackToOngoingRound(i, w);
                } else {
                    // 记忆失效 → 清记忆 + 全量回退
                    delete _leagueMine[i];
                    if (shared._currentClan) saveLeagueMine(shared._currentClan.tag.replace(/^#/, ''));
                    fetchRoundFull(i, realTags);
                }
            }).catch(function() {
                _leagueForceWar = false;
                if (_leagueRound === i) {
                    hideAllDetailViews();
                    if (el.detailEmpty) el.detailEmpty.classList.remove('hidden');
                    showToast('获取对战信息失败', 2000);
                }
            });
            return;
        }

        // 无记忆：先查服务器存档（本地接口，不消耗官方配额），未命中再全量官方
        fetchLeagueWarHistory(i + 1).then(function(res) {
            if (_leagueRound !== i) return;
            var wars = (res && res.wars) || [];
            var mine = null, mineWarTag = null;
            for (var k = 0; k < wars.length; k++) {
                var w = wars[k].data;
                if (w && w.clan && (w.clan.tag === shared._leagueClanTag || (w.opponent && w.opponent.tag === shared._leagueClanTag))) {
                    mine = w; mineWarTag = wars[k].warTag; break;
                }
            }
            if (mine) {
                // 存档命中：写入本地缓存 + 记忆 warTag
                if (mineWarTag) {
                    setLeagueWarCached(getLeagueWarCacheKey(mineWarTag), mine);
                    _leagueMine[i] = mineWarTag;
                    if (shared._currentClan) saveLeagueMine(shared._currentClan.tag.replace(/^#/, ''));
                }
                _leagueWars[i] = { mine: mine };
                hideAllDetailViews();
                showLeagueWar(mine);
                maybeFallbackToOngoingRound(i, mine);
                return;
            }
            // 存档未命中（进行中/准备日轮次或存档缺失）→ 全量官方
            fetchRoundFull(i, realTags);
        });
    }

    function fetchRoundFull(i, realTags) {
        var pending = [];
        for (var r = 0; r < realTags.length; r++) pending.push(fetchLeagueWar(realTags[r]));
        Promise.all(pending)
            .then(function(list) {
                _leagueForceWar = false;
                var mine = null, mineWarTag = null;
                for (var k = 0; k < list.length; k++) {
                    var w = list[k];
                    if (w && w.clan && (w.clan.tag === shared._leagueClanTag || (w.opponent && w.opponent.tag === shared._leagueClanTag))) {
                        mine = w; mineWarTag = realTags[k]; break;
                    }
                }
                if (!mine) mine = list[0] || null;
                _leagueWars[i] = { mine: mine };
                if (mine && mineWarTag) {
                    // 记忆本部落 warTag：后续刷新/进入只请求 1 个
                    _leagueMine[i] = mineWarTag;
                    if (shared._currentClan) saveLeagueMine(shared._currentClan.tag.replace(/^#/, ''));
                }
                if (_leagueRound !== i) return;
                hideAllDetailViews();
                if (mine) {
                    showLeagueWar(mine);
                    maybeFallbackToOngoingRound(i, mine);
                } else if (el.detailEmpty) {
                    el.detailEmpty.classList.remove('hidden');
                }
            })
            .catch(function() {
                _leagueForceWar = false;
                if (_leagueRound === i) {
                    hideAllDetailViews();
                    if (el.detailEmpty) el.detailEmpty.classList.remove('hidden');
                    showToast('获取对战信息失败', 2000);
                }
            });
    }

    function maybeFallbackToOngoingRound(i, war) {
        // 自动选中到准备日轮次且存在更早解锁轮时，回退到更早轮（正在进行的对战）
        if (_leagueFallbacked || i <= 0) return;
        if (war.state !== 'preparation') return;
        if (!_leagueGroup || !_leagueGroup.rounds || !_leagueGroup.rounds[i - 1]) return;
        var prevTags = _leagueGroup.rounds[i - 1].warTags || [];
        var prevReal = prevTags.some(function(t) { return t && t !== '#0'; });
        if (!prevReal) return;
        _leagueFallbacked = true;
        selectLeagueRound(i - 1);
    }

    function fetchLeagueWar(warTag) {
        var key = getLeagueWarCacheKey(warTag);
        var cached = getLeagueWarCached(key);
        if (cached && !_leagueForceWar) return Promise.resolve(cached);
        var url = CLAN_API_BASE + '/api/coc/leaguewar/' + encodeURIComponent(warTag);
        // 携带 groupKey/season/day → 代理自动注册完整存档调度（warTag 全局唯一）
        if (_leagueGroupKey && _leagueGroup) {
            url += '?groupKey=' + encodeURIComponent(_leagueGroupKey) +
                '&season=' + encodeURIComponent(_leagueGroup.season || '') +
                '&day=' + (_leagueRound + 1);
        }
        return fetch(url, {
            headers: { 'X-App-Token': APP_TOKEN }
        }).then(function(r) {
            if (r.status === 404) return null;
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function(w) {
            if (w) setLeagueWarCached(key, w);
            return w;
        });
    }

    // 已结束轮次：服务器联赛存档查询（本地接口，不消耗官方配额）
    function fetchLeagueWarHistory(dayIndex) {
        if (!shared._currentClan || !_leagueGroup || !_leagueGroup.season) return Promise.resolve({ wars: [] });
        var url = CLAN_API_BASE + '/api/coc/leaguewar-history/' + encodeURIComponent(shared._currentClan.tag) +
            '/' + encodeURIComponent(_leagueGroup.season) + '/' + dayIndex;
        return fetch(url, {
            headers: { 'X-App-Token': APP_TOKEN }
        }).then(function(r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).catch(function() {
            return { wars: [] };
        });
    }

    function showLeagueWar(war) {
        // league war 的 clan/opponent 是联赛组视角（随机分配）：本部可能落在 opponent 侧
        // 渲染前交换到左侧（幂等：交换后 clan.tag === 本部，不再触发）
        if (war.opponent && war.opponent.tag === shared._leagueClanTag && war.clan && war.clan.tag !== shared._leagueClanTag) {
            var tmp = war.clan;
            war.clan = war.opponent;
            war.opponent = tmp;
        }
        // 联赛每人每场仅 1 次进攻（league war 无 attacksPerMember 字段，部落战默认 2）
        war.attacksPerMember = 1;
        // 联赛视图压缩顶部留白（普通部落战 40px）
        if (el.detailPrep) el.detailPrep.style.paddingTop = '8px';
        var endCb = null;
        if (war.state === 'preparation' || war.state === 'inWar') {
            endCb = function() {
                if (shared._countdownTimer) { clearInterval(shared._countdownTimer); shared._countdownTimer = null; }
                if (war.state === 'preparation') {
                    // 准备日结束 → 进入战斗日
                    war.state = 'inWar';
                    showPreparationView(war, endCb);
                } else {
                    // 战斗日结束 → 强制刷新 leaguegroup，自动推进到下一轮
                    _leagueForceAdvance = true;
                    refreshLeague(true);
                }
            };
        }
        showPreparationView(war, endCb);
    }

    function showPreparationView(data, endCbOverride) {
        if (el.detailPrep) el.detailPrep.classList.remove('hidden');

        var clan = data.clan || {};
        var opp = data.opponent || {};

        if (el.prepHomeBadge) el.prepHomeBadge.src = (clan.badgeUrls && clan.badgeUrls.large) || '';
        if (el.prepHomeName) el.prepHomeName.textContent = clan.name || '';
        if (el.prepAwayBadge) el.prepAwayBadge.src = (opp.badgeUrls && opp.badgeUrls.large) || '';
        if (el.prepAwayName) el.prepAwayName.textContent = opp.name || '';

        // 状态标签
        var stateLabel = document.getElementById('prep-state-label');
        if (stateLabel) {
            if (data.state === 'preparation') stateLabel.textContent = '准备日';
            else if (data.state === 'inWar') stateLabel.textContent = '战斗日';
            else if (data.state === 'warEnded') stateLabel.textContent = '已结束';
        }

        // 成员列表
        var oppMembers = data.opponent.members || [];
        var clanMembers = data.clan.members || [];
        renderMemberList(el.prepHomeMembers, clanMembers, false, data.attacksPerMember || 2, oppMembers, buildDefenderStarMap(clanMembers));
        renderMemberList(el.prepAwayMembers, oppMembers, true, data.attacksPerMember || 2, clanMembers, buildDefenderStarMap(oppMembers));


        // 战况统计
        renderWarStats(data);

        // 成员筛选（仅首次绑定事件）
        if(!document.getElementById('prep-filter-bar')._initialized){
            var fb=document.getElementById('prep-filter-bar'),btn=document.getElementById('prep-filter-btn'),lbl=document.getElementById('prep-filter-label'),dd=document.getElementById('prep-filter-dropdown');
            var fopts=CocTool.warView._fopts;
            for(var fi=0;fi<fopts.length;fi++){(function(opt){
                var ob=document.createElement('button');ob.textContent=opt.l;ob.setAttribute('data-value',opt.v);
                ob.style.cssText='display:block;width:100%;padding:8px 16px;border:none;background:transparent;font-size:13px;color:#374151;cursor:pointer;text-align:center;';
                if(opt.v===CocTool.warView._memberFilter){ob.className='active';ob.style.background='#eff6ff';ob.style.color='#3b82f6';ob.style.fontWeight='600'}
                ob.addEventListener('click',function(e){
                    e.stopPropagation();
                    CocTool.warView.setFilter(opt.v);
                    lbl.textContent=opt.l;dd.classList.add('hidden');
                    var bs=dd.querySelectorAll('button');
                    for(var bi=0;bi<bs.length;bi++){bs[bi].className='';bs[bi].style.background='transparent';bs[bi].style.color='#374151';bs[bi].style.fontWeight='400'}
                    ob.className='active';ob.style.background='#eff6ff';ob.style.color='#3b82f6';ob.style.fontWeight='600';
                });
                dd.appendChild(ob);
            })(fopts[fi])}
            btn.addEventListener('click',function(e){e.stopPropagation();dd.classList.toggle('hidden')});
            document.addEventListener('click',function(){dd.classList.add('hidden')});
            fb._initialized=true;
        }

        // 战斗规模
        if (el.prepTeamSize) {
            el.prepTeamSize.textContent = (data.teamSize || 0) + ' vs ' + (data.teamSize || 0);
        }

        // 倒计时 / 对战结果（统一布局）
        var isPrep = data.state === 'preparation';
        var cdMode = document.getElementById('prep-countdown-mode');
        var rsMode = document.getElementById('prep-result-mode');
        var box = document.getElementById('prep-countdown-box');

        if (data.state === 'warEnded') {
            if (shared._countdownTimer) { clearInterval(shared._countdownTimer); shared._countdownTimer = null; }
            if (cdMode) cdMode.style.display = 'none';
            if (rsMode) rsMode.style.display = '';
            if (box) { box.style.display = ''; box.style.background = ''; }
            // 计算胜负
            var cs = clan.stars || 0, os = opp.stars || 0;
            var rText, rColor;
            if (cs > os) { rText = '胜利'; rColor = '#10b981'; }
            else if (cs < os) { rText = '失败'; rColor = '#f59e0b'; }
            else {
                var cd = clan.destructionPercentage || 0, od = opp.destructionPercentage || 0;
                if (cd > od) { rText = '胜利'; rColor = '#10b981'; }
                else if (cd < od) { rText = '失败'; rColor = '#f59e0b'; }
                else { rText = '平局'; rColor = '#3b82f6'; }
            }
            var rl = document.getElementById('prep-result-label');
            if (rl) { rl.textContent = rText; rl.style.color = rColor; }
        } else {
            if (cdMode) cdMode.style.display = '';
            if (rsMode) rsMode.style.display = 'none';
            var targetTime = isPrep ? parseCocTime(data.startTime) : parseCocTime(data.endTime);
            var labelEl = document.getElementById('prep-countdown-label');
            if (labelEl) { labelEl.textContent = isPrep ? '距战斗日开始' : '距战斗日结束'; labelEl.style.color = isPrep ? '#6b7280' : '#000'; }
            if (box) { box.style.display = ''; box.style.background = isPrep ? '#eff6ff' : '#ede9fe'; }
            var endCb = function() {
                if (shared._countdownTimer) { clearInterval(shared._countdownTimer); shared._countdownTimer = null; }
                data.state = isPrep ? 'inWar' : 'warEnded';
                showPreparationView(data);
            };
            if (typeof endCbOverride === 'function') endCb = endCbOverride;
            updatePrepCountdown(targetTime, endCb);
            if (shared._countdownTimer) clearInterval(shared._countdownTimer);
            shared._countdownTimer = setInterval(function() { updatePrepCountdown(targetTime, endCb); }, 1000);
        }
    }

    function buildDefenderStarMap(m) { return CocTool.warView.buildDefenderStarMap(m); }

    function renderMemberList(ct,m,r,apm,om,dm){return CocTool.warView.renderMemberList(ct,m,r,apm,om,dm)}

    function renderWarStats(data){return CocTool.warView.renderWarStats(data)}

    function setStat(textEl, barEl, value, max, isHome, suffix, showMax){return CocTool.warView.setStat(textEl,barEl,value,max,isHome,suffix,showMax)}

    function updatePrepCountdown(startTimeMs, onEnd) {
        if (!el.prepCountdown) return;
        var now = Date.now();
        var diff = startTimeMs - now;
        if (diff <= 0) {
            el.prepCountdown.textContent = '';
            if (shared._countdownTimer) { clearInterval(shared._countdownTimer); shared._countdownTimer = null; }
            if (onEnd) onEnd();
            return;
        }
        var totalSec = Math.floor(diff / 1000);
        var h = Math.floor(totalSec / 3600);
        var m = Math.floor((totalSec % 3600) / 60);
        var s = totalSec % 60;
        el.prepCountdown.textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }

    shared.showPreparationView = showPreparationView;
    shared.loadLeagueMine = loadLeagueMine;
    shared.fetchLeagueGroup = fetchLeagueGroup;
    shared.updatePrepCountdown = updatePrepCountdown;
    shared.resetLeagueState = resetLeagueState;
    shared.updateModeTabs = updateModeTabs;
    shared.switchToWarMode = switchToWarMode;
    shared.switchToLeagueMode = switchToLeagueMode;
    shared.refreshLeagueWar = refreshLeagueWar;
    shared.getLeaguePhase = getLeaguePhase;

})(window);
