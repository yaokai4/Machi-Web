#!/usr/bin/env python3
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock

os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402


class ReputationBatchTests(unittest.TestCase):
    def test_admin_summary_does_not_query_per_user(self):
        row = {
            "id": "user-1",
            "created_at": "2025-01-01T00:00:00+00:00",
            "xp": 420,
            "level": 3,
            "reputation_score": 82,
            "risk_score": 9,
            "growth_frozen": 0,
            "helped_users": 2,
            "quality_posts": 3,
            "favorites_received": 4,
            "reports_validated": 1,
        }
        levels = {
            3: {
                "level": 3,
                "name_zh": "城市熟客",
                "name_en": "Local Regular",
                "name_ja": "街の常連",
                "description_zh": "",
                "xp_required": 300,
            },
            4: {
                "level": 4,
                "name_zh": "城市达人",
                "name_en": "City Expert",
                "name_ja": "街の達人",
                "description_zh": "",
                "xp_required": 800,
            },
        }
        limits = dict(server.REPUTATION_LIMIT_DEFAULTS)
        conn = MagicMock()

        result = server.serialize_reputation_admin_summary(row, levels=levels, limits=limits)

        conn.execute.assert_not_called()
        self.assertEqual(result["level"], 3)
        self.assertEqual(result["reputation_score"], 82)
        self.assertEqual(result["xp_to_next"], 380)
        self.assertIn("can_publish_secondhand", result["limits"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
