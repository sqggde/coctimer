/**
 * overview-share.js —— 账号详情页「分享图」（无头页面：固定布局，不受设备缩放影响）
 *
 * 用途：账号详情页「等级/时间」那一行里的分享键 → 按**当前所在 tab** 把该世界的内容重排成一张分享图。
 *   - 主世界（宽 928px）：上半区两列 —— 左 = 顶部块 + 英雄（含装备）；右 = 战宠 + 科技；
 *     下半区左右分区 —— 防御 | 其他。上展区每行最多 11 个图标、下展区 13/8。
 *   - 夜世界（宽 360px）：单列，每行最多 8 个图标。
 *
 * 固定布局：宽度**写死**、不受设备缩放影响。**"每行最多 N 个图标"由 css/overview.css 给行容器设的
 * `max-width = 38N−2` 承担**（主世界上展区 416 = 11 个、夜世界 302 = 8 个），不靠页宽/卡内边距/描边的
 * 像素加减凑（差 1px 就会掉一个图标，实测踩过 11→10）。夜世界的页宽/行上限/顶部留白是一组**互相咬合**
 * 的数字（页宽 − 页留白 24 − 卡内 24 − 描边 2 ≥ 行上限），有契约测试整组钉住。
 *
 * 内容来源：**克隆详情页已经渲染好的块**（`[data-ov-sec]` 标记的 `.ov-cat` + 顶部 `.ov-body`），
 * 分享页里不重写 markup —— 布局只有一处来源，详情页改了什么分享页自动跟上。
 * 配色**故意不跟主题**（固定浅色，见 css/overview.css 的 `.ovs-page` 段）：分享出去的图不该
 * 随发送者当前主题变，与部落战分享图（`war-stats.js`）同一思路。
 * **品牌标识**：主世界挂在守卫行末尾（守卫行恒 3 个图标、注定空），夜世界没有守卫分节 → 页面顶部
 * 单独一行居中（`WORLDS.night.topBrand`）。位置与尺寸全在 css/overview.css 的 `.ovs-brand` 段，
 * **只作用于分享页，详情页不动**。
 *
 * 两个入口（都在 `CocTool.features.share`）：
 *   - `open()`  = 分享键的动作：出 2× PNG → 交 `war-stats.js` 那套共用分享弹窗（保存到相册 / 分享 / 取消）；
 *   - `preview()` = 布局预览壳（开发与 `probe-share-layout.cjs` 用）。
 * 出图的实现与三条坑（SVG-as-image 不加载外部资源、真机 file:// 要过 `readAssetBase64` 桥、
 * `<style>` 必须 CDATA）见下方「出图（PNG）」段。
 */
