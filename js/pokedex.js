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
        { key: 'stunTime', label: '眩晕时间', icon: 'att_xy', fmt: 'sec', group: 'basic' },
        { key: 'detonationDelay', label: '引爆延迟', fmt: 'sec', group: 'basic' },
        { key: 'attackType', label: '攻击类型', icon: 'att_Damagetype', enum: {
            'Single Target': '单体', 'Single Target (Ground Only)': '单体（仅地面）',
            'Area Splash': '区域溅射', 'Area Splash (Ground Only)': '区域溅射（仅地面）',
            'Area Splash 1 and 3 tile Radius (Ground Only)': '区域溅射（1-3格，仅地面）',
            'Melee (Ground Only)': '近战（仅地面）', 'Ranged (Ground & Air)': '远程（陆空）',
            'Ranged Single Target (Any target)': '远程单体（任意目标）',
            'Chain Lightning': '连锁闪电',
            'Air': '空中',
            'Melee (with nearby air units)/Ranged (otherwise); (Ground & Air)': '近战/远程切换（陆空）'
        }, group: 'basic' },
        { key: 'guardianType', label: '守卫类型', enum: { longshot: '远袭', smasher: '粉碎', logger: '滚木' }, group: 'basic' },
        { key: 'housingSpace', label: '空间', icon: 'att_kj', group: 'basic' },
        { key: 'movementSpeed', label: '移速', icon: 'att_Speed', group: 'basic' },
        { key: 'preferredTarget', label: '攻击偏好', icon: 'att_Target', group: 'basic' },
        { key: 'barrackLevelRequired', label: '训练营解锁等级', icon: 'att_xly', group: 'basic' },
        { key: 'spellDuration', label: '持续时间', icon: 'shijian', fmt: 'sec', group: 'basic' },
        { key: 'evolveTime', label: '变身时间', icon: 'shijian', fmt: 'sec', group: 'basic' },
        { key: 'spellDuration', label: '持续时间', table: '持续时间', icon: 'shijian', fmt: 'sec', group: 'level' },
        { key: 'angerDuration', label: '激怒时间', table: '激怒时间', icon: 'shijian', fmt: 'sec', group: 'level' },
        { key: 'radius', label: '范围', icon: 'att_DamageRadius', group: 'basic' },
        { key: 'radius', label: '范围', table: '范围', icon: 'att_DamageRadius', group: 'level' },
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
        { key: 'damageVsWalls', label: '对墙伤害', icon: 'att_Damage', group: 'level' },
        { key: 'hp', label: '生命值', table: '生命', icon: 'att_Hitpoint', group: 'level' },
        { key: 'damage', label: '伤害', icon: 'att_Damage', group: 'level' },
        { key: 'totalHealing', label: '部队总治疗量', table: '部队总治疗', icon: 'att_hp+', group: 'level' },
        { key: 'totalHealingOnHeroes', label: '英雄总治疗量', table: '英雄总治疗', icon: 'att_herohp+', group: 'level' },
        { key: 'deathDamage', label: '死亡伤害', icon: 'att_Deathdamage', group: 'level' },
        { key: 'cost', label: '升级花费', table: '升级花费', fmt: 'cost', group: 'level' },
        { key: 'time', label: '升级时间', table: '升级时间', fmt: 'time', icon: 'shijian', group: 'level' },
        { key: 'laboratoryRequired', label: '实验室等级', icon: 'att_sys', group: 'level' },
        { key: 'townHallRequired', label: '大本营等级', group: 'level' },
        { key: 'builderHallRequired', label: '建筑大师大本营等级', group: 'level' },
        { key: 'heroHallLevelRequired', label: '英雄殿堂等级', icon: 'att_yxdt', group: 'level' },
        { key: 'xpGained', label: '升级经验', icon: 'att_XP', group: 'level' },
        { key: 'capacity', label: '容量', group: 'level' },
        { key: 'productionRate', label: '生产效率', group: 'level' },
        { key: 'housingSpace', label: '空间', icon: 'att_kj', group: 'level' },
        { key: 'clonedCapacity', label: '克隆单位', icon: 'att_kl', group: 'level' },
        { key: 'recalledCapacity', label: '可召回部队数量', table: '可召回部队', icon: 'att_kj', group: 'level' },
        { key: 'heroHealPercent', label: '复活后生命值%', table: '复活生命', icon: 'att_herohp+', group: 'level' },
        { key: 'clonedLifespan', label: '复制体存活时长', icon: 'shijian', fmt: 'sec', group: 'basic' },
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
        { key: 'damageOverTime', label: '持续伤害', table: '持续伤害', icon: 'att_dy', group: 'level' },
        { key: 'speedDecrease', label: '速度降低%', table: '速度降低', icon: 'att_frost', group: 'level' },
        { key: 'attackRateDecrease', label: '攻速降低%', table: '攻速降低', icon: 'att_Attackspeed', group: 'level' },
        { key: 'damageIncrease', label: '伤害加成%', icon: 'att_Damage' },
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
        { key: 'healingPerSecond', label: '每秒治疗量', icon: 'att_hp+' },
        { key: 'healingPerPulse', label: '每次治疗量', icon: 'att_hp+' },
        { key: 'healingPerSecondOnHeroes', label: '英雄每秒治疗量', icon: 'att_herohp+' },
        { key: 'healingPerPulseOnHeroes', label: '英雄每次治疗量', icon: 'att_herohp+' },
        { key: 'selfHealingPerSecond', label: '每秒自愈', icon: 'att_hp+' },
        { key: 'healPerHit', label: '每次攻击治疗量', icon: 'att_hp+' },
        { key: 'healthRecovery', label: '生命恢复', icon: 'att_Hitpoint' },
        { key: 'damageReductionIncrease', label: '伤害减免%', icon: 'att_hp-' },
        { key: 'incomingDamageReduction', label: '伤害减免%', icon: 'att_hp-' },
        { key: 'extraDamageUnder180', label: '额外伤害(<180)', icon: 'att_Damage' },
        { key: 'extraDamage180to250', label: '额外伤害(180-250)', icon: 'att_Damage' },
        { key: 'extraDamageOver250', label: '额外伤害(251+)', icon: 'att_Damage' },
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
        { key: 'summoned', label: '召唤数量', icon: 'att_kl' },
        { key: 'summonedPerSummon', label: '每次召唤数量', table: '每次召唤', icon: 'att_kl', group: 'level' },
        { key: 'maxSummoned', label: '最大召唤数量', table: '最大召唤', icon: 'att_kl', group: 'level' },
        { key: 'barrelCount', label: '召唤次数', table: '召唤次数', icon: 'att_kl', group: 'level' },
        { key: 'summonedGiants', label: '巨人数量', table: '巨人', icon: 'att_kl', group: 'level' },
        { key: 'summonedBarbarians', label: '野蛮人数量', table: '野蛮人', icon: 'att_kl', group: 'level' },
        { key: 'summonedArchers', label: '弓箭手数量', table: '弓箭手', icon: 'att_kl', group: 'level' },
        { key: 'summonedWallBreakers', label: '炸弹人数量', table: '炸弹人', icon: 'att_kl', group: 'level' },
        { key: 'summonedMinions', label: '亡灵数量', table: '亡灵', icon: 'att_kl', group: 'level' },
        { key: 'summonedBalloons', label: '气球数量', table: '气球', icon: 'att_kl', group: 'level' },
        { key: 'summonedBabyDragons', label: '飞龙数量', table: '飞龙', icon: 'att_kl', group: 'level' },
        { key: 'summonedLevel', label: '召唤单位等级', icon: 'att_zhdj' },
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
        'rarity', 'hero', 'abilityType', 'unlockRequirement',
        'stunTime', 'spellDuration', 'clonedLifespan', 'evolveTime'
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
        // 等级区间：两个原生 range 叠放（起点在下、终点在上）+ 两个数值标签 + 区间填充
        sliderStart: () => el('pokedex-slider-start'),
        sliderEnd: () => el('pokedex-slider-end'),
        lvStart: () => el('pokedex-lv-start'),
        lvEnd: () => el('pokedex-lv-end'),
        rangeBox: () => el('pokedex-range'),
        rangeFill: () => el('pokedex-range-fill'),
        level: () => el('pokedex-level'),
        thead: () => el('pokedex-thead'),
        tbody: () => el('pokedex-tbody'),
        backBtn: () => el('pokedex-back'),
        refreshBtn: () => el('pokedex-refresh')
    };

    let currentEntity = null;
    let currentAbility = null;
    // 打开图鉴时的账号等级：**只是打开瞬间的默认起点**（今天两个拇指都落在这里），不再参与累计计算——
    // 累计的起点改由「起点等级」拇指给（2026-09-20 双滑块改造）
    let accountLevel = 1;
    let accountModules = null;   // 精工形态的模块等级数组（[lvl,...]，与 abilities 顺序对应，各 tab 定位用）
    let forceReload = false;    // 刷新按钮：强制绕过浏览器缓存重新拉取
    let discountFactor = 1;     // 当前账号升级时间折扣因子（1 − 折扣%/100）；仅时间与花费生效，矿石/宝石不打折

    // 账号升级时间折扣（0|5|10|15|20 百分数，与进度页共用 clash_upgrade_discount 键）
    function loadDiscountFactor(tag) {
        try {
            const m = JSON.parse(localStorage.getItem('clash_upgrade_discount') || '{}');
            const v = parseInt(m[tag], 10);
            discountFactor = (v === 5 || v === 10 || v === 15 || v === 20) ? 1 - v / 100 : 1;
        } catch (e) { discountFactor = 1; }
    }
    // 时间对象 × 折扣因子 → 同结构对象（秒级取整）
    function scaleTime(t) {
        if (discountFactor >= 1 || !t) return t;
        const total = ((t.days || 0) * 86400 + (t.hours || 0) * 3600 + (t.minutes || 0) * 60 + (t.seconds || 0)) * discountFactor;
        const secs = Math.round(total);
        return { days: Math.floor(secs / 86400), hours: Math.floor(secs % 86400 / 3600), minutes: Math.floor(secs % 3600 / 60), seconds: secs % 60 };
    }

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
        if (fmt === 'time') return fmtTime(scaleTime(v));
        if (fmt === 'sec') return v + '秒';
        if (fmt === 'size' && typeof v === 'string') return v === 'N/A' ? '—' : v.replace('x', '×');
        if (fmt === 'cost') return fmtCost(discountedCost(v), v.res);
        if (fmt === 'dur') return fmtDur(v);
        if (fmt === 'tiles') return fmtTiles(v);
        return v;
    }
    // 升级花费 × 折扣（矿石字段不经过此处；宝石 Gems 不打折，其余资源含双资源 Gold or Elixir 均打折）
    function discountedCost(v) {
        if (discountFactor >= 1 || !v || typeof v.v !== 'number') return v.v;
        const res = String(v.res || '');
        if (res === 'Gems') return v.v;
        return Math.round(v.v * discountFactor);
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

    // 累计升级时间/花费：起点拇指 → 终点拇指 的区间总和（含终点级一段）
    // kind: 'time' 返回 fmtTime 字符串；'cost' 返回 fmtCost 字符串；无累计（起点≥终点）返回 null
    function cumulative(kind) {
        const levels = currentAbility ? currentAbility.levels : (currentEntity ? currentEntity.levels : []);
        const sem = sliderSemantics(levels);
        const to = rawToPos(Number(els.sliderEnd().value) || 1, levels, sem);
        const from = rawToPos(Number(els.sliderStart().value) || 1, levels, sem);
        if (to <= from) return null;
        if (from < 1 || from >= levels.length) return null;
        if (kind === 'time') {
            let s = { days: 0, hours: 0, minutes: 0, seconds: 0 };
            // levels[i] = level i+1 的数据（time = 升到 level i+1 的时间）：从 from 级升到 to 级 = levels[from..to-1]
            for (let i = from; i < to && i < levels.length; i++) {
                const t = levels[i].time;
                if (t) {
                    s.days += t.days || 0;
                    s.hours += t.hours || 0;
                    s.minutes += t.minutes || 0;
                    s.seconds += t.seconds || 0;
                }
            }
            // 折扣：累计总时间 ×(1-折扣%)
            s = scaleTime(s);
            // 分项累计后进位归一化（秒→分→时→天）
            s.minutes += Math.floor(s.seconds / 60); s.seconds %= 60;
            s.hours += Math.floor(s.minutes / 60); s.minutes %= 60;
            s.days += Math.floor(s.hours / 24); s.hours %= 24;
            return fmtTime(s);
        }
        if (kind === 'cost') {
            let sum = 0;
            for (let i = from; i < to && i < levels.length; i++) {
                const c = levels[i].cost;
                if (typeof c === 'number') sum += c;
            }
            // 折扣：累计花费 ×(1-折扣%)（宝石实体不打折：costResource 为 Gems 时保持原值）
            if (discountFactor < 1) {
                let isGems = true;
                for (let i = from; i < to && i < levels.length; i++) {
                    if (String(levels[i].costResource || '').indexOf('Gems') === -1) { isGems = false; break; }
                }
                if (!isGems) sum = Math.round(sum * discountFactor);
            }
            return fmtCost(sum);
        }
        // 装备矿石花费（蓝/紫/黄矿，与升级花费同口径 Xw 缩写）
        if (ORE_KEYS.indexOf(kind) !== -1) {
            let sum = 0;
            for (let i = from; i < to && i < levels.length; i++) {
                const v = levels[i][kind];
                if (typeof v === 'number') sum += v;
            }
            return fmtCost(sum);
        }
        return null;
    }

    function renderLevel(lv) {
        const d = collectLevel(lv);
        let html = '';
        // 稳定排序（组内保持 FIELD_META 原顺序）：属性 → 时间/花费 → 建筑等级 → 升级经验
        const fields = buildLevelMeta().slice().sort((a, b) => levelFieldWeight(a) - levelFieldWeight(b));
        fields.forEach(f => {
            const v = d[f.key];
            if (v === undefined || v === null) return;
            const cum = (f.key === 'time' || f.key === 'cost' || ORE_KEYS.indexOf(f.key) !== -1) ? cumulative(f.key) : null;
            html += '<div class="item basic-item">' +
                '<img class="basic-icon" src="img/icons/' + iconForField(f, v) + '.webp" alt="">' +
                '<div class="basic-text"><span class="k">' + f.label + '</span><span class="v">' + formatValue(v, f.fmt) +
                (cum ? '<span class="cum">' + cum + '</span>' : '') + '</span></div>' +
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
        heroHallLevelRequired: 'att_yxdt',
        laboratoryRequired: 'att_sys',
        barrackLevelRequired: 'att_xly',
        spellFactoryLevelRequired: 'att_fsgc',
        petHouseLevelRequired: 'att_pets',
        blacksmithLevelRequired: 'att_tjp',
        upgradeShinyOre: 'Shiny_Ore',
        upgradeGlowingOre: 'Glowy_Ore',
        upgradeStarryOre: 'Starry_Ore'
    };
    // 建筑等级类字段集合（大本营等级独立后置；排序分组：属性 → 时间/花费 → 其他建筑 → 大本营 → 升级经验）
    const LEVEL_BUILDING_REQ = ['townHallRequired', 'builderHallRequired', 'heroHallLevelRequired',
        'laboratoryRequired', 'barrackLevelRequired', 'spellFactoryLevelRequired',
        'petHouseLevelRequired', 'blacksmithLevelRequired'];
    const LEVEL_TH_REQ = ['townHallRequired', 'builderHallRequired'];
    // 装备矿石升级花费字段（蓝/紫/黄矿，累计统计同升级花费口径）
    const ORE_KEYS = ['upgradeShinyOre', 'upgradeGlowingOre', 'upgradeStarryOre'];
    // 等级属性卡片字段分组权重：属性 0 / 时间花费 1 / 其他建筑等级 2 / 大本营等级 3 / 升级经验 4（组内保持 FIELD_META 原顺序）
    function levelFieldWeight(f) {
        if (f.key === 'time' || f.key === 'cost') return 1;
        if (LEVEL_TH_REQ.indexOf(f.key) !== -1) return 3;
        if (LEVEL_BUILDING_REQ.indexOf(f.key) !== -1) return 2;
        if (f.key === 'xpGained') return 4;
        return 0;
    }
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
        // 表格列序（等级列之后）：时间 → 花费 → 其他属性 → 其他建筑等级 → 大本营等级 → 升级经验
        const PRIORITY = { time: 0, cost: 1, xpGained: 5, townHallRequired: 4, builderHallRequired: 4 };
        cols.sort((a, b) => {
            const pa = PRIORITY[a.key] !== undefined ? PRIORITY[a.key] : (LEVEL_BUILDING_REQ.indexOf(a.key) !== -1 ? 3 : 2);
            const pb = PRIORITY[b.key] !== undefined ? PRIORITY[b.key] : (LEVEL_BUILDING_REQ.indexOf(b.key) !== -1 ? 3 : 2);
            return pa - pb;
        });

        // 数量型实体（instances 多条）：表格首列语义为"建筑数量"
        let head = '<tr><th>' + (currentEntity && currentEntity.instances && currentEntity.instances.length > 1 ? '数量' : '等级') + '</th>';
        cols.forEach(f => {
            const ic = thIconHtml(f, levels);
            // 文字表头超 4 字缩小字号（th-long）节省列宽；图标表头不受影响
            const label = f.table || f.label;
            head += '<th title="' + label + '"' + (ic ? '' : (label.length > 4 ? ' class="th-long"' : '')) + '>' + (ic || label) + '</th>';
        });
        head += '</tr>';
        els.thead().innerHTML = head;

        const cur = Number(els.sliderEnd().value) || 1;   // 高亮行跟**终点**（2026-09-20 双滑块口径）
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

    // 滑块语义：等级编号连续时滑块值=等级编号（如战斗直升机解锁即 15 级、超级形态 8-13），
    // 否则（supercharge 充能条目 level 恒为 1 等不连续场景）滑块值=位置 1..N
    function sliderSemantics(levels) {
        if (!levels || levels.length < 2) return { mode: 'pos', min: 1, max: levels ? levels.length : 1 };
        for (let i = 1; i < levels.length; i++) {
            if ((levels[i].level || 0) !== (levels[i - 1].level || 0) + 1) return { mode: 'pos', min: 1, max: levels.length };
        }
        const first = levels[0].level || 1;
        return { mode: 'lv', min: first, max: first + levels.length - 1 };
    }
    // 原始值（等级编号或位置）→ 表位置
    function rawToPos(v, levels, sem) {
        v = Math.round(v) || sem.min;
        if (sem.mode === 'lv') v = v - (levels[0].level || 1) + 1;
        return Math.min(Math.max(v, 1), levels.length);
    }
    // 表位置 → 原始值（写回滑块）
    function posToRaw(pos, levels, sem) {
        return sem.mode === 'lv' ? ((levels[pos - 1] && levels[pos - 1].level) || pos) : pos;
    }

    // 表位置 → 数字标签（等级编号优先；supercharge 等不连续场景退回位置）
    function posLabel(pos, levels) {
        return (levels[pos - 1] && levels[pos - 1].level !== undefined) ? levels[pos - 1].level : pos;
    }
    // 两个拇指都写进 DOM（DOM 是取值的唯一真源），并刷新区间填充
    function writeRange(levels, aPos, bPos) {
        const n = levels.length;
        const s = els.sliderStart(), e = els.sliderEnd();
        s.value = posToRaw(aPos, levels, sliderSemantics(levels));
        e.value = posToRaw(bPos, levels, sliderSemantics(levels));
        els.lvStart().value = posLabel(aPos, levels);
        els.lvEnd().value = posLabel(bPos, levels);
        // 填充：按表位置百分比画（轨道两端各内缩半个拇指宽，与原生拇指行程对齐）
        const box = els.rangeBox();
        if (box) {
            const span = Math.max(1, n - 1);
            box.style.setProperty('--a', ((aPos - 1) / span * 100) + '%');
            box.style.setProperty('--b', ((bPos - 1) / span * 100) + '%');
        }
    }
    // 重新渲染「终点」一侧：等级属性卡片（数值按终点）+ 表格高亮行 + 累计列
    function renderEndSide(levels, pos) {
        updateLvTitle();
        renderLevel(levels[pos - 1]);
        els.tbody().querySelectorAll('tr').forEach((r, i) => { r.classList.toggle('cur', i === pos - 1); });
    }

    // desiredEnd/desiredStart：打开或切形态时两个拇指的落点（都不传则沿用当前 DOM 值）
    function renderLevelData(entity, ability, desiredEnd, desiredStart) {
        const levels = ability ? ability.levels : entity.levels;
        const maxLv = levels ? levels.length : 0;
        if (!maxLv) {
            [els.sliderStart(), els.sliderEnd()].forEach(inp => { inp.disabled = true; inp.value = 1; });
            [els.lvStart(), els.lvEnd()].forEach(box => { box.value = ''; box.disabled = true; });
            els.level().innerHTML = '<div class="item" style="grid-column:1/-1;color:var(--text-sub);">该实体无等级数据</div>';
            els.thead().innerHTML = '';
            els.tbody().innerHTML = '<tr><td style="padding:16px;color:var(--text-sub);">该实体无等级数据</td></tr>';
            return;
        }
        const sem = sliderSemantics(levels);
        const s = els.sliderStart(), e = els.sliderEnd();
        [s, e].forEach(inp => { inp.disabled = false; inp.min = sem.min; inp.max = sem.max; });
        // 数字框与滑块同一套范围（type=number 自带 min/max 校验，敲超范围会被 clamp 回来）
        [els.lvStart(), els.lvEnd()].forEach(box => { box.disabled = false; box.min = sem.min; box.max = sem.max; });
        const fallbackEnd = Number(e.value) || sem.min;
        const fallbackStart = Number(s.value) || sem.min;
        let endPos = rawToPos(desiredEnd !== undefined && desiredEnd !== null ? desiredEnd : fallbackEnd, levels, sem);
        let startPos = rawToPos(desiredStart !== undefined && desiredStart !== null ? desiredStart : fallbackStart, levels, sem);
        if (startPos > endPos) startPos = endPos;   // 起点 ≤ 终点（默认两点都落在打开值上）
        writeRange(levels, startPos, endPos);
        renderTable(levels);
        renderEndSide(levels, endPos);
    }

    // 标题写两个端点：数量型实体用「个」，形态 tab 带形态名后缀
    function updateLvTitle() {
        const isInst = currentEntity && currentEntity.instances && currentEntity.instances.length > 1;
        const unit = isInst ? '个' : '级';
        const title = '等级属性（起点 ' + els.lvStart().value + unit + ' → 终点 ' + els.lvEnd().value + unit + '）' +
            (currentAbility ? ' · ' + currentAbility.name : '');
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
        // 精工形态：两个拇指都落到当前模块等级（abilities 顺序 = 模块顺序）
        renderLevelData(entity, currentAbility, currentModuleLevel(tabs), currentModuleLevel(tabs));
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

    // 实体顶层自定义字段（如 stunTime 眩晕时间，非 stats/levels/元数据）注入每个 level，使 collectLevel 能取到
    const RESERVED_TOP = ['id', 'dataId', 'name', 'description', 'base', 'category', 'spellType', 'traits', 'levels', 'abilities', 'rawId', 'en_name'];
    function injectTopLevelFields(entity) {
        if (!entity || !entity.levels) return;
        const top = {};
        Object.keys(entity).forEach(k => {
            if (RESERVED_TOP.indexOf(k) === -1) top[k] = entity[k];
        });
        if (Object.keys(top).length) {
            entity.levels.forEach(lv => { Object.assign(lv, top); });
        }
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
    let forcedServer = null;   // 数据查询页传入的显式区服（不靠账号 _server 判服，也不套账号的升级折扣）

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
    // 打开失败的统一出口（索引/实体加载失败）：弹层不开、给提示——否则表现就是「点了没反应」
    function failOpen() {
        resetReload();
        close(); // 收起提前显示的弹层（加载失败不占屏），回到来时页面
        CocTool.ui.showToast('图鉴数据加载失败，请重试', 2500);
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

    function open(id, curLevel, tag, modules, serverArg) {
        currentTag = tag || state.currentAccount;
        forcedServer = serverArg || null;
        if (forcedServer) discountFactor = 1;   // 数据查询页与账号无关：不套账号的升级时间/花费折扣
        else loadDiscountFactor(currentTag);
        const server = forcedServer || currentServer(currentTag);
        // 先显示弹层（加载态）：数据拉取期间也盖住下面的页面——首页/时间搜索的小路直达因此"零停留"，
        // 返回时弹层之下本就是原大路（账号进度列表 + 账号详情页），无需任何补站机制。
        const earlyPage = els.page();
        if (earlyPage) { earlyPage.style.display = 'flex'; earlyPage.classList.remove('hidden'); }
        setSpinning(true);
        const finish = entity => {
            resetReload();
            if (!entity) { close(); return; }
            injectTopLevelFields(entity);
            // 数量型实体（夜世界兵营/预备营等 instances 多条）：升级数据按"建筑数量"组织，
            // 构造伪 levels 复用等级表格渲染（数量 1..N → 时间/花费/大本等级/经验）
            if (entity.instances && entity.instances.length > 1) {
                entity.levels = entity.instances.map(function (ins, i) {
                    return {
                        level: i + 1,
                        buildTime: ins.buildTime,
                        cost: ins.buildCost,
                        costResource: ins.buildCostResource,
                        builderHallRequired: ins.builderHallRequired,
                        xpGained: ins.xpGained,
                        stats: (entity.levels && entity.levels[0] && entity.levels[0].stats) ? entity.levels[0].stats : undefined
                    };
                });
                // 当前数量：账号 buildings2 中该实体 cnt
                try {
                    const acc = accounts[currentTag];
                    const arr = acc && acc.buildings2;
                    if (Array.isArray(arr)) {
                        for (const it of arr) {
                            if (String(it.data) === String(id)) { curLevel = it.cnt || 1; break; }
                        }
                    }
                } catch (e) {}
            }
            render(entity, curLevel || 1, modules);
            const page = els.page();
            page.style.display = 'flex';
            page.classList.remove('hidden');
        };
        loadIndex(server, idx => {
            if (!idx) { failOpen(); return; }   // 本服数据加载失败：不静默跨服（避免国服账号显示国际服数据）
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
                    if (!idx2) { failOpen(); return; }
                    if (idx2[String(id)]) {
                        getEntityData(server, id, finish);
                        return;
                    }
                    tryKnownCategory(server, id, finish, () => {
                        // 直连也失败：账号 _server 判定错误 / 装备 ID 属于另一服 → 尝试另一服
                        const alt = server === 'cn' ? 'intl' : 'cn';
                        loadIndex(alt, altIdx => {
                            if (!altIdx || !altIdx[String(id)]) { failOpen(); return; }
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
                    if (!altIdx || !altIdx[String(id)]) { failOpen(); return; }
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
        const server = forcedServer || currentServer(currentTag);
        delete indexCache[server];
        open(id, accountLevel, currentTag, null, forcedServer);
    }

    function close() {
        const page = els.page();
        page.style.display = 'none';
        page.classList.add('hidden');
        currentEntity = null;
        currentAbility = null;
        forcedServer = null;
        resetReload();
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
        // 双拇指：起点 ≤ 终点，互不穿越（拖过对方时停在对方那一格）；两个数值/填充/（终点的）卡片与高亮一起刷
        const startInp = els.sliderStart(), endInp = els.sliderEnd();
        function curLevels() {
            return currentAbility ? currentAbility.levels : (currentEntity ? currentEntity.levels : []);
        }
        // side: 'start' | 'end'；raw 为目标值（等级编号或位置）
        function applyRange(side, raw) {
            if (!currentEntity) return;
            const levels = curLevels();
            if (!levels.length) return;
            const sem = sliderSemantics(levels);
            let startPos = rawToPos(Number(startInp.value) || sem.min, levels, sem);
            let endPos = rawToPos(Number(endInp.value) || sem.min, levels, sem);
            const pos = rawToPos(raw, levels, sem);
            if (side === 'start') startPos = Math.min(pos, endPos);
            else endPos = Math.max(pos, startPos);
            writeRange(levels, startPos, endPos);
            renderEndSide(levels, endPos);
        }
        startInp.addEventListener('input', () => applyRange('start', Number(startInp.value)));
        endInp.addEventListener('input', () => applyRange('end', Number(endInp.value)));
        // 两个等级数字框：敲完（回车/失焦 = change）才提交，敲了一半不打断；空值/非法值回滚成当前值
        const commitBox = (id, side) => {
            const box = el(id);
            if (!box) return;
            box.addEventListener('change', () => {
                const v = Number(box.value);
                if (!box.value || !isFinite(v)) { applyRange(side, side === 'start' ? Number(startInp.value) : Number(endInp.value)); return; }
                applyRange(side, v);
            });
        };
        commitBox('pokedex-lv-start', 'start');
        commitBox('pokedex-lv-end', 'end');
        // 微调按钮：英雄上百级时拖不准，四个方向各一个（起点/终点 × ±）
        const step = (id, side, delta) => {
            const btn = el(id);
            if (!btn) return;
            btn.addEventListener('click', () => {
                const inp = side === 'start' ? startInp : endInp;
                applyRange(side, Number(inp.value) + delta);
            });
        };
        step('pokedex-lv-start-minus', 'start', -1);
        step('pokedex-lv-start-plus', 'start', 1);
        step('pokedex-lv-end-minus', 'end', -1);
        step('pokedex-lv-end-plus', 'end', 1);
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
            // 精工形态：切换 tab 时两个拇指都定位到对应模块等级；超级形态等直接用账号等级
            // （renderLevelData 内按等级编号匹配并 clamp 到形态区间）
            let desired = accountLevel || 1;
            if (t.type === 'ability' && accountModules && accountModules.length) {
                const mv = Number(accountModules[t.idx]);
                if (mv > 0) desired = mv;
            }
            renderLevelData(currentEntity, currentAbility, desired, desired);
        });
    }

    init();

    // ===================== 数据查询页（图鉴索引） =====================
    // 更多页入口：按分类浏览图鉴里的全部实体，点卡片才进图鉴详情看完整数据。
    // 本页只是"入口"，所以每个实体只给一张图——有等级图的分类（建筑类）取「满级」那张，其余分类本来只有一张。
    // 分类与顺序 = 用户 2026-09-20 口径（主世界 13 + 夜世界 8）；夜世界名字加 🌙（同 names.js 的夜世界叫法）。
    const DQ_CATS = {
        home: [['hero', '英雄'], ['hero-equipment', '装备'], ['pet', '战宠'], ['troop', '兵种'],
            ['spell', '法术'], ['siege-machine', '攻城机器'], ['guardian', '守卫'], ['defense', '防御'],
            ['trap', '陷阱'], ['resource', '资源'], ['army', '军队'], ['other', '其他'], ['wall', '墙']],
        builder: [['hero', '英雄'], ['troop', '兵种'], ['defense', '防御'], ['trap', '陷阱'],
            ['resource', '资源'], ['army', '军队'], ['other', '其他'], ['wall', '墙']]
    };
    // 图鉴目录 → 分类键：图鉴里有、但上面没单列 tab 的目录并入「其他」，否则那几项在这页查不到
    // （主世界：大本营/实验室/精工形态；夜世界：建筑大师大本营）
    const DQ_DIR_CAT = {
        'home/hero': 'hero', 'home/hero-equipment': 'hero-equipment', 'home/pet': 'pet',
        'home/troop': 'troop', 'home/spell': 'spell', 'home/siege-machine': 'siege-machine',
        'home/guardian': 'guardian', 'home/defense': 'defense', 'home/trap': 'trap',
        'home/resource': 'resource', 'home/army': 'army', 'home/other': 'other', 'home/wall': 'wall',
        'home/town-hall': 'other', 'home/research': 'other', 'home/crafted-defense': 'other',
        'builder/hero': 'hero', 'builder/troop': 'troop', 'builder/defense': 'defense',
        'builder/trap': 'trap', 'builder/resource': 'resource', 'builder/army': 'army',
        'builder/other': 'other', 'builder/wall': 'wall', 'builder/builder-hall': 'other'
    };
    // 图鉴目录 → progress-meta 分类（满级来源）；未列出的目录无满级数据
    const DQ_META_CAT = {
        'home/hero': 'heroes', 'home/hero-equipment': 'hero-equipment', 'home/pet': 'pets',
        'home/troop': 'units', 'home/spell': 'spells', 'home/siege-machine': 'siege_machines',
        'home/guardian': 'guardians', 'home/defense': 'defense_buildings', 'home/trap': 'traps',
        'home/resource': 'resources', 'home/army': 'army', 'home/other': 'other', 'home/wall': 'wall',
        'home/town-hall': 'town_hall', 'home/research': 'research',
        'home/crafted-defense': 'defense_buildings',
        'builder/hero': 'heroes2', 'builder/troop': 'units2', 'builder/defense': 'defenses2',
        'builder/trap': 'traps2', 'builder/resource': 'resources2', 'builder/army': 'army2',
        'builder/other': 'other2', 'builder/wall': 'wall2', 'builder/builder-hall': 'buildings2'
    };
    // 图鉴目录 → 图标目录（未列出的建筑类目录归 buildings / buildings2）
    const DQ_ICON_DIR = {
        'home/hero': 'heroes', 'builder/hero': 'heroes', 'home/hero-equipment': 'equipment',
        'home/pet': 'pets', 'home/troop': 'lab', 'home/spell': 'lab',
        'home/siege-machine': 'lab', 'builder/troop': 'units2'
    };

    function dqEl(id) { return document.getElementById(id); }
    function dqEsc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    // 满级（等级编号）：progress-meta 的 levels[id]（超级兵种取本体；精工形态 meta 记 0 → 三模块各 10 级）；
    // 没有源数据的实体返回 0（卡片不显示「满级」行）
    function dqMaxLevel(server, dir, id) {
        const m = (server === 'cn' ? global.PROGRESS_META_CN : global.PROGRESS_META_INTL) || null;
        const cat = DQ_META_CAT[dir];
        const base = String(id).replace(/^SUPER_/, '');
        const lv = (m && cat && m[cat] && m[cat].levels) ? m[cat].levels[base] : undefined;
        if (lv) return lv;
        return dir === 'home/crafted-defense' ? 30 : 0;
    }
    // 图标候选（按序回退）：满级图 → 无等级图 → 另一目录同名图 → 通用占位
    function dqIcons(dir, id, maxLv) {
        const d = DQ_ICON_DIR[dir] || (dir.indexOf('builder/') === 0 ? 'buildings2' : 'buildings');
        let rid = String(id).replace(/^SUPER_/, '');
        if (d === 'equipment') rid = rid.replace(/^106/, '90');   // 国服装备 ID 106xxxxx → 图标 90xxxxx
        const out = [];
        if (maxLv > 0 && (d === 'buildings' || d === 'buildings2')) {
            out.push('img/icons/' + d + '/' + rid + '_' + maxLv + '.webp');
        }
        out.push('img/icons/' + d + '/' + rid + '.webp');
        if (d === 'buildings') out.push('img/icons/buildings2/' + rid + '.webp');
        out.push('img/icons/20260627.webp');
        return out;
    }
    // 名称：names.js 的 ID→中文表；超级兵种 = 本体名加前缀；表里没有的（如国际服 B.O.T.O's Shack）原样显示 ID
    function dqName(id) {
        const names = (CocTool.names && CocTool.names.ITEM_NAMES) || {};
        if (names[String(id)]) return names[String(id)];
        const base = String(id).replace(/^SUPER_/, '');
        if (base !== String(id) && names[base]) return '超级' + names[base];
        return String(id);
    }

    let dqServer = 'intl';    // 当前区服（进入页面时取当前账号的区服；不落盘，每次进入跟随账号）
    let dqWorld = 'home';     // 当前世界（顶部主世界/夜世界 tab；一次只渲染一个世界）
    let dqIndex = null;       // 当前区服的图鉴索引（切世界复用，不再请求）
    let dqSections = [];      // [{key, top}] —— 各分类区在内容列里的位置
    let dqActiveKey = null;

    // 顶部世界 tab 的选中态（只切类，不重建元素）
    function dqMarkWorld() {
        const box = dqEl('dq-worlds');
        if (!box) return;
        box.querySelectorAll('.dq-wtab').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-world') === dqWorld);
        });
    }

    function dqSetActive(key) {
        if (key === dqActiveKey) return;
        dqActiveKey = key;
        const tabs = dqEl('dq-tabs');
        if (!tabs) return;
        let act = null;
        tabs.querySelectorAll('.dq-tab').forEach(t => {
            const on = t.getAttribute('data-sec') === key;
            t.classList.toggle('active', on);
            if (on) act = t;
        });
        // 选中的 tab 滚出可视区时把它带回来（只滚 tab 列，不动内容）
        if (act) {
            const h = tabs.clientHeight, top = act.offsetTop, th = act.offsetHeight;
            if (top < tabs.scrollTop) tabs.scrollTop = top;
            else if (top + th > tabs.scrollTop + h) tabs.scrollTop = top + th - h;
        }
    }
    // 内容列滚动 → tab 跟随（贴底时锁定最后一节：末节高度不够顶到 scrollTop 上限）
    function dqSyncActive() {
        const scroll = dqEl('dq-scroll');
        if (!scroll || !dqSections.length) return;
        if (scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 2) {
            dqSetActive(dqSections[dqSections.length - 1].key);
            return;
        }
        const top = scroll.scrollTop + 8;
        let key = dqSections[0].key;
        for (let i = 0; i < dqSections.length; i++) {
            if (dqSections[i].top <= top) key = dqSections[i].key;
            else break;
        }
        dqSetActive(key);
    }

    function dqRender(server, idx) {
        const buckets = {};
        Object.keys(idx).forEach(id => {
            const dir = idx[id];
            const world = dir.indexOf('builder/') === 0 ? 'builder' : 'home';
            const key = world + ':' + (DQ_DIR_CAT[dir] || 'other');
            (buckets[key] = buckets[key] || []).push({ id: id, dir: dir });
        });
        let tabsHtml = '', listHtml = '';
        // 一次只渲染一个世界（顶部 tab 切换）：侧 tab 只有该世界的分类，名字不必再加 🌙 区分
        DQ_CATS[dqWorld].forEach(pair => {
            const cat = pair[0], label = pair[1];
            const key = dqWorld + ':' + cat;
            const items = buckets[key] || [];
            if (!items.length) return;
            // 侧 tab 两行：名称在上、数量在下（窄列里比同行并排更好读，"攻城机器 9" 不会再挤成一行）
            tabsHtml += '<button class="dq-tab" type="button" data-sec="' + key + '">' +
                '<span class="t">' + label + '</span><span class="n">' + items.length + '</span></button>';
            let cards = '';
            items.forEach(it => {
                const maxLv = dqMaxLevel(server, it.dir, it.id);
                const icons = dqIcons(it.dir, it.id, maxLv);
                cards += '<button class="dq-card" type="button" data-id="' + dqEsc(it.id) + '">' +
                    '<img class="dq-icon" src="' + icons[0] + '" data-alt="' + dqEsc(icons.slice(1).join('|')) + '" alt="">' +
                    '<span class="dq-name">' + dqEsc(dqName(it.id)) + '</span>' +
                    (maxLv > 0 ? '<span class="dq-max">满级' + maxLv + '</span>' : '') +
                    '</button>';
            });
            listHtml += '<div class="dq-sec" data-sec="' + key + '">' +
                '<div class="dq-sec-title">' + label + '<span class="n">' + items.length + '</span></div>' +
                '<div class="dq-grid">' + cards + '</div></div>';
        });
        const tabs = dqEl('dq-tabs'), list = dqEl('dq-list');
        tabs.innerHTML = tabsHtml;
        list.innerHTML = listHtml;
        // 图标按候选链回退（缺满级图 → 无等级图 → 通用占位）
        list.querySelectorAll('img.dq-icon[data-alt]').forEach(img => {
            const alts = img.getAttribute('data-alt').split('|');
            let i = 0;
            img.onerror = function () {
                if (i >= alts.length) { this.onerror = null; return; }
                this.src = alts[i++];
            };
        });
        dqSections = Array.prototype.map.call(list.querySelectorAll('.dq-sec'), sec => ({
            key: sec.getAttribute('data-sec'),
            top: sec.offsetTop
        }));
        dqActiveKey = null;
        tabs.scrollTop = 0;
        dqEl('dq-scroll').scrollTop = 0;
        dqSetActive(dqSections.length ? dqSections[0].key : null);
    }

    // 打开/切服：index.json 走图鉴同一套加载（桥接 → 服务器 → 本地相对路径）与同一份缓存
    function dqShow(server) {
        const page = dqEl('data-query-page');
        if (!page) return;
        dqServer = server;
        page.style.display = 'flex';
        page.classList.remove('hidden');
        page.setAttribute('data-srv', server);
        const lbl = dqEl('dq-server-label');
        if (lbl) lbl.textContent = server === 'cn' ? '国服' : '国际服';
        dqMarkWorld();
        dqEl('dq-tabs').innerHTML = '';
        dqEl('dq-list').innerHTML = '<div class="dq-msg">加载中…</div>';
        dqSections = [];
        dqActiveKey = null;
        loadIndex(server, idx => {
            if (page.style.display === 'none') return;   // 加载期间已返回
            if (!idx) {
                dqEl('dq-list').innerHTML = '<div class="dq-msg">数据加载失败，请检查网络</div>';
                return;
            }
            dqIndex = idx;
            dqRender(server, idx);
        });
    }
    // 切世界：索引已在手（同一份缓存），只重渲染当前世界，不再请求
    function dqSetWorld(world) {
        if (world === dqWorld) return;
        dqWorld = world;
        dqMarkWorld();
        if (dqIndex) dqRender(dqServer, dqIndex);
    }

    function dqOpen() {
        dqWorld = 'home';   // 每次从更多页进来都从主世界看起
        dqShow(currentServer(state.currentAccount));
    }
    function dqClose() {
        const page = dqEl('data-query-page');
        if (page) { page.style.display = 'none'; page.classList.add('hidden'); }
        dqSections = [];
        dqActiveKey = null;
    }
    function dqGoBack() { dqClose(); return true; }

    (function dqInit() {
        const page = dqEl('data-query-page');
        if (!page) return;
        const back = dqEl('dq-back');
        if (back) back.addEventListener('click', dqClose);
        const srv = dqEl('dq-server');
        if (srv) srv.addEventListener('click', () => dqShow(dqServer === 'cn' ? 'intl' : 'cn'));
        const more = dqEl('more-dataquery');
        if (more) more.addEventListener('click', dqOpen);
        // 顶部世界 tab：主世界/夜世界分两页（各自只列自己那 13 / 8 个分类）
        dqEl('dq-worlds').addEventListener('click', ev => {
            const btn = ev.target.closest('.dq-wtab');
            if (btn) dqSetWorld(btn.getAttribute('data-world'));
        });
        // 左列 tab：点一下跳到该分类（内容列定位到分类区顶）
        dqEl('dq-tabs').addEventListener('click', ev => {
            const btn = ev.target.closest('.dq-tab');
            if (!btn) return;
            const key = btn.getAttribute('data-sec');
            const scroll = dqEl('dq-scroll');
            for (let i = 0; i < dqSections.length; i++) {
                if (dqSections[i].key === key) {
                    scroll.scrollTop = dqSections[i].top;
                    dqSetActive(key);
                    return;
                }
            }
        });
        // 内容列滚动：tab 跟随高亮
        dqEl('dq-scroll').addEventListener('scroll', dqSyncActive, { passive: true });
        // 卡片 → 图鉴详情（本页选中的区服，不套账号的升级折扣）
        dqEl('dq-list').addEventListener('click', ev => {
            const card = ev.target.closest('.dq-card');
            if (!card) return;
            open(card.getAttribute('data-id'), 1, null, null, dqServer);
        });
    })();

    CocTool.features = CocTool.features || {};
    CocTool.features.pokedex = Object.freeze({ open, close, goBack });
    CocTool.features.dataQuery = Object.freeze({ open: dqOpen, close: dqClose, goBack: dqGoBack });
})(window);
