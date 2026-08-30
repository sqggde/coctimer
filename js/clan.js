// ========== 部落功能模块 ==========
// 独立模块，所有部落相关逻辑在此文件扩展

(function(global) {
    'use strict';

    var CocTool = global.CocTool;
    if (!CocTool || !CocTool.state || !CocTool.features) {
        throw new Error('clan.js requires core.js');
    }

    var _initialized = false;

    var CLAN_API_BASE = CocTool.apiBase;
    var APP_TOKEN = CocTool.appToken;

    // localStorage 存储键
    var STORAGE_KEY = 'clash_clan_list';
    var CHINA_STORAGE_KEY = 'clash_china_clan_list';

    // DOM 元素引用
    var el = {};

    CocTool.clan = CocTool.clan || {};
    var shared = CocTool.clan.shared = {
        el: el,
        _currentClan: null,
        _leagueMode: false,
        _leagueClanTag: null,
        _countdownTimer: null,
        showToast: showToast,
        parseCocTime: parseCocTime,
        saveModeMap: saveModeMap,
        hideAllDetailViews: hideAllDetailViews,
        fetchCurrentWar: fetchCurrentWar,
        _modeMap: _modeMap
    };

    // 部落数据
    var clanList = [];
    var chinaClanList = [];

    // 是否正在加载
    var isLoading = false;

    // 删除模式
    var isDeleteMode = false;

    // 待删除的部落信息
    var _pendingDeleteTag = null;
    var _pendingDeleteName = '';

    // Toast 定时器
    var toastTimer = null;

    // 倒计时定时器
    var _cardTimer = null;

    // 缓存与冷却
    var CACHE_TTL_NOTINWAR = 0;           // 无战/已结束：不缓存，每次都获取
    var CACHE_TTL_PREPARATION = 24 * 60 * 60 * 1000; // 准备日：24小时
    var CACHE_TTL_INWAR = 10 * 60 * 1000; // 战斗日：10分钟
    var REFRESH_COOLDOWN = 60 * 1000;

    function getWarCacheKey(tag) { return 'clash_war_' + tag; }
    function getWarCooldownKey(tag) { return 'clash_war_cooldown_' + tag; }

    function getCachedWar(tag) {
        try {
            var raw = localStorage.getItem(getWarCacheKey(tag));
            if (!raw) return null;
            var cached = JSON.parse(raw);
            if (cached && cached.data && cached.ts) return cached;
        } catch(e) {}
        return null;
    }

    function setCachedWar(tag, data) {
        try {
            localStorage.setItem(getWarCacheKey(tag), JSON.stringify({ data: data, ts: Date.now() }));
        } catch(e) {}
    }

    function initClan() {
        if (_initialized) return true;
        el.root = document.getElementById('clan-page');
        if (!el.root) return false;
        _initialized = true;
        loadModeMap();

        // 获取 DOM 引用
        el.emptyState = document.getElementById('clan-empty-state');
        el.clanContent = document.getElementById('clan-content');
        el.clanCards = document.getElementById('clan-cards');
        el.addBtn = document.getElementById('add-btn');
        el.filterBtn = document.getElementById('filter-btn');
        el.deleteBtn = document.getElementById('delete-btn');
        el.dropdown = document.getElementById('server-dropdown');
        el.dropdownItems = el.root.querySelectorAll('.dropdown-item');
        el.tagModal = document.getElementById('tag-modal');
        el.tagInput = document.getElementById('tag-input');
        el.tagModalTitle = document.getElementById('tag-modal-title');
        el.tagConfirm = document.getElementById('tag-modal-confirm');
        el.tagCancel = document.getElementById('tag-modal-cancel');
        el.toast = document.getElementById('clan-toast');
        el.toastText = document.getElementById('clan-toast-text');
        el.deleteModal = document.getElementById('clan-delete-modal');
        el.deleteConfirmBtn = document.getElementById('clan-delete-confirm-btn');
        el.deleteCancelBtn = document.getElementById('clan-delete-cancel-btn');
        el.deleteText = document.getElementById('clan-delete-text');

            // 国服弹窗
        el.chinaModal = document.getElementById('china-modal');
        el.chinaNameInput = document.getElementById('china-name-input');
        el.chinaLevelInput = document.getElementById('china-level-input');
        el.chinaConfirmBtn = document.getElementById('china-confirm-btn');
        el.chinaCancelBtn = document.getElementById('china-cancel-btn');
        // 国服成员弹窗
        el.chinaMemberModal = document.getElementById('china-member-modal');
        el.chinaMemberList = document.getElementById('china-member-list');
        el.chinaMemberConfirm = document.getElementById('china-member-confirm-btn');
        el.chinaMemberCancel = document.getElementById('china-member-cancel-btn');

        // 详情页 DOM
        el.detailPage = document.getElementById('clan-detail-page');
        el.detailBadge = document.getElementById('detail-badge');
        el.detailName = document.getElementById('detail-name');
        el.detailEmpty = document.getElementById('detail-empty-state');
        el.detailContent = document.getElementById('detail-content');
        el.detailBack = document.getElementById('detail-back-btn');
        el.detailRefresh = document.getElementById('detail-refresh-btn');
        el.detailToolbar = document.getElementById('detail-toolbar');
        el.chinaWarSettingBtn = document.getElementById('china-war-setting-btn');
        el.chinaWarModal = document.getElementById('china-war-modal');
        el.chinaWarHours = document.getElementById('china-war-hours');
        el.chinaWarMinutes = document.getElementById('china-war-minutes');
        el.chinaWarConfirm = document.getElementById('china-war-confirm-btn');
        el.chinaWarCancel = document.getElementById('china-war-cancel-btn');
        el.detailLoading = document.getElementById('detail-loading');
        el.detailNotWar = document.getElementById('detail-notwar-view');
        el.detailNotWarBadge = document.getElementById('detail-notwar-badge');
        el.modeTabs = document.getElementById('detail-mode-tabs');
        el.modeWarTab = document.getElementById('mode-war-tab');
        el.modeLeagueTab = document.getElementById('mode-league-tab');

        // ====== 详情页 more 下拉菜单（对战日志 / 对战统计） ======
        var detailMoreBtn = document.getElementById('detail-more-btn');
        var detailMoreMenu = document.getElementById('detail-more-menu');
        var detailLogItem = document.getElementById('detail-log-menu-item');
        var detailStatsItem = document.getElementById('detail-stats-menu-item');
        function hideDetailMoreMenu() {
            if (detailMoreMenu) detailMoreMenu.classList.add('hidden');
        }
        if (detailMoreBtn) {
            detailMoreBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (detailMoreMenu) detailMoreMenu.classList.toggle('hidden');
            });
        }
        if (detailMoreMenu) {
            detailMoreMenu.addEventListener('click', function(e) { e.stopPropagation(); });
        }
        if (detailLogItem) {
            detailLogItem.addEventListener('click', function() {
                hideDetailMoreMenu();
                if (CocTool.features.warlog && CocTool.features.warlog.show) CocTool.features.warlog.show();
            });
        }
        if (detailStatsItem) {
            detailStatsItem.addEventListener('click', function() {
                hideDetailMoreMenu();
                var clan = shared._currentClan;
                if (clan && clan.tag && CocTool.features.warStats) {
                    var badge = clan.badgeUrls && clan.badgeUrls.small ? clan.badgeUrls.small : '';
                    CocTool.features.warStats.open(clan.tag, clan.name, badge);
                }
            });
        }
        // 点击页面其他区域收起菜单
        document.addEventListener('click', hideDetailMoreMenu);
        CocTool.closeWarStats = function() {
            if (CocTool.features.warStats) CocTool.features.warStats.close();
            hideDetailMoreMenu();
        };
        el.leagueTabs = document.getElementById('league-tabs');
        el.leagueTitle = document.getElementById('league-title');
        el.leagueTabList = document.getElementById('league-tab-list');
        el.leagueRefreshBtn = document.getElementById('league-refresh-btn');
        el.detailPrep = document.getElementById('detail-prep-view');
        el.prepHomeBadge = document.getElementById('prep-home-badge');
        el.prepHomeName = document.getElementById('prep-home-name');
        el.prepAwayBadge = document.getElementById('prep-away-badge');
        el.prepAwayName = document.getElementById('prep-away-name');
        el.prepCountdown = document.getElementById('prep-countdown');
        el.prepHomeLabel = document.getElementById('prep-home-label');
        el.prepHomeMembers = document.getElementById('prep-home-members');
        el.prepAwayLabel = document.getElementById('prep-away-label');
        el.prepAwayMembers = document.getElementById('prep-away-members');

        // 战况统计 DOM
        el.statHomeStars = document.getElementById('stat-home-stars');
        el.statAwayStars = document.getElementById('stat-away-stars');
        el.statBarHomeStars = document.getElementById('stat-bar-home-stars');
        el.statBarAwayStars = document.getElementById('stat-bar-away-stars');
        el.statHomeDestruction = document.getElementById('stat-home-destruction');
        el.statAwayDestruction = document.getElementById('stat-away-destruction');
        el.statBarHomeDestruction = document.getElementById('stat-bar-home-destruction');
        el.statBarAwayDestruction = document.getElementById('stat-bar-away-destruction');
        el.statHomeAttacks = document.getElementById('stat-home-attacks');
        el.statAwayAttacks = document.getElementById('stat-away-attacks');
        el.statBarHomeAttacks = document.getElementById('stat-bar-home-attacks');
        el.statBarAwayAttacks = document.getElementById('stat-bar-away-attacks');
        el.prepTeamSize = document.getElementById('prep-team-size');

        // 绑定加号按钮 — 显示下拉菜单
        if (el.addBtn) {
            el.addBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                toggleDropdown();
            });
        }

        // 绑定下拉菜单选项
        if (el.dropdownItems) {
            el.dropdownItems.forEach(function(item) {
                item.addEventListener('click', function() {
                    var server = item.getAttribute('data-server');
                    hideDropdown();
                    if (server === 'international') {
                        showTagModal();
                    } else if (server === 'china') {
                        showChinaModal();
                    }
                });
            });
        }

        // 点击页面其他位置关闭下拉菜单
        document.addEventListener('click', function() {
            hideDropdown();
        });

        // 绑定筛选按钮（预留）
        if (el.filterBtn) {
            el.filterBtn.addEventListener('click', function() {
                showToast('筛选功能开发中', 1500);
            });
        }

        // 绑定删除按钮 — 切换删除模式
        if (el.deleteBtn) {
            el.deleteBtn.addEventListener('click', function() {
                toggleDeleteMode();
            });
        }

        // 绑定标签输入弹窗 — 取消
        if (el.tagCancel) {
            el.tagCancel.addEventListener('click', hideTagModal);
        }

        // 点击遮罩关闭弹窗
        if (el.tagModal) {
            el.tagModal.addEventListener('click', function(e) {
                if (e.target === el.tagModal) hideTagModal();
            });
        }

        // 绑定标签输入弹窗 — 确认查询
        if (el.tagConfirm) {
            el.tagConfirm.addEventListener('click', function() {
                submitTag();
            });
        }

        // 输入框回车触发查询
        if (el.tagInput) {
            el.tagInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') submitTag();
            });
        }

        // 绑定国服弹窗 — 取消
        if (el.chinaCancelBtn) {
            el.chinaCancelBtn.addEventListener('click', hideChinaModal);
        }
        if (el.chinaModal) {
            el.chinaModal.addEventListener('click', function(e) {
                if (e.target === el.chinaModal) hideChinaModal();
            });
        }
        // 绑定国服弹窗 — 确认
        if (el.chinaConfirmBtn) {
            el.chinaConfirmBtn.addEventListener('click', function() {
                submitChinaClan();
            });
        }
        // 国服输入框回车
        if (el.chinaLevelInput) {
            el.chinaLevelInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') submitChinaClan();
            });
        }

        // 绑定删除确认弹窗 — 确定
        if (el.deleteConfirmBtn) {
            el.deleteConfirmBtn.addEventListener('click', function() {
                if (_pendingDeleteTag) {
                    if (typeof _pendingDeleteTag === 'string' && _pendingDeleteTag.indexOf('china_') === 0) {
                        removeChinaClan(_pendingDeleteTag);
                    } else {
                        removeClan(_pendingDeleteTag);
                    }
                    showToast('已删除「' + _pendingDeleteName + '」', 1500);
                    if (clanList.length === 0 && chinaClanList.length === 0) exitDeleteMode();
                }
                hideDeleteModal();
            });
        }

        // 绑定删除确认弹窗 — 取消
        if (el.deleteCancelBtn) {
            el.deleteCancelBtn.addEventListener('click', hideDeleteModal);
        }

        // 点击遮罩关闭
        if (el.deleteModal) {
            el.deleteModal.addEventListener('click', function(e) {
                if (e.target === el.deleteModal) hideDeleteModal();
            });
        }

        // 绑定详情页返回按钮（部落战/联赛平级：均直接返回部落列表）
        if (el.detailBack) {
            el.detailBack.addEventListener('click', showListView);
        }

        // 绑定模式切换标签（部落战/联赛）
        if (el.modeWarTab) {
            el.modeWarTab.addEventListener('click', shared.switchToWarMode);
        }
        if (el.modeLeagueTab) {
            el.modeLeagueTab.addEventListener('click', shared.switchToLeagueMode);
        }

        // 绑定详情页刷新按钮（部落战）— 带冷却
        if (el.detailRefresh) {
            el.detailRefresh.addEventListener('click', function() {
                if (!shared._currentClan) return;
                var tag = shared._currentClan.tag;
                var now = Date.now();
                var lastRefresh = 0;
                try { lastRefresh = parseInt(localStorage.getItem(getWarCooldownKey(tag)), 10) || 0; } catch(e) {}
                if (now - lastRefresh < REFRESH_COOLDOWN) {
                    var remain = Math.ceil((REFRESH_COOLDOWN - (now - lastRefresh)) / 1000);
                    showToast('刷新太频繁，请' + remain + '秒后再试', 1500);
                    return;
                }
                localStorage.setItem(getWarCooldownKey(tag), now);
                hideAllDetailViews();
                if (el.detailLoading) el.detailLoading.classList.remove('hidden');
                if (shared._countdownTimer) { clearInterval(shared._countdownTimer); shared._countdownTimer = null; }
                fetchCurrentWar(tag.replace(/^#/, ''));
            });
        }

        // 绑定联赛刷新按钮 — 带冷却（与部落战刷新一致）
        if (el.leagueRefreshBtn) {
            el.leagueRefreshBtn.addEventListener('click', function() {
                if (!shared._currentClan) return;
                var tag = shared._currentClan.tag;
                var now = Date.now();
                var lastRefresh = 0;
                try { lastRefresh = parseInt(localStorage.getItem(getWarCooldownKey(tag)), 10) || 0; } catch(e) {}
                if (now - lastRefresh < REFRESH_COOLDOWN) {
                    var remain = Math.ceil((REFRESH_COOLDOWN - (now - lastRefresh)) / 1000);
                    showToast('刷新太频繁，请' + remain + '秒后再试', 1500);
                    return;
                }
                localStorage.setItem(getWarCooldownKey(tag), now);
                shared.refreshLeagueWar();
            });
        }

        // 国服战况设置按钮
        if (el.chinaWarSettingBtn) {
            el.chinaWarSettingBtn.addEventListener('click', function() {
                if (el.chinaWarModal) el.chinaWarModal.classList.remove('hidden');
            });
        }
        if (el.chinaWarCancel) {
            el.chinaWarCancel.addEventListener('click', function() {
                if (el.chinaWarModal) el.chinaWarModal.classList.add('hidden');
            });
        }
        if (el.chinaWarModal) {
            el.chinaWarModal.addEventListener('click', function(e) {
                if (e.target === el.chinaWarModal) el.chinaWarModal.classList.add('hidden');
            });
        }
        if (el.chinaWarConfirm) {
            el.chinaWarConfirm.addEventListener('click', function() {
                saveChinaWarState();
            });
        }
        // 国服重置按钮
        var chinaWarResetBtn = document.getElementById('china-war-reset-btn');
        if (chinaWarResetBtn) {
            chinaWarResetBtn.addEventListener('click', function() {
                if (shared._currentClan && shared._currentClan.type === 'china') {
                    localStorage.removeItem(getChinaWarStateKey(shared._currentClan.id));
                    if (el.chinaWarModal) el.chinaWarModal.classList.add('hidden');
                    showToast('已重置战况', 1500);
                    showChinaDetail(shared._currentClan);
                }
            });
        }
        // 国服成员弹窗绑定
        if (el.chinaMemberCancel) {
            el.chinaMemberCancel.addEventListener('click', function() { if (el.chinaMemberModal) el.chinaMemberModal.classList.add('hidden'); });
        }
        if (el.chinaMemberModal) {
            el.chinaMemberModal.addEventListener('click', function(e) { if (e.target === el.chinaMemberModal) el.chinaMemberModal.classList.add('hidden'); });
        }
        if (el.chinaMemberConfirm) {
            el.chinaMemberConfirm.addEventListener('click', confirmChinaMembers);
        }

        // 从 localStorage 恢复已保存的部落
        loadFromStorage();
        loadChinaFromStorage();

        // 初始显示
        updateUI();

        // 卡片倒计时定时刷新
        if (_cardTimer) { clearInterval(_cardTimer); _cardTimer = null; }
        _cardTimer = setInterval(updateCardCountdowns, 1000);

        return true;
    }

    // ====== 国服 ======

    function showChinaModal() {
        if (el.chinaModal) {
            el.chinaModal.classList.remove('hidden');
            el.chinaNameInput.value = '';
            el.chinaLevelInput.value = '';
            el.chinaNameInput.focus();
        }
    }

    function hideChinaModal() {
        if (el.chinaModal) el.chinaModal.classList.add('hidden');
    }

    function submitChinaClan() {
        var name = el.chinaNameInput ? el.chinaNameInput.value.trim() : '';
        var level = el.chinaLevelInput ? parseInt(el.chinaLevelInput.value, 10) : 0;
        if (!name) { showToast('请输入部落名称', 1500); return; }
        if (!level || level < 1) { showToast('请输入有效的部落等级', 1500); return; }

        var data = { name: name, level: level, type: 'china', id: 'china_' + Date.now() };
        chinaClanList.push(data);
        saveChinaToStorage();
        hideChinaModal();
        showToast('已添加国服部落「' + name + '」', 2000);
        updateUI();
    }

    function saveChinaToStorage() {
        try { localStorage.setItem(CHINA_STORAGE_KEY, JSON.stringify(chinaClanList)); } catch(e) {}
    }

    function loadChinaFromStorage() {
        try {
            var raw = localStorage.getItem(CHINA_STORAGE_KEY);
            if (raw) {
                var parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) chinaClanList = parsed;
            }
        } catch(e) { chinaClanList = []; }
    }

    function removeChinaClan(id) {
        chinaClanList = chinaClanList.filter(function(c) { return c.id !== id; });
        saveChinaToStorage();
        updateUI();
    }

    // ====== 下拉菜单 ======

    function toggleDropdown() {
        if (el.dropdown) {
            var isHidden = el.dropdown.classList.contains('hidden');
            el.dropdown.classList.toggle('hidden', !isHidden);
        }
    }

    function hideDropdown() {
        if (el.dropdown) el.dropdown.classList.add('hidden');
    }

    // ====== 删除模式 ======

    function toggleDeleteMode() {
        isDeleteMode = !isDeleteMode;
        if (el.deleteBtn) {
            el.deleteBtn.style.color = isDeleteMode ? '#ef4444' : '';
            el.deleteBtn.style.background = isDeleteMode ? '#fef2f2' : '';
            el.deleteBtn.title = isDeleteMode ? '退出删除模式' : '删除部落';
        }
        updateUI();
    }

    function exitDeleteMode() {
        if (isDeleteMode) toggleDeleteMode();
    }

    function confirmDeleteClan(tag, name) {
        _pendingDeleteTag = tag;
        _pendingDeleteName = name;
        if (el.deleteText) el.deleteText.textContent = '确定删除「' + name + '」吗？';
        showDeleteModal();
    }

    function showDeleteModal() {
        if (el.deleteModal) el.deleteModal.classList.remove('hidden');
    }

    function hideDeleteModal() {
        if (el.deleteModal) el.deleteModal.classList.add('hidden');
        _pendingDeleteTag = null;
        _pendingDeleteName = '';
    }

    // ====== 标签输入弹窗 ======

    function showTagModal() {
        if (el.tagModal) {
            el.tagModal.classList.remove('hidden');
            el.tagInput.value = '';
            el.tagInput.focus();
            el.tagConfirm.disabled = false;
            el.tagConfirm.textContent = '查询';
        }
    }

    function hideTagModal() {
        if (el.tagModal) el.tagModal.classList.add('hidden');
        isLoading = false;
    }

    function submitTag() {
        if (isLoading) return;
        var raw = el.tagInput ? el.tagInput.value.trim() : '';
        if (!raw) {
            showToast('请输入部落标签', 1500);
            return;
        }
        // 去掉 # 号，传给 API 后端会自动处理
        var cleanTag = raw.replace(/^#/, '').toUpperCase();
        if (!cleanTag) {
            showToast('部落标签不能为空', 1500);
            return;
        }
        isLoading = true;
        el.tagConfirm.disabled = true;
        el.tagConfirm.textContent = '查询中...';
        fetchClanInfo(cleanTag);
    }

    // ====== API 调用 ======

    function fetchClanInfo(tag) {
        var url = CLAN_API_BASE + '/api/coc/clan/' + encodeURIComponent(tag);

        fetch(url, {
            headers: { 'X-App-Token': APP_TOKEN }
        })
            .then(function(resp) {
                if (!resp.ok) {
                    if (resp.status === 403) throw new Error('访问被拒绝，API 令牌无效');
                    if (resp.status === 404) throw new Error('未找到该部落，请检查标签是否正确');
                    if (resp.status === 503) throw new Error('API 服务暂时不可用，请稍后再试');
                    throw new Error('查询失败 (HTTP ' + resp.status + ')');
                }
                return resp.json();
            })
            .then(function(data) {
                // 检查返回的数据是否包含必要字段
                if (!data || !data.tag || !data.name) {
                    throw new Error('返回数据异常，请重试');
                }
                // 成功：添加部落并保存
                addClan(data);
                hideTagModal();
                showToast('已添加部落「' + data.name + '」', 2000);
            })
            .catch(function(err) {
                showToast(err.message || '查询失败，请检查网络连接', 2500);
                hideTagModal();
            })
            .finally(function() {
                isLoading = false;
            });
    }

    // ====== 部落数据管理 ======

    function addClan(data) {
        data._badgeUpdated = Date.now();
        // 检查是否已存在相同标签的部落
        var existing = false;
        for (var i = 0; i < clanList.length; i++) {
            if (clanList[i].tag === data.tag) {
                // 更新已有记录
                clanList[i] = data;
                existing = true;
                break;
            }
        }
        if (!existing) {
            clanList.push(data);
        }
        saveToStorage();
        updateUI();
    }

    // ====== 部落图标刷新 ======

    var BADGE_STALE_MS = 24 * 60 * 60 * 1000;

    function refreshClanBadge(data) {
        if (data.type === 'china' || !data.tag) return;
        var ts = data._badgeUpdated || 0;
        if (ts && (Date.now() - ts) < BADGE_STALE_MS) return;
        var tag = data.tag.replace(/^#/, '');
        var url = CLAN_API_BASE + '/api/coc/clan/' + encodeURIComponent(tag);
        fetch(url, { headers: { 'X-App-Token': APP_TOKEN } })
            .then(function(r) { return r.ok ? r.json() : null; })
            .then(function(fresh) {
                if (!fresh || !fresh.badgeUrls) return;
                for (var i = 0; i < clanList.length; i++) {
                    if ((clanList[i].tag || '').replace(/^#/, '') === tag) {
                        clanList[i].badgeUrls = fresh.badgeUrls;
                        clanList[i]._badgeUpdated = Date.now();
                        if (shared._currentClan && (shared._currentClan.tag || '').replace(/^#/, '') === tag) {
                            shared._currentClan.badgeUrls = fresh.badgeUrls;
                            shared._currentClan._badgeUpdated = Date.now();
                        }
                        saveToStorage();
                        updateUI();
                        break;
                    }
                }
            })
            .catch(function() {});
    }

    function removeClan(tag) {
        clanList = clanList.filter(function(c) { return c.tag !== tag; });
        saveToStorage();
        updateUI();
    }

    // ====== 渲染 ======

    function renderClanCard(data) {
        var badgeUrl = '';
        if (data.badgeUrls && data.badgeUrls.small) {
            badgeUrl = data.badgeUrls.small;
        }

        var card = document.createElement('div');
        card.className = 'clan-card' + (isDeleteMode ? ' delete-mode' : '');
        card.setAttribute('data-tag', data.tag);

        if (isDeleteMode) {
            card.style.cursor = 'pointer';
            card.addEventListener('click', function() {
                confirmDeleteClan(data.tag, data.name);
            });
        } else {
            card.style.cursor = 'pointer';
            card.addEventListener('click', function() {
                showClanDetail(data);
            });
        }

        var badgeImg = document.createElement('img');
        badgeImg.className = 'clan-badge';
        if (badgeUrl) {
            badgeImg.src = badgeUrl;
            badgeImg.alt = data.name + ' 图标';
        } else {
            badgeImg.style.display = 'none';
        }

        var infoDiv = document.createElement('div');
        infoDiv.className = 'clan-info';

        var nameDiv = document.createElement('div');
        nameDiv.className = 'clan-name';
        nameDiv.textContent = data.name;

        infoDiv.appendChild(nameDiv);

        card.appendChild(badgeImg);
        card.appendChild(infoDiv);

        // 部落战倒计时
        var tagClean = (data.tag || '').replace(/^#/, '');
        card.setAttribute('data-war-tag', tagClean);
        var warInfo = document.createElement('div');
        warInfo.className = 'card-war-info';
        warInfo.style.cssText = 'text-align:center;flex-shrink:0;margin-left:auto;padding:4px 12px;background:#eff6ff;border-radius:10px;display:none;';
        warInfo.innerHTML = '<div class="card-war-label" style="font-size:11px;color:#6b7280;font-weight:500;"></div><div class="card-war-time" style="font-size:15px;font-weight:700;color:#1d4ed8;font-variant-numeric:tabular-nums;min-width:70px;"></div>';
        card.appendChild(warInfo);

        // 卡片右下角：结束时间标签（今天/明天/后天 HH:MM 结束）
        var endLabel = document.createElement('div');
        endLabel.className = 'card-end-label';
        endLabel.style.display = 'none';
        card.appendChild(endLabel);

        if (isDeleteMode) {
            var delBadge = document.createElement('div');
            delBadge.className = 'delete-badge';
            delBadge.textContent = '✕';
            card.appendChild(delBadge);
        }

        return card;
    }

    function renderChinaCard(data) {
        var card = document.createElement('div');
        card.className = 'clan-card' + (isDeleteMode ? ' delete-mode' : '');
        card.setAttribute('data-china-id', data.id);

        if (isDeleteMode) {
            card.style.cursor = 'pointer';
            card.addEventListener('click', function() {
                confirmDeleteClan(data.id, data.name);
            });
        } else {
            card.style.cursor = 'pointer';
            card.addEventListener('click', function() {
                showClanDetail(data);
            });
        }

        // 图标容器（相对定位，用于放置角标）
        var iconWrap = document.createElement('div');
        iconWrap.style.cssText = 'position:relative;width:56px;height:56px;flex-shrink:0;';

        var badgeImg = document.createElement('img');
        badgeImg.className = 'clan-badge';
        var level = data.level || 1;
        badgeImg.src = 'img/icons/clan/Border_' + level + '.webp';
        badgeImg.onerror = function() { this.src = 'img/icons/clan/Border.webp'; };
        iconWrap.appendChild(badgeImg);

        // 等级角标（九宫格位置2：中上）
        var lvBadge = document.createElement('div');
        lvBadge.textContent = level;
        lvBadge.style.cssText = 'position:absolute;top:7px;left:50%;transform:translateX(-50%);background:#000000;color:#fff;font-size:10px;font-weight:700;min-width:16px;height:16px;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:0 3px;box-shadow:0 1px 3px rgba(0,0,0,0.2);';
        iconWrap.appendChild(lvBadge);

        var infoDiv = document.createElement('div');
        infoDiv.className = 'clan-info';

        var nameDiv = document.createElement('div');
        nameDiv.className = 'clan-name';
        nameDiv.textContent = data.name;

        var metaDiv = document.createElement('div');
        metaDiv.className = 'clan-meta';
        metaDiv.textContent = '国服 · Lv.' + level;

        infoDiv.appendChild(nameDiv);
        infoDiv.appendChild(metaDiv);

        card.appendChild(iconWrap);
        card.appendChild(infoDiv);

        // 国服部落倒计时
        card.setAttribute('data-war-china-id', data.id);
        var warInfo = document.createElement('div');
        warInfo.className = 'card-war-info';
        warInfo.style.cssText = 'text-align:center;flex-shrink:0;margin-left:auto;padding:4px 12px;background:#eff6ff;border-radius:10px;display:none;';
        warInfo.innerHTML = '<div class="card-war-label" style="font-size:11px;color:#6b7280;font-weight:500;"></div><div class="card-war-time" style="font-size:15px;font-weight:700;color:#1d4ed8;font-variant-numeric:tabular-nums;min-width:70px;"></div>';
        card.appendChild(warInfo);

        // 卡片右下角：结束时间标签（今天/明天/后天 HH:MM 结束）
        var endLabel2 = document.createElement('div');
        endLabel2.className = 'card-end-label';
        endLabel2.style.display = 'none';
        card.appendChild(endLabel2);

        if (isDeleteMode) {
            var delBadge = document.createElement('div');
            delBadge.className = 'delete-badge';
            delBadge.textContent = '✕';
            card.appendChild(delBadge);
        }

        return card;
    }

    function updateUI() {
        var total = clanList.length + chinaClanList.length;
        if (total === 0) {
            // 显示空状态
            if (el.emptyState) el.emptyState.classList.remove('hidden');
            if (el.clanContent) el.clanContent.style.display = 'none';
        } else {
            // 隐藏空状态，显示内容
            if (el.emptyState) el.emptyState.classList.add('hidden');
            if (el.clanContent) el.clanContent.style.display = 'block';
            // 渲染所有卡片
            if (el.clanCards) {
                el.clanCards.innerHTML = '';
                // 国际服
                for (var i = 0; i < clanList.length; i++) {
                    var card = renderClanCard(clanList[i]);
                    el.clanCards.appendChild(card);
                }
                // 国服
                for (var ci = 0; ci < chinaClanList.length; ci++) {
                    var chinaCard = renderChinaCard(chinaClanList[ci]);
                    el.clanCards.appendChild(chinaCard);
                }
            }
        }
        // 初始刷新倒计时
        updateCardCountdowns();
    }

    function _parseCocTime(str) {
        if (!str) return 0;
        return new Date(str.slice(0,4)+'-'+str.slice(4,6)+'-'+str.slice(6,8)+'T'+str.slice(9,11)+':'+str.slice(11,13)+':'+str.slice(13,15)+'.'+str.slice(16,19)+'Z').getTime();
    }

    // 结束时间标签：今天/明天/后天 HH:MM 结束（更远显示 M/D HH:MM 结束）
    function formatEndLabel(endMs) {
        var d = new Date(endMs);
        var now = new Date();
        var dayDiff = Math.floor((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000);
        var hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        if (dayDiff === 0) return '今天 ' + hm + ' 结束';
        if (dayDiff === 1) return '明天 ' + hm + ' 结束';
        if (dayDiff === 2) return '后天 ' + hm + ' 结束';
        return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hm + ' 结束';
    }

    function updateCardCountdowns() {
        var clanPage = document.getElementById('clan-page');
        if (!clanPage || clanPage.classList.contains('hidden')) return;
        var cards = el.clanCards;
        if (!cards) return;
        var infos = cards.querySelectorAll('.card-war-info');
        for (var i = 0; i < infos.length; i++) {
            var info = infos[i];
            var card = info.parentElement;
            var tag = card.getAttribute('data-war-tag');
            var chinaId = card.getAttribute('data-war-china-id');
            var endMs = 0, state = '', name = '';

            if (tag) {
                var raw = localStorage.getItem('clash_war_' + tag);
                if (raw) {
                    try {
                        var war = JSON.parse(raw).data;
                        if (war && (war.state === 'preparation' || war.state === 'inWar')) {
                            var startMs = _parseCocTime(war.startTime);
                            var warEndMs = _parseCocTime(war.endTime);
                            var nowMs = Date.now();
                            if (war.state === 'preparation' && startMs > nowMs) {
                                endMs = startMs;
                                state = 'preparation';
                            } else if (warEndMs > nowMs) {
                                endMs = warEndMs;
                                state = 'inWar';
                            }
                        }
                    } catch(e) {}
                }
            } else if (chinaId) {
                var raw2 = localStorage.getItem('china_war_state_' + chinaId);
                if (raw2) {
                    try {
                        var w = JSON.parse(raw2);
                        if (w && w.endTime) {
                            var nowMs2 = Date.now();
                            if (w.state === 'preparation') {
                                if (w.endTime > nowMs2) {
                                    endMs = w.endTime;
                                    state = 'preparation';
                                } else {
                                    // 准备日已结束，自动过渡到战斗日
                                    var warEnd = w.endTime + 24 * 3600 * 1000;
                                    var newState = { state: 'inWar', startTime: w.endTime, endTime: warEnd, remainingMs: 24 * 3600 * 1000 };
                                    localStorage.setItem('china_war_state_' + chinaId, JSON.stringify(newState));
                                    endMs = warEnd;
                                    state = 'inWar';
                                }
                            } else if (w.state === 'inWar') {
                                if (w.endTime > nowMs2) {
                                    endMs = w.endTime;
                                    state = 'inWar';
                                } else {
                                    // 战斗日已结束，清除状态
                                    localStorage.removeItem('china_war_state_' + chinaId);
                                }
                            }
                        }
                    } catch(e) {}
                }
            }

            if (endMs > 0 && state) {
                var nowMs3 = Date.now();
                var diff = endMs - nowMs3;
                if (diff > 0) {
                    info.style.display = '';
                    var label = info.querySelector('.card-war-label');
                    var timeEl = info.querySelector('.card-war-time');
                    var endEl = card.querySelector('.card-end-label');
                    label.textContent = state === 'preparation' ? '准备日' : '战斗日';
                    label.style.color = state === 'preparation' ? '#6b7280' : '#000';
                    info.style.background = state === 'preparation' ? '#eff6ff' : '#ede9fe';
                    var totalSec = Math.floor(diff / 1000);
                    var h = Math.floor(totalSec / 3600);
                    var m = Math.floor((totalSec % 3600) / 60);
                    var s = totalSec % 60;
                    timeEl.textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
                    if (endEl) { endEl.textContent = formatEndLabel(endMs); endEl.style.display = ''; }
                } else {
                    info.style.display = 'none';
                }
            } else if (tag) {
                // 联赛阶段（24h 规律推算，纯本地零请求；自动 D1→D2→…→D7 推进）
                var ph = shared.getLeaguePhase(tag);
                if (ph) {
                    var diffL = ph.target - Date.now();
                    if (diffL > 0) {
                        info.style.display = '';
                        var labelL = info.querySelector('.card-war-label');
                        var timeElL = info.querySelector('.card-war-time');
                        var endElL = card.querySelector('.card-end-label');
                        labelL.textContent = ph.label;
                        labelL.style.color = ph.kind === 'prep' ? '#6b7280' : '#000';
                        info.style.background = ph.kind === 'prep' ? '#eff6ff' : '#ede9fe';
                        var tsL = Math.floor(diffL / 1000);
                        var hL = Math.floor(tsL / 3600);
                        var mL = Math.floor((tsL % 3600) / 60);
                        var sL = tsL % 60;
                        timeElL.textContent = String(hL).padStart(2, '0') + ':' + String(mL).padStart(2, '0') + ':' + String(sL).padStart(2, '0');
                        if (endElL) { endElL.textContent = formatEndLabel(ph.target); endElL.style.display = ''; }
                    } else {
                        info.style.display = 'none';
                    }
                } else {
                    info.style.display = 'none';
                }
            } else {
                info.style.display = 'none';
            }
            // 无倒计时时同步隐藏右下角结束标签
            if (info.style.display === 'none') {
                var endHide = card.querySelector('.card-end-label');
                if (endHide) endHide.style.display = 'none';
            }
        }
    }

    // ====== 详情页 ======

    var LEAGUE_MODE_KEY = 'clash_clan_mode';
    var _modeMap = shared._modeMap = {};

    function loadModeMap() {
        try {
            var raw = localStorage.getItem(LEAGUE_MODE_KEY);
            if (raw) {
                var p = JSON.parse(raw);
                if (p && typeof p === 'object') _modeMap = shared._modeMap = p;
            }
        } catch (e) { _modeMap = shared._modeMap = {}; }
    }

    function saveModeMap() {
        try { localStorage.setItem(LEAGUE_MODE_KEY, JSON.stringify(_modeMap)); } catch (e) {}
    }

    function showClanDetail(data) {
        shared._currentClan = data;
        shared.resetLeagueState();

        // 国服/国际服切换按钮
        if (data.type === 'china') {
            var detailMoreWrap = document.getElementById('detail-more-wrap');
            if (detailMoreWrap) detailMoreWrap.style.display = 'none';
            if (el.detailToolbar) el.detailToolbar.style.display = 'none';
            if (el.chinaWarSettingBtn) el.chinaWarSettingBtn.style.display = '';
            if (el.modeTabs) el.modeTabs.classList.add('hidden');
            showChinaDetail(data);
            return;
        }
        if (el.modeTabs) el.modeTabs.classList.remove('hidden');
        // 读取该部落记忆的模式（每部落独立，刷新/重启后仍生效）
        shared._leagueMode = _modeMap[(data.tag || '').replace(/^#/, '')] === 'league';
        shared.updateModeTabs();
        var detailMoreWrap2 = document.getElementById('detail-more-wrap');
        if (detailMoreWrap2) detailMoreWrap2.style.display = '';
        if (el.chinaWarSettingBtn) el.chinaWarSettingBtn.style.display = 'none';
        // 隐藏列表
        var listTopBar = el.root.querySelector('.top-bar');
        if (listTopBar) listTopBar.style.display = 'none';
        if (el.emptyState) el.emptyState.classList.add('hidden');
        if (el.clanContent) el.clanContent.style.display = 'none';

        // 显示详情页
        if (el.detailPage) el.detailPage.style.display = 'flex';
        if (el.detailName) el.detailName.textContent = data.name || '';
        if (el.detailBadge) {
            var b = (data.badgeUrls && data.badgeUrls.small) ? data.badgeUrls.small : '';
            el.detailBadge.src = b;
            el.detailBadge.style.display = b ? 'inline' : 'none';
        }

        exitDeleteMode();

        // 后台异步刷新部落图标（超过24h才拉取）
        refreshClanBadge(data);

        // 重置所有视图 → 显示加载中
        hideAllDetailViews();
        if (el.detailLoading) el.detailLoading.classList.remove('hidden');

        // 清除旧倒计时
        if (shared._countdownTimer) { clearInterval(shared._countdownTimer); shared._countdownTimer = null; }

        if (shared._leagueMode) {
            // 联赛模式：直接加载联赛分组（标签选择决定进入页面）
            shared.loadLeagueMine((data.tag || '').replace(/^#/, ''));
            shared._leagueClanTag = (shared._currentClan.tag || '').indexOf('#') === 0 ? shared._currentClan.tag : '#' + shared._currentClan.tag;
            shared.fetchLeagueGroup(shared._leagueClanTag, false);
            return;
        }

        // 部落战：优先使用缓存
        var cleanTag = data.tag.replace(/^#/, '');
        var cached = getCachedWar(cleanTag);
        var nowMs = Date.now();
        var needFetch = true;

        if (cached && cached.data) {
            var warState = cached.data.state;
            var cacheTtl = CACHE_TTL_NOTINWAR;
            if (warState === 'preparation') {
                cacheTtl = CACHE_TTL_PREPARATION;
            } else if (warState === 'inWar') {
                cacheTtl = CACHE_TTL_INWAR;
            }

            if (cacheTtl > 0 && (nowMs - cached.ts) < cacheTtl) {
                // 缓存有效，直接渲染
                needFetch = false;
                handleWarResponse(cached.data);
            }
        }

        if (needFetch) {
            // 无缓存或过期，请求服务器
            fetchCurrentWar(cleanTag);
        }
    }

    // ====== 国服详情页 ======

    function getChinaWarStateKey(id) { return 'china_war_state_' + id; }

    function getChinaWarState(id) {
        try {
            var raw = localStorage.getItem(getChinaWarStateKey(id));
            if (raw) return JSON.parse(raw);
        } catch(e) {}
        return null;
    }

    function saveChinaWarState() {
        if (!shared._currentClan || shared._currentClan.type !== 'china') {
            showToast('请先进入国服部落详情页', 1500);
            return;
        }
        var stateEl = document.querySelector('#china-war-modal input[name="china-war-state"]:checked');
        if (!stateEl) {
            showToast('请选择战况状态', 1500);
            return;
        }
        var state = stateEl.value;
        var hoursInput = document.getElementById('china-war-hours');
        var minutesInput = document.getElementById('china-war-minutes');
        var h = parseInt(hoursInput ? hoursInput.value : 0, 10) || 0;
        var m = parseInt(minutesInput ? minutesInput.value : 0, 10) || 0;
        var totalSec = h * 3600 + m * 60;
        if (totalSec <= 0) { showToast('请设置剩余时长', 1500); return; }
        var now = Date.now();
        var warData = {
            state: state,
            startTime: now,
            remainingMs: totalSec * 1000,
            endTime: now + totalSec * 1000
        };
        try {
            localStorage.setItem(getChinaWarStateKey(shared._currentClan.id), JSON.stringify(warData));
        } catch(e) {
            showToast('保存失败：' + (e.message || '存储异常'), 2000);
            return;
        }
        if (el.chinaWarModal) el.chinaWarModal.classList.add('hidden');
        showToast('战况已设置', 1500);
        showChinaDetail(shared._currentClan);
    }

    function showChinaDetail(data) {
        // 隐藏列表
        var listTopBar = el.root.querySelector('.top-bar');
        if (listTopBar) listTopBar.style.display = 'none';
        if (el.emptyState) el.emptyState.classList.add('hidden');
        if (el.clanContent) el.clanContent.style.display = 'none';

        if (el.detailPage) el.detailPage.style.display = 'flex';
        if (el.detailName) el.detailName.textContent = data.name || '';

        exitDeleteMode();
        hideAllDetailViews();

        // 国服详情直接渲染到 detail-content
        if (el.detailContent) {
            el.detailContent.classList.remove('hidden');
            el.detailContent.innerHTML = '';

            var level = data.level || 1;

            // 图标 + 等级角标
            var iconWrap = document.createElement('div');
            iconWrap.style.cssText = 'position:relative;display:inline-block;margin:40px auto 8px;';
            var icon = document.createElement('img');
            icon.src = 'img/icons/clan/Border_' + level + '.webp';
            icon.onerror = function() { this.src = 'img/icons/clan/Border.webp'; };
            icon.style.cssText = 'width:80px;height:80px;border-radius:16px;display:block;';
            iconWrap.appendChild(icon);
            var lvBadge = document.createElement('div');
            lvBadge.textContent = level;
            lvBadge.style.cssText = 'position:absolute;top:12px;left:50%;transform:translateX(-50%);background:#000000;color:#fff;font-size:11px;font-weight:700;min-width:18px;height:18px;border-radius:9px;display:flex;align-items:center;justify-content:center;padding:0 4px;box-shadow:0 1px 3px rgba(0,0,0,0.3);z-index:2;';
            iconWrap.appendChild(lvBadge);

            // 名称
            var nameEl = document.createElement('p');
            nameEl.textContent = data.name || '';
            nameEl.style.cssText = 'font-size:18px;font-weight:600;color:#1f2937;text-align:center;margin-bottom:4px;';

            // 状态标签
            var stateEl = document.createElement('p');
            stateEl.id = 'china-detail-state-label';
            stateEl.style.cssText = 'font-size:16px;font-weight:700;color:#3b82f6;text-align:center;margin-bottom:4px;';

            // 倒计时
            var cdBox = document.createElement('div');
            cdBox.id = 'china-detail-cd-box';
            cdBox.style.cssText = 'text-align:center;margin-top:4px;padding:4px 32px;background:#eff6ff;border-radius:10px;display:inline-block;';
            var cdLabel = document.createElement('p');
            cdLabel.id = 'china-detail-cd-label';
            cdLabel.style.cssText = 'font-size:12px;color:#6b7280;margin-bottom:2px;';
            var cdTime = document.createElement('p');
            cdTime.id = 'china-detail-cd-time';
            cdTime.style.cssText = 'font-size:24px;font-weight:700;color:#1d4ed8;font-variant-numeric:tabular-nums;';
            cdBox.appendChild(cdLabel);
            cdBox.appendChild(cdTime);

            var container = document.createElement('div');
            container.style.cssText = 'display:flex;flex-direction:column;align-items:center;padding:20px;';
            container.appendChild(iconWrap);
            container.appendChild(nameEl);
            container.appendChild(stateEl);
            container.appendChild(cdBox);

            // 添加成员按钮
            var addMemberBtn = document.createElement('button');
            addMemberBtn.id = 'china-add-member-btn';
            addMemberBtn.textContent = '+ 添加成员';
            addMemberBtn.style.cssText = 'margin-top:12px;padding:6px 20px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-size:13px;cursor:pointer;';
            addMemberBtn.addEventListener('click', function() { showChinaMemberPicker(data.id); });
            container.appendChild(addMemberBtn);

            // 成员卡片容器
            var memberArea = document.createElement('div');
            memberArea.id = 'china-members-area';
            memberArea.style.cssText = 'margin-top:12px;width:100%;';
            container.appendChild(memberArea);

            el.detailContent.appendChild(container);

            // 渲染已保存的成员
            renderChinaMembers(data);

            // 读取已保存的战争状态
            var warState = getChinaWarState(data.id);

            if (warState) {
                cdBox.style.background = warState.state === 'preparation' ? '#eff6ff' : '#ede9fe';
                if (warState.state === 'preparation') {
                    stateEl.textContent = '准备日';
                    stateEl.style.color = '#3b82f6';
                    cdLabel.textContent = '距战斗日开始';
                    cdLabel.style.color = '#6b7280';
                    var endMs = warState.endTime || (Date.now() + 3600000);
                    updateChinaCountdown(endMs, function() {
                        var newState = { state: 'inWar', startTime: endMs, endTime: endMs + 24*3600*1000, remainingMs: 24*3600*1000 };
                        localStorage.setItem(getChinaWarStateKey(data.id), JSON.stringify(newState));
                        showChinaDetail(data);
                    });
                } else if (warState.state === 'inWar') {
                    stateEl.textContent = '战斗日';
                    stateEl.style.color = '#000';
                    cdLabel.textContent = '距战斗日结束';
                    cdLabel.style.color = '#000';
                    var endMs = warState.endTime || (Date.now() + 3600000);
                    updateChinaCountdown(endMs, function() {
                        localStorage.removeItem(getChinaWarStateKey(data.id));
                        showChinaDetail(data);
                    });
                }
            } else {
                stateEl.textContent = '未开战';
                stateEl.style.color = '#9ca3af';
                cdBox.style.display = 'none';
            }
        }
    }

    function updateChinaCountdown(targetMs, onEnd) {
        var cdTime = document.getElementById('china-detail-cd-time');
        function tick() {
            if (!cdTime) return;
            var diff = targetMs - Date.now();
            if (diff <= 0) {
                cdTime.textContent = '已结束';
                if (shared._countdownTimer) { clearInterval(shared._countdownTimer); shared._countdownTimer = null; }
                if (onEnd) onEnd();
                return;
            }
            var totalSec = Math.floor(diff / 1000);
            var h = Math.floor(totalSec / 3600);
            var m = Math.floor((totalSec % 3600) / 60);
            var s = totalSec % 60;
            cdTime.textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
        }
        tick();
        if (shared._countdownTimer) { clearInterval(shared._countdownTimer); shared._countdownTimer = null; }
        shared._countdownTimer = setInterval(tick, 1000);
    }

    // ====== 国服详情页结束 ======

    // ====== 国服成员管理 ======

    function getChinaMembersKey(id) { return 'china_members_' + id; }
    function getChinaMembers(id) { try { var r = localStorage.getItem(getChinaMembersKey(id)); if (r) return JSON.parse(r); } catch(e) {} return []; }
    function saveChinaMembers(id, m) { try { localStorage.setItem(getChinaMembersKey(id), JSON.stringify(m)); } catch(e) {} }

    function showChinaMemberPicker(clanId) {
        if (!el.chinaMemberList || !el.chinaMemberModal) return;
        var existing = getChinaMembers(clanId), existingTags = {};
        for (var ei = 0; ei < existing.length; ei++) existingTags[existing[ei].tag] = true;
        el.chinaMemberList.innerHTML = '';
        try {
            var accounts = CocTool.state.accounts;
            var notes = CocTool.state.accountNotes;
            for (var tag in accounts) { if (!accounts.hasOwnProperty(tag)) continue;
                    var acct = accounts[tag], th = 1, items = acct.buildings || [];
                    for (var bi = 0; bi < items.length; bi++) { if (items[bi].data === 1000001) { th = items[bi].lvl || 1; break; } }
                    var name = notes[tag] || tag, row = document.createElement('div');
                    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f3f4f6;';
                    var icon = document.createElement('img'); icon.src = 'img/icons/buildings/1000001_' + th + '.webp';
                    icon.style.cssText = 'width:24px;height:24px;object-fit:contain;flex-shrink:0;'; icon.onerror = function() { this.style.display = 'none'; };
                    var label = document.createElement('span'); label.textContent = name;
                    label.style.cssText = 'flex:1;font-size:14px;color:#374151;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
                    var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!existingTags[tag];
                    cb.style.cssText = 'width:18px;height:18px;flex-shrink:0;';
                    cb.setAttribute('data-tag', tag); cb.setAttribute('data-name', name); cb.setAttribute('data-th', th);
                    row.appendChild(icon); row.appendChild(label); row.appendChild(cb);
                    el.chinaMemberList.appendChild(row);
                }
        } catch(e) {}
        el.chinaMemberModal.classList.remove('hidden'); el._chinaMemberClanId = clanId;
    }

    function confirmChinaMembers() {
        if (!el.chinaMemberList || !el.chinaMemberModal) return;
        var clanId = el._chinaMemberClanId || '', cbs = el.chinaMemberList.querySelectorAll('input[type="checkbox"]'), selected = [];
        for (var ci = 0; ci < cbs.length; ci++) { if (cbs[ci].checked) { selected.push({ tag: cbs[ci].getAttribute('data-tag'), name: cbs[ci].getAttribute('data-name'), th: parseInt(cbs[ci].getAttribute('data-th'), 10) || 1 }); } }
        if (clanId) saveChinaMembers(clanId, selected);
        el.chinaMemberModal.classList.add('hidden');
        if (shared._currentClan) showChinaDetail(shared._currentClan);
    }

    function renderChinaMembers(data) {
        var area = document.getElementById('china-members-area');
        if (!area) return;
        var members = getChinaMembers(data.id);
        area.innerHTML = '';
        if (members.length === 0) return;
        var warState = getChinaWarState(data.id), canToggle = warState && warState.state === 'inWar';
        var attackStatuses = {};
        try { var r2 = localStorage.getItem('china_atk_status_' + data.id); if (r2) attackStatuses = JSON.parse(r2); } catch(e) {}
        for (var mi = 0; mi < members.length; mi++) {
            var m = members[mi], card = document.createElement('div');
            card.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 6px;background:#ffffff;border-radius:8px;margin-bottom:4px;box-shadow:0 1px 2px rgba(0,0,0,0.05);';
            var icon = document.createElement('img'); icon.src = 'img/icons/buildings/1000001_' + (m.th || 1) + '.webp';
            icon.style.cssText = 'width:26px;height:26px;object-fit:contain;flex-shrink:0;';
            var nameEl = document.createElement('span'); nameEl.textContent = m.name || '';
            nameEl.style.cssText = 'flex:1;font-size:14px;color:#374151;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            var statusEl = document.createElement('span');
            if (canToggle) {
                var isAttacked = !!attackStatuses[m.tag];
                statusEl.textContent = isAttacked ? '已进攻' : '未进攻';
                statusEl.style.cssText = 'font-size:12px;padding:2px 8px;border-radius:4px;cursor:pointer;' + (isAttacked ? 'background:#10b981;color:#fff;' : 'background:#e5e7eb;color:#6b7280;');
                (function(tag, elm, cid) {
                    elm.addEventListener('click', function() {
                        var statuses = {};
                        try { var r = localStorage.getItem('china_atk_status_' + cid); if (r) statuses = JSON.parse(r); } catch(e) {}
                        if (statuses[tag]) { delete statuses[tag]; elm.textContent = '未进攻'; elm.style.cssText = 'font-size:12px;padding:2px 8px;border-radius:4px;cursor:pointer;background:#e5e7eb;color:#6b7280;'; }
                        else { statuses[tag] = true; elm.textContent = '已进攻'; elm.style.cssText = 'font-size:12px;padding:2px 8px;border-radius:4px;cursor:pointer;background:#10b981;color:#fff;'; }
                        try { localStorage.setItem('china_atk_status_' + cid, JSON.stringify(statuses)); } catch(e) {}
                    });
                })(m.tag, statusEl, data.id);
            } else {
                statusEl.textContent = '未进攻';
                statusEl.style.cssText = 'font-size:12px;padding:2px 8px;border-radius:4px;background:#e5e7eb;color:#6b7280;cursor:default;';
            }
            card.appendChild(icon); card.appendChild(nameEl); card.appendChild(statusEl);
            area.appendChild(card);
        }
    }

    function hideAllDetailViews(){CocTool.warView.hideAllDetailViews()}

    function goBack() {
        if (shared._currentClan) {
            showListView();
            return true;
        }
        return false;
    }

    function showListView() {
        shared._currentClan = null;
        shared.resetLeagueState();
        // 隐藏详情页
        if (el.detailPage) {
            el.detailPage.style.display = 'none';
        }
        // 恢复列表顶部栏
        var listTopBar = el.root.querySelector('.top-bar');
        if (listTopBar) listTopBar.style.display = '';
        updateUI();
    }

    // ====== 部落战 ======

    function fetchCurrentWar(tag) {
        var url = CLAN_API_BASE + '/api/coc/currentwar/' + encodeURIComponent(tag);
        fetch(url, {
            headers: { 'X-App-Token': APP_TOKEN }
        })
            .then(function(r) {
                return r.json().then(function(body) {
                    // 未公开部落：官方返回 403 + {"reason":"accessDenied"}
                    if (r.status === 403 && body && body.reason === 'accessDenied') {
                        var e = new Error('accessDenied');
                        e.accessDenied = true;
                        throw e;
                    }
                    if (!r.ok) throw new Error('HTTP ' + r.status);
                    return body;
                });
            })
            .then(function(data) {
                setCachedWar(tag, data);
                handleWarResponse(data);
                try {
                    var svc = CocTool.features.services;
                    if (svc && svc.pushSchedule) svc.pushSchedule();
                } catch(e) {}
            })
            .catch(function(err) {
                hideAllDetailViews();
                if (err && err.accessDenied) {
                    // 对战日志未公开：显示专属文案
                    if (el.detailEmpty) {
                        var p = el.detailEmpty.querySelector('p');
                        if (p) p.textContent = '此部落对战日志未公开';
                        el.detailEmpty.classList.remove('hidden');
                    }
                    return;
                }
                if (el.detailEmpty) {
                    var p2 = el.detailEmpty.querySelector('p');
                    if (p2 && p2.textContent !== '此部落对战日志未公开') p2.textContent = '暂无数据';
                    el.detailEmpty.classList.remove('hidden');
                }
                showToast('获取部落战信息失败', 2000);
            });
    }

    function handleWarResponse(data) {
        hideAllDetailViews();

        if (data.state === 'notInWar') {
            showNotInWar();
            return;
        }

        if (data.state === 'preparation') {
            shared.showPreparationView(data);
            return;
        }

        // inWar / warEnded：共用准备日视图
        if (data.state === 'inWar' || data.state === 'warEnded') {
            shared.showPreparationView(data);
            return;
        }

        // 未知状态
        if (el.detailEmpty) el.detailEmpty.classList.remove('hidden');
    }

    function showNotInWar() {
        if (el.detailNotWar) {
            el.detailNotWar.classList.remove('hidden');
            if (el.detailNotWarBadge && shared._currentClan && shared._currentClan.badgeUrls && shared._currentClan.badgeUrls.large) {
                el.detailNotWarBadge.src = shared._currentClan.badgeUrls.large;
            }
        }
    }
    function saveToStorage() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(clanList));
        } catch (e) {
            // storage 满或不可用
        }
    }

    function loadFromStorage() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                var parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    clanList = parsed;
                }
            }
        } catch (e) {
            clanList = [];
        }
    }

    // ====== Toast ======

    function showToast(msg, duration) {
        duration = duration || 2000;
        if (el.toastText) el.toastText.textContent = msg;
        if (el.toast) {
            el.toast.classList.remove('hidden');
            if (toastTimer) clearTimeout(toastTimer);
            toastTimer = setTimeout(function() {
                if (el.toast) el.toast.classList.add('hidden');
            }, duration);
        }
    }

    // ====== 云端恢复部落（services.js 调用）：仅补缺失的国际服部落 ======
    // tags: 备份中的国际服部落标签数组；已存在跳过，缺失的逐个拉 API 添加
    function restoreClansFromTags(tags) {
        if (!Array.isArray(tags) || tags.length === 0) return Promise.resolve(0);
        if (!_initialized) initClan();   // 确保 clanList 已从 storage 加载，"已存在"判断才准确
        var missing = [];
        for (var i = 0; i < tags.length; i++) {
            var tag = tags[i];
            if (!tag) continue;
            var exists = false;
            for (var j = 0; j < clanList.length; j++) {
                if (clanList[j].tag === tag) { exists = true; break; }
            }
            if (!exists) missing.push(tag);
        }
        if (missing.length === 0) return Promise.resolve(0);
        var pending = missing.map(function(tag) {
            var cleanTag = tag.replace(/^#/, '');
            return fetch(CLAN_API_BASE + '/api/coc/clan/' + encodeURIComponent(cleanTag),
                { headers: { 'X-App-Token': APP_TOKEN } })
                .then(function(resp) { return resp.ok ? resp.json() : null; })
                .then(function(data) {
                    if (data && data.tag && data.name) {
                        addClan(data);
                        return 1;
                    }
                    return 0;
                })
                .catch(function() { return 0; });
        });
        return Promise.all(pending).then(function(results) {
            var added = 0;
            for (var k = 0; k < results.length; k++) added += results[k];
            return added;
        });
    }

    function parseCocTime(str){return CocTool.warView.parseCocTime(str)}

    CocTool.features.clan = Object.freeze({ init: initClan, goBack: goBack, restoreClansFromTags: restoreClansFromTags });
})(window);
