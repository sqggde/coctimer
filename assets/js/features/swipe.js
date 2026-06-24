// ===== 左右滑动切换账号 =====
function initSwipeGesture() {
    let startX = 0, startY = 0;
    const SWIPE_THRESHOLD = 50, ANGLE_THRESHOLD = 1.5;

    document.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) { startX = e.touches[0].clientX; startY = e.touches[0].clientY; }
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        if (e.changedTouches.length === 1 && accountOrder.length > 1 && currentAccount) {
            const endX = e.changedTouches[0].clientX, endY = e.changedTouches[0].clientY;
            const dx = endX - startX, dy = endY - startY;
            if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * ANGLE_THRESHOLD) {
                const target = e.target;
                if (target && target.closest('#tab-container')) return;
                const currentIndex = accountOrder.indexOf(currentAccount);
                if (currentIndex === -1) return;
                if (dx > 0) { if (currentIndex > 0) switchAccount(accountOrder[currentIndex - 1]); }
                else { if (currentIndex < accountOrder.length - 1) switchAccount(accountOrder[currentIndex + 1]); }
            }
        }
    }, { passive: true });
}
