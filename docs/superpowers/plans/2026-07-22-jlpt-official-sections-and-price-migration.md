# JLPT Official Sections and Price Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align generated JLPT paper contracts with the specified official item counts and section timings while preserving an administrator-set legacy parent price on the new first charging section.

**Architecture:** Keep the JavaScript generation quota and Python assembly quota explicit, with regression coverage proving their parity. Represent paper timing as an ordered per-level section layout: N1/N2 use `written, listening`; N3/N4/N5 use `vocab, grammar_reading, listening`. Before seeding any generated exam row, snapshot all existing rows for that paper so a legacy parent-only price can be moved atomically in seed order without being erased first.

**Tech Stack:** Python 3 standard library and `unittest`; JavaScript workflow source; SQLite-compatible seed/runtime contracts.

## Global Constraints

- Work only in `/Users/yaokai/Code/IT/IOS/kaizi/web/.worktrees/jlpt-core-hardening`.
- Preserve unrelated user changes and do not touch other worktrees.
- N1 listening paper counts are exactly `5, 6, 5, 11, 3` for task, point, gist, response, integrated.
- N2 includes exactly 5 `word_formation` questions in a paper.
- N3/N4/N5 sections and durations are `30/70/40`, `25/55/35`, and `20/40/30` minutes.
- N1/N2 remain two sections.
- Parent and listening rows remain free; only the first section carries the paper price.
- A parent-only legacy price is captured before the parent row is reset and transferred to the newly created first section.

---

### Task 1: Official item and cross-language generation contract

**Files:**
- Modify: `scripts/test_jlpt_gen_tools.py`
- Modify: `scripts/jlpt_gen/assemble_bank.py`
- Modify: `scripts/jlpt_gen/jlpt_bank_gen_v2.js`

**Interfaces:**
- Consumes: `assemble_bank.PAPER`, `QTYPE_ORDER`, `ABBREV`, `SECTION_OF`.
- Produces: the `word_formation` qtype and corrected N1/N2 paper quotas in both languages.

- [x] Add failing assertions for N1 listening `5/6/5/11/3`, N2 `word_formation=5`, and JavaScript/Python contract parity.
- [x] Run the focused contract test and confirm it fails because the old quotas/qtype remain.
- [x] Add `word_formation` to JS `NEEDS`, `PAPER`, lexical ordering, section mapping, and prompt specification; add it to Python `PAPER`, order, abbreviation, and section mapping; update N1 listening.
- [x] Run the focused contract and canonical assembly tests and confirm they pass.

### Task 2: Official ordered section manifests

**Files:**
- Modify: `scripts/test_jlpt_gen_tools.py`
- Modify: `scripts/jlpt_gen/assemble_bank.py`
- Modify: `jlpt_seed.py`

**Interfaces:**
- Consumes: question-level canonical section (`vocab`, `grammar`, `reading`, `listening`).
- Produces: ordered manifest sections named `written`, `vocab`, `grammar_reading`, and `listening`, depending on level.

- [x] Change the manifest test first to require two N1/N2 sections and three N3/N4/N5 sections with current official durations and exact question partitioning.
- [x] Run the focused manifest test and confirm the existing two-section implementation fails.
- [x] Replace the two-bucket assembler with per-level ordered layouts and route qtypes into the correct manifest section.
- [x] Generalize `_mock_paper_exam_payloads` validation and payload creation to accept the level's exact ordered layout; price only the first section.
- [x] Update seed and runtime round-trip fixtures for both a two-section and a three-section paper, then confirm focused tests pass.

### Task 3: Legacy parent-only price transfer

**Files:**
- Modify: `scripts/test_jlpt_gen_tools.py`
- Modify: `jlpt_seed.py`

**Interfaces:**
- Consumes: existing `jlpt_exams` rows with `id`, `kind`, and `coin_cost`.
- Produces: explicit seed payload pricing that preserves an existing charging-section price or moves a legacy parent price to a missing first section.

- [x] Add `test_full_paper_upgrade_moves_legacy_parent_price_to_new_first_section` using a stateful fake connection that updates rows on each real seed upsert boundary.
- [x] Run the focused test and confirm the current seed changes `777` to the default price.
- [x] Snapshot every relevant existing exam row before the first upsert; choose the first manifest section as the sole charging row; move a legacy `kind='mock'` parent price only when that charging child does not yet exist.
- [x] Keep parent/listening/noncharging children at explicit zero and preserve an already-existing charging child's own administrator price.
- [x] Run the focused price tests and confirm fresh, refresh, and legacy-upgrade cases pass.

### Task 4: Verification and commit

**Files:**
- Verify all modified files.

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: one reviewable commit based on `6698c8540401d3828b4caa7e38d401a12fa4de84`.

- [x] Run `python3 scripts/test_jlpt_gen_tools.py` and record the complete passing count.
- [x] Run related JLPT price/runtime regressions available in this checkout.
- [x] Run Python compilation, JavaScript syntax checking, `git diff --check`, and inspect `git diff --stat`/`git status`.
- [x] Re-read every global constraint against the diff and document any content-generation or integration boundary that remains.
- [x] Commit only the scoped files with a concise JLPT contract message.
