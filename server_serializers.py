"""Pure, self-contained response serializers extracted from server.py.

Leaf dict->dict transforms with NO dependency on any other server.py module-level
function or constant — only the standard library. server.py imports them back.
"""
from __future__ import annotations

import json
from typing import Any

def serialize_guide_category(row: sqlite3.Row | dict[str, Any], children: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    d = dict(row)
    out = {
        "id": d.get("id"), "key": d.get("key"), "parentKey": d.get("parent_key") or "",
        "title": d.get("title"), "subtitle": d.get("subtitle") or "",
        "description": d.get("description") or "", "icon": d.get("icon") or "",
        "color": d.get("color") or "", "country": d.get("country") or "jp",
        "language": d.get("language") or "zh-CN",
        "seoTitle": d.get("seo_title") or "",
        "seoDescription": d.get("seo_description") or "",
        "sortOrder": int(d.get("sort_order") or 0),
        "isActive": bool(d.get("is_active", 1)),
    }
    if children is not None:
        out["subCategories"] = children
    return out


def serialize_guide_article_progress(row: sqlite3.Row | dict[str, Any] | None) -> dict[str, Any]:
    if not row:
        return {"progressPercent": 0, "completedAt": None, "lastReadAt": None}
    d = dict(row)
    return {
        "progressPercent": int(d.get("progress_percent") or 0),
        "completedAt": d.get("completed_at"),
        "lastReadAt": d.get("last_read_at"),
    }


def serialize_guide_company_position(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    d = dict(row)
    return {
        "id": d.get("id"), "companyId": d.get("company_id"), "positionTitle": d.get("position_title"),
        "positionTitleJp": d.get("position_title_jp") or "", "positionCategory": d.get("position_category") or "other",
        "employmentType": d.get("employment_type") or "", "city": d.get("city") or "",
        "remoteType": d.get("remote_type") or "", "salaryMin": int(d.get("salary_min") or 0),
        "salaryMax": int(d.get("salary_max") or 0), "currency": d.get("currency") or "JPY",
        "requiredJapaneseLevel": d.get("japanese_level_required") or "unknown",
        "requiredEnglishLevel": d.get("english_level_required") or "unknown",
        "visaSupport": d.get("visa_support") or "unknown", "description": d.get("description") or "",
        "requirements": d.get("requirements") or "", "sourceUrl": d.get("source_url") or "",
        "verificationStatus": d.get("verification_status") or "needs_review",
        "status": d.get("status") or "published", "createdAt": d.get("created_at"), "updatedAt": d.get("updated_at"),
    }


def serialize_guide_company_review(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    d = dict(row)
    anonymous = bool(d.get("anonymous"))
    return {
        "id": d.get("id"), "companyId": d.get("company_id"),
        "anonymous": anonymous, "position": d.get("position") or "",
        "employmentType": d.get("employment_type") or "", "workPeriod": d.get("work_period") or "",
        "pros": d.get("pros") or "",
        "cons": d.get("cons") or "", "overtimeLevel": d.get("overtime_level") or "",
        "foreignerSupport": d.get("foreigner_support") or "", "visaSupport": d.get("visa_support") or "",
        "salaryBenefits": d.get("salary_benefits") or "", "careerGrowth": d.get("career_growth") or "",
        "workLifeBalance": d.get("work_life_balance") or "",
        "recommendationScore": float(d.get("recommendation_score") or 0),
        "status": d.get("status") or "", "createdAt": d.get("created_at"),
    }


def serialize_guide_faq(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    d = dict(row)
    return {
        "id": d.get("id"), "question": d.get("question"), "answer": d.get("answer") or "",
        "categoryKey": d.get("category_key") or "", "country": d.get("country") or "jp",
        "language": d.get("language") or "zh-CN", "sortOrder": int(d.get("sort_order") or 0),
        "status": d.get("status") or "published", "createdAt": d.get("created_at"),
        "updatedAt": d.get("updated_at"),
    }


def serialize_guide_tag(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    d = dict(row)
    return {
        "id": d.get("id"), "name": d.get("name") or "", "key": d.get("key") or "",
        "description": d.get("description") or "", "categoryKey": d.get("category_key") or "",
        "country": d.get("country") or "jp", "language": d.get("language") or "zh-CN",
        "sortOrder": int(d.get("sort_order") or 0), "isActive": bool(d.get("is_active", 1)),
        "createdAt": d.get("created_at"), "updatedAt": d.get("updated_at"),
    }


def serialize_guide_home_module(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    d = dict(row)
    content = {}
    try:
        content = json.loads(d.get("content_json") or "{}")
    except (TypeError, json.JSONDecodeError):
        content = {}
    return {
        "id": d.get("id"), "moduleKey": d.get("module_key") or "",
        "title": d.get("title") or "", "subtitle": d.get("subtitle") or "",
        "content": content, "contentJson": d.get("content_json") or "{}",
        "country": d.get("country") or "jp", "language": d.get("language") or "zh-CN",
        "sortOrder": int(d.get("sort_order") or 0), "isActive": bool(d.get("is_active", 1)),
        "status": d.get("status") or "published", "createdAt": d.get("created_at"),
        "updatedAt": d.get("updated_at"),
    }


def serialize_guide_journey(row: sqlite3.Row | dict[str, Any], step_count: int | None = None) -> dict[str, Any]:
    d = dict(row)
    out = {
        "id": d.get("id"), "key": d.get("journey_key") or "",
        "country": d.get("country") or "jp", "language": d.get("language") or "zh-CN",
        "title": d.get("title") or "", "subtitle": d.get("subtitle") or "",
        "audience": d.get("audience") or "", "icon": d.get("icon") or "",
        "color": d.get("color") or "", "heroTitle": d.get("hero_title") or "",
        "heroSubtitle": d.get("hero_subtitle") or "",
        "estimatedDays": int(d.get("estimated_days") or 0),
        "sortOrder": int(d.get("sort_order") or 0),
        "status": d.get("status") or "published",
        "createdAt": d.get("created_at"), "updatedAt": d.get("updated_at"),
    }
    if step_count is not None:
        out["stepCount"] = int(step_count)
    return out


def serialize_guide_progress(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    d = dict(row)
    return {
        "id": d.get("id"), "journeyKey": d.get("journey_key") or "",
        "stepKey": d.get("step_key") or "", "status": d.get("status") or "in_progress",
        "completedAt": d.get("completed_at"), "reminderAt": d.get("reminder_at"),
        "plannedDate": d.get("planned_date"), "dueAt": d.get("due_at"),
        "priority": d.get("priority") or "normal",
        "notifyEnabled": bool(d.get("notify_enabled") or 0),
        "calendarNote": d.get("calendar_note") or "",
        "notes": d.get("notes") or "", "updatedAt": d.get("updated_at"),
    }


def serialize_guide_profile(row: sqlite3.Row | dict[str, Any] | None) -> dict[str, Any] | None:
    if row is None:
        return None
    d = dict(row)
    return {
        "id": d.get("id"),
        "userId": d.get("user_id") or "",
        "identityType": d.get("identity_type") or "",
        "country": d.get("country") or "jp",
        "city": d.get("city") or "",
        "isInJapan": bool(d.get("is_in_japan") or 0),
        "arrivalStage": d.get("arrival_stage") or "",
        "visaStatus": d.get("visa_status") or "",
        "visaExpiresAt": d.get("visa_expires_at"),
        "japaneseLevel": d.get("japanese_level") or "",
        "targetJapaneseLevel": d.get("target_japanese_level") or "",
        "targetLevel": d.get("target_japanese_level") or "",
        "graduationDate": d.get("graduation_date"),
        "targetEntryTerm": d.get("target_entry_term") or "",
        "targetIndustry": d.get("target_industry") or "",
        "targetSchoolType": d.get("target_school_type") or "",
        "weeklyAvailableMinutes": int(d.get("weekly_available_minutes") or 0),
        "needsMaterials": bool(d.get("needs_materials") or 0),
        "needsServices": bool(d.get("needs_services") or 0),
        "createdAt": d.get("created_at"),
        "updatedAt": d.get("updated_at"),
    }


def serialize_guide_plan(row: sqlite3.Row | dict[str, Any], summary: dict[str, Any] | None = None) -> dict[str, Any]:
    d = dict(row)
    out = {
        "id": d.get("id"),
        "userId": d.get("user_id") or "",
        "planType": d.get("plan_type") or "",
        "title": d.get("title") or "",
        "subtitle": d.get("subtitle") or "",
        "status": d.get("status") or "active",
        "targetDate": d.get("target_date"),
        "startedAt": d.get("started_at"),
        "progressPercent": int(d.get("progress_percent") or 0),
        "currentTodoId": d.get("current_todo_id") or "",
        "sourceJourneyKey": d.get("source_journey_key") or "",
        "createdAt": d.get("created_at"),
        "updatedAt": d.get("updated_at"),
    }
    if summary:
        out.update(summary)
    return out


def serialize_guide_reminder(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    d = dict(row)
    return {
        "id": d.get("id"),
        "userId": d.get("user_id") or "",
        "todoId": d.get("todo_id") or "",
        "planId": d.get("plan_id") or "",
        "title": d.get("title") or "",
        "reminderAt": d.get("reminder_at"),
        "channel": d.get("channel") or "app",
        "status": d.get("status") or "active",
        "createdAt": d.get("created_at"),
        "updatedAt": d.get("updated_at"),
    }


def serialize_guide_application_stage(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    d = dict(row)
    return {
        "id": d.get("id") or "",
        "applicationId": d.get("application_id") or "",
        "stage": d.get("stage") or "saved",
        "note": d.get("note") or "",
        "occurredAt": d.get("occurred_at"),
        "createdAt": d.get("created_at"),
    }


def serialize_guide_transaction(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    d = dict(row)
    return {
        "id": d.get("id"),
        "userId": d.get("user_id") or "",
        "kind": d.get("kind") or "expense",
        "amount": int(d.get("amount") or 0),
        "currency": d.get("currency") or "JPY",
        "category": d.get("category") or "other",
        "account": d.get("account") or "",
        "occurredOn": d.get("occurred_on"),
        "note": d.get("note") or "",
        "source": d.get("source") or "manual",
        "sourceId": d.get("source_id") or "",
        "createdAt": d.get("created_at"),
        "updatedAt": d.get("updated_at"),
    }


def serialize_guide_life_item(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    d = dict(row)
    return {
        "id": d.get("id"),
        "userId": d.get("user_id") or "",
        "type": d.get("type") or "",
        "title": d.get("title") or "",
        "provider": d.get("provider") or "",
        "amount": int(d.get("amount") or 0),
        "currency": d.get("currency") or "JPY",
        "paymentMethod": d.get("payment_method") or "",
        "autoDebit": bool(d.get("auto_debit") or 0),
        "dueDay": int(d.get("due_day") or 0),
        "dueAt": d.get("due_at"),
        "recurrence": d.get("recurrence") or "monthly",
        "reminderDaysBefore": int(d.get("reminder_days_before") or 0),
        "notes": d.get("notes") or "",
        "active": bool(d.get("active", 1)),
        "createdAt": d.get("created_at"),
        "updatedAt": d.get("updated_at"),
    }


def serialize_guide_life_payment(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    d = dict(row)
    return {
        "id": d.get("id") or "",
        "lifeItemId": d.get("life_item_id") or "",
        "amount": int(d.get("amount") or 0),
        "currency": d.get("currency") or "JPY",
        "paymentMethod": d.get("payment_method") or "",
        "autoDebit": bool(d.get("auto_debit") or 0),
        "paidAt": d.get("paid_at") or "",
        "notes": d.get("notes") or "",
        "createdAt": d.get("created_at"),
    }


def serialize_guide_contract(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    d = dict(row)
    return {
        "id": d.get("id"),
        "userId": d.get("user_id") or "",
        "category": d.get("category") or "other",
        "title": d.get("title") or "",
        "provider": d.get("provider") or "",
        "startDate": d.get("start_date"),
        "endDate": d.get("end_date"),
        "cancellationWindowStart": d.get("cancellation_window_start"),
        "cancellationWindowEnd": d.get("cancellation_window_end"),
        "autoRenew": bool(d.get("auto_renew", 0)),
        "monthlyCost": int(d.get("monthly_cost") or 0),
        "yearlyCost": int(d.get("yearly_cost") or 0),
        "currency": d.get("currency") or "JPY",
        "reminderDaysBefore": int(d.get("reminder_days_before") or 0),
        "contactInfo": d.get("contact_info") or "",
        "notes": d.get("notes") or "",
        "status": d.get("status") or "active",
        "createdAt": d.get("created_at"),
        "updatedAt": d.get("updated_at"),
    }


def serialize_guide_document(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    d = dict(row)
    return {
        "id": d.get("id"),
        "userId": d.get("user_id") or "",
        "category": d.get("category") or "other",
        "title": d.get("title") or "",
        "expiresAt": d.get("expires_at"),
        "reminderDaysBefore": int(d.get("reminder_days_before") or 0),
        "notes": d.get("notes") or "",
        "status": d.get("status") or "active",
        "createdAt": d.get("created_at"),
        "updatedAt": d.get("updated_at"),
    }


def serialize_reputation_event(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    d = dict(row)
    metadata = d.get("metadata") or "{}"
    if isinstance(metadata, str):
        try:
            metadata = json.loads(metadata or "{}")
        except Exception:
            metadata = {}
    d["metadata"] = metadata
    return d


def serialize_badge(row: sqlite3.Row | dict[str, Any], user_badge: dict[str, Any] | None = None) -> dict[str, Any]:
    d = dict(row)
    payload = {
        "id": d.get("id", ""),
        "key": d.get("key", ""),
        "name_zh": d.get("name_zh", ""),
        "name_en": d.get("name_en", ""),
        "name_ja": d.get("name_ja", ""),
        "name": d.get("name_zh", ""),
        "category": d.get("category", ""),
        "rarity": d.get("rarity", "common"),
        "description_zh": d.get("description_zh", ""),
        "is_official": bool(d.get("is_official", 0)),
        "is_active": bool(d.get("is_active", 1)),
    }
    if user_badge:
        payload.update({
            "user_badge_id": user_badge.get("id", ""),
            "is_displayed": bool(user_badge.get("is_displayed", 1)),
            "granted_at": user_badge.get("created_at"),
            "reason": user_badge.get("reason", ""),
        })
    return payload


def serialize_user(row: dict[str, Any]) -> dict[str, Any]:
    role = row.get("role", "member") or "member"
    is_verified_member = bool(row.get("is_verified_member", 0))
    is_official = role == "admin" or bool(row.get("is_official", 0))
    official_role = (row.get("official_role", "") or "").strip()
    if role == "admin" and not official_role:
        official_role = "admin"
    _auth_provider = row.get("auth_provider", "password") or "password"
    # Safe to unbind Google only when another way in survives: a password
    # account (knows its password) or any account with a verified email (can
    # reset). A Google-created account with no email must keep Google.
    _can_unlink_google = bool(row.get("google_sub", "")) and (
        _auth_provider == "password" or bool(row.get("email_verified", 0))
    )
    # Same safety rule for Apple: only unlinkable when another way in survives —
    # a password account, a verified email, or a still-linked Google identity.
    _can_unlink_apple = bool(row.get("apple_sub", "")) and (
        _auth_provider == "password" or bool(row.get("email_verified", 0)) or bool(row.get("google_sub", ""))
    )
    payload = {
        "id": row["id"],
        "remote_id": row["id"],
        "handle": row["handle"],
        "username": row["handle"],
        "display_name": row["display_name"],
        "displayName": row["display_name"],
        "email": row.get("email", ""),
        "email_verified": bool(row.get("email_verified", 0)),
        "emailVerified": bool(row.get("email_verified", 0)),
        "auth_provider": row.get("auth_provider", "password") or "password",
        "authProvider": row.get("auth_provider", "password") or "password",
        "has_google": bool(row.get("google_sub", "")),
        "hasGoogle": bool(row.get("google_sub", "")),
        "can_unlink_google": _can_unlink_google,
        "canUnlinkGoogle": _can_unlink_google,
        "has_apple": bool(row.get("apple_sub", "")),
        "hasApple": bool(row.get("apple_sub", "")),
        "can_unlink_apple": _can_unlink_apple,
        "canUnlinkApple": _can_unlink_apple,
        "bio": row.get("bio", ""),
        "location": row.get("location", ""),
        "avatar_symbol": row.get("avatar_symbol", "person.fill"),
        "avatar_color": row.get("avatar_color", "indigo"),
        "avatar_url": row.get("avatar_url", ""),
        "avatarUrl": row.get("avatar_url", ""),
        "cover_url": row.get("cover_url", ""),
        "dm_privacy": (row.get("dm_privacy") or "everyone"),
        "dmPrivacy": (row.get("dm_privacy") or "everyone"),
        "membership_tier": row.get("membership_tier", "free"),
        "is_verified": bool(row.get("is_verified", 0)),
        "role": role,
        "isOfficial": is_official,
        "is_official": is_official,
        "officialRole": official_role if is_official else "",
        "official_role": official_role if is_official else "",
        "joined_at": row.get("joined_at"),
        "created_at": row.get("created_at"),
        "createdAt": row.get("created_at"),
        "updated_at": row.get("updated_at"),
        "updatedAt": row.get("updated_at"),
        # Phase 1: home / current region. Added via MIGRATIONS so the
        # columns exist on every running install; default-empty values
        # mean a user that hasn't picked a region yet just sees blanks.
        "country":             row.get("country", "") or "",
        "province":            row.get("province", "") or "",
        "city":                row.get("city", "") or "",
        "current_region_code": row.get("current_region_code", "") or "",
        "recent_region_codes": [code for code in (row.get("recent_region_codes", "") or "").split("|") if code],
        "total_heat":          int(row.get("total_heat") or 0),
        "creator_badge":       row.get("creator_badge", "") or "",
        "custom_tags":         [tag for tag in (row.get("custom_tags", "") or "").split("|") if tag.strip()],
        "customTags":          [tag for tag in (row.get("custom_tags", "") or "").split("|") if tag.strip()],
        "is_merchant":         bool(row.get("is_merchant", 0)),
        "merchant_verified":   bool(row.get("merchant_verified", 0)),
        "profile_view_count":  int(row.get("profile_view_count") or 0),
        "app_language":        row.get("app_language", "") or "",
        "content_language_preference": row.get("content_language_preference", "") or "",
        "preferred_content_languages": row.get("preferred_content_languages", "") or "",
        # Machi Verified membership cache (authoritative truth lives in
        # user_memberships; these are kept in sync by
        # sync_user_membership_cache on every entitlement change and the
        # expiry sweep). is_verified_member drives the blue badge.
        "is_verified_member":   is_verified_member,
        "isVerifiedMember":     is_verified_member,
        "verified_member_until": row.get("verified_member_until", "") or "",
        "verifiedMemberUntil":  row.get("verified_member_until", "") or "",
        "membership_status":    row.get("membership_status", "inactive") or "inactive",
        "membershipStatus":     row.get("membership_status", "inactive") or "inactive",
        "membership_plan_key":  row.get("membership_plan_key", "") or "",
        "membershipPlanKey":    row.get("membership_plan_key", "") or "",
        "verified_badge_type":  row.get("verified_badge_type", "") or "",
        "verifiedBadgeType":    row.get("verified_badge_type", "") or "",
        "isFollowing":          bool(row.get("is_following", 0)) if "is_following" in row else False,
        "can_message":          True,
        "canMessage":           True,
    }
    # Social counts are only included when the caller actually computed them.
    # Emitting hard zeros here made every embedded author payload (feed posts,
    # comments, …) carry follower_count=0, which clients then wrote over the
    # real cached values — the "关注/粉丝数突然归零" bug. Absent keys let
    # clients keep their last known value.
    if "follower_count" in row:
        payload["follower_count"] = payload["followerCount"] = int(row.get("follower_count") or 0)
    if "following_count" in row:
        payload["following_count"] = payload["followingCount"] = int(row.get("following_count") or 0)
    if "post_count" in row:
        payload["post_count"] = payload["postCount"] = int(row.get("post_count") or 0)
    return payload


def serialize_comment(row: dict[str, Any], extras: dict[str, Any] | None = None) -> dict[str, Any]:
    extras = extras or {}
    return {
        "id": row["id"],
        "remote_id": row["id"],
        "post_id": row["post_id"],
        "author_id": row["author_id"],
        "content": row["content"],
        "parent_comment_id": row.get("parent_comment_id"),
        "reply_to_user_id": row.get("reply_to_user_id"),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "deleted_at": row.get("deleted_at"),
        "like_count": int(extras.get("like_count") or 0),
        "liked": bool(extras.get("liked")),
        "author": extras.get("author"),
        # Q&A best answer (0 on non-question posts / older rows).
        "is_accepted": bool(row.get("is_accepted") or 0),
        "isAccepted": bool(row.get("is_accepted") or 0),
    }


def serialize_message_attachment(row: dict[str, Any]) -> dict[str, Any]:
    attachment_type = row.get("attachment_type") or row.get("file_type") or "file"
    message_id = row.get("message_id") or ""
    attachment_id = row.get("id") or ""
    visibility = row.get("visibility") or "thread_members_only"
    thumbnail_url = (
        row.get("thumbnail_url")
        or row.get("thumbnailUrl")
        or row.get("thumbnail_cdn_url")
        or row.get("thumbnail_public_url")
        or row.get("thumb_url")
        or row.get("thumbUrl")
        or ""
    )
    poster_url = (
        row.get("poster_url")
        or row.get("posterUrl")
        or (thumbnail_url if attachment_type == "video" else "")
        or ""
    )
    payload = {
        "id": attachment_id,
        "message_id": message_id,
        "thread_id": row.get("thread_id") or "",
        "uploaded_file_id": row.get("uploaded_file_id") or row.get("file_id") or "",
        "type": attachment_type,
        "visibility": visibility,
        "objectKey": row.get("object_key") or "",
        "attachment_type": attachment_type,
        "url": "",
        "cdnUrl": "",
        "publicUrl": "",
        "thumb_url": thumbnail_url,
        "thumbUrl": thumbnail_url,
        "thumbnailUrl": thumbnail_url,
        "thumbnail_url": thumbnail_url,
        "posterUrl": poster_url,
        "poster_url": poster_url,
        "needsSignedUrl": True,
        "viewUrlEndpoint": f"/api/messages/{message_id}/attachments/{attachment_id}/view-url",
        "thumbnail_file_id": row.get("thumbnail_file_id") or "",
        "duration": float(row.get("duration_seconds") or row.get("duration") or 0),
        "duration_seconds": float(row.get("duration_seconds") or row.get("duration") or 0),
        "durationSeconds": float(row.get("duration_seconds") or row.get("duration") or 0),
        "width": int(row.get("width") or 0),
        "height": int(row.get("height") or 0),
        "file_name": row.get("file_name") or "",
        "file_size": int(row.get("file_size") or 0),
        "fileSize": int(row.get("file_size") or 0),
        "byte_size": int(row.get("file_size") or 0),
        "content_type": row.get("content_type") or "",
        "contentType": row.get("content_type") or "",
        "mime": row.get("content_type") or "",
        "status": row.get("status") or "ready",
        "created_at": row.get("created_at") or "",
        "createdAt": row.get("created_at") or "",
    }
    return payload


def serialize_notification(row: dict[str, Any], extras: dict[str, Any] | None = None) -> dict[str, Any]:
    extras = extras or {}
    return {
        "id": row["id"],
        "type": row["type"],
        "actor_id": row["actor_id"],
        "user_id": row["user_id"],
        "target_post_id": row.get("target_post_id"),
        "target_comment_id": row.get("target_comment_id"),
        "target_listing_id": row.get("target_listing_id"),
        "targetListingId": row.get("target_listing_id"),
        "target_conversation_id": row.get("target_conversation_id"),
        "targetConversationId": row.get("target_conversation_id"),
        "content": row.get("content", ""),
        "is_read": bool(row.get("is_read", 0)),
        "created_at": row["created_at"],
        "actor": extras.get("actor"),
    }


def serialize_message(row: dict[str, Any], extras: dict[str, Any] | None = None) -> dict[str, Any]:
    extras = extras or {}
    return {
        "id": row["id"],
        "conversation_id": row["conversation_id"],
        "sender_id": row["sender_id"],
        "content": row.get("content", ""),
        "created_at": row["created_at"],
        "is_read": bool(row.get("is_read", 0)),
        "media": extras.get("media") or [],
        "attachments": extras.get("attachments") or [],
    }


def serialize_conversation(row: dict[str, Any], extras: dict[str, Any] | None = None) -> dict[str, Any]:
    extras = extras or {}
    return {
        "id": row["id"],
        "participant_a": row["participant_a"],
        "participant_b": row["participant_b"],
        "participants": [row["participant_a"], row["participant_b"]],
        "peer": extras.get("peer"),
        "last_message": extras.get("last_message"),
        "unread_count": int(extras.get("unread_count") or 0),
        "updated_at": row["updated_at"],
    }


def serialize_booking_slot(row: dict[str, Any], *, booked_by_me: bool = False) -> dict[str, Any]:
    cap = int(row.get("capacity") or 1)
    booked = int(row.get("booked_count") or 0)
    full = booked >= cap
    return {
        "id": row["id"],
        "listing_id": row.get("listing_id", ""), "listingId": row.get("listing_id", ""),
        "start_at": row.get("start_at", ""), "startAt": row.get("start_at", ""),
        "end_at": row.get("end_at", ""), "endAt": row.get("end_at", ""),
        "capacity": cap, "booked_count": booked, "bookedCount": booked,
        "available": max(0, cap - booked), "is_full": full, "isFull": full,
        "note": row.get("note", ""), "status": row.get("status", "open"),
        "booked_by_me": bool(booked_by_me), "bookedByMe": bool(booked_by_me),
    }


def serialize_booking(row: dict[str, Any], *, slot: dict[str, Any] | None = None,
                      booker: dict[str, Any] | None = None,
                      listing_title: str | None = None, listing_type: str | None = None) -> dict[str, Any]:
    slot = slot or {}
    out = {
        "id": row["id"],
        "slot_id": row.get("slot_id", ""), "slotId": row.get("slot_id", ""),
        "listing_id": row.get("listing_id", ""), "listingId": row.get("listing_id", ""),
        "status": row.get("status", "confirmed"), "note": row.get("note", ""),
        "start_at": slot.get("start_at", ""), "startAt": slot.get("start_at", ""),
        "end_at": slot.get("end_at", ""), "endAt": slot.get("end_at", ""),
        "created_at": row.get("created_at", ""), "createdAt": row.get("created_at", ""),
    }
    if listing_title is not None:
        out["listing_title"] = out["listingTitle"] = listing_title
    if listing_type is not None:
        out["listing_type"] = out["listingType"] = listing_type
    if booker is not None:
        out["booker"] = booker
    return out


def serialize_email_campaign(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "admin_id": row.get("admin_id", ""),
        "adminId": row.get("admin_id", ""),
        "subject": row.get("subject", ""),
        "body": row.get("body", ""),
        "audience": row.get("audience", "all"),
        "status": row.get("status", "draft"),
        "recipient_count": int(row.get("recipient_count") or 0),
        "recipientCount": int(row.get("recipient_count") or 0),
        "sent_count": int(row.get("sent_count") or 0),
        "sentCount": int(row.get("sent_count") or 0),
        "failed_count": int(row.get("failed_count") or 0),
        "failedCount": int(row.get("failed_count") or 0),
        "created_at": row.get("created_at", ""),
        "createdAt": row.get("created_at", ""),
        "updated_at": row.get("updated_at", ""),
        "updatedAt": row.get("updated_at", ""),
        "started_at": row.get("started_at"),
        "startedAt": row.get("started_at"),
        "finished_at": row.get("finished_at"),
        "finishedAt": row.get("finished_at"),
    }


def serialize_listing_taxonomy_category(row: dict[str, Any]) -> dict[str, Any]:
    metadata: dict[str, Any] = {}
    try:
        parsed = json.loads(row.get("metadata") or "{}")
        if isinstance(parsed, dict):
            metadata = parsed
    except (TypeError, ValueError):
        metadata = {}
    return {
        "id": row.get("id", ""),
        "listing_type": row.get("listing_type", ""),
        "listingType": row.get("listing_type", ""),
        "category_key": row.get("category_key", ""),
        "categoryKey": row.get("category_key", ""),
        "label": row.get("label", ""),
        "label_ja": row.get("label_ja", ""),
        "labelJa": row.get("label_ja", ""),
        "label_en": row.get("label_en", ""),
        "labelEn": row.get("label_en", ""),
        "section_key": row.get("section_key", ""),
        "sectionKey": row.get("section_key", ""),
        "description": row.get("description", ""),
        "is_active": bool(row.get("is_active", 1)),
        "isActive": bool(row.get("is_active", 1)),
        "sort_order": int(row.get("sort_order") or 0),
        "sortOrder": int(row.get("sort_order") or 0),
        "metadata": metadata,
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


def serialize_listing_taxonomy_field(row: dict[str, Any]) -> dict[str, Any]:
    options: list[Any] = []
    metadata: dict[str, Any] = {}
    try:
        parsed = json.loads(row.get("options_json") or "[]")
        if isinstance(parsed, list):
            options = parsed
    except (TypeError, ValueError):
        options = []
    try:
        parsed_meta = json.loads(row.get("metadata") or "{}")
        if isinstance(parsed_meta, dict):
            metadata = parsed_meta
    except (TypeError, ValueError):
        metadata = {}
    return {
        "id": row.get("id", ""),
        "listing_type": row.get("listing_type", ""),
        "listingType": row.get("listing_type", ""),
        "category_key": row.get("category_key", ""),
        "categoryKey": row.get("category_key", ""),
        "field_key": row.get("field_key", ""),
        "fieldKey": row.get("field_key", ""),
        "label": row.get("label", ""),
        "label_ja": row.get("label_ja", ""),
        "labelJa": row.get("label_ja", ""),
        "label_en": row.get("label_en", ""),
        "labelEn": row.get("label_en", ""),
        "kind": row.get("field_kind", "text"),
        "field_kind": row.get("field_kind", "text"),
        "fieldKind": row.get("field_kind", "text"),
        "placeholder": row.get("placeholder", ""),
        "placeholder_ja": row.get("placeholder_ja", ""),
        "placeholderJa": row.get("placeholder_ja", ""),
        "placeholder_en": row.get("placeholder_en", ""),
        "placeholderEn": row.get("placeholder_en", ""),
        "help_text": row.get("help_text", ""),
        "helpText": row.get("help_text", ""),
        "options": options,
        "required": bool(row.get("required", 0)),
        "is_active": bool(row.get("is_active", 1)),
        "isActive": bool(row.get("is_active", 1)),
        "sort_order": int(row.get("sort_order") or 0),
        "sortOrder": int(row.get("sort_order") or 0),
        "metadata": metadata,
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


def serialize_listing_review(row: dict[str, Any], author: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "id": row["id"],
        "listing_id": row.get("listing_id", "") or "",
        "listingId": row.get("listing_id", "") or "",
        "business_id": row.get("business_id", "") or "",
        "businessId": row.get("business_id", "") or "",
        "user_id": row.get("user_id", "") or "",
        "userId": row.get("user_id", "") or "",
        "rating": int(row.get("rating") or 0),
        "content": row.get("content", "") or "",
        "visit_date": row.get("visit_date", "") or "",
        "visitDate": row.get("visit_date", "") or "",
        "status": row.get("status", "published") or "published",
        "owner_reply": row.get("owner_reply", "") or "",
        "ownerReply": row.get("owner_reply", "") or "",
        "owner_reply_at": row.get("owner_reply_at"),
        "ownerReplyAt": row.get("owner_reply_at"),
        "helpful_count": int(row.get("helpful_count") or 0),
        "helpfulCount": int(row.get("helpful_count") or 0),
        "created_at": row.get("created_at"),
        "createdAt": row.get("created_at"),
        "updated_at": row.get("updated_at"),
        "updatedAt": row.get("updated_at"),
        "author": author,
        # merchant-console convenience; filled by callers that join listings
        "listing_title": row.get("listing_title", "") or "",
        "listingTitle": row.get("listing_title", "") or "",
        "listing_type": row.get("listing_type", "") or "",
        "listingType": row.get("listing_type", "") or "",
    }


def serialize_wallet_ledger_entry(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    d = dict(row)
    delta = int(d.get("points_delta") or 0)
    return {
        "id": d.get("id"),
        "entryType": d.get("entry_type") or "", "entry_type": d.get("entry_type") or "",
        "pointsDelta": delta, "points_delta": delta,
        "balanceAfter": int(d.get("balance_after") or 0), "balance_after": int(d.get("balance_after") or 0),
        "sourceType": d.get("source_type") or "", "source_type": d.get("source_type") or "",
        "sourceOrderId": d.get("source_order_id") or "",
        "productId": d.get("product_id") or "",
        "createdAt": d.get("created_at"), "created_at": d.get("created_at"),
        "displayDelta": ("+" if delta >= 0 else "−") + f"{abs(delta):,}",
    }


def serialize_wallet_topup_order(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    d = dict(row)
    points = int(d.get("points") or 0)
    bonus = int(d.get("bonus_points") or 0)
    return {
        "id": d.get("id"), "orderNo": d.get("order_no"), "order_no": d.get("order_no"),
        "packKey": d.get("pack_key"), "status": d.get("status") or "pending",
        "points": points, "bonusPoints": bonus, "totalPoints": int(d.get("total_points") or (points + bonus)),
        "amountCents": int(d.get("amount_cents") or 0), "currency": d.get("currency") or "CNY",
        "paymentProvider": d.get("payment_provider") or "",
        "createdAt": d.get("created_at"), "paidAt": d.get("paid_at"),
    }
