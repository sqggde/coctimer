/**
 * 获取持续指派项目的阶段图标（⚡ 加速 / ⌛ 等待）
 */
function getItemPhaseIcon(item, data) {
    if (item.helper_recurrent !== true) return '';
    const helpers = data.helpers || [];
    const timestamp = data.timestamp || Math.floor(Date.now() / 1000);
    const now = Math.floor(Date.now() / 1000);
    const elapsed = now - timestamp;

    let helper;
    if (["buildings", "heroes", "traps", "guardians"].includes(item.category)) {
        helper = helpers.find(h => h.data === 124000000 || h.data === 93000000);
    } else if (["units", "siege_machines", "spells"].includes(item.category)) {
        helper = helpers.find(h => h.data === 124000001 || h.data === 93000001);
    }
    if (!helper) return '';

    const initialCooldown = helper.helper_cooldown || 82800;
    if (elapsed < initialCooldown) {
        // 还在初始冷却，未进入循环 — 显示沙漏
        return ' <span title="等待助手冷却">⌛</span>';
    }

    const cycleElapsed = (elapsed - initialCooldown) % 82800;
    if (cycleElapsed < 3600) {
        return ' <span title="助手加速中">⚡</span>';
    }
    return ' <span title="助手冷却中">⌛</span>';
}

// ===== UI 渲染 — 更新页面展示 =====
function displayUpgradingItems(items, data) {
    Object.values(categoryContainers).forEach(c => { if(c) c.innerHTML = ''; });
    const counts = { buildings:0, lab:0, pets:0, buildings2:0, units2:0 };
    const denominators = getCategoryDenominators(data);
    if (items.length === 0) {
        upgradesCountBadge.classList.add('hidden');
        // 鍗充娇娌℃湁鍗囩骇椤圭洰锛屼粛鐒舵樉绀哄悇鍒嗙被琛岋紙0/鍒嗘瘝锛??
        for (let g of Object.keys(counts)) {
            const badge = categoryCountBadges[g];
            const parentDiv = categoryContainers[g]?.parentElement;
            if(badge) { badge.textContent = '0/' + denominators[g]; badge.classList.remove('hidden'); }
            if(parentDiv) parentDiv.classList.remove('hidden');
        }
        upgradesContainer.classList.remove('hidden');
        emptyState.classList.add('hidden');
        return;
    }
    upgradesCountBadge.textContent = items.length;
    upgradesCountBadge.classList.remove('hidden');
    const grouped = { buildings:[], lab:[], pets:[], buildings2:[], units2:[] };
    items.forEach(it => { const g = getItemCategory(it); grouped[g].push(it); });
    for (let g in grouped) {
        grouped[g].sort((a,b)=> calculateCompletionTimestamp(a,data) - calculateCompletionTimestamp(b,data));
        grouped[g].forEach(item => {
            counts[g]++;
            const completionTs = calculateCompletionTimestamp(item, data);
            const remainingSec = Math.max(0, completionTs - (Date.now()/1000));
            const remainFmt = formatRemainingTime(remainingSec);
            const doneTimeFmt = formatDateTime(completionTs);
            const name = getItemName(item.data);
            const originCat = CATEGORY_NAMES[item.category] || item.category;
            const icon = CATEGORY_ICONS[item.category] || "fa-question";
            let textColor = 'text-primary', borderClr = 'border-primary';
            if (remainingSec <= 0) { textColor = 'text-success'; borderClr = 'border-success'; }
            else if (remainingSec < 1800) { textColor = 'text-danger_red'; borderClr = 'border-danger_red'; }
            else if (remainingSec < 3600) { textColor = 'text-warning_orangered'; borderClr = 'border-warning_orangered'; }
            else if (remainingSec < 14400) { textColor = 'text-warning_orange'; borderClr = 'border-warning_orange'; }
            else if (remainingSec < 28800) { textColor = 'text-warning_yellow'; borderClr = 'border-warning_yellow'; }
            const card = document.createElement('div');
            card.setAttribute('data-unique', item.uniqueId);
            const sleepClass = isInSleepRange(completionTs) ? ' sleep-highlight' : '';
            card.className = `bg-gray-50 rounded-lg p-1 border-l-4 border-r-4 ${borderClr} hover:shadow-md transition-all duration-200 flex items-center justify-between ${remainingSec <= 0 ? 'cursor-pointer' : ''}${sleepClass}`;
            if (remainingSec <= 0) {
                card.addEventListener('click', () => {
                    if (confirm(`确认删除已完成项目「${name}」？`)) {
                        const cat = item.category;
                        const arr = data[cat];
                        if (arr && Array.isArray(arr)) {
                            const idx = arr.findIndex(a => a.data === item.data && a.timer === item.timer && a.lvl === item.lvl);
                            if (idx !== -1) {
                                arr.splice(idx, 1);
                                saveToLocalStorage();
                                refreshCurrentAccountDisplay();
                            }
                        }
                    }
                });
            }
            const phaseIcon = getItemPhaseIcon(item, data);
            card.innerHTML = `<div class="flex items-center"><div class="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mr-3"><i class="fa ${icon} text-primary text-sm"></i></div><div><h3 class="font-medium text-gray-800" style="font-size:13px;">${escapeHtml(name)}${phaseIcon}</h3><p class="text-xs text-gray-500">${originCat} · 等级 ${item.lvl} → ${item.lvl+1}</p></div></div><div class="text-right"><div class="text-sm ${textColor}" style="font-size:14px;">${remainFmt}</div><div class="text-xs text-gray-500">${doneTimeFmt}</div></div>`;
            if (categoryContainers[g]) categoryContainers[g].appendChild(card);
        });
    }
    for (let g of Object.keys(counts)) {
        const badge = categoryCountBadges[g];
        const parentDiv = categoryContainers[g]?.parentElement;
        if(badge) { badge.textContent = (counts[g] || 0) + '/' + denominators[g]; badge.classList.remove('hidden'); } if(parentDiv) parentDiv.classList.remove('hidden');
    }
    // 更新分类概览卡片
    updateCategorySummary(counts, denominators);
    upgradesContainer.classList.remove('hidden');
    emptyState.classList.add('hidden');
}

