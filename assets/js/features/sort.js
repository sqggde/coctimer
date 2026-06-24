// ===== 账号排序功能 =====
let isSortMode = false;
let sortModalOrder = [];
let sortDragCleanup = null;

function enterSortMode() {
    isSortMode = true;
    rebuildAllTabs();
    sortContent.classList.remove('hidden');
    sortModalOrder = [...accountOrder];
    renderSortList();
    const sortRect = sortContent.getBoundingClientRect();
    const content = document.getElementById('sort-content');
    if (content) content.scrollIntoView({ behavior: 'smooth', block: 'start' });
    updateSortListHeight();
    setTimeout(() => {
        initSortDrag();
        updateSortTimers();
        if (sortTimer) clearInterval(sortTimer);
        sortTimer = setInterval(updateSortTimers, 1000);
    }, 50);
}

function updateSortListHeight() {
    const sortRect = sortContent.getBoundingClientRect();
    const bottomArea = sortListContainer.nextElementSibling;
    const bottomHeight = bottomArea ? bottomArea.offsetHeight : 48;
    const availableHeight = (window.innerHeight*0.85) - sortRect.top - bottomHeight - 8;
    sortListContainer.style.maxHeight = Math.max(100, availableHeight) + 'px';
}

function onSortResize() {
    if (isSortMode) updateSortListHeight();
}

function exitSortMode(applyChanges = false) {
    isSortMode = false;
    sortContent.classList.add('hidden');
    if (sortDragCleanup) { sortDragCleanup(); sortDragCleanup = null; }
    if (sortTimer) { clearInterval(sortTimer); sortTimer = null; }
    window.removeEventListener('resize', onSortResize);
    if (applyChanges && sortModalOrder.length > 0) {
        accountOrder = [...sortModalOrder];
        saveToLocalStorage();
    }
    rebuildAllTabs();
}

function renderSortList() {
    sortListContainer.innerHTML = '';
    const now = Math.floor(Date.now() / 1000);
    sortModalOrder.forEach(tag => {
        const note = accountNotes[tag] || tag;
        const div = document.createElement('div');
        const sortSleepClass = hasSleepHighlight(accounts[tag]) ? ' sleep-highlight' : '';
        div.className = `sort-item bg-gray-50 rounded-lg p-2 mb-1 border border-gray-200 flex items-center${sortSleepClass}`;
        div.setAttribute('data-account', tag);
        const colorClass = accounts[tag] ? getAccountTabColor(accounts[tag]) : '';
        let rightHtml = '';
        const data = accounts[tag];
        if (data) {
            const items = extractUpgradingItems(data, now, true);
            if (items.length > 0) {
                let completedItems = [];
                let inProgressItems = [];
                for (const item of items) {
                    const completionTs = calculateCompletionTimestamp(item, data);
                    const remaining = completionTs - now;
                    if (remaining <= 0) completedItems.push({ item, completionTs, remaining });
                    else inProgressItems.push({ item, completionTs, remaining });
                }
                if (completedItems.length > 0) {
                    const earliestName = getItemName(completedItems[0].item.data);
                    const count = completedItems.length;
                    rightHtml = `<span class="text-success text-xs">${earliestName}等${count}项已完成</span>`;
                } else if (inProgressItems.length > 0) {
                    let shortestItem = null;
                    let shortestRemaining = Infinity;
                    for (const { item, completionTs, remaining } of inProgressItems) {
                        if (remaining < shortestRemaining) { shortestRemaining = remaining; shortestItem = item; }
                    }
                    if (shortestItem) {
                        const completionTs = calculateCompletionTimestamp(shortestItem, data);
                        const remaining = completionTs - now;
                        const name = getItemName(shortestItem.data);
                        const remainFmt = formatRemainingTime(Math.max(0, remaining));
                        const timeColor = getRemainingColor(remaining);
                        rightHtml = `<span class="text-xs"><span class="${timeColor}">${remainFmt}</span>后完成</span>`;
                    }
                }
            }
        }
        div.innerHTML = `<i class="fa fa-bars text-gray-400 mr-2 cursor-grab text-sm"></i><span class="text-sm flex-1 ${colorClass}">${escapeHtml(note)}</span>${rightHtml}`;
        sortListContainer.appendChild(div);
    });
}

function updateSortTimers() {
    const now = Date.now() / 1000;
    document.querySelectorAll('#sort-list-container .sort-item').forEach(el => {
        const tag = el.getAttribute('data-account');
        if (!tag || !accounts[tag]) return;
        const data = accounts[tag];
        const items = extractUpgradingItems(data, Math.floor(now), true);
        const note = accountNotes[tag] || tag;
        let rightHtml = '';
        if (items.length > 0) {
            let completedItems = [];
            let inProgressItems = [];
            for (const item of items) {
                const completionTs = calculateCompletionTimestamp(item, data);
                const remaining = completionTs - now;
                if (remaining <= 0) completedItems.push({ item, completionTs, remaining });
                else inProgressItems.push({ item, completionTs, remaining });
            }
            if (completedItems.length > 0) {
                const earliestName = getItemName(completedItems[0].item.data);
                const count = completedItems.length;
                rightHtml = `<span class="text-success text-xs">${earliestName}等${count}项已完成</span>`;
            } else if (inProgressItems.length > 0) {
                let shortestItem = null;
                let shortestRemaining = Infinity;
                for (const { item, completionTs, remaining } of inProgressItems) {
                    if (remaining < shortestRemaining) { shortestRemaining = remaining; shortestItem = item; }
                }
                if (shortestItem) {
                    const completionTs = calculateCompletionTimestamp(shortestItem, data);
                    const remaining = completionTs - now;
                    const name = getItemName(shortestItem.data);
                    const remainFmt = formatRemainingTime(Math.max(0, remaining));
                    const timeColor = getRemainingColor(remaining);
                    rightHtml = `<span class="text-xs"><span class="${timeColor}">${remainFmt}</span>后完成</span>`;
                }
            }
        }
        const colorClass = getAccountTabColor(data);
        el.innerHTML = `<i class="fa fa-bars text-gray-400 mr-2 cursor-grab text-sm"></i><span class="text-sm flex-1 ${colorClass}">${escapeHtml(note)}</span>${rightHtml}`;
        const sleepClass = hasSleepHighlight(data) ? ' sleep-highlight' : '';
        el.className = `sort-item bg-gray-50 rounded-lg p-2 mb-1 border border-gray-200 flex items-center${sleepClass}`;
    });
}

