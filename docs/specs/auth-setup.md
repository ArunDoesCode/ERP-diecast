---
module: auth-setup
status: draft            # draft | frozen | changed-after-freeze
version: 0
frozen_on:
owner: Arun
depends_on: []
---

# Auth & setup — functional spec

> **Stub.** Only the session-refresh rules exist so far (written for the BL-018 fix, 2026-09-27). The rest
> of the module (login, register, roles/pages/permissions, QR login BL-017) is still to be specified via
> `/spec auth-setup`. As-built map: `docs/modules/auth-setup.md`.

## 1. Purpose
Desk users stay signed in through a short-lived access token that is silently renewed with a refresh
token. Renewal must reflect the user's current access, so admin changes take effect without a re-login.

## 2. Actors & permissions
| Actor | Refresh session |
|---|---|
| Any signed-in employee (holds a valid refresh token) | yes, while active |
| Deactivated employee | no |

## 3. Documents & key fields
- Access token payload: `userId`, `userName`, `role`, `allowedPages`.
- Refresh token: single-use; stored only as a hash.

## 4. State machine
Not applicable (session tokens only).

## 5. Business rules
- **BR-AUTH-01** — Refreshing a session issues an access token whose `role` and `allowedPages` are the
  employee's **current** role and that role's **current** page grants in the database — never values copied
  from the previous token.
- **BR-AUTH-02** — An employee who is inactive (`isActive = false`) at refresh time cannot refresh: the
  request is rejected as unauthorised (401) and no new tokens are issued.

## 6. Cross-module effects
Role or page-grant changes made in Setup reach the user on their next silent refresh (at most one access-token
lifetime, default 15 minutes).

## 7. Acceptance criteria
- **AC-01** (BR-AUTH-01) — Given an employee who signed in as `back_office`, When an admin changes their role
  to `owner` and the session is refreshed, Then the new access token has `role = owner` and `allowedPages`
  equal to the owner role's page grants.
- **AC-02** (BR-AUTH-02) — Given a signed-in employee, When they are deactivated and the session is
  refreshed, Then the refresh fails with 401.

## 8. Screens (frontend)
None — refresh is silent.

## 9. Reports / queries needed
None.

## 10. Out of scope / later
Revoking already-issued access tokens (they stay valid until expiry). Everything else in the module until
`/spec auth-setup`.

## 11. Open questions for factory SME
None for these rules.

## 12. Implementation status
| BR | Status | Where |
|---|---|---|
| BR-AUTH-01 | implemented (PR #4, BL-018) | `authService.refresh` |
| BR-AUTH-02 | implemented (PR #4, BL-018) | `authService.refresh`, `authRepository.getActiveEmployeeWithRoleById` |

## Changelog
- 2026-09-27 v0 — stub with BR-AUTH-01/02 so the BL-018 regression test has a rule to test against.