(function (global) {
    'use strict';

    const CocTool = global.CocTool;
    if (!CocTool) {
        throw new Error('overview-share.js requires core.js');
    }

    // 世界配置（页宽写死；twoCol 只影响主世界）
    const WORLDS = {
        home: { width: 928, twoCol: true, secs: ['heroes', 'pets', 'lab', 'defense', 'other'] },
        // 夜世界没有「守卫」分节可挂 → 品牌标识按用户口径**在页面顶部单独起一行、居中**（topBrand）
        // 页宽 360：内容不多，用户 2026-09-19「12 个图标的宽度页显得稍微有些空旷」→ 每行收到 8 个
        // （行上限 302 = 38×8−2），页宽随之收到「卡内 310 ≥ 302」= 360（360 − 页留白 24 − 卡内 24 − 描边 2）
        night: { width: 360, twoCol: false, topBrand: true, secs: ['heroes', 'troops', 'defense', 'other'] }
    };
    // 主世界上半区两列归属（其余展区通栏）
    const UPPER_LEFT = ['heroes'];
    const UPPER_RIGHT = ['pets', 'lab'];
    const LOWER = ['defense', 'other'];

    // 分享页的**行合并口径**（只影响分享页，详情页不动）：外层键 = 展区（`data-ov-sec`），内层键 = 详情页
    // `.ov-sub-label` 的文字，值：
    //   { joinOne: true }            → 该分节内**所有行并成一个容器**，由 flex-wrap 按列宽**自动铺满**（最密）
    //   { groups: [[行下标…], …] }   → 按组并成若干行（需要保语义分组时用；没被提到的行原样留在原位）
    //   { label, joinNext, joinOne } → 与**下一分节**合成一段、改名、行全并一行
    //   { brand: true }              → 该分节并成的那一行末尾挂**品牌标识**（只守卫行用，见 BRAND）
    // 下方两区（防御 / 其他）改左右分区后每列更窄、行更短，所以用 `joinOne` 自动铺满——
    // 比手写分组密，也不受账号数据（陷阱/墙的分级行数）影响。口径出处见 F-20260919-9。
    const ROW_SPEC = {
        home: {
            defense: {
                // 加农炮+箭塔+法师塔 独占一行；其余按用户 2026-09-19 口径分组（每行 12~13 个图标）
                '防御建筑': { groups: [
                    ['1000008', '1000009', '1000011'],
                    ['1000015', '1000012', '1000013'],
                    ['1000019', '1000021', '1000027'],
                    ['1000028', '1000032', '1000067', '1000084', '1000085', '1000079'],
                    ['1000031', '1000072', '1000089', '1000102', '1000077', '1000086', '1000097',
                        '103000011', '103000012', '103000013', '152000011', '152000012', '152000013']
                ] },
                '守卫': { joinOne: true, brand: true },
                '陷阱': { joinOne: true }
            },
            other: {
                // 资源建筑按用户口径：大本组 / 圣水瓶+储金罐 / 圣水采集器 / 金矿（顺序即指定顺序）
                '资源建筑': { groups: [
                    ['1000001', '1000014', '1000024', '1000023'],
                    ['1000003', '1000005'],
                    ['1000002'],
                    ['1000004']
                ] },
                '军队建筑': { joinOne: true },
                '其他': { label: '其他+墙', joinNext: true, joinOne: true }
            }
        },
        night: {
            defense: {
                // 夜世界**没有「守卫」分节**（它的守卫是多管迫击炮/守卫哨岗那类 max=1 图标，混在
                // 「防御建筑」里，见 overview-detail.js 的 renderNightDetail）→ 品牌标识走页面顶部行（topBrand）。
                // 防御建筑按用户 2026-09-19 口径（以**账号详情页的四行**为基准，把详情页第四行里的两枚
                // 挪到前两行末尾；用户说的「第一/二/三/四行」就是详情页那四行 [6,6,7,9]）：
                '防御建筑': { groups: [
                    ['1000041', '1000043', '1000045'],                       // 行1：双管加农炮×3 + 特斯拉电磁塔×3 + 多管迫击炮
                    ['1000044', '1000048', '1000056'],                       // 行2：加农炮(夜)×3 + 箭塔(夜)×3 + 熔岩火炮
                    ['1000050', '1000055'],                                  // 行3：防空火箭(夜)×5 + 撼地巨石×2（不变）
                    ['1000051', '1000052', '1000054', '1000057', '1000063', '1000078', '1000081']   // 行4：其余 max=1
                ] },
                '陷阱': { joinOne: true }
            },
            other: {
                // 资源建筑：大本 + 圣水瓶 + 储金罐 / 圣水采集器 + 金矿（用户 2026-09-19）
                '资源建筑': { groups: [
                    ['1000034', '1000036', '1000038'],
                    ['1000035', '1000037']
                ] },
                // 军队建筑：**保持账号详情页的布局**（用户 2026-09-19）——不给 spec 就是不重排，原行照搬
                '其他': { label: '其他+墙', joinNext: true, joinOne: true }
            }
        }
    };
    // 下方两区的列（只主世界分左右；夜世界只有 520px 宽，分两列会挤成每行 6 个，保持单列）
    const LOWER_COLS = { home: ['defense', 'other'], night: null };

    // 守卫行**注定很空**（只有守卫1/2/3 三个图标，见 overview-detail.js 的 GUARDIANS）→ 按用户
    // 2026-09-19 口径，守卫之后隔约 3 个图标位接我们的标识：App 图标 + 名称图。
    // 夜世界没有守卫分节 → 改成页面顶部单独一行居中（`WORLDS.night.topBrand`，见 brandRow）。
    // 尺寸与间距一律在 `css/overview.css` 的 `.ovs-brand` 段（含"为什么是 112px"的换算），JS 只建节点。
    const BRAND = { icon: 'img/brand/coctool.png', name: 'img/brand/blxgj.png' };
    function brandNode() {
        const box = document.createElement('div');
        box.className = 'ovs-brand';
        box.setAttribute('aria-hidden', 'true');        // 纯装饰（品牌标识），读屏不必念
        [['ovs-brand-icon', BRAND.icon], ['ovs-brand-name', BRAND.name]].forEach(function (p) {
            const img = document.createElement('img');
            img.className = p[0];
            img.src = p[1];
            img.alt = '';
            box.appendChild(img);
        });
        return box;
    }
    // 页面级品牌行（`topBrand` 的世界用）：整行铺满、品牌块居中（不占行宽上限，只参与页面纵向排布）
    function brandRow() {
        const row = document.createElement('div');
        row.className = 'ovs-brand-row';
        row.appendChild(brandNode());
        return row;
    }

    let shell = null;   // 预览壳（懒建）
    let stage = null;   // 承载分享页的缩放舞台

    function detailContainer(world) {
        return document.getElementById(world === 'home' ? 'ov-detail-home' : 'ov-detail-night');
    }

    // 当前所在世界（详情页 tab 的 active 态）
    function currentWorld() {
        const home = document.getElementById('ov-tab-home');
        return (home && home.classList.contains('active')) ? 'home' : 'night';
    }

    // 出图不留**控件**（它们只在 App 里可点，画进图里没意义还占位）：
    // `[onclick]` 一律摘掉；`.ov-bar-tip`（英雄卡右上角那个"精工装备提示"）与 `.ov-mode-btn`（满防/当前大本）直接删节点
    const DROP_IN_CLONE = '.ov-bar-tip, .ov-mode-btn';
    function cloneBlock(root, sec) {
        const src = sec === 'bars'
            ? root.querySelector('.ov-bar-col')
            : sec === 'body'
                ? root.querySelector('.ov-body')          // 名称 + 大本图标 + 进度条（详情页顶部那一块）
                : root.querySelector('[data-ov-sec="' + sec + '"]');
        if (!src) return null;
        const node = src.cloneNode(true);
        node.querySelectorAll('[onclick]').forEach(function (n) { n.removeAttribute('onclick'); });
        node.querySelectorAll(DROP_IN_CLONE).forEach(function (n) { n.remove(); });
        return node;
    }

    // 详情页一个展区体（.ov-cat-body）按 `.ov-sub-label` 切成若干"分节"：{ label, rows }
    function subsectionsOf(body) {
        const subs = [];
        let cur = { label: null, rows: [] };
        Array.prototype.forEach.call(body.children, function (node) {
            if (node.classList.contains('ov-sub-label')) {
                subs.push(cur);
                cur = { label: node, rows: [] };
            } else if (node.matches('.ov-icon-row, .ov-icon-grid, .ov-hero-row')) {
                cur.rows.push(node);
            }
        });
        subs.push(cur);
        return subs;
    }

    // 把 rows[1..] 的图标搬进 rows[0]（保持顺序），空行删掉
    function mergeRowsInto(rows) {
        const target = rows[0];
        rows.slice(1).forEach(function (r) {
            if (!r || r === target) return;
            Array.prototype.slice.call(r.children).forEach(function (c) { target.appendChild(c); });
            r.remove();
        });
        return target;
    }

    // 按 id 分组铺行（用户口径就是按建筑给的）：把该分节内属于这些 id 的图标按**口径顺序**收集成若干行。
    // 这样能表达"跨详情页行"的组合（如「空气炮+炸弹塔+投石炮 | 法术塔单飞」——法术塔原本和前三者在同一行），
    // 也不受详情页行序变化影响。**没被提到的图标**收集成尾行并出声（详情页可能加了建筑）。
    function rowsByIdGroup(sub, rule, name) {
        const all = [];
        sub.rows.forEach(function (r) {
            Array.prototype.forEach.call(r.querySelectorAll('.ov-icon-wrap'), function (w) { all.push(w); });
        });
        const byId = {};
        all.forEach(function (w) { const id = w.getAttribute('data-id'); (byId[id] = byId[id] || []).push(w); });
        const used = {};
        const rows = rule.groups.map(function (ids) {
            const row = document.createElement('div');
            row.className = 'ov-icon-row ov-icon-count-row';   // 与详情页的行容器同款（拿同一套 flex-wrap / 间距）
            ids.forEach(function (id) {
                (byId[id] || []).forEach(function (w) { used[id] = true; row.appendChild(w); });
            });
            return row;
        });
        const rest = all.filter(function (w) { return !used[w.getAttribute('data-id')]; });
        if (rest.length) {
            console.warn('[overview-share] 「' + name + '」有 ' + rest.length +
                ' 个图标不在合并口径里（详情页可能新增了建筑）——已单独成行，请核对 ROW_SPEC');
            const row = document.createElement('div');
            row.className = 'ov-icon-row ov-icon-count-row';
            rest.forEach(function (w) { row.appendChild(w); });
            rows.push(row);
        }
        sub.rows.forEach(function (r) { if (!rows.includes(r)) r.remove(); });   // 旧行容器已空（图标被搬走）
        return rows;
    }

    // 按 ROW_SPEC 重排一个展区体（分享页专用；详情页的 DOM 是克隆件，改它不影响原页）
    function applyRowSpec(body, spec) {
        const subs = subsectionsOf(body);
        const out = [];
        for (let i = 0; i < subs.length; i++) {
            const sub = subs[i];
            const name = sub.label ? sub.label.textContent.trim() : '';
            const rule = spec[name] || null;
            let rows = sub.rows.slice();
            let label = sub.label;
            if (rule && rule.joinNext && subs[i + 1]) {
                const next = subs[i + 1];
                rows = rows.concat(next.rows);
                if (next.label) next.label.remove();
                if (label && rule.label) label.textContent = rule.label;
                i++;                                        // 被并进来的那一节不再单独输出
            }
            if (rule && rule.joinOne) {
                if (rows.length) rows = [mergeRowsInto(rows)];
            } else if (rule && rule.groups) {
                rows = rowsByIdGroup({ rows: rows }, rule, name);
            }
            // 品牌标识挂在**并成之后的那一行**末尾，跟守卫图标同一行（宽度已在 CSS 里按列宽算过，不会换行）
            if (rule && rule.brand && rows.length) rows[0].appendChild(brandNode());
            out.push({ label: label, rows: rows });
        }
        const frag = document.createDocumentFragment();
        out.forEach(function (sec) {
            if (sec.label) frag.appendChild(sec.label);
            // 注意：**不能**用 `if (r.parentNode)` 过滤 —— 按 id 分组新建的行是游离节点，
            // 那个判断会把它们整批丢掉（实测：分享页图标数 231 → 147，防御建筑那节直接变空）
            sec.rows.forEach(function (r) { frag.appendChild(r); });
        });
        // 扫尾：没被识别的残余子节点（既非标签也非行）原样带走，别丢内容；空行不带走
        Array.prototype.slice.call(body.children).forEach(function (n) {
            if (n.querySelector && n.querySelector('.ov-icon-wrap')) frag.appendChild(n);
        });
        body.innerHTML = '';
        body.appendChild(frag);
    }

    // 组装分享页（返回游离节点，由调用方决定挂到哪）
    function buildPage(world) {
        const cfg = WORLDS[world];
        const root = detailContainer(world);
        if (!cfg || !root) return null;
        const page = document.createElement('div');
        page.className = 'ovs-page ovs-' + world;
        page.style.width = cfg.width + 'px';
        const top = cloneBlock(root, 'body');               // 名称 + 大本图标 + 进度条（控件在 cloneBlock 里已摘）
        const blocks = {};
        cfg.secs.forEach(function (s) {
            const node = cloneBlock(root, s);
            const spec = (ROW_SPEC[world] || {})[s];
            if (node && spec) {
                const body = node.querySelector('.ov-cat-body');
                if (body) applyRowSpec(body, spec);
            }
            blocks[s] = node;
        });
        function add(parent, node) { if (node) parent.appendChild(node); }
        // 页面级品牌行（夜世界）：**排在最前面**（页面顶部）、整行居中。主世界没配 topBrand（标识挂在守卫行里）→ 恒 null
        const brandTop = cfg.topBrand ? brandRow() : null;
        add(page, brandTop);
        if (cfg.twoCol) {
            const upper = document.createElement('div');
            upper.className = 'ovs-upper';
            const left = document.createElement('div');
            left.className = 'ovs-col';
            add(left, top);
            UPPER_LEFT.forEach(function (s) { add(left, blocks[s]); });
            const right = document.createElement('div');
            right.className = 'ovs-col';
            UPPER_RIGHT.forEach(function (s) { add(right, blocks[s]); });
            upper.appendChild(left);
            upper.appendChild(right);
            page.appendChild(upper);
            const lower = document.createElement('div');
            lower.className = 'ovs-lower';
            const cols = LOWER_COLS[world] || LOWER;
            cols.forEach(function (s) {
                if (!blocks[s]) return;
                const col = document.createElement('div');
                col.className = 'ovs-lower-col ovs-lower-' + s;      // 列宽比例在 CSS（防御更宽）
                col.appendChild(blocks[s]);
                lower.appendChild(col);
            });
            page.appendChild(lower);
        } else {
            add(page, top);
            cfg.secs.forEach(function (s) { add(page, blocks[s]); });
        }
        return page;
    }

    function ensureShell() {
        if (shell) return shell;
        shell = document.createElement('div');
        // 复用 `.modal-overlay` + `.hidden`：Android 返回键（CocTool.handleBack 先关 `.modal-overlay:not(.hidden)`）天然可关
        shell.id = 'ov-share-preview';
        shell.className = 'modal-overlay hidden ovs-shell';
        shell.innerHTML =
            '<div class="ovs-shell-panel">' +
                '<div class="ovs-shell-bar">' +
                    '<span class="ovs-shell-title">分享图预览</span>' +
                    '<button type="button" class="ovs-shell-close">关闭</button>' +
                '</div>' +
                '<div class="ovs-shell-body"><div class="ovs-stage-wrap"><div class="ovs-stage"></div></div></div>' +
            '</div>';
        document.body.appendChild(shell);
        shell.querySelector('.ovs-shell-close').addEventListener('click', function () { closePreview(); });
        stage = shell.querySelector('.ovs-stage');
        return shell;
    }

    // 等比缩放到"能看全宽度"：只作用于预览（出图取未缩放的实例，见文件头阶段 B 说明）
    function fitStage(page) {
        const body = shell.querySelector('.ovs-shell-body');
        const wrap = shell.querySelector('.ovs-stage-wrap');
        stage.style.transform = 'none';
        const w = page.getBoundingClientRect().width;
        const h = page.getBoundingClientRect().height;
        const avail = Math.max(120, body.clientWidth - 16);
        const s = Math.min(1, avail / w);
        stage.style.transform = 'scale(' + s + ')';
        stage.style.transformOrigin = 'top left';
        wrap.style.width = (w * s).toFixed(1) + 'px';
        wrap.style.height = (h * s).toFixed(1) + 'px';
    }

    function onResize() {
        const page = stage && stage.firstChild;
        if (page) fitStage(page);
    }

    function openPreview(world) {
        const w = (world === 'home' || world === 'night') ? world : currentWorld();
        const page = buildPage(w);
        if (!page) {
            if (CocTool.ui && CocTool.ui.showToast) CocTool.ui.showToast('请先打开账号详情页');
            return false;
        }
        ensureShell();
        stage.innerHTML = '';
        stage.appendChild(page);
        shell.classList.remove('hidden');
        fitStage(page);
        window.removeEventListener('resize', onResize);
        window.addEventListener('resize', onResize);
        return true;
    }

    function closePreview() {
        if (!shell) return;
        shell.classList.add('hidden');
        stage.innerHTML = '';
        window.removeEventListener('resize', onResize);
    }

    /* ===== 出图（PNG）=====
       做法：**不手绘画布**，而是把固定布局页原样塞进 `<svg><foreignObject>` 再光栅化 —— 卡片渐变/圆角/
       阴影/等级徽标/排版全由同一引擎渲染，跟页面像素级一致（手绘等于把 CSS 再写一遍，几百行且必漂）。
       三条踩过的坑：
         ① SVG-as-image 模式下**外部资源一律不加载** → 所有 `<img>` 必须先换成 data: URL（否则图是空白框）；
         ② 真机跑在 `file:///android_asset/`，而 `setAllowFileAccessFromFileURLs` 只在 API<30 打开
            （`MainActivity`）→ fetch/XHR 读不到本地图，**必须走 `AndroidApp.readAssetBase64` 桥**；
            网页版 http 同源 fetch 即可（所以网页版不需要桥）。
         ③ `<style>` 里的 `&` / `<` 会让 XML 解析失败（实测直接 EncodingError、出图全透明）→ 用 CDATA 包。
       尺寸：固定布局页的 `offsetWidth/offsetHeight` 就是成品尺寸，乘 `SHARE_SCALE` 出 2× 图。 */
    const SHEETS = ['css/tokens.css', 'css/icons.css', 'css/app.css', 'css/overview.css'];
    const SHARE_SCALE = 2;

    function readAssetText(rel) {
        if (global.AndroidApp && global.AndroidApp.readAsset) {
            const text = global.AndroidApp.readAsset(rel);
            return (typeof text === 'string' && text.length) ? text.replace(/^\uFEFF/, '') : null;
        }
        return null;
    }

    function blobToDataUrl(blob) {
        return new Promise(function (resolve) {
            if (!blob) { resolve(null); return; }
            const reader = new FileReader();
            reader.onload = function () { resolve(reader.result); };
            reader.onerror = function () { resolve(null); };
            reader.readAsDataURL(blob);
        });
    }

    // 素材路径 → data: URL（带缓存：一张图会反复用到同一个图标）。读不到就返回 null，由调用方出声
    const assetCache = {};
    function assetDataUrl(src) {
        if (Object.prototype.hasOwnProperty.call(assetCache, src)) return Promise.resolve(assetCache[src]);
        const done = function (v) { assetCache[src] = v; return v; };
        // ① 真机：Java 桥（file:// 下唯一能读到字节的路子）
        if (CocTool.platform && CocTool.platform.has('readAssetBase64')) {
            const d = CocTool.platform.call('readAssetBase64', src);
            if (typeof d === 'string' && d.indexOf('data:') === 0) return Promise.resolve(done(d));
        }
        // ② 网页版：http 同源 fetch
        if (global.location && global.location.protocol !== 'file:' && typeof fetch === 'function') {
            return fetch(src).then(function (res) { return res.ok ? res.blob() : null; })
                .then(blobToDataUrl).then(done).catch(function () { return done(null); });
        }
        // ③ 老版本 App（API<30 开了本地文件访问）→ XHR 兜底；API≥30 必然失败
        return new Promise(function (resolve) {
            try {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', src, true);
                xhr.responseType = 'blob';
                xhr.onload = function () {
                    if (xhr.status === 200 || xhr.status === 0) { blobToDataUrl(xhr.response).then(done); }
                    else { resolve(done(null)); }
                };
                xhr.onerror = function () { resolve(done(null)); };
                xhr.send();
            } catch (e) { resolve(done(null)); }
        });
    }

    // 出图用的 CSS = 文档里注入的 `<style>`（tailwind preflight 就是脚本注入的）+ 链接的 css 文件
    function collectCss() {
        let css = Array.prototype.map.call(document.querySelectorAll('style'), function (s) { return s.textContent; }).join('\n');
        return SHEETS.reduce(function (p, rel) {
            return p.then(function (acc) {
                const local = readAssetText(rel);
                if (local !== null) return acc + '\n' + local;
                if (typeof fetch !== 'function') return acc;
                return fetch(rel).then(function (r) { return r.ok ? r.text() : ''; })
                    .then(function (t) { return acc + '\n' + t; }).catch(function () { return acc; });
            });
        }, Promise.resolve(css));
    }

    // 离屏造一张固定布局页（要有布局才量得到尺寸/等得到图片解码）
    function buildOffscreen(world) {
        const off = document.createElement('div');
        off.style.cssText = 'position:fixed;left:-99999px;top:0;';
        document.body.appendChild(off);
        const node = buildPage(world);
        if (!node) { off.remove(); return Promise.resolve(null); }
        off.appendChild(node);
        return new Promise(function (resolve) {
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    const imgs = Array.prototype.slice.call(node.querySelectorAll('img'));
                    Promise.all(imgs.map(function (i) {
                        return i.decode ? i.decode().catch(function () {}) : Promise.resolve();
                    })).then(function () { resolve({ node: node, off: off, imgs: imgs }); });
                });
            });
        });
    }

    function loadImage(src) {
        return new Promise(function (resolve, reject) {
            const img = new Image();
            img.onload = function () { resolve(img); };
            img.onerror = function () { reject(new Error('图片解码失败')); };
            img.src = src;
        });
    }

    // 光栅化：克隆 → 图换 data: → 序列化进 SVG → Image → canvas → PNG
    function rasterize(node, imgs) {
        const clone = node.cloneNode(true);
        const cloneImgs = Array.prototype.slice.call(clone.querySelectorAll('img'));
        let missing = 0;
        return Promise.all(cloneImgs.map(function (img, i) {
            const src = imgs[i] && imgs[i].getAttribute('src');
            if (!src) return Promise.resolve();
            return assetDataUrl(src).then(function (data) {
                if (data) { img.setAttribute('src', data); } else { missing++; }
            });
        })).then(function () {
            if (missing && global.location && global.location.protocol === 'file:') {
                throw new Error('图标读取失败，请更新 App 后再用分享图');
            }
            const w = node.offsetWidth, h = node.offsetHeight;
            return collectCss().then(function (css) {
                const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">'
                    + '<style><![CDATA[' + css.split(']]>').join(']] >') + ']]></style>'
                    + '<foreignObject x="0" y="0" width="' + w + '" height="' + h + '">'
                    + new XMLSerializer().serializeToString(clone)
                    + '</foreignObject></svg>';
                return loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
            }).then(function (img) {
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(w * SHARE_SCALE);
                canvas.height = Math.round(h * SHARE_SCALE);
                const ctx = canvas.getContext('2d');
                const bg = getComputedStyle(node).backgroundColor;
                ctx.fillStyle = (bg && bg !== 'rgba(0, 0, 0, 0)') ? bg : '#ffffff';   // 先铺底色：PNG 透明区在某些看图器里是黑的
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                return canvas.toDataURL('image/png');
            });
        });
    }

    // 分享键的动作：出图 → 交共用分享弹窗（war-stats 那套：保存到相册 / 分享 / 取消）
    function openShareImage(world) {
        const w = (world === 'home' || world === 'night') ? world : currentWorld();
        if (!WORLDS[w] || !detailContainer(w)) {
            if (CocTool.ui && CocTool.ui.showToast) CocTool.ui.showToast('请先打开账号详情页');
            return Promise.resolve(false);
        }
        if (CocTool.ui && CocTool.ui.showToast) CocTool.ui.showToast('正在生成分享图…');
        return buildOffscreen(w).then(function (built) {
            if (!built) return false;
            return rasterize(built.node, built.imgs).then(function (dataUrl) {
                built.off.remove();
                const sheet = CocTool.features.warStats && CocTool.features.warStats.imageShare;
                if (!sheet) {
                    if (CocTool.ui && CocTool.ui.showToast) CocTool.ui.showToast('分享组件未加载');
                    return false;
                }
                return sheet(dataUrl, { title: '账号进度分享图', filename: 'coc_progress_' + w + '.png' });
            }).catch(function (e) {
                built.off.remove();
                console.warn('[overview-share] 出图失败', e);
                if (CocTool.ui && CocTool.ui.showToast) CocTool.ui.showToast('图片生成失败：' + (e && e.message ? e.message : e));
                return false;
            });
        });
    }

    CocTool.features.share = Object.freeze({
        open: openShareImage,        // 分享键的动作（在「等级/时间」那一行，见 overview-detail.js）
        preview: openPreview,        // 布局预览（开发/探针用）
        close: closePreview,
        buildPage: buildPage,
        currentWorld: currentWorld,
        worlds: WORLDS
    });
})(window);
