# Machi Web / iOS Sync Report

Date: 2026-06-01

Scope: Web app, iOS app DTO/client layer, shared Python backend API serializers, membership/payment/news/post synchronization contracts.

## Summary

This pass checked the Web and iOS surfaces against the shared backend. The important architecture is already correct: Web and iOS both talk to the same Python backend for auth, feed, posts, comments, likes, bookmarks, reposts, messages, notifications, local news, membership, and Apple IAP verification. This pass did not remove any API field or database column. It added compatibility fields and stable defaults to backend serializers so newer Web/iOS clients can use the same model names while older clients keep working.

## Function Matrix

| 功能 | Web 是否有 | iOS 是否有 | 是否共用 API | 是否数据同步 | 当前问题 | 修复建议 |
|---|---|---|---|---|---|---|
| 注册 | Yes | Yes | Yes | Yes | iOS 有离线本地 fallback，离线注册不会立刻同步 | 后续改成 queued sync 或明确离线草稿状态 |
| 登录 | Yes | Yes | Yes | Yes | 无核心差异 | 保持统一错误格式 |
| 退出登录 | Yes | Yes | Yes | Yes | 无核心差异 | 保持 token 清理一致 |
| 忘记密码 | Yes | Client API exists, UI incomplete | Yes | Partial | iOS 缺完整重置页面 | 补 iOS forgot/reset flow |
| 邮箱验证码 | Yes | Client API exists, UI incomplete | Yes | Partial | iOS 注册 UI 未完整接入验证码 | 补 iOS 注册/重置验证码 UI |
| 用户名查重 | Yes | Client API exists | Yes | Yes | iOS UI 未确认全量接入 | 在 AuthView 接入远端查重 |
| 邮箱查重 | Yes | Client API exists | Yes | Yes | iOS UI 未确认全量接入 | 在 AuthView 接入远端查重 |
| 首页信息流 | Yes | Yes | Yes | Yes | 排序可不同 | 保持同一 `/api/feed` |
| 发现页 | Yes | Yes | Yes | Yes | 布局不同 | 允许布局差异 |
| 搜索 | Yes | Yes | Yes | Yes | 无核心差异 | 保持 `/api/search` |
| 本地资讯 | Yes | Yes | Yes | Yes | 字段别名不足 | 已补 News aliases/defaults |
| 资讯详情 | Yes | Yes | Yes | Yes | 免责声明字段不统一 | 已补 `editorial_disclaimer` |
| 发布内容 | Yes | Yes | Yes | Yes | 高信任门槛需后端兜底 | 已由后端统一校验 |
| 帖子详情 | Yes | Yes | Yes | Yes | 部分权限字段缺别名 | 已补 `canEdit/canDelete` |
| 评论 | Yes | Yes | Yes | Yes | 无核心差异 | 保持统一 comment API |
| 点赞 | Yes | Yes | Yes | Yes | 状态字段命名有 snake/camel 差异 | 已补 aliases |
| 收藏 | Yes | Yes | Yes | Yes | Web 用 bookmark，规格用 save | 已补 save aliases |
| 转发 | Yes | Yes | Yes | Yes | 状态字段命名差异 | 已补 `isReposted` |
| 分享 | Yes | Partial | Yes | Partial | posts shareCount 还不是完整互动计数 | 后续给 posts 增加持久 share metric |
| 关注 | Yes | Yes | Yes | Yes | 无核心差异 | 保持 follow API |
| 私信 | Yes | Yes | Yes | Yes | Web UI 已修；iOS 使用同 API | 继续做移动端回归 |
| 通知 | Yes | Yes | Yes | Yes | 无核心差异 | 保持 `/api/notifications` |
| 个人主页 | Yes | Yes | Yes | Yes | Web sticky tabs 已修 | 后续统一公开权限文案 |
| 编辑资料 | Yes | Yes | Yes | Yes | 无核心差异 | 保持 `/api/auth/me` PATCH |
| 城市选择 | Yes | Yes | Yes | Yes | 后端使用稳定 code，规格里有显示名 | 保持 code，增加显示字段/文档 |
| 语言选择 | Yes | Yes | Yes | Yes | code/label 需要统一文档 | 保持 `zh-CN/ja/en/all` |
| 话题 / 热榜 | Yes | Yes | Yes | Yes | 排序可不同 | 保持 shared data |
| 推荐关注 | Yes | Yes | Yes | Yes | 无核心差异 | 保持 trending users |
| Machi 认证会员 | Yes | Yes | Yes | Yes | membership DTO 不完整 | 已补 entitlement aliases |
| 会员专属页 | Yes | Yes | Yes | Yes | iOS 入口较深 | 可在 Settings/Home 增强入口 |
| 会员权益页 | Yes | Yes | Yes | Yes | 无核心差异 | 保持 `/api/membership/benefits` |
| 会员订单 | Yes | Partial | Yes | Yes | iOS 不需要显示 Web order list | iOS 只显示 IAP state 即可 |
| Web 微信支付 | Yes | No by design | Yes | Yes | 合规上 iOS 不可展示 | 保持 Web-only |
| Web 支付宝 | Yes | No by design | Yes | Yes | 合规上 iOS 不可展示 | 保持 Web-only |
| iOS Apple IAP | No by design | Yes | Yes | Yes | Web 不展示 Apple IAP | 保持 iOS-only |
| 会员 Badge | Yes | Yes | Yes | Yes | 官方/会员需区分 | 已补 official/member aliases |
| 高信任内容发布 | Yes | Yes | Yes | Yes | 必须后端强校验 | 已由 `require_verified_membership` 兜底 |
| 本地服务发布 | Yes | Yes | Yes | Yes | 会员门槛统一 | 保持 content_type rules |
| 招聘发布 | Yes | Yes | Yes | Yes | 会员门槛统一 | 保持 content_type rules |
| 租房发布 | Yes | Yes | Yes | Yes | 会员门槛统一 | 保持 content_type rules |
| 二手发布 | Yes | Yes | Yes | Yes | 免费类型 | 保持 shared compose model |
| 搭子 / 约饭 | Yes | Yes | Yes | Yes | 免费类型 | 保持 shared compose model |
| 本地资讯来源显示 | Yes | Yes | Yes | Yes | source note 字段缺统一 | 已补 `source_note` |
| Machi 编辑部内容 | Yes | Yes | Yes | Yes | 身份需避免普通用户化 | 已补 author aliases/source note |
| 游客浏览 | Yes | Yes | Yes | Yes | 写操作需登录 | 后端 require_user 兜底 |
| 登录后互动 | Yes | Yes | Yes | Yes | 无核心差异 | 保持 optimistic + server truth |
| 默认浅色模式 | Yes | iOS native | N/A | N/A | Web 已默认 light | 保持 Web localStorage only |
| 手动深色模式 | Yes | iOS native | N/A | N/A | Web/iOS 不共享主题 | 正确，不同步 |
| 后台管理，仅 Web 管理员 | Yes | No by design | Yes | N/A | iOS 不应有后台 | 保持 Web-only |
| 爬虫管理，仅 Web 后台 | Yes | No by design | Yes | Published content syncs | iOS 不管理 crawler | 保持 Web-only 管理，iOS 读取 published |

