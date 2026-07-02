#!/usr/bin/env python3
"""B5:12 篇旗舰文章正文升级的幂等迁移测试。

种子只插不改,所以线上已存在的这 12 篇不会被 INSERT 更新。
server._guide_backfill_existing_rows 对它们做一次幂等 body/summary/verified_at 升级,
安全条件是「正文仍为种子时代原文」(旧正文前 64 字符指纹匹配)。

本测试覆盖三种线上行:
  1) 种子时代原文行  -> 应被升级为旗舰正文,verified_at 更新。
  2) 管理员手改过的行 -> 指纹不匹配,应跳过(正文保持人工内容不被覆盖)。
  3) 已升级过的行    -> 再跑迁移应为 no-op(幂等)。

Run:  cd web && python3 scripts/test_guide_flagship_upgrade.py
"""
from __future__ import annotations

import os
import sys
import tempfile
import uuid
from pathlib import Path

_TMP_DB = tempfile.mkstemp(prefix="machi_flagship_test_", suffix=".db")[1]
os.environ["KAIX_DB_PATH"] = _TMP_DB
os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
os.environ.setdefault("KAIX_ENV", "development")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402
import server_guide_data as gd  # noqa: E402

COUNTRY = server.GUIDE_DEFAULT_COUNTRY

# 升级后(现行)种子里这 12 篇的 body/summary。
_SEED_BY_SLUG = {a["slug"]: a for a in gd.GUIDE_ARTICLE_SEED}
# 升级前旧正文的前 64 字符指纹(迁移用来识别「未被手改」的行)。
_OLD_PREFIX = dict(gd._GUIDE_FLAGSHIP_OLD_BODY_FINGERPRINT)


def _insert_article(conn, slug, *, body, summary, author_type="editorial"):
    """插入一条模拟线上老行(给定 body/summary)。"""
    now = "2026-06-01T00:00:00Z"  # 老的 updated_at
    conn.execute(
        "INSERT INTO guide_articles (id, title, slug, summary, body, category_key, sub_category_key, "
        "content_type, country, language, author_type, author_name, is_featured, status, "
        "verified_at, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, 'guide', ?, 'zh-CN', ?, ?, 0, 'published', "
        "'2026-06-01', ?, ?)",
        (str(uuid.uuid4()), "T-" + slug, slug, summary, body,
         _SEED_BY_SLUG[slug]["category"], _SEED_BY_SLUG[slug].get("sub", ""),
         COUNTRY, author_type, "Machi 编辑部", now, now),
    )


def _fetch(conn, slug):
    return conn.execute(
        "SELECT body, summary, verified_at, updated_at FROM guide_articles "
        "WHERE country = ? AND slug = ?",
        (COUNTRY, slug),
    ).fetchone()


def _reconstruct_old_body(slug):
    """构造一个「种子时代原文」:前 64 字符必须等于迁移指纹,后面随意。
    真实旧正文我们没有全文(只留了 64 字前缀指纹),但迁移只比对前 64 字符,
    所以用「指纹 + 一段旧尾巴」即可精确模拟未被手改的线上行。"""
    return _OLD_PREFIX[slug] + "……(这里是种子时代的旧正文剩余部分,升级后应被整体替换)"


