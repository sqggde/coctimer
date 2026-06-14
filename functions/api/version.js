/**
 * COC Timer 版本检查 — Cloudflare Pages Function
 *
 * GET /api/version — 返回最新版本信息，客户端比较 versionCode 判断是否需要更新
 * 发布新版本时，修改下方的 versionCode/versionName/downloadUrl/changelog 并重新部署即可
 */

const CURRENT_VERSION = {
  versionCode: 14,
  versionName: "1.2.0",
  downloadUrl: "",
  changelog: "- 新增滑动切换账号震感反馈\n- 新增导出/导入备份功能\n- 新增检查更新功能"
};

export async function onRequest(context) {
  return new Response(JSON.stringify(CURRENT_VERSION, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Cache-Control": "no-cache"
    }
  });
}
