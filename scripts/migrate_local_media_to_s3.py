#!/usr/bin/env python3
"""Migrate referenced local Machi media to S3 + public CloudFront URLs.

The command is a dry run unless --apply is passed. S3 objects are uploaded and
verified before PostgreSQL references are changed in one transaction. Private
uploads are AES-256-GCM encrypted, keep permanent URL fields empty, and have
their obsolete plaintext S3 objects removed before the transaction commits.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import mimetypes
import os
import secrets
import sys
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import boto3
import psycopg2
from botocore.exceptions import ClientError
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from psycopg2.extras import RealDictCursor


PRIVATE_PURPOSES = {
    "post_audio",
    "guide_product_file",
    "member_resource_file",
    "business_verification_file",
    "message_image",
    "message_video",
    "message_file",
}
ACTIVE_UPLOAD_STATUSES = {"uploaded", "processing", "ready"}
LOCAL_URL_COLUMNS = {
    "media": ("url", "thumb_url"),
    "users": ("avatar_url", "cover_url"),
    "listing_media": ("url", "thumbnail_url"),
}
PRIVATE_MEDIA_CIPHER = "AES-256-GCM"
PRIVATE_MEDIA_CIPHER_VERSION = 1
CHUNK_SIZE = 1024 * 1024


def load_env_file(path: Path) -> None:
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        os.environ.setdefault(key.strip(), value)


def local_key(value: str) -> str:
    prefix = "/media/"
    return value[len(prefix):] if value.startswith(prefix) else ""


def local_path(media_root: Path, key: str) -> Path:
    root = media_root.resolve()
    target = (root / key).resolve()
    try:
        target.relative_to(root)
    except ValueError as exc:
        raise RuntimeError(f"unsafe media key: {key}") from exc
    return target


def cdn_url(domain: str, key: str) -> str:
    return f"{domain.rstrip('/')}/{key}"


def json_metadata(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return dict(raw)
    try:
        value = json.loads(raw or "{}")
    except (TypeError, json.JSONDecodeError):
        return {}
    return value if isinstance(value, dict) else {}


def object_exists_with_size(s3: Any, bucket: str, key: str, size: int) -> bool:
    try:
        head = s3.head_object(Bucket=bucket, Key=key)
    except ClientError as exc:
        code = str(exc.response.get("Error", {}).get("Code", ""))
        if code in {"403", "404", "NoSuchKey", "NotFound"}:
            return False
        raise
    return int(head.get("ContentLength") or -1) == size


def object_is_absent(s3: Any, bucket: str, key: str) -> bool:
    try:
        s3.head_object(Bucket=bucket, Key=key)
    except ClientError as exc:
        code = str(exc.response.get("Error", {}).get("Code", ""))
        if code in {"404", "NoSuchKey", "NotFound"}:
            return True
        raise
    return False


def private_media_key() -> bytes:
    raw = os.environ.get("KAIX_PRIVATE_MEDIA_KEY", "").strip()
    if not raw:
        raise RuntimeError("KAIX_PRIVATE_MEDIA_KEY is required for private media migration")
    try:
        key = base64.urlsafe_b64decode(raw + ("=" * (-len(raw) % 4)))
    except Exception as exc:
        raise RuntimeError("KAIX_PRIVATE_MEDIA_KEY is not valid base64") from exc
    if len(key) != 32:
        raise RuntimeError("KAIX_PRIVATE_MEDIA_KEY must decode to exactly 32 bytes")
    return key


def encoded(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def decoded(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + ("=" * (-len(value) % 4)))


def encrypted_object_key(source_key: str) -> str:
    return f"private-encrypted/{source_key}"


def encrypt_private_file(source: Path, destination: Path, key: bytes) -> tuple[dict[str, Any], str, str]:
    iv = secrets.token_bytes(12)
    encryptor = Cipher(algorithms.AES(key), modes.GCM(iv)).encryptor()
    plain_sha = hashlib.sha256()
    cipher_sha = hashlib.sha256()
    with source.open("rb") as plain, destination.open("wb") as encrypted:
        while True:
            chunk = plain.read(CHUNK_SIZE)
            if not chunk:
                break
            plain_sha.update(chunk)
            encrypted_chunk = encryptor.update(chunk)
            cipher_sha.update(encrypted_chunk)
            encrypted.write(encrypted_chunk)
        final = encryptor.finalize()
        cipher_sha.update(final)
        encrypted.write(final)
    metadata = {
        "algorithm": PRIVATE_MEDIA_CIPHER,
        "version": PRIVATE_MEDIA_CIPHER_VERSION,
        "iv": encoded(iv),
        "tag": encoded(encryptor.tag),
    }
    return metadata, plain_sha.hexdigest(), cipher_sha.hexdigest()


def verify_private_object(
    s3: Any,
    bucket: str,
    object_key: str,
    encryption: dict[str, Any],
    key: bytes,
    expected_plain_sha: str,
    expected_cipher_sha: str,
    expected_size: int,
) -> None:
    response = s3.get_object(Bucket=bucket, Key=object_key)
    body = response["Body"]
    decryptor = Cipher(
        algorithms.AES(key),
        modes.GCM(decoded(str(encryption["iv"])), decoded(str(encryption["tag"]))),
    ).decryptor()
    plain_sha = hashlib.sha256()
    cipher_sha = hashlib.sha256()
    plain_size = 0
    try:
        while True:
            chunk = body.read(CHUNK_SIZE)
            if not chunk:
                break
            cipher_sha.update(chunk)
            plain_chunk = decryptor.update(chunk)
            plain_sha.update(plain_chunk)
            plain_size += len(plain_chunk)
        final = decryptor.finalize()
        plain_sha.update(final)
        plain_size += len(final)
    finally:
        body.close()
    if plain_size != expected_size or plain_sha.hexdigest() != expected_plain_sha:
        raise RuntimeError(f"private object decrypt verification failed for {object_key}")
    if cipher_sha.hexdigest() != expected_cipher_sha:
        raise RuntimeError(f"private object ciphertext verification failed for {object_key}")
    if cipher_sha.hexdigest() == plain_sha.hexdigest():
        raise RuntimeError(f"private object was uploaded without encryption: {object_key}")


def collect_local_references(cursor: Any) -> dict[str, str]:
    references: dict[str, str] = {}
    for table, columns in LOCAL_URL_COLUMNS.items():
        for column in columns:
            cursor.execute(
                f'SELECT "{column}" FROM "{table}" WHERE "{column}" LIKE %s',
                ("/media/%",),
            )
            for row in cursor.fetchall():
                value = str(row[column] or "")
                key = local_key(value)
                if key:
                    references[value] = key
    return references


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--media-root", required=True)
    parser.add_argument("--env-file")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    if args.env_file:
        load_env_file(Path(args.env_file))

    dsn = os.environ.get("KAIX_PG_DSN", "")
    bucket = os.environ.get("AWS_S3_BUCKET", "")
    region = os.environ.get("AWS_REGION", "ap-northeast-1")
    domain = os.environ.get("AWS_CLOUDFRONT_DOMAIN", "").rstrip("/")
    if not dsn or not bucket or not domain:
        print(
            "ERROR: KAIX_PG_DSN, AWS_S3_BUCKET and AWS_CLOUDFRONT_DOMAIN are required",
            file=sys.stderr,
        )
        return 2

    media_root = Path(args.media_root)
    if not media_root.is_dir():
        print(f"ERROR: media root does not exist: {media_root}", file=sys.stderr)
        return 2

    conn = psycopg2.connect(dsn)
    conn.autocommit = False
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    cursor.execute(
        """
        SELECT *
          FROM uploaded_files
         WHERE bucket = 'local-dev'
           AND deleted_at IS NULL
         ORDER BY created_at, id
        """
    )
    uploads = [dict(row) for row in cursor.fetchall()]
    references = collect_local_references(cursor)

    mime_by_key: dict[str, str] = {}
    cursor.execute(
        "SELECT url, thumb_url, mime FROM media "
        "WHERE url LIKE %s OR thumb_url LIKE %s",
        ("/media/%", "/media/%"),
    )
    for row in cursor.fetchall():
        for value in (str(row["url"] or ""), str(row["thumb_url"] or "")):
            key = local_key(value)
            if key:
                mime_by_key.setdefault(key, str(row["mime"] or ""))

    required_keys = set(references.values())
    missing_active: list[str] = []
    missing_pending: list[dict[str, Any]] = []
    migratable_uploads: list[dict[str, Any]] = []
    for upload in uploads:
        key = str(upload.get("object_key") or "")
        source = local_path(media_root, key)
        if source.is_file():
            required_keys.add(key)
            mime_by_key[key] = str(upload.get("content_type") or "")
            migratable_uploads.append(upload)
        elif str(upload.get("status") or "") in ACTIVE_UPLOAD_STATUSES:
            missing_active.append(f"{upload['id']}:{key}")
        else:
            missing_pending.append(upload)

    private_source_keys = {
        str(upload["object_key"])
        for upload in migratable_uploads
        if str(upload.get("purpose") or "") in PRIVATE_PURPOSES
    }
    public_upload_keys = {
        str(upload["object_key"])
        for upload in migratable_uploads
        if str(upload.get("purpose") or "") not in PRIVATE_PURPOSES
    }
    collisions = sorted(private_source_keys & public_upload_keys)
    if collisions:
        for key in collisions:
            print(f"ERROR: object key is shared by public and private uploads: {key}", file=sys.stderr)
        conn.rollback()
        conn.close()
        return 1

    missing_references = sorted(
        key for key in required_keys if not local_path(media_root, key).is_file()
    )
    if missing_active or missing_references:
        for item in missing_active:
            print(f"ERROR: active upload source is missing: {item}", file=sys.stderr)
        for key in missing_references:
            print(f"ERROR: referenced local media is missing: {key}", file=sys.stderr)
        conn.rollback()
        conn.close()
        return 1

    total_bytes = sum(local_path(media_root, key).stat().st_size for key in required_keys)
    print(
        f"plan objects={len(required_keys)} bytes={total_bytes} "
        f"uploads={len(migratable_uploads)} stale_pending={len(missing_pending)} "
        f"private_objects={len(private_source_keys)} local_urls={len(references)} apply={args.apply}"
    )
    if not args.apply:
        conn.rollback()
        conn.close()
        return 0

    s3 = boto3.client("s3", region_name=region)
    encryption_key = private_media_key() if private_source_keys else b""
    encryption_by_source_key: dict[str, dict[str, Any]] = {}
    for key in sorted(required_keys):
        source = local_path(media_root, key)
        size = source.stat().st_size
        content_type = mime_by_key.get(key) or mimetypes.guess_type(key)[0] or "application/octet-stream"
        if key in private_source_keys:
            target_key = encrypted_object_key(key)
            temp_name = ""
            try:
                with tempfile.NamedTemporaryFile(prefix="machi-private-migration-", suffix=".enc", delete=False) as temp:
                    temp_name = temp.name
                encryption, plain_sha, cipher_sha = encrypt_private_file(source, Path(temp_name), encryption_key)
                s3.upload_file(
                    temp_name,
                    bucket,
                    target_key,
                    ExtraArgs={
                        "ContentType": "application/octet-stream",
                        "Metadata": {
                            "machi-private": "aes-256-gcm",
                            "machi-cipher-version": str(PRIVATE_MEDIA_CIPHER_VERSION),
                        },
                    },
                )
                if not object_exists_with_size(s3, bucket, target_key, size):
                    raise RuntimeError(f"S3 encrypted object verification failed for {target_key}")
                verify_private_object(
                    s3,
                    bucket,
                    target_key,
                    encryption,
                    encryption_key,
                    plain_sha,
                    cipher_sha,
                    size,
                )
                encryption_by_source_key[key] = encryption
                print(f"uploaded encrypted {target_key} bytes={size}")
            finally:
                if temp_name:
                    Path(temp_name).unlink(missing_ok=True)
        else:
            if not object_exists_with_size(s3, bucket, key, size):
                s3.upload_file(
                    str(source),
                    bucket,
                    key,
                    ExtraArgs={"ContentType": content_type},
                )
            if not object_exists_with_size(s3, bucket, key, size):
                raise RuntimeError(f"S3 verification failed for {key}")
            print(f"uploaded {key} bytes={size}")

    now = datetime.now(timezone.utc).isoformat()
    try:
        for upload in migratable_uploads:
            source_key = str(upload["object_key"])
            purpose = str(upload.get("purpose") or "")
            private = purpose in PRIVATE_PURPOSES
            key = encrypted_object_key(source_key) if private else source_key
            public = "" if private else cdn_url(domain, key)
            metadata = json_metadata(upload.get("metadata"))
            metadata["source"] = "s3-encrypted" if private else "s3"
            metadata["migrated_to_s3_at"] = now
            if private:
                metadata["thumbnail_url"] = ""
                metadata["variants"] = {}
                metadata["encryption"] = encryption_by_source_key[source_key]
                metadata["encrypted_at"] = now
            else:
                metadata["thumbnail_url"] = public if str(upload.get("content_type") or "").startswith("image/") else ""
                metadata["variants"] = {
                    "original": public,
                    "large": public,
                    "medium": public,
                    "thumbnail": metadata["thumbnail_url"] or public,
                }
            cursor.execute(
                """
                UPDATE uploaded_files
                   SET bucket = %s, object_key = %s, public_url = %s, cdn_url = %s,
                       metadata = %s, updated_at = %s
                 WHERE id = %s
                """,
                (
                    bucket,
                    key,
                    public,
                    public,
                    json.dumps(metadata, ensure_ascii=False, sort_keys=True),
                    now,
                    upload["id"],
                ),
            )
            cursor.execute(
                "UPDATE media SET url = %s, thumb_url = %s WHERE id = %s",
                (public, public, upload["id"]),
            )
            cursor.execute(
                """
                INSERT INTO upload_audit_logs (
                    id, user_id, uploaded_file_id, upload_id, action,
                    status, reason, metadata, created_at
                ) VALUES (%s, %s, %s, %s, 'migrate_s3', %s, '', %s, %s)
                """,
                (
                    str(uuid.uuid4()),
                    upload.get("user_id") or "",
                    upload["id"],
                    upload.get("upload_id") or "",
                    upload.get("status") or "",
                    json.dumps({"bucket": bucket, "objectKey": key}, sort_keys=True),
                    now,
                ),
            )

        for upload in missing_pending:
            metadata = json_metadata(upload.get("metadata"))
            metadata["migration_error"] = "local_source_missing"
            metadata["migration_checked_at"] = now
            cursor.execute(
                """
                UPDATE uploaded_files
                   SET status = 'failed', metadata = %s, updated_at = %s
                 WHERE id = %s
                """,
                (
                    json.dumps(metadata, ensure_ascii=False, sort_keys=True),
                    now,
                    upload["id"],
                ),
            )
            cursor.execute(
                """
                INSERT INTO upload_audit_logs (
                    id, user_id, uploaded_file_id, upload_id, action,
                    status, reason, metadata, created_at
                ) VALUES (%s, %s, %s, %s, 'migrate_s3', 'failed',
                          'local_source_missing', '{}', %s)
                """,
                (
                    str(uuid.uuid4()),
                    upload.get("user_id") or "",
                    upload["id"],
                    upload.get("upload_id") or "",
                    now,
                ),
            )

        for old_url, key in references.items():
            new_url = "" if key in private_source_keys else cdn_url(domain, key)
            for table, columns in LOCAL_URL_COLUMNS.items():
                for column in columns:
                    cursor.execute(
                        f'UPDATE "{table}" SET "{column}" = %s WHERE "{column}" = %s',
                        (new_url, old_url),
                    )

        cursor.execute(
            """
            SELECT COUNT(*) AS count
              FROM uploaded_files
             WHERE bucket = 'local-dev'
               AND status IN ('uploaded','processing','ready')
               AND deleted_at IS NULL
            """
        )
        active_local = int(cursor.fetchone()["count"])
        remaining_references = collect_local_references(cursor)
        if active_local or remaining_references:
            raise RuntimeError(
                f"post-migration verification failed: active_local={active_local} "
                f"local_urls={len(remaining_references)}"
            )

        for source_key in sorted(private_source_keys):
            s3.delete_object(Bucket=bucket, Key=source_key)
            if not object_is_absent(s3, bucket, source_key):
                raise RuntimeError(f"plaintext private object still exists: {source_key}")
            print(f"deleted plaintext private object {source_key}")
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    print(
        f"OK migrated_objects={len(required_keys)} migrated_uploads={len(migratable_uploads)} "
        f"encrypted_private_objects={len(private_source_keys)} "
        f"failed_stale_pending={len(missing_pending)} local_urls=0"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
