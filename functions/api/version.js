/**
 * COC Timer 鐗堟湰妫€鏌?鈥?Cloudflare Pages Function
 *
 * GET /api/version 鈥?杩斿洖鏈€鏂扮増鏈俊鎭紝瀹㈡埛绔瘮杈?versionCode 鍒ゆ柇鏄惁闇€瑕佹洿鏂? * 鍙戝竷鏂扮増鏈椂锛屼慨鏀逛笅鏂圭殑瀛楁骞堕噸鏂伴儴缃插嵆鍙? *
 * directDownloadUrl: 宸茬Щ闄わ紙涓哄彲鎸佺画鍙戝睍锛屽悗缁彧閫氳繃缃戠洏鎻愪緵涓嬭浇锛? * baiduUrl / quarkUrl: 缃戠洏涓嬭浇閾炬帴锛屽鎴风鐐瑰嚮鍚庡鍒跺埌鍓创鏉? */

const CURRENT_VERSION = {
  versionCode: 19,
  versionName: "1.2.5",
  baiduUrl: "https://pan.baidu.com/wap/init?surl=qzvS6ASRObo0orXa3nG3PQ&pwd=4uuw",
  quarkUrl: "https://pan.quark.cn/s/81f54352d73e",
  changelog: "1.閫氱煡浼樺寲\n2.澧炲姞鍥芥湇澶忔棩鐙傛璁＄畻\n3.澶囨敞鏄剧ず瀛楁暟鍙皟\n4.鍥炬爣鍘嬬缉"
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