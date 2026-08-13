(function (global) {
    'use strict';

    const CocTool = global.CocTool;
    if (!CocTool || !CocTool.state) {
        throw new Error('pokedex.js requires core.js');
    }

    const state = CocTool.state;
    const accounts = state.accounts;
    const settings = state.settings;

    // ---------- FIELD_META（全局唯一：标签/顺序/格式/枚举） ----------
    // group: basic = 基本属性区；level = 等级属性区/表格
    // 数据中存在才显示（缺失即隐藏）；未定义 label 的字段不显示
    const FIELD_META = [
        // 基本属性
        { key: 'size', label: '占地', fmt: 'size', icon: 'att_Size', group: 'basic' },
        { key: 'range', label: '攻击距离', fmt: 'range', icon: 'att_Range', group: 'basic' },
        { key: 'minRange', label: '最小射程', group: 'basic' },
        { key: 'targetType', label: '目标类型', icon: 'att_Target', group: 'basic' },
        { key: 'damageType', label: '伤害类型', enum: { single: '单个', splash: '溅射', area: '区域溅射', chain: '连锁', none: '无' }, icon: 'att_Damagetype', group: 'basic' },
        { key: 'attackSpeed', label: '攻速', icon: 'att_Attackspeed', group: 'basic' },
        { key: 'numberOfTargets', label: '目标数量', icon: 'att_Target', group: 'basic' },
        { key: 'splashRadius', label: '溅射半径', icon: 'att_DamageRadius', group: 'basic' },
        { key: 'shotsPerBurst', label: '连发数量', group: 'basic' },
        { key: 'timeBetweenBursts', label: '连发间隔', group: 'basic' },
        { key: 'triggerRange', label: '触发范围', group: 'basic' },
        { key: 'triggerRadius', label: '触发半径', group: 'basic' },
        { key: 'patrolRadius', label: '巡逻半径', group: 'basic' },
        { key: 'deathDamageRadius', label: '死亡伤害半径', group: 'basic' },
        { key: 'pushbackRange', label: '击退距离', group: 'basic' },
        { key: 'activationHousingSpace', label: '触发空间', group: 'basic' },
        { key: 'chainRange', label: '连锁范围', group: 'basic' },
        { key: 'maxChainTargets', label: '最大连锁目标', group: 'basic' },
        { key: 'numberOfRounds', label: '弹数', group: 'basic' },
        { key: 'rechargeTime', label: '充能时间', group: 'basic' },
        { key: 'poisonDuration', label: '毒药持续时间', fmt: 'sec', group: 'basic' },
        { key: 'detonationDelay', label: '引爆延迟', fmt: 'sec', group: 'basic' },
        { key: 'attackType', label: '攻击类型', icon: 'att_Damagetype', enum: {
            'Single Target': '单体', 'Single Target (Ground Only)': '单体（仅地面）',
            'Area Splash': '区域溅射', 'Area Splash (Ground Only)': '区域溅射（仅地面）',
            'Area Splash 1 and 3 tile Radius (Ground Only)': '区域溅射（1-3格，仅地面）',
            'Melee (Ground Only)': '近战（仅地面）', 'Ranged (Ground & Air)': '远程（陆空）',
            'Ranged Single Target (Any target)': '远程单体（任意目标）',
            'Chain Lightning': '连锁闪电',
            'Melee (with nearby air units)/Ranged (otherwise); (Ground & Air)': '近战/远程切换（陆空）'
        }, group: 'basic' },
        { key: 'guardianType', label: '守卫类型', enum: { longshot: '远袭', smasher: '粉碎', logger: '滚木' }, group: 'basic' },
        { key: 'housingSpace', label: '空间', icon: 'att_kj', group: 'basic' },
        { key: 'movementSpeed', label: '移速', icon: 'att_Speed', group: 'basic' },
        { key: 'preferredTarget', label: '攻击偏好', icon: 'att_Target', enum: {
            'None': '无', 'Any': '任意', 'Defenses': '防御建筑', 'Resources': '资源建筑',
            'Walls': '城墙', 'Hero': '英雄', 'Heroes': '英雄', 'Heroes and Troops': '英雄和部队',
            "Hero's Target": '英雄的目标', 'Walls (Damage x4)': '城墙（4倍伤害）',
            'Within 2.5 tiles of Hero': '英雄周围2.5格', 'Within 4.5 tiles of Hero': '英雄周围4.5格',
            'Within 7 tiles of Hero': '英雄周围7格', 'Heroes (2x Damage)': '英雄（2倍伤害）'
        }, group: 'basic' },
        { key: 'barrackLevelRequired', label: '训练营解锁等级', icon: 'att_xly', group: 'basic' },
        { key: 'spellDuration', label: '持续时间', icon: 'shijian', group: 'basic' },
        { key: 'radius', label: '范围', icon: 'att_DamageRadius', group: 'basic' },
        { key: 'damageRadius', label: '伤害半径', group: 'basic' },
        { key: 'searchRadius', label: '警戒范围', icon: 'att_Range', group: 'basic' },
        { key: 'lifetime', label: '存活时间', fmt: 'sec', group: 'basic' },
        { key: 'wallRings', label: '城墙戒指', group: 'basic' },
        { key: 'postHitRange', label: '命中后射程', group: 'basic' },
        { key: 'rarity', label: '稀有度', icon: 'att_xyd', enum: { Common: '普通', Epic: '史诗' }, group: 'basic' },
        { key: 'hero', label: '所属英雄', icon: 'hero_icon', enum: {
            'barbarian-king': '蛮王', 'archer-queen': '女王', 'grand-warden': '永王',
            'royal-champion': '闰土', 'minion-prince': '王子', 'dragon-duke': '公爵',
            'battle-machine': '战斗机器', 'battle-copter': '战斗直升机'
        }, group: 'basic' },
        { key: 'abilityType', label: '能力类型', icon: 'att_Spec', enum: { Active: '主动', Passive: '被动' }, group: 'basic' },

        // 等级属性（stats + 升级字段）
        { key: 'dps', label: '每秒伤害', table: '秒伤', icon: 'att_Damage', group: 'level' },
        { key: 'damagePerShot', label: '单次伤害', icon: 'att_Damage', group: 'level' },
        { key: 'hp', label: '生命值', table: '生命', icon: 'att_Hitpoint', group: 'level' },
        { key: 'damage', label: '伤害', icon: 'att_Damage', group: 'level' },
        { key: 'deathDamage', label: '死亡伤害', group: 'level' },
        { key: 'cost', label: '升级花费', table: '升级花费', fmt: 'cost', group: 'level' },
        { key: 'time', label: '升级时间', table: '升级时间', fmt: 'time', icon: 'shijian', group: 'level' },
        { key: 'laboratoryRequired', label: '实验室等级', icon: 'att_sys', group: 'level' },
        { key: 'townHallRequired', label: '大本营等级', group: 'level' },
        { key: 'builderHallRequired', label: '建筑大师大本营等级', group: 'level' },
        { key: 'xpGained', label: '升级经验', icon: 'att_XP', group: 'level' },
        { key: 'capacity', label: '容量', group: 'level' },
        { key: 'productionRate', label: '生产效率', group: 'level' },
        { key: 'housingSpace', label: '空间', icon: 'att_kj', group: 'level' },
        { key: 'clonedCapacity', label: '克隆单位', icon: 'att_kl', group: 'level' },
        { key: 'springCapacity', label: '弹射容量', group: 'level' },
        { key: 'duration', label: '激活时长', group: 'level' },
        { key: 'poisonLevel', label: '毒药等级', group: 'level' },
        { key: 'explosionDamage', label: '爆炸伤害', group: 'level' }
    ];

    // 英雄装备专属等级属性（stats 里的额外字段）
    // 召唤类字段统一简化为「召唤数量」（野蛮人/弓箭手/野猪骑士等木偶共用，不区分类型）
    const EQUIPMENT_LABELS = [
        { key: 'healPerCounter', label: '每次反击治疗', icon: 'att_hp+' },
        { key: 'counterDamage', label: '反击伤害', icon: 'att_Damage' },
        { key: 'hitpointIncrease', label: '生命值提升', icon: 'att_Hitpoint' },
        { key: 'hpRecoveryIncrease', label: '生命恢复', icon: 'att_hp+' },
        { key: 'hpIncreasePercent', label: '生命加成' },
        { key: 'maxHpIncrease', label: '最大生命提升%', icon: 'att_Hitpoint' },
        { key: 'maxHealthIncrease', label: '最大生命提升%', icon: 'att_Hitpoint' },
        { key: 'dpsIncrease', label: '每秒伤害提升', icon: 'att_Damage' },
        { key: 'damageIncrease', label: '伤害加成', icon: 'att_Damage' },
        { key: 'damageIncreasePercent', label: '伤害加成', icon: 'att_Damage' },
        { key: 'maxDamageIncrease', label: '最大伤害提升%', icon: 'att_Damage' },
        { key: 'damagePerShotIncrease', label: '单次伤害提升', icon: 'att_Damage' },
        { key: 'damagePerHit', label: '单次伤害', icon: 'att_Damage' },
        { key: 'abilityDamage', label: '技能伤害', icon: 'att_Damage' },
        { key: 'abilityTotalDamage', label: '技能总伤害', icon: 'att_Damage' },
        { key: 'abilityDuration', label: '技能持续时间', icon: 'shijian', fmt: 'dur' },
        { key: 'abilityAttackSpeedIncrease', label: '技能攻速提升', icon: 'att_Attackspeed' },
        { key: 'attackSpeedIncrease', label: '攻速提升%', icon: 'att_Attackspeed' },
        { key: 'movementSpeedIncrease', label: '移速提升', icon: 'att_Speed' },
        { key: 'speedIncrease', label: '移速提升', icon: 'att_Speed' },
        { key: 'attackRange', label: '攻击距离', icon: 'att_Range' },
        { key: 'damageRadius', label: '伤害半径', icon: 'att_DamageRadius', fmt: 'tiles' },
        { key: 'healingPerSecond', label: '每秒治疗', icon: 'att_hp+' },
        { key: 'selfHealingPerSecond', label: '每秒自愈', icon: 'att_hp+' },
        { key: 'healPerHit', label: '每次攻击治疗量', icon: 'att_hp+' },
        { key: 'healthRecovery', label: '生命恢复', icon: 'att_Hitpoint' },
        { key: 'damageReductionIncrease', label: '伤害减免%', icon: 'att_hp-' },
        { key: 'incomingDamageReduction', label: '受到的伤害减免', icon: 'att_frost' },
        { key: 'slowDown', label: '减速', icon: 'att_frost' },
        { key: 'slowDownDuration', label: '减速持续时间', icon: 'shijian', fmt: 'dur' },
        { key: 'slowDownPercent', label: '减速百分比', icon: 'att_frost' },
        { key: 'stunDuration', label: '眩晕持续时间', icon: 'shijian', fmt: 'dur' },
        { key: 'numberOfAttacks', label: '攻击次数', icon: 'cishu' },
        { key: 'numberOfTargets', label: '目标数量', icon: 'att_Target' },
        { key: 'projectileDamage', label: '弹道伤害', icon: 'att_Damage' },
        { key: 'projectileDamagePerTarget', label: '每次反弹伤害', icon: 'att_Damage' },
        { key: 'auraDps', label: '光环伤害', icon: 'att_DamageRadius' },
        { key: 'auraDamagePerHit', label: '光环单次伤害', icon: 'att_Damage' },
        { key: 'cooldownTime', label: '冷却时间', icon: 'shijian', fmt: 'dur' },
        { key: 'damageOnDefeat', label: '阵亡伤害' },
        { key: 'buildingDamagePercent', label: '对建筑伤害%', icon: 'att_hp-' },
        { key: 'troopDamagePercent', label: '对兵种伤害%', icon: 'att_hp-' },
        { key: 'barbarianDamageIncrease', label: '野蛮人伤害加成', icon: 'att_Damage' },
        { key: 'barbarianSpeedIncrease', label: '野蛮人移速加成', icon: 'att_Speed' },
        { key: 'clones', label: '克隆数量' },
        { key: 'cloneDps', label: '克隆秒伤' },
        { key: 'cloneHealth', label: '克隆生命' },
        { key: 'cloneDuration', label: '克隆持续时间', fmt: 'dur' },
        { key: 'summonedBarbarians', label: '召唤数量', icon: 'att_kl' },
        { key: 'summonedArchers', label: '召唤数量', icon: 'att_kl' },
        { key: 'summonedHogRiders', label: '召唤数量', icon: 'att_kl' },
        { key: 'summonedHealers', label: '召唤数量', icon: 'att_kl' },
        { key: 'summonedLavaloons', label: '召唤数量', icon: 'att_kl' },
        { key: 'maxSummonedSnakes', label: '召唤数量', icon: 'att_kl' },
        { key: 'snakeLevel', label: '召唤单位等级', icon: 'att_zhdj' },
        { key: 'healerLevel', label: '召唤单位等级', icon: 'att_zhdj' },
        { key: 'giantGiantLevel', label: '召唤单位等级', icon: 'att_zhdj' },
        { key: 'hogRiderLevel', label: '召唤单位等级', icon: 'att_zhdj' },
        { key: 'lavaloonLevel', label: '召唤单位等级', icon: 'att_zhdj' },
        { key: 'henchmenLevel', label: '召唤单位等级', icon: 'att_zhdj' },
        { key: 'archerInvisibilityDuration', label: '弓箭手隐身时长', fmt: 'dur' },
        { key: 'blacksmithLevelRequired', label: '铁匠铺等级', icon: 'att_tjp' },
        { key: 'upgradeShinyOre', label: '蓝矿', icon: 'Shiny_Ore' },
        { key: 'upgradeGlowingOre', label: '紫矿', icon: 'Glowy_Ore' },
        { key: 'upgradeStarryOre', label: '黄矿', icon: 'Starry_Ore' }
    ];

    function buildLevelMeta() {
        return FIELD_META.filter(f => f.group === 'level').concat(EQUIPMENT_LABELS);
    }

    // 属性类顶层透传字段白名单（静态属性，参与基本属性收集）
    const STATIC_TOP_FIELDS = [
        'preferredTarget', 'barrackLevelRequired', 'darkBarrackLevelRequired',
        'spellFactoryLevelRequired', 'workshopLevelRequired', 'builderBarracksRequired',
        'petHouseLevelRequired', 'heroHallLevelRequired', 'blacksmithLevelRequired',
        'spellType', 'troopType', 'attackType', 'guardianType', 'lifetime',
        'triggerRadius', 'damageRadius', 'searchRadius', 'wallRings', 'postHitRange',
        'summonCooldown', 'rageSpeedIncrease', 'numberOfTargets', 'auraRange',
        'favoriteTarget', 'springCapacity', 'aoeRadius', 'pushDistance',
        'triggerHousingSpace', 'workRate', 'recruitmentCost',
        'rarity', 'hero', 'abilityType', 'unlockRequirement'
    ];

    const RES_CN = { 'Elixir': '圣水', 'Gold': '金币', 'Dark Elixir': '暗黑重油', 'Builder Elixir': '夜圣水', 'Builder Gold': '夜金币', 'Gems': '宝石' };

    // 资源类型 → 图标（costResource 动态取图，组合类型取首资源）
    const RES_ICON = {
        'Gold': 'Gold', 'Elixir': 'Elixir', 'Dark Elixir': 'Dark_Elixir', 'DarkElixir': 'Dark_Elixir',
        'Builder Gold': 'Gold2', 'Builder Elixir': 'Elixir2', 'Gems': 'Gem', 'Diamonds': 'Gem'
    };
    // 大本营等级 → 统一建筑图标（主世界/夜世界一致，不做等级区服）
    function iconForField(f, v) {
        if (f.key === 'cost' && v && v.res) {
            const res = String(v.res).split(' or ')[0].trim();
            return RES_ICON[res] || 'info';
        }
        if (f.key === 'townHallRequired' || f.key === 'builderHallRequired') return 'att_bulid';
        return f.icon || 'info';
    }

    // ---------- DOM ----------
    function el(id) { return document.getElementById(id); }
    const els = {
        page: () => el('pokedex-detail-page'),
        title: () => el('pokedex-title'),
        basic: () => el('pokedex-basic'),
        abilitySwitch: () => el('pokedex-ability-switch'),
        lvSecTitle: () => el('pokedex-lv-title'),
        slider: () => el('pokedex-slider'),
        lvLabel: () => el('pokedex-lv-label'),
        level: () => el('pokedex-level'),
        thead: () => el('pokedex-thead'),
        tbody: () => el('pokedex-tbody'),
        backBtn: () => el('pokedex-back'),
        refreshBtn: () => el('pokedex-refresh')
    };

    let currentEntity = null;
    let currentAbility = null;
    let accountLevel = 1;   // 打开图鉴时的账号等级（标题固定值，滑块变化不影响）
    let accountModules = null;   // 精工形态的模块等级数组（[lvl,...]，与 abilities 顺序对应，各 tab 定位用）
    let forceReload = false;    // 刷新按钮：强制绕过浏览器缓存重新拉取

    // ---------- 格式化 ----------
    function fmtTime(t) {
        if (!t) return '—';
        const d = t.days || 0, h = t.hours || 0, m = t.minutes || 0, s = t.seconds || 0;
        const parts = [];
        if (d) parts.push(d + '天');
        if (h) parts.push(h + '时');
        if (m) parts.push(m + '分');
        if (s) parts.push(s + '秒');
        return parts.length ? parts.join('') : '0秒';
    }
    function fmtCost(v) {
        if (v === undefined || v === null) return '—';
        // 资源名不显示（后续用图标示意，costResource 保留在数据中）
        // ≥1 万缩写为 Xw（1 位小数），低于 1 万正常显示
        if (v >= 10000) {
            const w = Math.round((v / 10000) * 10) / 10;
            return (w % 1 === 0 ? String(w) : w.toFixed(1)) + 'w';
        }
        return v.toLocaleString();
    }
    function fmtTiles(v) {
        if (typeof v === 'string') {
            const m = v.match(/^([\d.]+)\s*tiles?$/i);
            if (m) return m[1] + '格';
        }
        return v;
    }
    function fmtDur(v) {
        if (typeof v === 'number') return v + '秒';
        if (typeof v === 'string') {
            const m = v.match(/^([\d.]+)s$/i);
            if (m) {
                let n = m[1];
                if (n.endsWith('.0')) n = n.slice(0, -2);
                return n + '秒';
            }
        }
        return v;
    }
    function formatValue(v, fmt) {
        if (fmt === 'time') return fmtTime(v);
        if (fmt === 'sec') return v + '秒';
        if (fmt === 'size' && typeof v === 'string') return v === 'N/A' ? '—' : v.replace('x', '×');
        if (fmt === 'cost') return fmtCost(v.v, v.res);
        if (fmt === 'dur') return fmtDur(v);
        if (fmt === 'tiles') return fmtTiles(v);
        return v;
    }
    function enumVal(v, table) {
        return (table && v !== undefined && table[v] !== undefined) ? table[v] : v;
    }

    // ---------- 数据收集（数据驱动） ----------
    // 静态属性：traits ∪ modes.normal（建筑/守卫统一结构）∪ 属性白名单顶层字段
    function collectStatic(entity) {
        const out = {};
        if (entity.traits) Object.assign(out, entity.traits);
        if (entity.modes && entity.modes.normal) Object.assign(out, entity.modes.normal);
        STATIC_TOP_FIELDS.forEach(k => {
            if (entity[k] !== undefined) out[k] = entity[k];
        });
        return out;
    }
    // 等级属性：stats ∪ 升级字段（费用已统一 cost/costResource，时间统一 time）
    function collectLevel(lv) {
        const out = {};
        if (lv.stats) Object.assign(out, lv.stats);
        Object.keys(lv).forEach(k => {
            if (k !== 'stats' && k !== 'level') out[k] = lv[k];
        });
        out.cost = (lv.cost !== undefined) ? { v: lv.cost, res: lv.costResource } : undefined;
        // 产物已统一时间字段为 time（buildTime/researchTime/upgradeTime → time），保留旧字段兜底
        out.time = (lv.time !== undefined) ? lv.time
            : (lv.buildTime !== undefined) ? lv.buildTime
            : (lv.researchTime !== undefined) ? lv.researchTime
            : lv.upgradeTime;
        return out;
    }

    // ---------- 渲染 ----------
    function renderBasic(entity) {
        const staticData = collectStatic(entity);
        let html = '';
        FIELD_META.forEach(f => {
            if (f.group !== 'basic') return;
            let v = staticData[f.key];
            if (v === undefined || v === null) return;
            if (f.enum) v = enumVal(v, f.enum);
            if (f.key === 'range' && staticData.minRange !== undefined && staticData.minRange > 0) {
                v = staticData.minRange + '-' + v;
            }
            v = formatValue(v, f.fmt);
            html += '<div class="item basic-item">' +
                '<img class="basic-icon" src="img/icons/' + iconForField(f, staticData[f.key]) + '.webp" alt="">' +
                '<div class="basic-text"><span class="k">' + f.label + '</span><span class="v">' + v + '</span></div>' +
                '</div>';
        });
        els.basic().innerHTML = html;
    }

    // 解锁数量表：大本等级 × 解锁数量（availablePerTownHall / availablePerBuilderHall）
    function renderAvailability(entity) {
        const sec = el('pokedex-apt-sec');
        if (!sec) return;
        const apt = entity.availablePerTownHall || entity.availablePerBuilderHall;
        if (!apt || !apt.length) {
            sec.style.display = 'none';
            return;
        }
        const isBh = !!entity.availablePerBuilderHall && !entity.availablePerTownHall;
        let head = '<tr><th>' + (isBh ? '夜大本等级' : '大本等级') + '</th>';
        let row = '<tr><td>解锁数量</td>';
        apt.forEach(a => {
            head += '<th>' + (isBh ? a.builderHallLevel : a.townHallLevel) + '</th>';
            row += '<td>' + a.count + '</td>';
        });
        head += '</tr>';
        row += '</tr>';
        el('pokedex-apt-thead').innerHTML = head;
        el('pokedex-apt-tbody').innerHTML = row;
        sec.style.display = '';
    }

    function renderAbilitySwitch(entity) {        const tabs = [];
        const hasAbility = (entity.abilities || []).length > 0;
        if (entity.levels.length && hasAbility) tabs.push({ type: 'entity', name: '本体' });
        (entity.abilities || []).forEach((ab, i) => {
            tabs.push({ type: 'ability', idx: i, name: ab.name });
        });
        const box = els.abilitySwitch();
        if (!tabs.length) {
            box.style.display = 'none';
            currentAbility = null;
            box._tabs = [];
            return;
        }
        box.style.display = '';
        let html = '';
        tabs.forEach((t, i) => {
            html += '<button class="e-btn" data-tab="' + i + '"' + (i === 0 ? ' style="border-color:var(--accent);color:var(--accent);"' : '') + '>' + t.name + '</button>';
        });
        box.innerHTML = html;
        const first = tabs[0];
        currentAbility = first.type === 'ability' ? entity.abilities[first.idx] : null;
        box._tabs = tabs;
    }

    function renderLevel(lv) {
        const d = collectLevel(lv);
        let html = '';
        buildLevelMeta().forEach(f => {
            const v = d[f.key];
            if (v === undefined || v === null) return;
            html += '<div class="item basic-item">' +
                '<img class="basic-icon" src="img/icons/' + iconForField(f, v) + '.webp" alt="">' +
                '<div class="basic-text"><span class="k">' + f.label + '</span><span class="v">' + formatValue(v, f.fmt) + '</span></div>' +
                '</div>';
        });
        els.level().innerHTML = html;
    }

    // 等级表格表头图标白名单（用户确认无歧义字段）：时间/花费/升级经验/各类建筑等级；其余列保留文字表头
    const TH_ICON = {
        time: 'shijian',
        xpGained: 'att_XP',
        townHallRequired: 'att_bulid',
        builderHallRequired: 'att_bulid',
        laboratoryRequired: 'att_sys',
        barrackLevelRequired: 'att_xly',
        spellFactoryLevelRequired: 'att_fsgc',
        petHouseLevelRequired: 'att_pets',
        blacksmithLevelRequired: 'att_tjp'
    };
    // 返回表头图标 HTML；无图标字段返回 null（调用方回退文字）
    function thIconHtml(f, levels) {
        let icon = TH_ICON[f.key];
        if (f.key === 'cost') {
            // 按该实体各等级出现最多的资源类型动态取图（组合类型取首资源）
            const resCount = {};
            levels.forEach(lv => {
                const c = collectLevel(lv).cost;
                if (c && c.res) {
                    const r = String(c.res).split(' or ')[0].trim();
                    resCount[r] = (resCount[r] || 0) + 1;
                }
            });
            let best = null, bestN = 0;
            for (const r in resCount) {
                if (resCount[r] > bestN) { best = r; bestN = resCount[r]; }
            }
            icon = best ? (RES_ICON[best] || 'info') : 'info';
        }
        if (!icon) return null;
        return '<img class="th-icon" src="img/icons/' + icon + '.webp" alt="">';
    }

    function renderTable(levels) {
        const present = {};
        levels.forEach(lv => {
            const d = collectLevel(lv);
            buildLevelMeta().forEach(f => {
                if (d[f.key] !== undefined && d[f.key] !== null) present[f.key] = true;
            });
        });
        const cols = buildLevelMeta().filter(f => present[f.key]);
        // 升级时间/升级花费排在最前两列（等级列之后），其余保持 FIELD_META 顺序
        const PRIORITY = { time: 0, cost: 1 };
        cols.sort((a, b) => {
            const pa = PRIORITY[a.key] !== undefined ? PRIORITY[a.key] : 2;
            const pb = PRIORITY[b.key] !== undefined ? PRIORITY[b.key] : 2;
            return pa - pb;
        });

        let head = '<tr><th>等级</th>';
        cols.forEach(f => {
            const ic = thIconHtml(f, levels);
            head += '<th title="' + (f.table || f.label) + '">' + (ic || (f.table || f.label)) + '</th>';
        });
        head += '</tr>';
        els.thead().innerHTML = head;

        const cur = Number(els.slider().value) || 1;
        let body = '';
        let scIdx = 0;   // 充能序号（supercharge 条目按数组顺序编号，level 字段恒为 1）
        levels.forEach((lv, i) => {
            const d = collectLevel(lv);
            const isSc = !!(lv.stats && lv.stats.supercharge);
            if (isSc) scIdx++;
            const lvCell = isSc
                ? '<img class="lv-icon" src="img/icons/Icon_Supercharge.webp" alt="">' + scIdx
                : String(lv.level);
            let row = '<tr' + (i + 1 === cur ? ' class="cur"' : '') + '><td>' + lvCell + '</td>';
            cols.forEach(f => {
                const v = d[f.key];
                row += '<td>' + ((v === undefined || v === null) ? '—' : formatValue(v, f.fmt)) + '</td>';
            });
            row += '</tr>';
            body += row;
        });
        els.tbody().innerHTML = body;
    }

    function renderLevelData(entity, ability) {
        const maxLv = ability ? ability.levels.length : entity.levels.length;
        if (!maxLv) {
            els.slider().disabled = true;
            els.slider().value = 1;
            els.lvLabel().textContent = '—';
            els.level().innerHTML = '<div class="item" style="grid-column:1/-1;color:var(--text-sub);">该实体无等级数据</div>';
            els.thead().innerHTML = '';
            els.tbody().innerHTML = '<tr><td style="padding:16px;color:var(--text-sub);">该实体无等级数据</td></tr>';
            return;
        }
        els.slider().disabled = false;
        els.slider().max = maxLv;
        let cur = Number(els.slider().value) || 1;
        if (cur > maxLv) cur = maxLv;
        if (cur < 1) cur = 1;
        els.slider().value = cur;
        els.lvLabel().textContent = cur;
        updateLvTitle();
        const levels = ability ? ability.levels : entity.levels;
        renderLevel(levels[cur - 1]);
        renderTable(levels);
    }

    // 标题里的「当前：X级」固定为打开图鉴时的账号等级，不随滑块变化
    function updateLvTitle() {
        const title = '等级属性（当前：' + accountLevel + '级）' + (currentAbility ? ' · ' + currentAbility.name : '');
        els.lvSecTitle().textContent = title;
    }

    function render(entity, curLevel, modules) {
        currentEntity = entity;
        accountLevel = curLevel || 1;
        accountModules = modules || null;
        els.title().textContent = entity.name;
        renderBasic(entity);
        renderAvailability(entity);
        renderAbilitySwitch(entity);
        const tabs = els.abilitySwitch()._tabs || [];
        if (tabs.length && tabs[0].type === 'ability') {
            currentAbility = entity.abilities[tabs[0].idx];
        } else {
            currentAbility = null;
        }
        const maxLv = currentAbility ? currentAbility.levels.length : entity.levels.length;
        if (maxLv) els.slider().max = maxLv;
        // 精工形态：滑块定位到当前模块等级（abilities 顺序 = 模块顺序）
        els.slider().value = currentModuleLevel(tabs);
        renderLevelData(entity, currentAbility);
    }

    // 精工形态当前 tab 对应的模块等级（无模块信息返回账号等级）
    function currentModuleLevel(tabs) {
        if (accountModules && accountModules.length && tabs) {
            for (let i = 0; i < tabs.length; i++) {
                if (tabs[i].type === 'ability') {
                    const v = Number(accountModules[tabs[i].idx]) || 1;
                    if (v > 0) return v;
                    break;
                }
            }
        }
        return accountLevel || 1;
    }

    // ---------- 数据加载 ----------
    // 数据源优先级：Android assets（readAsset 桥接）→ 服务器（网页版/网页测试）→ 本地相对路径（开发兜底）
    // 服务器方案：game-data-normalized 部署在 coctool.top/icons_webp/ 下（跨域需服务器返回 CORS 头）
    const SERVER_DATA_BASE = 'https://coctool.top/icons_webp/game-data-normalized';
    const indexCache = {};

    function fetchJson(urls, cb, cacheOpt) {
        let i = 0;
        const tryNext = () => {
            if (i >= urls.length) { cb(null); return; }
            const opts = cacheOpt ? { cache: cacheOpt } : undefined;
            fetch(urls[i++], opts)
                .then(r => { if (!r.ok) throw new Error('nf'); return r.json(); })
                .then(d => cb(d))
                .catch(tryNext);
        };
        tryNext();
    }

    function loadIndex(server, cb) {
        if (indexCache[server]) { cb(indexCache[server]); return; }
        const done = idx => { indexCache[server] = idx; cb(idx); };
        if (window.AndroidApp && window.AndroidApp.readAsset) {
            try {
                const text = window.AndroidApp.readAsset('data/pokedex/' + server + '/index.json');
                if (text) { done(JSON.parse(text)); return; }
            } catch (e) { /* fallthrough */ }
        }
        // 默认 no-cache（条件请求 304，代价极低）；刷新按钮触发 reload（强制绕过浏览器缓存）
        // 服务器 URL 带时间戳：nginx expires 30d immutable 会无视 no-cache，需 cache-bust 使数据更新立即生效
        const ts = Date.now();
        fetchJson([
            SERVER_DATA_BASE + '/' + server + '/index.json?_t=' + ts,
            'game-data-normalized/' + server + '/index.json',
            '../../../game-data-normalized/' + server + '/index.json'
        ], done, forceReload ? 'reload' : 'no-cache');
    }

    function getEntityData(server, id, cb) {
        if (!indexCache[server]) { cb(null); return; }
        const rel = indexCache[server][String(id)];
        if (!rel) { cb(null); return; }
        if (window.AndroidApp && window.AndroidApp.readAsset) {
            try {
                const text = window.AndroidApp.readAsset('data/pokedex/' + server + '/' + rel + '/' + id + '.json');
                if (text) { cb(JSON.parse(text)); return; }
            } catch (e) { /* fallthrough */ }
        }
        fetchJson([
            SERVER_DATA_BASE + '/' + server + '/' + rel + '/' + id + '.json?_t=' + Date.now(),
            'game-data-normalized/' + server + '/' + rel + '/' + id + '.json',
            '../../../game-data-normalized/' + server + '/' + rel + '/' + id + '.json'
        ], cb, forceReload ? 'reload' : 'no-cache');
    }

    function currentServer(tag) {
        const data = accounts[tag || state.currentAccount];
        return data && data._server === 'cn' ? 'cn' : 'intl';
    }

    // ---------- 对外接口 ----------
    let currentTag = null;  // 打开图鉴时所属账号 tag（详情页账号，可能与 currentAccount 不同）

    // 刷新按钮旋转动画（点击实感）：加载期间图标旋转，完成后停止
    function setSpinning(on) {
        const btn = els.refreshBtn();
        const icon = btn && btn.querySelector('i');
        if (icon) icon.classList.toggle('pokedex-spin', !!on);
    }
    function resetReload() {
        forceReload = false;
        setSpinning(false);
    }

    // index 无该 id 时的直连回退：按 ID 前缀推断已知类别路径（新增实体但 index 未更新的过渡期兜底）
    function tryKnownCategory(server, id, finish, onFail) {
        const idStr = String(id);
        // ID 前缀 → 类别目录（与 game-data-normalized/{server}/home|builder/{category} 对应）
        const CATEGORY_BY_PREFIX = [
            ['900', 'hero-equipment'], ['106', 'hero-equipment'],
            ['280', 'hero'], ['730', 'pet'], ['107', 'guardian'],
            ['400', 'troop'], ['SUPER_400', 'troop'], ['260', 'spell'],
            ['120', 'trap'], ['100', 'army'], ['103', 'crafted-defense'],
            ['152', 'crafted-defense'], ['151', 'crafted-defense'], ['102', 'crafted-defense']
        ];
        let rel = null;
        for (const [prefix, cat] of CATEGORY_BY_PREFIX) {
            if (idStr.indexOf(prefix) === 0) { rel = 'home/' + cat; break; }
        }
        // 防御建筑（10000xx 在 defense）、建筑（defense/army/resource/other）等按常见分类尝试
        if (!rel) {
            if (/^10000(0[1-9]|[1-9]\d)/.test(idStr)) rel = 'home/defense';
            else if (/^1000/.test(idStr)) rel = 'home/army';
            else rel = 'home/' + (idStr.startsWith('10') && !idStr.startsWith('10000') ? 'other' : 'army');
        }
        // readAsset 优先，再服务器，再本地相对路径
        if (window.AndroidApp && window.AndroidApp.readAsset) {
            try {
                const text = window.AndroidApp.readAsset('data/pokedex/' + server + '/' + rel + '/' + id + '.json');
                if (text) { finish(JSON.parse(text)); return; }
            } catch (e) { /* fallthrough */ }
        }
        fetchJson([
            SERVER_DATA_BASE + '/' + server + '/' + rel + '/' + id + '.json?_t=' + Date.now(),
            'game-data-normalized/' + server + '/' + rel + '/' + id + '.json',
            '../../../game-data-normalized/' + server + '/' + rel + '/' + id + '.json'
        ], entity => {
            if (entity) finish(entity);
            else if (onFail) onFail();
        }, forceReload ? 'reload' : 'no-cache');
    }

    function open(id, curLevel, tag, modules) {
        currentTag = tag || state.currentAccount;
        const server = currentServer(currentTag);
        const finish = entity => {
            resetReload();
            if (!entity) return;
            render(entity, curLevel || 1, modules);
            const page = els.page();
            page.style.display = 'flex';
            page.classList.remove('hidden');
        };
        loadIndex(server, idx => {
            if (!idx) { resetReload(); return; }   // 本服数据加载失败：不静默跨服（避免国服账号显示国际服数据）
            if (idx[String(id)]) {
                getEntityData(server, id, finish);
                return;
            }
            // 本服索引无此实体：可能服务器 index.json 滞后于实体文件（新增实体只传了实体没更新索引）
            // → 强制刷新索引重试一次（no-cache 已被浏览器 304 缓存时无效，用 reload 绕过）
            const retryIndex = () => {
                forceReload = true;
                delete indexCache[server];
                loadIndex(server, idx2 => {
                    forceReload = false;
                    if (!idx2) { resetReload(); return; }
                    if (idx2[String(id)]) {
                        getEntityData(server, id, finish);
                        return;
                    }
                    tryKnownCategory(server, id, finish, () => {
                        // 直连也失败：账号 _server 判定错误 / 装备 ID 属于另一服 → 尝试另一服
                        const alt = server === 'cn' ? 'intl' : 'cn';
                        loadIndex(alt, altIdx => {
                            if (!altIdx || !altIdx[String(id)]) { resetReload(); return; }
                            getEntityData(alt, id, finish);
                        });
                    });
                });
            };
            if (!forceReload) { retryIndex(); return; }
            forceReload = false;
            tryKnownCategory(server, id, finish, () => {
                const alt = server === 'cn' ? 'intl' : 'cn';
                loadIndex(alt, altIdx => {
                    if (!altIdx || !altIdx[String(id)]) { resetReload(); return; }
                    getEntityData(alt, id, finish);
                });
            });
        });
    }
    // 刷新：清除本服索引缓存并强制绕过浏览器缓存（cache:'reload'）重新拉取当前实体
    function refresh() {
        const id = currentEntity && currentEntity.id;
        if (!id) return;
        forceReload = true;
        setSpinning(true);
        const server = currentServer(currentTag);
        delete indexCache[server];
        open(id, accountLevel, currentTag);
    }

    function close() {
        const page = els.page();
        page.style.display = 'none';
        page.classList.add('hidden');
        currentEntity = null;
        currentAbility = null;
    }

    function goBack() {
        close();
        return true;
    }

    // ---------- 事件绑定 ----------
    function init() {
        const back = els.backBtn();
        if (back) back.addEventListener('click', close);
        const refreshBtn = els.refreshBtn();
        if (refreshBtn) refreshBtn.addEventListener('click', refresh);
        const slider = els.slider();
        // 统一应用滑块等级（clamp 1..maxLv）：更新滑块/标签/顶部等级卡片/表格行高亮
        function applySliderLv(lv) {
            if (!currentEntity) return;
            const levels = currentAbility ? currentAbility.levels : currentEntity.levels;
            if (!levels.length) return;
            lv = Math.min(Math.max(Math.round(lv) || 1, 1), levels.length);
            slider.value = lv;
            els.lvLabel().textContent = lv;
            renderLevel(levels[lv - 1]);
            const rows = els.tbody().querySelectorAll('tr');
            rows.forEach((r, i) => { r.classList.toggle('cur', i === lv - 1); });
        }
        slider.addEventListener('input', () => applySliderLv(Number(slider.value)));
        // 微调按钮：英雄上百级滑块难以精确控制
        const minus = el('pokedex-lv-minus');
        const plus = el('pokedex-lv-plus');
        if (minus) minus.addEventListener('click', () => applySliderLv(Number(slider.value) - 1));
        if (plus) plus.addEventListener('click', () => applySliderLv(Number(slider.value) + 1));
        const box = els.abilitySwitch();
        box.addEventListener('click', ev => {
            const btn = ev.target.closest('.e-btn');
            if (!btn || !currentEntity) return;
            const tabs = box._tabs || [];
            const idx = Number(btn.getAttribute('data-tab'));
            const t = tabs[idx];
            if (!t) return;
            currentAbility = t.type === 'ability' ? currentEntity.abilities[t.idx] : null;
            box.querySelectorAll('.e-btn').forEach((b, i) => {
                b.style.borderColor = i === idx ? 'var(--accent)' : '';
                b.style.color = i === idx ? 'var(--accent)' : '';
            });
            // 精工形态：切换 tab 时滑块定位到对应模块等级
            if (t.type === 'ability' && accountModules && accountModules.length) {
                const mv = Number(accountModules[t.idx]) || 1;
                if (mv > 0) els.slider().value = mv;
            } else {
                els.slider().value = accountLevel || 1;
            }
            renderLevelData(currentEntity, currentAbility);
        });
    }

    init();

    CocTool.features = CocTool.features || {};
    CocTool.features.pokedex = Object.freeze({ open, close, goBack });
})(window);
