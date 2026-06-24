# 单体 HTML 拆分模块化改造总结

> 原文件: `index.html` (131KB / ~2181行)  
> 改造后: `index.html` (30KB / 361行) + 16 JS 模块文件 + 1 CSS 文件  
> 改造方式: **纯剪切粘贴，零逻辑改动**

---

## 1. 改造目标

- **index.html 仅做前端** — 只保留 HTML 骨架 + CDN 引用
- **JS 按功能模块拆分** — 每个文件负责一个独立领域
- **CSS 独立** — 自定义样式移到单独文件
- **使用体验零变化** — 不改变任何交互、布局、视觉
- **数据格式不变** — localStorage key 和数据结构不动，确保网页与客户端 App 之间备份互通

---

## 2. 最终项目结构

```
├── index.html                    ← 仅 HTML 骨架 + 外部引用
├── assets/
│   ├── css/
│   │   └── style.css             ← 全部自定义样式
│   └── js/
│       ├── app.js                ← 全局状态 + DOM 引用 + init() + 事件绑定
│       ├── pwa.js                ← PWA 注册（未改动）
│       ├── core/
│       │   ├── constants.js      ← 物品名称映射表 ITEM_NAMES / CATEGORY_NAMES
│       │   ├── calculator.js     ← 计算引擎（完成时间计算、升级项提取）
│       │   ├── storage.js        ← localStorage 读写 + key 常量
│       │   ├── settings.js       ← 设置加载/保存/暗黑模式/睡眠模式
│       │   ├── instance.js       ← 多窗口单例互斥
│       │   ├── import.js         ← 粘贴/手动导入数据
│       │   └── accounts.js       ← 账号增删/备注/切换/重建标签栏
│       ├── utils/
│       │   ├── time.js           ← formatRemainingTime / formatDateTime
│       │   ├── colors.js         ← 颜色优先级系统
│       │   └── misc.js           ← escapeHtml 等通用工具
│       ├── ui/
│       │   └── renderer.js       ← 升级列表渲染/数据信息/标题更新
│       ├── features/
│       │   ├── sort.js           ← 账号排序拖拽
│       │   ├── helper.js         ← 助手冷却
│       │   └── swipe.js          ← 左右滑动切换账号
│       └── cloud/
│           └── sync-client.js    ← 云端登录/注册/备份/恢复
├── service-worker.js             ← PWA Service Worker（未改动）
├── manifest.json                 ← PWA Manifest（未改动）
└── functions/                    ← Cloudflare Pages Functions（未改动）
```

---

## 3. 加载顺序（关键）

script 标签的加载顺序**必须严格按照依赖关系**，否则函数/变量未定义会报错：

```
 1. core/constants.js      ← 常量（无依赖）
 2. utils/time.js           ← 时间格式化（无依赖）
 3. utils/misc.js           ← 通用工具（无依赖）
 4. core/calculator.js      ← 计算引擎（依赖常量）
 5. utils/colors.js         ← 颜色系统（依赖 calculator）
 6. core/storage.js         ← 存储管理（无函数依赖）
 7. core/settings.js        ← 设置管理（依赖 calculator）
 8. core/instance.js        ← 单例管理（无函数依赖）
 9. core/import.js          ← 导入（依赖已有函数）
10. features/helper.js      ← 助手冷却（依赖已有函数）
11. features/swipe.js       ← 滑动手势（依赖已有函数）
12. ui/renderer.js          ← UI 渲染（依赖 calculator/colors/settings）
13. features/sort.js        ← 排序拖拽（依赖 accounts 等）
14. core/accounts.js        ← 账号管理（依赖几乎所有模块）
15. cloud/sync-client.js    ← 云端同步
16. app.js                  ← 主入口（最后加载，执行 init）
```

> **原理：** 所有模块用 `<script>` 标签（非 type="module"）加载，函数定义和 `let/const` 变量声明在全局作用域中。  
> 全局状态变量（`accounts`、`accountNotes`、`accountOrder`、`currentAccount`）在 `app.js` 中声明，其他模块中的函数在**调用时**（即 init 运行后）才访问这些变量，因此声明在后的模式安全。

---

## 4. 如何拆分（操作方法）

### 4.1 分析阶段

