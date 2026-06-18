/**
 * COC Timer WebDAV 诊断 — 直接返回原始响应
 * POST /api/webdav/debug
 */
export async function onRequest(context) {
  const { request } = context;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  try {
    const { server, username, password, folder } = await request.json();
    if (!server || !username || !password) {
      return new Response(JSON.stringify({ error: '缺少参数' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors } });
    }
    const encoded = btoa(`${username}:${password}`);
    const baseUrl = server.endsWith('/') ? server : server + '/';

    // 测试1: OPTIONS 根目录
    const r1 = await fetch(baseUrl, { method: 'OPTIONS', headers: { Authorization: `Basic ${encoded}`, 'User-Agent': 'curl' } });
    const t1 = await r1.text();

    // 测试2: MKCOL 创建目录
    const dirUrl = `${baseUrl}${folder || 'test'}/`;
    const r2 = await fetch(dirUrl, { method: 'MKCOL', headers: { Authorization: `Basic ${encoded}`, 'User-Agent': 'curl' } });
    const t2 = await r2.text();

    return new Response(JSON.stringify({
      step1_OPTIONS: { status: r1.status, body: t1.substring(0,200) },
      step2_MKCOL: { status: r2.status, body: t2.substring(0,200) },
    }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json', ...cors } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors } });
  }
}