## Implemented API / Model Fixes

- `serialize_user` now returns stable aliases: `displayName`, `avatarUrl`, `createdAt`, `updatedAt`, `isOfficial`, `officialRole`, `isVerifiedMember`, `verifiedMemberUntil`, `membershipStatus`, `membershipPlanKey`, `verifiedBadgeType`, `followerCount`, `followingCount`, `postCount`, `isFollowing`, `canMessage`.
- `serialize_post` now returns stable aliases/defaults: `viewCount`, `likeCount`, `saveCount`, `commentCount`, `shareCount`, `heatScore`, `isLiked`, `isSaved`, `isReposted`, `canEdit`, `canDelete`, `images`, `videoUrl`, `cityPath`, `contentType`, `category`, `requiresMembership`, `sourceType`.
- `serialize_editorial_post` now returns stable aliases/defaults: `authorDisplayName`, `authorType`, `sourceName`, `sourceUrl`, `originalUrl`, `sourcePublishedAt`, `publishedAt`, `riskLevel`, `sourceNote`, `editorialDisclaimer`, `isSaved`, `canInteract`, `viewCount`, `saveCount`, `shareCount`, `clickSourceCount`.
- `get_user_membership_status` now exposes entitlement-style fields: `userId`, `planKey`, `isActive`, `expiresAt`, `startedAt`, `provider`, `price`, `currency`, `benefits`, `verifiedBadgeType`, `canPostHighTrustContent`, `canAccessExclusivePage`, `dailyPostLimit`, `priorityReview`, `lightBoost`.
- `serialize_order` now exposes payment model aliases: `id`, `userId`, `orderNo`, `provider`, `planKey`, `platform`, `transactionId`, `errorMessage`, `createdAt`, `paidAt`, `expiresAt`.
- Web TypeScript models were extended to recognize the new fields.
- iOS DTOs were extended with optional fields, so new backend fields decode cleanly and older backend responses remain compatible.

