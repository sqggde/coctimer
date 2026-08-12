/**
 * COC Timer 诊断 — 检查备份数据
 *
 * GET /api/sync/debug?email=xxx&password=yyy
 */
const GIST_API = 'https://api.github.com/gists';

export async function onRequest(context) {
  const { request, env } = context;
  const { GIST_ID, GITHUB_TOKEN } = env;

  if (!GIST_ID || !GITHUB_TOKEN) {
    return json(500, { error: '未配置 GIST_ID 或 GITHUB_TOKEN' });
  }

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (request.method !== 'GET') return json(405, { error: '仅支持 GET' });

  try {
    const url = new URL(request.url);
    const email = url.searchParams.get('email');
    const password = url.searchParams.get('password');

    if (!email || !password) return json(400, { error: '缺少 email 或 password' });

    // 1. 获取 Gist 原始数据
    const gistResp = await fetch(`${GIST_API}/${GIST_ID}`, {
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, 'User-Agent': 'coc-timer' },
    });
    if (!gistResp.ok) return json(500, { error: `GitHub API 错误: ${gistResp.status}` });

    const gist = await gistResp.json();
    const allFiles = Object.keys(gist.files || {});
    
    // 2. 读取用户数据
    const usersFile = gist.files?.['_users.json'];
    const usersRaw = usersFile?.content || '{}';
    let users;
    try { users = JSON.parse(usersRaw); } catch { users = { parseError: usersRaw.substring(0, 200) }; }

    const user = users[email];
    
    // 3. 验证密码
    let pwdOk = false;
    if (user) {
      const salt = user.salt || '';
      const encoder = new TextEncoder();
      const data = encoder.encode(password + salt);
      const hash = await crypto.subtle.digest('SHA-256', data);
      const hashHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
      pwdOk = (hashHex === user.passwordHash);
    }

    // 4. 读取备份文件 - 如果 content 为空，尝试通过 raw_url 获取
    const filename = `backup_${email}.json`;
    const backupFile = gist.files?.[filename];
    
    let realContent = backupFile?.content;
    if (!realContent && backupFile?.raw_url) {
      try {
        const rawResp = await fetch(backupFile.raw_url);
        realContent = rawResp.ok ? await rawResp.text() : null;
      } catch {}
    }
    
    const debug = {
      email,
      userExists: !!user,
      passwordMatch: pwdOk,
      allFilesInGist: allFiles,
      backupFileExists: !!backupFile,
      backupFileSize: backupFile?.size || 0,
      backupFileRawUrl: backupFile?.raw_url || null,
      backupFileContentFromAPI: backupFile?.content || null,
      backupFileContentFromRaw: realContent ? realContent.substring(0, 500) : null,
      backupFileTruncated: realContent ? realContent.length > 500 : false,
      usersFileSize: usersRaw.length,
      usersCount: Object.keys(users).length,
    };

    // 5. 如果备份文件存在，尝试解析
    if (realContent) {
      try {
        JSON.parse(realContent);
        debug.backupParseOk = true;
      } catch (e) {
        debug.backupParseOk = false;
        debug.backupParseError = e.message;
      }
    }

    return json(200, debug);
  } catch (err) {
    return json(500, { error: err.message, stack: err.stack });
  }
}

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(status, data) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors() },
  });
}