let updateTimer = null;
let sortTimer = null;

/**
 * 更新国服 Builder Boost 切换开关（10x / 24x）
 */
function updateBuilderBoostToggle(data) {
    const toggle = document.getElementById('builder-boost-toggle');
    const btn = document.getElementById('builder-boost-toggle-btn');
    if (!toggle || !btn) return;

    // 检测国服：工人助手 ID === 124000000
    const helpers = data.helpers || [];
    const isCn = helpers.some(h => h.data === 124000000);
    if (!isCn) {
        toggle.classList.add('hidden');
        return;
    }

    toggle.classList.remove('hidden');
    const is24Mode = settings.builderBoostMode24 && settings.builderBoostMode24[data.tag];
    btn.textContent = is24Mode ? '24x' : '10x';
    btn.className = is24Mode
        ? 'text-xs font-medium px-2 py-0.5 rounded-full border border-orange-500 text-orange-500 bg-orange-50 hover:bg-orange-100 transition-all duration-200'
        : 'text-xs font-medium px-2 py-0.5 rounded-full border border-blue-500 text-blue-500 bg-blue-50 hover:bg-blue-100 transition-all duration-200';
}

function refreshCurrentAccountDisplay() {
    if (!currentAccount || !accounts[currentAccount]) return;
    const data = accounts[currentAccount];
    const upgradingItems = extractUpgradingItems(data, Math.floor(Date.now() / 1000), true);
    displayUpgradingItems(upgradingItems, data);
    updateBuilderBoostToggle(data);
    updateAllAccountTabColors();
    updateMainTitle();
}

function updateDataInfo(data) {
    if (!data) { dataInfoDiv.classList.add('hidden'); return; }
    dataInfoDiv.classList.remove('hidden');
    const note = accountNotes[data.tag] || data.tag;
    accountTagSpan.textContent = `#${note}`;
    exportTimeSpan.textContent = data.timestamp ? formatDateTime(data.timestamp) : '--';
    const chestEl = document.getElementById('chest-notification');
    if (chestEl) {
        const hasChest = settings.chestDetect && data.obstacles && Array.isArray(data.obstacles) && data.obstacles.some(o => o.data === 8000030 && o.cnt > 0);
        chestEl.classList.toggle('hidden', !hasChest);
    }
}

