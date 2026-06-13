/**
 * COC Timer 云端备份 + 用户认证 — Cloudflare Pages Function
 *
 * 架构: 前端 → Cloudflare Worker → GitHub Gist (单 Gist 存储用户+备份数据)
 *
 * 路由:
 *   POST /api/sync/register     — 注册: { email, password }
 *   POST /api/sync/login        — 登录: { email, password }
 *   POST /api/sync              — 备份: { email, password, data }
 *   GET  /api/sync?email=xxx&password=yyy — 恢复
 *
 * 环境变量:
 *   GIST_ID      — GitHub Gist ID (用于存储所有数据)
 *   GITHUB_TOKEN — 个人访问令牌 (需要 gist 权限)
 */

const GIST_API = 'https://api.github.com/gists';

export async function onRequest(context) {
  const { request, env } = context;
  const { GIST_ID, GITHUB_TOKEN } = env;

  if (!GIST_ID || !GITHUB_TOKEN) {
    return jsonResponse(500, { error: '服务端未配置 GIST_ID 或 GITHUB_TOKEN' });
  }

  const url = new URL(request.url);
  const path = url.pathname;

  // CORS 预检
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  try {
    // 路由分发
    if (path.endsWith('/register') && request.method === 'POST') {
      return await handleRegister(request, GIST_ID, GITHUB_TOKEN);
    }
    if (path.endsWith('/login') && request.method === 'POST') {
      return await handleLogin(request, GIST_ID, GITHUB_TOKEN);
    }
    if (request.method === 'POST') {
      return await handleBackup(request, GIST_ID, GITHUB_TOKEN);
    }
    if (request.method === 'GET') {
      return await handleRestore(url, GIST_ID, GITHUB_TOKEN);
    }
    return jsonResponse(405, { error: '不支持的方法' });
  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
}

// ========== 工具函数 ==========

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

// ========== 密码哈希 ==========

async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(hash));
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateSalt() {
  const rand = new Uint8Array(16);
  crypto.getRandomValues(rand);
  return bytesToHex(rand);
}

// ========== 认证中间件 ==========

async function authenticate(email, password, gistId, token) {
  const gist = await getGist(gistId, token);
  const users = readGistFile(gist, '_users.json') || {};
  const user = users[email];
  if (!user) return null;
  const hash = await hashPassword(password, user.salt);
  if (hash !== user.passwordHash) return null;
  return user;
}

// ========== 注册 ==========

async function handleRegister(request, gistId, token) {
  const { email, password } = await request.json();

  if (!email || !password) {
    return jsonResponse(400, { error: '邮箱和密码不能为空' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse(400, { error: '邮箱格式无效' });
  }
  if (password.length < 6) {
    return jsonResponse(400, { error: '密码至少6位' });
  }

  const gist = await getGist(gistId, token);
  const users = readGistFile(gist, '_users.json') || {};

  if (users[email]) {
    return jsonResponse(409, { error: '该邮箱已注册' });
  }

  const salt = generateSalt();
  const passwordHash = await hashPassword(password, salt);
  users[email] = { passwordHash, salt, createdAt: new Date().toISOString() };

  await patchGist(gistId, token, {
    '_users.json': { content: JSON.stringify(users, null, 2) },
  });

  return jsonResponse(200, { success: true, email });
}

// ========== 登录 ==========

async function handleLogin(request, gistId, token) {
  const { email, password } = await request.json();

  if (!email || !password) {
    return jsonResponse(400, { error: '邮箱和密码不能为空' });
  }

  const user = await authenticate(email, password, gistId, token);
  if (!user) {
    return jsonResponse(401, { error: '邮箱或密码错误' });
  }

  return jsonResponse(200, { success: true, email });
}

// ========== 备份 ==========

async function handleBackup(request, gistId, token) {
  const body = await request.json();
  const { email, password, data } = body;

  if (!email || !password || !data) {
    return jsonResponse(400, { error: '缺少 email、password 或 data' });
  }

  const user = await authenticate(email, password, gistId, token);
  if (!user) {
    return jsonResponse(401, { error: '密码错误，请重新登录' });
  }

  const filename = `backup_${email}.json`;
  const content = JSON.stringify(data, null, 2);

  const gist = await getGist(gistId, token);
  const fileExists = !!gist.files?.[filename];

  await patchGist(gistId, token, {
    [filename]: { content },
  });

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
  if (!user) {
    return jsonResponse(401, { error: '密码错误，请重新登录' });
  }

  const filename = `backup_${email}.json`;

  const gist = await getGist(gistId, token);
  const fileData = gist.files?.[filename];

  if (!fileData) {
    return jsonResponse(404, { error: '未找到该用户的备份数据', email });
  }

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
