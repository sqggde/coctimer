/**
 * COC Timer WebDAV 本地同步工具
 * 
 * 使用方法：
 *   1. 安装 Node.js (https://nodejs.org)
 *   2. 在浏览器中导出备份（设置 → 导出备份）
 *   3. 运行此脚本
 *
 *   上传备份：node webdav-sync-cli.js upload <备份文件.json>
 *   下载备份：node webdav-sync-cli.js download
 *   查看配置：node webdav-sync-cli.js config
 *
 *   首次使用会提示输入 WebDAV 配置，配置保存后无需重复输入。
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const CONFIG_FILE = path.join(__dirname, 'webdav-sync-config.json');
const BACKUP_FILENAME = 'coc_timer_backup.json';

// ========== 配置管理 ==========

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (e) {}
  return null;
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  console.log('✅ 配置已保存到 ' + CONFIG_FILE);
}

async function promptConfig() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(resolve => rl.question(q, resolve));

  console.log('\n📋 请配置 WebDAV 连接信息：');
  const server = await ask('  服务器地址 (例如 https://dav.jianguoyun.com/dav/): ');
  const username = await ask('  账号: ');
  const password = await ask('  密码 (坚果云请用应用专用密码): ');
  const folder = await ask('  文件夹名称 (直接回车默认 COC_Timer): ') || 'COC_Timer';

  rl.close();
  return { server: server.trim(), username: username.trim(), password, folder: folder.trim() };
}

// ========== HTTP 请求 ==========

function webdavRequest(method, url, auth, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + (u.search || ''),
      method,
      timeout: 30000,
      headers: {
        'Authorization': 'Basic ' + Buffer.from(auth).toString('base64'),
        'User-Agent': 'coc-timer-sync/1.0',
      }
    };
    if (body) {
      opts.headers['Content-Type'] = 'application/json; charset=utf-8';
      opts.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = (u.protocol === 'https:' ? https : http).request(opts, (r) => {
      let data = '';
      r.on('data', c => data += c);
      r.on('end', () => resolve({ status: r.statusCode, headers: r.headers, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
    if (body) req.write(body);
    req.end();
  });
}

// ========== WebDAV 操作 ==========

function getBaseUrl(config) {
  return config.server.endsWith('/') ? config.server : config.server + '/';
}

function getAuth(config) {
  return config.username + ':' + config.password;
}

async function ensureFolder(config) {
  const dirUrl = getBaseUrl(config) + config.folder + '/';
  try {
    const r = await webdavRequest('MKCOL', dirUrl, getAuth(config));
    if (r.status === 201) console.log('📁 已创建文件夹: ' + config.folder);
    return true;
  } catch (e) {
    console.error('❌ 创建文件夹失败:', e.message);
    return false;
  }
}

async function uploadBackup(config, jsonFilePath) {
  console.log('\n📤 上传备份到 WebDAV...');

  // 读取备份文件
  let data;
  try {
    data = fs.readFileSync(jsonFilePath, 'utf8');
    JSON.parse(data); // 验证 JSON 格式
  } catch (e) {
    console.error('❌ 无法读取备份文件或格式错误:', e.message);
    return false;
  }

  // 确保目录存在
  await ensureFolder(config);

  // 上传
  const fileUrl = getBaseUrl(config) + config.folder + '/' + BACKUP_FILENAME;
  console.log('  目标: ' + fileUrl);
  console.log('  大小: ' + (data.length / 1024).toFixed(1) + ' KB');

  try {
    const r = await webdavRequest('PUT', fileUrl, getAuth(config), data);
    if (r.status === 201 || r.status === 204) {
      console.log('✅ 备份上传成功！');
      return true;
    } else {
      console.error('❌ 上传失败 (' + r.status + '): ' + r.body.substring(0, 200));
      return false;
    }
  } catch (e) {
    console.error('❌ 上传请求失败:', e.message);
    return false;
  }
}

async function downloadBackup(config) {
  console.log('\n📥 从 WebDAV 下载备份...');

  const fileUrl = getBaseUrl(config) + config.folder + '/' + BACKUP_FILENAME;
  console.log('  来源: ' + fileUrl);

  try {
    const r = await webdavRequest('GET', fileUrl, getAuth(config));

    if (r.status === 404) {
      console.error('❌ 未找到备份文件。请先执行 upload 命令。');
      return null;
    }
    if (r.status !== 200) {
      console.error('❌ 下载失败 (' + r.status + '): ' + r.body.substring(0, 200));
      return null;
    }

    // 验证 JSON
    try {
      JSON.parse(r.body);
    } catch (e) {
      console.error('❌ 备份数据格式异常');
      return null;
    }

    const outputFile = path.join(__dirname, 'webdav-backup-restored.json');
    fs.writeFileSync(outputFile, r.body, 'utf8');
    console.log('✅ 备份已下载到: ' + outputFile);
    console.log('  大小: ' + (r.body.length / 1024).toFixed(1) + ' KB');
    console.log('\n💡 然后在浏览器中：设置 → 导入备份 → 选择该文件');
    return outputFile;
  } catch (e) {
    console.error('❌ 下载请求失败:', e.message);
    return null;
  }
}

// ========== 主入口 ==========

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  console.log('╔══════════════════════════════╗');
  console.log('║  COC Timer WebDAV 同步工具   ║');
  console.log('╚══════════════════════════════╝');

  // 加载或配置
  let config = loadConfig();

  if (command === 'config' || !config) {
    if (!config) {
      console.log('\n🔑 首次使用，需要配置 WebDAV 连接信息');
    } else {
      console.log('\n📋 当前配置:');
      console.log('  服务器: ' + config.server);
      console.log('  账号: ' + config.username);
      console.log('  密码: ' + '*'.repeat(config.password.length));
      console.log('  文件夹: ' + config.folder);
      console.log('\n  配置文件: ' + CONFIG_FILE);
    }
    config = await promptConfig();
    saveConfig(config);
    if (command === 'config') return;
  }

  if (!command || command === 'help') {
    console.log('\n使用方法:');
    console.log('  node webdav-sync-cli.js upload <备份文件.json>  上传备份');
    console.log('  node webdav-sync-cli.js download                下载备份');
    console.log('  node webdav-sync-cli.js config                  修改配置');
    console.log('\n操作步骤:');
    console.log('  1. 在浏览器中点击「导出备份」得到 .json 文件');
    console.log('  2. node webdav-sync-cli.js upload 那个文件.json');
    console.log('  3. 另一台电脑运行 node webdav-sync-cli.js download');
    console.log('  4. 在浏览器中点击「导入备份」选择下载的文件');
    return;
  }

  if (command === 'upload') {
    const filePath = args[1];
    if (!filePath) {
      console.error('❌ 请指定备份文件路径');
      console.log('  用法: node webdav-sync-cli.js upload <备份文件.json>');
      return;
    }
    await uploadBackup(config, filePath);
  } else if (command === 'download') {
    await downloadBackup(config);
  } else {
    console.error('❌ 未知命令: ' + command);
    console.log('  可用命令: upload, download, config, help');
  }
}

main().catch(e => console.error('运行时错误:', e.message));
