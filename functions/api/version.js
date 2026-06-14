/**
 * COC Timer 版本检查 — Cloudflare Pages Function
 *
 * GET /api/version — 返回最新版本信息，客户端比较 versionCode 判断是否需要更新
 * 发布新版本时，修改下方的字段并重新部署即可
 *
 * directDownloadUrl: APK 直链，客户端点击后通过 DownloadManager 后台下载
 * baiduUrl / quarkUrl: 网盘下载链接，客户端点击后复制到剪贴板
 */

const CURRENT_VERSION = {
  versionCode: 14,
  versionName: "1.2.0",
  directDownloadUrl: "",
  baiduUrl: "https://pan.baidu.com/s/1Vdx6MyM2K7ZyfxCeFxqrWA?pwd=5io6",
  quarkUrl: "https://pan.quark.cn/s/279f7a166c2b",
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
