# COC Timer 云端备份 — 完整技术总结

## 一、整体架构

```
用户 (网页/App)
   │
   ├── https://sqggde.github.io/coctimer/  (GitHub Pages，静态页面)
   │        │
   │        └── 调用 API ──→ https://coctimer.pages.dev/api/sync/*
   │                              │  (Cloudflare Pages Function)
   │                              │
   │                              └── 读写 ──→ GitHub Gist (ID: 1c644f8d326478e99ebf9c52a5f7d570)
   │                                           (存储所有用户数据)
   │
   └── App (你即将开发)
            │
            └── 同样调用上面的 API，数据互通
```

**关键：** 网页和 App 共享同一套 API，数据结构完全一致，跨设备可互相恢复。

---

## 二、存储结构

所有数据存在 **一个 Secret Gist**（ID: `1c644f8d326478e99ebf9c52a5f7d570`），Gist 中包含多个文件：

| Gist 文件名 | 内容 |
|---|---|
| `_users.json` | 用户注册信息 `{ "email": { passwordHash, salt, createdAt } }` |
| `backup_{email}.json` | 每个用户的备份数据 |

---

## 三、API 接口

Base URL: `https://coctimer.pages.dev/api/sync`

所有接口均已开启 CORS（`Access-Control-Allow-Origin: *`），App 可直接调用。

### ① 注册

```
POST /api/sync/register
Content-Type: application/json

Body:
{
  "email": "user@example.com",
  "password": "123456"
}

成功响应 200:
{ "success": true, "email": "user@example.com" }

失败响应:
{ "error": "该邮箱已注册" }
{ "error": "邮箱格式无效" }
{ "error": "密码至少6位" }
```

### ② 登录

```
POST /api/sync/login
Content-Type: application/json

Body:
{
  "email": "user@example.com",
  "password": "123456"
}

成功响应 200:
{ "success": true, "email": "user@example.com" }

失败响应 401:
{ "error": "邮箱或密码错误" }
```

### ③ 备份（上传数据）

```
POST /api/sync
Content-Type: application/json

Body:
{
  "email": "user@example.com",
  "password": "123456",
  "data": { ... }   // 备份数据对象
}

成功响应 200:
{
  "success": true,
  "action": "created" | "updated",
  "email": "user@example.com",
  "timestamp": "2026-06-13T..."
}

失败响应 401:
{ "error": "密码错误，请重新登录" }
```

### ④ 恢复（下载数据）

```
GET /api/sync?email=user@example.com&password=123456

成功响应 200:
{
  "success": true,
  "email": "user@example.com",
  "data": { ... },           // 备份数据对象
  "updatedAt": "2026-06-13T..."
}

失败响应 401:
{ "error": "密码错误，请重新登录" }

失败响应 404:
{ "error": "未找到该用户的备份数据", "email": "user@example.com" }
```

---

## 四、备份数据格式（必须一致）

网页版备份的数据结构，App 保存/恢复也务必用同一结构，否则无法跨设备恢复：

```json
{
  "version": 1,
  "exportDate": "2026-06-13T...",
  "accounts": { ... },
  "accountNotes": { ... },
  "accountOrder": [ ... ],
  "currentAccount": "...",
  "settings": { ... }
}
```

其中 `accounts` 和 `settings` 是网页版的核心数据。App 如果存自己独立的数据，只需保持外层结构一致，内部字段可以按需调整。

---

## 五、客户端认证流程（App 需完整实现）

```
1. 用户进入「云端备份」页面

2. 检查 localStorage 是否有 email + password
   ├── 有 → 直接显示已登录状态（显示邮箱）
   └── 无 → 显示「登录账号」（蓝色字）

3. 点击「登录账号」→ 弹出登录界面:
     ├── 邮箱输入框
     ├── 密码输入框（限制中文输入，设置 ime-mode:disabled）
     ├── 登录按钮（绿色）
     └── 「没有账号？点击注册」链接（蓝色字）

4. 点击注册 → 切换到注册界面:
     ├── 邮箱输入框
     ├── 密码输入框（限制中文输入）
     ├── 确认密码输入框
     └── 注册按钮（绿色）

5. 登录/注册成功后:
     - email 存 localStorage（key: 自定，用于持久化登录状态）
     - password 存 localStorage（key: 自定，用于后续 API 调用不重复输入）
     - 界面更新显示用户邮箱

6. 已登录状态下点击邮箱 → 弹窗确认「是否退出当前账号？」
     点是 → 清除 localStorage 中的 email 和 password，界面恢复显示「登录账号」
     点否 → 不操作

7. 点击「云端备份」或「云端恢复」:
     - 直接从 localStorage 读取 email 和 password
     - 调用对应 API
     - 如果 API 返回密码错误（401）→ 清除 localStorage 的 password → 提示重新登录
```

**密码存储规则：**
- App 端用 localStorage 持久化密码（与网页版一致）
- 用户主动退出登录时才清除
- 不要用 sessionStorage（关掉页面就没了，用户要重输）

---

## 六、密码安全（服务端实现）

```
注册时:
  salt = crypto.getRandomValues(16字节) → hex 字符串
  passwordHash = SHA-256(password + salt)
  存储到 _users.json: { email: { passwordHash, salt, createdAt } }

登录/备份/恢复时:
  从 _users.json 读取该 email 的 salt
  hash = SHA-256(输入的密码 + salt)
  比对 hash === 存储的 passwordHash
```

只存哈希 + 盐，不存明文密码。

---

## 七、UI 布局（参考网页版设置页面底部设计）

```
┌──────────────────────────────────┐
│  导出备份 (蓝色) │ 导入备份 (紫色) │  ← 一行等宽
├──────────────────────────────────┤
│  云端备份（跨设备同步）           │
│  登录账号 （蓝色字）              │  ← 登录后显示用户邮箱
│  云端备份 (蓝色) │ 云端恢复 (紫色) │  ← 一行等宽
├──────────────────────────────────┤
│            支持作者               │  ← 最高按钮
└──────────────────────────────────┘
```

---

## 八、App 开发关键要点

| 要点 | 说明 |
|---|---|
| **API 地址** | `https://coctimer.pages.dev/api/sync/*`，CORS 已开 |
| **数据结构** | 必须与网页版一致才能跨设备恢复 |
| **密码持久化** | localStorage 存密码，退出登录才清除 |
| **错误处理** | 收到 401 → 清除本地密码 → 让用户重新登录 |
| **注册校验** | 邮箱格式、密码至少6位、确认密码一致（客户端先校验） |
| **存储上限** | 单个 Gist 文件 10MB，几百用户无压力 |
| **离线支持** | API 需要联网，App 可缓存最后一次备份数据供离线查看 |