1. **通读原文件**，列出所有全局函数和变量的用途
2. **按领域分组**：
   - 纯数据 → constants
   - 纯计算 → calculator
   - 工具函数 → utils/*
   - DOM 渲染 → ui/*
   - 业务逻辑 → core/*、features/*、cloud/*
3. **画依赖图**：谁调用了谁，确定加载顺序

### 4.2 执行阶段

1. 创建目录结构
2. 从原 `<script>` 块中**逐段剪切代码**到对应文件
3. 原 `<script>` 中每剪掉一段，在该位置留下注释（可选）便于追踪
4. 全部剪切完后，用 `<script src="...">` 按顺序替换原脚本块
5. CSS 同样从 `<style>` 移到 `.css` 文件

### 4.3 验证阶段

1. **语法检查**：对每个 .js 文件跑 `node -c filename.js`
2. **文件完整性**：确保每个 `<script src>` 引用的文件都存在
3. **功能测试**：在浏览器中打开页面，测试核心功能
4. **回退方案**：保留原文件备份（本项目保留了 `V6.4.html`、`V7.0.4.html`、`V7.1.1.html`）

---

## 5. 备份数据互通保障

这是关键点——网页和 App 之间能互相读取对方的备份数据，必须满足：

### 5.1 localStorage Key 不变

```js
// storage.js 中的 key 常量——不能改
const STORAGE_KEY = "clash_upgrade_assistant_v3_fixed";
const INSTANCE_KEY = "clash_upgrade_assistant_instance";
const SETTINGS_KEY = "clash_upgrade_settings";
```

App (如 Android WebView) 和网页共用同一套 key，数据自然互通。

### 5.2 数据结构不变

```js
// 导出备份的数据格式
{
  version: 1,
  exportDate: "2026-06-24T...",
  data: {
    accounts: { ... },       // 按 tag 索引的游戏数据
    accountNotes: { ... },   // 账号备注名
    accountOrder: [...],     // 账号顺序
    currentAccount: "..."    // 当前选中账号
  },
  settings: { ... }          // 所有设置项
}
```

App 端导入备份时，解析这个结构并写入同样的 localStorage key 即可。

### 5.3 云端备份也互通

云端 API (`/api/sync`) 的请求/响应格式不变。网页和 App 调用同一个接口，读写同一份云端数据。

---

## 6. 后续开发指南

| 要改什么 | 去哪个文件 |
|---|---|
| 物品名称/分类 | `core/constants.js` |
| 加速/增益计算规则 | `core/calculator.js` |
| 颜色/优先级 | `utils/colors.js` |
| 时间显示格式 | `utils/time.js` |
| 存储 key 或数据迁移 | `core/storage.js` |
| 设置项/暗黑模式 | `core/settings.js` |
| 账号 CRUD | `core/accounts.js` |
| 导入数据逻辑 | `core/import.js` |
| 升级卡片渲染 | `ui/renderer.js` |
| 排序拖拽交互 | `features/sort.js` |
| 助手冷却逻辑 | `features/helper.js` |
| 滑动切换手势 | `features/swipe.js` |
| 云端登录/备份/恢复 | `cloud/sync-client.js` |
| 主入口/事件绑定 | `app.js` |

---

## 7. 注意事项

1. **不要混合 type="module" 和普通 script** — 本项目使用普通 `<script>` 标签，所有变量在全局作用域中共享。如果改用 ES Module，需要重构为 `import/export` 并处理循环依赖。
2. **全局变量集中在 app.js** — `accounts`、`accountOrder`、`currentAccount`、`settings` 等状态变量在 app.js 中声明（最后加载），确保其他模块的函数定义在前、变量声明在后，但函数只在运行时访问变量。
3. **CSS 的 Tailwind 配置保留在 index.html** — Tailwind 的 `tailwind.config` 需要内联在 CDN 脚本之后，不能外移到 CSS 文件。
4. **CDN 链接保留** — Tailwind CSS 和 Font Awesome 仍从 CDN 加载，这在桌面和 WebView 中均可工作。
5. **PWA Service Worker** — JS/CSS 改用 `staleWhileRevalidate` 策略，保证推送更新后刷新可看到新版，无需手动清缓存。新增 JS 文件时需在 `service-worker.js` 的 `STATIC_ASSETS` 中添加。
