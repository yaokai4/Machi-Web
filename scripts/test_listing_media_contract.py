#!/usr/bin/env python3
"""Regression coverage for listing upload purposes and PostgreSQL-safe SQL."""

from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402


class ListingMediaContractTests(unittest.TestCase):
    def test_rich_secondhand_attributes_survive_normalization(self) -> None:
        raw = {
            "listing_mode": "sale",
            "condition": "good",
            "original_price": "28000",
            "price_negotiable": True,
            "purchase_time": "2025 spring",
            "accessories": "box, charger",
            "defect_note": "minor scratch",
            "available_time": "weekends",
            "pickup_note": "station meetup",
        }
        normalized = server.normalize_listing_attributes("secondhand", raw)
        self.assertEqual(set(normalized), set(raw))
        self.assertEqual(normalized["price_negotiable"], ("true", "bool"))

    def test_lodging_inventory_attributes_survive_normalization(self) -> None:
        raw = {
            "room_type": "double",
            "max_guests": 2,
            "minimum_stay": "2 nights",
            "amenities": "wifi, kitchen",
            "inventory_note": "weekends limited",
            "breakfast_included": True,
            "instant_confirmation": True,
        }
        normalized = server.normalize_listing_attributes("local_service", raw)
        # The real guarantee: no lodging attribute is dropped by normalization.
        self.assertTrue(
            set(raw).issubset(set(normalized)),
            f"lodging attributes were dropped: {set(raw) - set(normalized)}",
        )
        # local_service normalization additionally DERIVES a `service_vertical`
        # tag (here: "lodging") used for vertical-specific attribute filtering.
        # That derived key is the only addition; assert it explicitly so the
        # contract stays honest instead of loosened.
        self.assertEqual(set(normalized) - set(raw), {"service_vertical"})
        self.assertEqual(normalized["service_vertical"], ("lodging", "string"))
        self.assertEqual(normalized["max_guests"], ("2", "int"))

    def test_listing_update_replaces_attributes_and_media(self) -> None:
        source = Path(server.__file__).read_text(encoding="utf-8")
        update_source = source[source.index("    def api_update_listing("):source.index("    def api_delete_listing(")]
        self.assertIn("DELETE FROM listing_attributes WHERE listing_id = ?", update_source)
        self.assertIn('media_changed = "media_ids" in data or "mediaIds" in data', update_source)
        self.assertIn("DELETE FROM listing_media WHERE listing_id = ?", update_source)

    def test_every_listing_image_purpose_has_a_video_pair(self) -> None:
        for listing_type, image_purpose in server.LISTING_PURPOSE_BY_TYPE.items():
            video_purpose = server.LISTING_VIDEO_PURPOSE_BY_TYPE[listing_type]
            self.assertEqual(server.UPLOAD_PURPOSES[image_purpose]["kind"], "image")
            self.assertEqual(server.UPLOAD_PURPOSES[video_purpose]["kind"], "video")
            self.assertEqual(server.UPLOAD_PURPOSES[video_purpose]["count"], 1)

    def test_listing_object_keys_separate_images_and_videos(self) -> None:
        image_key = server.upload_object_key(
            "user-1", "secondhand_image", "listing", "draft-1", "image/jpeg"
        )
        video_key = server.upload_object_key(
            "user-1", "secondhand_video", "listing", "draft-1", "video/mp4"
        )
        self.assertIn("/images/", image_key)
        self.assertIn("/videos/", video_key)
        self.assertTrue(video_key.endswith(".mp4"))

    def test_seller_profile_upsert_qualifies_listing_count(self) -> None:
        source = Path(server.__file__).read_text(encoding="utf-8")
        self.assertIn("seller_profiles.listing_count + 1", source)
        self.assertIn("verification_status, listing_count, created_at", source)
        self.assertNotIn("listing_count = listing_count + 1", source)

    def test_seller_profile_user_id_has_explicit_unique_index(self) -> None:
        migration = next(sql for version, _, sql in server.MIGRATIONS if version == 39)
        self.assertIn("CREATE UNIQUE INDEX", migration)
        self.assertIn("seller_profiles(user_id)", migration)

    def test_presign_mime_falls_back_to_filename_for_mobile_empty_types(self) -> None:
        self.assertEqual(server.canonical_upload_mime("rental_image", "", "room.JPG"), "image/jpeg")
        self.assertEqual(server.canonical_upload_mime("secondhand_video", "application/octet-stream", "demo.MP4"), "video/mp4")
        self.assertEqual(server.canonical_upload_mime("guide_product_file", "application/x-pdf", "guide.pdf"), "application/pdf")

    def test_presign_mime_rejects_explicit_wrong_type_even_with_image_name(self) -> None:
        with self.assertRaises(server.APIError) as ctx:
            server.canonical_upload_mime("rental_image", "text/plain", "room.jpg")
        self.assertEqual(ctx.exception.code, "unsupported_upload_type")

    def test_listing_fallback_image_is_generated_by_backend(self) -> None:
        url = server.listing_image_fallback("secondhand", base_url="https://machicity.com")
        self.assertTrue(url.startswith("https://machicity.com/api/generated/listing-card.png"))
        self.assertNotIn("images.unsplash.com", url)
        png = server.generated_listing_card_png("secondhand")
        self.assertTrue(png.startswith(b"\x89PNG\r\n\x1a\n"))
        svg = server.generated_listing_card_svg("rental")
        self.assertIn("<svg", svg)
        self.assertIn("Machi", svg)
        self.assertIn("租房", svg)


if __name__ == "__main__":
    unittest.main(verbosity=2)
