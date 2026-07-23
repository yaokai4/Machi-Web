# JLPT iOS Exam Contract Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make iOS honor the authoritative paid-start, answer-revision, durable-draft, parent-paper-attempt, and structured-recovery contracts without regressing the sealed-submit exit guard.

**Architecture:** Keep wire DTOs and request payloads in the existing API layer, but move session recovery into a session-keyed Codable draft store that writes before networking. The MainActor answer coordinator owns monotonic revisions and replays the exact pending write after response loss. SwiftUI asks preflight first, presents one enum-driven confirmation state, and derives paper position from the server's attempt rather than local memory.

**Tech Stack:** Swift 6, SwiftUI (iOS 17), async/await, Codable, UserDefaults-backed crash-safe draft storage, Swift Testing/XCTest, XcodeBuildMCP.

## Global Constraints

- Web integration worktree is the wire-contract authority; do not invent fields.
- Start body is `examId + confirmedChargeCoins`; stable `Idempotency-Key` survives retry of one start intent.
- Start restores `answers`, `answerRevision`, `remainingSeconds`, payment fields, and `paperAttempt`.
- Answer sends adjacent `baseRevision/revision`; exact same revision and selection is replay-safe.
- Submit sends an ordered complete `answersSnapshot` plus adjacent revision pair.
- A timed submit preserves the existing synchronous submit boundary and blocks every exit path.
- Local drafts/outbox are session-scoped and persisted before network I/O.
- Paper navigation uses server `paperAttempt.currentSectionExamId/currentSectionIndex`; result query includes `attemptId`.
- N3-N5 copy must be dynamic for three sections; no copy may claim listening is sequential-only while the player is permissive.
- Errors retain structured `detail` and map to actionable zh-Hans/ja/en recovery.

---

### Task 1: Freeze Wire DTO and Request Contracts

**Files:**
- Modify: `Machi/Services/KaiXAPIDTO.swift`
- Modify: `Machi/Services/KaiXAPIDTO+Guide.swift`
- Modify: `Machi/Services/KaiXAPIClient+Guide.swift`
- Create: `kaiziTests/JLPTExamContractTests.swift`

**Interfaces:**
- Produces: `KaiXJLPTExamPreflight`, `KaiXJLPTPaperAttempt`, `KaiXJLPTAnswerSnapshot`, revision-aware answer/submit DTOs, and `KaiXAPIError.detail`.

- [ ] **Step 1: Write failing decode/encode tests**

```swift
@Test func startDecodesAuthoritativeResumeContract() throws {
    let value = try JSONDecoder().decode(KaiXJLPTExamStartResponse.self, from: startFixture)
    #expect(value.answerRevision == 4)
    #expect(value.answers?.first?.revision == 4)
    #expect(value.paperAttempt?.currentSectionExamId == "n3-listening")
}

@Test func submitPayloadKeepsQuestionOrder() throws {
    let body = KaiXJLPTExamSubmitRequest(
        sessionId: "s1",
        answersSnapshot: [.init(questionId: "q2", selectedIndex: 1), .init(questionId: "q1", selectedIndex: 0)],
        baseRevision: 4,
        revision: 5
    )
    #expect(try encodedQuestionIDs(body) == ["q2", "q1"])
}
```

- [ ] **Step 2: Run the focused tests and confirm missing-type/member failures**

Run the `JLPTExamContractTests` selection with XcodeBuildMCP. Expected: compile/test failure naming the missing contract members.

- [ ] **Step 3: Add the minimal DTOs and API methods**

```swift
func jlptExamPreflight(examId: String) async throws -> KaiXJLPTExamPreflight
func jlptExamStart(examId: String, confirmedChargeCoins: Int, idempotencyKey: String) async throws -> KaiXJLPTExamStartResponse
func jlptExamAnswer(_ request: KaiXJLPTExamAnswerRequest) async throws -> KaiXJLPTExamAnswerResponse
func jlptExamSubmit(_ request: KaiXJLPTExamSubmitRequest) async throws -> KaiXJLPTExamResult
func jlptPaperResult(paperId: String, attemptId: String) async throws -> KaiXJLPTPaperResult
```

- [ ] **Step 4: Run the focused tests and confirm green**

- [ ] **Step 5: Commit only after the complete feature verification batch**

### Task 2: Add Crash-Safe Session Draft and Revision Outbox

