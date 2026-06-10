#!/usr/bin/env python3
import io
import os
import sys
import unittest
from pathlib import Path

os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402


class UploadThumbnailTests(unittest.TestCase):
    def test_builds_bounded_webp_thumbnail(self):
        from PIL import Image

        source = Image.new("RGB", (2400, 1200), (32, 96, 180))
        raw = io.BytesIO()
        source.save(raw, format="PNG")

        thumbnail, width, height = server._build_image_thumbnail(raw.getvalue(), max_edge=640)

        self.assertEqual((width, height), (640, 320))
        self.assertLess(len(thumbnail), len(raw.getvalue()))
        with Image.open(io.BytesIO(thumbnail)) as rendered:
            self.assertEqual(rendered.format, "WEBP")
            self.assertEqual(rendered.size, (640, 320))

    def test_only_public_ready_images_are_eligible(self):
        base = {
            "content_type": "image/jpeg",
            "purpose": "post_image",
            "status": "ready",
            "object_key": "posts/image.jpg",
        }
        self.assertTrue(server.thumbnail_eligible(base))
        self.assertFalse(server.thumbnail_eligible({**base, "purpose": "message_image"}))
        self.assertFalse(server.thumbnail_eligible({**base, "content_type": "video/mp4"}))
        self.assertFalse(server.thumbnail_eligible({**base, "status": "pending"}))

    def test_upload_magic_rejects_spoofed_public_image(self):
        with self.assertRaises(server.APIError) as spoofed:
            server.validate_upload_magic(b"<html>not an image</html>", "image/jpeg")
        self.assertEqual(spoofed.exception.code, "mime_mismatch")
        self.assertEqual(
            server.validate_upload_magic(b"\xff\xd8\xff\xe0" + (b"\x00" * 32), "image/jpeg"),
            "image/jpeg",
        )

    def test_video_media_dto_uses_uploaded_thumbnail_metadata(self):
        row = {
            "id": "file_video",
            "user_id": "user_1",
            "bucket": "local-dev",
            "object_key": "listings/secondhand/demo/videos/demo.mp4",
            "public_url": "/media/listings/secondhand/demo/videos/demo.mp4",
            "cdn_url": "/media/listings/secondhand/demo/videos/demo.mp4",
            "content_type": "video/mp4",
            "file_size": 1234,
            "file_type": "video",
            "purpose": "secondhand_video",
            "entity_type": "listing",
            "entity_id": "listing_1",
            "status": "ready",
            "metadata": {
                "thumbnail_file_id": "file_thumb",
                "thumbnail_url": "/media/videos/thumbnails/file_thumb.jpg",
                "poster_url": "/media/videos/thumbnails/file_thumb.jpg",
                "duration_seconds": 12.5,
            },
            "width": 1280,
            "height": 720,
            "duration": 12.5,
            "created_at": "2026-06-09T00:00:00+00:00",
            "updated_at": "2026-06-09T00:00:00+00:00",
            "deleted_at": None,
        }

        media = server.uploaded_file_as_media(row)

        self.assertEqual(media["type"], "video")
        self.assertEqual(media["thumbnailUrl"], "/media/videos/thumbnails/file_thumb.jpg")
        self.assertEqual(media["posterUrl"], "/media/videos/thumbnails/file_thumb.jpg")
        self.assertEqual(server.listing_media_thumbnail_url(media), "/media/videos/thumbnails/file_thumb.jpg")


if __name__ == "__main__":
    unittest.main(verbosity=2)
