# JLPT v2 Trusted Question Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single-source, fail-closed, resumable validation and staging pipeline for approximately 1,000 approved unique N1 and N2 questions without promoting the current raw N1 candidates.

**Architecture:** A JSON contract owns schemas, paper specs, run parameters, and release gates. A pure Python contract module derives validation and content identity; one CLI manages atomic run manifests, receipts, staging, signed publication, rollback, and the read-only legacy audit. The JavaScript generator consumes the contract snapshot emitted by the CLI instead of duplicating paper constants.

**Tech Stack:** Python 3 standard library, `unittest`, JSON Schema documents, JavaScript workflow source, atomic JSON files.

## Global Constraints

- Work only in `/Users/yaokai/Code/IT/IOS/kaizi/web/.worktrees/jlpt-core-hardening` after `d3c6e99`.
- Do not generate question content or claim raw candidates are verified.
- N1 and N2 each require at least 1,000 approved unique staged questions before publish.
- Keep the existing two-independent-reviewer unanimous quality gate.
- Preserve `data/jlpt_bank_v1.json` and all `mockv1-*` IDs.
- All mutating writes are atomic; validation failure returns non-zero and preserves prior artifacts.
- Legacy N1 conversion is dry-run only and remains pending without receipt/signature evidence.

---

### Task 1: Authoritative contract and stable identity

**Files:**
- Create: `scripts/jlpt_gen/jlpt_contract_v2.json`
- Create: `scripts/jlpt_gen/jlpt_contract_v2.py`
- Create: `scripts/test_jlpt_pipeline_v2.py`
- Modify: `scripts/jlpt_gen/assemble_bank.py`
- Modify: `scripts/jlpt_gen/jlpt_bank_gen_v2.js`

**Interfaces:**
- Produces: `load_contract()`, `contract_sha256()`, `validate_run_request()`, `sanitize_pool()`, `question_identity()`, and `group_identity()`.
- Produces normalized records with `id`, `groupId`, `contentHash`, and `reviewStatus="pending"`.

- [ ] Add failing tests proving Python paper maps derive from JSON, JavaScript has no object-literal `PAPER` copy, missing contract/run arguments fail, option reorder preserves ID/hash, and semantic/answer/explanation changes update `contentHash`.
- [ ] Run the focused tests and confirm missing module/contract failures.
- [ ] Add the JSON contract with question/run/receipt schemas, qtypes, paper spec, section durations, quality gate, and N1/N2 1,000 release floors.
- [ ] Implement strict contract loading, schema subset validation, canonicalization, group/question ID, content hash, duplicate/conflict detection, and pool sanitization.
- [ ] Refactor `assemble_bank.py` to derive compatibility constants from the contract and refactor JavaScript to consume `args.contract` plus strict `level/group/wave` values.
- [ ] Run focused identity/contract tests and the existing generator suite.

### Task 2: Fail-closed run CLI and resumable manifest

**Files:**
- Create: `scripts/jlpt_gen/jlpt_pipeline_v2.py`
- Modify: `scripts/test_jlpt_pipeline_v2.py`

**Interfaces:**
- Produces CLI subcommands `init-run`, `ingest`, and `verify`.
- Produces atomic run artifacts `request.json`, `raw.json`, `sanitized.json`, `rejected.json`, `verified.json`, `metrics.json`, `receipt.json`, and `manifest.json`.

- [ ] Add failing real-CLI tests for invalid/missing level/group/wave, empty/parser-invalid input, field failures, broken atomic groups, duplicate conflicts, immutable-source tampering, and target preservation.
- [ ] Add failing resume tests: identical init/ingest is idempotent; changed request/source/contract/artifact fails non-zero.
- [ ] Add failing receipt tests for missing receipt, one reviewer, duplicate reviewer, disagreement, fatal verdict, wrong answer, source/contract mismatch, and qualifying unanimous review.
- [ ] Implement atomic manifest transitions with artifact SHA-256/count metadata and provenance/workflow/source/receipt hashes.
- [ ] Implement strict CLI error JSON on stderr with exit code 2; never use fallback run parameters.
- [ ] Run the entire new CLI test class and confirm every failure path preserves pre-existing bytes.

### Task 3: Pending staging, human signature publish, and rollback

**Files:**
- Modify: `scripts/jlpt_gen/jlpt_pipeline_v2.py`
- Modify: `scripts/test_jlpt_pipeline_v2.py`

**Interfaces:**
- Produces CLI subcommands `stage`, `publish`, and `rollback`.
- Produces release `manifest.json`, `candidate.json`, `diff.json`, `rollback/previous.json`, and signed state transitions.

- [ ] Add failing tests showing stage only accepts hash-valid verified artifacts, deduplicates equal identity/content, rejects identity conflicts, and enforces N1/N2 minimums.
- [ ] Add failing tests proving stage is pending and target bytes remain unchanged.
- [ ] Add failing publish tests for absent/malformed/mismatched human signature, `mockv1` IDs, v1 target path/source, and target changed after diff.
- [ ] Implement deterministic candidate/diff creation and signature validation with exact release/candidate/contract hashes.
- [ ] Add failing rollback tests for absent/mismatched signature and current-target tampering; implement exact prior-target restoration only after hash verification.
- [ ] Run staging/publish/rollback tests and inspect all temp target hashes.

### Task 4: Tracked N1 legacy audit and conversion dry-run

**Files:**
- Modify: `scripts/jlpt_gen/jlpt_pipeline_v2.py`
- Modify: `scripts/test_jlpt_pipeline_v2.py`
- Create: `docs/JLPT_N1_LEX_V2_DRY_RUN_AUDIT_2026-07-22.json`

**Interfaces:**
- Produces `audit-legacy --source ... --report ...`.
- Produces six counts: `raw`, `sanitized`, `unique`, `verified`, `approved`, `staged`.

- [ ] Add a failing test against tracked `N1-lex.json` requiring source hash, deterministic conversion hash, exact raw/qtype/group metrics, explicit missing N1-rc/N2 evidence, and zero verified/approved/staged.
- [ ] Implement read-only legacy audit; report all schema/group/identity rejections without creating a run, receipt, candidate, or published bank.
- [ ] Run the audit twice and prove the input hash and report conversion hash are unchanged.
- [ ] Generate the checked-in compact audit report and manually inspect its six evidence counts and omissions.

### Task 5: Final verification and commit

**Files:**
- Verify all scoped files.

**Interfaces:**
- Consumes Tasks 1–4 and produces a reviewable commit on `codex/jlpt-core-hardening-20260722`.

- [ ] Run `python3 scripts/test_jlpt_pipeline_v2.py` and record count/failures.
- [ ] Run `python3 scripts/test_jlpt_gen_tools.py` and related JLPT resume regression.
- [ ] Run Python compilation, `node --check scripts/jlpt_gen/jlpt_bank_gen_v2.js`, `git diff --check`, and status/stat checks.
- [ ] Re-read the design and every global constraint; inspect the generated N1 audit and verify N2 remains zero.
- [ ] Request a read-only code review if a collaboration slot becomes available and address valid findings.
- [ ] Commit only the scoped trusted-pipeline files and report commit hash, tests, six counts, and residual content gaps.
