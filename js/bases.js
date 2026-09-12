/**
 * bases.js — 更多页入口 + 阵型中心（用户侧）
 * 后端：clan-tool-api /api/base/*（审核制：提交后待管理员通过才进入广场）
 * 阵型本体不上传：官方分享链接（游戏内分享阵型复制）即载体，一键打开直接拉起游戏
 */
(function () {
    'use strict';

    function apiBase() { return (window.CocTool && CocTool.apiBase) || 'https://coctool.top'; }
    function $(id) { return document.getElementById(id); }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    // 链接按区服校验：国际服只能官方分享 URL（https://link.clashofclans.com 开头），国服只能 TH 阵型码；未选区服时宽松（兼容旧数据）
    function linkOkFor(server, u) {
        if (!u) return false;
        var l = String(u).trim();
        if (server === '国服') return /^TH\d{1,2}(:|$)/i.test(l);
        if (server === '国际服') return l.indexOf('https://link.clashofclans.com') === 0;
        return l.indexOf('https://link.clashofclans.com') === 0 || /^TH\d{1,2}(:|$)/i.test(l);
    }
    function revalidateLinkHint() {
        var input = $('bc-up-link'), h = $('bc-link-hint');
        if (!input || !h) return;
        autoSelectTh();
        if (!input.value.trim()) { h.textContent = ''; return; }
        if (!state.upServer) { h.textContent = '请先选择区服，再按区服校验链接格式'; h.style.color = '#d97706'; return; }
        var ok = linkOkFor(state.upServer, input.value);
        var tip = state.upServer === '国服'
            ? '国服只能用 TH 阵型码（如 TH18:WB:…），不能填官网链接'
            : '国际服只能用官方分享链接（https://link.clashofclans.com 开头），不能填阵型码';
        h.textContent = ok ? '✅ 链接格式正确' : '❌ ' + tip;
        h.style.color = ok ? '#059669' : '#dc2626';
    }
    // 粘贴/输入链接后自动选大本（链接里带 TH 等级）：同一链接只自动填一次，用户之后手动改选不再被覆盖
    function autoSelectTh() {
        var input = $('bc-up-link');
        if (!input) return;
        var link = input.value.trim();
        if (link === state.upParsedLink) return;
        state.upParsedLink = link;
        var n = parseTh(link);
        if (!n) return;
        var max = state.upTags.indexOf('夜世界') >= 0 ? 10 : 18;
        if (n > max) return; // 越界（如夜世界卡片配主世界大本链接）则不自动填，保留用户手选
        state.upTags = state.upTags.filter(function (x) { return !/^\d+本$/.test(x); }).concat([n + '本']);
        renderUpTags();
    }
    function fmtTime(ts) { if (!ts) return ''; var d = new Date(ts); return (d.getMonth() + 1) + '月' + d.getDate() + '日'; }
    function toast(m) {
        var t = document.createElement('div');
        t.className = 'bc-toast'; t.textContent = m;
        document.body.appendChild(t);
        requestAnimationFrame(function () { t.classList.add('show'); });
        setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 300); }, 2200);
    }
    function deviceId() {
        var k = 'bc_device_id', v = localStorage.getItem(k);
        if (!v) { v = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); localStorage.setItem(k, v); }
        return v;
    }
    // 云备份登录态（services.js 同一套键）：有邮箱+token 即视为已登录，提交/我的上传归账号
    function cloudAuth() {
        var token = localStorage.getItem('coc_cloud_token');
        var email = '';
        try { var a = JSON.parse(localStorage.getItem('coc_cloud_auth') || 'null'); if (a && a.email) email = a.email; } catch (e) {}
        return email && token ? { email: email, token: token } : null;
    }
    function openCloudLogin() {
        if (window.CocTool && CocTool.features && CocTool.features.services && CocTool.features.services.openCloudLogin) {
            CocTool.features.services.openCloudLogin();
        } else {
            toast('请先到「云端备份」设置里登录账号');
        }
    }
    // 本地收藏（clash_bases_fav = 阵型 id 数组）
    function favList() {
        try { var v = JSON.parse(localStorage.getItem('clash_bases_fav') || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
    }
    function isFav(id) { return favList().indexOf(id) >= 0; }
    function toggleFav(id) {
        var arr = favList(), i = arr.indexOf(id);
        if (i >= 0) arr.splice(i, 1); else arr.push(id);
        localStorage.setItem('clash_bases_fav', JSON.stringify(arr));
    }
    // 一键打开：App 桥最稳（系统分发 app links 直达游戏）；网页版安卓拼 intent，其余新窗口
    function openLayout(link) {
        if (window.AndroidApp && AndroidApp.openInBrowser) { AndroidApp.openInBrowser(link); return; }
        if (/android/i.test(navigator.userAgent) && link.indexOf('https://link.clashofclans.com') === 0) {
            var q = link.indexOf('?') >= 0 ? link.split('?')[1] : link.substring(link.indexOf('action='));
            if (q) { location.href = 'intent://open_layout?' + q + '#Intent;scheme=clashofclans;package=com.supercell.clashofclans;end;'; return; }
        }
        window.open(link, '_blank');
    }

      var TAG_GROUPS = [
        // 区服已独立为上传弹窗的必选步骤（bc-up-server），不再出现在标签组
        { name: '世界', items: ['主世界', '夜世界'], single: true },
        // 大本范围随「世界」联动：主世界 4-18，夜世界 4-10
        { name: '大本', single: true, dynamic: function (selected) {
          var max = selected.indexOf('夜世界') >= 0 ? 10 : 18;
          var arr = [];
          for (var i = 4; i <= max; i++) arr.push(i + '本');
          return arr;
        } },
        { name: '用途', single: true, subgroups: [
          // 大类只是分组标题（不可点）——用途整体仍是单选
          { name: '日常', items: ['护资源', '升级', '图案', '文字', '日常', '种树', '整活', '娱乐'] },
          { name: '对战', items: ['排位', '部落战', '联赛', '传奇杯', '防三星', '防二星', '坑一星', '电竞'] }
        ] }
      ];
    // 分组内的全部标签（子分组自动展开）——单选范围 / 必选校验 / 筛选下拉共用同一份，避免两套口径
    function groupItems(g, selected) {
      if (g.subgroups) return g.subgroups.reduce(function (a, s) { return a.concat(s.items); }, []);
      return g.items || g.dynamic(selected);
    }

    var state = { tab: 'square', inited: false, upTags: [], upServer: '', upImage: null, upImageName: '', upParsedLink: '', squareGen: 0, square: { items: [], offset: 0, hasMore: false, loading: false }, filter: { world: '', th: '', server: '', uses: [] } };
    var PAGE_SIZE = 24; // 广场每页条数（服务端分页，滚动到底自动加载下一页）

    /* ── 数据 ── */
    function fetchJson(url, opts) {
        return fetch(url, opts).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (j) {
                if (!r.ok || !j.success) throw new Error(j && j.error ? j.error : 'HTTP ' + r.status);
                return j;
            });
        });
    }
    /* 广场：服务端分页（每页 PAGE_SIZE 条）+ 筛选上移服务端，滚动到底自动加载下一页 */
    function squareUrl(offset) {
        var f = state.filter;
        var p = ['limit=' + PAGE_SIZE, 'offset=' + offset];
        if (f.server) p.push('server=' + encodeURIComponent(f.server));
        if (f.world) p.push('world=' + encodeURIComponent(f.world));
        if (f.th) p.push('th=' + encodeURIComponent(f.th));
        if (f.uses.length) p.push('use=' + encodeURIComponent(f.uses[0]));
        return apiBase() + '/api/base/list?' + p.join('&');
    }
    function loadSquare(reset) {
        if (reset) {
            state.squareGen++; // 世代号：筛选/切页签时作废在途请求，避免旧响应把过期数据追加进来
            state.square = { items: [], offset: 0, hasMore: false, loading: false };
            $('bc-grid').innerHTML = '<div class="bc-empty">加载中…</div>';
        }
        var s = state.square;
        var gen = state.squareGen;
        if (s.loading) return;
        s.loading = true;
        setSentinel(s.offset ? '加载中…' : '');
        fetchJson(squareUrl(s.offset)).then(function (j) {
            if (gen !== state.squareGen) return; // 已被重置：丢弃过期响应
            var list = j.layouts || [];
            var isFirst = s.items.length === 0;
            s.loading = false;
            s.items = s.items.concat(list);
            s.offset = s.items.length;
            s.hasMore = !!j.hasMore;
            if (!s.items.length) {
                renderGrid([]);
                setSentinel('');
                return;
            }
            if (isFirst) {
                $('bc-grid').innerHTML = list.map(function (l, i) { return cardHtml(l, cardActions(l, i), i); }).join('');
                bindCardEvents($('bc-grid'), list);
            } else if (list.length) {
                appendCards(list);
            }
            setSentinel(s.hasMore ? '上拉加载更多…' : '没有更多了');
            maybeLoadMore(); // 首屏未占满时继续补下一页（观察器不会重复触发）
        }).catch(function (e) {
            if (gen !== state.squareGen) return; // 已被重置：忽略过期请求的报错
            s.loading = false;
            if (!s.items.length) {
                $('bc-grid').innerHTML = '<div class="bc-err">加载失败：' + esc(e.message) + '<br>阵型中心后端可能尚未上线，稍后再试</div>';
            } else {
                toast('加载更多失败：' + e.message);
            }
            setSentinel('');
        });
    }
    // 追加渲染（保留已渲染卡片，避免每页整块重建 DOM）；事件按本批 list 绑定（data-idx 为批内下标）
    function appendCards(list) {
        var tmp = document.createElement('div');
        tmp.innerHTML = list.map(function (l, i) { return cardHtml(l, cardActions(l, i), i); }).join('');
        var frag = document.createDocumentFragment();
        while (tmp.firstChild) frag.appendChild(tmp.firstChild);
        bindCardEvents(frag, list);
        $('bc-grid').appendChild(frag);
    }
    // 分页哨兵（#bc-grid 之后的兄弟节点，滚动到可视区即加载下一页）
    function sentinelEl() {
        var s = $('bc-page-sentinel');
        if (!s) {
            s = document.createElement('div');
            s.id = 'bc-page-sentinel';
            s.className = 'bc-sentinel';
            var grid = $('bc-grid');
            grid.parentNode.insertBefore(s, grid.nextSibling);
        }
        return s;
    }
    function setSentinel(text) {
        var s = sentinelEl();
        s.textContent = text || '';
        s.style.display = text ? '' : 'none';
    }
    function maybeLoadMore() {
        if (state.tab !== 'square') return;
        var s = state.square;
        if (!s.hasMore || s.loading) return;
        var el = $('bc-page-sentinel');
        if (!el || el.style.display === 'none') return;
        if (el.getBoundingClientRect().top < window.innerHeight + 400) loadSquare(false);
    }
    // 收藏：按本地收藏 id 批量取数（服务端分页后不再依赖全量列表），顺序按收藏先后
    function loadFav() {
        var ids = favList();
        setSentinel('');
        if (!ids.length) { $('bc-grid').innerHTML = '<div class="bc-empty">还没有收藏的阵型，去广场点 ♥ 收藏</div>'; return; }
        $('bc-grid').innerHTML = '<div class="bc-empty">加载中…</div>';
        fetchJson(apiBase() + '/api/base/list?ids=' + encodeURIComponent(ids.join(','))).then(function (j) {
            var found = j.layouts || [];
            var list = ids.map(function (id) {
                return found.find(function (l) { return l.id === id; });
            }).filter(Boolean);
            if (!list.length) { $('bc-grid').innerHTML = '<div class="bc-empty">收藏的阵型已下架或尚未通过审核</div>'; return; }
            renderGrid(list);
        }).catch(function (e) {
            $('bc-grid').innerHTML = '<div class="bc-err">加载失败：' + esc(e.message) + '</div>';
        });
    }
    function loadMine() {
        setSentinel('');
        $('bc-grid').innerHTML = '<div class="bc-empty">加载中…</div>';
        var auth = cloudAuth();
        var opts = {};
        if (auth) opts.headers = { 'X-Auth-Token': auth.token };
        // 已登录：服务端按 token 认领本机 deviceId 的旧阵型并返回账号名下全部；未登录：仅本机 deviceId 未归属的
        var url = apiBase() + '/api/base/mine' + (auth ? '' : '?deviceId=' + encodeURIComponent(deviceId()));
        fetchJson(url, opts).then(function (j) {
            renderMine(j.layouts || [], auth);
        }).catch(function (e) {
            $('bc-grid').innerHTML = '<div class="bc-err">加载失败：' + esc(e.message) + '</div>';
        });
    }

    /* ── 渲染 ── */
    function statusBadge(l) {
        var map = { pending: '审核中', approved: '已通过', rejected: '未通过', reported: '反馈待处理' };
        return '<span class="bc-st ' + l.status + '">' + (map[l.status] || l.status) + '</span>';
    }
    // 收藏心形（走项目 svg 体系：svg-icons.js 注册表 + img/svg/bases/*.svg，i.fa 由水合自动注入；
    // 未收藏=heart 空心描边白心 / 已收藏=heart-filled 实心红心，currentColor 随按钮 color）
    function heartSvg(filled) {
        return '<i class="fa ' + (filled ? 'fa-heart-filled' : 'fa-heart') + '"></i>';
    }
    function isCn(l) { return (l.tags || []).indexOf('国服') >= 0; }
    // 标签配色：只有区服标签按服着色（国际服紫 / 国服蓝），其余统一灰底黑字
    function tagHtml(t) {
        var srv = t === '国际服' ? ' srv-intl' : (t === '国服' ? ' srv-cn' : '');
        return '<span class="bc-tag' + srv + '">' + esc(t) + '</span>';
    }
    // 标签固定展示顺序：区服 → 世界 → 大本 → 用途（未知标签保持原序垫后）
    // 渲染期排序，历史记录一并归一，无需迁移数据
    function tagRank(t) {
        if (t === '国际服' || t === '国服') return 0;
        if (t === '主世界' || t === '夜世界') return 1;
        if (/^\d+本$/.test(t)) return 2;
        return 3;
    }
    function orderTags(tags) {
        return (tags || []).map(function (t, i) { return { t: t, i: i }; })
            .sort(function (a, b) { return tagRank(a.t) - tagRank(b.t) || a.i - b.i; })
            .map(function (x) { return x.t; });
    }
    function tagsHtml(tags, extra) { return orderTags(tags).map(tagHtml).join('') + (extra || ''); }
    // 从阵型链接解析大本等级：国际服分享链接 id=TH16%3A…（URL 编码冒号）；国服阵型码 TH16:…
    // 解析不出或超范围（<4 / >18）返回 0
    function parseTh(link) {
        var l = String(link || '').trim();
        if (!l) return 0;
        var s = l, m = null;
        if (l.indexOf('https://link.clashofclans.com') === 0) {
            try { s = decodeURIComponent(l); } catch (e) {}
            m = s.match(/(?:^|[:=&#?])TH(\d{1,2})(?=[:&]|$)/i);
        } else {
            m = l.match(/^TH(\d{1,2})(?=:|$)/i);
        }
        if (!m) return 0;
        var n = parseInt(m[1], 10);
        return n >= 4 && n <= 18 ? n : 0;
    }
    // 相对时间：当天=今天 / 1天前 / 2天前…
    function relTime(ts) {
        if (!ts) return '';
        var diff = Date.now() - new Date(ts).getTime();
        if (diff < 0) return '今天';
        var d = Math.floor(diff / 86400000);
        return d <= 0 ? '今天' : d + '天前';
    }
    // 卡片操作按钮：国际服「一键打开」白底紫字 +「复制链接」紫底白字；国服仅「复制阵型码」蓝底白字
    function cardActions(l, idx) {
        if (isCn(l)) return '<button class="bc-btn solid" data-copy="' + esc(l.link) + '" data-idx="' + idx + '">复制阵型码</button>';
        return '<button class="bc-btn white" data-open="' + esc(l.link) + '" data-idx="' + idx + '">一键打开</button>' +
            '<button class="bc-btn solid" data-copy="' + esc(l.link) + '" data-idx="' + idx + '">复制链接</button>';
    }
    function cardHtml(l, actions, idx, tagExtra, showDel) {
        var favOn = isFav(l.id);
        // 区服卡片配色：国服 → 蓝色（srv-cn），其余保持紫色（对应账号区服标签色 #2563eb / #7c3aed）
        var srvCls = isCn(l) ? ' srv-cn' : '';
        // has-del：右上角有垃圾桶时给标题留出右侧内边距，避免长标题压到图标下
        return '<div class="bc-card' + srvCls + (showDel ? ' has-del' : '') + '" data-lid="' + esc(l.id) + '">' +
            '<div class="bc-img" data-preview data-idx="' + idx + '">' +
            (l.image ? '<img src="' + esc(l.image.indexOf('http') === 0 ? l.image : apiBase() + l.image) + '" loading="lazy" alt="">' : '<span class="bc-img-none">🏰</span>') +
            '<div class="bc-img-title">' + esc(l.title) + '</div>' +
            '<div class="bc-img-acts">' +
            '<button type="button" class="bc-favbtn' + (favOn ? ' on' : '') + '" data-fav data-idx="' + idx + '" aria-label="收藏">' + heartSvg(favOn) + '</button>' +
            '<button type="button" class="bc-repbtn" data-rep data-idx="' + idx + '" aria-label="反馈">⚑</button>' +
            '</div>' +
            // 我的上传专属：右上角删除（上传者自助下架，二次确认后服务端硬删除）
            (showDel ? '<button type="button" class="bc-delbtn" data-del data-idx="' + idx + '" aria-label="删除"><i class="fa fa-trash"></i></button>' : '') +
            '<div class="bc-img-time">' + relTime(l.createdAt) + '</div>' +
            // 左下角计数：眼睛=查看（打开大图 +1），下载=复制/打开（点打开或复制 +1）
            '<div class="bc-img-stats">' +
            '<span class="bc-stat" title="查看"><i class="fa fa-eye"></i><b data-stat="view">' + (l.views || 0) + '</b></span>' +
            '<span class="bc-stat" title="复制/打开"><i class="fa fa-download"></i><b data-stat="download">' + (l.downloads || 0) + '</b></span>' +
            '</div>' +
            '</div>' +
            '<div class="bc-info">' +
            // 阵型说明行恒渲染（空也占满一行，保证卡片样式一致）；单行超出省略
            '<div class="bc-remark">' + esc(l.remark || '') + '</div>' +
            // 标签区固定顺序 区服→世界→大本→用途；tagExtra（如我的上传状态徽章）并入本行展示
            ((l.tags && l.tags.length) || tagExtra ? '<div class="bc-tags">' + tagsHtml(l.tags, tagExtra) + '</div>' : '') +
            '<div class="bc-acts">' + actions + '</div>' +
            '</div></div>';
    }
    function renderGrid(list) {
        if (!list.length) {
            var hasFilter = state.filter.world || state.filter.th || state.filter.server || state.filter.uses.length;
            if (hasFilter) {
                $('bc-grid').innerHTML = '<div class="bc-empty">没有符合筛选条件的阵型<br>' +
                    '<button class="bc-btn ghost" id="bc-f-clear2" style="margin-top:12px;padding:8px 18px;width:auto;">重置筛选</button></div>';
                var c = $('bc-f-clear2');
                if (c) c.onclick = function () { state.filter = { world: '', th: '', server: '', uses: [] }; renderFilters(); applyFilter(); };
            } else {
                $('bc-grid').innerHTML = '<div class="bc-empty">还没有已通过的阵型，点右上角上传第一个吧</div>';
            }
            return;
        }
        $('bc-grid').innerHTML = list.map(function (l, i) {
            return cardHtml(l, cardActions(l, i), i);
        }).join('');
        bindCardEvents($('bc-grid'), list);
    }
    function renderMine(list, auth) {
        // rejected 视为已删除（后台规则：驳回/下架=删除不归档），即使旧版服务器仍返回也一律不外显
        list = (list || []).filter(function (l) { return l.status !== 'rejected'; });
        if (!list.length) {
            if (!auth) {
                $('bc-grid').innerHTML =
                    '<div class="bc-empty">还没有本设备上传的阵型</div>' +
                    '<div class="bc-mine-tip">登录账号后，你在任意设备提交的阵型都会在这里汇总找回<br>' +
                    '<button type="button" class="bc-login2" data-bclogin style="margin-top:8px;">去登录</button></div>';
                var b = $('bc-grid').querySelector('[data-bclogin]');
                if (b) b.onclick = openCloudLogin;
                return;
            }
            $('bc-grid').innerHTML = '<div class="bc-empty">还没有上传过阵型</div>';
            return;
        }
        $('bc-grid').innerHTML = list.map(function (l, i) {
            // 已通过：国际服同广场（一键打开+复制链接），国服复制阵型码
            var action = l.status === 'approved' ? cardActions(l, i) : '';
            // 状态徽章（已通过/审核中，保留原配色）展示在标签区；showDel=上传者自助删除（仅我的上传显示垃圾桶）
            return cardHtml(l, action, i, statusBadge(l), true);
        }).join('');
        bindCardEvents($('bc-grid'), list);
    }
    function copyLink(v) {
        function done(ok) { toast(ok ? '链接已复制' : '复制失败'); }
        // 真机优先走 Android 桥（系统剪贴板，无 WebView file:// 安全上下文限制）
        if (window.AndroidApp && AndroidApp.copyToClipboard) {
            try { AndroidApp.copyToClipboard(v); done(true); return; } catch (e) { done(false); return; }
        }
        // file:// 非安全上下文 navigator.clipboard 不可用，用传统 textarea+execCommand 兜底
        var ta = document.createElement('textarea');
        ta.value = v;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, v.length);
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        ta.remove();
        if (ok) { done(true); return; }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(v).then(function () { done(true); }, function () { done(false); });
            return;
        }
        done(false);
    }
    // 计数打点：view=打开大图 / download=点打开或复制
    // 防刷两道：①本机同阵型同类型 24h 内只打点一次（省一次往返，与服务端 stat-guard 同窗口）
    //           ②服务端返回权威计数（被去重/超频时 counted:false）→ 用它校准乐观 +1
    var STAT_SEEN_KEY = 'bc_stat_seen', STAT_SEEN_WINDOW = 24 * 60 * 60 * 1000, STAT_SEEN_MAX = 1000;
    function statSeenMap() {
        var m = null;
        try { m = JSON.parse(localStorage.getItem(STAT_SEEN_KEY) || 'null'); } catch (e) {}
        return (m && typeof m === 'object') ? m : {};
    }
    function statSeen(key) {
        var t = statSeenMap()[key];
        return !!t && Date.now() - t < STAT_SEEN_WINDOW;
    }
    function markStatSeen(key) {
        var m = statSeenMap(), now = Date.now();
        Object.keys(m).forEach(function (k) { if (now - m[k] > STAT_SEEN_WINDOW) delete m[k]; });
        m[key] = now;
        var keys = Object.keys(m);
        if (keys.length > STAT_SEEN_MAX) { // 超出上限先丢最旧的
            keys.sort(function (a, b) { return m[a] - m[b]; }).slice(0, keys.length - STAT_SEEN_MAX).forEach(function (k) { delete m[k]; });
        }
        try { localStorage.setItem(STAT_SEEN_KEY, JSON.stringify(m)); } catch (e) {}
    }
    // 卡片计数：传 j（服务端响应）时用权威值校准；否则按 delta 乐观增减
    function applyStat(id, kind, delta, j) {
        var sel = String(id || '').replace(/["\\]/g, '');
        var card = sel ? document.querySelector('#bc-grid .bc-card[data-lid="' + sel + '"]') : null;
        if (!card) return;
        if (j) {
            if (typeof j.views === 'number') { var a = card.querySelector('[data-stat="view"]'); if (a) a.textContent = j.views; }
            if (typeof j.downloads === 'number') { var b = card.querySelector('[data-stat="download"]'); if (b) b.textContent = j.downloads; }
            return;
        }
        var n = card.querySelector('[data-stat="' + kind + '"]');
        if (n) n.textContent = (parseInt(n.textContent, 10) || 0) + delta;
    }
    function bumpStat(id, kind) {
        if (!id) return;
        var key = kind + '|' + id;
        if (statSeen(key)) return; // 本机 24h 内已计过：不打点也不加，避免同一人反复点把数字虚高
        applyStat(id, kind, 1);
        try {
            fetch(apiBase() + '/api/base/stat', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: id, kind: kind, deviceId: deviceId() })
            }).then(function (r) { return r.json(); }).then(function (j) {
                if (!j || !j.success) return;
                markStatSeen(key);
                applyStat(id, kind, 0, j);
            }).catch(function () {});
        } catch (e) {}
    }
    // 上传者自助删除（我的上传卡片右上角垃圾桶）：二次确认 → 服务端硬删除（连带图片）
    function confirmDelete(l) {
        CocTool.ui.showConfirm({
            title: '删除阵型',
            text: '「' + (l.title || '') + '」删除后不可恢复，确认删除？',
            confirmText: '删除',
            onConfirm: function () {
                var auth = cloudAuth();
                var headers = { 'Content-Type': 'application/json' };
                if (auth) headers['X-Auth-Token'] = auth.token;
                fetchJson(apiBase() + '/api/base/delete', {
                    method: 'POST', headers: headers,
                    body: JSON.stringify({ id: l.id, deviceId: deviceId() })
                }).then(function () {
                    toast('已删除');
                    if (state.tab === 'mine') loadMine(); else loadSquare(true);
                }).catch(function (e) {
                    toast('删除失败：' + e.message);
                });
            }
        });
    }
    function bindCardEvents(root, list) {
        root.querySelectorAll('[data-preview]').forEach(function (el) {
            el.onclick = function () {
                var idx = +el.getAttribute('data-idx');
                var l = (list || [])[idx];
                if (l) { openLightbox(l); bumpStat(l.id, 'view'); }
            };
        });
        root.querySelectorAll('[data-fav]').forEach(function (b) {
            b.onclick = function (ev) {
                ev.stopPropagation();
                var l = (list || [])[+b.getAttribute('data-idx')];
                if (!l) return;
                toggleFav(l.id);
                b.classList.toggle('on', isFav(l.id));
                b.innerHTML = heartSvg(isFav(l.id));
            };
        });
        root.querySelectorAll('[data-rep]').forEach(function (b) {
            b.onclick = function (ev) {
                ev.stopPropagation();
                var l = (list || [])[+b.getAttribute('data-idx')];
                if (l) openReport(l);
            };
        });
        root.querySelectorAll('[data-del]').forEach(function (b) {
            b.onclick = function (ev) {
                ev.stopPropagation();
                var l = (list || [])[+b.getAttribute('data-idx')];
                if (l) confirmDelete(l);
            };
        });
        root.querySelectorAll('[data-open], [data-copy]').forEach(function (b) {
            b.onclick = function () {
                var idx = +b.getAttribute('data-idx');
                var l = (list || [])[idx];
                if (b.hasAttribute('data-open')) openLayout(b.getAttribute('data-open'));
                else copyLink(b.getAttribute('data-copy'));
                if (l) bumpStat(l.id, 'download');
            };
        });
    }

    /* ── 广场筛选（顶部一行下拉：区服/世界/大本/用途，服务端过滤——筛选变化即重置分页重新拉取） ── */
    function applyFilter() {
        if (state.tab === 'square') loadSquare(true);
    }
    function closeDrops() {
        document.querySelectorAll('#bc-filters .bc-drop').forEach(function (d) { d.classList.remove('open'); });
    }
    function toggleDrop(id) {
        var el = $(id);
        var wasOpen = el.classList.contains('open');
        closeDrops();
        if (!wasOpen) el.classList.add('open');
    }
    function renderFilters() {
        // 世界切到夜世界时，大本范围收窄到 4-10，越界已选大本自动清空
        var max = state.filter.world === '夜世界' ? 10 : 18;
        if (state.filter.th) { var m = state.filter.th.match(/^(\d+)本$/); if (!m || parseInt(m[1], 10) > max) state.filter.th = ''; }
        var worlds = ['全部', '主世界', '夜世界'];
        var ths = ['全部'];
        for (var i = 4; i <= max; i++) ths.push(i + '本');
        var servers = ['全部', '国际服', '国服'];
        var uses = (TAG_GROUPS.find(function (g) { return g.name === '用途'; }) || {}).subgroups || [];
        // 用途下拉选项：首个「全部」+ 各大类标题（不可点）+ 该类标签；四列网格由 .bc-drop-grid 提供
        var useOpts = ['全部'];
        uses.forEach(function (s) { useOpts.push({ head: s.name }); useOpts = useOpts.concat(s.items); });
        function chip(dim, v) { return v ? dim + '：' + v : dim; }
        $('bc-fbtn-world').innerHTML = chip('世界', state.filter.world || '') + ' <i class="fa fa-chevron-down"></i>';
        $('bc-fbtn-th').innerHTML = chip('大本', state.filter.th || '') + ' <i class="fa fa-chevron-down"></i>';
        $('bc-fbtn-server').innerHTML = chip('区服', state.filter.server || '') + ' <i class="fa fa-chevron-down"></i>';
        $('bc-fbtn-use').innerHTML = chip('用途', state.filter.uses.length ? state.filter.uses[0] : '') + ' <i class="fa fa-chevron-down"></i>';
        function renderDrop(elId, opts, isSel, pick, keepOpen) {
            var el = $(elId); if (!el) return;
            el.innerHTML = opts.map(function (o) {
                // { head: '大类' } = 分组标题，只占位不可点（不做成按钮，避免被当成标签选中）
                if (o && typeof o === 'object') return '<span class="bc-dopt-head">' + esc(o.head) + '</span>';
                return '<button type="button" class="bc-dopt' + (isSel(o) ? ' on' : '') + '" data-fv="' + esc(o) + '">' + esc(o) + '</button>';
            }).join('');
            el.querySelectorAll('[data-fv]').forEach(function (b) {
                b.onclick = function (ev) {
                    ev.stopPropagation();
                    pick(b.getAttribute('data-fv'));
                    if (!keepOpen) closeDrops();
                };
            });
        }
        renderDrop('bc-drop-world', worlds, function (o) { return o === (state.filter.world || '全部'); }, function (v) {
            state.filter.world = v === '全部' ? '' : v;
            renderFilters(); applyFilter();
        });
        renderDrop('bc-drop-th', ths, function (o) { return o === (state.filter.th || '全部'); }, function (v) {
            state.filter.th = v === '全部' ? '' : v;
            renderFilters(); applyFilter();
        });
        renderDrop('bc-drop-server', servers, function (o) { return o === (state.filter.server || '全部'); }, function (v) {
            state.filter.server = v === '全部' ? '' : v;
            renderFilters(); applyFilter();
        });
        renderDrop('bc-drop-use', useOpts, function (o) { return o === (state.filter.uses[0] || '全部'); }, function (v) {
            state.filter.uses = v === '全部' ? [] : [v];
            renderFilters(); applyFilter();
        }); // 用途单选（对齐上传弹窗），选完即关
    }

    /* ── 大图缩放（双击/双指捏合/滚轮/按钮，缩放后拖动平移） ── */
    var lbState = { zoom: 1, tx: 0, ty: 0, pinch: null, drag: null };
    function lbApply() {
        $('bc-lb-img').style.transform = 'translate(' + lbState.tx + 'px,' + lbState.ty + 'px) scale(' + lbState.zoom + ')';
        $('bc-lb-zpct').textContent = Math.round(lbState.zoom * 100) + '%';
    }
    function lbReset() {
        lbState.zoom = 1; lbState.tx = 0; lbState.ty = 0; lbState.pinch = null; lbState.drag = null;
        lbApply();
    }
    function lbZoomBy(f) {
        var z = Math.min(4, Math.max(1, lbState.zoom * f));
        lbState.zoom = z; lbState.tx = 0; lbState.ty = 0;
        lbApply();
    }

    /* ── 大图预览（点击卡片缩略图） ── */
    function openLightbox(l) {
        $('bc-lb-img').src = l.image ? (l.image.indexOf('http') === 0 ? l.image : apiBase() + l.image) : '';
        $('bc-lb-title').textContent = l.title || '';
        // 大图在标签上方完整展示阵型说明（可换行不省略；无说明隐藏该行）
        var rm = $('bc-lb-remark');
        if (rm) { rm.style.display = l.remark ? '' : 'none'; rm.textContent = l.remark || ''; }
        $('bc-lb-tags').innerHTML = tagsHtml(l.tags);
        $('bc-lb-open').setAttribute('data-open', l.link);
        $('bc-lb-copy').setAttribute('data-copy', l.link);
        $('bc-lightbox').setAttribute('data-id', l.id);
        lbReset();
        $('bc-lightbox').classList.remove('hidden');
    }
    function closeLightbox() { $('bc-lightbox').classList.add('hidden'); }

    /* ── 反馈弹窗（链接与图片不符 / 链接失效 / 其他 → 后台处理） ── */
    var repState = { layout: null, type: 'mismatch' };
    // 反馈限流（用户拍板）：登录邮箱 5 分钟一次、未登录 10 分钟一次；本地记最后一次提交时刻
    var REPORT_WIN_AUTH = 5 * 60 * 1000, REPORT_WIN_GUEST = 10 * 60 * 1000;
    function reportWaitLeft() {
        var last = parseInt(localStorage.getItem('bc_last_report') || '0', 10) || 0;
        var win = cloudAuth() ? REPORT_WIN_AUTH : REPORT_WIN_GUEST;
        return Math.max(0, last + win - Date.now());
    }
    function fmtWait(ms) {
        var s = Math.ceil(ms / 1000);
        return s < 60 ? s + ' 秒' : Math.ceil(s / 60) + ' 分钟';
    }
    function renderRepTypes() {
        var types = [{ v: 'mismatch', t: '链接与图片不符' }, { v: 'broken', t: '链接失效' }, { v: 'other', t: '其他' }];
        $('bc-rep-types').innerHTML = types.map(function (x) {
            return '<button type="button" class="bc-tagopt' + (repState.type === x.v ? ' active' : '') + '" data-rt="' + x.v + '">' + x.t + '</button>';
        }).join('');
        $('bc-rep-types').querySelectorAll('[data-rt]').forEach(function (b) {
            b.onclick = function () { repState.type = b.getAttribute('data-rt'); renderRepTypes(); };
        });
    }
    function openReport(l) {
        var left = reportWaitLeft();
        if (left > 0) {
            // 限流仅前端抑制（不改服务端契约，旧版本客户端不受影响）
            toast('反馈太频繁了，请 ' + fmtWait(left) + '后再试' + (cloudAuth() ? '' : '（登录邮箱后为 5 分钟一次）'));
            return;
        }
        repState.layout = l; repState.type = 'mismatch';
        $('bc-rep-title').textContent = '阵型：' + (l.title || '');
        $('bc-rep-msg').value = '';
        renderRepTypes();
        $('bc-report-modal').classList.remove('hidden');
    }
    function closeReport() { $('bc-report-modal').classList.add('hidden'); }
    function submitReport() {
        var l = repState.layout; if (!l) return;
        var msg = $('bc-rep-msg').value.trim();
        var headers = { 'Content-Type': 'application/json' };
        var auth = cloudAuth();
        if (auth) headers['X-Auth-Token'] = auth.token;
        var btn = $('bc-rep-submit');
        btn.disabled = true; btn.textContent = '提交中…';
        fetchJson(apiBase() + '/api/base/report', {
            method: 'POST', headers: headers,
            body: JSON.stringify({ baseId: l.id, type: repState.type, message: msg, deviceId: deviceId() })
        }).then(function () {
            localStorage.setItem('bc_last_report', String(Date.now())); // 记入限流窗口（仅提交成功才计）
            closeReport(); toast('反馈已提交，感谢反馈');
        }).catch(function (e) {
            toast('提交失败：' + e.message);
        }).finally(function () {
            btn.disabled = false; btn.textContent = '提交反馈';
        });
    }

    /* ── 上传 ── */
    function renderUpTags() {
        // 分组标题分两级、样式在 more.css：一级=维度（世界/大本/用途）、二级=用途下的子分组（日常/对战）
        // （原来三者同款内联样式，用户反馈「用途 日常 对战 这三个依然没有区别」）
        function label(name, sub) { return '<span class="' + (sub ? 'bc-tagsub' : 'bc-taggroup') + '">' + esc(name) + '</span>'; }
        function btn(t) {
            return '<button type="button" class="bc-tagopt' + (state.upTags.indexOf(t) >= 0 ? ' active' : '') + '" data-ut="' + esc(t) + '">' + esc(t) + '</button>';
        }
        $('bc-up-tags').innerHTML = TAG_GROUPS.map(function (g) {
            // 用途分两个大类：大类标题与标签跟在各自大类后面（标题都不可点）
            if (g.subgroups) return label(g.name) + g.subgroups.map(function (s) { return label(s.name, true) + s.items.map(btn).join(''); }).join('');
            return label(g.name) + groupItems(g, state.upTags).map(btn).join('');
        }).join('');
        $('bc-up-tags').querySelectorAll('[data-ut]').forEach(function (el) {
            el.onclick = function () {
                var t = el.getAttribute('data-ut');
                var g = TAG_GROUPS.find(function (x) { return groupItems(x, state.upTags).indexOf(t) >= 0; });
                if (g && g.single) {
                  var range = groupItems(g, state.upTags);
                  state.upTags = state.upTags.filter(function (x) { return range.indexOf(x) < 0 || x === t; });
                }
                state.upTags = state.upTags.indexOf(t) >= 0 ? state.upTags.filter(function (x) { return x !== t; }) : state.upTags.concat([t]);
                // 世界切到夜世界时，超出 4-10 范围的大本标签自动移除
                var max = state.upTags.indexOf('夜世界') >= 0 ? 10 : 18;
                state.upTags = state.upTags.filter(function (x) { var m = x.match(/^(\d+)本$/); return !m || parseInt(m[1], 10) <= max; });
                renderUpTags();
                revalidateLinkHint(); // 切换区服标签后重新校验已填链接

            };
        });
    }
    // 上传弹窗区服选择（链接格式前置）：国际服 / 国服 单选，选完联动链接校验
    function renderUpServer() {
        var el = $('bc-up-server'); if (!el) return;
        el.innerHTML = ['国际服', '国服'].map(function (s) {
            return '<button type="button" class="bc-tagopt' + (state.upServer === s ? ' active' : '') + '" data-us="' + esc(s) + '">' + s + '</button>';
        }).join('');
        el.querySelectorAll('[data-us]').forEach(function (b) {
            b.onclick = function () {
                state.upServer = b.getAttribute('data-us');
                renderUpServer();
                revalidateLinkHint();
            };
        });
    }
    // 上传标签必选校验：世界/大本/用途 各必须选一个（区服由 bc-up-server 单独必选）；返回缺失的分组名
    function missingTagGroup() {
        for (var i = 0; i < TAG_GROUPS.length; i++) {
            var g = TAG_GROUPS[i];
            var items = groupItems(g, state.upTags);
            var ok = items.some(function (t) { return state.upTags.indexOf(t) >= 0; });
            if (!ok) return g.name;
        }
        return '';
    }
    function openUpload() {
        state.upTags = []; state.upServer = ''; state.upImage = null; state.upParsedLink = '';
        $('bc-up-title').value = ''; $('bc-up-link').value = ''; $('bc-up-remark').value = '';
        $('bc-link-hint').textContent = ''; $('bc-link-hint').style.color = '';
        $('bc-up-filebox').textContent = '点击选择截图';
        renderUpServer();
        renderUpTags();
        $('bc-upload-modal').classList.remove('hidden');
    }
    function closeUpload() { $('bc-upload-modal').classList.add('hidden'); }

    // 截图压缩：最长边 1280，JPEG 0.82（WebView 本地画布，控制在提交体积内）
    function compressImage(file) {
        return new Promise(function (resolve, reject) {
            var r = new FileReader();
            r.onload = function () {
                var img = new Image();
                img.onload = function () {
                    var max = 1280, w = img.width, h = img.height;
                    if (Math.max(w, h) > max) { var k = max / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }
                    var c = document.createElement('canvas');
                    c.width = w; c.height = h;
                    c.getContext('2d').drawImage(img, 0, 0, w, h);
                    resolve(c.toDataURL('image/jpeg', 0.82));
                };
                img.onerror = function () { reject(new Error('图片读取失败')); };
                img.src = r.result;
            };
            r.onerror = function () { reject(new Error('文件读取失败')); };
            r.readAsDataURL(file);
        });
    }

    /* ── tab 切换：广场(square) / 收藏(fav) / 我的(mine)——点击、左右滑动、打开页面三处共用同一入口 ── */
    var TAB_ORDER = ['square', 'fav', 'mine']; // 顺序与 index.html 三个 .bc-tab 的 data-bctab 一致，同时是滑动的前后基准
    function setTab(tab) {
        state.tab = tab;
        document.querySelectorAll('#bases-page .bc-tab').forEach(function (x) {
            x.classList.toggle('active', x.getAttribute('data-bctab') === tab);
        });
        closeDrops(); // 滑动不产生 click，顶部筛选下拉不会自动收起，统一在这里收口
        $('bc-filters').style.display = tab === 'square' ? '' : 'none';
        if (tab === 'square') loadSquare(true);
        else if (tab === 'mine') loadMine();
        else loadFav();
    }
    // 左右滑动切 tab：沿用首页账号区那套自研手势（touchend 判定零开销）——竖向为主、位移不足、多指、弹窗打开均不触发
    function initTabSwipe() {
        var page = $('bases-page');
        if (!page) return;
        var startX = 0, startY = 0, started = false;
        var SWIPE_THRESHOLD = 50, ANGLE_THRESHOLD = 1.5;
        page.addEventListener('touchstart', function (e) {
            started = e.touches.length === 1; // 双指（大图捏合等）不参与切 tab
            if (!started) return;
            startX = e.touches[0].clientX; startY = e.touches[0].clientY;
        }, { passive: true });
        page.addEventListener('touchend', function (e) {
            var valid = started && e.changedTouches.length === 1;
            started = false;
            if (!valid) return;
            // 弹窗开着不切 tab：大图拖动平移、上传/反馈/云备份登录弹窗都不该带动底下页面
            if (document.querySelector('.modal-overlay:not(.hidden)')) return;
            var dx = e.changedTouches[0].clientX - startX, dy = e.changedTouches[0].clientY - startY;
            if (Math.abs(dx) <= SWIPE_THRESHOLD || Math.abs(dx) <= Math.abs(dy) * ANGLE_THRESHOLD) return;
            var i = TAB_ORDER.indexOf(state.tab);
            var next = dx > 0 ? i - 1 : i + 1; // 右滑回上一个、左滑去下一个（与首页账号区方向一致；到两端停住不循环）
            if (i < 0 || next < 0 || next >= TAB_ORDER.length) return;
            setTab(TAB_ORDER[next]);
            // 滑动切换给触感反馈（点击不震，与账号区滑动切账号一致）
            if (CocTool.state.settings.vibrate !== false) CocTool.platform.call('vibrate', 40);
        }, { passive: true });
    }

    function bind() {
        $('more-help').onclick = function () { openHelp(); };
        $('help-back').onclick = function () { closeHelp(); };
        $('more-bases').onclick = function () { CocTool.features.bases.open(); };
        $('bases-back').onclick = function () { CocTool.features.bases.close(); };

        document.querySelectorAll('#bases-page .bc-tab').forEach(function (t) {
            t.onclick = function () { setTab(t.getAttribute('data-bctab')); };
        });
        initTabSwipe();
        $('bc-f-reset').onclick = function () { state.filter = { world: '', th: '', server: '', uses: [] }; renderFilters(); applyFilter(); closeDrops(); };
        $('bc-fbtn-world').onclick = function (e) { e.stopPropagation(); toggleDrop('bc-drop-world'); };
        $('bc-fbtn-th').onclick = function (e) { e.stopPropagation(); toggleDrop('bc-drop-th'); };
        $('bc-fbtn-server').onclick = function (e) { e.stopPropagation(); toggleDrop('bc-drop-server'); };
        $('bc-fbtn-use').onclick = function (e) { e.stopPropagation(); toggleDrop('bc-drop-use'); };
        document.addEventListener('click', function (e) {
            var f = $('bc-filters');
            if (f && !f.contains(e.target)) closeDrops();
        });
        $('bc-lb-close').onclick = closeLightbox;
        $('bc-lightbox').addEventListener('click', function (e) { if (e.target === $('bc-lightbox')) closeLightbox(); });
        $('bc-lb-open').onclick = function () { openLayout($('bc-lb-open').getAttribute('data-open')); bumpStat($('bc-lightbox').getAttribute('data-id'), 'download'); };
        $('bc-lb-copy').onclick = function () { copyLink($('bc-lb-copy').getAttribute('data-copy')); bumpStat($('bc-lightbox').getAttribute('data-id'), 'download'); };
        // 大图缩放：双击切换 1x/2x、滚轮（网页版）、双指捏合（移动）、缩放后单指/鼠标拖动平移
        var lbw = $('bc-lb-imgwrap');
        lbw.addEventListener('dblclick', function () { lbZoomBy(lbState.zoom === 1 ? 2 : (1 / lbState.zoom)); });
        lbw.addEventListener('wheel', function (e) { e.preventDefault(); lbZoomBy(e.deltaY < 0 ? 1.25 : 0.8); }, { passive: false });
        lbw.addEventListener('touchstart', function (e) {
            if (e.touches.length === 2) {
                var dx = e.touches[0].clientX - e.touches[1].clientX, dy = e.touches[0].clientY - e.touches[1].clientY;
                lbState.pinch = { d: Math.sqrt(dx * dx + dy * dy), z: lbState.zoom };
                e.preventDefault();
            } else if (e.touches.length === 1 && lbState.zoom > 1) {
                lbState.drag = { x: e.touches[0].clientX - lbState.tx, y: e.touches[0].clientY - lbState.ty };
            }
        }, { passive: false });
        lbw.addEventListener('touchmove', function (e) {
            if (lbState.pinch && e.touches.length === 2) {
                var dx = e.touches[0].clientX - e.touches[1].clientX, dy = e.touches[0].clientY - e.touches[1].clientY;
                var d = Math.sqrt(dx * dx + dy * dy);
                lbState.zoom = Math.min(4, Math.max(1, lbState.pinch.z * d / lbState.pinch.d));
                lbState.tx = 0; lbState.ty = 0;
                lbApply(); e.preventDefault();
            } else if (lbState.drag && e.touches.length === 1) {
                lbState.tx = e.touches[0].clientX - lbState.drag.x;
                lbState.ty = e.touches[0].clientY - lbState.drag.y;
                lbApply(); e.preventDefault();
            }
        }, { passive: false });
        lbw.addEventListener('touchend', function () { lbState.pinch = null; lbState.drag = null; });
        lbw.addEventListener('mousedown', function (e) {
            if (lbState.zoom > 1) { lbState.drag = { x: e.clientX - lbState.tx, y: e.clientY - lbState.ty }; e.preventDefault(); }
        });
        window.addEventListener('mousemove', function (e) {
            if (lbState.drag) { lbState.tx = e.clientX - lbState.drag.x; lbState.ty = e.clientY - lbState.drag.y; lbApply(); }
        });
        window.addEventListener('mouseup', function () { lbState.drag = null; });
        $('bc-lb-zin').onclick = function () { lbZoomBy(1.5); };
        $('bc-lb-zout').onclick = function () { lbZoomBy(1 / 1.5); };
        $('bc-lb-zreset').onclick = lbReset;
        $('bc-open-upload').onclick = openUpload;
        $('bc-upload-close').onclick = closeUpload;
        $('bc-up-cancel').onclick = closeUpload;
        $('bc-rep-close').onclick = closeReport;
        $('bc-rep-cancel').onclick = closeReport;
        $('bc-report-modal').addEventListener('click', function (e) { if (e.target === $('bc-report-modal')) closeReport(); });
        $('bc-rep-submit').onclick = submitReport;
        $('bc-up-link').addEventListener('input', revalidateLinkHint);
        // 广场瀑布流：分页哨兵进入可视区即加载下一页（.bases-scroll 内滚动，视口为观察根即可）
        if (window.IntersectionObserver) {
            new IntersectionObserver(function (entries) {
                for (var i = 0; i < entries.length; i++) { if (entries[i].isIntersecting) { maybeLoadMore(); return; } }
            }, { rootMargin: '400px 0px' }).observe(sentinelEl());
        }
        var scroller = document.querySelector('#bases-page .bases-scroll');
        if (scroller) scroller.addEventListener('scroll', function () { maybeLoadMore(); });
        $('bc-up-filebox').onclick = function () { $('bc-up-file').click(); };
        $('bc-up-file').addEventListener('change', function () {
            var f = this.files[0]; if (!f) return;
            state.upImageName = f.name;
            $('bc-up-filebox').textContent = '处理中…';
            compressImage(f).then(function (dataUrl) {
                state.upImage = dataUrl;
                $('bc-up-filebox').innerHTML = '<img src="' + dataUrl + '" alt="" style="max-width:100%;max-height:170px;border-radius:8px;">';
            }).catch(function (e) {
                state.upImage = null;
                $('bc-up-filebox').textContent = e.message + '，请重新选择';
            });
        });
        $('bc-up-submit').onclick = function () {
            var title = $('bc-up-title').value.trim();
            var link = $('bc-up-link').value.trim();
            if (!title) { toast('请填写阵型名称'); return; }
            if (!state.upServer) { toast('请先选择区服'); return; }
            if (!linkOkFor(state.upServer, link)) {
                toast(state.upServer === '国服' ? '链接格式错误：国服只能填 TH 阵型码' : '链接格式错误：国际服只能填官方分享链接（https://link.clashofclans.com 开头）');
                return;
            }
            // 标签必选（世界/大本/用途 各一个）：缺失时提示缺哪一类，避免卡片标签残缺
            var miss = missingTagGroup();
            if (miss) { toast('请选择' + miss); return; }
            if (!state.upImage) { toast('请选择阵型截图'); return; }
            var btn = $('bc-up-submit');
            btn.disabled = true; btn.textContent = '提交中…';
            var headers = { 'Content-Type': 'application/json' };
            var auth = cloudAuth();
            if (auth) headers['X-Auth-Token'] = auth.token;
            // 区服自动并入标签（卡片配色/广场筛选依赖区服标签），同时带 server 供后端按区服校验链接
            // 顺序统一为 区服→世界→大本→用途（卡片展示顺序，落库即规范）
            var tags = orderTags(state.upTags.indexOf(state.upServer) < 0 ? state.upTags.concat([state.upServer]) : state.upTags);
            fetchJson(apiBase() + '/api/base/submit', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    title: title,
                    remark: $('bc-up-remark').value.trim(),
                    tags: tags,
                    server: state.upServer,
                    link: link,
                    imageBase64: state.upImage,
                    deviceId: deviceId()
                })
            }).then(function () {
                closeUpload();
                toast('已提交，等待管理员审核');
                if (state.tab === 'square') loadSquare(true); else loadMine();
            }).catch(function (e) {
                toast('提交失败：' + e.message);
            }).finally(function () {
                btn.disabled = false; btn.textContent = '提交审核';
            });
        };
    }

    function openHelp() {
        $('help-page').style.display = 'flex';
    }
    function closeHelp() {
        $('help-page').style.display = 'none';
    }
    CocTool.features.bases = {
        open: function () {
            $('bases-page').style.display = 'flex';
            renderFilters();
            setTab(state.tab);
        },
        close: function () {
            $('bases-page').style.display = 'none';
        },
        // 登录/退出后调用：我的上传重新拉取（登录时服务端自动认领本机旧阵型；退出后回到仅本机匿名视角）
        refreshMine: function () {
            if ($('bases-page').style.display === 'flex' && state.tab === 'mine') loadMine();
        }
    };

    // 云备份登录/退出联动（services.js 登录成功、注册成功、退出登录时派发）
    window.addEventListener('cloud-auth-changed', function () {
        CocTool.features.bases.refreshMine();
    });

    // 更多页入口在脚本加载时即绑定（defer，DOM 已就绪）——若挂在 bases.init 懒加载里，
    // 首次进「更多」时点击无效
    bind();
})();