## Data Sync Rules Checked

- Users: both clients use `/api/auth/*` and `/api/users/*`; membership cache remains derived from `user_memberships`.
- Posts: both clients use shared post/feed/comment/interaction APIs. Visitor state now has explicit `canInteract=false` and interaction aliases.
- News: both clients use `/api/news`; Tokyo/Osaka city filters already include Japan-wide backend behavior via `city IN (?, '')`.
- Membership: Web payment, Apple IAP, admin grant, and expiry all converge through `user_memberships`.
- Payments: Web order creation rejects Apple IAP; iOS StoreKit uses `/api/payments/apple/verify`; idempotency is in `payment_orders` and webhook tables.
- Theme: Web theme remains local Web state; iOS theme remains native app state.

## Remaining Differences

- iOS forgot-password/reset UI is incomplete even though backend/client methods exist.
- iOS email verification UI needs full registration/reset integration.
- Post `shareCount` is now stable as a response field, but post share metrics are not yet persisted like news share metrics.
- City/country API uses stable backend codes (`jp`, `tokyo`) plus region display objects. The report recommends documenting these as canonical codes instead of changing stored values to display labels, because changing them would break existing filters.
- Live Web payments, Alipay/WeChat webhook settlement, and Apple StoreKit sandbox were not exercised in this local pass.
- Full browser visual QA could not be completed in the in-app Browser because the local target was blocked by the browser policy in this session.

## Web Test Results

- `npm run type-check`: passed.
- `npm run lint`: passed.
- `python3 -m py_compile server.py`: passed.
- `git diff --check`: passed before commit.

## iOS Test Results

- `xcodebuild -project Machi/Machi.xcodeproj -scheme Machi -destination 'platform=iOS Simulator,name=iPhone 17' -quiet build`: passed.
- The first attempted destination, `iPhone 16`, was unavailable on this Mac; the available `iPhone 17` simulator was used instead.

## Payment / Membership Test Results

- Code-path audit passed for: Web-only payment providers, iOS-only Apple IAP verification endpoint, server-side amount calculation, membership activation through server-confirmed payment/admin grant only, lazy expiry sync.
- Live provider settlement was not tested locally because it requires configured external provider credentials/sandbox accounts.

## App Store Compliance

- iOS membership purchase is StoreKit-only.
- iOS client does not call `/api/payments/create-order` for WeChat/Alipay.
- Web payment providers remain Web-only and are only shown when the server reports them as available.
- Membership entitlement state is shared after payment through `user_memberships`, not through client-side payment flags.

## Changed Files

- `web/server.py`
- `web/app/src/lib/types.ts`
- `web/app/src/lib/api.ts`
- `Machi/Machi/Services/KaiXAPIDTO.swift`
- `docs/WEB_IOS_SYNC_REPORT.md`

## New Files

- `docs/WEB_IOS_SYNC_REPORT.md`

## Database Migration

No database migration was added. All changes are serializer/model compatibility changes using existing tables.

## API Compatibility

All new response fields are additive. Existing snake_case fields remain unchanged. Existing Web and iOS clients should continue to decode previous fields; newer clients can use the alias fields where needed.

## Required Follow-Ups

- Build and test iOS forgot-password UI.
- Wire iOS registration/reset email code UI.
- Add persistent post share metrics if product wants post `shareCount` parity with news.
- Add automated contract tests that decode representative Web/iOS DTOs from real backend JSON.
- Add payment sandbox regression scripts for Apple IAP, Alipay, and WeChat when credentials are available.

本次修复已检查 Web 端与 iOS App 端的一致性，确保用户、帖子、资讯、会员、支付状态、互动数据、城市语言筛选和核心 API 保持同步。Web 端可以拥有 PC 布局，iOS 可以拥有原生 App 布局，但两端内容和状态必须一致。
