# Production Account Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent iOS unit tests from reaching production and prevent administrator accounts from using self-service deletion.

**Architecture:** Add a central iOS test-network policy enforced at both token storage and the low-level HTTP client, then add a server-side administrator guard before account anonymization. Preserve explicit backend smoke tests and ordinary member deletion.

**Tech Stack:** Swift 6, Swift Testing/XCTest, SwiftData, Python 3.12, unittest, PostgreSQL, systemd.

## Global Constraints

- Ordinary unit tests must never read a persisted production token or send a real network request.
- `KAIX_RUN_BACKEND_SMOKE_TESTS=1` remains the only unit-test opt-in for backend networking.
- Member self-deletion behavior remains unchanged.
- Administrator self-deletion returns HTTP 403 with code `admin_self_delete_forbidden`.
- No UI/style changes and no new third-party dependency.

---

### Task 1: iOS unit-test network isolation

**Files:**
- Modify: `Machi/Machi/Services/ServerEntityFactory.swift`
- Modify: `Machi/Machi/Services/KaiXBackend.swift`
- Modify: `Machi/Machi/Services/KaiXAPIClient.swift`
- Test: `Machi/kaiziTests/KaiXAPIClientTests.swift`

**Interfaces:**
- Produces: `KaiXRuntimeFlags.backendRequestsAllowed(environment:) -> Bool`
- Produces: `KaiXRuntimeFlags.allowBackendRequests: Bool`
- Consumes: `XCTestConfigurationFilePath` and `KAIX_RUN_BACKEND_SMOKE_TESTS`

- [ ] **Step 1: Write failing policy and request-barrier tests**

Add tests that call `backendRequestsAllowed(environment:)` with ordinary,
XCTest, and smoke-test environments, then call `KaiXAPIClient.request` in the
ordinary test process and require `URLError(.noPermissionsToReadFile)`.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
xcodebuild test -project Machi.xcodeproj -scheme Machi -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:kaiziTests/KaiXAPIClientTests
```

Expected: compile/test failure because the environment-policy API and request
barrier do not exist.

- [ ] **Step 3: Implement the minimal central policy**

Implement the pure environment function and computed flag. Guard both
`KaiXBackend.token` accessors and the first line of `KaiXAPIClient.request`.
Do not alter production or explicit smoke-test behavior.

- [ ] **Step 4: Run focused and repository tests and verify GREEN**

Run the focused command above, then:

```bash
xcodebuild test -project Machi.xcodeproj -scheme Machi -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:kaiziTests/kaiziTests
```

Expected: all selected tests pass and the production access log receives no
placeholder test requests.

### Task 2: Backend administrator self-delete guard

**Files:**
- Modify: `web/server.py`
- Create: `web/scripts/test_admin_self_delete_guard.py`

**Interfaces:**
- Produces: `ensure_user_can_self_delete(user: Mapping[str, Any]) -> None`
- Consumes: the authenticated user resolved by `api_delete_me`

- [ ] **Step 1: Write the failing backend regression test**

Create a unittest that asserts an admin raises `APIError` with status 403/code
`admin_self_delete_forbidden` and that a member passes the guard.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
python3 scripts/test_admin_self_delete_guard.py
```

Expected: failure because `ensure_user_can_self_delete` is undefined.

- [ ] **Step 3: Implement the minimal backend guard**

Add the helper next to `anonymize_user_account`, call it immediately after
`require_user` in `api_delete_me`, and leave all member deletion statements
unchanged.

- [ ] **Step 4: Run focused and adjacent backend tests and verify GREEN**

Run:

```bash
python3 scripts/test_admin_self_delete_guard.py
python3 scripts/test_admin_user_restore.py
python3 scripts/test_google_account_linking.py
```

Expected: all scripts exit 0.

### Task 3: Deploy and independently verify

**Files:**
- Modify: production release through `web/deploy/deploy.sh`
- Verify: production PostgreSQL, systemd services, and public health endpoints

**Interfaces:**
- Consumes: tested commits from Tasks 1 and 2
- Produces: deployed backend guard and a locally safe iOS test suite

- [ ] **Step 1: Run full local verification**

Run the complete backend test suite used by the repository, full iOS unit
tests, and a clean iOS simulator build. Expected: exit 0 with no failures.

- [ ] **Step 2: Scan changes for secrets and commit intentionally**

Verify no `.env`, database, token, build output, or Xcode user data is staged.
Commit each repository with focused messages and the required co-author line.

- [ ] **Step 3: Deploy the backend through the existing atomic script**

Run `bash deploy/deploy.sh` from the repository's expected local path or its
equivalent corrected workspace path. Expected: clean build, migrations,
service restart, and smoke checks all succeed.

- [ ] **Step 4: Verify production behavior and state**

Verify `/healthz`, `/readyz`, Google OAuth start, the restored `Machi App`
database row, unique active Google identity, and an authenticated admin delete
probe against a rollback-only transaction/test fixture. Expected: healthy
services and HTTP 403 `admin_self_delete_forbidden` for the protected path.

- [ ] **Step 5: Push both repositories**

Push only after all verification succeeds and confirm both branches match
their upstream remotes.
