"""Media / upload / S3 / thumbnail helpers extracted from server.py.

Pure domain module: imports only stdlib + lower server_* modules (server_config /
server_core / server_errors) + optional boto3 / Pillow (lazily, as in the
original). It never imports server.py. The private-media encryption helpers stay
in server.py (they are exercised by a test that monkeypatches the key on the
`server` module). The thumbnail background worker's DB accessor + write lock are
injected via configure(db, db_lock) at startup, mirroring server_apns.configure.
server.py re-exports every public name here for backward compatibility.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import io
import json
import logging
import queue
import re
import secrets
import sqlite3
import threading
import time
import uuid
from pathlib import Path
from typing import Any

try:
    import boto3  # type: ignore
    from botocore.exceptions import BotoCoreError, ClientError, NoCredentialsError  # type: ignore
except Exception:  # pragma: no cover - local dev can use the built-in fallback.
    boto3 = None  # type: ignore
    BotoCoreError = ClientError = NoCredentialsError = Exception  # type: ignore

from server_errors import APIError
from server_core import now_iso
from server_config import (
    AUDIO_UPLOAD_MIME, AWS_CLOUDFRONT_DOMAIN, AWS_REGION, AWS_S3_BUCKET, EXT_BY_MIME,
    IMAGE_UPLOAD_MIME, LISTING_UPLOAD_PURPOSES, MEDIA_DIR, MESSAGE_FILE_UPLOAD_MIME,
    PASSWORD_PEPPER, PDF_UPLOAD_MIME, PRODUCTION, S3_PRESIGN_EXPIRES_SECONDS,
    UPLOAD_MIME_ALIASES, UPLOAD_MIME_BY_EXTENSION, UPLOAD_PURPOSES, VIDEO_UPLOAD_MIME, _env,
)

ERR_LOG = logging.getLogger("kaix.error")  # same singleton logger object as server.py

# DB accessors injected by server.py at startup (mirrors server_apns.configure);
# only the thumbnail worker opens its own connection.
_db = None
_db_lock = None


def configure(db_factory, db_lock) -> None:
    """Inject the database accessor + write lock used by the thumbnail worker."""
    global _db, _db_lock
    _db, _db_lock = db_factory, db_lock


def _sniff_mime(data: bytes) -> str | None:
    """Inspect file magic bytes and return the mime if it matches one of
    the allowed types. Returns None if the content can't be matched.
    This is the only authoritative check — Content-Type from the client
    is a hint, not a fact."""
    if len(data) < 12:
        return None
    head = data[:16]
    # Images
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if head[:4] == b"GIF8" and head[4:6] in (b"7a", b"9a"):
        return "image/gif"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    if head[:4] == b"RIFF" and head[8:12] == b"WAVE":
        return "audio/wav"
    if head.startswith(b"ID3") or (head[0] == 0xFF and (head[1] & 0xE0) == 0xE0):
        return "audio/mpeg"
    # HEIC/HEIF — ISO BMFF with ftyp box at offset 4.
    if head[4:8] == b"ftyp" and head[8:12] in (b"heic", b"heix", b"mif1", b"msf1", b"heim", b"heis", b"hevc", b"hevx"):
        return "image/heic"
    # Videos
    if head[4:8] == b"ftyp":
        brand = head[8:12]
        if brand in (b"isom", b"iso2", b"mp41", b"mp42", b"avc1", b"dash", b"M4V ", b"M4A ", b"MSNV", b"3gp4", b"3gp5"):
            return "video/mp4"
        if brand == b"qt  ":
            return "video/quicktime"
    if head.startswith(b"\x1aE\xdf\xa3"):  # EBML, used by WebM/Matroska
        return "video/webm"
    if data.startswith(b"%PDF-"):
        return "application/pdf"
    if data.startswith(b"PK\x03\x04") or data.startswith(b"PK\x05\x06") or data.startswith(b"PK\x07\x08"):
        if b"word/" in data[:8192]:
            return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        if b"xl/" in data[:8192]:
            return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        return "application/zip"
    if data.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
        return declared_office_mime(data)
    sample = data[:4096]
    if b"\x00" not in sample:
        try:
            sample.decode("utf-8")
            if b"," in sample and b"\n" in sample:
                return "text/csv"
            return "text/plain"
        except UnicodeDecodeError:
            return None
    return None


def declared_office_mime(_data: bytes) -> str:
    return "application/msword"


def upload_mime_matches(sniffed: str | None, expected: str) -> bool:
    if sniffed == expected:
        return True
    compatible = {
        ("image/heic", "image/heif"),
        ("video/mp4", "audio/mp4"),
        ("video/webm", "audio/webm"),
    }
    return (sniffed or "", expected) in compatible


def validate_upload_magic(data: bytes, expected: str) -> str:
    sniffed = _sniff_mime(data)
    if not upload_mime_matches(sniffed, expected):
        raise APIError("文件类型与签名不一致", 415, "mime_mismatch")
    return sniffed or expected


_S3_CLIENT: Any | None = None
_S3_CREDENTIALS_CHECKED = False
_S3_CREDENTIALS_AVAILABLE = False
PRIVATE_MEDIA_CIPHER = "AES-256-GCM"
PRIVATE_MEDIA_CIPHER_VERSION = 1
PRIVATE_MEDIA_CHUNK_SIZE = 1024 * 1024


def _s3_client() -> Any:
    global _S3_CLIENT
    if boto3 is None:
        raise APIError("boto3 未安装，无法使用 S3", 500, "s3_sdk_missing")
    if _S3_CLIENT is None:
        # Intentionally pass only region. boto3 will use the AWS SDK default
        # credential chain: env/profile in dev, and EC2 Instance Profile/IAM
        # Role temporary credentials in production. Never pass access keys here.
        _S3_CLIENT = boto3.client("s3", region_name=AWS_REGION)
    return _S3_CLIENT


def s3_configured() -> bool:
    return bool(AWS_REGION and AWS_S3_BUCKET and boto3 is not None)


def s3_credentials_available() -> bool:
    global _S3_CREDENTIALS_CHECKED, _S3_CREDENTIALS_AVAILABLE
    if not s3_configured():
        return False
    if _S3_CREDENTIALS_CHECKED:
        return _S3_CREDENTIALS_AVAILABLE
    _S3_CREDENTIALS_CHECKED = True
    try:
        session = boto3.Session(region_name=AWS_REGION)  # type: ignore[union-attr]
        _S3_CREDENTIALS_AVAILABLE = session.get_credentials() is not None
    except Exception:
        _S3_CREDENTIALS_AVAILABLE = False
    return _S3_CREDENTIALS_AVAILABLE


def s3_ready_for_upload() -> bool:
    return s3_configured() and (PRODUCTION or s3_credentials_available())


def _s3_presigned_url(method: str, object_key: str, *, content_type: str = "", expires: int | None = None) -> str:
    if not s3_ready_for_upload():
        raise APIError("S3 is not configured", 500, "s3_not_configured")
    expires = int(expires or S3_PRESIGN_EXPIRES_SECONDS)
    method = method.upper()
    try:
        if method == "PUT":
            params: dict[str, Any] = {"Bucket": AWS_S3_BUCKET, "Key": object_key}
            if content_type:
                params["ContentType"] = content_type
            return _s3_client().generate_presigned_url("put_object", Params=params, ExpiresIn=expires)
        if method == "GET":
            return _s3_client().generate_presigned_url(
                "get_object",
                Params={"Bucket": AWS_S3_BUCKET, "Key": object_key},
                ExpiresIn=expires,
            )
    except NoCredentialsError:
        raise APIError("EC2 IAM Role/S3 凭证不可用", 500, "s3_credentials_missing")
    except (BotoCoreError, ClientError):
        raise APIError("S3 Presigned URL 生成失败", 502, "s3_presign_failed")
    raise APIError("不支持的 S3 签名方法", 500, "unsupported_s3_presign_method")


def _s3_head_object(object_key: str) -> dict[str, Any]:
    if not s3_ready_for_upload():
        raise APIError("S3 is not configured", 500, "s3_not_configured")
    try:
        return dict(_s3_client().head_object(Bucket=AWS_S3_BUCKET, Key=object_key))
    except ClientError as exc:
        code = str((getattr(exc, "response", {}) or {}).get("Error", {}).get("Code") or "")
        if code in {"404", "NoSuchKey", "NotFound"}:
            raise APIError("S3 文件尚未上传完成", 400, "s3_object_not_found")
        raise APIError("S3 HeadObject 失败", 502, "s3_head_failed")
    except (BotoCoreError, NoCredentialsError):
        raise APIError("S3 HeadObject 失败", 502, "s3_head_failed")


def _s3_read_prefix(object_key: str, length: int = 64 * 1024) -> bytes:
    if not s3_ready_for_upload():
        raise APIError("S3 is not configured", 500, "s3_not_configured")
    try:
        response = _s3_client().get_object(
            Bucket=AWS_S3_BUCKET,
            Key=object_key,
            Range=f"bytes=0-{max(0, length - 1)}",
        )
        body = response["Body"]
        try:
            return body.read(length)
        finally:
            body.close()
    except ClientError as exc:
        code = str((getattr(exc, "response", {}) or {}).get("Error", {}).get("Code") or "")
        if code in {"404", "NoSuchKey", "NotFound"}:
            raise APIError("S3 文件尚未上传完成", 400, "s3_object_not_found") from exc
        raise APIError("S3 文件类型校验失败", 502, "s3_read_failed") from exc
    except (BotoCoreError, NoCredentialsError) as exc:
        raise APIError("S3 文件类型校验失败", 502, "s3_read_failed") from exc


def _s3_delete_object(object_key: str) -> bool:
    if not s3_ready_for_upload():
        return False
    try:
        _s3_client().delete_object(Bucket=AWS_S3_BUCKET, Key=object_key)
        return True
    except Exception:
        return False


def _local_upload_token(upload_id: str, user_id: str, object_key: str) -> str:
    message = f"{upload_id}:{user_id}:{object_key}"
    return hmac.new(PASSWORD_PEPPER, message.encode("utf-8"), hashlib.sha256).hexdigest()


def _signed_local_download_token(file_id: str, expires_at: int) -> str:
    message = f"{file_id}:{expires_at}"
    sig = hmac.new(PASSWORD_PEPPER, message.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{expires_at}.{sig}"


def _verify_local_download_token(file_id: str, token: str) -> bool:
    try:
        raw_exp, raw_sig = token.split(".", 1)
        expires_at = int(raw_exp)
    except Exception:
        return False
    if expires_at < int(time.time()):
        return False
    expected = _signed_local_download_token(file_id, expires_at).split(".", 1)[1]
    return hmac.compare_digest(raw_sig, expected)


def _cdn_domain() -> str:
    raw = AWS_CLOUDFRONT_DOMAIN.strip()
    if not raw:
        return ""
    if raw.startswith("http://") or raw.startswith("https://"):
        return raw.rstrip("/")
    return f"https://{raw.strip('/')}"


def upload_file_type(content_type: str) -> str:
    if content_type.startswith("image/"):
        return "image"
    if content_type == "application/pdf":
        return "pdf"
    if content_type.startswith("video/"):
        return "video"
    if content_type.startswith("audio/"):
        return "audio"
    if content_type in {
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/plain",
        "text/csv",
    }:
        return "document"
    return "other"


def upload_is_private(purpose: str) -> bool:
    return bool(UPLOAD_PURPOSES.get(purpose, {}).get("private"))


def upload_public_url(object_key: str, purpose: str = "") -> str:
    if purpose and upload_is_private(purpose):
        return ""
    cdn = _cdn_domain()
    if cdn:
        return f"{cdn}/{object_key}"
    return f"/media/{object_key}"


def upload_thumbnail_url(object_key: str, content_type: str, purpose: str = "") -> str:
    # The async thumbnail worker swaps this fallback for a generated WebP.
    # Keeping the original URL here prevents broken cards while processing.
    return upload_public_url(object_key, purpose) if content_type.startswith("image/") and not upload_is_private(purpose) else ""


def _upload_metadata(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return dict(raw)
    try:
        parsed = json.loads(raw or "{}")
    except (TypeError, json.JSONDecodeError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _media_visibility(purpose: str = "", fallback: str = "public") -> str:
    if purpose and upload_is_private(purpose):
        return "private"
    return fallback or "public"


def _media_type_from(content_type: str, stored_type: str = "", file_type: str = "") -> str:
    content_type = (content_type or "").lower()
    if content_type.startswith("image/"):
        return "image"
    if content_type.startswith("video/"):
        return "video"
    if content_type.startswith("audio/"):
        return "audio"
    raw = (file_type or stored_type or "file").lower()
    if raw in {"pdf", "document", "other"}:
        return "file"
    return raw if raw in {"image", "video", "audio", "file"} else "file"


def normalize_media_dto(row: sqlite3.Row | dict[str, Any], *, fallback_id: str = "") -> dict[str, Any]:
    """Return the cross-client MediaDTO while preserving legacy aliases."""
    d = dict(row)
    metadata = _upload_metadata(d.get("metadata"))
    metadata.pop("upload_token", None)
    purpose = d.get("purpose") or ""
    visibility = d.get("visibility") or _media_visibility(purpose)
    is_private = visibility != "public" or bool(d.get("isPrivate")) or upload_is_private(purpose)
    object_key = d.get("object_key") or d.get("objectKey") or ""
    content_type = d.get("content_type") or d.get("contentType") or d.get("mime") or ""
    media_type = _media_type_from(content_type, d.get("type") or d.get("media_type") or "", d.get("file_type") or d.get("fileType") or "")
    stored_url = d.get("cdn_url") or d.get("cdnUrl") or d.get("public_url") or d.get("publicUrl") or d.get("url") or ""
    if object_key and not stored_url and not is_private:
        stored_url = upload_public_url(object_key, purpose)
    if is_private:
        visibility = "private"
    public_url = "" if is_private else stored_url
    variants = metadata.get("variants") if isinstance(metadata.get("variants"), dict) else {}
    original_url = "" if is_private else (variants.get("original") or variants.get("source") or public_url)
    large_url = "" if is_private else (variants.get("large") or original_url)
    medium_url = "" if is_private else (variants.get("medium") or large_url or original_url)
    raw_thumb = (
        metadata.get("poster_url")
        or metadata.get("posterUrl")
        or metadata.get("thumbnail_url")
        or metadata.get("thumbnailUrl")
        or d.get("poster_url")
        or d.get("posterUrl")
        or d.get("thumbnail_url")
        or d.get("thumbnailUrl")
        or d.get("thumb_url")
        or d.get("thumbUrl")
        or ""
    )
    if raw_thumb == public_url and media_type == "video":
        raw_thumb = ""
    thumbnail_url = "" if is_private else (raw_thumb or (public_url if media_type == "image" else ""))
    poster_url = "" if is_private else (
        metadata.get("poster_url")
        or metadata.get("posterUrl")
        or thumbnail_url
        or ""
    )
    if poster_url == public_url and media_type == "video":
        poster_url = ""
    duration = float(d.get("duration_seconds") or d.get("durationSeconds") or d.get("duration") or metadata.get("duration_seconds") or metadata.get("durationSeconds") or 0)
    file_size = int(d.get("file_size") or d.get("fileSize") or d.get("byte_size") or d.get("byteSize") or 0)
    owner_id = d.get("owner_id") or d.get("ownerId") or d.get("user_id") or d.get("userId") or ""
    payload = {
        "id": d.get("id") or fallback_id,
        "remote_id": d.get("remote_id") or d.get("id") or fallback_id,
        "remoteId": d.get("remote_id") or d.get("id") or fallback_id,
        "owner_id": owner_id,
        "ownerId": owner_id,
        "type": media_type,
        "visibility": visibility,
        "objectKey": object_key,
        "url": public_url,
        "cdnUrl": public_url,
        "publicUrl": public_url,
        "originalUrl": original_url,
        "original_url": original_url,
        "largeUrl": large_url,
        "large_url": large_url,
        "mediumUrl": medium_url,
        "medium_url": medium_url,
        "needsSignedUrl": is_private,
        "needs_signed_url": is_private,
        "thumbnailUrl": thumbnail_url,
        "thumbnail_url": thumbnail_url,
        "thumb_url": thumbnail_url,
        "thumbUrl": thumbnail_url,
        "posterUrl": poster_url,
        "poster_url": poster_url,
        "contentType": content_type,
        "content_type": content_type,
        "mime": content_type,
        "width": int(d.get("width") or 0),
        "height": int(d.get("height") or 0),
        "durationSeconds": duration,
        "duration_seconds": duration,
        "duration": duration,
        "fileSize": file_size,
        "file_size": file_size,
        "byte_size": file_size,
        "status": d.get("status") or d.get("processing_status") or d.get("processingStatus") or "ready",
        "processing_status": d.get("processing_status") or d.get("processingStatus") or d.get("status") or "ready",
        "created_at": d.get("created_at") or d.get("createdAt") or "",
        "createdAt": d.get("created_at") or d.get("createdAt") or "",
    }
    if is_private:
        payload["needsSignedUrl"] = True
    return payload


def media_card_image_url(media: dict[str, Any]) -> str:
    if (media.get("type") or media.get("media_type")) == "video":
        return media.get("posterUrl") or media.get("thumbnailUrl") or media.get("thumbnail_url") or ""
    return media.get("thumbnailUrl") or media.get("thumbnail_url") or media.get("cdnUrl") or media.get("url") or ""


def listing_media_thumbnail_url(media: dict[str, Any]) -> str:
    media_type = media.get("type") or media.get("media_type") or ""
    url = media.get("url") or media.get("cdnUrl") or ""
    thumb = media.get("thumbnailUrl") or media.get("thumb_url") or media.get("posterUrl") or ""
    if media_type == "video":
        return "" if thumb == url else thumb
    return thumb or url


def upload_allowed_mimes(purpose: str) -> set[str]:
    kind = UPLOAD_PURPOSES.get(purpose, {}).get("kind")
    if kind == "image":
        return IMAGE_UPLOAD_MIME
    if kind == "pdf":
        return PDF_UPLOAD_MIME
    if kind == "video":
        return VIDEO_UPLOAD_MIME
    if kind == "audio":
        return AUDIO_UPLOAD_MIME
    if kind == "message_file":
        return MESSAGE_FILE_UPLOAD_MIME
    if kind == "verification_file":
        return IMAGE_UPLOAD_MIME | PDF_UPLOAD_MIME
    return set()


def infer_upload_mime_from_filename(file_name: str) -> str:
    suffix = Path(str(file_name or "").split("?", 1)[0]).suffix.lower().lstrip(".")
    return UPLOAD_MIME_BY_EXTENSION.get(suffix, "")


def canonical_upload_mime(purpose: str, content_type: str, file_name: str = "") -> str:
    content_type = (content_type or "").split(";", 1)[0].strip().lower()
    content_type = UPLOAD_MIME_ALIASES.get(content_type, content_type)
    if not content_type or content_type == "application/octet-stream":
        content_type = infer_upload_mime_from_filename(file_name)
    allowed = upload_allowed_mimes(purpose)
    if content_type not in allowed:
        raise APIError("不支持的文件类型", 415, "unsupported_upload_type")
    return content_type


def normalize_upload_purpose(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if raw not in UPLOAD_PURPOSES:
        raise APIError("上传用途不合法", 400, "invalid_upload_purpose")
    if UPLOAD_PURPOSES[raw].get("kind") == "disabled" or UPLOAD_PURPOSES[raw].get("disabled"):
        raise APIError("该上传通道暂未开放", 403, "upload_disabled")
    return raw


def normalize_upload_entity_type(value: Any) -> str:
    raw = str(value or "").strip().lower()
    aliases = {
        "city_listing": "listing",
        "city_listings": "listing",
        "product": "guide_product",
        "article": "guide_article",
        "guide_todo": "guide_task",
        "guide_plan": "guide_goal",
    }
    raw = aliases.get(raw, raw)
    allowed = {
        "", "user", "post", "listing", "article", "experience", "question", "group", "message",
        "guide_article", "guide_product", "member_resource", "business", "video",
        "guide_task", "guide_application", "guide_life_item", "guide_contract", "guide_document",
        "guide_goal", "guide_calendar_event",
    }
    return raw if raw in allowed else ""


def upload_object_key(user_id: str, purpose: str, entity_type: str, entity_id: str, content_type: str, *, thread_id: str = "", group_id: str = "") -> str:
    ext = EXT_BY_MIME.get(content_type)
    if not ext:
        raise APIError("不支持的文件类型", 415, "unsupported_upload_type")
    name = f"{uuid.uuid4().hex}{ext}"
    clean_entity_id = re.sub(r"[^A-Za-z0-9_.-]", "", entity_id or "")[:120]
    if purpose == "avatar":
        return f"users/{user_id}/avatars/{name}"
    if purpose == "profile_cover":
        return f"users/{user_id}/covers/{name}"
    if purpose == "post_image" and entity_type == "post" and clean_entity_id:
        return f"posts/{clean_entity_id}/images/{name}"
    if purpose == "post_video" and entity_type == "post" and clean_entity_id:
        return f"posts/{clean_entity_id}/videos/{name}"
    if purpose == "article_image" and entity_type == "article" and clean_entity_id:
        return f"articles/{clean_entity_id}/images/{name}"
    if purpose == "article_video" and entity_type == "article" and clean_entity_id:
        return f"articles/{clean_entity_id}/videos/{name}"
    if purpose == "experience_image" and entity_type == "experience" and clean_entity_id:
        return f"experiences/{clean_entity_id}/images/{name}"
    if purpose == "experience_video" and entity_type == "experience" and clean_entity_id:
        return f"experiences/{clean_entity_id}/videos/{name}"
    if purpose == "question_image" and entity_type == "question" and clean_entity_id:
        return f"questions/{clean_entity_id}/images/{name}"
    if purpose == "group_post_image" and entity_type == "group":
        clean_group = re.sub(r"[^A-Za-z0-9_.-]", "", group_id or "")[:120] or "general"
        post_ref = clean_entity_id or "pending"
        return f"groups/{clean_group}/posts/{post_ref}/images/{name}"
    if purpose == "group_post_video" and entity_type == "group":
        clean_group = re.sub(r"[^A-Za-z0-9_.-]", "", group_id or "")[:120] or "general"
        post_ref = clean_entity_id or "pending"
        return f"groups/{clean_group}/posts/{post_ref}/videos/{name}"
    if purpose in {"message_image", "message_video", "message_file"}:
        clean_thread = re.sub(r"[^A-Za-z0-9_.-]", "", thread_id or "")[:120] or "thread"
        message_ref = clean_entity_id or "pending"
        folder = "images" if purpose == "message_image" else ("videos" if purpose == "message_video" else "files")
        return f"messages/{clean_thread}/{folder}/{message_ref}/{name}"
    if purpose == "video_thumbnail":
        return f"videos/thumbnails/{uuid.uuid4().hex}.jpg"
    if purpose == "video_processed_file":
        return f"videos/processed/{uuid.uuid4().hex}/original{ext}"
    if purpose in LISTING_UPLOAD_PURPOSES and entity_type == "listing" and clean_entity_id:
        listing_segment = {
            "secondhand_image": "secondhand",
            "secondhand_video": "secondhand",
            "rental_image": "rentals",
            "rental_video": "rentals",
            "job_image": "jobs",
            "job_video": "jobs",
            "service_image": "services",
            "service_video": "services",
            "discount_image": "discounts",
            "discount_video": "discounts",
        }.get(purpose, "images")
        folder = "videos" if purpose.endswith("_video") else "images"
        return f"listings/{listing_segment}/{clean_entity_id}/{folder}/{name}"
    if purpose == "guide_article_image" and entity_type == "guide_article" and clean_entity_id:
        return f"guide/articles/{clean_entity_id}/images/{name}"
    if purpose == "guide_product_preview" and entity_type == "guide_product" and clean_entity_id:
        return f"guide/products/{clean_entity_id}/previews/{name}"
    if purpose == "guide_product_file" and entity_type == "guide_product" and clean_entity_id:
        return f"guide/products/{clean_entity_id}/files/{uuid.uuid4().hex}.pdf"
    if purpose == "member_resource_file":
        resource_id = clean_entity_id or "general"
        return f"member/resources/{resource_id}/files/{uuid.uuid4().hex}.pdf"
    if purpose == "guide_attachment" and entity_type.startswith("guide_") and clean_entity_id:
        folder = re.sub(r"[^a-z0-9_-]", "", entity_type.replace("guide_", "")) or "item"
        return f"guide/user-attachments/{user_id}/{folder}/{clean_entity_id}/{name}"
    if purpose == "business_logo" and entity_type == "business" and clean_entity_id:
        return f"businesses/{clean_entity_id}/logos/{name}"
    if purpose == "business_cover" and entity_type == "business" and clean_entity_id:
        return f"businesses/{clean_entity_id}/covers/{name}"
    if purpose == "business_verification_file" and entity_type == "business" and clean_entity_id:
        return f"businesses/{clean_entity_id}/verification/{name}"
    return f"temp/{user_id}/{name}"


def local_upload_path(object_key: str) -> Path:
    target = (MEDIA_DIR / object_key).resolve()
    try:
        target.relative_to(MEDIA_DIR.resolve())
    except ValueError:
        raise APIError("invalid path", 400, "invalid_upload_key")
    return target


def serialize_uploaded_file(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    d = dict(row)
    purpose = d.get("purpose") or ""
    is_private = upload_is_private(purpose)
    public_url = "" if is_private else (d.get("cdn_url") or d.get("public_url") or upload_public_url(d.get("object_key") or "", purpose))
    metadata = _upload_metadata(d.get("metadata"))
    metadata.pop("upload_token", None)
    file_name = str(
        metadata.get("fileName")
        or metadata.get("file_name")
        or metadata.get("originalFileName")
        or metadata.get("original_file_name")
        or Path(d.get("object_key") or "").name
    )
    media = normalize_media_dto(d)
    thumb = media.get("thumbnailUrl") or ""
    payload = {
        "id": d.get("id"),
        "uploadId": d.get("upload_id") or "",
        "userId": d.get("user_id") or "",
        "bucket": d.get("bucket") or "",
        "objectKey": d.get("object_key") or "",
        "url": public_url,
        "publicUrl": "" if is_private else (d.get("public_url") or public_url),
        "cdnUrl": "" if is_private else (d.get("cdn_url") or public_url),
        "thumbnailUrl": "" if is_private else thumb,
        "contentType": d.get("content_type") or "",
        "fileSize": int(d.get("file_size") or 0),
        "fileName": file_name,
        "originalFileName": file_name,
        "fileType": d.get("file_type") or "other",
        "purpose": d.get("purpose") or "",
        "entityType": d.get("entity_type") or "",
        "entityId": d.get("entity_id") or "",
        "status": d.get("status") or "pending",
        "isPrivate": is_private,
        "width": int(d.get("width") or 0),
        "height": int(d.get("height") or 0),
        "duration": float(d.get("duration") or 0),
        "etag": d.get("etag") or "",
        "metadata": metadata,
        "createdAt": d.get("created_at"),
        "updatedAt": d.get("updated_at"),
        "deletedAt": d.get("deleted_at"),
    }
    payload.update({
        "type": media["type"],
        "visibility": media["visibility"],
        "posterUrl": media["posterUrl"],
        "durationSeconds": media["durationSeconds"],
    })
    return payload


def uploaded_file_as_media(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    f = serialize_uploaded_file(row)
    media_type = "image" if f["fileType"] == "image" else "file" if f["fileType"] in {"pdf", "document", "other"} else f["fileType"]
    media = normalize_media_dto({**dict(row), "type": media_type})
    media.update({
        "id": f["id"],
        "remote_id": f["id"],
        "remoteId": f["id"],
        "owner_id": f["userId"],
        "ownerId": f["userId"],
        "type": media_type,
        "url": f["cdnUrl"],
        "cdnUrl": f["cdnUrl"],
        "publicUrl": f["cdnUrl"],
        "thumbnailUrl": f["thumbnailUrl"],
        "thumbnail_url": f["thumbnailUrl"],
        "thumb_url": f["thumbnailUrl"],
        "thumbUrl": f["thumbnailUrl"],
        "posterUrl": f["posterUrl"],
        "poster_url": f["posterUrl"],
        "mime": f["contentType"],
        "contentType": f["contentType"],
        "content_type": f["contentType"],
        "width": f["width"],
        "height": f["height"],
        "duration": f["duration"],
        "durationSeconds": f["durationSeconds"],
        "duration_seconds": f["durationSeconds"],
        "byte_size": f["fileSize"],
        "fileSize": f["fileSize"],
        "file_size": f["fileSize"],
        "visibility": f["visibility"],
        "objectKey": f["objectKey"],
        "status": f["status"],
        "created_at": f["createdAt"],
        "createdAt": f["createdAt"],
    })
    return media


# ---------------------------------------------------------------------------
# Public image thumbnails
#
# Upload completion stays fast: it only enqueues a file id. A bounded daemon
# worker downloads the original, applies EXIF orientation, generates a compact
# WebP, stores it alongside public media, then updates all current card/media
# references. Original media remains the fallback if processing ever fails.
# ---------------------------------------------------------------------------

_THUMBNAIL_QUEUE: "queue.Queue[tuple[str, int]]" = queue.Queue(maxsize=1000)
_THUMBNAIL_WORKER_STARTED = False
THUMBNAIL_MAX_EDGE = max(320, min(int(_env("KAIX_THUMBNAIL_MAX_EDGE", "720") or 720), 1600))


def thumbnail_eligible(row: sqlite3.Row | dict[str, Any]) -> bool:
    d = dict(row)
    return (
        str(d.get("content_type") or "").startswith("image/")
        and not upload_is_private(str(d.get("purpose") or ""))
        and str(d.get("status") or "") in {"uploaded", "processing", "ready"}
        and bool(d.get("object_key"))
    )


def _build_image_thumbnail(raw: bytes, max_edge: int = THUMBNAIL_MAX_EDGE) -> tuple[bytes, int, int]:
    try:
        from PIL import Image, ImageOps, UnidentifiedImageError
    except ImportError as exc:
        raise RuntimeError("Pillow is required for thumbnail generation") from exc
    Image.MAX_IMAGE_PIXELS = 50_000_000
    try:
        with Image.open(io.BytesIO(raw)) as source:
            source.seek(0)
            image = ImageOps.exif_transpose(source)
            image.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
            if image.mode not in {"RGB", "RGBA"}:
                image = image.convert("RGBA" if "transparency" in image.info else "RGB")
            output = io.BytesIO()
            image.save(output, format="WEBP", quality=78, method=4)
            return output.getvalue(), image.width, image.height
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise RuntimeError("unsupported or corrupt image") from exc


def _thumbnail_object_key(file_id: str) -> str:
    clean = re.sub(r"[^A-Za-z0-9_.-]", "", file_id)[:160]
    return f"thumbnails/{clean}.webp"


def _update_thumbnail_status(file_id: str, *, status: str, error: str = "") -> None:
    with _db_lock:
        conn = _db()
        try:
            row = conn.execute(
                "SELECT metadata FROM uploaded_files WHERE id = ? AND deleted_at IS NULL",
                (file_id,),
            ).fetchone()
            if not row:
                return
            try:
                metadata = json.loads(row["metadata"] or "{}")
            except (TypeError, json.JSONDecodeError):
                metadata = {}
            metadata["thumbnail_status"] = status
            if error:
                metadata["thumbnail_error"] = error[:200]
            else:
                metadata.pop("thumbnail_error", None)
            conn.execute(
                "UPDATE uploaded_files SET metadata = ?, updated_at = ? WHERE id = ?",
                (json.dumps(metadata, ensure_ascii=False, sort_keys=True), now_iso(), file_id),
            )
        finally:
            conn.close()


def _process_thumbnail(file_id: str) -> None:
    conn = _db()
    try:
        row = conn.execute(
            "SELECT * FROM uploaded_files WHERE id = ? AND deleted_at IS NULL",
            (file_id,),
        ).fetchone()
        if not row or not thumbnail_eligible(row):
            return
        d = dict(row)
        try:
            metadata = json.loads(d.get("metadata") or "{}")
        except (TypeError, json.JSONDecodeError):
            metadata = {}
        if metadata.get("thumbnail_status") == "ready" and metadata.get("thumbnail_url"):
            return
    finally:
        conn.close()

    if d.get("bucket") == "local-dev":
        raw = local_upload_path(d["object_key"]).read_bytes()
    else:
        response = _s3_client().get_object(Bucket=AWS_S3_BUCKET, Key=d["object_key"])
        body = response["Body"]
        try:
            raw = body.read()
        finally:
            body.close()
    thumb, width, height = _build_image_thumbnail(raw)
    object_key = _thumbnail_object_key(file_id)
    if d.get("bucket") == "local-dev":
        target = local_upload_path(object_key)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(thumb)
    else:
        _s3_client().put_object(
            Bucket=AWS_S3_BUCKET,
            Key=object_key,
            Body=thumb,
            ContentType="image/webp",
            CacheControl="public, max-age=31536000, immutable",
            Metadata={"machi-thumbnail": "1", "source-file-id": file_id},
        )
    url = upload_public_url(object_key)
    with _db_lock:
        conn = _db()
        try:
            current = conn.execute(
                "SELECT metadata FROM uploaded_files WHERE id = ? AND deleted_at IS NULL",
                (file_id,),
            ).fetchone()
            if not current:
                return
            try:
                metadata = json.loads(current["metadata"] or "{}")
            except (TypeError, json.JSONDecodeError):
                metadata = {}
            metadata.update({
                "thumbnail_status": "ready",
                "thumbnail_url": url,
                "thumbnail_width": width,
                "thumbnail_height": height,
                "thumbnail_generated_at": now_iso(),
            })
            variants = metadata.get("variants") if isinstance(metadata.get("variants"), dict) else {}
            variants["thumbnail"] = url
            metadata["variants"] = variants
            conn.execute(
                "UPDATE uploaded_files SET metadata = ?, updated_at = ? WHERE id = ?",
                (json.dumps(metadata, ensure_ascii=False, sort_keys=True), now_iso(), file_id),
            )
            conn.execute("UPDATE media SET thumb_url = ? WHERE id = ?", (url, file_id))
            conn.execute(
                "UPDATE listing_media SET thumbnail_url = ? WHERE uploaded_file_id = ? OR id = ?",
                (url, file_id, file_id),
            )
            record_upload_audit(
                conn,
                d.get("user_id") or "",
                "thumbnail_ready",
                file_id=file_id,
                status="ready",
                metadata={"objectKey": object_key, "bytes": len(thumb), "width": width, "height": height},
            )
        finally:
            conn.close()


def _thumbnail_worker_loop() -> None:
    while True:
        file_id, attempt = _THUMBNAIL_QUEUE.get()
        try:
            _process_thumbnail(file_id)
        except Exception as exc:
            if attempt < 2:
                time.sleep(0.5 * (attempt + 1))
                try:
                    _THUMBNAIL_QUEUE.put_nowait((file_id, attempt + 1))
                except queue.Full:
                    _update_thumbnail_status(file_id, status="failed", error="thumbnail queue full")
            else:
                ERR_LOG.warning("thumbnail generation failed file_id=%s error=%s", file_id, exc)
                _update_thumbnail_status(file_id, status="failed", error=str(exc))
        finally:
            _THUMBNAIL_QUEUE.task_done()


def start_thumbnail_worker() -> None:
    global _THUMBNAIL_WORKER_STARTED
    if _THUMBNAIL_WORKER_STARTED:
        return
    _THUMBNAIL_WORKER_STARTED = True
    threading.Thread(target=_thumbnail_worker_loop, name="thumbnail-worker", daemon=True).start()


def enqueue_thumbnail(file_id: str) -> bool:
    try:
        _THUMBNAIL_QUEUE.put_nowait((file_id, 0))
        return True
    except queue.Full:
        ERR_LOG.warning("thumbnail queue full file_id=%s", file_id)
        return False


def record_upload_audit(conn: sqlite3.Connection, user_id: str, action: str, *,
                        file_id: str = "", upload_id: str = "", status: str = "",
                        reason: str = "", metadata: dict[str, Any] | None = None) -> None:
    conn.execute(
        """
        INSERT INTO upload_audit_logs (id, user_id, uploaded_file_id, upload_id, action, status, reason, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            str(uuid.uuid4()), user_id or "", file_id or "", upload_id or "",
            action, status or "", reason or "",
            json.dumps(metadata or {}, ensure_ascii=False, sort_keys=True), now_iso(),
        ),
    )

