// ===== 时间工具 =====
function formatRemainingTime(sec) {
    if (sec < 0) return "已完成";
    const d = Math.floor(sec/86400);
    const h = Math.floor((sec%86400)/3600);
    const m = Math.floor((sec%3600)/60);
    const s = Math.floor(sec%60);
    let result = "";
    if (d > 0) result += d + "天";
    if (h > 0 || d > 0) result += h + "时";
    if (m > 0 || h > 0 || d > 0) result += m + "分";
    result += s + "秒";
    return result;
}

function formatDateTime(ts) {
    const d = new Date(ts*1000);
    return `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`;
}
