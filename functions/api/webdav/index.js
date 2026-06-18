/**
 * COC Timer WebDAV 备份代理 — Cloudflare Pages Function
 *
 * POST /api/webdav — { action, server, username, password, folder, data? }
 *   action = "backup"  → PUT JSON 到 {server}/{folder}/coc_timer_backup.json
 *   action = "restore" → GET 该文件并返回内容
 *   action = "test"    → 测试 WebDAV 连接是否可用
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

export async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, { error: '仅支持 POST' });
  }

  try {
    const body = await request.json();
    const { action, server, username, password, folder, data } = body;

    if (!action || !server || !username || !password || !folder) {
      return jsonResponse(400, { error: '缺少必填参数: action, server, username, password, folder' });
    }

    // 标准化服务器地址（确保末尾有 /）
    const baseUrl = server.endsWith('/') ? server : server + '/';
    const fileName = 'coc_timer_backup.json';
    const fileUrl = `${baseUrl}${folder}/${fileName}`;

    // 构建 Basic Auth
    const encoded = btoa(`${username}:${password}`);

    switch (action) {
      case 'test': {
        let results = [];
        // 1. 先 MKCOL 创建目录（忽略已存在错误）
        try {
          const mkResp = await fetch(`${baseUrl}${folder}/`, {
            method: 'MKCOL',
            headers: { Authorization: `Basic ${encoded}`, 'User-Agent': 'coc-timer-webdav' },
          });
          results.push(`MKCOL(${mkResp.status})`);
        } catch (e) { results.push('MKCOL(错误)'); }

        // 2. 上传测试文件验证读写
        const testName = `_coc_test_${Date.now()}.json`;
        const testUrl = `${baseUrl}${folder}/${testName}`;
        try {
          const putResp = await fetch(testUrl, {
            method: 'PUT',
            headers: {
              Authorization: `Basic ${encoded}`, 'User-Agent': 'coc-timer-webdav',
              'Content-Type': 'application/json',
            },
            body: '{"test":1}',
          });
          if (putResp.status === 401 || putResp.status === 403) {
            return jsonResponse(200, { success: false, error: '认证失败，请检查账号或密码' });
          }
          if (putResp.ok || putResp.status === 201 || putResp.status === 204) {
            results.push(`PUT(${putResp.status})`);
            // 3. 删除测试文件
            try {
              const delResp = await fetch(testUrl, { method: 'DELETE', headers: { Authorization: `Basic ${encoded}`, 'User-Agent': 'coc-timer-webdav' } });
              results.push(`DELETE(${delResp.status})`);
            } catch (e) {}
            return jsonResponse(200, { success: true, message: '连接成功，WebDAV 读写正常。' + results.join(' → ') });
          }
          let d = ''; try { d = (await putResp.text()).substring(0,150); } catch (e) {}
          return jsonResponse(200, { success: false, error: `上传失败(${putResp.status})`, detail: d });
        } catch (e) {
          return jsonResponse(200, { success: false, error: `请求异常: ${e.message}` });
        }
      }

      case 'backup': {
        if (!data) {
          return jsonResponse(400, { error: '备份操作需要 data 字段' });
        }
        // 1. 创建目录（如果已存在会返回 405/冲突，忽略即可）
        try {
          await fetch(`${baseUrl}${folder}/`, {
            method: 'MKCOL',
            headers: { Authorization: `Basic ${encoded}`, 'User-Agent': 'coc-timer-webdav' },
          });
        } catch (e) {}
        // 2. PUT 上传文件（覆盖已有，只保留最新一份）
        const jsonStr = JSON.stringify(data);
        try {
          const putResp = await fetch(fileUrl, {
            method: 'PUT',
            headers: {
              Authorization: `Basic ${encoded}`,
              'User-Agent': 'coc-timer-webdav',
              'Content-Type': 'application/json; charset=utf-8',
            },
            body: jsonStr,
          });
          if (putResp.ok || putResp.status === 204 || putResp.status === 201) {
            return jsonResponse(200, { success: true, action: 'updated' });
          }
          let errDetail = '';
          try { errDetail = (await putResp.text()).substring(0, 500); } catch (e) {}
          return jsonResponse(500, { success: false, error: `上传失败 (${putResp.status})`, detail: errDetail });
        } catch (fetchErr) {
          return jsonResponse(500, { success: false, error: `上传请求异常: ${fetchErr.message}` });
        }
      }

      case 'restore': {
        const getResp = await fetch(fileUrl, {
          method: 'GET',
          headers: {
            Authorization: `Basic ${encoded}`,
            'User-Agent': 'coc-timer-webdav',
          },
        });

        if (getResp.status === 404) {
          return jsonResponse(404, { error: '未找到备份文件', detail: '请先执行一次云端备份' });
        }

        if (!getResp.ok) {
          return jsonResponse(500, { error: `下载失败 (${getResp.status})` });
        }

        const rawContent = await getResp.text();
        let backupData;
        try {
          backupData = JSON.parse(rawContent);
        } catch {
          return jsonResponse(500, { error: '备份数据格式异常' });
        }

        return jsonResponse(200, {
          success: true,
          data: backupData,
        });
      }

      default:
        return jsonResponse(400, { error: `未知 action: ${action}` });
    }
  } catch (err) {
    const errMsg = err && err.message ? err.message : String(err);
    return jsonResponse(500, { error: `WebDAV 代理错误: ${errMsg}` });
  }
}
