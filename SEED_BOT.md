# City Seed Bot · 城市内容助手 — 交付说明

冷启动内容运营工具。管理员一键生成 / 预览 / 发布 / 清除按 **城市 × 内容类型 × 语言 × 语气** 的城市生活内容。所有内容由**官方账号**（Machi 城市助手 / 编辑部）发布并在库中标记 `is_seed_content = 1`，可按批次或按城市安全回滚，**永不触碰真实用户内容**。

第一版**不接 LLM**：用确定、可控、零成本的**精选内容库**生成。

---

## 1. 新增 / 修改文件

**后端（`web/`，私有仓库）**
- `server.py` — 迁移 v13；`serialize_post` 增加 seed 字段；`import seed_content_library`；新增 `ensure_seed_bot_account` / `insert_seed_post` / `log_seed_action` / `seed_throttle` 帮助函数；7 个 `api_admin_seed_*` 处理器；`_route` 注册路由。
- `seed_content_library.py` 🆕 — 精选内容库 + 生成器（无第三方依赖，可单测）。
- `scripts/test_seed_bot.py` 🆕 — 端到端测试（独立临时 DB）。

**后台前端（`web/app/`，仅 admin 区域，未动公网消费端 UI）**
- `src/lib/api.ts` — `adminSeedGenerate/Batches/Batch/Publish/Clear/ClearCity/Logs` + 类型 `SeedBatch` / `SeedBatchItem` / `SeedLog`。
- `src/app/admin/page.tsx` — 新增「城市内容助手」标签 + `SeedBotPanel`（生成面板 / 预览 / 批次表 / 发布 / 清除 / 按城市清除 / 操作日志）。

**iOS（`Machi/`，公开仓库）**
- `Machi/Services/KaiXAPIDTO.swift` — `is_seed_content` / `seed_author_type`。
- `Machi/Database/PostEntity.swift` — `isSeedContent` / `seedAuthorType`（带默认值 → SwiftData 轻量迁移）。
- `Machi/Services/RemoteSyncService.swift` — DTO→Entity 映射。
- `Machi/Views/Search/DiscoverView.swift` — **删除「热门话题」「热门城市」**两块；新增「编辑部精选」行（由 seed 内容填充，无内容时自动隐藏）。

## 2. 数据库 migration（v13，纯增量幂等，开机自动执行）
- `posts` 增列：`is_seed_content`(INT,默认0)、`seed_batch_id`、`seed_source`、`generated_by`，+2 个索引。
- 新表 `seed_content_batches`（批次：城市/语言/类型/语气/数量/状态/三个计数/创建人）。
- 新表 `admin_seed_content_logs`（操作日志：admin_id / action / batch / 城市 / 语言 / 类型 / count / metadata）。
- 现有行 `is_seed_content` 默认 0（=真实用户），迁移不重写任何旧数据。

## 3. 新增 API（全部 `require_admin`）
| Method | Path | 说明 |
|---|---|---|
| POST | `/api/admin/seed-content/generate` | 生成一批（`count ≤ 100`，`publishNow` 决定 draft/published） |
| GET  | `/api/admin/seed-content/batches` | 批次列表（`region_code`/`status`/`limit`） |
| GET  | `/api/admin/seed-content/batches/{id}` | 批次详情 + 内容预览 |
| POST | `/api/admin/seed-content/batches/{id}/publish` | 发布该批 draft 内容 |
| POST | `/api/admin/seed-content/batches/{id}/clear` | 清除该批（需 `confirm=true`，软删除） |
| POST | `/api/admin/seed-content/clear-city` | 按城市清除（需 `confirm=true`） |
| GET  | `/api/admin/seed-content/logs` | 操作日志 |

## 4. 后台入口
管理后台 → **城市内容助手** 标签（`/admin`，仅管理员）。

## 5. 内容生成逻辑（`seed_content_library.py`）
- 精选文案库按 `(内容类型, 语言)` 组织，命中城市用专属文案，其余用通用模板按城市地名填充（东京→新宿/涩谷/高田马场…，洛杉矶→Koreatown/Santa Monica…）。
- `mixed` 类型按推荐分布缩放：城市广场30 / 问答20 / 指南15 / 租房10 / 二手8 / 工作7 / 搭子5 / 美食5。
- 12 种内容类型映射到 App 现有 `content_type`（city_square→dynamic、qa→question、housing_tip→housing…），seed 内容直接复用现有卡片渲染。
- 语气 `editorial` → 编辑部账号，其余 → 城市助手账号。
- **去重**：批内不重复；库存不足时**宁可少发也不重复**（返回的 `created` 可能 < `requested`）。
- **防 AI/营销腔**：内置禁用词表（“作为一个 AI / 本平台致力于 / 高效便捷 / 宝藏平台…”），命中即丢弃。

## 6. 清除逻辑（安全核心）
- 一律**软删除**：`status='cleared'` + `deleted_at=now`（绝不物理 DELETE）。
- **双重条件**：按批次 = `is_seed_content=1 AND seed_batch_id=?`；按城市 = `is_seed_content=1 AND region_code=?`（可选 language/type）。`is_seed_content=1` 永远是第一道闸 → 真实用户内容（`is_seed_content=0`）永不受影响。
- 需 `confirm=true`（后台 UI 另有危险二次确认弹窗）。

## 7. 权限与安全
- 所有接口 `require_admin`；生成/发布/清除按 admin 每 5 分钟 30 次频率限制。
- `count > 100` 拒绝。
- 官方账号 `role='member'`（**无任何管理员权限**）、`is_verified=1`、官方默认头像、锁定随机密码（不可登录）。
- 不伪装真人：seed 内容作者恒为官方账号，前台显示官方身份 + 轻标签（编辑部整理 / 城市助手），不显示真人头像。
- 每个操作写 `admin_seed_content_logs`（含 `admin_id`），可追踪、可按 batch 回滚。

## 8. 本地测试
```bash
cd web
python3 scripts/test_seed_bot.py     # 端到端，独立临时 DB，25 项断言（含“清除不伤真实内容”）
python3 -m py_compile server.py seed_content_library.py
cd app && npx tsc --noEmit            # 后台 TS 类型检查
```
后台手测：登录管理员 → `/admin` →「城市内容助手」→ 选城市/语言/类型/数量 → 生成 → 预览 → 发布 → 清除。
iOS：生成并发布某城市 seed 后，App 切到该城市，「发现」页出现「编辑部精选」行。

## 9. 生产部署注意
- **部署需同时包含新文件 `seed_content_library.py`**（与 `server.py` 同目录）。
- 迁移 v13 开机自动执行，纯增量，无需手动 backfill；建议先在预发库验证。
- 本功能**不涉及文件上传/媒体**（纯文本），无需 S3/CloudFront 改动。
- 官方账号惰性创建（首次生成对应语言/类型时建号）。

## 10. 已知限制 & 后续
- 精选库容量有限：单城市单类型一次生成过多会因去重返回较少；按需往 `CURATED`/`GENERIC` 追加文案即可扩量。
- 重点覆盖东京/大阪/上海/杭州/洛杉矶/蒙特利尔，其余城市用通用模板 + 默认地名兜底。
- 未接 LLM（二期可在保留同样标记/安全规则前提下接入扩量）。
- seed 帖暂不写入 topic/话题表的聚合；iOS 仅在「发现 · 编辑部精选」做显式标签，其它页面依赖官方账号身份呈现。
- 「编辑部精选」行只在该城市已有 seed 内容时显示（未生成时自动隐藏，保持页面干净）。
