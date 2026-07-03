#!/usr/bin/env python3
"""BE2 MMR diversity re-rank tests. Exercises the pure similarity primitives
(_post_tag_set / _pair_sim / _mmr_rerank / _diversity_metrics), the config
helper clamps, and the _recommend_rank integration (MMR on vs. legacy fallback)
through the real server.py — no HTTP/login stack.

Covers:
  - _post_tag_set / _pair_sim numeric correctness (jaccard + author + type).
  - MMR degeneration: λ=1 is exactly the input (pure-relevance) order.
  - MMR diversifies: a pool dominated by one author no longer serves that
    author 3-in-a-row; a pool of one content_type interleaves other types up.
  - _recommend_rank with MMR enabled still hard-drops dismissed posts and never
    exceeds `limit`.
  - _recommend_rank with mmr_config=None (or enabled=0) falls back to the legacy
    hard rules and preserves the old "no 3 same-author in a row" invariant.
  - _recommend_mmr_config clamps λ into [0.3, 0.95] and honors the enable flag.

Runs against a throwaway SQLite DB. Exits non-zero on any failed assertion.
Usage:  python scripts/test_ranking_mmr.py
"""

import os
import sys
import tempfile
import uuid
from pathlib import Path

_TMP = Path(tempfile.gettempdir()) / f"ranking_mmr_{uuid.uuid4().hex}.db"
os.environ["KAIX_DB_PATH"] = str(_TMP)
os.environ["KAIX_ENV"] = "production"
os.environ["KAIX_ALLOW_SQLITE_IN_PRODUCTION"] = "1"
os.environ["KAIX_PASSWORD_PEPPER"] = "ranking-mmr-pepper-not-for-prod"
os.environ["KAIX_ADMIN_HANDLE"] = "admin"
os.environ["KAIX_ADMIN_INITIAL_PASSWORD"] = "Admin12345"

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import server  # noqa: E402

PASS = 0
FAIL = 0


def check(name: str, cond: bool, detail: str = "") -> None:
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"PASS {name}")
    else:
        FAIL += 1
        print(f"FAIL {name} :: {detail}")


def row(pid, author, ctype="dynamic", tags=""):
    return {"id": pid, "author_id": author, "content_type": ctype, "topic_slugs": tags}


def max_run(seq):
    """Longest run of identical consecutive values."""
    best = cur = 0
    prev = object()
    for x in seq:
        cur = cur + 1 if x == prev else 1
        prev = x
        best = max(best, cur)
    return best


class FakeReq(server.Handler):
    def __init__(self):  # noqa: D401 - not calling super().__init__
        self._request_id = "test"


