#!/usr/bin/env python3
import base64
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

os.environ.setdefault("KAIX_ENABLE_SCHEDULERS", "0")
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import server  # noqa: E402


class PrivateMediaEncryptionTests(unittest.TestCase):
    def setUp(self):
        self.key = base64.urlsafe_b64encode(bytes(range(32))).decode("ascii")

    def test_chunked_round_trip_and_ciphertext_is_not_plaintext(self):
        plain = (b"private-machi-media\x00" * 4096) + b"end"
        with patch.object(server, "PRIVATE_MEDIA_KEY_B64", self.key):
            encryptor, iv = server.private_media_encryptor(bytes(range(12)))
            cipher = encryptor.update(plain[:30001])
            cipher += encryptor.update(plain[30001:])
            cipher += encryptor.finalize()
            metadata = {
                "encryption": server.private_media_encryption_metadata(iv, encryptor.tag),
            }
            decryptor = server.private_media_decryptor(metadata)
            restored = decryptor.update(cipher[:17333])
            restored += decryptor.update(cipher[17333:])
            restored += decryptor.finalize()
        self.assertNotEqual(cipher, plain)
        self.assertEqual(restored, plain)
        self.assertEqual(len(cipher), len(plain))

    def test_wrong_key_fails_integrity_check(self):
        plain = b"paid guide document"
        with patch.object(server, "PRIVATE_MEDIA_KEY_B64", self.key):
            encryptor, iv = server.private_media_encryptor()
            cipher = encryptor.update(plain) + encryptor.finalize()
            metadata = {
                "encryption": server.private_media_encryption_metadata(iv, encryptor.tag),
            }
        wrong_key = base64.urlsafe_b64encode(b"x" * 32).decode("ascii")
        with patch.object(server, "PRIVATE_MEDIA_KEY_B64", wrong_key):
            decryptor = server.private_media_decryptor(metadata)
            decryptor.update(cipher)
            with self.assertRaises(Exception):
                decryptor.finalize()

    def test_missing_or_malformed_metadata_is_rejected(self):
        with patch.object(server, "PRIVATE_MEDIA_KEY_B64", self.key):
            with self.assertRaises(server.APIError) as missing:
                server.private_media_decryptor({})
            self.assertEqual(missing.exception.code, "private_media_encryption_missing")
            with self.assertRaises(server.APIError) as malformed:
                server.private_media_decryptor({
                    "encryption": {
                        "algorithm": server.PRIVATE_MEDIA_CIPHER,
                        "version": server.PRIVATE_MEDIA_CIPHER_VERSION,
                        "iv": "bad",
                        "tag": "bad",
                    }
                })
            self.assertEqual(malformed.exception.code, "private_media_encryption_invalid")

    def test_public_base_url_overrides_proxy_inference(self):
        handler = server.Handler.__new__(server.Handler)
        handler.headers = {"Host": "127.0.0.1:8899"}
        with patch.object(server, "PUBLIC_BASE_URL", "http://127.0.0.1:8899"):
            self.assertEqual(handler._request_base_url(), "http://127.0.0.1:8899")

    def test_private_view_url_is_limited_to_ready_private_uploads(self):
        handler = server.Handler.__new__(server.Handler)
        handler.require_user = MagicMock(return_value={"id": "user-1", "role": "user"})
        handler._uploaded_file_for_user = MagicMock(return_value={
            "id": "file-1",
            "user_id": "user-1",
            "purpose": "message_file",
            "status": "ready",
        })
        handler._private_download_url = MagicMock(return_value="/api/uploads/download/file-1?token=signed")
        handler.send_json = MagicMock()
        conn = MagicMock()
        with patch.object(server, "record_upload_audit") as audit:
            handler.api_upload_private_view_url(conn, "file-1")
        handler.send_json.assert_called_once()
        payload = handler.send_json.call_args.args[0]
        self.assertEqual(payload["url"], "/api/uploads/download/file-1?token=signed")
        self.assertEqual(payload["expiresIn"], server.S3_PRIVATE_DOWNLOAD_EXPIRES_SECONDS)
        audit.assert_called_once()

        handler._uploaded_file_for_user.return_value = {
            "id": "file-2",
            "user_id": "user-1",
            "purpose": "post_image",
            "status": "ready",
        }
        with self.assertRaises(server.APIError) as public:
            handler.api_upload_private_view_url(conn, "file-2")
        self.assertEqual(public.exception.code, "private_upload_required")

        handler._uploaded_file_for_user.return_value = {
            "id": "file-3",
            "user_id": "user-1",
            "purpose": "message_file",
            "status": "pending",
        }
        with self.assertRaises(server.APIError) as pending:
            handler.api_upload_private_view_url(conn, "file-3")
        self.assertEqual(pending.exception.code, "file_not_ready")


if __name__ == "__main__":
    unittest.main(verbosity=2)
