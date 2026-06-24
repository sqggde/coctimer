// ===== 单实例管理（BroadcastChannel 心跳检测） =====
const INSTANCE_ID = Math.random().toString(36).substr(2, 9);

function checkSingleInstance() {
    try {
        const channel = new BroadcastChannel('clash_upgrade_channel');
        let otherAlive = false;

        // 监听其他窗口的回应
        const onMessage = (e) => {
            const d = e.data || {};
            if (d.type === 'PING' && d.from !== INSTANCE_ID) {
                // 有其他窗口在线，回应它并向自己标记
                otherAlive = true;
                channel.postMessage({ type: 'PONG', from: INSTANCE_ID, to: d.from });
            }
            if (d.type === 'PONG' && d.to === INSTANCE_ID) {
                otherAlive = true;
            }
            if (d.type === 'STEAL_FOCUS' && d.from !== INSTANCE_ID) {
                let originalTitle = document.title;
                let flashCount = 0;
                const flashInterval = setInterval(() => {
                    document.title = (flashCount % 2 === 0) ? '⚠️ 已在其他窗口打开' : originalTitle;
                    flashCount++;
                    if (flashCount >= 6) { clearInterval(flashInterval); document.title = originalTitle; }
                }, 500);
            }
        };
        channel.addEventListener('message', onMessage);

        // 广播 PING，询问是否有其他窗口在线
        channel.postMessage({ type: 'PING', from: INSTANCE_ID });

        // 300ms 后检查是否有回应
        return new Promise((resolve) => {
            setTimeout(() => {
                if (otherAlive) {
                    channel.postMessage({ type: 'STEAL_FOCUS', from: INSTANCE_ID });
                    alert('检测到已有正在运行的窗口，请使用已有窗口操作');
                }
                // 无论如何，清理监听器并 resolve
                channel.removeEventListener('message', onMessage);
                resolve();
            }, 300);
        });
    } catch (e) {
        // BroadcastChannel 不支持时直接略过
        return Promise.resolve();
    }
}
