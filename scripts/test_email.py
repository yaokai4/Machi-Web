#!/usr/bin/env python3
"""Send a test email through the configured transport to verify delivery.

Reads the recipient from --to (or the KAIX_TEST_EMAIL env var). Prints only
the transport and a MASKED recipient — never the subject, body, or any code.
For the default `console_file` transport the message is written to the dev
outbox instead of being sent over the network.

Usage:
    KAIX_EMAIL_TRANSPORT=smtp KAIX_SMTP_HOST=... \\
        python3 scripts/test_email.py --to you@example.com
    python3 scripts/test_email.py --to you@example.com --verification
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import server  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Send a test email via the configured transport.")
    parser.add_argument(
        "--to",
        default=os.environ.get("KAIX_TEST_EMAIL", ""),
        help="Recipient address (or set KAIX_TEST_EMAIL).",
    )
    parser.add_argument(
        "--verification",
        action="store_true",
        help="Send a sample verification-code email (code generated locally, never printed).",
    )
    args = parser.parse_args()

    to = (args.to or "").strip()
    if not server.is_valid_email(to):
        print("error: provide a valid recipient via --to or KAIX_TEST_EMAIL", file=sys.stderr)
        sys.exit(2)

    print(f"transport={server.EMAIL_TRANSPORT} -> {server.mask_email(to)} (sending...)")
    if args.verification:
        # Generated and consumed locally; the value is never surfaced.
        code = server.generate_numeric_code()
        ok = server.send_verification_email(to, code, purpose="register", locale="zh")
    else:
        ok = server.send_email(
            to,
            "Machi 邮件测试 / Email test",
            "这是一封来自 Machi 后端的测试邮件。\n"
            "This is a test email from the Machi backend.\n",
        )

    if ok:
        print("result: accepted by transport")
        if server.EMAIL_TRANSPORT == "console_file":
            print(f"note: console_file transport wrote the message to {server.DEV_OUTBOX_DIR}")
    else:
        print(
            "result: FAILED — check transport config "
            "(KAIX_EMAIL_TRANSPORT / KAIX_SMTP_* / KAIX_RESEND_API_KEY)",
            file=sys.stderr,
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
