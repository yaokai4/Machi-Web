# JLPT iOS Identity, Listening, and Official Score Follow-up Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fail closed on exam-resume identity, enforce the server listening contract across relaunches, and render the official full-paper score model with local three-language copy.

**Architecture:** Keep recovery, listening, and score presentation decisions in pure policies with focused Swift Testing coverage. Every live session carries the exact original paid-start receipt (`examId + confirmedChargeCoins + idempotencyKey`); conflict recovery verifies preflight identity, replays that receipt, then verifies the returned session before merging. The SwiftUI layer consumes pure listening and score decisions without owning replay allowance or score-label rules. Persist only a successful strict playback start keyed by `sessionId:questionId`; never consume the credential merely because the user tapped Play.

**Tech Stack:** Swift 6, SwiftUI, AVFoundation, Codable, UserDefaults, Swift Testing, iOS 17.

## Global Constraints

- Base commit is `c00d0a8`; produce one follow-up commit and preserve this worktree.
- Do not modify Web/backend files or cherry-pick into an integration branch.
- Do not restart CoreSimulator or terminate another project's processes.
- A recovery may merge only after exact preflight and start-response identity checks, using the original start receipt rather than a new free alias.
- A live timed exam resolves missing, unknown, or contradictory listening policy to strict.
- Practice, placement, and review retain pause, seek, replay, and transcript access.
- Strict playback is consumed only after AVPlayer reports actual playback; a pre-play failure remains retryable.
- Official score labels and the linear-reference disclaimer come from local zh-Hans/ja/en copy, never the server display label/note.

---

### Task 1: Fail-Closed Resume Identity

**Files:**
- Modify: `Machi/Services/JLPTExamContractPolicy.swift`
- Modify: `Machi/Views/Guide/GuideJLPTExamView.swift`
- Create: `kaiziTests/JLPTExamResumeIdentityTests.swift`

**Interfaces:**
- Produces: `JLPTExamStartReceipt`, `JLPTExamResumeIdentityPolicy.acceptsPreflight(...)`, and `acceptsResponse(...)`.

- [x] **Step 1: Write failing pure-policy tests** covering exact identity, missing/mismatched session or exam, nonzero resume charge, `resumed != true`, and changed question IDs.
- [x] **Step 2: Run `MachiTests/JLPTExamResumeIdentityTests` and record the missing-symbol RED failure.**
- [x] **Step 3: Implement the minimal scalar policy.**

```swift
enum JLPTExamResumeIdentityPolicy {
    static func acceptsPreflight(
        expectedSessionId: String,
        expectedExamId: String,
        resumeSessionId: String?,
        preflightExamId: String?,
        requiredCoins: Int?
    ) -> Bool

    static func acceptsResponse(
        expectedSessionId: String,
        expectedExamId: String,
        expectedQuestionIDs: [String],
        responseSessionId: String?,
        responseExamId: String?,
        resumed: Bool?,
        responseQuestionIDs: [String]?
    ) -> Bool
}
```

- [x] **Step 4: Thread the exact `JLPTExamStartReceipt(examId:confirmedChargeCoins:idempotencyKey:)` from both standalone and paper confirmations into `GuideJLPTExamSessionView`. Guard preflight before calling start, replay the original receipt, validate the response before constructing answers, and call `mergeAuthoritative` only after both checks.**
- [x] **Step 5: Re-run the focused test and retain the existing draft/revision tests.**

### Task 2: Strict Listening Policy and Durable Playback Credential

**Files:**
- Modify: `Machi/Services/KaiXAPIDTO+Guide.swift`
- Create: `Machi/Services/JLPTListeningPolicy.swift`
- Modify: `Machi/Views/Guide/GuideJLPTComponents.swift`
- Modify: `Machi/Views/Guide/GuideJLPTExamView.swift`
- Create: `kaiziTests/JLPTListeningPolicyTests.swift`

**Interfaces:**
- Produces: `KaiXJLPTListeningPolicy`, `JLPTListeningPolicy`, `JLPTListeningPlaybackIdentity`, `JLPTListeningPlaybackCredentialStore`, and `JLPTListeningPlaybackGate`.

- [x] **Step 1: Write failing tests** for DTO decoding, timed fail-closed strict resolution, non-exam practice resolution, relaunch persistence, pre-play failure retry, pause/resume without a second charge, and post-end replay denial.
- [x] **Step 2: Run `MachiTests/JLPTListeningPolicyTests` and record the missing-symbol RED failure.**
- [x] **Step 3: Decode optional preflight/start `listeningPolicy` and implement canonical context resolution.**