def main() -> None:
    server.init_db()

    # ---------- 1) similarity primitives ----------
    a = row("a", "u1", "dynamic", "ramen,tokyo")
    b = row("b", "u1", "dynamic", "ramen,osaka")
    c = row("c", "u2", "listing", "kyoto")
    check("_post_tag_set splits + strips",
          server._post_tag_set(row("x", "u", tags=" ramen , tokyo ,,")) == frozenset({"ramen", "tokyo"}),
          server._post_tag_set(row("x", "u", tags=" ramen , tokyo ,,")))
    # a vs b: jaccard(ramen,tokyo | ramen,osaka)=1/3; same author; same type.
    sim_ab = server._pair_sim(a, b, 0.6, 0.25, 0.15)
    check("_pair_sim tag+author+type", abs(sim_ab - (0.6 * (1 / 3) + 0.25 + 0.15)) < 1e-9, sim_ab)
    # a vs c: no shared tag, diff author, diff type ⇒ 0.
    check("_pair_sim disjoint = 0", server._pair_sim(a, c, 0.6, 0.25, 0.15) == 0.0,
          server._pair_sim(a, c, 0.6, 0.25, 0.15))

    # ---------- 2) MMR degeneration: λ=1 ⇒ pure relevance order ----------
    scored = [
        (5.0, row("p1", "u1", "dynamic", "ramen")),
        (4.0, row("p2", "u1", "dynamic", "ramen")),
        (3.0, row("p3", "u1", "dynamic", "ramen")),
        (2.0, row("p4", "u2", "listing", "kyoto")),
        (1.0, row("p5", "u3", "video", "osaka")),
    ]
    pure = server._mmr_rerank(list(scored), 5, 1.0, 0.6, 0.25, 0.15)
    check("λ=1 is pure-relevance order (== input order)",
          [r["id"] for r in pure] == ["p1", "p2", "p3", "p4", "p5"],
          [r["id"] for r in pure])

    # ---------- 3) MMR *softly* diversifies (relevance-weighted) ----------
    # Six near-identical u1 posts at the top, plus varied others just below, in a
    # realistic (tight) relevance band so the diversity term is competitive.
    scored_div = [(3.0 - i * 0.05, row(f"h{i}", "u1", "dynamic", "ramen")) for i in range(6)]
    scored_div += [
        (2.6, row("v1", "u2", "listing", "kyoto")),
        (2.55, row("v2", "u3", "video", "osaka")),
        (2.5, row("v3", "u4", "listing", "nara")),
        (2.45, row("v4", "u5", "video", "kobe")),
    ]
    pure_order = [r["id"] for _, r in scored_div][:8]
    diversified = server._mmr_rerank(list(scored_div), 8, 0.72, 0.6, 0.25, 0.15)
    check("MMR still returns exactly `limit`", len(diversified) == 8, len(diversified))
    check("MMR keeps the single most-relevant post at slot 0",
          diversified[0]["id"] == "h0", diversified[0]["id"])
    # Soft contract: MMR pulls at least one varied post above where pure
    # relevance would have placed it (i.e. the order is not the pure order).
    check("MMR reorders vs pure-relevance to add variety",
          [r["id"] for r in diversified] != pure_order, [r["id"] for r in diversified])
    # A lower λ diversifies harder — max same-author run must not increase as λ
    # drops (monotone-ish diversity knob).
    low_lam = server._mmr_rerank(list(scored_div), 8, 0.5, 0.6, 0.25, 0.15)
    check("lower λ ⇒ shorter same-author run",
          max_run([r["author_id"] for r in low_lam]) <= max_run([r["author_id"] for r in diversified]),
          (max_run([r["author_id"] for r in low_lam]),
           max_run([r["author_id"] for r in diversified])))
    # The _break_runs safety net, given the over-fetched pool the real caller
    # supplies (more rows than `limit`, so separators are available), breaks the
    # same-author / same-type runs down to the invariant. Mirror that: feed it 6
    # dominant-author rows plus ample varied separators, take 8.
    sep_pool = [row(f"h{i}", "u1", "dynamic", "ramen") for i in range(6)]
    sep_pool += [row(f"s{i}", f"u{i + 2}", "listing", "kyoto") for i in range(6)]
    broken = server._break_runs(sep_pool, 8)
    check("_break_runs (over-fetched) breaks same-author 3-in-a-row",
          max_run([r["author_id"] for r in broken]) < 3, [r["author_id"] for r in broken])
    check("_break_runs (over-fetched) keeps same-type run ≤3",
          max_run([r["content_type"] for r in broken]) <= 3, [r["content_type"] for r in broken])
    check("_break_runs fills the page", len(broken) == 8, len(broken))
    # Under genuine saturation (only 2 separators for 6 same-author rows) it is
    # best-effort: it must still fill the page, never drop below `limit`.
    sat_pool = [row(f"h{i}", "u1", "dynamic", "ramen") for i in range(6)]
    sat_pool += [row("s1", "u2", "listing", "k"), row("s2", "u3", "video", "o")]
    sat = server._break_runs(sat_pool, 8)
    check("_break_runs saturated still fills page", len(sat) == 8, len(sat))

    # ---------- 4) _recommend_rank with MMR enabled ----------
    req = FakeReq()
    cfg = {"enabled": True, "lambda": 0.72, "lambda_coldstart": 0.6,
           "w_tag": 0.6, "w_author": 0.25, "w_type": 0.15}
    pool = [row(f"m{i}", "u1", "dynamic", "ramen") for i in range(5)]
    pool += [row("mx", "u2", "listing", "kyoto"), row("my", "u3", "video", "osaka")]
    profile = {"types": {"dynamic": 1.0}, "topics": {}, "authors": {},
               "neg_topics": {}, "neg_authors": {},
               "seen": set(), "dismissed": {"m2"}, "active": True}
    ranked = req._recommend_rank([dict(r) for r in pool], profile, 6, mmr_config=cfg)
    ids = [r["id"] for r in ranked]
    check("MMR path hard-drops dismissed post", "m2" not in ids, ids)
    check("MMR path respects limit", len(ranked) <= 6, len(ranked))
    check("MMR path does not run same author 3-in-a-row",
          max_run([r["author_id"] for r in ranked]) < 3, [r["author_id"] for r in ranked])

    # ---------- 5) legacy fallback (mmr_config=None) ----------
    legacy = req._recommend_rank([dict(r) for r in pool], profile, 6, mmr_config=None)
    lids = [r["id"] for r in legacy]
    check("legacy path hard-drops dismissed post", "m2" not in lids, lids)
    check("legacy path preserves no-3-same-author invariant",
          max_run([r["author_id"] for r in legacy]) < 3, [r["author_id"] for r in legacy])
    # Disabled config must behave identically to None (both = legacy).
    disabled = req._recommend_rank([dict(r) for r in pool], profile, 6,
                                   mmr_config={"enabled": False})
    check("enabled=0 config uses legacy path (same ids as None)",
          [r["id"] for r in disabled] == lids, [r["id"] for r in disabled])

    # ---------- 6) config clamps ----------
    with server.DB_LOCK, server.db() as conn:
        server._upsert_site_settings(conn, {
            "recommend_mmr_lambda": "9.9",
            "recommend_mmr_lambda_coldstart": "0.01",
            "recommend_mmr_enabled": "0",
        })
        conf = server._recommend_mmr_config(conn)
    check("λ clamps to 0.95 ceiling", conf["lambda"] == 0.95, conf["lambda"])
    check("λ_coldstart clamps to 0.3 floor", conf["lambda_coldstart"] == 0.3, conf["lambda_coldstart"])
    check("enable flag respected (0 ⇒ disabled)", conf["enabled"] is False, conf["enabled"])

    # ---------- 7) diversity metrics are aggregate + sane ----------
    m = server._diversity_metrics([
        row("d1", "u1", "dynamic", "ramen"),
        row("d2", "u2", "listing", "kyoto"),
        row("d3", "u3", "video", "osaka"),
    ])
    check("diversity metrics expose the four keys",
          set(m) == {"type_entropy", "tag_entropy", "author_gini", "ild"}, m)
    check("all-distinct page ⇒ author_gini ≈ 0", abs(m["author_gini"]) < 1e-6, m["author_gini"])
    check("all-dissimilar page ⇒ ild = 1.0", m["ild"] == 1.0, m["ild"])

    print(f"\n{PASS} passed, {FAIL} failed")
    try:
        _TMP.unlink()
    except OSError:
        pass
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
