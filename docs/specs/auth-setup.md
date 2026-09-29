---
module: auth-setup
status: draft            # draft | frozen | changed-after-freeze
version: 2
frozen_on:
owner: Arun
depends_on: []           # every other module depends on this one
---

# Auth & roles (login, session, permissions)

## Summary
Staff sign in with email and password and stay signed in through silent refresh. What a person may do is
decided by **permissions**: fixed keys like `grn.qa_decide`, defined in code. Keys are granted to **roles**,
which are data you edit in Setup. The API, the menu, the screens and the buttons all read the same grants.
No role name appears in code. Done = you create "store_keeper" in Setup, tick its keys, assign a person,
and they can work on their next click, with no code change and no deploy.

## Who can do what
| Action | Allowed |
|---|---|
| Sign in, refresh, sign out | any active employee |
| See own role and permissions (`/auth/me`) | any signed-in employee |
| Create / copy / rename / delete roles, grant or revoke keys, edit menu labels | holders of `setup.roles.manage` (seed: super-admin) |
| Create / edit / deactivate employees, assign their role | holders of `setup.employees.manage` (seed: super-admin) |
| Register an employee via `/auth/register` | holders of `auth.register` (seed: super-admin, owner) — see Q6 |
| Read the access change log | holders of `setup.roles.manage` |
| Add, rename or remove a permission key | nobody in the app — keys come from code (BR-AUTH-06) |

### Seed grants = today's access, unchanged (BR-AUTH-21)
sa = super-admin, ow = owner, bo = back_office, fs = floor_supervisor, qa = qa_inspector, dd = die_designer.
| Permission key | Covers today | Seed roles |
|---|---|---|
| `setup.roles.manage` | roles, screens, permissions, modules in `/setup` | sa |
| `setup.employees.manage` | employees + QR regenerate in `/setup` | sa |
| `auth.register` | `POST /auth/register` | sa, ow |
| `asset.manage` | all `/asset` routes | sa, bo |
| `supplier.manage` | all `/supplier` routes | sa, bo |
| `pr.manage` | all `/pr` routes | sa, ow, bo, fs |
| `pr.link_machine` | "Machine" field on the PR form (today: fs only) — see Q9 | fs |
| `po.manage` | all `/po` routes, PO tracking and PO action buttons | sa, ow, bo |
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
| signed in | any request | allowed / 403, using grants read now | BR-AUTH-09, 12 |
| signed in | access token expires, refresh ok | signed in | BR-AUTH-01 |
| signed in | deactivated, or refresh with reused token | signed out (401) | BR-AUTH-02, 05, 12 |
| signed in | logout | signed out, refresh token revoked | BR-AUTH-05 |

