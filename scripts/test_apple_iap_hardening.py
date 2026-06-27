"""Apple IAP verification hardening tests (C1 + C2) — pure crypto, no network.

Proves a FORGED StoreKit2 transaction (self-signed leaf, or a chain whose root
is not Apple's) is REJECTED in production, regardless of the payload's claimed
`environment`, while the non-production Sandbox/Xcode QA path still accepts it.

  C1: verify_apple_transaction must not trust payload.environment to skip the
      signature requirement — the SERVER config decides; PRODUCTION always
      requires a valid signature.
  C2: _verify_apple_jws_signature must validate the x5c chain up to a pinned
      Apple Root CA G3 — an attacker-supplied leaf/root must not pass.

Run: python3 scripts/test_apple_iap_hardening.py
"""
import base64
import datetime
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("KAIX_DB_PATH", "/tmp/kaix_apple_iap_test.db")

import server  # noqa: E402

from cryptography import x509  # noqa: E402
from cryptography.x509.oid import NameOID  # noqa: E402
from cryptography.hazmat.primitives import hashes, serialization  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import ec  # noqa: E402
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature  # noqa: E402


def _b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _make_cert(cn: str, signer_key=None, signer_cert=None):
    """Self-signed when no signer is given, else signed by (signer_key, signer_cert)."""
    key = ec.generate_private_key(ec.SECP256R1())
    subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, cn)])
    issuer = signer_cert.subject if signer_cert else subject
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=365))
        .sign(signer_key or key, hashes.SHA256())
    )
    return key, cert


def _forge_jws(leaf_key, chain_certs, payload: dict) -> str:
    x5c = [base64.b64encode(c.public_bytes(serialization.Encoding.DER)).decode() for c in chain_certs]
    header = {"alg": "ES256", "x5c": x5c}
    h = _b64url(json.dumps(header).encode())
    p = _b64url(json.dumps(payload).encode())
    der_sig = leaf_key.sign(f"{h}.{p}".encode(), ec.ECDSA(hashes.SHA256()))
    r, s = decode_dss_signature(der_sig)
    raw = r.to_bytes(32, "big") + s.to_bytes(32, "big")
    return f"{h}.{p}.{_b64url(raw)}"


PASS = 0
def check(cond, msg):
    global PASS
    assert cond, "FAIL: " + msg
    PASS += 1
    print("  ok:", msg)


# A forged transaction claiming Sandbox, for the most expensive product.
payload = {"environment": "Sandbox", "productId": "machi.points.large",
           "transactionId": "forged-001", "bundleId": server.APPLE_IAP_BUNDLE_ID or "com.yaokai.kaizi"}

leaf_key, leaf = _make_cert("Forged Leaf")                       # self-signed leaf
single = _forge_jws(leaf_key, [leaf], payload)

root_key, fake_root = _make_cert("Not Apple Root")               # attacker's own "root"
chained_key, chained_leaf = _make_cert("Forged Leaf 2", root_key, fake_root)
chained = _forge_jws(chained_key, [chained_leaf, fake_root], payload)

orig = (server.PRODUCTION, server.PAYMENT_MOCK_ENABLED, server.APPLE_IAP_ENVIRONMENT)
try:
    # --- Production: every forgery must be rejected (C1 + C2) ---
    server.PRODUCTION = True
    server.PAYMENT_MOCK_ENABLED = False
    server.APPLE_IAP_ENVIRONMENT = "Production"
    check(server.verify_apple_transaction(single) is None,
          "C1/C2 prod rejects self-signed leaf JWS claiming environment=Sandbox")
    check(server.verify_apple_transaction(chained) is None,
          "C2 prod rejects 2-cert chain whose root is not Apple's pinned root")

    # --- Non-prod Sandbox QA path still works (config-driven, not payload-driven) ---
    server.PRODUCTION = False
    server.APPLE_IAP_ENVIRONMENT = "Sandbox"
    server.PAYMENT_MOCK_ENABLED = False
    check(server.verify_apple_transaction(single) is not None,
          "non-prod Sandbox config still accepts unsigned QA transaction")

    # --- The signature verifier itself rejects a non-Apple chain ---
    h, p, s = chained.split(".")
    check(server._verify_apple_jws_signature(h, p, s) is False,
          "_verify_apple_jws_signature rejects a chain not rooted in Apple G3")
finally:
    server.PRODUCTION, server.PAYMENT_MOCK_ENABLED, server.APPLE_IAP_ENVIRONMENT = orig

print(f"\nALL {PASS} Apple IAP hardening checks passed.")