function updateMainTitle() {
    const titleEl = document.getElementById('main-title');
    if (!titleEl) return;
    const now = Math.floor(Date.now() / 1000);
    let accountsWithDone = 0;
    const tags = accountOrder.filter(tag => accounts[tag]);
    for (const tag of tags) {
        const data = accounts[tag];
        if (!data) continue;
        const items = extractUpgradingItems(data, now, true);
        for (const item of items) {
            const completionTs = calculateCompletionTimestamp(item, data);
            if (completionTs <= now) { accountsWithDone++; break; }
        }
    }
    if (tags.length === 0) { titleEl.textContent = '部落小工具'; }
    else if (accountsWithDone > 0) { titleEl.textContent = `部落小工具 (${accountsWithDone})`; }
    else { titleEl.textContent = '部落小工具'; }
}

function updateAllAccountTabColors() {
    accountOrder.filter(tag => accounts[tag]).forEach(tag => {
        const tab = document.querySelector(`[data-account="${tag}"]`);
        if (tab) {
            const textSpan = tab.querySelector('span');
            if (textSpan) {
                const colorClass = getAccountTabColor(accounts[tag]);
                textSpan.className = colorClass;
            }
        }
    });
}

function showLoading() {
    loadingIndicator.classList.remove('hidden');
    upgradesContainer.classList.add('hidden');
    emptyState.classList.add('hidden');
}
function hideLoading() {
    loadingIndicator.classList.add('hidden');
}
function showToast(msg, duration) {
    const toast = document.getElementById('toast');
    const toastText = document.getElementById('toast-text');
    toastText.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), duration || 2000);
}
function showEmptyState(msg) {
    emptyState.innerHTML = `<i class="fa fa-info-circle text-gray-300 text-5xl mb-4"></i><p class="text-gray-500">${msg}</p>`;
    emptyState.classList.remove('hidden');
    upgradesContainer.classList.add('hidden');
    upgradesCountBadge.classList.add('hidden');
}
function updateCurrentTime() {
    currentTimeSpan.textContent = formatDateTime(Math.floor(Date.now()/1000));
}
function hideJsonModal() {
    jsonModal.classList.add('hidden');
    jsonInput.value = '';
}
function showJsonModal() {
    jsonModal.classList.remove('hidden');
    jsonInput.focus();
}

// ===== 鍒嗙被姒傝??鍗＄墖 + 灞忚斀閫昏緫 =====
let sessionDismissedCategories = {};

function updateCategorySummary(counts, denominators) {
    const card = document.getElementById('category-summary-card');
    if (!card) return;
    card.classList.remove('hidden');
    const keys = ['buildings', 'lab', 'pets', 'buildings2', 'units2'];
    keys.forEach(key => {
        const el = document.getElementById('summary-' + key);
        if (el) el.textContent = (counts[key] || 0) + '/' + (denominators[key] || 0);
        // 绾㈢偣锛氬垎瀛??<鍒嗘瘝 涓?? 鏈????灞忚斀
        const badgeEl = document.getElementById('summary-badge-' + key);
        if (badgeEl) {
            const c = counts[key] || 0;
            const d = denominators[key] || 0;
            const isDismissed = (sessionDismissedCategories[currentAccount] && sessionDismissedCategories[currentAccount][key]) || (settings.dismissedCategories && settings.dismissedCategories[currentAccount] && settings.dismissedCategories[currentAccount][key]);
            badgeEl.style.opacity = (d === 0 || c >= d || isDismissed) ? '0' : '1';
        }
    });
}

// ===== 灞忚斀寮圭獥閫昏緫 =====
let dismissTargetKey = null;
let undismissTargetKey = null;
let summaryCardInitialized = false;

