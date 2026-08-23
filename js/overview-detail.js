(function (global) {
    'use strict';
    var CocTool = global.CocTool = global.CocTool || {};
    CocTool.features = CocTool.features || {};

    var state = CocTool.state;
    var names = CocTool.names;
    var el = CocTool.overviewList.el;
    var currentDetailTag = null;
    var currentTab = 'home';
    var showTimeMode = false;
    var currentProgress = null;

    var HOME_HEROES = ['28000000','28000001','28000002','28000004','28000006','28000007'];
    var PETS = ['73000000','73000002','73000001','73000003','73000009','73000008','73000007','73000004','73000010','73000011','73000016','73000017'];
    // 兵种/法术：二维数组 = 详情页两行布局（每行一个网格），顺序按用户规定（游戏内兵营/实验室顺序）
    var LAB_TROOPS = [
        ['4000000','4000001','4000002','4000003','4000004','4000005','4000006','4000007','4000008','4000009','4000023','4000024','4000059','4000053','4000065','4000095','4000110','4000132','4000177'],
        ['4000010','4000011','4000012','4000013','4000015','4000017','4000022','4000058','4000082','4000097','4000123','4000150','4000109']
    ];
    var LAB_SPELLS = [
        ['26000000','26000001','26000002','26000003','26000005','26000016','26000035','26000053','26000098','26000120'],
        ['26000009','26000010','26000011','26000017','26000028','26000070','26000109','26000123']
    ];
    var LAB_SIEGE = ['4000051','4000052','4000062','4000075','4000087','4000091','4000092','4000135','4000188'];
    var BB_HEROES = ['28000003','28000005'];
    var BB_TROOPS = ['4000031','4000032','4000033','4000034','4000035','4000036','4000037','4000038','4000041','4000042','4000070','4000106'];
    var EQ_MAP = {
        '28000000': ['90000051','90000032','90000014','90000010','90000011','90000008','90000001','90000000'],
        '28000001': ['90000016','90000048','90000039','90000015','90000020','90000017','90000003','90000002'],
        '28000002': ['90000019','90000041','90000022','90000034','90000024','90000005','90000004'],
        '28000004': ['90000050','90000040','90000013','90000012','90000009','90000006','90000007'],
        '28000006': ['90000049','90000035','90000047','90000044','90000043','90000042'],
        '28000007': ['90000060','90000053','90000059','90000056','90000057','90000052']
    };
    var EPIC_EQ = ['90000051','90000032','90000014','90000010','90000016','90000048','90000039','90000015','90000019','90000041','90000022','90000050','90000040','90000013','90000049','90000035','90000053','90000060'];

    // ===== 防御/其他/墙 分组（先按 ID 序，待用户确认后调整） =====
    var DEFENSE_BUILDINGS = ['1000008','1000009','1000011','1000012','1000013','1000015','1000019','1000021','1000027','1000028','1000031','1000032','1000067','1000072','1000077','1000079','1000084','1000085','1000086','1000089','1000097','1000102','103000011','103000012','103000013','152000011','152000012','152000013'];
    // 防御进度计入的建筑（精制台及精工形态 1000097/103000011-13 不计入）
    var DEFENSE_PROGRESS_IDS = ['1000008','1000009','1000011','1000012','1000013','1000015','1000019','1000021','1000027','1000028','1000031','1000032','1000067','1000072','1000077','1000079','1000084','1000085','1000086','1000089','1000102'];
    // 建筑最大可建造数量（availablePerTownHall 最大 count，前端硬编码；精工建筑按 1 处理）
    var BUILDING_CAPS = { '1000008': 7, '1000009': 9, '1000011': 6, '1000012': 4, '1000013': 4, '1000015': 5, '1000019': 5, '1000021': 4, '1000027': 3, '1000028': 2, '1000031': 1, '1000032': 2, '1000067': 2, '1000072': 2, '1000077': 1, '1000079': 1, '1000084': 3, '1000085': 3, '1000086': 1, '1000089': 2, '1000097': 1, '1000102': 2, '1000000': 4, '1000001': 1, '1000002': 7, '1000003': 4, '1000004': 7, '1000005': 4, '1000006': 1, '1000007': 1, '1000014': 1, '1000020': 1, '1000023': 3, '1000024': 1, '1000026': 1, '1000029': 1, '1000059': 1, '1000064': 1, '1000068': 1, '1000070': 1, '1000071': 1, '1000093': 1, '93000000': 1, '93000001': 1, '93000002': 1 };
    // 夜世界建筑最大可建造数量（availablePerBuilderHall 最大 count）
    var BB_BUILDING_CAPS = { '1000041': 3, '1000043': 3, '1000044': 3, '1000045': 1, '1000048': 3, '1000050': 5, '1000051': 1, '1000052': 1, '1000054': 1, '1000055': 2, '1000056': 1, '1000057': 1, '1000063': 1, '1000078': 1, '1000081': 1, '1000035': 3, '1000036': 2, '1000037': 3, '1000038': 2, '1000058': 1, '1000065': 1, '1000040': 1, '1000042': 6, '1000046': 1, '1000049': 2, '1000053': 1, '1000080': 1, '1000082': 1, '1000034': 1, '1000039': 1, '1000047': 1 };
    // 合成折算：加农炮（弹箭×2+复合×1）、箭塔（多人×2+复合×1）、法师塔（超级法师塔×2）；合成建筑每座扣减对应名额（至少留 1 个图鉴入口）
    var MERGE = {
        '1000008': { add: [['1000085', 2], ['1000079', 1]], reduce: [['1000085', 2], ['1000079', 1]] },
        '1000009': { add: [['1000084', 2], ['1000079', 1]], reduce: [['1000084', 2], ['1000079', 1]] },
        '1000011': { add: [['1000102', 2]], reduce: [['1000102', 2]] }
    };
    var TRAPS = ['12000000','12000001','12000002','12000005','12000006','12000008','12000016','12000020'];
    var GUARDIANS = ['107000000','107000001','107000008'];
    // 资源建筑（用户顺序：大本/城堡/黑油罐/黑油井/圣水采集器/圣水瓶/金矿/储金罐）
    var RESOURCE_BUILDINGS = ['1000001','1000014','1000024','1000023','1000002','1000003','1000004','1000005'];
    // 军队建筑（用户顺序：兵营/训练营/暗黑训练营/法术工厂/暗黑法术工厂/工坊/实验室/战宠小屋/铁匠铺/英雄殿堂）
    var ARMY_BUILDINGS = ['1000000','1000006','1000026','1000020','1000029','1000059','1000007','1000068','1000070','1000071'];
    // 其他建筑（小博木屋/帮手小屋；三个助手暂不显示）
    var OTHER_BUILDINGS = ['1000064','1000093'];
    var WALL_IDS = ['1000010'];
    // 夜世界
    // 防御（用户顺序：双管加农炮+特斯拉电磁塔 / 加农炮(夜)+箭塔(夜) / 防空火箭+撼地巨石 合并行，其余单独行/网格）
    var BB_DEFENSES = ['1000041','1000043','1000044','1000048','1000050','1000055','1000045','1000051','1000052','1000054','1000056','1000057','1000063','1000078','1000081'];
    var BB_DEFENSE_MERGED_ROWS = [
        ['1000041', '1000043'],
        ['1000044', '1000048'],
        ['1000050', '1000055']
    ];
    var BB_TRAPS = ['12000010','12000011','12000013','12000014'];
    // 资源（用户顺序：大本 / 圣水采集器+圣水瓶 / 金矿+储金罐）
    var BB_RESOURCES = ['1000034','1000035','1000036','1000037','1000038'];
    // 军队（用户顺序：兵营 / 预备营+训练营+星空实验室+治疗小屋；两个重建不显示）
    var BB_ARMY = ['1000042','1000049','1000040','1000046','1000082'];
    // 其他（宝石矿井+时光钟楼+小博控制室+博仔棚屋 合并行；博仔棚屋 1000047 无图鉴源数据，图标用裸图回退）
    var BB_OTHER = ['1000058','1000039','1000065','1000047'];
    var BB_WALL_IDS = ['1000033'];

    // 合成折算表：合成建筑每座进度 = Σ(消耗的基础建筑满级) + 自身当前进度（只加分子，分母固定）
    var MERGE_WEIGHT = {
        '1000085': [['1000008', 2]],
        '1000084': [['1000009', 2]],
        '1000102': [['1000011', 2]],
        '1000079': [['1000008', 1], ['1000009', 1]]
    };
    // 陷阱最大可建造数量（availablePerTownHall 最大 count）
    var TRAP_CAPS = { '12000000': 8, '12000001': 9, '12000002': 8, '12000005': 8, '12000006': 9, '12000008': 4, '12000016': 1, '12000020': 1 };
    // 夜世界陷阱最大可建造数量（availablePerBuilderHall 最大 count）
    var BB_TRAP_CAPS = { '12000010': 6, '12000011': 5, '12000013': 6, '12000014': 4 };
    // 弹窗子分组配置：progress 键 → 标题 + 子组列表（名称 + ID 数组 + meta 键 + cap 表）
    // groups 为 null 时弹窗显示该分类全部实体明细
    var BAR_GROUPS = {
        heroes: { title: '英雄', meta: 'heroes', groups: null },
        equip: { title: '装备', meta: 'hero-equipment', groups: null },
        pets: { title: '战宠', meta: 'pets', groups: null },
        lab: { title: '科技', meta: '', groups: [
            ['圣水兵', LAB_TROOPS[0], 'units'],
            ['黑油兵', LAB_TROOPS[1], 'units'],
            ['圣水法术', LAB_SPELLS[0], 'spells'],
            ['黑油法术', LAB_SPELLS[1], 'spells'],
            ['攻城机器', LAB_SIEGE, 'siege_machines']
        ]},
        defense: { title: '防御', meta: 'defense', groups: [
            ['守卫', GUARDIANS, 'guardians', null],
            ['防御建筑', DEFENSE_PROGRESS_IDS, 'defense', BUILDING_CAPS],
            ['陷阱', TRAPS, 'defense', TRAP_CAPS]
        ]},
        other: { title: '其他', meta: 'buildings', groups: [
            ['资源建筑', RESOURCE_BUILDINGS, 'buildings', BUILDING_CAPS],
            ['军队建筑', ARMY_BUILDINGS, 'buildings', BUILDING_CAPS],
            ['其他', OTHER_BUILDINGS, 'buildings', BUILDING_CAPS]
        ]},
        // 夜世界进度明细
        bHero: { title: '夜英雄', meta: 'heroes2', groups: null },
        bTroop: { title: '夜兵种', meta: 'units2', groups: null },
        bDefense: { title: '夜防御', meta: 'defenses2', groups: [
            ['防御建筑', BB_DEFENSES, 'defenses2', BB_BUILDING_CAPS],
            ['陷阱', BB_TRAPS, 'traps2', BB_TRAP_CAPS]
        ]},
        bOther: { title: '夜其他', meta: 'resources2', groups: [
            ['资源建筑', BB_RESOURCES, 'resources2', BB_BUILDING_CAPS],
            ['军队建筑', BB_ARMY, 'army2', BB_BUILDING_CAPS],
            ['其他', BB_OTHER, 'other2', BB_BUILDING_CAPS]
        ]}
    };

    function getHomeHeroes() { return HOME_HEROES; }
    function getPets() { return PETS; }
    function getLabItems() { return { troops: LAB_TROOPS, spells: LAB_SPELLS, siege: LAB_SIEGE }; }
    function getBBItems() { return { heroes: BB_HEROES, troops: BB_TROOPS }; }
    function loadEqHeroMap() { return EQ_MAP; }


    function escapeHtml(s) {
        return String(s).replace(/[&<>]/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]; });
    }

    function initDetail() {
        el.detailPage = document.getElementById('overview-detail-page');
        el.detailBack = document.getElementById('ov-detail-back');
        el.detailTitle = document.getElementById('ov-detail-title');
        el.detailScroll = document.getElementById('ov-detail-scroll');
        el.detailHome = document.getElementById('ov-detail-home');
        el.detailNight = document.getElementById('ov-detail-night');
        el.tabHome = document.getElementById('ov-tab-home');
        el.tabNight = document.getElementById('ov-tab-night');
        el.tabIndicator = document.getElementById('ov-tab-indicator');

        if (el.detailBack) el.detailBack.addEventListener('click', goBack);
        if (el.tabHome) el.tabHome.addEventListener('click', function () { switchTab('home'); });
        if (el.tabNight) el.tabNight.addEventListener('click', function () { switchTab('night'); });

        if (el.detailScroll) {
            // 等级/时间切换（事件委托：renderHomeDetail/renderNightDetail 重建 innerHTML 后事件不丢失）
            el.detailScroll.addEventListener('click', function (e) {
                var seg = e.target.closest ? e.target.closest('.ov-toggle-b .ov-seg') : null;
                if (!seg) return;
                e.stopPropagation();
                var parent = seg.parentNode;
                parent.querySelectorAll('.ov-seg').forEach(function (b) { b.classList.remove('active'); });
                seg.classList.add('active');
                showTimeMode = seg.textContent === '时间';
                refreshBars();
            });
            // 进度条点击 → 进度明细弹窗
            el.detailScroll.addEventListener('click', function (e) {
                var row = e.target.closest ? e.target.closest('.ov-bar-row[data-pg]') : null;
                if (row) {
                    e.stopPropagation();
                    openProgressModal(row.getAttribute('data-pg'));
                }
            });
            // 网格图标点击 → 图鉴详情页
            el.detailScroll.addEventListener('click', function (e) {
                var wrap = e.target.closest ? e.target.closest('.ov-icon-wrap') : null;
                if (!wrap || !wrap.getAttribute('data-id')) return;
                var id = wrap.getAttribute('data-id');
                var level = Number(wrap.getAttribute('data-level')) || 1;
                e.stopPropagation();
                if (CocTool.features.pokedex) {
                    // 传当前详情页账号 tag：图鉴按详情页账号判服（currentAccount 可能仍是其他账号）
                    // 精工形态：模块等级数组（图鉴各 abilities tab 分别定位到模块等级）
                    CocTool.features.pokedex.open(id, level, currentDetailTag, craftModuleLevels(id));
                }
            });
            var startX = 0, startY = 0;
            el.detailScroll.addEventListener('touchstart', function (e) {
                if (e.touches.length === 1) { startX = e.touches[0].clientX; startY = e.touches[0].clientY; }
            }, { passive: true });
            el.detailScroll.addEventListener('touchend', function (e) {
                if (e.changedTouches.length === 1) {
                    var dx = e.changedTouches[0].clientX - startX;
                    var dy = e.changedTouches[0].clientY - startY;
                    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                        if (dx < 0 && currentTab === 'home') switchTab('night');
                        else if (dx > 0 && currentTab === 'night') switchTab('home');
                    }
                }
            }, { passive: true });
        }
    }

    // 精工形态的模块等级数组（与图鉴 abilities 顺序对应）：从精制台 1000097 的 types 提取
    function craftModuleLevels(craftId) {
        if (!currentDetailTag || !state.accounts[currentDetailTag]) return null;
        var b = state.accounts[currentDetailTag].buildings || [];
        for (var i = 0; i < b.length; i++) {
            if (b[i] && b[i].data === 1000097 && b[i].types) {
                for (var t = 0; t < b[i].types.length; t++) {
                    var type = b[i].types[t];
                    if (type && String(type.data) === craftId) {
                        return (type.modules || []).map(function (m) { return m.lvl || 0; });
                    }
                }
            }
        }
        return null;
    }

    function goBack() {
        if (el.detailPage) el.detailPage.style.display = 'none';
        currentDetailTag = null;
    }

    function openDetail(tag) {
        var data = state.accounts[tag];
        if (!data) return;
        currentDetailTag = tag;
        showTimeMode = false;
        var accName = (state.accountNotes && state.accountNotes[tag]) || data.tag || tag;
        if (el.detailTitle) el.detailTitle.textContent = accName;
        if (el.detailPage) el.detailPage.style.display = 'flex';
        currentTab = 'home';
        updateTabUI();
        renderHomeDetail(data, accName);
        renderNightDetail(data, accName);
        if (el.detailScroll) el.detailScroll.scrollTop = 0;
    }

    function switchTab(tab) {
        if (tab === currentTab) return;
        currentTab = tab;
        updateTabUI();
    }

    function updateTabUI() {
        if (el.tabHome) el.tabHome.classList.toggle('active', currentTab === 'home');
        if (el.tabNight) el.tabNight.classList.toggle('active', currentTab === 'night');
        if (el.detailHome) el.detailHome.style.display = currentTab === 'home' ? '' : 'none';
        if (el.detailNight) el.detailNight.style.display = currentTab === 'night' ? '' : 'none';
        if (el.tabIndicator && el.tabHome && el.tabNight) {
            var activeTab = currentTab === 'home' ? el.tabHome : el.tabNight;
            el.tabIndicator.style.width = activeTab.offsetWidth + 'px';
            el.tabIndicator.style.transform = 'translateX(' + activeTab.offsetLeft + 'px)';
        }
    }

    function iconPath(dataId, cat) {
        if (cat === 'hero-equipment') return 'img/icons/equipment/' + (String(dataId).replace(/^106/, '90')) + '.webp';
        if (cat === 'heroes' || cat === 'heroes2') return 'img/icons/heroes/' + dataId + '.webp';
        if (cat === 'pets') return 'img/icons/pets/' + dataId + '.webp';
        if (cat === 'buildings') return 'img/icons/buildings/' + dataId + '.webp';
        if (cat === 'buildings2') return 'img/icons/buildings2/' + dataId + '.webp';
        if (cat === 'units' || cat === 'spells' || cat === 'siege_machines') return 'img/icons/lab/' + dataId + '.webp';
        if (cat === 'units2') return 'img/icons/units2/' + dataId + '.webp';
        return 'img/icons/20260627.webp';
    }

    function imgEl(src, cls, level, maxLv, minLv, dataId, count, litOnly, fbSrc) {
        minLv = minLv || 1;
        var owned = litOnly ? true : (count !== undefined ? count > 0 : level >= minLv);
        // 满级徽章：当前大本模式 = 蓝底（达到大本上限）；满防模式 = 金底（达到全量满级）
        var maxedCls = progressMode === 'th' ? ' ov-th-max' : ' ov-maxed';
        var wrap = document.createElement('div');
        wrap.className = 'ov-icon-wrap' + (owned ? '' : ' ov-locked') + (owned && !litOnly && level === maxLv ? maxedCls : '');
        if (dataId !== undefined) {
            wrap.setAttribute('data-id', dataId);
            wrap.setAttribute('data-level', level || 0);
        }
        var img = document.createElement('img');
        img.src = src;
        if (cls) img.className = cls;
        img.onerror = function () {
            // 带等级图标缺失时回退无等级图标，再失败隐藏
            if (fbSrc && !this.dataset.fb) { this.dataset.fb = '1'; this.src = fbSrc; }
            else { this.style.display = 'none'; }
        };
        wrap.appendChild(img);
        if (owned && !litOnly) {
            if (level) {
                var badge = document.createElement('span');
                badge.className = 'ov-level-badge';
                badge.textContent = level;
                wrap.appendChild(badge);
            }
            if (count !== undefined && count > 1) {
                var cnt = document.createElement('span');
                cnt.className = 'ov-count-badge';
                cnt.textContent = '×' + count;
                wrap.appendChild(cnt);
            }
        }
        return wrap;
    }

    function progressBarHtml(label, iconSrc, p, modeIsTime, pgKey) {
        var pct = modeIsTime && p.time !== null ? p.time : p.level;
        // 满防模式进度 100%：进度条金色
        var fullCls = (pct >= 100 && progressMode === 'full') ? ' ov-bar-full' : '';
        return '<div class="ov-bar-row' + (pgKey ? ' ov-bar-clickable' : '') + '"' + (pgKey ? ' data-pg="' + pgKey + '"' : '') + '>' +
            '<img src="' + iconSrc + '" class="ov-bar-icon" onerror="this.style.display=\'none\'">' +
            '<span class="ov-bar-cat">' + label + '</span>' +
            '<div class="ov-bar-track"><div class="ov-bar-fill' + fullCls + '" style="width:' + pct + '%"></div></div>' +
            '<span class="ov-bar-pct">' + pct.toFixed(2) + '%</span>' +
        '</div>';
    }

    // ===== 进度明细弹窗 =====
    // 子分组进度：等级% = Σ账号等级/Σ满级；时间% = Σ累计时间/Σ总时间（与 calcSingleProgress 口径一致）
    function calcGroupProgress(name, ids, metaKey, uMap, m, mode, thLv) {
        var meta = m[metaKey];
        var curLv = 0, totalLv = 0, curTm = 0, totalTm = 0;
        var isTh = mode === 'th';
        for (var i = 0; i < ids.length; i++) {
            var id = ids[i];
            var maxLv = meta.levels[id] || 0;
            if (isTh) {
                var tMax = thMaxLv(meta, id, thLv);
                if (tMax !== null) maxLv = tMax;
            }
            var uLv = Math.min(uMap[id] || 0, maxLv);
            totalLv += maxLv;
            curLv += maxLv ? uLv : 0;
            if (meta.times && meta.times[id]) {
                var cum = meta.times[id];
                // 分子 = 当前级完成后 cum[uLv+1]、分母 = 满级 cum[maxLv+1]（与座数口径同规约）
                curTm += cum.length ? (cum[uLv + 1 < cum.length ? uLv + 1 : cum.length - 1] || 0) : 0;
                totalTm += maxLv > 0 ? (cum[maxLv + 1 < cum.length ? maxLv + 1 : cum.length - 1] || 0) : 0;
            }
        }
        return {
            name: name,
            level: totalLv > 0 ? Math.min(curLv / totalLv * 100, 100) : 0,
            time: totalTm > 0 ? Math.min(curTm / totalTm * 100, 100) : null,
            curTm: curTm,
            totalTm: totalTm
        };
    }

    // 弹窗分组行（座数口径 + 合成折算）：grp = [名称, ids, meta键, cap表]
    function calcGroupInstances(name, ids, metaKey, lvlList, m, caps, thLv, mode) {
        var meta = m && m[metaKey];
        var r = calcInstances(ids, caps, meta, lvlList, MERGE_WEIGHT, thLv, mode);
        return {
            name: name,
            level: r.totalLv > 0 ? Math.min(r.curLv / r.totalLv * 100, 100) : 0,
            time: r.totalTm > 0 ? Math.min(r.curTm / r.totalTm * 100, 100) : null,
            curTm: r.curTm,
            totalTm: r.totalTm
        };
    }

    function buildGroupRows(cfg, uMap, lvlList, m, server, thLv, mode) {
        var rows = [];
        if (cfg.groups) {
            for (var g = 0; g < cfg.groups.length; g++) {
                var grp = cfg.groups[g];
                // 3 项（无 caps）= 每 id 一座实体（科技 units/spells/siege_machines，等级在 uMap，lvlList 不含此类）
                // 4 项（有 caps）= 多座建筑（座数口径，等级在 lvlList）
                if (grp.length === 3) {
                    rows.push(calcGroupProgress(grp[0], serverIds(grp[1], server), grp[2], uMap, m, mode, thLv));
                } else {
                    rows.push(calcGroupInstances(grp[0], serverIds(grp[1], server), grp[2], lvlList, m, grp[3], thLv, mode));
                }
            }
            return rows;
        }
        // groups 为 null：显示该分类全部实体明细
        if (cfg.meta === 'heroes') {
            for (var i = 0; i < HOME_HEROES.length; i++) {
                var hid = HOME_HEROES[i];
                rows.push(calcGroupProgress(names.ITEM_NAMES[hid] || hid, [hid], 'heroes', uMap, m, mode, thLv));
            }
        } else if (cfg.meta === 'pets') {
            for (var j = 0; j < PETS.length; j++) {
                var pid = PETS[j];
                rows.push(calcGroupProgress(names.ITEM_NAMES[pid] || pid, [pid], 'pets', uMap, m, mode, thLv));
            }
        } else if (cfg.meta === 'hero-equipment') {
            // 装备按英雄分组明细（国服装备 ID = 106 开头，翻译后再查 uMap/meta）
            for (var hk in EQ_MAP) {
                var eqIds = EQ_MAP[hk];
                if (server === 'cn') eqIds = eqIds.map(function (id) { return '106' + id.slice(2); });
                rows.push(calcGroupProgress(names.ITEM_NAMES[hk] || hk, eqIds, 'hero-equipment', uMap, m, mode, thLv));
            }
        } else if (cfg.meta === 'heroes2') {
            for (var h2 = 0; h2 < BB_HEROES.length; h2++) {
                rows.push(calcGroupProgress(names.ITEM_NAMES[BB_HEROES[h2]] || BB_HEROES[h2], [BB_HEROES[h2]], 'heroes2', uMap, m, mode, thLv));
            }
        } else if (cfg.meta === 'units2') {
            for (var u2 = 0; u2 < BB_TROOPS.length; u2++) {
                rows.push(calcGroupProgress(names.ITEM_NAMES[BB_TROOPS[u2]] || BB_TROOPS[u2], [BB_TROOPS[u2]], 'units2', uMap, m, mode, thLv));
            }
        }
        return rows;
    }

    function openProgressModal(pgKey) {
        var cfg = BAR_GROUPS[pgKey];
        if (!cfg || !currentDetailTag) return;
        var data = state.accounts[currentDetailTag];
        if (!data) return;
        var m = data._server === 'cn' ? global.PROGRESS_META_CN : global.PROGRESS_META_INTL;
        var uMap = buildUserLevelMap(data);
        var lvlList = buildUserLevelListMap(data);
        var thLv = CocTool.overviewList.findThLevel(data);
        var rows = buildGroupRows(cfg, uMap, lvlList, m, data._server, thLv, progressMode);
        if (!rows.length) return;
        var titleEl = document.getElementById('ov-progress-modal-title');
        var bodyEl = document.getElementById('ov-progress-modal-body');
        if (titleEl) titleEl.textContent = cfg.title + ' · ' + (showTimeMode ? '时间' : '等级') + '进度明细';
        // 弹窗顶部汇总：工人类（英雄/防御/其他，含夜世界）5 项（含工人数/预估）；科技/战宠 3 项（总时间/已完成/剩余）
        var infoHtml = '';
        var isWorkerCat = pgKey === 'heroes' || pgKey === 'defense' || pgKey === 'other' ||
            pgKey === 'bHero' || pgKey === 'bDefense' || pgKey === 'bOther';
        var is3ItemCat = pgKey === 'lab' || pgKey === 'pets' || pgKey === 'bTroop';
        if (isWorkerCat || is3ItemCat) {
            var pp = currentProgress && currentProgress[pgKey];
            if (pp && pp.time !== null) {
                function pgCell(k, v) {
                    return '<div class="ov-pg-cell"><span class="k">' + k + '</span><span class="v">' + v + '</span></div>';
                }
                var sum = pgCell('总时间', formatRemainTime(pp.totalTm, 0)) +
                    pgCell('已完成', formatRemainTime(pp.curTm, 0)) +
                    pgCell('剩余', formatRemainTime(pp.totalTm, pp.curTm));
                if (isWorkerCat) {
                    var workers = 0;
                    try { workers = (CocTool.calc.getCategoryDenominators(data)[pgKey.charAt(0) === 'b' ? 'buildings2' : 'buildings']) || 0; } catch (e) {}
                    sum += pgCell('工人数量', workers) +
                        pgCell('预估剩余时间', formatRemainTime(pp.totalTm, pp.curTm, workers));
                }
                infoHtml = '<div class="ov-pg-summary">' + sum + '</div>';
            }
        }
        var html = infoHtml;
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            // 等级/时间两种模式的弹窗分开：仅显示当前模式的进度
            var showTime = showTimeMode && r.time !== null;
            var pct = showTime ? r.time : r.level;
            html += '<div class="ov-pg-row">' +
                '<span class="ov-pg-name">' + escapeHtml(r.name) + '</span>' +
                '<div class="ov-pg-track"><div class="ov-pg-fill" style="width:' + pct + '%"></div></div>' +
                '<span class="ov-pg-pct">' + pct.toFixed(1) + '%</span>' +
                '<span class="ov-pg-remain">' + (r.totalTm ? formatRemainTime(r.totalTm, r.curTm) : '') + '</span>' +
            '</div>';
        }
        if (bodyEl) bodyEl.innerHTML = html;
        var modal = document.getElementById('ov-progress-modal');
        if (modal) {
            modal.classList.remove('hidden');
            bindProgressModalOnce(modal);
        }
    }

    var progressModalBound = false;
    function bindProgressModalOnce(modal) {
        if (progressModalBound) return;
        progressModalBound = true;
        var close = function () { modal.classList.add('hidden'); };
        var closeBtn = document.getElementById('ov-progress-modal-close');
        if (closeBtn) closeBtn.addEventListener('click', close);
        modal.addEventListener('click', function (e) {
            if (e.target === modal) close();
        });
    }

    // 防御建筑合并组合：组合内建筑连续排列在同一行（防空+迫击炮 / X连弩+地狱塔 / 空气炮+炸弹塔+投石炮+法术塔 / 多人+弹跳+复合 / 火焰喷射器+超级法师塔）
    // 加农炮+箭塔+法师塔 单独一组（合成后各自仅剩 1 个图标，合成一行放防御区最前）
    var DEFENSE_MERGED_ROWS = [
        ['1000012', '1000013'],
        ['1000021', '1000027'],
        ['1000028', '1000032', '1000067', '1000072'],
        ['1000084', '1000085', '1000079'],
        ['1000089', '1000102']
    ];
    var DEFENSE_FIRST_ROW = ['1000008', '1000009', '1000011'];

    // 防御建筑行模式：每建筑一行（max count 图标），账号记录点亮 + 合成折算，未点亮灰锁定
    function appendDefenseRow(parent, id, metaObj, uMap, lvlList, countMap, iconCat, caps) {
        var cap = (caps || BUILDING_CAPS)[id] || 1;
        var levels = (lvlList[id] || []).slice().sort(function (a, b) { return b - a; });
        var icons = cap;
        var reduced = false;
        var merge = MERGE[id];
        if (merge) {
            // 合成建筑占用名额后，本建筑可建名额缩减
            for (var r = 0; r < merge.reduce.length; r++) {
                icons -= (countMap[merge.reduce[r][0]] || 0) * merge.reduce[r][1];
            }
            // 合成占用全部名额：保底保留 1 个图鉴入口（满级外观、无等级角标）
            if (icons < 1) { icons = 1; reduced = true; }
        }
        var lit = Math.min(levels.length, icons);
        var base = (iconCat === 'buildings2' ? 'img/icons/buildings2/' : 'img/icons/buildings/') + id + '_';
        var fbSrc = iconPath(id, iconCat);
        var maxLv = mlv(metaObj, id);
        var row = document.createElement('div');
        row.className = 'ov-icon-row ov-icon-count-row';
        // 账号记录（等级降序）
        var filled = 0;
        for (var i = 0; i < levels.length && filled < icons; i++, filled++) {
            if (levels[i] > 0) {
                row.appendChild(imgEl(base + levels[i] + '.webp', 'ov-grid-icon', levels[i], maxLv, 1, id, undefined, false, fbSrc));
            } else {
                // 升级中（0 级）：1 级图片点亮、无等级角标
                row.appendChild(imgEl(base + '1.webp', 'ov-grid-icon', 0, maxLv, 1, id, undefined, true, fbSrc));
            }
        }
        // 剩余名额：未建造空位（灰）；保底（合成占满）显示满级外观
        for (var k = filled; k < icons; k++) {
            if (reduced && k === icons - 1) {
                row.appendChild(imgEl(base + maxLv + '.webp', 'ov-grid-icon', 0, maxLv, 1, id, undefined, true, fbSrc));
            } else {
                row.appendChild(imgEl(base + '1.webp', 'ov-grid-icon', 0, maxLv, 1, id, undefined, false, fbSrc));
            }
        }
        parent.appendChild(row);
    }

    // 合并组合行：组合内各建筑（按顺序）连续排列在一行；有合成折算（MERGE）的建筑按合成后数量显示
    function appendMergedRow(parent, ids, metaObj, uMap, lvlList, iconCat, caps, countMap) {
        var row = document.createElement('div');
        row.className = 'ov-icon-row ov-icon-count-row';
        countMap = countMap || {};
        for (var b = 0; b < ids.length; b++) {
            var id = ids[b];
            var cap = (caps || BUILDING_CAPS)[id] || 1;
            var levels = (lvlList[id] || []).slice().sort(function (a, b) { return b - a; });
            var base = (iconCat === 'buildings2' ? 'img/icons/buildings2/' : 'img/icons/buildings/') + id + '_';
            var fbSrc = iconPath(id, iconCat);
            var maxLv = mlv(metaObj, id);
            var icons = cap;
            var reduced = false;
            var merge = MERGE[id];
            if (merge) {
                // 合成建筑占用名额后，本建筑可建名额缩减
                for (var r = 0; r < merge.reduce.length; r++) {
                    icons -= (countMap[merge.reduce[r][0]] || 0) * merge.reduce[r][1];
                }
                // 合成占用全部名额：保底保留 1 个图鉴入口（满级外观、无等级角标）
                if (icons < 1) { icons = 1; reduced = true; }
            }
            var lit = Math.min(levels.length, icons);
            var filled = 0;
            for (var i = 0; i < levels.length && filled < icons; i++, filled++) {
                if (levels[i] > 0) {
                    row.appendChild(imgEl(base + levels[i] + '.webp', 'ov-grid-icon', levels[i], maxLv, 1, id, undefined, false, fbSrc));
                } else {
                    // 升级中（0 级）：1 级图片点亮、无等级角标
                    row.appendChild(imgEl(base + '1.webp', 'ov-grid-icon', 0, maxLv, 1, id, undefined, true, fbSrc));
                }
            }
            // 剩余名额：未建造空位（灰）；保底（合成占满）显示满级外观
            for (var k = filled; k < icons; k++) {
                if (reduced && k === icons - 1) {
                    row.appendChild(imgEl(base + maxLv + '.webp', 'ov-grid-icon', 0, maxLv, 1, id, undefined, true, fbSrc));
                } else {
                    row.appendChild(imgEl(base + '1.webp', 'ov-grid-icon', 0, maxLv, 1, id, undefined, false, fbSrc));
                }
            }
        }
        parent.appendChild(row);
    }

    // 行模式分组：子标签 + 组内建筑各一行（max count 图标）；mergedRows 指定的组合共用一行
    // 渲染顺序 = ids 数组顺序（组合行的位置由组合内第一个 id 在 ids 中的位置决定）
    function appendRowGroup(parent, title, ids, metaObj, uMap, lvlList, countMap, iconCat, mergedRows, caps) {
        var label = document.createElement('div');
        label.className = 'ov-sub-label';
        label.textContent = title;
        parent.appendChild(label);
        var merged = mergedRows || [];
        var emitted = {};
        for (var i = 0; i < ids.length; i++) {
            var id = ids[i];
            var gIdx = -1;
            for (var m = 0; m < merged.length; m++) {
                if (merged[m].indexOf(id) !== -1) { gIdx = m; break; }
            }
            if (gIdx !== -1) {
                if (emitted['g' + gIdx]) continue;
                emitted['g' + gIdx] = true;
                appendMergedRow(parent, merged[gIdx], metaObj, uMap, lvlList, iconCat, caps, countMap);
            } else {
                appendDefenseRow(parent, id, metaObj, uMap, lvlList, countMap, iconCat, caps);
            }
        }
    }

    // 墙按等级分组：子标签 + 每个等级一个图标（等级角标 + ×数量角标），等级升序，只显示数量>0 的等级
    function appendWallGroup(parent, title, ids, metaObj, lvlList, iconCat) {
        var label = document.createElement('div');
        label.className = 'ov-sub-label';
        label.textContent = title;
        parent.appendChild(label);
        var grid = document.createElement('div');
        grid.className = 'ov-icon-grid';
        for (var w = 0; w < ids.length; w++) {
            var id = ids[w];
            var levels = (lvlList[id] || []).slice().sort(function (a, b) { return a - b; });
            var byLv = {};
            for (var i = 0; i < levels.length; i++) byLv[levels[i]] = (byLv[levels[i]] || 0) + 1;
            var base = (iconCat === 'buildings2' ? 'img/icons/buildings2/' : 'img/icons/buildings/') + id + '_';
            Object.keys(byLv).forEach(function (lv) {
                grid.appendChild(imgEl(base + lv + '.webp', 'ov-grid-icon', Number(lv), mlv(metaObj, id), 1, id, byLv[lv]));
            });
        }
        parent.appendChild(grid);
    }

    // 陷阱按等级折叠（同城墙模式）：每个等级一个图标（等级角标 + ×该等级数量角标），等级升序，只显示数量>0 的等级
    function appendTrapGroup(parent, title, ids, metaObj, lvlList, iconCat) {
        var label = document.createElement('div');
        label.className = 'ov-sub-label';
        label.textContent = title;
        parent.appendChild(label);
        var grid = document.createElement('div');
        grid.className = 'ov-icon-grid';
        var base = (iconCat === 'buildings2' ? 'img/icons/buildings2/' : 'img/icons/buildings/') ;
        for (var w = 0; w < ids.length; w++) {
            var id = ids[w];
            var levels = (lvlList[id] || []).slice().sort(function (a, b) { return a - b; });
            var byLv = {};
            for (var i = 0; i < levels.length; i++) byLv[levels[i]] = (byLv[levels[i]] || 0) + 1;
            Object.keys(byLv).forEach(function (lv) {
                grid.appendChild(imgEl(base + id + '_' + lv + '.webp', 'ov-grid-icon', Number(lv), mlv(metaObj, id), 1, id, byLv[lv], false, iconPath(id, iconCat)));
            });
        }
        parent.appendChild(grid);
    }

    // 防御区：守卫（网格）+ 防御建筑（行模式 + max=1 网格）+ 陷阱（折叠网格）
    function renderDefenseSection(parent, p, uMap, countMap, lvlList, m, server, workers) {
        var sec = document.createElement('div');
        sec.className = 'ov-cat';
        sec.innerHTML =
            '<div class="ov-cat-header">' +
                '<img src="img/icons/Village_Guard.webp" class="ov-cat-icon" onerror="this.style.display=\'none\'">' +
                '<span class="ov-cat-title">防御</span>' +
                '<span class="ov-cat-pct"><img src="img/icons/Level.webp" class="ov-mini-icon" onerror="this.style.display=\'none\'">' + (p ? p.level.toFixed(2) : '-') + '%</span>' +
                '<span class="ov-cat-pct"><img src="img/icons/shijian.webp" class="ov-mini-icon" onerror="this.style.display=\'none\'">' + (p && p.time !== null ? p.time.toFixed(2) + '%' : '-') + '</span>' +
                remainEl(p, workers) +
            '</div>';
        var body = document.createElement('div');
        body.className = 'ov-cat-body';

        // 守卫（网格，数量恒 1）
        var guardLabel = document.createElement('div');
        guardLabel.className = 'ov-sub-label';
        guardLabel.textContent = '守卫';
        body.appendChild(guardLabel);
        var guardGrid = document.createElement('div');
        guardGrid.className = 'ov-icon-grid';
        var guardIds = serverIds(GUARDIANS, server);
        for (var g = 0; g < guardIds.length; g++) {
            guardGrid.appendChild(imgEl(iconPath(guardIds[g], 'buildings'), 'ov-grid-icon', uMap[guardIds[g]] || 0, mlv(m.guardians, guardIds[g]), 1, guardIds[g]));
        }
        body.appendChild(guardGrid);

        // 防御建筑：行模式（max>1）+ max=1 网格 + 合并组合行
        var defLabel = document.createElement('div');
        defLabel.className = 'ov-sub-label';
        defLabel.textContent = '防御建筑';
        body.appendChild(defLabel);
        var mergedIds = {};
        for (var mg = 0; mg < DEFENSE_MERGED_ROWS.length; mg++) {
            for (var mi = 0; mi < DEFENSE_MERGED_ROWS[mg].length; mi++) mergedIds[DEFENSE_MERGED_ROWS[mg][mi]] = true;
        }
        for (var mf = 0; mf < DEFENSE_FIRST_ROW.length; mf++) mergedIds[DEFENSE_FIRST_ROW[mf]] = true;
        var max1Grid = document.createElement('div');
        max1Grid.className = 'ov-icon-grid';
        // 第一行：加农炮+箭塔+法师塔（合成折算后各剩 1 个左右图标）
        appendMergedRow(body, DEFENSE_FIRST_ROW, m.defense, uMap, lvlList, 'buildings', BUILDING_CAPS, countMap);
        for (var d = 0; d < DEFENSE_BUILDINGS.length; d++) {
            var did = DEFENSE_BUILDINGS[d];
            if (mergedIds[did]) continue;   // 组合建筑由合并行渲染
            // 精工形态按服去重：国服 152 开头、国际服 103 开头，只渲染本服组
            if (did[0] === '1' && did[1] === '5') { if (server !== 'cn') continue; }
            if (did[0] === '1' && did[1] === '0' && did[2] === '3') { if (server === 'cn') continue; }
            var dcap = BUILDING_CAPS[did] || 1;
            if (dcap > 1) {
                appendDefenseRow(body, did, m.defense, uMap, lvlList, countMap, 'buildings');
            } else {
                // max=1（天鹰/擎天巨柱/复仇塔/精制台）：网格 + 带等级图标（不同等级不同外观）
                var dlv = uMap[did] || 0;
                var eagleMaxLv = mlv(m.defense, did);
                if (did === '1000031' && (uMap['1000001'] || 0) >= 17) {
                    // 天鹰火炮在 16 本→17 本升级时被大本吸收：满级图片点亮、无等级角标
                    max1Grid.appendChild(imgEl('img/icons/buildings/' + did + '_' + eagleMaxLv + '.webp', 'ov-grid-icon', 0, eagleMaxLv, 1, did, countMap[did] || 0, true, iconPath(did, 'buildings')));
                } else {
                    max1Grid.appendChild(imgEl('img/icons/buildings/' + did + '_' + (dlv || 1) + '.webp', 'ov-grid-icon', dlv, eagleMaxLv, 1, did, countMap[did] || 0, false, iconPath(did, 'buildings')));
                }
            }
        }
        // 合并组合行（按用户顺序）
        for (var mr = 0; mr < DEFENSE_MERGED_ROWS.length; mr++) {
            appendMergedRow(body, DEFENSE_MERGED_ROWS[mr], m.defense, uMap, lvlList, 'buildings', BUILDING_CAPS, countMap);
        }
        // max=1 建筑网格放在防御建筑最后（无额外顶部间距，行本身带 margin-bottom）
        if (max1Grid.childNodes.length) body.appendChild(max1Grid);
        // 陷阱（按等级折叠，同城墙模式：每个等级一个图标 + ×该等级数量）
        appendTrapGroup(body, '陷阱', TRAPS, m.defense, lvlList, 'buildings');

        sec.appendChild(body);
        parent.appendChild(sec);
    }

    // 建筑类分组区（防御/其他）：子标签 + 图标网格，图标带数量角标
    function getHomeHeroes() { return HOME_HEROES; }
    function getPets() { return PETS; }
    function getLabItems() { return { troops: LAB_TROOPS, spells: LAB_SPELLS, siege: LAB_SIEGE }; }
    function getBBItems() { return { heroes: BB_HEROES, troops: BB_TROOPS }; }
    function loadEqHeroMap(m) {
        if (!m) return EQ_MAP;
        var src = m['hero-equipment'].eqHeroMap;
        var ordered = {};
        for (var hk in EQ_MAP) {
            var desired = EQ_MAP[hk];
            var available = src[hk] || [];
            var isCn = available.length > 0 && String(available[0]).startsWith('106');
            var reordered = [];
            for (var i = 0; i < desired.length; i++) {
                var id = isCn ? '106' + String(desired[i]).slice(2) : String(desired[i]);
                if (available.indexOf(id) !== -1) reordered.push(id);
            }
            for (var i = 0; i < available.length; i++) {
                if (reordered.indexOf(available[i]) === -1) reordered.push(available[i]);
            }
            ordered[hk] = reordered;
        }
        return ordered;
    }
    function cnEpicEq() { return EPIC_EQ.map(function(id) { return '106' + id.slice(2); }); }

    // 双服 ID 翻译：守卫 107→161（国服）；其他组原样返回
    function serverIds(list, server) {
        if (server !== 'cn' || !list) return list;
        return list.map(function (id) {
            return id.startsWith('107') ? '161' + id.slice(3) : id;
        });
    }

    function buildUserLevelMap(data) {
        var map = {};
        var fields = ['buildings','buildings2','heroes','heroes2','units','units2','spells','siege_machines','pets','traps','traps2','guardians','equipment'];
        for (var fi = 0; fi < fields.length; fi++) {
            var arr = data[fields[fi]];
            if (arr && Array.isArray(arr)) {
                for (var i = 0; i < arr.length; i++) {
                    if (arr[i] && arr[i].data !== undefined) {
                        // 多座建筑取最高等级
                        var k = String(arr[i].data);
                        var lv = arr[i].lvl || 0;
                        if (map[k] === undefined || lv > map[k]) map[k] = lv;
                        // 精制台 1000097：精工形态等级 = 该形态三个模块等级之和
                        if (arr[i].data === 1000097 && arr[i].types) {
                            for (var t = 0; t < arr[i].types.length; t++) {
                                var type = arr[i].types[t];
                                if (!type || type.data === undefined) continue;
                                var sum = 0;
                                for (var md = 0; md < (type.modules || []).length; md++) sum += type.modules[md].lvl || 0;
                                var tk = String(type.data);
                                if (map[tk] === undefined || sum > map[tk]) map[tk] = sum;
                            }
                        }
                    }
                }
            }
        }
        // 国服：翻译国际服 ID → 国服 ID（导入数据可能混用两种 ID）
        if (data._server === 'cn') {
            for (var id in map) {
                if (id.startsWith('900')) { var cn = '106' + id.slice(2); if (map[cn] === undefined) map[cn] = map[id]; }
                if (id.startsWith('9300000')) { var cn = '124' + id.slice(2); if (map[cn] === undefined) map[cn] = map[id]; }
                if (id.startsWith('107')) { var cn = '161' + id.slice(3); if (map[cn] === undefined) map[cn] = map[id]; }
                if (id.startsWith('103')) { var cn = '152' + id.slice(3); if (map[cn] === undefined) map[cn] = map[id]; }
            }
        }
        return map;
    }

    // 建筑每座等级列表：{data: [lvl, lvl, ...]}（cnt 字段按座数展开，无 cnt 按 1 座）
    function buildUserLevelListMap(data) {
        var map = {};
        var fields = ['buildings', 'buildings2', 'traps', 'traps2', 'guardians'];
        for (var fi = 0; fi < fields.length; fi++) {
            var arr = data[fields[fi]];
            if (arr && Array.isArray(arr)) {
                for (var i = 0; i < arr.length; i++) {
                    if (arr[i] && arr[i].data !== undefined) {
                        var k = String(arr[i].data);
                        var lv = arr[i].lvl || 0;
                        var n = arr[i].cnt || 1;
                        if (!map[k]) map[k] = [];
                        for (var c = 0; c < n; c++) map[k].push(lv);
                        // 精制台 1000097：精工形态每座等级 = 模块等级之和
                        if (arr[i].data === 1000097 && arr[i].types) {
                            for (var t = 0; t < arr[i].types.length; t++) {
                                var type = arr[i].types[t];
                                if (!type || type.data === undefined) continue;
                                var sum = 0;
                                for (var md = 0; md < (type.modules || []).length; md++) sum += type.modules[md].lvl || 0;
                                var tk = String(type.data);
                                if (!map[tk]) map[tk] = [];
                                map[tk].push(sum);
                            }
                        }
                    }
                }
            }
        }
        if (data._server === 'cn') {
            for (var id in map) {
                if (id.startsWith('900')) { var cn = '106' + id.slice(2); (map[cn] = map[cn] || []).push.apply(map[cn], map[id]); }
                if (id.startsWith('9300000')) { var cn = '124' + id.slice(2); (map[cn] = map[cn] || []).push.apply(map[cn], map[id]); }
                if (id.startsWith('107')) { var cn = '161' + id.slice(3); (map[cn] = map[cn] || []).push.apply(map[cn], map[id]); }
                if (id.startsWith('103')) { var cn = '152' + id.slice(3); (map[cn] = map[cn] || []).push.apply(map[cn], map[id]); }
            }
        }
        return map;
    }

    // 建筑数量统计：同 data 的记录条数（cnt 字段按座数展开）= 拥有数量（地狱塔最多 3 座等）
    function buildUserCountMap(data) {        var map = {};
        var fields = ['buildings','buildings2','traps','traps2'];
        for (var fi = 0; fi < fields.length; fi++) {
            var arr = data[fields[fi]];
            if (arr && Array.isArray(arr)) {
                for (var i = 0; i < arr.length; i++) {
                    if (arr[i] && arr[i].data !== undefined) {
                        var k = String(arr[i].data);
                        map[k] = (map[k] || 0) + (arr[i].cnt || 1);
                        // 精制台 1000097：精工形态存在（每形态 1 座）
                        if (arr[i].data === 1000097 && arr[i].types) {
                            for (var t = 0; t < arr[i].types.length; t++) {
                                var type = arr[i].types[t];
                                if (type && type.data !== undefined) {
                                    var tk = String(type.data);
                                    map[tk] = (map[tk] || 0) + 1;
                                }
                            }
                        }
                    }
                }
            }
        }
        if (data._server === 'cn') {
            for (var id in map) {
                if (id.startsWith('900')) { var cn = '106' + id.slice(2); map[cn] = (map[cn] || 0) + map[id]; }
                if (id.startsWith('9300000')) { var cn = '124' + id.slice(2); map[cn] = (map[cn] || 0) + map[id]; }
                if (id.startsWith('103')) { var cn = '152' + id.slice(3); map[cn] = (map[cn] || 0) + map[id]; }
            }
        }
        return map;
    }

    // ===== 当前大本进度模式 =====
    // progressMode: 'full' 满防（默认，分母=全量满级）| 'th' 当前大本（分母=当前大本可达最高级）
    var progressMode = 'full';
    var currentThLv = 0;   // 当前渲染视图的大本等级（主世界/夜世界大本），供 mlv/thCap 使用

    function getProgressMode(tag) {
        try {
            var m = JSON.parse(localStorage.getItem('clash_progress_mode') || '{}');
            return m[tag] === 'th' ? 'th' : 'full';
        } catch (e) { return 'full'; }
    }
    function saveProgressMode(tag, mode) {
        try {
            var m = JSON.parse(localStorage.getItem('clash_progress_mode') || '{}');
            m[tag] = mode === 'th' ? 'th' : 'full';
            localStorage.setItem('clash_progress_mode', JSON.stringify(m));
        } catch (e) {}
    }

    // ===== 升级时间折扣（每账号记忆：0|5|10|15|20 百分数）=====
    var upgradeDiscount = 0;   // 当前详情账号折扣（0-20，百分数）；时间显示统一 ×(1-折扣/100)
    function getUpgradeDiscount(tag) {
        try {
            var m = JSON.parse(localStorage.getItem('clash_upgrade_discount') || '{}');
            var v = parseInt(m[tag], 10);
            return (v === 5 || v === 10 || v === 15 || v === 20) ? v : 0;
        } catch (e) { return 0; }
    }
    function saveUpgradeDiscount(tag, pct) {
        try {
            var m = JSON.parse(localStorage.getItem('clash_upgrade_discount') || '{}');
            m[tag] = (pct === 5 || pct === 10 || pct === 15 || pct === 20) ? pct : 0;
            localStorage.setItem('clash_upgrade_discount', JSON.stringify(m));
        } catch (e) {}
    }

    // thReq 紧凑字符串（2 位/级，"00" = 该级无大本限制）→ 数组（0 = 无限制），就地缓存
    function thReqArr(meta, id) {
        var req = meta && meta.thReq && meta.thReq[id];
        if (!req) return null;
        if (typeof req === 'string') {
            var arr = [];
            for (var i = 0; i < req.length; i += 2) {
                var v = req.substr(i, 2);
                arr.push(v === '00' ? 0 : parseInt(v, 10));
            }
            meta.thReq[id] = arr;
            return arr;
        }
        return req;
    }
    // 实体在当前大本（thLv）可达的最高等级；null = 无限制（调用方用满级）；0 = 当前大本未解锁
    function thMaxLv(meta, id, thLv) {
        var req = thReqArr(meta, id);
        if (!req || !req.length) return null;
        var max = 0;
        for (var i = 0; i < req.length; i++) {
            if (req[i] === 0 || req[i] <= thLv) max = i + 1;
            else break;
        }
        return max;
    }
    // 实体在当前大本的座数（caps 紧凑数组 [lv,count] / [lv,count,countAfterMerges]）；
    // null = 无 caps 表（调用方用全量 cap）；0 = 当前大本未解锁该建筑
    function thCap(meta, id, thLv) {
        var caps = meta && meta.caps && meta.caps[id];
        if (!caps || !caps.length) return null;
        var best = null;
        for (var i = 0; i < caps.length; i++) {
            if (caps[i][0] <= thLv) best = caps[i];
            else break;
        }
        return best ? (best.length > 2 ? best[2] : best[1]) : 0;
    }
    // 模式感知满级：'th' 模式下返回当前大本可达等级（徽章/分母共用）
    function mlv(meta, id) {
        var base = meta.levels[id];
        if (progressMode !== 'th') return base;
        var t = thMaxLv(meta, id, currentThLv);
        return t !== null ? t : base;
    }

    // 座数口径进度：分母固定 = Σ(cap × 单座满级)（不含折算）；分子 = Σ(每座实际) + 合成折算（每座加 Σ 基础建筑满级）
    // 返回 { curLv, totalLv, curTm, totalTm } 原始值供合并；thLv 大本等级用于天鹰被吸收判定
    function calcInstances(ids, caps, meta, lvlList, mergeWeight, thLv, mode) {
        var curLv = 0, totalLv = 0, curTm = 0, totalTm = 0;
        if (!meta) return { curLv: curLv, totalLv: totalLv, curTm: curTm, totalTm: totalTm };
        var isTh = mode === 'th';
        for (var i = 0; i < ids.length; i++) {
            var id = ids[i];
            var maxLvAll = meta.levels[id];
            if (maxLvAll === undefined) continue;   // 无源数据（精工/限时）不计入
            // 当前大本模式：满级 = 大本可达最高级；座数 = 大本解锁座数
            var maxLv = maxLvAll;
            var cap = (caps && caps[id]) || 1;
            if (isTh) {
                var tMax = thMaxLv(meta, id, thLv);
                if (tMax !== null) maxLv = tMax;
                var tCap = thCap(meta, id, thLv);
                if (tCap !== null) cap = tCap;
            }
            var cum = meta.times && meta.times[id];
            // cum[lv] = 升到 lv 级前累计：单座满级 = cum[maxLv+1]（含满级本级升级，与分子 cum[uLv+1] 同口径）
            var per = cum && maxLv > 0 ? cum[maxLv + 1 < cum.length ? maxLv + 1 : cum.length - 1] : 0;
            totalLv += cap * maxLv;
            totalTm += cap * per;
            var lvls = lvlList[id] || [];
            var w = mergeWeight && mergeWeight[id];
            var lvAdd = 0, tmAdd = 0;
            if (w) {
                for (var wi = 0; wi < w.length; wi++) {
                    var bid = w[wi][0], bn = w[wi][1];
                    var bMaxAll = meta.levels[bid];
                    if (bMaxAll === undefined) continue;
                    // 折算源满级：大本模式按当前大本可达截断（合成要求基础满级，满级即精确补偿）
                    var bMax = bMaxAll;
                    if (isTh) {
                        var bT = thMaxLv(meta, bid, thLv);
                        if (bT !== null) bMax = bT;
                    }
                    lvAdd += bMax * bn;
                    var bcum = meta.times && meta.times[bid];
                    if (bcum && bcum.length && bMax > 0) tmAdd += bcum[bMax + 1 < bcum.length ? bMax + 1 : bcum.length - 1] * bn;
                }
            }
            // 天鹰火炮在 16 本→17 本升级时被大本吸收：视为已满级
            if (thLv >= 17 && id === '1000031' && !lvls.length) {
                lvls = [maxLv];
                lvAdd = 0;
                tmAdd = 0;
            }
            for (var j = 0; j < lvls.length; j++) {
                var uLv = Math.min(lvls[j], maxLv);   // 大本模式：超出上限截断
                curLv += uLv + lvAdd;
                if (cum) {
                    // cum[lv] = 升到 lv 级前的累计；当前级完成后 = cum[lv+1]（满级 = per，与分母一致）
                    var idx = uLv + 1 < cum.length ? uLv + 1 : cum.length - 1;
                    curTm += (cum[idx] || 0) + tmAdd;
                }
            }
        }
        return { curLv: curLv, totalLv: totalLv, curTm: curTm, totalTm: totalTm };
    }

    // 分类进度 = BAR_GROUPS 子分组行的合并（顶部进度条与弹窗明细共用同一份配置与同一核心计算）
    function calcCategoryProgress(cfg, lvlList, m, server, thLv, mode) {
        var curLv = 0, totalLv = 0, curTm = 0, totalTm = 0;
        for (var g = 0; cfg.groups && g < cfg.groups.length; g++) {
            var grp = cfg.groups[g];
            var r = calcInstances(serverIds(grp[1], server), grp[3], m && m[grp[2]], lvlList, MERGE_WEIGHT, thLv, mode);
            curLv += r.curLv;
            totalLv += r.totalLv;
            curTm += r.curTm;
            totalTm += r.totalTm;
        }
        return {
            level: totalLv > 0 ? Math.min(curLv / totalLv * 100, 100) : 0,
            time: totalTm > 0 ? Math.min(curTm / totalTm * 100, 100) : null,
            curTm: curTm,
            totalTm: totalTm
        };
    }

    function calcSingleProgress(userMap, meta, mode, thLv) {
        if (!meta) return { level: 0, time: null, curTm: 0, totalTm: 0 };
        var curLv = 0, totalLv = 0, curTm = 0, totalTm = 0;
        var isTh = mode === 'th';
        var keys = Object.keys(meta.levels);
        for (var i = 0; i < keys.length; i++) {
            var id = keys[i];
            // 分母 = 满级（大本模式按当前大本可达截断）；分子 = 账号等级 clamp
            var maxLv = meta.levels[id];
            if (isTh) {
                var tMax = thMaxLv(meta, id, thLv);
                if (tMax !== null) maxLv = tMax;
            }
            var uLv = Math.min(userMap[id] || 0, maxLv);
            curLv += uLv;
            totalLv += maxLv;
            if (meta.times && meta.times[id]) {
                var cum = meta.times[id];
                // 分子 = 当前级完成后 cum[uLv+1]、分母 = 满级 cum[maxLv+1]（与座数口径同规约）
                curTm += cum.length ? (cum[uLv + 1 < cum.length ? uLv + 1 : cum.length - 1] || 0) : 0;
                totalTm += maxLv > 0 ? (cum[maxLv + 1 < cum.length ? maxLv + 1 : cum.length - 1] || 0) : 0;
            }
        }
        var lvPct = totalLv > 0 ? Math.min(curLv / totalLv * 100, 100) : 0;
        var tmPct = totalTm > 0 ? Math.min(curTm / totalTm * 100, 100) : null;
        return { level: lvPct, time: tmPct, curTm: curTm, totalTm: totalTm };
    }

    // 单座口径多分类合并（科技/英雄等每 id 一座的实体用）
    function combineSingle(userMap, metas, mode, thLv) {
        var curLv = 0, totalLv = 0, curTm = 0, totalTm = 0;
        var isTh = mode === 'th';
        for (var i = 0; i < metas.length; i++) {
            var m = metas[i];
            if (!m) continue;
            var keys = Object.keys(m.levels);
            for (var j = 0; j < keys.length; j++) {
                var id = keys[j];
                var maxLv = m.levels[id];
                if (isTh) {
                    var tMax = thMaxLv(m, id, thLv);
                    if (tMax !== null) maxLv = tMax;
                }
                var uLv = Math.min(userMap[id] || 0, maxLv);
                curLv += uLv;
                totalLv += maxLv;
                if (m.times && m.times[id]) {
                    var cum = m.times[id];
                    // 分子 = 当前级完成后 cum[uLv+1]、分母 = 满级 cum[maxLv+1]（与座数口径同规约）
                    curTm += cum.length ? (cum[uLv + 1 < cum.length ? uLv + 1 : cum.length - 1] || 0) : 0;
                    totalTm += maxLv > 0 ? (cum[maxLv + 1 < cum.length ? maxLv + 1 : cum.length - 1] || 0) : 0;
                }
            }
        }
        return {
            level: totalLv > 0 ? Math.min(curLv / totalLv * 100, 100) : 0,
            time: totalTm > 0 ? Math.min(curTm / totalTm * 100, 100) : null,
            curTm: curTm,
            totalTm: totalTm
        };
    }

    // 剩余时间文案：totalTm − curTm（单位：秒）→ 「X天Y时」（满级/全完成输出「0天0时」）
    // workerCount > 1 时除以工人数（英雄/防御/其他依赖工人，多工人并行消化总工时）
    // 账号升级时间折扣：总时间/已完成/剩余统一 ×(1-折扣%)（分子分母同乘，百分比不变）
    function formatRemainTime(totalTm, curTm, workerCount) {
        var factor = 1 - upgradeDiscount / 100;
        var sec = Math.max(0, Math.round((totalTm - curTm) * factor));
        if (workerCount > 1) sec = Math.round(sec / workerCount);
        var days = Math.floor(sec / 86400);
        var hours = Math.round((sec % 86400) / 3600);
        if (hours === 24) { days += 1; hours = 0; }
        return days + '天' + hours + '时';
    }

    function remainEl(p, workerCount) {
        if (!p || p.time === null) return '';
        return '<span class="ov-cat-pct ov-cat-remain"><img src="img/icons/shijian.webp" class="ov-mini-icon" onerror="this.style.display=\'none\'">' + formatRemainTime(p.totalTm, p.curTm, workerCount) + '</span>';
    }

    function refreshBars() {
        var cols = document.querySelectorAll('.ov-bar-col');
        if (!cols.length || !currentProgress) return;
        var showTime = showTimeMode;
        var homeKeys = ['heroes','equip','pets','lab','defense','other'];
        var nightKeys = ['bHero','bTroop','bDefense','bOther'];
        for (var ci = 0; ci < cols.length; ci++) {
            var rows = cols[ci].querySelectorAll('.ov-bar-row');
            var isNight = cols[ci].closest('#ov-detail-night') !== null;
            var keys = isNight ? nightKeys : homeKeys;
            for (var ri = 0; ri < rows.length && ri < keys.length; ri++) {
                var p = currentProgress[keys[ri]];
                if (!p) continue;
                var pct = (keys[ri] === 'equip' || !showTime || p.time === null) ? p.level : p.time;
                var fill = rows[ri].querySelector('.ov-bar-fill');
                var pctEl = rows[ri].querySelector('.ov-bar-pct');
                if (fill) {
                    fill.style.width = pct + '%';
                    // 满防模式进度 100%：进度条金色（等级/时间切换同步）
                    fill.classList.toggle('ov-bar-full', pct >= 100 && progressMode === 'full');
                }
                if (pctEl) pctEl.textContent = pct.toFixed(2) + '%';
            }
        }
    }

    function renderHomeDetail(data, accName) {
        if (!el.detailHome) return;
        var home = el.detailHome;
        var th = CocTool.overviewList.findThLevel(data);
        progressMode = getProgressMode(currentDetailTag);
        upgradeDiscount = getUpgradeDiscount(currentDetailTag);
        showTimeMode = false;   // 重建后按钮复位为「等级」active，状态同步
        currentThLv = th;
        var thIcon = th ? 'img/icons/buildings/1000001_' + th + '.webp' : 'img/icons/20260627.webp';
        var m = data._server === 'cn' ? global.PROGRESS_META_CN : global.PROGRESS_META_INTL;
        var uMap = buildUserLevelMap(data);
        var lvlList = buildUserLevelListMap(data);
        // 主世界工人数（工人小屋+B.O.B 小屋+月卡，与首页总览分母同源）：英雄/防御/其他剩余时间 ÷ 工人数
        var workers = 0;
        try { workers = (CocTool.calc.getCategoryDenominators(data).buildings) || 0; } catch (e) {}
        var mode = progressMode;
        var p = currentProgress = {
            heroes: calcSingleProgress(uMap, m && m.heroes, mode, th),
            equip: calcSingleProgress(uMap, m && m['hero-equipment'], mode, th),
            pets: calcSingleProgress(uMap, m && m.pets, mode, th),
            lab: combineSingle(uMap, [m && m.units, m && m.spells, m && m.siege_machines], mode, th),
            defense: calcCategoryProgress(BAR_GROUPS.defense, lvlList, m, data._server, th, mode),
            other: calcCategoryProgress(BAR_GROUPS.other, lvlList, m, data._server, th, mode)
        };
        var showTime = false;
        var modeBtn = '<button class="ov-mode-btn' + (mode === 'th' ? ' th' : '') + '" onclick="CocTool.features.overview.toggleProgressMode()" title="' + (mode === 'th' ? '当前大本进度（点击切换满防）' : '满防进度（点击切换当前大本）') + '"><i class="fa fa-refresh"></i></button>';
        var discHtml = discountBtnHtml();
        var html =
            '<div class="ov-top-row">' +
                '<div class="ov-toggle-b">' +
                    '<button class="ov-seg active" data-mode="level">等级</button>' +
                    '<button class="ov-seg" data-mode="time">时间</button>' +
                '</div>' +
                discHtml +
            '</div>' +
            '<div class="ov-body">' +
                '<div class="ov-icon-col">' +
                    '<div class="ov-icon-name">' + escapeHtml(accName) + '</div>' +
                    '<img src="' + thIcon + '" class="ov-th-icon" onerror="this.style.display=\'none\'">' +
                    modeBtn +
                '</div>' +
                '<div class="ov-right-col">' +
                    '<div class="ov-bar-col">' +
                        progressBarHtml('英雄', 'img/icons/hero_icon.webp', p.heroes, showTime, 'heroes') +
                        progressBarHtml('装备', 'img/icons/Em_icon.webp', p.equip, false, 'equip') +
                        progressBarHtml('战宠', 'img/icons/pet_icom.webp', p.pets, showTime, 'pets') +
                        progressBarHtml('科技', 'img/icons/lab_icon.webp', p.lab, showTime, 'lab') +
                        progressBarHtml('防御', 'img/icons/Village_Guard.webp', p.defense, showTime, 'defense') +
                        progressBarHtml('其他', 'img/icons/other_bulid.webp', p.other, showTime, 'other') +
                    '</div>' +
                '</div>' +
            '</div>';
        home.innerHTML = html;

        var sectionsDiv = document.createElement('div');
        sectionsDiv.className = 'ov-sections';

        var heroKeys = getHomeHeroes();
        var eqMap = loadEqHeroMap(m);
        var epicEq = data._server === 'cn' ? cnEpicEq() : EPIC_EQ;
        var heroSection = document.createElement('div');
        heroSection.className = 'ov-cat';
        heroSection.innerHTML =
            '<div class="ov-cat-header">' +
                '<img src="img/icons/hero_icon.webp" class="ov-cat-icon" onerror="this.style.display=\'none\'">' +
                '<div class="ov-cat-title-wrap">' +
                    '<span class="ov-cat-title">英雄</span>' +
                '</div>' +
                '<span class="ov-cat-pct"><img src="img/icons/Level.webp" class="ov-mini-icon" onerror="this.style.display=\'none\'">' + p.heroes.level.toFixed(2) + '%</span>' +
                '<span class="ov-cat-pct"><img src="img/icons/shijian.webp" class="ov-mini-icon" onerror="this.style.display=\'none\'">' + (p.heroes.time !== null ? p.heroes.time.toFixed(2) + '%' : '-') + '</span>' +
                '<span class="ov-cat-pct"><img src="img/icons/Em_icon.webp" class="ov-mini-icon" onerror="this.style.display=\'none\'">' + p.equip.level.toFixed(2) + '%</span>' +
                remainEl(p.heroes, workers) +
                '<img src="img/icons/tip.webp" class="ov-bar-tip" onclick="CocTool.features.overview.showEpicTip()">' +
            '</div>';
        var heroBody = document.createElement('div');
        heroBody.className = 'ov-cat-body';
        for (var i = 0; i < heroKeys.length; i++) {
            var hk = heroKeys[i];
            if (!names.ITEM_NAMES[hk]) continue;
            var row = document.createElement('div');
            row.className = 'ov-hero-row';
            row.appendChild(imgEl(iconPath(hk, 'heroes'), 'ov-hero-icon', uMap[hk] || 0, mlv(m.heroes, hk), 1, hk));
            var wrap = document.createElement('div');
            wrap.className = 'ov-eq-wrap';
            var eqs = eqMap[hk] || [];
            for (var j = 0; j < eqs.length; j++) {
                var isEpic = epicEq.indexOf(eqs[j]) !== -1;
                var eqCls = isEpic ? 'ov-eq-icon ov-eq-epic' : 'ov-eq-icon ov-eq-common';
                wrap.appendChild(imgEl(iconPath(eqs[j], 'hero-equipment'), eqCls, uMap[eqs[j]] || 0, mlv(m['hero-equipment'], eqs[j]), isEpic ? 2 : 1, eqs[j]));
            }
            row.appendChild(wrap);
            heroBody.appendChild(row);
        }
        heroSection.appendChild(heroBody);
        sectionsDiv.appendChild(heroSection);

        var petKeys = getPets();
        var petSection = document.createElement('div');
        petSection.className = 'ov-cat';
        petSection.innerHTML =
            '<div class="ov-cat-header">' +
                '<img src="img/icons/pet_icom.webp" class="ov-cat-icon" onerror="this.style.display=\'none\'">' +
                '<span class="ov-cat-title">战宠</span>' +
                '<span class="ov-cat-pct"><img src="img/icons/Level.webp" class="ov-mini-icon" onerror="this.style.display=\'none\'">' + p.pets.level.toFixed(2) + '%</span>' +
                '<span class="ov-cat-pct"><img src="img/icons/shijian.webp" class="ov-mini-icon" onerror="this.style.display=\'none\'">' + (p.pets.time !== null ? p.pets.time.toFixed(2) + '%' : '-') + '</span>' +
                remainEl(p.pets) +
            '</div>';
        var petBody = document.createElement('div');
        petBody.className = 'ov-cat-body ov-icon-row';
        for (var i = 0; i < petKeys.length; i++) {
            petBody.appendChild(imgEl(iconPath(petKeys[i], 'pets'), 'ov-grid-icon', uMap[petKeys[i]] || 0, mlv(m.pets, petKeys[i]), 1, petKeys[i]));
        }
        petSection.appendChild(petBody);
        sectionsDiv.appendChild(petSection);

        var lab = getLabItems();
        var labSection = document.createElement('div');
        labSection.className = 'ov-cat';
        labSection.innerHTML =
            '<div class="ov-cat-header">' +
                '<img src="img/icons/lab_icon.webp" class="ov-cat-icon" onerror="this.style.display=\'none\'">' +
                '<span class="ov-cat-title">科技</span>' +
                '<span class="ov-cat-pct"><img src="img/icons/Level.webp" class="ov-mini-icon" onerror="this.style.display=\'none\'">' + p.lab.level.toFixed(2) + '%</span>' +
                '<span class="ov-cat-pct"><img src="img/icons/shijian.webp" class="ov-mini-icon" onerror="this.style.display=\'none\'">' + (p.lab.time !== null ? p.lab.time.toFixed(2) + '%' : '-') + '</span>' +
                remainEl(p.lab) +
            '</div>';
        var labBody = document.createElement('div');
        labBody.className = 'ov-cat-body';

        function appendSubCat(parent, title, keys, metaObj) {
            var label = document.createElement('div');
            label.className = 'ov-sub-label';
            label.textContent = title;
            parent.appendChild(label);
            // 支持二维数组（每行一个网格，两行布局）；一维数组保持单网格
            var rows = (keys.length && Array.isArray(keys[0])) ? keys : [keys];
            for (var r = 0; r < rows.length; r++) {
                var grid = document.createElement('div');
                grid.className = 'ov-icon-grid' + (r > 0 ? ' ov-icon-grid-next' : '');
                var row = rows[r];
                for (var i = 0; i < row.length; i++) {
                    grid.appendChild(imgEl(iconPath(row[i], 'units'), 'ov-grid-icon', uMap[row[i]] || 0, mlv(metaObj, row[i]), 1, row[i]));
                }
                parent.appendChild(grid);
            }
        }
        if (lab.troops.length) appendSubCat(labBody, '兵种', lab.troops, m.units);
        if (lab.spells.length) appendSubCat(labBody, '法术', lab.spells, m.spells);
        if (lab.siege.length) appendSubCat(labBody, '攻城机器', lab.siege, m.siege_machines);

        labSection.appendChild(labBody);
        sectionsDiv.appendChild(labSection);

        // 防御区：守卫 + 防御建筑（行模式/合成折算）+ 陷阱（折叠）
        var countMap = buildUserCountMap(data);
        var lvlList = buildUserLevelListMap(data);
        renderDefenseSection(sectionsDiv, p.defense, uMap, countMap, lvlList, m, data._server, workers);
        // 其他区：资源建筑 + 军队建筑 + 其他（行模式）+ 墙（按等级分组）
        var otherSection = document.createElement('div');
        otherSection.className = 'ov-cat';
        otherSection.innerHTML =
            '<div class="ov-cat-header">' +
                '<img src="img/icons/other_bulid.webp" class="ov-cat-icon" onerror="this.style.display=\'none\'">' +
                '<span class="ov-cat-title">其他</span>' +
                '<span class="ov-cat-pct"><img src="img/icons/Level.webp" class="ov-mini-icon" onerror="this.style.display=\'none\'">' + (p.other ? p.other.level.toFixed(2) : '-') + '%</span>' +
                '<span class="ov-cat-pct"><img src="img/icons/shijian.webp" class="ov-mini-icon" onerror="this.style.display=\'none\'">' + (p.other && p.other.time !== null ? p.other.time.toFixed(2) + '%' : '-') + '</span>' +
                remainEl(p.other, workers) +
            '</div>';
        var otherBody = document.createElement('div');
        otherBody.className = 'ov-cat-body';
        appendRowGroup(otherBody, '资源建筑', RESOURCE_BUILDINGS, m.buildings, uMap, lvlList, countMap, 'buildings', [
            ['1000001', '1000014', '1000024', '1000023']
        ]);
        appendRowGroup(otherBody, '军队建筑', ARMY_BUILDINGS, m.buildings, uMap, lvlList, countMap, 'buildings', [
            ['1000006', '1000026', '1000020', '1000029', '1000059'],
            ['1000007', '1000068', '1000070', '1000071']
        ]);
        appendRowGroup(otherBody, '其他', OTHER_BUILDINGS, m.buildings, uMap, lvlList, countMap, 'buildings', [
            ['1000064', '1000093']
        ]);
        appendWallGroup(otherBody, '墙', WALL_IDS, m.buildings, lvlList, 'buildings');
        otherSection.appendChild(otherBody);
        sectionsDiv.appendChild(otherSection);

        home.appendChild(sectionsDiv);
    }

    function renderNightDetail(data, accName) {
        if (!el.detailNight) return;
        var night = el.detailNight;
        var bhLvl = 0;
        if (data.buildings2) {
            for (var i = 0; i < data.buildings2.length; i++) {
                if (data.buildings2[i].data === 1000034) { bhLvl = data.buildings2[i].lvl || 0; break; }
            }
        }
        var m = data._server === 'cn' ? global.PROGRESS_META_CN : global.PROGRESS_META_INTL;
        var uMap = buildUserLevelMap(data);
        var lvlList = buildUserLevelListMap(data);
        if (currentProgress) {
            progressMode = getProgressMode(currentDetailTag);
            upgradeDiscount = getUpgradeDiscount(currentDetailTag);
            showTimeMode = false;   // 重建后按钮复位为「等级」active，状态同步
            currentThLv = bhLvl;
            var mode = progressMode;
            currentProgress.bHero = calcSingleProgress(uMap, m && m.heroes2, mode, bhLvl);
            currentProgress.bTroop = calcSingleProgress(uMap, m && m.units2, mode, bhLvl);
            currentProgress.bDefense = calcCategoryProgress(BAR_GROUPS.bDefense, lvlList, m, data._server, bhLvl, mode);
            currentProgress.bOther = calcCategoryProgress(BAR_GROUPS.bOther, lvlList, m, data._server, bhLvl, mode);
        }
        var pBHero = currentProgress ? currentProgress.bHero : { level: 0, time: null };
        var pBTroop = currentProgress ? currentProgress.bTroop : { level: 0, time: null };
        var pBDefense = currentProgress ? currentProgress.bDefense : { level: 0, time: null };
        var pBOther = currentProgress ? currentProgress.bOther : { level: 0, time: null };
        // 夜世界工人数（夜大本+夜工人小屋+OTTO 前哨，与首页总览分母同源）：夜英雄/防御/其他剩余时间 ÷ 工人数
        var nightWorkers = 0;
        try { nightWorkers = (CocTool.calc.getCategoryDenominators(data).buildings2) || 0; } catch (e) {}
        var bhIcon = bhLvl ? 'img/icons/buildings2/1000034_' + bhLvl + '.webp' : 'img/icons/20260627.webp';
        var modeBtn = '<button class="ov-mode-btn' + (progressMode === 'th' ? ' th' : '') + '" onclick="CocTool.features.overview.toggleProgressMode()" title="' + (progressMode === 'th' ? '当前大本进度（点击切换满防）' : '满防进度（点击切换当前大本）') + '"><i class="fa fa-refresh"></i></button>';
        var discHtml = discountBtnHtml();
        var html =
            '<div class="ov-top-row">' +
                '<div class="ov-toggle-b">' +
                    '<button class="ov-seg active">等级</button>' +
                    '<button class="ov-seg">时间</button>' +
                '</div>' +
                discHtml +
            '</div>' +
            '<div class="ov-body">' +
                '<div class="ov-icon-col">' +
                    '<div class="ov-icon-name">' + escapeHtml(accName) + '</div>' +
                    '<img src="' + bhIcon + '" class="ov-th-icon" onerror="this.style.display=\'none\'">' +
                    modeBtn +
                '</div>' +
                '<div class="ov-right-col">' +
                    '<div class="ov-bar-col">' +
                        progressBarHtml('英雄', 'img/icons/hero_icon.webp', pBHero, false, 'bHero') +
                        progressBarHtml('兵种', 'img/icons/lab_icon.webp', pBTroop, false, 'bTroop') +
                        progressBarHtml('防御', 'img/icons/Village_Guard.webp', pBDefense, false, 'bDefense') +
                        progressBarHtml('其他', 'img/icons/other_bulid.webp', pBOther, false, 'bOther') +
                    '</div>' +
                '</div>' +
            '</div>';
        night.innerHTML = html;

        var sectionsDiv = document.createElement('div');
        sectionsDiv.className = 'ov-sections';

        var bb = getBBItems();
        var heroSection = document.createElement('div');
        heroSection.className = 'ov-cat';
        heroSection.innerHTML =
            '<div class="ov-cat-header">' +
                '<img src="img/icons/hero_icon.webp" class="ov-cat-icon" onerror="this.style.display=\'none\'">' +
                '<span class="ov-cat-title">英雄</span>' +
                '<span class="ov-cat-pct"><img src="img/icons/Level.webp" class="ov-mini-icon" onerror="this.style.display=\'none\'">' + pBHero.level.toFixed(2) + '%</span>' +
                '<span class="ov-cat-pct"><img src="img/icons/shijian.webp" class="ov-mini-icon" onerror="this.style.display=\'none\'">' + (pBHero.time !== null ? pBHero.time.toFixed(2) + '%' : '-') + '</span>' +
                remainEl(pBHero, nightWorkers) +
            '</div>';
        var heroBody = document.createElement('div');
        heroBody.className = 'ov-cat-body ov-icon-row';
        for (var i = 0; i < bb.heroes.length; i++) {
            heroBody.appendChild(imgEl(iconPath(bb.heroes[i], 'heroes2'), 'ov-grid-icon', uMap[bb.heroes[i]] || 0, mlv(m.heroes2, bb.heroes[i]), 1, bb.heroes[i]));
        }
        heroSection.appendChild(heroBody);
        sectionsDiv.appendChild(heroSection);

        var troopSection = document.createElement('div');
        troopSection.className = 'ov-cat';
        troopSection.innerHTML =
            '<div class="ov-cat-header">' +
                '<img src="img/icons/lab_icon.webp" class="ov-cat-icon" onerror="this.style.display=\'none\'">' +
                '<span class="ov-cat-title">兵种</span>' +
                '<span class="ov-cat-pct"><img src="img/icons/Level.webp" class="ov-mini-icon" onerror="this.style.display=\'none\'">' + pBTroop.level.toFixed(2) + '%</span>' +
                '<span class="ov-cat-pct"><img src="img/icons/shijian.webp" class="ov-mini-icon" onerror="this.style.display=\'none\'">' + (pBTroop.time !== null ? pBTroop.time.toFixed(2) + '%' : '-') + '</span>' +
                remainEl(pBTroop) +
            '</div>';
        var troopBody = document.createElement('div');
        troopBody.className = 'ov-cat-body ov-icon-row';
        for (var i = 0; i < bb.troops.length; i++) {
            troopBody.appendChild(imgEl(iconPath(bb.troops[i], 'units2'), 'ov-grid-icon', uMap[bb.troops[i]] || 0, mlv(m.units2, bb.troops[i]), 1, bb.troops[i]));
        }
        troopSection.appendChild(troopBody);
        sectionsDiv.appendChild(troopSection);

        // 夜世界防御区：防御建筑（行模式 + max=1 网格）+ 陷阱（×数量折叠网格）
        var lvlList = buildUserLevelListMap(data);
        var countMap = buildUserCountMap(data);
        var defSection = document.createElement('div');
        defSection.className = 'ov-cat';
        defSection.innerHTML =
            '<div class="ov-cat-header">' +
                '<img src="img/icons/Village_Guard.webp" class="ov-cat-icon" onerror="this.style.display=\'none\'">' +
                '<span class="ov-cat-title">防御</span>' +
                '<span class="ov-cat-pct"><img src="img/icons/Level.webp" class="ov-mini-icon" onerror="this.style.display=\'none\'">' + pBDefense.level.toFixed(2) + '%</span>' +
                '<span class="ov-cat-pct"><img src="img/icons/shijian.webp" class="ov-mini-icon" onerror="this.style.display=\'none\'">' + (pBDefense.time !== null ? pBDefense.time.toFixed(2) + '%' : '-') + '</span>' +
                remainEl(pBDefense, nightWorkers) +
            '</div>';
        var defBody = document.createElement('div');
        defBody.className = 'ov-cat-body';
        var defLabel = document.createElement('div');
        defLabel.className = 'ov-sub-label';
        defLabel.textContent = '防御建筑';
        defBody.appendChild(defLabel);
        var bbMax1Grid = document.createElement('div');
        bbMax1Grid.className = 'ov-icon-grid';
        var bbMergedIds = {};
        for (var bm = 0; bm < BB_DEFENSE_MERGED_ROWS.length; bm++) {
            for (var bmi = 0; bmi < BB_DEFENSE_MERGED_ROWS[bm].length; bmi++) bbMergedIds[BB_DEFENSE_MERGED_ROWS[bm][bmi]] = true;
        }
        for (var d = 0; d < BB_DEFENSES.length; d++) {
            var did = BB_DEFENSES[d];
            if (bbMergedIds[did]) continue;   // 组合建筑由合并行渲染
            var dcap = BB_BUILDING_CAPS[did] || 1;
            if (dcap > 1) {
                appendDefenseRow(defBody, did, m.buildings2, uMap, lvlList, countMap, 'buildings2', BB_BUILDING_CAPS);
            } else {
                // max=1（多管迫击炮/守卫哨岗/巨型特斯拉等）：网格 + 带等级图标，放防御建筑最后
                var dlv = uMap[did] || 0;
                bbMax1Grid.appendChild(imgEl('img/icons/buildings2/' + did + '_' + (dlv || 1) + '.webp', 'ov-grid-icon', dlv, m.buildings2.levels[did], 1, did, countMap[did] || 0, false, iconPath(did, 'buildings2')));
            }
        }
        // 合并组合行（按用户顺序）
        for (var bmr = 0; bmr < BB_DEFENSE_MERGED_ROWS.length; bmr++) {
            appendMergedRow(defBody, BB_DEFENSE_MERGED_ROWS[bmr], m.buildings2, uMap, lvlList, 'buildings2', BB_BUILDING_CAPS, countMap);
        }
        if (bbMax1Grid.childNodes.length) defBody.appendChild(bbMax1Grid);
        // 陷阱（按等级折叠，同城墙模式：每个等级一个图标 + ×该等级数量）
        appendTrapGroup(defBody, '陷阱', BB_TRAPS, m.traps2, lvlList, 'buildings2');
        defSection.appendChild(defBody);
        sectionsDiv.appendChild(defSection);
        // 夜世界其他区：资源/军队/其他（行模式）+ 墙（等级分组 ×数量）
        var otherSection = document.createElement('div');
        otherSection.className = 'ov-cat';
        otherSection.innerHTML =
            '<div class="ov-cat-header">' +
                '<img src="img/icons/other_bulid.webp" class="ov-cat-icon" onerror="this.style.display=\'none\'">' +
                '<span class="ov-cat-title">其他</span>' +
                '<span class="ov-cat-pct"><img src="img/icons/Level.webp" class="ov-mini-icon" onerror="this.style.display=\'none\'">' + pBOther.level.toFixed(2) + '%</span>' +
                '<span class="ov-cat-pct"><img src="img/icons/shijian.webp" class="ov-mini-icon" onerror="this.style.display=\'none\'">' + (pBOther.time !== null ? pBOther.time.toFixed(2) + '%' : '-') + '</span>' +
                remainEl(pBOther, nightWorkers) +
            '</div>';
        var otherBody = document.createElement('div');
        otherBody.className = 'ov-cat-body';
        appendRowGroup(otherBody, '资源建筑', BB_RESOURCES, m.buildings2, uMap, lvlList, countMap, 'buildings2', [
            ['1000035', '1000036'],
            ['1000037', '1000038']
        ], BB_BUILDING_CAPS);
        appendRowGroup(otherBody, '军队建筑', BB_ARMY, m.buildings2, uMap, lvlList, countMap, 'buildings2', [
            ['1000049', '1000040', '1000046', '1000082']
        ], BB_BUILDING_CAPS);
        appendRowGroup(otherBody, '其他', BB_OTHER, m.buildings2, uMap, lvlList, countMap, 'buildings2', [
            ['1000058', '1000039', '1000065', '1000047']
        ], BB_BUILDING_CAPS);
        appendWallGroup(otherBody, '墙', BB_WALL_IDS, m.buildings2, lvlList, 'buildings2');
        otherSection.appendChild(otherBody);
        sectionsDiv.appendChild(otherSection);

        night.appendChild(sectionsDiv);
    }

    var epicTipOverlay = null;

    function showEpicTip() {
        if (epicTipOverlay) return;
        epicTipOverlay = document.createElement('div');
        epicTipOverlay.className = 'modal-overlay';
        epicTipOverlay.innerHTML =
            '<div class="modal-card w-sm ov-tip-card">' +
                '<p class="ov-tip-text">由于史诗装备在 JSON 中无论你是否拥有都会被记录为 1 级，因此等级=1 的史诗装备视为未拥有。为确保正确判断装备拥有情况，请确保你的史诗级装备等级 ≥ 2。</p>' +
                '<button class="ov-modal-btn" onclick="CocTool.features.overview.closeEpicTip()">我已知晓</button>' +
            '</div>';
        document.body.appendChild(epicTipOverlay);
    }

    function closeEpicTip() {
        if (epicTipOverlay) {
            epicTipOverlay.remove();
            epicTipOverlay = null;
        }
    }

    // 切换满防/当前大本模式：每账号记忆；切换后重渲染主+夜两个视图
    function toggleProgressMode() {
        var tag = currentDetailTag;
        var data = tag ? state.accounts[tag] : null;
        if (!data) return;
        var next = progressMode === 'th' ? 'full' : 'th';
        saveProgressMode(tag, next);
        progressMode = next;
        var accName = (state.accountNotes && state.accountNotes[tag]) || data.tag || tag;
        renderHomeDetail(data, accName);
        renderNightDetail(data, accName);
        try { CocTool.ui.showToast(next === 'th' ? '已切换：当前大本进度' : '已切换：满防进度'); } catch (e) {}
    }

    // ===== 升级时间折扣按钮（底框：左侧图标 + 右侧折扣数）=====
    var DISCOUNT_OPTIONS = [0, 5, 10, 15, 20];
    function discountBtnHtml() {
        var pct = upgradeDiscount;
        return '<div class="ov-disc-wrap">' +
            '<button class="ov-disc-btn" onclick="CocTool.features.overview.toggleDiscountMenu()" title="升级时间折扣">' +
                '<img src="img/icons/icon_goldmodel.webp" class="ov-disc-icon" onerror="this.style.display=\'none\'">' +
                '<span class="ov-disc-val">' + pct + '%</span>' +
            '</button>' +
            '<div class="ov-disc-menu" style="display:none;">' +
                DISCOUNT_OPTIONS.map(function (p) {
                    return '<div class="ov-disc-opt' + (p === pct ? ' active' : '') + '" data-pct="' + p + '" onclick="CocTool.features.overview.setDiscount(event, ' + p + ')">' + p + '%</div>';
                }).join('') +
            '</div>' +
        '</div>';
    }
    function toggleDiscountMenu() {
        var wrap = event.target ? event.target.closest('.ov-disc-wrap') : null;
        if (!wrap) wrap = document.querySelector('.ov-disc-wrap');
        var menu = wrap ? wrap.querySelector('.ov-disc-menu') : null;
        if (!menu) return;
        var showing = menu.style.display !== 'none';
        document.querySelectorAll('.ov-disc-menu').forEach(function (m) { m.style.display = 'none'; });
        menu.style.display = showing ? 'none' : '';
        if (!showing) document.addEventListener('click', dismissDiscountMenu);
    }
    function dismissDiscountMenu(e) {
        if (e.target && e.target.closest && e.target.closest('.ov-disc-wrap')) return;
        document.querySelectorAll('.ov-disc-menu').forEach(function (m) { m.style.display = 'none'; });
        document.removeEventListener('click', dismissDiscountMenu);
    }
    function setDiscount(e, pct) {
        if (e && e.stopPropagation) e.stopPropagation();
        var tag = currentDetailTag;
        var data = tag ? state.accounts[tag] : null;
        if (!data) return;
        upgradeDiscount = pct;
        saveUpgradeDiscount(tag, pct);
        var accName = (state.accountNotes && state.accountNotes[tag]) || data.tag || tag;
        renderHomeDetail(data, accName);
        renderNightDetail(data, accName);
        try { CocTool.ui.showToast('已设置升级时间折扣 ' + pct + '%'); } catch (e2) {}
    }

    CocTool.overviewDetail = Object.freeze({ initDetail: initDetail, openDetail: openDetail, goBack: goBack, showEpicTip: showEpicTip, closeEpicTip: closeEpicTip, toggleProgressMode: toggleProgressMode });
    CocTool.features.overview = Object.freeze({
        init: function () { CocTool.overviewList.init(); },
        goBack: goBack,
        showEpicTip: showEpicTip,
        closeEpicTip: closeEpicTip,
        toggleProgressMode: toggleProgressMode,
        toggleDiscountMenu: toggleDiscountMenu,
        setDiscount: setDiscount,
        rebuildCard: CocTool.overviewList.rebuildCard,
        refreshCard: CocTool.overviewList.refreshCard
    });
})(window);
