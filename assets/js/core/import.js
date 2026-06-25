// ===== 数据导入解析 =====
function quickImportJsonData() {
    if (!navigator.clipboard) { showJsonModal(); showToast('浏览器不支持剪贴板'); return; }
    showLoading();
    const timeout = setTimeout(() => { hideLoading(); showToast('未获取剪贴板读取权限', 2000); showJsonModal(); }, 5000);
    navigator.clipboard.readText().then(text => {
        clearTimeout(timeout);
        try {
            const data = JSON.parse(text.trim());
            if (!data.timestamp) throw new Error('缺少timestamp字段');
            sessionDismissedCategories = {};
            const tag = data.tag || `账号_${Date.now()}`;
            accounts[tag] = data;
            if (!accountNotes[tag]) delete accountNotes[tag];
            addAccountToOrder(tag);
            rebuildAllTabs();
            switchAccount(tag);
            saveToLocalStorage();
            const displayName = accountNotes[tag] || tag;
            showToast(`${displayName}的信息已更新`, 1000);
        } catch (e) {
            showToast('json数据不正确', 2000);
        }
        hideLoading();
    }).catch(err => {
        clearTimeout(timeout);
        if (err.name === 'NotAllowedError') {
            showToast('未获取剪贴板读取权限', 2000);
        } else {
            showToast('json数据不正确', 2000);
        }
        hideLoading();
        showJsonModal();
    });
}

function parseJsonData() {
    const text = jsonInput.value.trim();
    if (!text) { showToast('json数据不正确', 2000); return; }
    showLoading();
    setTimeout(() => {
        try {
            const data = JSON.parse(text);
            if (!data.timestamp) throw new Error('缺少timestamp');
            sessionDismissedCategories = {};
            const tag = data.tag || `账号_${Date.now()}`;
            accounts[tag] = data;
            if (!accountNotes[tag]) delete accountNotes[tag];
            addAccountToOrder(tag);
            rebuildAllTabs();
            switchAccount(tag);
            saveToLocalStorage();
            hideJsonModal();
            const displayName = accountNotes[tag] || tag;
            showToast(`${displayName}的信息已更新`, 1000);
        } catch (err) { showToast('json数据不正确', 2000); }
        finally { hideLoading(); }
    }, 100);
}
