# Machi Design System and City Listings Contract

Date: 2026-06-04

Scope: Web, iOS, Android, shared backend `city_listings`.

## Product Boundaries

Machi has three content layers:

| Layer | Purpose | Primary Surfaces | Rules |
|---|---|---|---|
| `posts` | 同城动态、经验分享、问答、避坑、活动讨论 | 首页、个人页、话题页、搜索动态 | 不承载二手、租房、招聘、服务广告和商家优惠的结构化交易逻辑 |
| `city_listings` | 高意图城市功能信息 | 发现页入口、二手市场、房源库、职位板、服务预约、商家优惠 | 必须有独立类型、动态表单、审核/认证状态、格式化展示 |
| `guide` | 编辑部和知识库内容 | 城市指南、学校库、公司库、资料与服务 | 不混入普通 feed，也不伪装成用户动态 |

首页必须继续保持同城动态和经验分享。发现页是城市功能入口，负责把用户带到 Marketplace、租房、工作、本地服务、商家优惠、指南等独立功能。

## Machi Design Tokens

三端采用同一组视觉语义，允许平台控件原生化，但色彩、间距、圆角和信息密度必须一致。

| Token | Web CSS | iOS Swift | Android Compose | Value |
|---|---|---|---|---|
| Page background | `--kx-bg` | `KXColor.pageBackground` | `KxColors.PageTop` | Warm light surface |
| Card background | `--kx-card` | `KXColor.cardBackground` | `KxColors.Card` | White elevated card |
| Soft surface | `--kx-soft` | `KXColor.softBackground` | `KxColors.Soft` | Quiet secondary surface |
| Stroke | `--kx-stroke` | `KXColor.glassStroke` | `KxColors.GlassStroke` | Soft visible divider |
| Primary text | `--kx-text` | primary foreground | `KxColors.Text` | High contrast near black |
| Secondary text | `--kx-subtle` | secondary foreground | `KxColors.SecondaryText` | Muted content |
| Accent | `--kx-accent` | `KXColor.accent` | `KxColors.Accent` | Trust blue |
| Heat | `--kx-heat` | `KXColor.heat` | `KxColors.Heat` | Price, urgency, risk |
| Radius card | `rounded-kx-lg/card` | `KXRadius.card` | `KxRadius.card` | 20px / 20pt / 20dp |
| Spacing screen | layout padding | `KXSpacing.screen` | `KxSpacing.screen` | 16px / 16pt / 16dp |

Design intent: 高级、干净、温暖、精致、可信。不要使用低端分类信息网站的密集蓝链、裸表格、无状态工程页、未格式化字段或 raw enum。

## `city_listings` Types

| Type | Product Shape | Channel | Publish Form |
|---|---|---|---|
| `secondhand` | Marketplace | `/cities/:city/marketplace` | 商品图片、价格、状态、交易方式、新旧程度 |
| `rental` | 房源库 | `/cities/:city/rentals` | 月租、户型、面积、车站、入住、押金礼金、外国人可 |
| `job` / `hiring` | 职位板 | `/cities/:city/jobs` | 公司、雇佣形式、薪资类型、日语、签证、时间 |
| `local_service` | 服务预约平台 | `/cities/:city/services` | 服务方、服务类型、范围、可预约时间、流程、取消规则 |
| `discount` | 商家优惠 | `/cities/:city/deals` | 商家、优惠内容、有效期、使用规则、商家认证 |

## Shared Field Contract

Core fields:

`id`, `country_code`, `city_slug`, `region_code`, `language`, `type`, `category`, `title`, `description`, `price`, `currency`, `price_type`, `location_text`, `status`, `verification_status`, `seller_user_id`, `business_id`, `contact_method`, `view_count`, `inquiry_count`, `favorite_count`, `report_count`, `published_at`, `expires_at`, `created_at`, `updated_at`, `cover_url`, `media`, `attributes`, `seller`, `favorited`, `can_manage`.

Canonical enums:

| Enum | Values |
|---|---|
| `type` | `secondhand`, `rental`, `job`, `hiring`, `local_service`, `discount`, `event` |
| `status` | `draft`, `pending_review`, `published`, `reserved`, `sold`, `rented`, `closed`, `expired`, `rejected`, `hidden` |
| `verification_status` | `unverified`, `pending`, `verified`, `needs_review`, `rejected` |
| `employment_type` | `part_time`, `full_time`, `dispatch`, `contract`, `internship`, `freelance`, `temporary` |
| `salary_type` / `price_unit` | `hourly`, `daily`, `weekly`, `monthly`, `annual`, `fixed`, `negotiable` |
| `condition` | `brand_new`, `like_new`, `good`, `used`, `fair` |
| `delivery_method` | `meetup`, `pickup`, `shipping`, `negotiable` |

Raw enum keys must never be displayed directly. Use the platform formatter:

| Platform | Formatter Location |
|---|---|
| Web | `app/src/lib/listingFormat.ts` |
| iOS | `KXListingCopy` in `Machi/Views/Search/DiscoverView.swift` |
| Android | listing formatter helpers in `ui/Screens.kt` |

## Formatting Requirements

All pages that render listings must format:

- type, status, verification status, inquiry type, inquiry status
- employment type, salary type, Japanese level
- price, currency, rent, salary, service starting price, discount fallback
- area in `m²`
- station distance as walking minutes
- date and valid-until fields
- location and city labels with display names, not raw slugs
- empty backend values like `unknown`, `null`, `undefined`, `NaN`, `n/a`, `tbd`

The correct fallback is a human label such as `待补充`, `租金咨询`, `薪资面议`, `预约咨询`, or `查看优惠`, never raw backend text.

## State Requirements

Every listing surface needs:

| State | Requirement |
|---|---|
| Loading | Skeleton or activity indicator plus visible loading copy |
| Empty | Product-specific empty state and action |
| Error | Human error copy plus retry |
| Retry | Must call the same query again without requiring navigation |
| Success | No raw enum, no unsafe empty values, formatted money/time/area/location/status |

## Cross-Platform Acceptance Checklist

- 首页 feed only shows community posts and experience sharing.
- 发现页 is the city function map.
- Marketplace, rentals, jobs, services, and deals are separated from posts.
- Publish forms change by listing type.
- `job` and `hiring` are presented together as the jobs channel, while preserving backend type.
- `local_service` reads like booking and consultation, not a generic classified post.
- `discount` reads like merchant offer with validity and usage rules.
- Web, iOS, and Android consume the same backend field names and format them through platform helpers.
- No user-facing `unknown`, `null`, `undefined`, `NaN`, `part_time`, `full_time`, `pending_review`, `unverified`.
