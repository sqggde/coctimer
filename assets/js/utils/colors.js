// ===== 颜色优先级系统 =====
function getColorPriority(sec) {
    if (sec <= 0) return 6;
    if (sec < 1800) return 5;
    if (sec < 3600) return 4;
    if (sec < 14400) return 3;
    if (sec < 28800) return 2;
    if (sec < 86400) return 1;
    return 0;
}

function priorityToColorClass(priority, defaultColor) {
    const map = { 6:'text-success', 5:'text-danger_red', 4:'text-warning_orangered', 3:'text-warning_orange', 2:'text-warning_yellow', 1:'text-warning', 0: defaultColor || 'text-primary' };
    return map[priority] || defaultColor || 'text-primary';
}

function getAccountTabColor(data) {
    const now = Math.floor(Date.now() / 1000);
    const allItems = extractUpgradingItems(data, now, true);
    let highestPriority = 0;
    for (const item of allItems) {
        const completionTs = calculateCompletionTimestamp(item, data);
        const remainingSec = Math.max(0, completionTs - now);
        const priority = getColorPriority(remainingSec);
        if (priority > highestPriority) highestPriority = priority;
    }
    return priorityToColorClass(highestPriority, 'text-gray-500');
}

function getRemainingColor(remainingSec) {
    if (remainingSec <= 0) return 'text-success';
    if (remainingSec < 1800) return 'text-red-600';
    if (remainingSec < 3600) return 'text-orange-600';
    if (remainingSec < 14400) return 'text-orange-500';
    if (remainingSec < 28800) return 'text-yellow-500';
    return 'text-primary';
}
