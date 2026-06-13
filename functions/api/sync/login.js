/**
 * COC Timer 用户登录 — Cloudflare Pages Function
 *
 * POST /api/sync/login — { email, password }
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
    return await handleLogin(request, GIST_ID, GITHUB_TOKEN);
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

async function handleLogin(request, gistId, token) {
  const { email, password } = await request.json();

  if (!email || !password) {
    return jsonResponse(400, { error: '邮箱和密码不能为空' });
  }

  const gist = await getGist(gistId, token);
  const users = readGistFile(gist, '_users.json') || {};
  const user = users[email];

  if (!user) return jsonResponse(401, { error: '邮箱或密码错误' });

  const hash = await hashPassword(password, user.salt);
  if (hash !== user.passwordHash) return jsonResponse(401, { error: '邮箱或密码错误' });

  return jsonResponse(200, { success: true, email });
}
