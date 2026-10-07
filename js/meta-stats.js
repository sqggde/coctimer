/**
 * 流派统计（F-20261006-2）—— 更多页入口的全屏整屏页
 * 数据：GET /api/coc/meta/armies（聚合榜 + 每流派最热变体）；GET /api/coc/meta/armies/:key（变体下钻）
 * 形态：对齐预览 v4（卡片外层 = 最热变体完整配兵；命名 = 特征兵种·最热法术·最热装备）
 * 图标/名称：全部本地解析（img/icons 目录 + names.js），服务端只出 ID 与统计
 */
(function () {
    'use strict';
    var C = window.CocTool;
    if (!C) return;

    function $(id) { return document.getElementById(id); }
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
    function api(path, cb) {
        var x = new XMLHttpRequest();
        x.open('GET', C.apiBase + path, true);
        x.setRequestHeader('X-App-Token', C.appToken);
        x.onload = function () {
            if (x.status === 200) { try { cb(null, JSON.parse(x.responseText)); } catch (e) { cb(e); } }
            else cb(new Error('HTTP ' + x.status));
        };
        x.onerror = function () { cb(new Error('网络错误')); };
        x.send();
    }

    // ---- 显示简称（用户 2026-10-07 拍板；与预览报告同表）----
    var TROOP_SHORT = { '4000026': '超蛮', '4000027': '超弓', '4000055': '超哥', '4000028': '超炸', '4000029': '超巨', '4000057': '超球', '4000083': '超法', '4000081': '大金龙', '4000084': '超亡', '4000064': '超武', '4000066': '超巫', '4000076': '冰狗', '4000080': '超蓝', '4000056': '超矿工', '4000147': '超雪', '4000098': '超猪', '4000022': '蓝胖' };
    var EQUIP_SHORT = { '90000060': '反击', '90000059': '电牙', '90000017': '巨箭', '90000004': '金身', '90000022': '火球', '90000014': '足球', '90000010': '手套', '90000048': '人偶', '90000052': '龙心', '90000005': '宝石' };
    // 史诗装备（底色紫；普通蓝）——与 overview-detail.js 的 EPIC_EQ 及 coc-api-proxy/meta-stats.js 三处同表；
    // 契约测试与 game-data-normalized 的 rarity 对拍。90000061 传送吊坠 = 用户预告的王子新史诗（游戏数据里还没有）
    var EPIC_EQ = ['90000051', '90000032', '90000014', '90000010', '90000016', '90000048', '90000039', '90000015', '90000019', '90000041', '90000022', '90000050', '90000040', '90000013', '90000049', '90000035', '90000053', '90000060', '90000061'];
    var ICON_MISS = 'img/icons/20260627.webp'; // 缺图占位（与图鉴一致）

    function names() { return (C.names && C.names.ITEM_NAMES) || {}; }
    function nm(id) { var n = names()[String(id)]; return n || ('未知' + id); }
    function troopName(id) { return TROOP_SHORT[String(id)] || nm(id); }
    function equipName(id) { return EQUIP_SHORT[String(id)] || nm(id); }
    function spellName(id) { return nm(id).replace(/法术$/, ''); }
    function iconDir(id) {
        id = +id;
        if (id >= 90000000) return 'equipment';
        if (id >= 73000000) return 'pets';
        if (id >= 28000000 && id < 29000000) return 'heroes';
        return 'lab';
    }
    function icon(id, size) {
        size = size || 42;
        return '<img class="ic" style="width:' + size + 'px;height:' + size + 'px" src="img/icons/' + iconDir(id) + '/' + id + '.webp"' +
            ' title="' + esc(nm(id)) + '" onerror="this.onerror=null;this.src=\'' + ICON_MISS + '\'">';
    }

    // ---- 页面状态 ----
    var data = null;          // /meta/armies 响应
    var sortKey = 'adopt';

    function toast(msg) {
        var t = $('meta-stats-toast');
        if (!t) return;
        t.textContent = msg;
        t.classList.add('on');
        setTimeout(function () { t.classList.remove('on'); }, 1400);
    }
    function copyText(text, msg) {
        function fallback() {
            var ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); toast(msg); } catch (e) { toast('复制失败'); }
            document.body.removeChild(ta);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () { toast(msg); }, fallback);
        } else fallback();
    }
    var LINK_TPL = 'https://link.clashofclans.com/?action=CopyArmy&army=';

    // ---- 配兵网格（主卡 / 变体小号共用）----
    function armyGrid(rep, troops, small) {
        if (!rep) return '';
        // 尺寸表与 css/meta-stats.css 的英雄块几何（宽高 + 宠物/装备圆偏移）配套，改一处必须改另一处
        var S = small ? { hero: 30, eq: 14, pet: 19, troop: 26, cc: 22 } : { hero: 36, eq: 18, pet: 24, troop: 32, cc: 26 };
        var h = '<div class="ms-army' + (small ? ' sm' : '') + '">';
        (rep.heroes || []).forEach(function (hero) {
            h += '<span class="u hero">' + (hero.heroId != null ? icon(hero.heroId, S.hero) : '');
            if (hero.petId) h += '<span class="pet">' + icon(hero.petId, S.pet) + '</span>';
            (hero.equipment || []).slice(0, 2).forEach(function (q, i) {
                var rare = EPIC_EQ.indexOf(String(q)) !== -1 ? 'rare-e' : 'rare-c';
                h += '<span class="eq e' + (i + 1) + ' ' + rare + '">' + icon(q, S.eq) + '</span>';
            });
            h += '</span>';
        });
        (troops || []).forEach(function (t) { h += '<span class="u">' + icon(t.id, S.troop) + '<span class="n">' + t.count + 'x</span></span>'; });
        h += '<span class="sep"></span>';
        (rep.spells || []).forEach(function (s) { h += '<span class="u">' + icon(s.id, S.troop) + '<span class="n">' + s.count + 'x</span></span>'; });
        h += '<span class="sep cc" title="援军"></span>';
        (rep.ccTroops || []).concat(rep.ccSpells || []).forEach(function (c) { h += '<span class="u">' + icon(c.id, S.cc) + '<span class="n">' + c.count + 'x</span></span>'; });
        return h + '</div>';
    }

    function archName(a) {
        var n = a.units.map(function (u) { return troopName(u.id); }).join('+');
        if (a.spTop && a.spTop.length) n += '·' + spellName(a.spTop[0]);
        if (a.eqTop && a.eqTop.length) n += '·' + equipName(a.eqTop[0]);
        return n;
    }

    // ---- 渲染 ----
    function renderCards() {
        var wrap = $('meta-stats-cards');
        var list = data.archetypes.slice().sort(function (x, y) {
            var d = y[sortKey] - x[sortKey];
            return d !== 0 ? d : y.owners - x.owners;
        });
        var html = '<div class="ms-note">' + data.meta.owners + ' 位玩家 / ' + data.meta.battles + ' 场进攻·数据来源为国际服传奇杯玩家</div>';
        list.forEach(function (a, i) {
            var topCode = a.top && a.top.code;
            html += '<div class="ms-card" data-key="' + a.key + '"' + (topCode ? ' data-topcode="' + esc(topCode) + '"' : '') + '>'
                // ms-chead = 卡头整块（名次/名称/配兵/四格统计/动作键）：变体展开后整块吸顶，
                // 只吸底下那一行动作键会显得突兀（用户 2026-10-07 的修正）
                + '<div class="ms-chead">'
                + '<div class="ms-head"><span class="ms-rank">' + String(i + 1).padStart(2, '0') + '</span><div class="ms-lft">'
                + '<div class="ms-name">' + esc(archName(a)) + '</div>'
                + '<div class="ms-sub">' + a.owners + ' 位玩家在使用 · 对战 ' + a.battles + ' 场</div></div></div>'
                + armyGrid(a.top && a.top.rep, a.top && a.top.troops, false)
                + '<div class="ms-statline">'
                + '<span><i>平均摧毁</i><b>' + a.avgDest.toFixed(1) + '%</b></span>'
                + '<span><i>平均星数</i><b>' + a.avgStars.toFixed(2) + '★</b></span>'
                + '<span><i>三星率</i><b>' + a.threeRate.toFixed(1) + '%</b></span>'
                + '<span><i>使用率</i><b>' + a.adopt.toFixed(1) + '%</b></span></div>'
                // 外层卡 = 使用率最高的变体 → 按钮就作用于它；右边挂「查看更多变体」（同一行，省竖直空间）
                + '<div class="ms-cardfoot">' + (topCode ? actsHtml() : '')
                + '<span class="ms-chev">查看更多变体 ▾</span></div>'
                + '</div>'
                + '<div class="ms-variants"></div></div>';
        });
        wrap.innerHTML = html;
        // 变体展开（首次点击按需拉取）
        wrap.querySelectorAll('.ms-card').forEach(function (card) {
            bindActs(card, card.getAttribute('data-topcode'));
            var chev = card.querySelector('.ms-chev');
            var box = card.querySelector('.ms-variants');
            var topCode = card.getAttribute('data-topcode');
            chev.onclick = function () {
                var open = box.style.display === 'block';
                if (open) {
                    box.style.display = 'none'; chev.textContent = '查看更多变体 ▾';
                    // 在长列表深处收起时，把本卡卡头拉回视野顶部（否则会停在别的卡中间）
                    scrollCardToTop(card);
                    return;
                }
                box.style.display = 'block';
                chev.textContent = '收起 ▴';
                if (box.getAttribute('data-loaded')) return;
                box.innerHTML = '<div class="ms-loading">加载中…</div>';
                api('/api/coc/meta/armies/' + encodeURIComponent(card.getAttribute('data-key')), function (err, res) {
                    if (err) { box.innerHTML = '<div class="ms-loading">加载失败：' + esc(err.message) + '</div>'; chev.textContent = '查看更多变体 ▾'; box.style.display = 'none'; return; }
                    box.setAttribute('data-loaded', '1');
                    box.innerHTML = renderVariants(res, topCode);
                    bindVariantActs(box);
                    syncHeadSheen(card);   // 卡片此时才到最终高度，按它设吸顶块的渐变跨度
                });
            };
        });
    }
    // 把某张卡的卡头对齐到滚动区顶部（收起长列表后回到原位；12px = 滚动容器上内边距）
    function scrollCardToTop(card) {
        var body = $('meta-stats-body');
        if (!body || !card) return;
        var delta = card.getBoundingClientRect().top - body.getBoundingClientRect().top;
        body.scrollTop = Math.max(0, body.scrollTop + delta - 12);
    }
    // 吸顶块的底色要跟卡片**逐像素**一致：卡片的光泽渐变按整张卡的高度铺，吸顶块只有几百像素高，
    // 不把跨度设成卡片高度的话，块的下半段会比卡片同位置的底色偏暗（用户 2026-10-07「吸顶部分要跟卡片背景色一致」）。
    // 变体渲染完（卡片才到最终高度）后调一次即可；收起后不再吸顶，无需重算
    function syncHeadSheen(card) {
        var head = card && card.querySelector('.ms-chead');
        if (head) head.style.backgroundSize = '100% ' + card.offsetHeight + 'px';
    }
    function actsHtml() {
        // 「一键打开」带 ms-act-intl：紫色 = 国际服（与账号页「打开游戏键」同语义），因为它进的是国际服客户端
        return '<div class="ms-vacts"><button class="ms-act" data-act="link">配兵链接</button><button class="ms-act ms-act-intl" data-act="open">一键打开</button></div>';
    }
    // 给 scope 里的两个按键绑上某个配兵码（外层卡传最热变体的码，变体块传各自的码）
    function bindActs(scope, code) {
        if (!scope || !code) return;
        var link = LINK_TPL + code;
        var b1 = scope.querySelector('[data-act="link"]');
        var b2 = scope.querySelector('[data-act="open"]');
        if (b1) b1.onclick = function () { copyText(link, '已复制配兵链接'); };
        if (b2) b2.onclick = function () {
            if (C.platform && C.platform.openExternal) C.platform.openExternal(link);
            else window.open(link, '_blank');
        };
    }
    // excludeCode = 外层卡那个最热变体的码：更多变体里不再重复它，序号保留真实名次（外层卡即第 1）
    function renderVariants(res, excludeCode) {
        var html = '';
        res.variants.forEach(function (v) {
            if (excludeCode && v.code === excludeCode) return;
            var rank = res.variants.indexOf(v) + 1;
            html += '<div class="ms-vblock" data-code="' + esc(v.code || '') + '">'
                + '<div class="ms-vhead"><span class="ms-vnum">' + rank + '</span>'
                + '<span>' + v.owners + ' 人 / ' + v.battles + ' 场 / 均星 <b>' + v.avgStars.toFixed(2) + '</b> / 均摧毁 <b>' + v.avgDest.toFixed(1) + '%</b> / 三星率 <b>' + v.threeRate.toFixed(1) + '%</b></span></div>'
                + armyGrid(v.rep, v.troops, true)
                + actsHtml()
                + '</div>';
        });
        return html || '<div class="ms-loading">暂无更多变体</div>';
    }
    function bindVariantActs(box) {
        box.querySelectorAll('.ms-vblock').forEach(function (blk) {
            bindActs(blk, blk.getAttribute('data-code'));
        });
    }
    function renderUnits(tbId, list, metric) {
        var tb = $(tbId);
        tb.innerHTML = list.map(function (u, i) {
            var v = metric ? u[metric] : u.adopt;
            // 名称列只出图标（用户 2026-10-07：三张单维度表图标足够；名称仍挂在图标的 title 上可悬停查看）
            return '<tr><td>' + (i + 1) + '</td><td>' + icon(u.id, 28) + '</td>'
                + '<td class="num">' + u.owners + '</td><td class="num">' + (v == null ? 0 : v).toFixed(1) + '%</td>'
                + '<td class="num">' + u.battles + '</td><td class="num">' + u.avgStars.toFixed(2) + '</td></tr>';
        }).join('');
    }
    function showTab(name) {
        document.querySelectorAll('#meta-stats-view .ms-tabs .tab').forEach(function (t) { t.classList.toggle('on', t.getAttribute('data-p') === name); });
        document.querySelectorAll('#meta-stats-view .ms-panel').forEach(function (p) { p.classList.toggle('on', p.id === 'ms-p-' + name); });
    }

    function load(force) {
        var body = $('meta-stats-body');
        body.innerHTML = '<div class="ms-loading">加载中…</div>';
        api('/api/coc/meta/armies', function (err, res) {
            if (err) { body.innerHTML = '<div class="ms-loading">加载失败：' + esc(err.message) + '<br><br>请确认网络后重试</div>'; return; }
            data = res;
            body.innerHTML = buildShell();
            bindShell();
            renderCards();
            renderUnits('ms-tb-troop', res.troops, 'occupancy');
            renderUnits('ms-tb-equip', res.equips);
            renderUnits('ms-tb-pet', res.pets);
        });
    }
    function buildShell() {
        return '<div class="ms-tabs"><button class="tab on" data-p="arch">热门配兵</button><button class="tab" data-p="troop">兵种使用率</button><button class="tab" data-p="equip">英雄装备</button><button class="tab" data-p="pet">宠物</button></div>'
            + '<div class="ms-panel on" id="ms-p-arch">'
            + '<div class="ms-sorts"><span>排序：</span><button class="sb on" data-k="adopt">使用率</button><button class="sb" data-k="threeRate">三星率</button></div>'
            + '<div id="meta-stats-cards"></div></div>'
            + '<div class="ms-panel" id="ms-p-troop"><div class="ms-note">营地占比：该兵种平均每场占用的兵营比例（满营 = 100%）</div><table class="ms-table"><thead><tr><th>#</th><th>兵种</th><th class="num">使用人数</th><th class="num">营地占比</th><th class="num">场次</th><th class="num">平均星</th></tr></thead><tbody id="ms-tb-troop"></tbody></table></div>'
            + '<div class="ms-panel" id="ms-p-equip"><table class="ms-table"><thead><tr><th>#</th><th>装备</th><th class="num">使用人数</th><th class="num">使用率</th><th class="num">场次</th><th class="num">平均星</th></tr></thead><tbody id="ms-tb-equip"></tbody></table></div>'
            + '<div class="ms-panel" id="ms-p-pet"><table class="ms-table"><thead><tr><th>#</th><th>宠物</th><th class="num">使用人数</th><th class="num">使用率</th><th class="num">场次</th><th class="num">平均星</th></tr></thead><tbody id="ms-tb-pet"></tbody></table></div>';
    }
    function bindShell() {
        document.querySelectorAll('#meta-stats-view .ms-tabs .tab').forEach(function (t) {
            t.onclick = function () { showTab(t.getAttribute('data-p')); };
        });
        document.querySelectorAll('#meta-stats-view .ms-sorts .sb').forEach(function (b) {
            b.onclick = function () {
                document.querySelectorAll('#meta-stats-view .ms-sorts .sb').forEach(function (x) { x.classList.remove('on'); });
                b.classList.add('on');
                sortKey = b.getAttribute('data-k');
                renderCards();
            };
        });
    }

    // ---- 打开 / 关闭 ----
    function open() {
        var v = $('meta-stats-view');
        if (!v) return;
        v.classList.remove('hidden');
        v.style.display = 'flex';
        if (!data) load();
    }
    function close() {
        var v = $('meta-stats-view');
        if (!v) return;
        v.style.display = 'none';
        v.classList.add('hidden');
    }
    function init() {
        var back = $('meta-stats-back-btn');
        if (back) back.onclick = close;
        var refresh = $('meta-stats-refresh-btn');
        if (refresh) refresh.onclick = function () { data = null; load(true); };
        var entry = $('more-meta');
        if (entry) entry.onclick = function () { open(); };
    }

    C.features = C.features || {};
    C.features.metaStats = { init: init, open: open, close: close };
})();