**Files:**
- Create: `Machi/Services/JLPTExamDraftStore.swift`
- Modify: `Machi/Views/Guide/GuideJLPTExamView.swift`
- Modify: `kaiziTests/GuideJLPTExamSessionCorrectnessTests.swift`

**Interfaces:**
- Consumes: revision-aware answer DTOs from Task 1.
- Produces: `JLPTExamSessionDraftStore`, `JLPTExamSessionDraft`, and coordinator operations that persist-before-send, merge server state, acknowledge by revision, and replay the exact pending write.

- [ ] **Step 1: Write failing persistence, merge, and response-loss tests**

```swift
@Test func pendingAnswerSurvivesStoreRecreation() throws {
    let store = JLPTExamSessionDraftStore(defaults: suite)
    try store.recordLocalAnswer(sessionId: "s1", questionId: "q1", selectedIndex: 2, baseRevision: 3, revision: 4)
    #expect(JLPTExamSessionDraftStore(defaults: suite).draft(sessionId: "s1")?.outbox.first?.revision == 4)
}

@Test func mergeReappliesOnlyPendingWritesAboveServerRevision() throws {
    let merged = JLPTExamSessionDraft.merge(serverAnswers: ["q1": 0], serverRevision: 3, local: draftWithRevision4)
    #expect(merged.answers["q1"] == 2)
    #expect(merged.outbox.map(\.revision) == [4])
}

@Test func lostResponseRetriesIdenticalRevision() async {
    // First call applies revision 1 then throws; second call must send the same q/index/base/revision tuple.
}
```

- [ ] **Step 2: Run focused tests and confirm persistence/merge APIs are absent**

- [ ] **Step 3: Implement a session-keyed Codable store and revision coordinator**

```swift
struct JLPTExamPendingAnswer: Codable, Equatable {
    let questionId: String
    let selectedIndex: Int
    let baseRevision: Int
    let revision: Int
}
```

Persist the pending record and visible answer atomically to one encoded defaults value before scheduling the request. Remove it only after a matching authoritative `answerRevision` acknowledgement. A retry reuses the stored tuple; a new selection is assigned only after the queue predecessor resolves.

- [ ] **Step 4: Run focused correctness tests and confirm green**

### Task 3: Submit a Complete Ordered Snapshot Without Weakening the Boundary

**Files:**
- Modify: `Machi/Views/Guide/GuideJLPTExamView.swift`
- Modify: `kaiziTests/GuideJLPTExamSessionCorrectnessTests.swift`

**Interfaces:**
- Consumes: merged local answers and the coordinator's authoritative revision.
- Produces: ordered `questions.compactMap` snapshot and submit revision `current + 1`.

- [ ] **Step 1: Write failing snapshot-order and sealed-submit tests**

```swift
@Test func snapshotUsesExamOrderAndIncludesEveryAnsweredQuestion() {
    #expect(JLPTExamSnapshotBuilder.build(questionIDs: ["q2", "q1"], answers: ["q1": 0, "q2": 1]).map(\.questionId) == ["q2", "q1"])
}
```

Retain the existing tests proving `.submitting` replaces interactive content, legacy presentations close synchronously, late enqueue is rejected, and exit remains blocked.

- [ ] **Step 2: Confirm the new builder test fails**

- [ ] **Step 3: Implement ordered snapshot submission**

Seal and flush first, then submit the complete local snapshot with an adjacent revision even if individual answer responses were lost. On success clear the session draft; on failure reopen while retaining the draft and actionable error.

- [ ] **Step 4: Run all session correctness tests**

### Task 4: Gate Starts With Authoritative Preflight and Actionable Recovery

**Files:**
- Modify: `Machi/Views/Guide/GuideJLPTExamView.swift`
- Create: `kaiziTests/JLPTExamPresentationPolicyTests.swift`

**Interfaces:**
- Consumes: preflight DTO and structured API error detail.
- Produces: `JLPTExamStartIntent`, `JLPTExamStartPresentation`, and `JLPTExamRecoveryAction` pure policies used by both single and paper flows.

- [ ] **Step 1: Write failing policy tests**

```swift
@Test func retryKeepsOneStartIntentKey() {
    var intent = JLPTExamStartIntent(examId: "e1")
    let first = intent.idempotencyKey
    intent.refresh(preflight: fixture)
    #expect(intent.idempotencyKey == first)
}

@Test func priceChangedRefreshesPreflight() {
    #expect(JLPTExamRecoveryPolicy.action(code: "exam_price_changed", detail: detail) == .refreshPreflight)
}
```

