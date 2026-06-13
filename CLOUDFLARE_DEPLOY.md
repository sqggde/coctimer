# Cloudflare Pages 部署 & 云端备份配置指南

## 一、部署静态站点到 Cloudflare Pages

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 左侧菜单 → **Workers 和 Pages** → **Pages** → **创建项目** → **连接到 Git**
3. 授权 GitHub 账号，选中 `coctimer` 仓库
4. **设置构建配置：**
   - 框架预设：**None**
   - 构建命令：留空
   - 构建输出目录：**`/`**（或留空）
5. 点击 **保存并部署**，等待部署完成

> 部署后你的站点会在 `https://你的项目名.pages.dev` 访问

---

## 二、创建 GitHub Gist 作为存储后端

1. 打开 https://gist.github.com
2. 创建一个 **Secret** Gist（不要选 Public）：
   - 文件名随意，如 `COC-Timer-Backup.md`
   - 内容随意，写一句说明
   - 点击 **Create secret gist**
3. 创建成功后，浏览器地址栏会变成：
   ```
   https://gist.github.com/你的用户名/1a2b3c4d5e6f7g8h9i0j
   ```
   **记下最后一段 `1a2b3c4d5e6f7g8h9i0j`**，这就是 GIST_ID

---

## 三、创建 GitHub 个人访问令牌

1. 打开 https://github.com/settings/tokens
2. 点击 **Generate new token (classic)**
3. 设置：
   - Note：`COC Timer Cloud Sync`
   - Expiration：选 **No expiration**（或你觉得合适的期限）
   - Scopes：只勾选 **`gist`**
4. 点击 **Generate token**
5. **复制并保存生成的 token**（离开页面后就看不到了），这就是 GITHUB_TOKEN

---

## 四、配置 Cloudflare Pages 环境变量

1. 在 Cloudflare Pages Dashboard 进入你的项目
2. **设置** → **环境变量（Environment variables）**
3. 添加以下两个变量（**生产环境**）：

   | 变量名 | 值 | 说明 |
   |---|---|---|
   | `GIST_ID` | `1a2b3c4d5e6f7g8h9i0j` | 你创建的 Gist ID |
   | `GITHUB_TOKEN` | `ghp_xxxxxxxxxxxxxxxxxxxx` | 你的 GitHub 令牌 |

4. **部署 → 重新部署** 以生效

> ⚠️ **重要：** `GITHUB_TOKEN` 务必勾选 **加密（Encrypt）**，Cloudflare 会自动加密存储。

---

## 五、如何使用云端备份功能

部署完成后，打开你的网站，进入设置面板，会看到「云端备份」区域：

### 首次使用
1. 在「恢复密码」输入框设置一个密码（如 `MyCocBackup2024`）
2. 点击 **云端备份** → 数据会上传到 GitHub Gist
3. 密码会自动保存到浏览器，下次打开无需重复输入

### 跨设备恢复
1. 在新设备打开网站，进入设置
2. 输入**相同的恢复密码**
3. 点击 **云端恢复** → 数据从 Gist 下载并覆盖本地
4. 页面自动刷新后数据生效

---

## 六、数据安全说明

| 方面 | 说明 |
|---|---|
| **传输加密** | 前端 → Cloudflare → GitHub 全程 HTTPS |
| **存储加密** | Gist 是 Secret 类型，不公开；GitHub 服务端加密 |
| **访问控制** | 只有你的 GitHub Token 才能读写 Gist |
| **恢复密码** | 不加密，仅用来区分 Gist 中的文件名；建议设一个不容易猜的密码 |
| **隐私** | Gist 存储的是游戏进度 JSON，不包含密码等敏感信息 |

如果需要更安全的端到端加密（服务端无法读取数据），可以后续在前端用恢复密码派生 AES 密钥对数据进行加密后再上传。
