/**
 * COC Timer 用户注册 — Cloudflare Pages Function
 *
 * POST /api/sync/register — { email, password }
 */

const GIST_API = 'https://api.github.com/gists';

export async function onRequest(context) {
  const { request, env } = context;
  const { GIST_ID, GITHUB_TOKEN } = env;

  if (!GIST_ID || !GITHUB_TOKEN) {
    return jsonResponse(500, { error: '服务端未配置 GIST_ID 或 GITHUB_TOKEN' });
  }

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
  if (request.method !== 'POST') return jsonResponse(405, { error: '仅支持 POST' });

  try {
    return await handleRegister(request, GIST_ID, GITHUB_TOKEN);
  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

function generateSalt() {
  const rand = new Uint8Array(16);
  crypto.getRandomValues(rand);
  return bytesToHex(rand);
}

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
