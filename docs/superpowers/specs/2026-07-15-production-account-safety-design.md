# Production Account Safety Design

## Incident and objective

On 2026-07-15, the iOS unit-test target inherited a production bearer token
from the Keychain. Repository tests that were intended to mutate only an
in-memory SwiftData store therefore sent real requests to `machicity.com`.
One test renamed the signed-in production account and a later test called
`DELETE /api/auth/me`, anonymizing the `Machi App` administrator account.

The permanent fix must prevent ordinary unit tests from making backend
requests even when a production token is present, while preserving explicitly
enabled local backend smoke tests. The backend must also refuse self-service
deletion of an administrator account.

## Chosen approach

Use two independent safety barriers.

1. The iOS runtime exposes a pure environment-policy function. A process with
   `XCTestConfigurationFilePath` is network-disabled unless
   `KAIX_RUN_BACKEND_SMOKE_TESTS=1`. `KaiXBackend.token` returns `nil` and does
   not mutate Keychain storage while network access is disabled. The low-level
   `KaiXAPIClient.request` method also fails before constructing or sending a
   URL request. The token barrier keeps repository unit tests on their local
   branches; the request barrier catches future direct-client mistakes.
2. `api_delete_me` rejects users whose role is `admin` before calling
   `anonymize_user_account`. Ordinary member account deletion remains
   unchanged. Administrators can only be removed through an intentional
   administrative workflow after their role has been transferred or revoked.

The Google linking implementation already returns `google_already_linked`
when the provider identity belongs to another active account. No Google merge
semantics change is required: the incident's duplicate account was created by
login after the original identity had already been scrubbed by account
deletion, not by the link endpoint.

## Alternatives considered

- Repository-only guards were rejected because there are many repositories
  and views that call `KaiXAPIClient.shared`; a future direct call could bypass
  a partial fix.
- Clearing the developer's Keychain before tests was rejected because it is
  destructive, device-specific, and does not protect CI or another Mac.
- Blocking all account deletion behind a new reauthentication protocol was
  deferred because it would require a coordinated client release and would
  break the currently supported member deletion flow.

## Data flow and failure behavior

In ordinary tests, the environment policy disables backend requests. Token
reads return `nil`, so repositories use their in-memory SwiftData paths. If a
test calls `KaiXAPIClient` directly, the request throws `URLError(.noPermissionsToReadFile)`
before `URLSession` is invoked. Explicit smoke tests set
`KAIX_RUN_BACKEND_SMOKE_TESTS=1`, which restores the existing token and network
behavior.

For production account deletion, the handler resolves the authenticated user,
checks the role, and raises HTTP 403 with code
`admin_self_delete_forbidden` for administrators. Only non-admin users reach
the existing anonymization routine.

## Verification

- Swift unit tests prove the environment policy denies ordinary XCTest
  processes, permits explicit smoke tests, and refuses a low-level request
  without invoking the URL protocol.
- Existing repository tests run with a production-shaped token fixture and
  remain local.
- Python tests prove an admin is rejected before anonymization and a member is
  still anonymized.
- Full iOS tests, an iOS build, backend regression scripts, production health
  checks, and a direct production database assertion are required before
  completion.
