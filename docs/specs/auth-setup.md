---
module: auth-setup
status: draft            # draft | frozen | changed-after-freeze
version: 1
frozen_on:
owner: Arun
depends_on: []           # every other module depends on this one
---

# Auth & roles (login, session, permissions)

## Summary
Staff sign in with email and password and stay signed in through silent refresh. What a person may do is
decided by **permissions** (fixed keys like `grn.qa_decide`) that are granted to **roles** (data, editable in
Setup). The API checks the permission; screens, menus and buttons read the same list. No role names in code.
Done = a new role (e.g. "store_keeper") can be created and given access in Setup, with no code change.

## Who can do what
| Action | Allowed |
|---|---|
| Sign in, refresh, sign out | any active employee |
| See own permissions (`/auth/me`) | any signed-in employee |
| Create / rename / delete roles, grant or revoke permissions | holders of `setup.roles.manage` (seed: super-admin) |
| Create / edit / deactivate employees, assign roles | holders of `setup.employees.manage` (seed: super-admin) |
| Register an employee via `/auth/register` | holders of `auth.register` (seed: super-admin, owner) — see Q6 |
| Add or rename a permission key | nobody in the app — keys come from code (BR-AUTH-06) |

### Seed grants = today's access, unchanged (BR-AUTH-21)
sa = super-admin, ow = owner, bo = back_office, fs = floor_supervisor, qa = qa_inspector, dd = die_designer.
| Permission key | Covers today | Seed roles |
|---|---|---|
| `setup.roles.manage` | roles, pages, permissions, modules in `/setup` | sa |
| `setup.employees.manage` | employees + QR regenerate in `/setup` | sa |
| `auth.register` | `POST /auth/register` | sa, ow |
| `asset.manage` | all `/asset` routes | sa, bo |
| `supplier.manage` | all `/supplier` routes | sa, bo |
| `pr.manage` | all `/pr` routes | sa, ow, bo, fs |
| `po.manage` | all `/po` routes | sa, ow, bo |
| `grn.view` | GRN list, details | sa, ow, bo, fs, qa, dd |
| `grn.edit_draft` | GRN create, update, delete | sa, ow, bo, fs |
| `grn.qa_decide` | GRN QA action | sa, ow, bo, qa |
| `grn.qa_bypass` | GRN QA bypass | sa, ow, bo, fs |
| `grn.correct` | GRN correction | sa, ow, bo |
| `grn.over_receipt_override` | receive above PO qty (service check) | ow, bo (not sa — see Q5) |
| `approval.policy.view` | list / view approval policies | sa, ow, bo |
| `approval.policy.manage` | create / update approval policies | sa |
| `approval.view_all` | read any approval request (service check) | sa, ow, bo |
| `approval.view_others_pending` | see another employee's pending list | sa |
Approval submit / act / trail stay "any signed-in user"; who may act is decided by the approval chain.

## Flow
| From | Action | To | Rule |
|---|---|---|---|
| signed out | login ok | signed in (access + refresh token) | BR-AUTH-03, 04 |
| signed in | access token expires, refresh ok | signed in, current grants | BR-AUTH-01 |
| signed in | refresh while inactive / reused token | signed out (401) | BR-AUTH-02, 05 |
| signed in | logout | signed out, refresh token revoked | BR-AUTH-05 |
| any request | role lacks the route's key | 403 `PERMISSION_DENIED` | BR-AUTH-09 |

