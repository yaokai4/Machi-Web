"""Content deny-list folding tests (H6): obfuscation-resistant matching.

Run: python3 scripts/test_content_policy.py
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("KAIX_DB_PATH", "/tmp/kaix_content_policy_test.db")
os.environ.setdefault("KAIX_BANNED_WORDS", "child porn,办理证件")

import server  # noqa: E402


class ContentPolicyTests(unittest.TestCase):
    def test_plain_match(self):
        self.assertTrue(server.content_policy_reason("我能代开发票吗"))
        self.assertTrue(server.content_policy_reason("buy child porn here"))

    def test_obfuscation_resistant(self):
        # spaced-out, full-width, zero-width, accented, punctuated variants
        for evil in ["c h i l d   p o r n", "ｃｈｉｌｄ　ｐｏｒｎ", "child​porn",
                     "child.porn!!", "代 开 发 票", "办-理-证-件"]:
            self.assertTrue(server.content_policy_reason(evil), f"should flag {evil!r}")

    def test_clean_text_passes(self):
        for ok in ["hello world", "childhood reporting season", "我想办理银行卡开户预约", ""]:
            self.assertFalse(server.content_policy_reason(ok), f"should NOT flag {ok!r}")

    def test_enforce_raises(self):
        with self.assertRaises(server.APIError) as ctx:
            server.enforce_content_policy("代开发票")
        self.assertEqual(ctx.exception.code, "content_policy_violation")
        server.enforce_content_policy("a normal sentence")  # no raise


if __name__ == "__main__":
    unittest.main()