## Rules
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-AUTH-01 | Refresh issues tokens for the employee's **current** record in the DB, never values copied from the old token. | back_office changed to owner, refresh → `/auth/me` shows owner and owner's keys |
| BR-AUTH-02 | An employee who is inactive at refresh time cannot refresh: 401, no new tokens. | deactivated, refresh → 401 |
| BR-AUTH-03 | Login needs an active employee with matching email and password; every failure returns the same 401 message. | wrong password or unknown email → identical 401 "Invalid credentials" |
| BR-AUTH-04 | Login is limited to 10 attempts per 15 minutes per client; more → 429. | 11th attempt in 15 min → 429 |
| BR-AUTH-05 | A refresh token works once; logout revokes it. A used or revoked token → 401. | refresh with the pre-rotation token → 401 |
| BR-AUTH-06 | Permission keys are a fixed list `<module>.<action>` with a label and one-line description, defined in code and synced to the DB on deploy; the app cannot create, rename or delete keys. | Setup shows `grn.correct` "Correct a posted GRN line", no "add key" button |
| BR-AUTH-07 | Roles are data: a holder of `setup.roles.manage` can create, rename and delete non-system roles and grant or revoke any key. | create "store_keeper", grant `grn.edit_draft` → saved, no deploy |
| BR-AUTH-08 | Each employee has exactly one role; access = that role's keys. | assign a second role → 400 |
| BR-AUTH-09 | An API action is allowed only if the caller's current role holds the route's key; otherwise 403 `PERMISSION_DENIED` with the key in the body. | store_keeper (only `grn.edit_draft`) calls QA action → 403, key `grn.qa_decide` |
| BR-AUTH-10 | Every non-public route declares exactly one permission key or "any signed-in user"; a route declaring neither fails CI. | new route with no key → contract test fails |
| BR-AUTH-11 | Route, service and frontend code checks permission keys only, never role names (seed data excepted). | over-receipt guard checks `grn.over_receipt_override`, not `["owner","back_office"]` |
| BR-AUTH-12 | Every request reads the caller's active flag, role and keys from the DB (short cache, cleared on any change), so grant changes and deactivation apply on the **next request**, without re-login. | revoke `po.manage` at 10:00, same user calls PO list 10:01 → 403; deactivated → next call 401 |
| BR-AUTH-13 | Login and `/auth/me` return `role` (name, for display) and `permissions: string[]`; the UI shows menus, screens and buttons only from this list. | user without `grn.correct` → no "Correct" button |
| BR-AUTH-14 | Hiding in the UI is only convenience; the API check (BR-AUTH-09) decides. | hidden button called via curl → 403 |
| BR-AUTH-15 | Each screen (menu entry) declares one required key; the menu and page guard show a screen only if the user holds it. Separate page grants (`role_pages`) are retired. | role with `pr.manage` only → sees PR screen, `/purchase-orders` redirects home |
| BR-AUTH-16 | No escalation: a user can only grant keys they hold and only assign a role whose keys they all hold. (Fixes BL-024.) | owner registers a super-admin → 403 |
| BR-AUTH-17 | No change may leave zero active employees holding `setup.roles.manage`: 409 `LAST_ADMIN`. | deactivate the only super-admin → 409 |
| BR-AUTH-18 | System roles cannot be renamed or deleted (403 `SYSTEM_ROLE_PROTECTED`); their grants can be edited, but super-admin always keeps `setup.roles.manage` and `setup.employees.manage` (Q4). | revoke `setup.roles.manage` from super-admin → 409 |
| BR-AUTH-19 | A role cannot be deleted while any active employee has it: 409 `ROLE_HAS_EMPLOYEES`. | delete role with 2 active users → 409 |
| BR-AUTH-20 | Every role create/copy/rename/delete, grant change, employee role change and deactivation is logged with who, when, before and after; the log cannot be edited. | revoke key → log row "Arun, 29-09 10:00, back_office −po.manage" |
| BR-AUTH-21 | The first seed grants reproduce today's API access exactly (table above); a test proves every route gives the same allow/deny per seed role before and after. Any screen whose visibility changes is listed for sign-off before the switch. | fs on `GET /po` → 403 before and after |
| BR-AUTH-22 | A role used in an approval chain cannot be renamed or deleted: 409 `ROLE_IN_APPROVAL_CHAIN`. | rename "owner" used in PO policy → 409 |
| BR-AUTH-23 | A request with a missing, expired or bad access token is rejected 401 before any permission check. | expired token on `GET /grn` → 401, not 403 |
| BR-AUTH-24 | Deny by default: a role with no keys can do nothing but sign in, and a key added in a later release is held by no role until granted in Setup or by that release's seed. | release adds `sco.create` → nobody has it, SCO menu hidden for all |
| BR-AUTH-25 | A new role can be created as a copy of an existing role; the copy gets the same keys and is never a system role. | copy back_office as "accounts" → same 12 keys, `isSystem=false` |

## Not now
- Operator QR login (BL-017) — floor PWA milestone.
- Record-level rules ("fs sees only own PRs"), field-level permissions, amount limits per role (Odoo record rules, ERPNext user permissions, D365 data policies).
- Several roles per user, role inheritance or bundles, temporary delegation, segregation-of-duties checks.
- Splitting coarse keys (`po.manage`, `asset.manage`) into view / create / approve — do per module when its spec is written.
- Login audit (who signed in, from where, failures) and "access review" reports.
- Moving the access token out of localStorage (BL-036).
- First-user bootstrap script (BL-004) — infra, tracked separately.

## Questions for you
| # | Question | Options | Answer |
|---|---|---|---|
| Q4 | Super-admin access | **A** normal role seeded with today's keys, only the two setup keys locked (recommended) / B bypasses every check automatically | |
| Q5 | May super-admin override an over-receipt? (today: no, only owner and back_office) | **A** keep no (recommended, unchanged) / B yes | |
| Q6 | Two ways to create a user (`/auth/register` and Setup → Employees) | **A** keep only Setup, retire register (recommended) / B keep both | |
| Q7 | Who manages roles and grants? | **A** super-admin only (recommended, as today) / B super-admin and owner | |
| Q8 | Screen list in Setup | **A** screens and their keys come from code; Setup can only rename labels and reorder (recommended) / B keep full add/delete of screens in Setup | |
| Q9 | PR "Machine" field: today only fs sees it, but fs cannot load the machine list (asset API is sa/bo only) | **A** key `pr.link_machine`; holders may also read the machine list (recommended) / B show field to everyone with `pr.manage` / C keep as is | |

## Changelog
- 2026-09-27 v0 — stub with BR-AUTH-01/02 for the BL-018 regression test.
- 2026-09-29 v1 — full draft: login, session, permission keys, data-driven roles, guardrails, no-change migration.
- 2026-09-29 v2 — Q1=A, Q2=A, Q3=A made firm (BR-AUTH-08, 12, 15). ERP benchmark added: deny by default (BR-AUTH-24), copy role (BR-AUTH-25), key labels (BR-AUTH-06), log covers deactivation (BR-AUTH-20). New key `pr.link_machine`, Q8, Q9. Acceptance criteria folded into rule examples.