## Rules
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-AUTH-01 | Refresh issues an access token with the employee's **current** role and grants from the DB, never values copied from the old token. | back_office changed to owner, refresh → token role = owner, owner's pages |
| BR-AUTH-02 | An employee who is inactive at refresh time cannot refresh: 401, no new tokens. | deactivated, refresh → 401 |
| BR-AUTH-03 | Login needs an active employee with matching email and password; every failure returns the same 401 message. | wrong password or unknown email → identical 401 "Invalid credentials" |
| BR-AUTH-04 | Login is limited to 10 attempts per 15 minutes per client; more → 429. | 11th attempt in 15 min → 429 |
| BR-AUTH-05 | A refresh token works once; logout revokes it. A used or revoked token → 401. | refresh with the pre-rotation token → 401 |
| BR-AUTH-06 | Permission keys are a fixed list `<module>.<action>` defined in code and synced to the DB on deploy; the app cannot create, rename or delete keys. | Setup shows `grn.correct`, no "add key" button |
| BR-AUTH-07 | Roles are data: a holder of `setup.roles.manage` can create, rename and delete non-system roles and grant or revoke any key. | create "store_keeper", grant `grn.edit_draft` → saved, no deploy |
| BR-AUTH-08 | Each employee has exactly one role (Q2). | assign second role → 400 |
| BR-AUTH-09 | An API action is allowed only if the caller's current role holds the route's key; otherwise 403 `PERMISSION_DENIED` with the key in the body. | fs calls GRN correction → 403, key `grn.correct` |
| BR-AUTH-10 | Every non-public route declares exactly one permission key or "any signed-in user"; a route declaring neither fails CI. | new route with no key → contract test fails |
| BR-AUTH-11 | Route, service and frontend code checks permission keys only, never role names. | over-receipt guard checks `grn.over_receipt_override`, not `["owner","back_office"]` |
| BR-AUTH-12 | Grant changes and deactivation apply on the employee's **next request**, without re-login (Q1). | revoke `po.manage` at 10:00, same user calls PO list 10:01 → 403 |
| BR-AUTH-13 | Login and `/auth/me` return `permissions: string[]`; the UI shows menus, screens and buttons only from this list. | user without `grn.correct` → no "Correct" button |
| BR-AUTH-14 | Hiding in the UI is only convenience; the API check (BR-AUTH-09) decides. | hidden button called via curl → 403 |
| BR-AUTH-15 | Each screen declares one required key; the menu and page guard allow a path only if the user holds it. `allowedPages` is derived from keys (Q3). | role with `pr.manage` only → sees PR screen, `/purchase-orders` redirects home |
| BR-AUTH-16 | No escalation: a user can only grant keys they hold and only assign a role whose keys they all hold. (Fixes BL-024.) | owner registers a super-admin → 403 |
| BR-AUTH-17 | The last active employee holding `setup.roles.manage` cannot be deactivated or moved to a role without it, and no change may leave zero holders: 409 `LAST_ADMIN`. | revoke `setup.roles.manage` from the only admin role → 409 |
| BR-AUTH-18 | System roles cannot be renamed or deleted; their grants can be edited, but super-admin always keeps `setup.roles.manage` and `setup.employees.manage` (Q4). | revoke `setup.roles.manage` from super-admin → 409 |
| BR-AUTH-19 | A role cannot be deleted while any active employee has it: 409 `ROLE_HAS_EMPLOYEES`. | delete role with 2 active users → 409 |
| BR-AUTH-20 | Every role create/rename/delete, grant change and employee role change is recorded with who, when, before and after. | revoke key → log row "Arun, 29-09 10:00, back_office −po.manage" |
| BR-AUTH-21 | The first seed grants reproduce today's access exactly (table above); a test proves every route gives the same allow/deny per seed role as before. | fs on `GET /po` → 403 before and after |
| BR-AUTH-22 | A role used in an approval chain cannot be renamed or deleted: 409 `ROLE_IN_APPROVAL_CHAIN`. | rename "owner" used in PO policy → 409 |
| BR-AUTH-23 | A request with a missing, expired or bad access token is rejected 401 before any permission check. | expired token on `GET /grn` → 401, not 403 |