function initSummaryCardInteractions() {
    if (summaryCardInitialized) return;
    summaryCardInitialized = true;
    const card = document.getElementById('category-summary-card');
    if (!card) return;

    // 事件委托：点击卡片内任意位置，判断是否点击了图标区域
    card.addEventListener('click', (e) => {
        // 找到被点击元素所在的分列容器 .flex.flex-col.items-center
        const col = e.target.closest('.flex.flex-col.items-center');
        if (!col) return;

        const textEl = col.querySelector('[id^="summary-"]:not([id^="summary-badge-"])');
        if (!textEl) return;
        const key = textEl.id.replace('summary-', '');
        const isDismissed = (sessionDismissedCategories[currentAccount] && sessionDismissedCategories[currentAccount][key]) || (settings.dismissedCategories && settings.dismissedCategories[currentAccount] && settings.dismissedCategories[currentAccount][key]);

        if (!isDismissed) {
            dismissTargetKey = key;
            document.getElementById('dismiss-modal').classList.remove('hidden');
        } else {
            const clickKey = 'dismiss_click_' + key;
            const now = Date.now();
            const lastClick = parseInt(card.dataset[clickKey + '_time'] || '0');
            const count = parseInt(card.dataset[clickKey + '_count'] || '0');
            if (now - lastClick > 1000) {
                card.dataset[clickKey + '_count'] = '1';
            } else {
                const newCount = count + 1;
                card.dataset[clickKey + '_count'] = String(newCount);
                if (newCount >= 3) {
                    card.dataset[clickKey + '_count'] = '0';
                    undismissTargetKey = key;
                    document.getElementById('undismiss-modal').classList.remove('hidden');
                    return;
                }
            }
            card.dataset[clickKey + '_time'] = String(now);
        }
    });
}

document.getElementById('dismiss-session-btn')?.addEventListener('click', () => {
    if (dismissTargetKey && currentAccount) {
        if (!sessionDismissedCategories[currentAccount]) sessionDismissedCategories[currentAccount] = {};
        sessionDismissedCategories[currentAccount][dismissTargetKey] = true;
        refreshCurrentAccountDisplay();
    }
    document.getElementById('dismiss-modal').classList.add('hidden');
    dismissTargetKey = null;
});
document.getElementById('dismiss-forever-btn')?.addEventListener('click', () => {
    if (dismissTargetKey && currentAccount) {
        if (!sessionDismissedCategories[currentAccount]) sessionDismissedCategories[currentAccount] = {};
        sessionDismissedCategories[currentAccount][dismissTargetKey] = true;
        if (!settings.dismissedCategories) settings.dismissedCategories = {};
        if (!settings.dismissedCategories[currentAccount]) settings.dismissedCategories[currentAccount] = {};
        settings.dismissedCategories[currentAccount][dismissTargetKey] = true;
        saveSettings();
        refreshCurrentAccountDisplay();
    }
    document.getElementById('dismiss-modal').classList.add('hidden');
    dismissTargetKey = null;
});
document.getElementById('dismiss-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('dismiss-modal').classList.add('hidden');
    dismissTargetKey = null;
});
document.getElementById('dismiss-modal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('dismiss-modal')) {
        document.getElementById('dismiss-modal').classList.add('hidden');
        dismissTargetKey = null;
    }
});

// 取消屏蔽弹窗按钮事件
document.getElementById('undismiss-confirm-btn')?.addEventListener('click', () => {
    if (undismissTargetKey && currentAccount) {
        if (sessionDismissedCategories[currentAccount]) delete sessionDismissedCategories[currentAccount][undismissTargetKey];
        if (settings.dismissedCategories && settings.dismissedCategories[currentAccount]) delete settings.dismissedCategories[currentAccount][undismissTargetKey];
        saveSettings();
        refreshCurrentAccountDisplay();
    }
    document.getElementById('undismiss-modal').classList.add('hidden');
    undismissTargetKey = null;
});
document.getElementById('undismiss-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('undismiss-modal').classList.add('hidden');
    undismissTargetKey = null;
});
document.getElementById('undismiss-modal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('undismiss-modal')) {
        document.getElementById('undismiss-modal').classList.add('hidden');
        undismissTargetKey = null;
    }
});
