#!/usr/bin/env python3
"""backfill_post_regions 脚本(存量帖 region 回填)的功能测试:

  · 三种来源分支:帖子自带 region_code 反解 / 作者 current_region_code
    反解(含 3 段层级码与 2 段平铺码)/ 兜底 country='jp';
  · dry-run 不写库;
  · --apply 后幂等:重跑扫描 0 行、全表快照零改动;
  · country 已非空的行绝不触碰;created_at/updated_at 不被扰动。

风格与 test_listing_facets.py 一致:真 schema + 迁移链,一次性临时 SQLite 库,
脚本走 subprocess(与运维实际用法同路径)。绝不碰 web/kaix.db。
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
_TMP_DB = Path(tempfile.mkdtemp(prefix="kaix-post-region-backfill-")) / "test.db"
os.environ["KAIX_DB_PATH"] = str(_TMP_DB)
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402

_SCRIPT = ROOT / "scripts" / "backfill_post_regions.py"
_TS = "2026-01-01T00:00:00+00:00"


def _run_script(*extra: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(_SCRIPT), "--db", str(_TMP_DB), *extra],
        capture_output=True, text=True, timeout=60,
    )


class BackfillPostRegionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.conn = server.db()
        cls.conn.executescript(server.SCHEMA)
        server.run_migrations(cls.conn)
        # p-orphan 模拟「作者行已不存在」的历史脏数据(脚本用 LEFT JOIN 防御),
        # 造数需要暂关本连接的 FK 检查;脚本自身的 UPDATE 不改 author_id,不受影响。
        cls.conn.commit()
        cls.conn.execute("PRAGMA foreign_keys = OFF")
        # 作者:3 段层级码 / 2 段平铺码 / 无地区。
        for uid, region in (
            ("u-tokyo", "jp.tokyo.shinjuku"),
            ("u-sg", "sg.singapore"),
            ("u-none", ""),
        ):
            cls.conn.execute(
                "INSERT INTO users (id, handle, display_name, password_hash, current_region_code,"
                " joined_at, created_at, updated_at) VALUES (?, ?, ?, 'x', ?, ?, ?, ?)",
                (uid, uid, uid, region, _TS, _TS, _TS),
            )
        # 存量帖矩阵(country 全空,等待回填):
        #   p-own      自带 region_code(与作者当前地区不同)→ 来源①,信帖子不信作者
        #   p-author3  作者 3 段码 → 来源②
        #   p-author2  作者 2 段平铺码 → 来源②(province 留空)
        #   p-none     作者无地区 → 来源③ 兜底 jp
        #   p-orphan   作者行不存在(LEFT JOIN)→ 来源③ 兜底 jp
        #   p-ok       country 已有值 → 对照组,绝不触碰
        rows = [
            ("p-own", "u-tokyo", "", "jp.osaka.namba"),
            ("p-author3", "u-tokyo", "", ""),
            ("p-author2", "u-sg", "", ""),
            ("p-none", "u-none", "", ""),
            ("p-orphan", "u-ghost", "", ""),
            ("p-ok", "u-tokyo", "kr", "kr.seoul"),
        ]
        for pid, author, country, region_code in rows:
            cls.conn.execute(
                "INSERT INTO posts (id, author_id, content, country, province, city, region_code,"
                " created_at, updated_at) VALUES (?, ?, 'hello', ?, '', ?, ?, ?, ?)",
                (pid, author, country, "seoul" if pid == "p-ok" else "", region_code, _TS, _TS),
            )
        cls.conn.commit()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.conn.close()

    def _snapshot(self) -> list[tuple]:
        return [tuple(r) for r in self.conn.execute(
            "SELECT id, country, province, city, region_code, created_at, updated_at"
            " FROM posts ORDER BY id")]

    def _region_of(self, pid: str) -> tuple:
        row = self.conn.execute(
            "SELECT country, province, city, region_code FROM posts WHERE id = ?", (pid,)
        ).fetchone()
        return (row["country"], row["province"], row["city"], row["region_code"])

    def test_1_dry_run_reports_but_does_not_write(self) -> None:
        before = self._snapshot()
        proc = _run_script()
        self.assertEqual(proc.returncode, 0, proc.stderr)
        out = proc.stdout
        self.assertIn("posts scanned (country empty): 5", out)
        self.assertIn("from post region_code: 1", out)
        self.assertIn("from author region   : 2", out)
        self.assertIn("fallback country=jp  : 2", out)
        self.assertIn("rows updated: 0", out)
        self.assertIn("dry-run", out)
        # dry-run 未写库:全表逐列一致。
        self.assertEqual(self._snapshot(), before)

    def test_2_apply_covers_three_sources(self) -> None:
        proc = _run_script("--apply")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("rows updated: 5", proc.stdout)
        # 来源①:帖子自带 region_code 反解,原 code 保留。
        self.assertEqual(self._region_of("p-own"), ("jp", "osaka", "namba", "jp.osaka.namba"))
        # 来源②:作者 3 段层级码,region_code 一并补齐(行内自洽)。
        self.assertEqual(self._region_of("p-author3"), ("jp", "tokyo", "shinjuku", "jp.tokyo.shinjuku"))
        # 来源②:作者 2 段平铺码,province 留空。
        self.assertEqual(self._region_of("p-author2"), ("sg", "", "singapore", "sg.singapore"))
        # 来源③:作者无地区 → 兜底 jp,province/city/region_code 留空。
        self.assertEqual(self._region_of("p-none"), ("jp", "", "", ""))
        # 来源③:作者行不存在 → 同样兜底 jp。
        self.assertEqual(self._region_of("p-orphan"), ("jp", "", "", ""))
        # 对照组:country 已非空的行原样。
        self.assertEqual(self._region_of("p-ok"), ("kr", "", "seoul", "kr.seoul"))
        # 回填不扰动时间戳。
        ts = self.conn.execute(
            "SELECT created_at, updated_at FROM posts WHERE id = 'p-author3'").fetchone()
        self.assertEqual((ts["created_at"], ts["updated_at"]), (_TS, _TS))

    def test_3_apply_is_idempotent(self) -> None:
        # 依赖 test_2 已 apply(unittest 按方法名排序执行)。
        before = self._snapshot()
        proc = _run_script("--apply")
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("posts scanned (country empty): 0", proc.stdout)
        self.assertIn("rows updated: 0", proc.stdout)
        self.assertEqual(self._snapshot(), before)


if __name__ == "__main__":
    unittest.main(verbosity=2)