## Acceptance criteria
- **AC-01** (BR-AUTH-01) Given a back_office user, When an admin changes them to owner and the session refreshes, Then the token role = owner and grants = owner's.
- **AC-02** (BR-AUTH-02) Given a signed-in user, When deactivated and the session refreshes, Then 401.
- **AC-03** (BR-AUTH-03) Given unknown email vs wrong password, When login, Then both 401 with identical body.
- **AC-04** (BR-AUTH-05) Given a refresh token already rotated, When reused, Then 401.
- **AC-05** (BR-AUTH-07, 09) Given new role "store_keeper" with only `grn.edit_draft`, When its user creates a GRN, Then 201; When they call QA action, Then 403 `PERMISSION_DENIED` key `grn.qa_decide`.
- **AC-06** (BR-AUTH-10) Given a registered route with no key and no "any signed-in" flag, When CI runs, Then the contract test fails.
- **AC-07** (BR-AUTH-11) Given the code base, When searched, Then no role-name literal appears in routes, services or frontend components (seed files excepted).
- **AC-08** (BR-AUTH-12) Given a user with `po.manage`, When it is revoked, Then their next `GET /po` returns 403 without re-login.
- **AC-09** (BR-AUTH-13, 15) Given a role without `po.manage`, When the user signs in, Then PO is absent from the menu and `/purchase-orders` redirects home.
- **AC-10** (BR-AUTH-16) Given an owner (no `setup.roles.manage`), When they register someone as super-admin, Then 403.
- **AC-11** (BR-AUTH-17) Given one active super-admin, When deactivated or re-roled, Then 409 `LAST_ADMIN`.
- **AC-12** (BR-AUTH-18, 19) Given system role owner, When renamed or deleted, Then 403 `SYSTEM_ROLE_PROTECTED`; Given a custom role with active users, When deleted, Then 409.
- **AC-13** (BR-AUTH-20) Given a grant revoked, When the log is read, Then it shows actor, time, role, key removed.
- **AC-14** (BR-AUTH-21) Given each seed role × each route, When called before and after migration, Then allow/deny is identical.
- **AC-15** (BR-AUTH-22) Given role qa_inspector in an approval chain, When renamed, Then 409.
- **AC-16** (BR-AUTH-04, 23) Given 10 failed logins, When the 11th is sent, Then 429; Given an expired token, When any protected route is called, Then 401.
- **AC-17** (BR-AUTH-06, 08) Given Setup, Then there is no way to add a key, and an employee edit accepts one role only.

## Not now
- Operator QR login (BL-017) — floor PWA milestone.
- Record-level rules ("floor supervisor sees only own PRs"), field-level permissions, amount limits per role.
- Several roles per user, role inheritance, temporary delegation.
- Moving the access token out of localStorage (BL-036); revoking already-issued access tokens.
- First-user bootstrap script (BL-004) — infra, tracked separately.

## Questions for you
| # | Question | Options | Answer |
|---|---|---|---|
| Q1 | When should a permission change take effect? | **A** next request — API reads grants from DB, short cache cleared on change (recommended) / B next refresh, ≤15 min (grants inside the token) | |
| Q2 | How many roles per person? | **A** one (recommended, as today) / B several, access = union | |
| Q3 | Screen access: one grant list or two? | **A** one — each screen needs a key, `role_pages` retired (recommended) / B keep page grants separate from API grants | |
| Q4 | Super-admin access | **A** normal role seeded with all keys, only the two setup keys locked (recommended) / B bypasses every check automatically | |
| Q5 | May super-admin override an over-receipt? (today: no, only owner and back_office) | **A** keep no (recommended, unchanged) / B yes | |
| Q6 | Two ways to create a user (`/auth/register` and Setup → Employees) | **A** keep only Setup, retire register (recommended) / B keep both | |
| Q7 | Who manages roles and grants? | **A** super-admin only (recommended, as today) / B super-admin and owner | |

## Changelog
- 2026-09-27 v0 — stub with BR-AUTH-01/02 for the BL-018 regression test.
- 2026-09-29 v1 — full draft: login, session, permission keys, data-driven roles, guardrails, no-change migration.
