/**
 * COC Timer 云端备份 — Cloudflare Pages Function
 *
 * 架构: 前端 → Cloudflare Worker → GitHub Gist (单个 Gist 中每个用户一个文件)
 *
 * POST /api/sync  — 备份: 将用户数据写入 Gist 中的 backup_{userId}.json
 * GET  /api/sync?userId=xxx — 恢复: 从 Gist 读取 backup_{userId}.json
 *
 * 环境变量 (在 Cloudflare Pages Dashboard 中设置):
 *   GIST_ID      — 用于存储所有用户备份的 GitHub Gist ID
 *   GITHUB_TOKEN — 个人访问令牌 (需要 gist 权限)
 */

const GIST_API = 'https://api.github.com/gists';

export async function onRequest(context) {
  const { request, env } = context;
  const { GIST_ID, GITHUB_TOKEN } = env;

  if (!GIST_ID || !GITHUB_TOKEN) {
    return new Response(JSON.stringify({ error: '服务端未配置 GIST_ID 或 GITHUB_TOKEN' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(request.url);
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // 处理 CORS 预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    if (request.method === 'POST') {
      return await handlePost(request, GIST_ID, GITHUB_TOKEN, corsHeaders);
    } else if (request.method === 'GET') {
      return await handleGet(url, GIST_ID, GITHUB_TOKEN, corsHeaders);
    } else {
      return new Response(JSON.stringify({ error: '不支持的方法' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

/**
 * POST /api/sync
 * Body: { userId: string, data: object }
 * 将 data 写入 Gist 的 backup_{userId}.json 文件
 * 首次创建，后续更新
 */
async function handlePost(request, gistId, token, corsHeaders) {
  const body = await request.json();
  const { userId, data } = body;

  if (!userId || !data) {
    return new Response(JSON.stringify({ error: '缺少 userId 或 data' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // 校验 userId 格式 (安全限制: 只允许字母数字下划线横线)
  if (!/^[a-zA-Z0-9_-]{2,64}$/.test(userId)) {
    return new Response(JSON.stringify({ error: 'userId 格式无效 (2-64位字母数字下划线横线)' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const filename = `backup_${userId}.json`;
  const content = JSON.stringify(data, null, 2);

  // 获取当前 Gist 内容，检查文件是否已存在
  const gistResp = await fetch(`${GIST_API}/${gistId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'coc-timer-cloud-backup',
    },
  });

  if (!gistResp.ok) {
    throw new Error(`获取 Gist 失败: ${gistResp.status}`);
  }

  const gist = await gistResp.json();
  const existingFiles = gist.files || {};
  const fileExists = !!existingFiles[filename];

  // 构建 PATCH 请求体: 只更新这个文件
  const files = {};
  files[filename] = { content };

  const patchResp = await fetch(`${GIST_API}/${gistId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'coc-timer-cloud-backup',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      description: gist.description || 'COC Timer Cloud Backups',
      files,
    }),
  });

  if (!patchResp.ok) {
    const errText = await patchResp.text();
    throw new Error(`更新 Gist 失败: ${patchResp.status} — ${errText}`);
  }

  return new Response(
    JSON.stringify({
      success: true,
      action: fileExists ? 'updated' : 'created',
      userId,
      timestamp: new Date().toISOString(),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
  );
}

/**
 * GET /api/sync?userId=xxx
 * 从 Gist 读取 backup_{userId}.json 并返回
 */
async function handleGet(url, gistId, token, corsHeaders) {
  const userId = url.searchParams.get('userId');

  if (!userId) {
    return new Response(JSON.stringify({ error: '缺少 userId 参数' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const filename = `backup_${userId}.json`;

  const gistResp = await fetch(`${GIST_API}/${gistId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'coc-timer-cloud-backup',
    },
  });

  if (!gistResp.ok) {
    throw new Error(`获取 Gist 失败: ${gistResp.status}`);
  }

  const gist = await gistResp.json();
  const fileData = gist.files?.[filename];

  if (!fileData) {
    return new Response(JSON.stringify({ error: '未找到该用户的备份数据', userId }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // 解析备份数据
  let backupData;
  try {
    backupData = JSON.parse(fileData.content);
  } catch {
    return new Response(JSON.stringify({ error: '备份数据格式异常' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  return new Response(
    JSON.stringify({
      success: true,
      userId,
      data: backupData,
      updatedAt: fileData.updated_at || gist.updated_at,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
  );
}
