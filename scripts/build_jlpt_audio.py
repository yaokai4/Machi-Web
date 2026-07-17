#!/usr/bin/env python3
"""为 JLPT 听力题合成音频并接入媒体系统（可复现的构建工具，不改内容）。

听力题的脚本（原创，存在 jlpt_questions.passage）由 macOS `say` 多说话人合成
为 m4a，写入 MEDIA_DIR/jlpt/audio/，插一行 media，回填 jlpt_questions.audio_media_id。
合成的是原创脚本的音频，无版权问题。音频是运行时产物（media/jlpt/ 已 gitignore），
本脚本可随时从提交的脚本重建；生产部署用 migrate_local_media_to_s3.py 迁到 S3。

幂等 + 可续跑：已有有效 audio_media_id 且磁盘文件在的题跳过。

用法（在 web/ 目录下）：
  python3 scripts/build_jlpt_audio.py                 # 全部缺音频的听力题
  python3 scripts/build_jlpt_audio.py --level N1 --limit 50
  python3 scripts/build_jlpt_audio.py --db /path/kaix.db --force
"""
import argparse
import os
import sqlite3
import sys
import uuid
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import jlpt_tts  # noqa: E402

WEB_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MEDIA_DIR = os.path.join(WEB_ROOT, "media")
AUDIO_SUBDIR = os.path.join("jlpt", "audio")  # object_key 前缀 → /media/jlpt/audio/...


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def owner_id(conn):
    row = conn.execute("SELECT id FROM users ORDER BY created_at LIMIT 1").fetchone()
    return row["id"] if row else "system"


def media_ok(conn, mid):
    if not mid:
        return False
    row = conn.execute(
        "SELECT url FROM media WHERE id = ? AND deleted_at IS NULL", (mid,)
    ).fetchone()
    if not row:
        return False
    url = row["url"] or ""
    rel = url[len("/media/"):] if url.startswith("/media/") else url.lstrip("/")
    return os.path.exists(os.path.join(MEDIA_DIR, rel))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.path.join(WEB_ROOT, "kaix.db"))
    ap.add_argument("--level", default="")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--force", action="store_true", help="重合成已有音频的题")
    a = ap.parse_args()

    conn = sqlite3.connect(a.db)
    conn.row_factory = sqlite3.Row
    oid = owner_id(conn)
    os.makedirs(os.path.join(MEDIA_DIR, AUDIO_SUBDIR), exist_ok=True)

    where = ["section = 'listening'", "status = 'published'",
             "review_status = 'approved'", "COALESCE(passage,'') <> ''"]
    params = []
    if a.level:
        where.append("level = ?")
        params.append(a.level.upper())
    rows = conn.execute(
        "SELECT id, level, passage, audio_media_id FROM jlpt_questions WHERE "
        + " AND ".join(where) + " ORDER BY level, sort_order, id",
        tuple(params),
    ).fetchall()

    todo = [r for r in rows if a.force or not media_ok(conn, r["audio_media_id"])]
    if a.limit:
        todo = todo[:a.limit]
    print(f"listening questions: {len(rows)} total, {len(todo)} need audio"
          + (f" (limit {a.limit})" if a.limit else ""))

    done = failed = 0
    for i, r in enumerate(todo, 1):
        mid = "aud_" + uuid.uuid4().hex[:20]
        object_key = os.path.join(AUDIO_SUBDIR, mid + ".m4a")
        disk_path = os.path.join(MEDIA_DIR, object_key)
        try:
            if not jlpt_tts.synth(r["passage"], disk_path):
                failed += 1
                continue
            dur = jlpt_tts.duration_seconds(disk_path)
            size = os.path.getsize(disk_path)
            url = "/media/" + object_key.replace(os.sep, "/")
            conn.execute(
                "INSERT INTO media (id, owner_id, type, url, thumb_url, mime, width, height, "
                "duration, byte_size, created_at, deleted_at) "
                "VALUES (?, ?, 'audio', ?, '', 'audio/mp4', 0, 0, ?, ?, ?, NULL)",
                (mid, oid, url, int(round(dur)), size, now_iso()),
            )
            conn.execute(
                "UPDATE jlpt_questions SET audio_media_id = ?, updated_at = ? WHERE id = ?",
                (mid, now_iso(), r["id"]),
            )
            conn.commit()
            done += 1
            if i % 25 == 0 or i == len(todo):
                print(f"  {i}/{len(todo)}  ({done} done, {failed} failed)  last {dur:.0f}s")
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"  ! {r['id']}: {exc}")
    print(f"done: {done} synthesized, {failed} failed")


if __name__ == "__main__":
    main()
