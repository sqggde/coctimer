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
  versionCode: 16,
  versionName: "1.2.2",
  directDownloadUrl: "https://github.com/sqggde/coctimer/releases/download/v1.2.2/1.2.2.apk",
  baiduUrl: "https://pan.baidu.com/wap/init?surl=qzvS6ASRObo0orXa3nG3PQ&pwd=4uuw",
  quarkUrl: "https://pan.quark.cn/s/81f54352d73e",
  changelog: "- 新增WebDAV云备份(支持坚果云等)\n- 新增选择应用图标\n- 新增后台隐身运行\n- 新增屏蔽夜世界\n- WebDAV改用OkHttp库\n- 通知格式优化(显示账号名+建筑名+等级)\n- 震感反馈增强"
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
