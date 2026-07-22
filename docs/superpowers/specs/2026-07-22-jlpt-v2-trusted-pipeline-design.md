# JLPT v2 Trusted Question Pipeline Design

**Date:** 2026-07-22

## Goal and evidence boundary

Build a fail-closed, resumable pipeline that can eventually stage about 1,000
approved unique questions for each of N1 and N2 without lowering the existing
two-reviewer unanimous quality gate. The currently tracked N1 lex file contains
1,039 raw candidates only. It has no v2 provenance or approval receipt, so this
work may audit and convert it in memory but must report zero verified, approved,
and staged questions. No N2 v2 input exists, so every N2 count remains zero.

The pipeline never generates question content. It validates artifacts produced
elsewhere and preserves the legacy `mockv1-*` bank unchanged.

## Considered approaches

1. **Extend `assemble_bank.py` into a release tool.** This minimizes files, but
   couples paper composition, identity, review evidence, and publication in an
   already large module. A failure would be difficult to isolate or resume.
2. **Single JSON contract plus focused Python trust layer (selected).** One
   authoritative JSON document owns schemas, qtype metadata, paper composition,
   first-phase targets, and quality gates. Python loads it for validation and
   identity; JavaScript consumes the exact contract snapshot emitted in a run
   request. A separate CLI owns atomic run and staging state.
3. **Database-backed workflow service.** It provides richer concurrency, but is
   unnecessary for the current local, review-before-release workflow and adds a
   deployment surface before content has passed its first audit.

## Components

### Authoritative contract

`scripts/jlpt_gen/jlpt_contract_v2.json` is the only editable source for:

- raw question JSON Schema and conditional qtype/group requirements;
- qtype abbreviations, canonical sections, grouping mode, and paper counts;
- official ordered section names and durations;
- allowed run parameters (`N1|N2`, `lex|rc`, positive integer wave);
- first-phase release floor: 1,000 approved unique staged questions per level;
- quality gate: at least two independent reviewers, unanimous acceptance, no
  fatal verdict, and agreement with the authored answer.

`jlpt_contract_v2.py` loads and self-validates this file, exposes derived paper
maps to `assemble_bank.py`, and computes the contract SHA-256. The JavaScript
workflow receives `args.contract` from the CLI-generated request. Missing or
malformed contract/run values stop the workflow instead of falling back to N1,
lex, or wave 1.

### Stable identity and revision hashes

Canonical text uses Unicode NFKC, normalizes line endings, trims each line, and
collapses horizontal whitespace without translating or case-folding Japanese.

- `groupId` hashes level, qtype, and normalized passage. A human group slug is
  metadata and cannot change group identity.
- `questionId` hashes level, qtype, canonical section, normalized passage/stem,
  and the sorted set of normalized choice texts. Reordering choices therefore
  keeps identity; changing the semantic choice set changes identity.
- `contentHash` hashes the identity fields plus the correct answer text,
  explanation, difficulty, and theme. Choice order and its corresponding answer
  index are normalized to answer text, so a pure reorder is stable. Any change
  to stem, passage, choice semantics, correct answer, or explanation changes the
  content hash.

IDs use the new prefixes `jlptv2-q-` and `jlptv2-g-`; no v2 operation rewrites a
`mockv1-*` ID.

### Resumable run directory

`jlpt_pipeline_v2.py` provides `init-run`, `ingest`, `verify`, `audit-legacy`,
`stage`, `publish`, and `rollback` subcommands. A run directory contains:

- `manifest.json` with immutable request, state, contract/source/workflow hashes,
  provenance, artifact hashes/counts, metrics, and receipt metadata;
- `request.json`, containing the exact contract snapshot passed to JavaScript;
- `raw.json`, `sanitized.json`, `rejected.json`, and `verified.json`;
- `metrics.json` and a copied `receipt.json` after receipt acceptance.

Every artifact is written atomically before the manifest points to it. Repeating
an operation with matching immutable inputs resumes or returns an idempotent
result. A different request, source hash, contract hash, or modified artifact
fails closed. Empty results, schema errors, broken atomic groups, duplicate
identity conflicts, paper shortfall/atomic overfill, and malformed parser roots
return non-zero and never replace an existing artifact.

### Receipt gate

A receipt names the run, contract hash, source hash, reviewer identities, and a
verdict for each content hash. A question becomes verified only when at least two
distinct reviewers unanimously accept it, report no fatal issue, and independently
select the same correct answer text as the authored record. Sanitized questions
without a qualifying receipt remain pending; they are never inferred verified
from legacy aggregate statistics.

### Staging, publish, and rollback

`stage` combines verified run artifacts into a release directory, detects
identity/content conflicts, writes a pending candidate plus a deterministic diff,
and does not modify a target. The release gate requires at least 1,000 verified
unique questions for both N1 and N2.

`publish` requires a separate human signature JSON whose release ID, candidate
hash, contract hash, decision, approver, and timestamp exactly match the pending
release. It refuses `data/jlpt_bank_v1.json`, any target with source `mockv1`, and
any candidate containing `mockv1-*` IDs. Before an atomic target replacement it
records the prior target bytes and hash in the release rollback directory.

`rollback` also requires an explicit human signature and verifies the currently
published target hash before restoring the recorded prior target. It never guesses
which target or release to alter.

## Legacy N1 dry-run audit

`audit-legacy` reads `data/jlpt_gen_pool/N1-lex.json` without modifying it and
writes only a compact audit report. The report contains source and contract
hashes, a deterministic would-be conversion hash, rejection reasons, qtype/group
metrics, and six non-overlapping evidence counts:

1. `raw`
2. `sanitized`
3. `unique`
4. `verified`
5. `approved`
6. `staged`

For the current file, verified/approved/staged must remain zero because no v2
receipt or human signature exists. The report must make structural omissions
(N1 rc and all N2 content) explicit.

## Testing and safety

Tests use temporary directories and real files, not mock assertions. Each new
behavior is introduced through a failing test: contract drift, reorder-stable
identity, content changes, every invalid CLI boundary, atomic group rejection,
resume/tamper detection, receipt qualification, target preservation, signature
gates, rollback hash checks, legacy-bank protection, and the tracked N1 audit.

The existing 34 generation/price tests remain green. Final verification also runs
the new targeted suite, Python compilation, JavaScript syntax checking, and
`git diff --check`.
