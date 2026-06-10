#!/usr/bin/env python3
"""Regression tests for legacy post-media type reconciliation."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import server  # noqa: E402


class PostMediaTypeTests(unittest.TestCase):
    def test_video_mime_wins_over_legacy_image_link(self) -> None:
        self.assertEqual(
            server.canonical_post_media_type("video", "video/mp4", "image"),
            "video",
        )

    def test_image_mime_wins_over_stale_file_link(self) -> None:
        self.assertEqual(
            server.canonical_post_media_type("image", "image/jpeg", "file"),
            "image",
        )

    def test_link_type_is_fallback_for_unknown_object(self) -> None:
        self.assertEqual(
            server.canonical_post_media_type("file", "application/pdf", "video"),
            "video",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