def main() -> None:
    server.init_db()
    conn = server.db()
    try:
        # init_db 已经把升级后正文 seed 进空库了。为模拟「线上老行」,先把这 12 篇
        # 全删掉,再按不同场景重新插入。
        for slug in gd.GUIDE_FLAGSHIP_SLUGS:
            conn.execute("DELETE FROM guide_articles WHERE country = ? AND slug = ?", (COUNTRY, slug))

        # 场景划分:
        upgrade_slugs = list(gd.GUIDE_FLAGSHIP_SLUGS[:8])   # 场景1:种子原文,应升级
        edited_slug = gd.GUIDE_FLAGSHIP_SLUGS[8]            # 场景2:管理员手改,应跳过
        already_slugs = list(gd.GUIDE_FLAGSHIP_SLUGS[9:])   # 场景3:已是旗舰正文,幂等

        # 场景1:插入种子时代原文行。
        for slug in upgrade_slugs:
            _insert_article(conn, slug, body=_reconstruct_old_body(slug),
                            summary="旧摘要(种子时代)")

        # 场景2:管理员把正文彻底改写(前 64 字符与指纹不同)。
        admin_body = "【管理员手动改写的正文】这是运营后台里编辑过的内容,迁移绝对不能覆盖它。" * 3
        admin_summary = "管理员手改的摘要,不应被覆盖。"
        _insert_article(conn, edited_slug, body=admin_body, summary=admin_summary)

        # 场景3:已经是升级后的旗舰正文。
        for slug in already_slugs:
            _insert_article(conn, slug, body=_SEED_BY_SLUG[slug]["body"],
                            summary=_SEED_BY_SLUG[slug]["summary"])

        # 记录迁移前 updated_at,便于验证「未变动的行不应被写」。
        before = {s: _fetch(conn, s)["updated_at"] for s in gd.GUIDE_FLAGSHIP_SLUGS}

        # ---- 跑幂等迁移 ----
        server._guide_backfill_existing_rows(conn, COUNTRY)

        vat = gd.GUIDE_FLAGSHIP_UPGRADE_VERIFIED_AT

        # 断言场景1:全部升级为旗舰正文 + verified_at 更新 + updated_at 变新。
        for slug in upgrade_slugs:
            row = _fetch(conn, slug)
            assert row["body"] == _SEED_BY_SLUG[slug]["body"], f"{slug}: body not upgraded"
            assert row["summary"] == _SEED_BY_SLUG[slug]["summary"], f"{slug}: summary not upgraded"
            assert row["verified_at"] == vat, f"{slug}: verified_at not set (got {row['verified_at']})"
            assert row["updated_at"] != before[slug], f"{slug}: updated_at should change on upgrade"
        print(f"[1] 种子原文行已升级为旗舰正文: {len(upgrade_slugs)} 篇 OK")

        # 断言场景2:管理员手改的行原封不动。
        row = _fetch(conn, edited_slug)
        assert row["body"] == admin_body, f"{edited_slug}: admin body was overwritten!"
        assert row["summary"] == admin_summary, f"{edited_slug}: admin summary was overwritten!"
        assert row["updated_at"] == before[edited_slug], f"{edited_slug}: admin row should be untouched"
        print(f"[2] 管理员手改行被跳过、未被覆盖: {edited_slug} OK")

        # 断言场景3:已升级行内容不变(幂等)。
        for slug in already_slugs:
            row = _fetch(conn, slug)
            assert row["body"] == _SEED_BY_SLUG[slug]["body"], f"{slug}: already-upgraded body changed"
            assert row["updated_at"] == before[slug], f"{slug}: already-upgraded row should not be rewritten"
        print(f"[3] 已升级行保持不变(幂等): {len(already_slugs)} 篇 OK")

        # ---- 再跑一次迁移,验证整体幂等:场景1 的行这次也不应再被写 ----
        after_first = {s: _fetch(conn, s)["updated_at"] for s in gd.GUIDE_FLAGSHIP_SLUGS}
        server._guide_backfill_existing_rows(conn, COUNTRY)
        for slug in gd.GUIDE_FLAGSHIP_SLUGS:
            row = _fetch(conn, slug)
            assert row["updated_at"] == after_first[slug], f"{slug}: second run rewrote row (not idempotent)"
        print("[4] 二次运行迁移无副作用(全 12 篇幂等) OK")

        # ---- 额外:确认这 12 篇 seed 正文确实达到旗舰规格(markdown + 字数)----
        import re
        for slug in gd.GUIDE_FLAGSHIP_SLUGS:
            body = _SEED_BY_SLUG[slug]["body"]
            readable = len(re.sub(r"\s", "", re.sub(r"https?://\S+", "",
                          re.sub(r"[#*|>-]", "", re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", body)))))
            assert 1500 <= readable <= 3000, f"{slug}: readable={readable} out of 1500-3000"
            assert "## " in body, f"{slug}: no ## heading"
            assert re.search(r"^\d+\. ", body, re.M), f"{slug}: no ordered list"
            assert re.search(r"^- ", body, re.M), f"{slug}: no unordered list"
            assert "| ---" in body, f"{slug}: no markdown table"
            assert "⚠" in body, f"{slug}: no warn line"
            assert re.search(r"\[[^\]]+\]\(https?://", body), f"{slug}: no official link"
            assert "免责" in body, f"{slug}: no disclaimer"
        print(f"[5] 12 篇 seed 正文均达旗舰规格(1500-3000 字 + markdown 契约) OK")

        conn.commit()
        print("\nALL PASS")
    finally:
        conn.close()
        try:
            os.remove(_TMP_DB)
        except OSError:
            pass


if __name__ == "__main__":
    main()
