// ===== 单实例管理 =====
function checkSingleInstance() {
    try {
        const existingInstance = localStorage.getItem(INSTANCE_KEY);
        if (existingInstance) {
            try {
                const instanceData = JSON.parse(existingInstance);
                const now = Date.now();
                if (now - instanceData.lastActive < 3000) {
                    try {
                        const channel = new BroadcastChannel('clash_upgrade_channel');
                        channel.postMessage({ type: 'STEAL_FOCUS' });
                    } catch (e) {}
                    alert('检测到已有正在运行的窗口，请使用已有窗口操作');
                }
            } catch (e) {}
        }
        const instanceData = { lastActive: Date.now(), windowId: Math.random().toString(36).substr(2, 9) };
        localStorage.setItem(INSTANCE_KEY, JSON.stringify(instanceData));
        try {
            const current = JSON.parse(localStorage.getItem(INSTANCE_KEY));
            if (current.windowId !== instanceData.windowId) {
                instanceData.lastActive = Date.now();
                localStorage.setItem(INSTANCE_KEY, JSON.stringify(instanceData));
            }
        } catch (e) {}
        try {
            const channel = new BroadcastChannel('clash_upgrade_channel');
            channel.addEventListener('message', (e) => {
                if (e.data && e.data.type === 'STEAL_FOCUS') {
                    let originalTitle = document.title;
                    let flashCount = 0;
                    const flashInterval = setInterval(() => {
                        document.title = (flashCount % 2 === 0) ? '⚠️ 已在其他窗口打开' : originalTitle;
                        flashCount++;
                        if (flashCount >= 6) { clearInterval(flashInterval); document.title = originalTitle; }
                    }, 500);
                }
            });
            const current = JSON.parse(localStorage.getItem(INSTANCE_KEY));
            if (current.windowId !== instanceData.windowId) {
                instanceData.lastActive = Date.now();
                localStorage.setItem(INSTANCE_KEY, JSON.stringify(instanceData));
            }
        } catch (e) {}
    } catch (e) {}
}
