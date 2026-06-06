#!/usr/bin/env python3
"""The unified error envelope echoes requestId in the body + nested error obj,
and stays backward-compatible with existing {error:{code,message}} consumers.

Run:  cd web && python3 scripts/test_error_envelope.py
"""
import os
import sys
import unittest
from pathlib import Path

os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from server import Handler  # noqa: E402


class ErrorEnvelopeTests(unittest.TestCase):
    def _envelope(self, rid="req123"):
        h = Handler.__new__(Handler)
        h._request_id = rid
        return h._error_envelope("bad_request", "nope")

    def test_shape_and_request_id(self):
        e = self._envelope()
        self.assertFalse(e["ok"])
        self.assertFalse(e["success"])
        self.assertEqual(e["code"], "bad_request")
        self.assertEqual(e["message"], "nope")
        self.assertEqual(e["requestId"], "req123")

    def test_backward_compatible_nested_error(self):
        e = self._envelope()
        self.assertEqual(
            e["error"],
            {"code": "bad_request", "message": "nope", "requestId": "req123"},
        )

    def test_missing_request_id_degrades_to_empty_string(self):
        h = Handler.__new__(Handler)  # _request_id never set
        e = h._error_envelope("x", "y")
        self.assertEqual(e["requestId"], "")
        self.assertEqual(e["error"]["requestId"], "")


if __name__ == "__main__":
    unittest.main(verbosity=2)