function initSortDrag() {
    const container = sortListContainer;
    let dragElement = null, startY = 0, currentIndex = -1, hasMoved = false;
    const MOVE_THRESHOLD = 5;

    function getSortItems() {
        return Array.from(container.querySelectorAll('.sort-item:not(.drag-placeholder)'));
    }

    function onPointerDown(e) {
        const item = e.target.closest('.sort-item');
        if (!item) return;
        const rect = item.getBoundingClientRect();
        const xInItem = e.clientX - rect.left;
        if (xInItem > rect.width / 3) return;
        dragElement = item;
        startY = e.clientY;
        currentIndex = getSortItems().indexOf(item);
        hasMoved = false;
        item.setPointerCapture(e.pointerId);
        e.preventDefault();
    }

    function onPointerMove(e) {
        if (!dragElement) return;
        const dy = e.clientY - startY;
        if (!hasMoved && Math.abs(dy) > MOVE_THRESHOLD) {
            hasMoved = true;
            container.style.overflowY = 'hidden';
            dragElement.classList.add('dragging');
            const placeholder = document.createElement('div');
            placeholder.className = 'sort-item drag-placeholder bg-gray-50 rounded-lg p-2 mb-1 border border-dashed border-primary';
            placeholder.style.height = dragElement.offsetHeight + 'px';
            dragElement.parentNode.insertBefore(placeholder, dragElement);
            const rect = dragElement.getBoundingClientRect();
            dragElement.style.position = 'fixed';
            dragElement.style.left = rect.left + 'px';
            dragElement.style.top = rect.top + 'px';
            dragElement.style.width = rect.width + 'px';
            dragElement.style.zIndex = '1000';
            dragElement.style.pointerEvents = 'none';
        }
        if (hasMoved) {
            dragElement.style.top = (e.clientY - dragElement.offsetHeight / 2) + 'px';
            const items = getSortItems();
            const placeholder = container.querySelector('.drag-placeholder');
            if (!placeholder) return;
            let targetIndex = items.indexOf(placeholder);
            for (let i = 0; i < items.length; i++) {
                if (items[i] === placeholder) continue;
                const rect = items[i].getBoundingClientRect();
                const centerY = rect.top + rect.height / 2;
                if (e.clientY < centerY) { targetIndex = i; break; }
                targetIndex = i + 1;
            }
            if (targetIndex !== currentIndex) {
                currentIndex = targetIndex;
                if (targetIndex >= items.length) container.appendChild(placeholder);
                else container.insertBefore(placeholder, items[targetIndex]);
            }
        }
    }

    function onPointerUp(e) {
        if (!dragElement) return;
        const placeholder = container.querySelector('.drag-placeholder');
        if (hasMoved && placeholder) {
            container.insertBefore(dragElement, placeholder);
            placeholder.remove();
            dragElement.style.position = '';
            dragElement.style.left = '';
            dragElement.style.top = '';
            dragElement.style.width = '';
            dragElement.style.zIndex = '';
            dragElement.style.pointerEvents = '';
            dragElement.classList.remove('dragging');
            sortModalOrder = getSortItems().map(item => item.getAttribute('data-account')).filter(Boolean);
        } else if (dragElement) {
            dragElement.classList.remove('dragging');
            if (!hasMoved) {
                const tag = dragElement.getAttribute('data-account');
                if (tag) switchAccount(tag);
            }
        }
        container.style.overflowY = 'auto';
        try { dragElement.releasePointerCapture(e.pointerId); } catch (ex) {}
        dragElement = null;
        hasMoved = false;
    }

    function onSortItemClick(e) {
        const item = e.target.closest('.sort-item');
        if (!item) return;
        const tag = item.getAttribute('data-account');
        if (tag) switchAccount(tag);
    }

    function onTouchStart(e) {
        if (e.touches.length !== 1) return;
        const item = e.target.closest('.sort-item');
        if (!item) return;
        const rect = item.getBoundingClientRect();
        const xInItem = e.touches[0].clientX - rect.left;
        if (xInItem <= rect.width / 3) {
            e.preventDefault();
        }
    }

    container.addEventListener('touchstart', onTouchStart, { passive: false });
    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointercancel', onPointerUp);
    container.addEventListener('click', onSortItemClick);
    container.addEventListener('dragstart', (e) => e.preventDefault());

    sortDragCleanup = () => {
        container.removeEventListener('touchstart', onTouchStart);
        container.removeEventListener('pointerdown', onPointerDown);
        container.removeEventListener('pointermove', onPointerMove);
        container.removeEventListener('pointerup', onPointerUp);
        container.removeEventListener('pointercancel', onPointerUp);
        container.removeEventListener('click', onSortItemClick);
        container.removeEventListener('dragstart', (e) => e.preventDefault());
    };
}
