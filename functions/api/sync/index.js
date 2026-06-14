/**
 * COC Timer 云端备份/恢复 — Cloudflare Pages Function
 *
 * POST /api/sync  — 备份: { email, password, data }
 * GET  /api/sync?email=xxx&password=yyy — 恢复
 */

const GIST_API = 'https://api.github.com/gists';

export async function onRequest(context) {
  const { request, env } = context;
  const { GIST_ID, GITHUB_TOKEN } = env;

  if (!GIST_ID || !GITHUB_TOKEN) {
    return jsonResponse(500, { error: '服务端未配置 GIST_ID 或 GITHUB_TOKEN' });
  }

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });

  try {
    if (request.method === 'POST') return await handleBackup(request, GIST_ID, GITHUB_TOKEN);
    if (request.method === 'GET') return await handleRestore(new URL(request.url), GIST_ID, GITHUB_TOKEN);
    return jsonResponse(405, { error: '不支持的方法' });
  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

async function getGist(gistId, token) {
  const resp = await fetch(`${GIST_API}/${gistId}`, {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'coc-timer' },
  });
  if (!resp.ok) throw new Error(`获取 Gist 失败: ${resp.status}`);
  return await resp.json();
}

async function patchGist(gistId, token, files, description) {
  const resp = await fetch(`${GIST_API}/${gistId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'coc-timer',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ description: description || 'COC Timer Data', files }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`更新 Gist 失败: ${resp.status} — ${err}`);
  }
  return await resp.json();
}

function readGistFile(gist, filename) {
  const file = gist.files?.[filename];
  if (!file || !file.content) return null;
  try { return JSON.parse(file.content); } catch { return null; }
}

async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(hash));
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function authenticate(email, password, gistId, token) {
  const gist = await getGist(gistId, token);
  const users = readGistFile(gist, '_users.json') || {};
  const user = users[email];
  if (!user) return null;
  const hash = await hashPassword(password, user.salt);
  if (hash !== user.passwordHash) return null;
  return user;
}

// ========== 备份 ==========

async function handleBackup(request, gistId, token) {
  const body = await request.json();
  const { email, password, data } = body;

  if (!email || !password || !data) {
    return jsonResponse(400, { error: '缺少 email、password 或 data' });
  }

  const user = await authenticate(email, password, gistId, token);
  if (!user) return jsonResponse(401, { error: '密码错误，请重新登录' });

  const filename = `backup_${email}.json`;
  const content = JSON.stringify(data, null, 2);

  // 先检查文件是否已存在
  const gist = await getGist(gistId, token);
  const fileExists = !!gist.files?.[filename];

  // 写入文件
  const patchResult = await patchGist(gistId, token, { [filename]: { content } });

  // 验证文件内容是否写入成功
  const verify = await getGist(gistId, token);
  const writtenFile = verify.files?.[filename];
  if (!writtenFile || !writtenFile.content) {
    // 调试: 返回实际写入的内容
    return jsonResponse(500, {
      error: '备份写入失败',
      debug: {
        filename,
        contentLength: content.length,
        contentPreview: content.substring(0, 100),
        writtenFileExists: !!writtenFile,
        writtenContentLength: writtenFile ? (writtenFile.content || '').length : 0,
        writtenContent: writtenFile ? (writtenFile.content || '').substring(0, 100) : null,
      }
    });
  }

  return jsonResponse(200, {
    success: true,
    action: fileExists ? 'updated' : 'created',
    email,
    timestamp: new Date().toISOString(),
  });
}

// ========== 恢复 ==========

async function handleRestore(url, gistId, token) {
  const email = url.searchParams.get('email');
  const password = url.searchParams.get('password');

  if (!email || !password) {
    return jsonResponse(400, { error: '缺少 email 或 password 参数' });
  }

  const user = await authenticate(email, password, gistId, token);
  if (!user) return jsonResponse(401, { error: '密码错误，请重新登录' });

  const filename = `backup_${email}.json`;
  const gist = await getGist(gistId, token);
  const fileData = gist.files?.[filename];

  if (!fileData) return jsonResponse(404, { error: '未找到该用户的备份数据', email });

  let backupData;
  try { backupData = JSON.parse(fileData.content); } catch {
    return jsonResponse(500, { error: '备份数据格式异常' });
  }

  return jsonResponse(200, {
    success: true,
    email,
    data: backupData,
    updatedAt: fileData.updated_at || gist.updated_at,
  });
}