- [ ] **Step 2: Confirm policy types are missing**

- [ ] **Step 3: Implement one item-driven confirmation state**

The confirmation shows authoritative charge, balance, shortfall, one-time parent-paper payment semantics, and refund policy in zh-Hans/ja/en. `canStart == false` routes to membership or wallet as indicated. `exam_price_changed` dismisses stale confirmation, fetches preflight again, and requires a new user confirmation while retaining the same logical start intent key.

- [ ] **Step 4: Preserve structured error detail and localize executable recovery**

Map at least member-required, insufficient coins, price changed, answer revision conflict, paper section out of order, completed attempt, no questions, session expired, offline/timeout, and unknown server errors. Never replace an available structured next step with a generic alert.

- [ ] **Step 5: Run policy and API tests**

### Task 5: Drive Parent Paper From Server Attempt and Correct Copy

**Files:**
- Modify: `Machi/Views/Guide/GuideJLPTExamView.swift`
- Modify: `kaiziTests/JLPTExamPresentationPolicyTests.swift`

**Interfaces:**
- Consumes: `KaiXJLPTPaperAttempt` from preflight/start/submit and `attemptId` result query.
- Produces: `JLPTPaperProgressResolver` and dynamic section-count copy.

- [ ] **Step 1: Write failing paper recovery and copy tests**

```swift
@Test func paperResolverUsesServerExamIdBeforeIndex() {
    #expect(JLPTPaperProgressResolver.index(sections: sections, attempt: attempt) == 2)
}

@Test func n3CopySaysThreeSections() {
    #expect(JLPTPaperCopy.structure(sectionCount: 3, language: .en).contains("3"))
}
```

- [ ] **Step 2: Confirm local-index implementation fails the tests**

- [ ] **Step 3: Implement server-driven load/start/submit transitions**

Preflight the parent paper, restore `currentSectionExamId`, retain `paperAttempt.id`, start exactly the authoritative section, update progress from each start/submit response, handle `paper_section_out_of_order` by applying error detail and refreshing preflight, and query the final result with `attemptId`.

- [ ] **Step 4: Replace hard-coded two-section and sequential-only listening claims**

Render the actual section count in all three languages. Keep only truthful copy such as “includes listening audio / headphones recommended” until a strict playback policy exists.

- [ ] **Step 5: Run paper/presentation tests**

### Task 6: Verify and Append One Reviewable Commit

**Files:**
- Review every file changed above.

- [ ] **Step 1: Run all focused JLPT contract/correctness tests**

Expected: zero failures and explicit counts recorded.

- [ ] **Step 2: Run the complete MachiTests suite**

Expected: zero failures; report intentional skips separately.

- [ ] **Step 3: Clean then build with a fresh DerivedData directory**

Expected: `BUILD SUCCEEDED`; record warnings without claiming they were fixed if outside this diff.

- [ ] **Step 4: Inspect `git diff --check`, status, and the complete diff**

Verify the six review requirements against the diff and confirm the 4167593 submitting-exit tests still pass.

- [ ] **Step 5: Append a new commit**

```bash
git add Machi/Services/KaiXAPIDTO.swift Machi/Services/KaiXAPIDTO+Guide.swift Machi/Services/KaiXAPIClient+Guide.swift Machi/Services/JLPTExamDraftStore.swift Machi/Views/Guide/GuideJLPTExamView.swift kaiziTests docs/superpowers/plans/2026-07-22-jlpt-ios-exam-contract.md
git commit -m "fix(ios): complete JLPT exam recovery contract"
```

## Verification Record (2026-07-22)

- The first focused `JLPTExamContractTests` run completed successfully after the
  wire DTO/API implementation (exit 0, 137.389 seconds).
- Later focused/full test, build-for-testing, and build attempts did not reach
  Swift compilation because Xcode remained at `waiting for workers to
  materialize`, including with a dedicated simulator. They are environment-
  blocked and must not be reported as passing.
- No global Simulator/CoreSimulator restart was performed because other local
  projects share that environment.
- The final changed-file batch passes `xcrun swiftc -parse`; `git diff --check`
  is clean; static searches find no legacy JLPT start/answer/submit/result call,
  hard-coded two-section copy, sequential-only listening claim, or local section
  index increment.
- Before merge or release, rerun the focused JLPT tests, complete `MachiTests`,
  and a clean build in an isolated Xcode environment.
