#!/usr/bin/env python3
"""B2-1 × B1-1 组合缺陷回归测试：_guide_audit_recommended_slugs 的
deliverable-ready 告警。

推荐位常量只保证 slug 存在且 published 不够——published 的付费数字商品在
运营传交付文件前，购买入口按 C-1 拒 PRODUCT_NOT_READY，推荐位照样买不了。
启动审计必须对这类 SKU 告警（告警即「传文件」的运营信号），文件补上后告警
消失。

Run:  cd web && python3 scripts/test_guide_slug_audit.py
"""
from __future__ import annotations

import logging
import os
import sys
import tempfile
import unittest
import uuid
from pathlib import Path

_TMP_DB = tempfile.mkstemp(prefix="machi_slug_audit_test_", suffix=".db")[1]
os.environ["KAIX_DB_PATH"] = _TMP_DB
os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
os.environ.setdefault("KAIX_ENV", "development")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402

# 付费数字 SKU（seed 里 price=980、无文件）与免费 SKU，均在推荐位常量中。
PAID_SLUG = "jlpt-n2-past-trend-original-practice"
FREE_SLUG = "jlpt-n5-n1-roadmap"


class _Capture(logging.Handler):
    def __init__(self) -> None:
        super().__init__(level=logging.WARNING)
        self.messages: list[str] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.messages.append(record.getMessage())


def _run_audit(conn) -> list[str]:
    cap = _Capture()
    server.ACCESS_LOG.addHandler(cap)
    server.ERR_LOG.addHandler(cap)
    try:
        server._guide_audit_recommended_slugs(conn)
    finally:
        server.ACCESS_LOG.removeHandler(cap)
        server.ERR_LOG.removeHandler(cap)
    return cap.messages


def _msgs_for(messages: list[str], slug: str, needle: str) -> list[str]:
    return [m for m in messages if needle in m and slug in m]


class GuideSlugAuditTests(unittest.TestCase):
    conn = None  # set in setUpClass

    @classmethod
    def setUpClass(cls) -> None:
        server.init_db()
        cls.conn = server.db()

    @classmethod
    def tearDownClass(cls) -> None:
        try:
            cls.conn.close()
        finally:
            for suffix in ("", "-wal", "-shm"):
                try:
                    os.unlink(_TMP_DB + suffix)
                except OSError:
                    pass

    def setUp(self) -> None:
        # 基线：付费 SKU 无任何交付文件、published。
        self.conn.execute("UPDATE guide_products SET file_url = '', status = 'published' WHERE slug = ?",
                          (PAID_SLUG,))
        self.conn.execute(
            "DELETE FROM guide_product_files WHERE product_id = "
            "(SELECT id FROM guide_products WHERE slug = ?)", (PAID_SLUG,))
        self.conn.commit()

    def test_paid_published_without_file_warns(self) -> None:
        msgs = _run_audit(self.conn)
        self.assertTrue(_msgs_for(msgs, PAID_SLUG, "not deliverable-ready"),
                        f"expected deliverable-ready warning for {PAID_SLUG}, got: {msgs}")
        self.assertFalse(_msgs_for(msgs, PAID_SLUG, "does not exist"))
        self.assertFalse(_msgs_for(msgs, PAID_SLUG, "not published"))

    def test_file_url_clears_warning(self) -> None:
        self.conn.execute("UPDATE guide_products SET file_url = 'guide/files/n2.pdf' WHERE slug = ?",
                          (PAID_SLUG,))
        self.conn.commit()
        msgs = _run_audit(self.conn)
        self.assertFalse(_msgs_for(msgs, PAID_SLUG, "not deliverable-ready"),
                         f"file_url set — warning must clear, got: {msgs}")

    def test_files_table_record_clears_warning(self) -> None:
        self.conn.execute(
            "INSERT INTO guide_product_files (id, product_id, file_url, file_name, created_at) "
            "SELECT ?, id, 'guide/files/n2.pdf', 'n2.pdf', ? FROM guide_products WHERE slug = ?",
            (str(uuid.uuid4()), server.now_iso(), PAID_SLUG))
        self.conn.commit()
        msgs = _run_audit(self.conn)
        self.assertFalse(_msgs_for(msgs, PAID_SLUG, "not deliverable-ready"),
                         f"guide_product_files row exists — warning must clear, got: {msgs}")

    def test_free_product_without_file_not_flagged(self) -> None:
        msgs = _run_audit(self.conn)
        self.assertFalse(_msgs_for(msgs, FREE_SLUG, "not deliverable-ready"),
                         f"free SKU must not be flagged, got: {msgs}")

    def test_unpublished_reports_status_not_deliverability(self) -> None:
        self.conn.execute("UPDATE guide_products SET status = 'draft' WHERE slug = ?", (PAID_SLUG,))
        self.conn.commit()
        msgs = _run_audit(self.conn)
        self.assertTrue(_msgs_for(msgs, PAID_SLUG, "not published"))
        self.assertFalse(_msgs_for(msgs, PAID_SLUG, "not deliverable-ready"))

    def test_missing_slug_still_reported(self) -> None:
        self.conn.execute("DELETE FROM guide_products WHERE slug = ?", (PAID_SLUG,))
        self.conn.commit()
        try:
            msgs = _run_audit(self.conn)
            self.assertTrue(_msgs_for(msgs, PAID_SLUG, "does not exist"))
        finally:
            server.ensure_guide_seed(self.conn)  # slug 缺失时按 seed 重建
            self.conn.commit()


if __name__ == "__main__":
    unittest.main(verbosity=2)
