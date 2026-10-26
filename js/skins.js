// 皮肤收集（账号详情页第三 tab「皮肤」）：子 tab = 全部 + 各英雄（蛮王/女王/…）。
//   全部 = 按系列分组（skin-names.js 的 seriesGroups，识别不出系列的皮肤按英雄收纳在下方）；
//   英雄 tab = 该英雄全部皮肤平铺。账号 skins 字段判定已收集；图标走服务器（素材不打包 APK，
//   位置见 skin-names.js 头注释）。由 overview-detail.js 在首次切入皮肤 tab 时懒渲染。
(function (global) {
    'use strict';
    var CocTool = global.CocTool = global.CocTool || {};
    CocTool.features = CocTool.features || {};

    var PLACEHOLDER = 'img/icons/20260627.webp';
    var VIEW_ALL = '全部';

    function esc(s) {
        return String(s).replace(/[&<>"]/g, function (m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m];
        });
    }

    // 皮肤图标 URL：cn 先按 cnAssetMap 折算到国际服素材 ID；国服独有（映射为空）回退原 ID 直查同目录
    function iconUrl(server, id) {
        var assetId = CocTool.skinNames.getAssetId(server, id) || id;
        return CocTool.features.pokedex.DATA_BASE + '/skins/skin_icons/' + assetId + '.webp';
    }

    // heroBaseIds 本就是国际服素材 ID（素材按 intl ID 命名）——直接拼 URL。
    // 不能走 iconUrl 的 getAssetId 折算：那会把 intl id 误当 cn id 查 cnAssetMap，
    // 52000250/52000342 在国服侧数字撞上别的皮肤，会被折到错误素材（王子 tab 用了女皇图的根因）
    function baseIconUrl(id) {
        return CocTool.features.pokedex.DATA_BASE + '/skins/skin_icons/' + id + '.webp';
    }

    function tileHtml(server, owned, id) {
        var name = CocTool.skinNames.getName(server, id) || id;
        var isOwned = !!owned[id];
        // 品质图框：黄金令牌金框 / 红框品质红框 / 橙框品质橙框（名单见生成器 GOLD_PASS_ZH / RED_FRAME_SERIES / ORANGE_FRAME_SERIES）
        var isGold = CocTool.skinNames.isGoldPass(server, id);
        var isRed = !isGold && CocTool.skinNames.isRedFrame(server, id);
        var isOrange = !isGold && !isRed && CocTool.skinNames.isOrangeFrame(server, id);
        return '<div class="sk-tile' + (isOwned ? '' : ' sk-locked') + (isGold ? ' sk-gold' : '') + (isRed ? ' sk-red' : '') + (isOrange ? ' sk-orange' : '') + '" data-id="' + id + '" title="' + esc(name) + '">' +
            '<div class="sk-frame">' +
                '<img class="sk-icon" loading="lazy" alt="' + esc(name) + '" src="' + iconUrl(server, id) + '">' +
            '</div>' +
            '<div class="sk-name">' + esc(name) + '</div>' +
        '</div>';
    }

        // ===== 高清展示图预览（点瓷贴）=====
    // 素材在服务器 skin_icons_show/（按 intl 素材 ID 命名、_1/_2/… 多张）；有无图用懒探测：
    // id_1 加载失败（含 cn 独有折算后 404）→ 弹窗显示"暂未收录该皮肤"；成功 → 预探下一张决定切换按钮
    var SHOW_BASE = null;
    function showUrl(server, id, n) {
        if (!SHOW_BASE) SHOW_BASE = CocTool.features.pokedex.DATA_BASE + '/skins/skin_icons_show/';
        var assetId = CocTool.skinNames.getAssetId(server, id) || id;
        return SHOW_BASE + assetId + '_' + n + '.webp';
    }
    var pv = null; // { server, id, name, n, maxN, indexed, els:{overlay,img,name,bar,prev,next,empty} }
    // 展示图索引（{intl素材ID:张数}，skin_show_index.json ~3KB）：皮肤页打开时预取并缓存——
    // 点瓷贴零等待判定有图/未收录/张数；索引未加载完成时回退懒探测（onerror/逐张预探）
    var showIndex = null;
    function loadShowIndex() {
        if (showIndex !== null || !CocTool.features.pokedex.DATA_BASE) return;
        showIndex = undefined;   // undefined = 加载中
        fetch(CocTool.features.pokedex.DATA_BASE + '/skins/skin_show_index.json')
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (j) { showIndex = j || false; })
            .catch(function () { showIndex = false; });
    }
    function ensurePreviewDom() {
        if (pv && pv.els) return pv.els;
        var overlay = document.createElement('div');
        overlay.className = 'modal-overlay sk-preview hidden';
        overlay.innerHTML =
            '<div class="sk-preview-box">' +
                '<button class="sk-preview-close" type="button" aria-label="关闭">×</button>' +
                '<div class="sk-preview-loading"><div class="sk-preview-spinner"></div></div>' +
                '<img class="sk-preview-img" alt="">' +
                '<div class="sk-preview-empty hidden">暂未收录该皮肤</div>' +
                '<div class="sk-preview-name"></div>' +
                '<div class="sk-preview-bar">' +
                    '<button class="sk-preview-nav sk-preview-prev hidden" type="button" aria-label="上一张">‹</button>' +
                    '<span class="sk-preview-num"></span>' +
                    '<button class="sk-preview-nav sk-preview-next hidden" type="button" aria-label="下一张">›</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(overlay);
        var els = {
            overlay: overlay,
            img: overlay.querySelector('.sk-preview-img'),
            loading: overlay.querySelector('.sk-preview-loading'),
            empty: overlay.querySelector('.sk-preview-empty'),
            name: overlay.querySelector('.sk-preview-name'),
            num: overlay.querySelector('.sk-preview-num'),
            prev: overlay.querySelector('.sk-preview-prev'),
            next: overlay.querySelector('.sk-preview-next'),
            close: overlay.querySelector('.sk-preview-close')
        };
        els.close.addEventListener('click', closePreview);
        overlay.addEventListener('click', function (e) { if (e.target === overlay) closePreview(); });
        els.prev.addEventListener('click', function () { if (pv && pv.n > 1) showN(pv.n - 1); });
        els.next.addEventListener('click', function () { if (pv && pv.n < pv.maxN) showN(pv.n + 1); });
        pv = pv || {};
        pv.els = els;
        return els;
    }
    function closePreview() {
        if (!pv || !pv.els) return;
        pv.els.overlay.classList.add('hidden');
        pv.els.img.src = '';
    }
    function updateBar() {
        var e = pv.els;
        e.num.textContent = pv.maxN > 1 ? (pv.n + ' / ' + pv.maxN) : '';
        e.prev.classList.toggle('hidden', pv.n <= 1);
        e.next.classList.toggle('hidden', pv.n >= pv.maxN);
    }
    // 探测下一张是否存在（存在则扩展 maxN、亮出 next）
    function probeNext(n) {
        var probe = new Image();
        probe.onload = function () {
            if (pv && pv.n === n && n + 1 > pv.maxN) { pv.maxN = n + 1; updateBar(); }
        };
        probe.src = showUrl(pv.server, pv.id, n + 1);
    }
    function showN(n) {
        pv.n = n;
        var e = pv.els;
        e.empty.classList.add('hidden');
        e.img.style.display = 'none';
        e.loading.classList.remove('hidden');   // 加载中：spinner 可见（onload/onerror 切走）
        e.img.src = showUrl(pv.server, pv.id, n);
        e.img.onerror = function () {
            e.loading.classList.add('hidden');
            if (n === 1) {   // 首张就失败 = 服务器未收录该皮肤
                e.img.style.display = 'none';
                e.empty.classList.remove('hidden');
                e.name.textContent = pv.name;
                e.num.textContent = '';
                e.prev.classList.add('hidden');
                e.next.classList.add('hidden');
            } else {         // 切换中途失败：留在上一张
                showN(n - 1);
            }
        };
        e.img.onload = function () {
            e.loading.classList.add('hidden');
            e.img.style.display = '';
            updateBar();
            if (!pv.indexed) probeNext(n);
        };
        updateBar();
    }
    function openPreview(server, id, name) {
        var els = ensurePreviewDom();
        pv.server = server;
        pv.id = id;
        pv.name = name;
        pv.maxN = 1;
        pv.indexed = false;
        els.name.textContent = name;
        els.overlay.classList.remove('hidden');
        var assetId = CocTool.skinNames.getAssetId(server, id) || id;
        if (showIndex && showIndex[assetId]) {
            // 索引命中：张数已知、零探测
            pv.maxN = showIndex[assetId];
            pv.indexed = true;
            showN(1);
        } else if (showIndex) {
            // 索引明确无记录：立即空态，不发请求
            pv.n = 1;
            e2Empty(els, name);
        } else {
            showN(1);   // 索引未加载完成：回退懒探测
        }
    }
    function e2Empty(els, name) {
        els.empty.classList.remove('hidden');
        els.img.style.display = 'none';
        els.loading.classList.add('hidden');
        els.img.src = '';
        els.name.textContent = name;
        els.num.textContent = '';
        els.prev.classList.add('hidden');
        els.next.classList.add('hidden');
    }
    function bindTileClick(root, server) {
        var tiles = root.querySelectorAll('.sk-tile[data-id]');
        for (var i = 0; i < tiles.length; i++) {
            tiles[i].addEventListener('click', function () {
                var id = this.getAttribute('data-id');
                openPreview(server, id, CocTool.skinNames.getName(server, id) || id);
            });
        }
    }

    function bindIconFallback(root) {
            // 破图回退：远程图标缺失 → 本地占位图（属性赋值，不产生全局回调）
            var imgs = root.querySelectorAll('img.sk-icon, img.sk-tab-icon');
            for (var j = 0; j < imgs.length; j++) {
                imgs[j].onerror = function () {
                    if (!this.dataset.fb) { this.dataset.fb = '1'; this.src = PLACEHOLDER; }
                    else { this.style.display = 'none'; }
                };
            }
        }

    function render(container, data) {
        if (!container || !data) return;
        var server = data._server === 'cn' ? 'cn' : 'intl';
        var owned = {};
        // 账号皮肤分两个数组：skins = 主世界英雄；skins2 = 夜世界（战斗机器/战斗直升机）——
        // 只看 skins 会漏掉装甲机器这类夜世界皮肤（用户 2026-10-26 报障）
        var list = (data.skins || []).concat(data.skins2 || []);
        for (var i = 0; i < list.length; i++) owned[String(list[i])] = true;

        var heroes = CocTool.skinNames.getHeroGroups(server);        // [[英雄名, [id…]], …]
        var series = CocTool.skinNames.getSeriesGroups(server);      // [[系列名, [id…]], …]
        var inSeries = {};
        series.forEach(function (g) { g[1].forEach(function (id) { inSeries[id] = true; }); });
        // 系列未覆盖的皮肤 → 英雄收纳（全部视图底部）
        var heroLeftover = heroes.map(function (g) {
            return [g[0], g[1].filter(function (id) { return !inSeries[id]; })];
        }).filter(function (g) { return g[1].length; });
        var count = function (ids) {
            var got = 0;
            ids.forEach(function (id) { if (owned[id]) got++; });
            return got;
        };

        // 子 tab：全部（文字）+ 各英雄（原皮形象做图标；原皮不入册，形象转世成 tab）
        var heroBaseIds = CocTool.skinNames.heroBaseIds || {};
        var views = [VIEW_ALL].concat(heroes.map(function (g) { return g[0]; }));
        var chips = views.map(function (v) {
            if (v === VIEW_ALL) return '<button class="sk-subtab" data-view="' + esc(v) + '">' + esc(v) + '</button>';
            var base = heroBaseIds[v];
            if (!base) return '<button class="sk-subtab" data-view="' + esc(v) + '">' + esc(v) + '</button>';
            return '<button class="sk-subtab sk-subtab-ic" data-view="' + esc(v) + '" title="' + esc(v) + '" aria-label="' + esc(v) + '">' +
                '<img class="sk-tab-icon" loading="lazy" alt="' + esc(v) + '" src="' + baseIconUrl(base) + '">' +
            '</button>';
        }).join('');
        container.innerHTML =
            '<div class="sk-subtabs">' + chips + '</div>' +
            '<div class="sk-body"></div>';
        // 服标记：品质框配色按服区分（intl 金框亮金；cn 黄金令牌/红框三系列在游戏内是米金框，见 .sk-cn 覆盖段）
        container.classList.toggle('sk-cn', server === 'cn');
        bindIconFallback(container);
        var body = container.querySelector('.sk-body');
        var subtabs = container.querySelectorAll('.sk-subtab');
        // 左右滑切子 tab（用户 2026-10-25 从主 tab 下放至此）：全部 → 蛮王 → … 线性顺序；
        // 绑在内容区 .sk-body——子 tab 栏自身可横向滚动，在其上滑动只滚条不切页
        var curView = VIEW_ALL;
        var sx = 0, sy = 0;
        body.addEventListener('touchstart', function (e) {
            if (e.touches.length === 1) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }
        }, { passive: true });
        body.addEventListener('touchend', function (e) {
            if (e.changedTouches.length !== 1) return;
            var dx = e.changedTouches[0].clientX - sx;
            var dy = e.changedTouches[0].clientY - sy;
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                var idx = views.indexOf(curView);
                if (dx < 0 && idx >= 0 && idx < views.length - 1) renderView(views[idx + 1]);
                else if (dx > 0 && idx > 0) renderView(views[idx - 1]);
            }
        }, { passive: true });

        function renderView(view) {
            curView = view;
            for (var c = 0; c < subtabs.length; c++) {
                subtabs[c].classList.toggle('active', subtabs[c].getAttribute('data-view') === view);
            }
            var parts = [];
            if (view === VIEW_ALL) {
                series.forEach(function (g) {
                    parts.push(groupHtml(g[0] + '系列', count(g[1]) + '/' + g[1].length, g[1], true));
                });
                heroLeftover.forEach(function (g) {
                    parts.push(groupHtml(g[0], count(g[1]) + '/' + g[1].length, g[1]));
                });
            } else {
                var hg = null;
                for (var h = 0; h < heroes.length; h++) if (heroes[h][0] === view) hg = heroes[h];
                if (!hg) return;
                parts.push(groupHtml(view, count(hg[1]) + '/' + hg[1].length, hg[1]));
            }
            // 无卡片头（用户 2026-10-25：原皮不入图鉴，统计行也不要）——计数在各组标签上
            body.innerHTML =
                '<div class="ov-sections">' +
                    '<div class="ov-cat">' +
                        '<div class="ov-cat-body">' + parts.join('') + '</div>' +
                    '</div>' +
                '</div>';
            bindIconFallback(body);
            bindTileClick(body, server);
            var sc = document.getElementById('ov-detail-scroll');
            if (sc) sc.scrollTop = 0;
        }

        // byHero = 系列组：按英雄序原样渲染（生成期已排好）；
        // 散件/单英雄 tab（byHero 省略）：**三级排序 = 拥有情况 → 品质 tier → ID**（用户 2026-10-25 拍板，
        // "已收集在前"保留为第一优先级）——tier 即图框色：cn 金(亮金三系列)>紫(十系列)>蓝(默认)>米金(令牌)、
        // intl 紫(默认)>金(令牌)；与 .sk-gold/.sk-red/.sk-orange 的互斥链同源
        function qualityTier(server, id) {
            if (server === 'cn') {
                if (CocTool.skinNames.isRedFrame('cn', id)) return 0;
                if (CocTool.skinNames.isOrangeFrame('cn', id)) return 1;
                if (CocTool.skinNames.isGoldPass('cn', id)) return 3;
                return 2;
            }
            if (CocTool.skinNames.isGoldPass('intl', id)) return 1;
            return 0;
        }
        function groupHtml(label, cnt, ids, byHero) {
            var ordered = ids;
            if (!byHero) {
                ordered = ids.slice().sort(function (a, b) {
                    return ((owned[a] ? 0 : 1) - (owned[b] ? 0 : 1)) ||
                        (qualityTier(server, a) - qualityTier(server, b)) ||
                        (Number(a) - Number(b));
                });
            }
            return '<div class="ov-sub-label sk-label">' + esc(label) + '<span class="sk-cnt">' + cnt + '</span></div>' +
                '<div class="sk-grid">' + ordered.map(function (id) { return tileHtml(server, owned, id); }).join('') + '</div>';
        }

        for (var t = 0; t < subtabs.length; t++) {
            subtabs[t].addEventListener('click', function () {
                renderView(this.getAttribute('data-view'));
            });
        }
        loadShowIndex();
        renderView(VIEW_ALL);
    }

    CocTool.skins = Object.freeze({ render: render });
})(window);