```swift
enum JLPTListeningContext { case liveTimedExam, nonExam }

struct JLPTListeningPolicy: Equatable, Hashable {
    static func resolve(
        _ raw: KaiXJLPTListeningPolicy?,
        context: JLPTListeningContext
    ) -> Self
}
```

- [x] **Step 4: Implement a UserDefaults store keyed by exact session/question identity and a pure gate whose `confirmPlaybackStarted()` is the only operation that increments the durable count.**
- [x] **Step 5: Make `JLPTAudioPlayerModel` observe actual AVPlayer playback, release an unconfirmed reservation on item failure, preserve pause/resume, and expose blocked/failed state.**
- [x] **Step 6: Pass strict policy and `sessionId:questionId` only from the live session; keep all other `JLPTQuestionCard` call sites on default practice. Hide strict transcript, seek, and replay controls; add zh-Hans/ja/en policy and blocked-state accessibility labels.**
- [x] **Step 7: Re-run the focused policy tests and existing JLPT correctness tests.**

### Task 3: Official Full-Paper Score

**Files:**
- Modify: `Machi/Services/KaiXAPIDTO+Guide.swift`
- Create: `Machi/Services/JLPTOfficialScorePresentation.swift`
- Modify: `Machi/Views/Guide/GuideJLPTExamView.swift`
- Create: `kaiziTests/JLPTOfficialScoreTests.swift`

**Interfaces:**
- Produces: `KaiXJLPTOfficialScoreDivision`, `KaiXJLPTOfficialPaperScore`, and `JLPTOfficialScorePresentation`.

- [x] **Step 1: Write failing decode tests** for all official score fields plus presentation tests for N1/N3 three-division order, N4/N5 two-division order, local labels, local reference disclaimer, and malformed score math.**
- [x] **Step 2: Run `MachiTests/JLPTOfficialScoreTests` and record the missing-symbol RED failure.**
- [x] **Step 3: Add exact Codable DTOs and optional `officialScore` to `KaiXJLPTPaperResult`.**
- [x] **Step 4: Implement key-only localization, expected division ordering, and fail-closed numeric/pass consistency validation.**

```swift
enum JLPTOfficialScorePresentation {
    static func orderedDivisions(
        _ divisions: [KaiXJLPTOfficialScoreDivision],
        level: String
    ) -> [KaiXJLPTOfficialScoreDivision]

    static func divisionLabel(key: String, language: AppLanguage) -> String
    static func referenceNote(language: AppLanguage) -> String
}
```

- [x] **Step 5: Render official total/pass line/divisions first; render legacy `scaled + listening` only when no valid official presentation is available. Combine each score row for VoiceOver and ignore server label/note in visible copy.**
- [x] **Step 6: Re-run the focused score tests.**

### Task 4: Verification and Follow-up Commit

**Files:** Review every file above and this plan.

- [x] **Step 1: Run all new focused tests and existing JLPT contract/draft/session correctness tests when Xcode workers are available; otherwise record the exact environment block.**
- [x] **Step 2: Run `xcrun swiftc -parse` over every changed Swift file.**
- [x] **Step 3: Run `git diff --check` and static searches for unguarded recovery merge, strict seek/replay/transcript controls, and server score-label display.**
- [x] **Step 4: Self-review the complete diff and commit once with `fix(ios): harden JLPT resume audio and scoring`.**

## Verification Record — 2026-07-23

- Simulator: `Machi-JLPT-Contract-20260722`, iOS 26.5, device id `9CF6253D-5B24-40DD-8813-B4024BE9D80F`.
- Focused suites passed with `xcodebuild test` (exit 0): `JLPTExamResumeIdentityTests`, `JLPTListeningPolicyTests`, `JLPTOfficialScoreTests`, and `JLPTExamContractTests`.
- The listening suite was re-run after the final server-policy tightening and truthful post-start failure handling; exit 0.
- `xcrun swiftc -parse` passed for every changed production/test Swift file.
- `git diff --check` and `git diff --cached --check` passed.
- Two unrelated pre-existing Swift concurrency warnings remain in `EventDetailView.swift` and `ListingCopy.swift`; the changed JLPT player emits no Swift 6 capture warning.
