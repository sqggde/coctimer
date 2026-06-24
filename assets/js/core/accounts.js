// ===== 账号管理 — 删除/备注/切换/重建标签 =====
function removeAccount(accountTag) {
    if (!accounts[accountTag]) return;
    delete accounts[accountTag];
    delete accountNotes[accountTag];
    removeAccountFromOrder(accountTag);
    rebuildAllTabs();
    const remaining = Object.keys(accounts);
    if (remaining.length) switchAccount(remaining[0]);
    else {
        currentAccount = null;
        showEmptyState('暂无账号，点击「导入数据」添加');
        dataInfoDiv.classList.add('hidden');
        accountActionsDiv.classList.add('hidden');
        upgradesContainer.classList.add('hidden');
        upgradesCountBadge.classList.add('hidden');
        emptyState.classList.remove('hidden');
        if (updateTimer) clearInterval(updateTimer);
    }
    updateMainTitle();
    saveToLocalStorage();
}

function setAccountNote(accountTag) {
    const modal = document.getElementById('note-modal');
    const input = document.getElementById('note-input');
    input.value = accountNotes[accountTag] || '';
    modal.classList.remove('hidden');
    input.focus();
    const save = () => {
        const val = input.value.trim();
        if (val) accountNotes[accountTag] = val;
        else delete accountNotes[accountTag];
        rebuildAllTabs();
        if (currentAccount === accountTag) updateDataInfo(accounts[accountTag]);
        saveToLocalStorage();
        modal.classList.add('hidden');
    };
    document.getElementById('note-cancel-btn').onclick = () => modal.classList.add('hidden');
    document.getElementById('note-save-btn').onclick = save;
    input.onkeypress = (e) => { if (e.key === 'Enter') save(); };
}

function switchAccount(accountTag) {
    if (isSortMode) exitSortMode(false);
    if (!accounts[accountTag]) return;
    currentAccount = accountTag;
    saveToLocalStorage();
    document.querySelectorAll('.account-tab').forEach(tab => {
        if (tab.getAttribute('data-sort') === 'true') return;
        if (tab.getAttribute('data-account') === accountTag) {
            tab.classList.add('bg-white', 'text-primary', 'border', 'border-gray-200', 'border-b-white');
            tab.classList.remove('text-gray-500', 'hover:text-gray-700', 'hover:bg-gray-50');
        } else {
            tab.classList.remove('bg-white', 'text-primary', 'border', 'border-gray-200', 'border-b-white');
            tab.classList.add('text-gray-500', 'hover:text-gray-700', 'hover:bg-gray-50');
        }
    });
    const data = accounts[accountTag];
    const upgradingItems = extractUpgradingItems(data, Math.floor(Date.now() / 1000), true);
    updateDataInfo(data);
    displayUpgradingItems(upgradingItems, data);
    updateMainTitle();
    applySettings();
    accountActionsDiv.classList.remove('hidden');
    if (updateTimer) clearInterval(updateTimer);
    updateTimer = setInterval(() => {
        refreshCurrentAccountDisplay();
        updateHelperButtonState();
        if (!helperModal.classList.contains('hidden')) updateHelperModal();
        if (sortTimer) updateSortTimers();
    }, 1000);
    updateHelperButtonState();
}

function rebuildAllTabs() {
    if (!tabContainer) return;
    tabContainer.innerHTML = '';
    const sortTab = document.createElement('button');
    sortTab.className = 'account-tab px-1.5 py-1 text-sm font-medium rounded-t-lg transition-all duration-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50';
    sortTab.setAttribute('data-sort', 'true');
    sortTab.innerHTML = `<span><i class="fa fa-sort mr-0.5"></i>排序</span>`;
    sortTab.style.backgroundColor = '#f8fafc';
    if (isSortMode) {
        sortTab.classList.add('bg-white', 'text-primary', 'border', 'border-gray-200', 'border-b-white');
        sortTab.classList.remove('text-gray-500', 'hover:text-gray-700', 'hover:bg-gray-50');
        sortTab.style.backgroundColor = '';
    }
    tabContainer.appendChild(sortTab);
    if (accountOrder.length === 0) return;
    accountOrder.forEach(tag => {
        if (!accounts[tag]) return;
        const tab = document.createElement('button');
        tab.className = 'account-tab px-1.5 py-1 text-sm font-medium rounded-t-lg transition-all duration-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50';
        tab.setAttribute('data-account', tag);
        const note = accountNotes[tag] || tag;
        tab.innerHTML = `<span>${escapeHtml(note)}</span>`;
        tabContainer.appendChild(tab);
        const textSpan = tab.querySelector('span');
        if (textSpan) {
            const colorClass = getAccountTabColor(accounts[tag]);
            if (colorClass) textSpan.classList.add(colorClass);
        }
        if (hasSleepHighlight(accounts[tag])) {
            tab.classList.add('sleep-highlight-tab');
        }
    });
    if (!isSortMode && currentAccount && accounts[currentAccount]) {
        const activeTab = document.querySelector(`[data-account="${currentAccount}"]`);
        if (activeTab) activeTab.classList.add('bg-white', 'text-primary', 'border', 'border-gray-200', 'border-b-white');
    } else if (!isSortMode && accountOrder.length) switchAccount(accountOrder[0]);
}
