# Machi Web

生产级 Web 客户端，与 iOS App 共享同一套账号、数据库、API。

```
web/
├── server.py        统一后端：Python + SQLite + 80+ REST 端点 + SSE
├── kaix.db          统一数据库（19 张表，soft delete + cursor 分页）
├── media/           上传文件（图片/视频）
├── app/             Web 客户端：Next.js 15 + React 19 + TypeScript + Tailwind
└── static/          旧版 vanilla JS 原型（保留作对照，不再使用）
```

## 启动

需要 **Python 3 + Node 20+**。

```bash
# 1. 启动后端（端口 8787，提供 /api 与 /media）
cd web
python3 server.py
# Machi backend starting on http://127.0.0.1:8787 (env=development)

# 2. 另开一个终端启动 Web 客户端（端口 3000，开发模式）
cd web/app
npm install
npm run dev          # 或者 npm run build && npm start

# 3. 打开浏览器
http://localhost:3000
```

演示账号：

```
kaizi / 123456
```

## 架构图

```
┌─────────────────────┐      ┌─────────────────────┐
│   iOS App           │      │   Web (Next.js)     │
│  (SwiftUI + Swift)  │      │  (Next.js + React)  │
└──────────┬──────────┘      └──────────┬──────────┘
           │       HTTPS / JSON         │
           └─────────────┬──────────────┘
                         ▼
           ┌──────────────────────────┐
           │  统一后端 (web/server.py) │
           │  /api/* · /media/*       │
           │  Bearer token + SSE      │
           └────────────┬─────────────┘
                        ▼
           ┌──────────────────────────┐
           │   SQLite (web/kaix.db)   │
           │   19 张表 · WAL · 索引   │
           └──────────────────────────┘
```

iOS App 接入步骤（下一阶段）：

1. 在 `kaizi/Services/` 下加 `KaiXAPIClient.swift`（与 `web/app/src/lib/api.ts` 等价）。
2. 把 `kaizi/Repositories/*` 的实现从 SwiftData 切到 API。
3. SwiftData 仅保留作离线缓存与草稿暂存。
4. iOS 与 Web 完全共用同一套登录、Feed、点赞、评论、私信。

## API 概览

详见 `server.py` 头部的接口清单。完整目录：

```
auth/register · auth/login · auth/logout · auth/me (GET/PATCH/DELETE)
users/:id (+ posts/replies/media/likes/bookmarks/followers/following)
users/:id/follow · /block · /report
feed?mode=recommend|following|hot
posts (CRUD) · posts/:id/like · /bookmark · /repost · /view · /report
posts/:id/comments (list+create) · comments/:id (delete) · /like
search?q=&kind= · trending · topics/:tag · search/history
notifications · notifications/read · notifications/:id
conversations · conversations/:id (delete/messages) · messages/:id
media/upload · media/:id
settings (GET/PATCH) · cache/clear · export · feedback
devices · devices/:id · blocks · drafts (list/save/delete)
events (Server-Sent Events，实时通知 / 私信)
```

所有写操作 401 → 401 unauthorized；所有错误统一返回 `{error: {code, message}}` 形式。

## 已实现页面（22 条路由）

公开：`/login`, `/register`, `/forgot`, `/legal/terms`, `/legal/privacy`

应用：`/`（自动跳转）, `/home`, `/explore`, `/search`, `/notifications`,
`/messages`, `/messages/:id`, `/me`, `/u/:handle`, `/p/:id`, `/t/:tag`,
`/bookmarks`, `/drafts`, `/settings`, `/settings/blocks`, `/settings/devices`,
`/help`, `/feedback`

每个页面都有 loading / empty / error / retry 四种状态。

## 设计系统

`app/src/styles/globals.css` + `app/tailwind.config.ts` 完整复刻 iOS 端
`kaizi/Components/DesignSystem.swift` 的 token：

| token       | 值（与 iOS 对齐）                                     |
| ----------- | ----------------------------------------------------- |
| 圆角        | `xs=7, sm=9, md=13, lg=18, card=14, sheet=22`         |
| 间距        | `xs=4, sm=8, md=12, lg=16, screen=16`                 |
| 字号        | `meta=12 / body=15 / title=21 / display=30`           |
| 头像        | `xs=30 / sm=36 / md=40 / lg=56 / profile=82`          |
| accent      | 亮 `#3c40c6` / 暗 `#8e94f0`（与 iOS 同色）            |
| heat        | 亮 `#ea751a` / 暗 `#f7a24f`（与 iOS 同色）            |

浅 / 深色模式：根据 `prefers-color-scheme` 自动跟随，也可在 Sidebar 一键切换，状态保存到 localStorage。

## 响应式

| 视口宽度   | 布局                                            |
| ---------- | ----------------------------------------------- |
| ≥ 1280px   | 左侧导航 + 中央 Feed + 右侧热榜 / 推荐 / 话题   |
| 768–1280px | 左侧压缩导航 + 中央 Feed（右栏隐藏）            |
| < 768px    | 底部 TabBar（首页 / 发现 / 投稿 / 通知 / 我的） |

底部 TabBar 已处理 `env(safe-area-inset-bottom)`，输入框不会被遮挡。

## 验收路径

```bash
# 1. 启动两个服务后，访问 http://localhost:3000
# 2. 用 kaizi / 123456 登录
# 3. 检查：
#    - 首页能切换推荐 / 关注 / 热度
#    - 点赞 / 收藏 / 转发按钮立即反应（乐观更新）
#    - 引用转发 / 编辑帖子 / 删除帖子 / 举报帖子
#    - 进入帖子详情可评论 / 回复 / 删除评论
#    - 搜索：关键词、用户、话题三种模式 + 历史记录
#    - 发现：热榜 / 话题 / 推荐关注
#    - 通知：分类筛选 + 全部已读 + 删除 + 跳转
#    - 私信：新建会话 + 文本 + 图片附件 + 删除消息
#    - 投稿：文本 + 图片拖拽 + 标签 + 草稿
#    - 设置：语言 / 外观 / 通知 / 隐私 / 黑名单 / 设备 / 数据导出 / 删除账号
#    - 个人主页：5 个分段切换 + 编辑资料
#    - Ctrl / Cmd + Enter 快捷发送
#    - 切换深色模式
```

## 已知后续工作（非阻塞）

- iOS Repository 层接入 HTTP API（后端已经就位，工作量在 App 侧）
- 增加 WebSocket 升级（当前用 SSE，私信 / 通知都已能实时推送）
- 媒体上传走对象存储（当前直存 `web/media/`，SQLite 仅保留元数据）
- 多语言：界面文案目前只有简体中文，结构上预留了 `settings.language`
