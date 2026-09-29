---
module: auth-setup
status: frozen           # draft | frozen | changed-after-freeze
version: 9
frozen_on: 2026-09-29
owner: Arun
depends_on: []           # every other module depends on this one
---
# Auth & roles (login, session, permissions)

## Summary

Staff sign in with email and password and stay signed in through silent refresh. What a person may do is
decided by **permissions**: fixed keys like `grn.qa_decide`, defined in code. Keys are granted to **roles**,
which are data you edit in Setup. The API, the menu, the screens and the buttons all read the same grants.
No role name appears in code. Super-admin is the one exception: it passes every check. Done = super-admin
creates "store_keeper" in Setup, ticks its keys, assigns a person, and they can work on their next click,
with no code change and no deploy.

## Who can do what

| Action | Allowed |
|---|---|
| Sign in, refresh, sign out | any active employee |
| See own role and permissions (`/auth/me`) | any signed-in employee |
| Everything, including keys no role holds | super-admin (automatic, BR-AUTH-18) |
| Create / copy / rename / delete roles, grant or revoke keys, edit screens, read the access log | super-admin only (`setup.roles.manage`, cannot be granted, BR-AUTH-07) |
| Create / edit / deactivate employees, assign their role | super-admin only at go-live; no seed role holds `setup.employees.manage`, owner included |
| Create a user any other way | nobody: `/auth/register` is retired; Setup → Employees is the only way |
| Add, rename or remove a permission key or a screen | nobody in the app: they come from code (BR-AUTH-06) |

### Seed grants = today's access (BR-AUTH-21)

Super-admin needs no grants (bypass). ow = owner, bo = back_office, fs = floor_supervisor, qa = qa_inspector, dd = die_designer.

| Permission key | Covers today | Seed roles |
|---|---|---|
| `setup.roles.manage` | roles, screens, grants, access log in `/setup` | super-admin only, not grantable |
| `setup.employees.manage` | employees + QR regenerate in `/setup` | none (super-admin) |
| `asset.manage` | all `/asset` routes except those below | bo |
| `inventory.adjust` | manual stock-take / opening stock (grn-stock BR-GRN-43) | ow, bo |
| `inventory.view` | items, stock view, movement list (inventory Q5=A) | ow, bo, fs |
| `supplier.view` | supplier list, search, view (PO supplier picker) | ow, bo, fs |
| `supplier.manage` | supplier create, edit, deactivate, price lists | bo |
| `pr.manage` | all `/pr` routes | ow, bo, fs |
| `pr.link_machine` | PR "Machine" field + machine list for it (BR-AUTH-26) | ow, bo, fs |
| `po.manage` | all `/po` routes, PO tracking and PO action buttons | ow, bo |
| `grn.view` | GRN list, details | ow, bo, fs, qa, dd |
| `grn.edit_draft` | GRN create, update, delete | ow, bo, fs |
| `grn.qa_decide` | GRN QA action | ow, bo, qa |
| `grn.qa_bypass` | GRN QA bypass | ow, bo |
| `grn.correct` | GRN correction | ow, bo |
| `grn.over_receipt_override` | receive above PO qty (service check) | ow, bo |
| `approval.policy.view` | list / view approval policies | ow, bo |
| `approval.policy.manage` | create / update approval policies | none (super-admin) |
| `approval.view_all` | read any approval request (service check) | ow, bo |
| `employees.directory.view` | Employee Directory screen (placeholder page today) | ow |
| `approval.view_others_pending` | see another employee's pending list | none (super-admin) |
| `approval.auto_approve_own` | own requests skip the chain (approval BR-APR-61; new behaviour) | ow |
| `sco.view` | subcontracting screens, read (`subcontracting.md`) | ow, bo, fs, qa |
| `sco.manage`, `sco.close` | create/edit/submit/cancel, close with nothing left at vendor | ow, bo |
| `sco.issue_receive` | issue material (challan), enter receipt | ow, bo, fs |
| `sco.qa_decide` | QA accept / reject SCO receipt lines | ow, bo, qa |
| `sco.loss_override` | close an SCO with a loss write-off (BR-SCO-19) | ow |
| Approval submit / act / trail stay "any signed-in user"; who may act is decided by the approval chain. | | |

## Flow

| From | Action | To | Rule |
|---|---|---|---|
| signed out | login ok | signed in (access + refresh token) | BR-AUTH-03, 04 |
| signed in | any request | allowed / 403, using grants read now | BR-AUTH-09, 12, 18 |
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
| BR-AUTH-06 | Permission keys (`<module>.<action>`, label, one-line description) and screens (key, path, required permission key) are defined in code and synced to the DB on deploy; the app cannot create, rename or delete them. A screen removed from code disappears from every menu. | Setup shows `grn.correct` "Correct a posted GRN line"; no "add key" or "add screen" button |
| BR-AUTH-07 | Roles are data: super-admin can create, rename and delete non-system roles and grant or revoke any key except `setup.roles.manage`, which no role can be granted (400 `KEY_NOT_GRANTABLE`). | grant `setup.roles.manage` to owner → 400; create "store_keeper" with `grn.edit_draft` → saved, no deploy |
| BR-AUTH-08 | Each employee has exactly one role; access = that role's keys. | assign a second role → 400 |
| BR-AUTH-09 | An API action is allowed only if the caller is super-admin or the caller's current role holds the route's key; otherwise 403 `PERMISSION_DENIED` with the key in the body. | store_keeper (only `grn.edit_draft`) calls QA action → 403, key `grn.qa_decide` |
| BR-AUTH-10 | Every non-public route declares exactly one permission key or "any signed-in user"; a route declaring neither fails CI. | new route with no key → contract test fails |
| BR-AUTH-11 | Route, service and frontend code checks permission keys only, never role names; the only exceptions are seed data and the single super-admin check inside the permission check itself. | over-receipt guard checks `grn.over_receipt_override`, not `["owner","back_office"]` |
| BR-AUTH-12 | Every request reads the caller's active flag, role and keys from the DB (short cache, cleared on any change), so grant changes and deactivation apply on the **next request**, without re-login. | revoke `po.manage` at 10:00, same user calls PO list 10:01 → 403; deactivated → next call 401 |
| BR-AUTH-13 | Login and `/auth/me` return `role` (name, for display), `permissions: string[]` and `screens`; the UI shows menus, screens and buttons only from these. Super-admin gets every key and every screen. | user without `grn.correct` → no "Correct" button; super-admin → sees it |
| BR-AUTH-14 | Hiding in the UI is only convenience; the API check (BR-AUTH-09) decides. | hidden button called via curl → 403 |
| BR-AUTH-15 | A screen shows in the menu and opens only if the user holds its key. In Setup → Screens super-admin can change a screen's label, order and menu group, and tick which roles see it; ticking a role grants it the screen's key (the same grant as on the role page, so it also opens the API). Separate page grants (`role_pages`) are retired. | tick store_keeper on "GRN" → store_keeper gets `grn.view`, sees GRN next click; `/purchase-orders` without `po.manage` → redirects home |
| BR-AUTH-16 | No escalation: a non-super-admin can only assign a role whose keys they all hold, and never the super-admin role; super-admin may assign any role and grant any grantable key. (Fixes BL-024.) | employee manager with `setup.employees.manage` + `pr.manage` assigns owner → 403 |
| BR-AUTH-17 | No change may leave zero active employees with the super-admin role: 409 `LAST_ADMIN`. | deactivate the only super-admin, or move them to owner → 409 |
| BR-AUTH-18 | Super-admin is a fixed system role that passes every permission check, including keys added later; it cannot be renamed, deleted or copied (403 `SYSTEM_ROLE_PROTECTED`) and has no grant list to edit. Other system roles cannot be renamed or deleted, but their grants can be edited. | super-admin calls a route of a key added this release → allowed; rename owner → 403 |
| BR-AUTH-19 | A role cannot be deleted while any active employee has it (409 `ROLE_HAS_EMPLOYEES`), and cannot be renamed or deleted while an approval chain uses it (409 `ROLE_IN_APPROVAL_CHAIN`). | delete role with 2 active users → 409; rename "owner" used in PO policy → 409 |
| BR-AUTH-20 | Every role create/copy/rename/delete, grant change, screen label/order/group change, employee role change and deactivation is logged with who, when, before and after; the log cannot be edited. | revoke key → log row "Arun, 29-09 10:00, back_office −po.manage" |
| BR-AUTH-21 | The first seed grants reproduce today's API access (table above); a test proves every route gives the same allow/deny per seed role before and after. Intended differences, and only these: super-admin may override over-receipt; `/auth/register` is gone, so owner can no longer create users (only super-admin can); fs may read the machine list for the PR form (BR-AUTH-26); fs loses QA bypass (grn Q3=A); owner and fs may read suppliers (`supplier.view`, fixes owner 403 on the PO screen); owner and fs may read stock (`inventory.view`); owner may post stock-take and opening stock (`inventory.adjust`); owner's own requests auto-approve (`approval.auto_approve_own`); owner and bo get the new subcontracting keys, `sco.loss_override` owner only (new routes, nothing to compare). Any screen whose visibility changes is listed for sign-off before the switch. | fs on `GET /po` → 403 before and after; super-admin over-receipt → 403 before, allowed after; owner creates employee → 403 |
| BR-AUTH-23 | A request with a missing, expired or bad access token is rejected 401 before any permission check. | expired token on `GET /grn` → 401, not 403 |
| BR-AUTH-24 | Deny by default: a role with no keys can do nothing but sign in, and a key added in a later release is held by no role (only super-admin, by bypass) until granted in Setup or by that release's seed. | a release adds `bom.manage` without a seed → only super-admin sees the BOM menu |
| BR-AUTH-25 | A new role can be created as a copy of an existing non-super-admin role; the copy gets the same keys and is never a system role. | copy back_office as "accounts" → same keys, `isSystem=false` |
| BR-AUTH-26 | The PR "Machine" field shows only to holders of `pr.link_machine`, who may also read the active machine list for it (name and code; code added by inventory Q3=A, BR-INV-16) without `asset.manage`; a PR saved with a machine by anyone else → 403. | fs opens PR form → Machine dropdown filled; back_office → no Machine field |

## Not now

- Operator QR login (BL-017) — floor PWA milestone.
- Record-level rules ("fs sees only own PRs"), field-level permissions, amount limits per role (Odoo record rules, ERPNext user permissions, D365 data policies).
- Several roles per user, role inheritance or bundles, temporary delegation, segregation-of-duties checks.
- Splitting coarse keys (`po.manage`, `asset.manage`) into view / create / approve — do per module when its spec is written.
- Login audit (who signed in, from where, failures) and "access review" reports.
- Moving the access token out of localStorage (BL-036).
- First super-admin bootstrap is specified in `known-defects.md` (BL-004, BR-KD-17..29); with `/auth/register` gone it is the only way.

## Questions for you

None open.

## Changelog

- 2026-09-27 v0 — stub with BR-AUTH-01/02 for the BL-018 regression test.
- 2026-09-29 v1 — full draft: login, session, permission keys, data-driven roles, guardrails, no-change migration.
- 2026-09-29 v2 — Q1=A, Q2=A, Q3=A made firm (BR-AUTH-08, 12, 15). ERP benchmark added: deny by default (BR-AUTH-24), copy role (BR-AUTH-25), key labels (BR-AUTH-06), log covers deactivation (BR-AUTH-20). New key `pr.link_machine`, Q8, Q9. Acceptance criteria folded into rule examples.
- 2026-09-29 — v3: folded Q4–Q9. Q4=B super-admin bypass (BR-AUTH-09, 11, 13, 16, 17, 18, 24; sa dropped from seed table). Q5 resolved by Q4 (listed in BR-AUTH-21). Q6=A register retired, `auth.register` key removed. Q7=A `setup.roles.manage` super-admin only, not grantable (BR-AUTH-07). Q8 screens from code, labels/order/group/roles in UI (BR-AUTH-06, 15, 20). Q9=A new BR-AUTH-26. BR-AUTH-22 merged into BR-AUTH-19 (id retired). New Q10.
- 2026-09-29 — v4: Q10=A folded. Only super-admin creates users; owner loses it; `setup.employees.manage` seed stays none (Who can do what, BR-AUTH-21). Tables made compact, inline-code spacing restored.
- 2026-09-29 — consistency pass: fs removed from `grn.qa_bypass`; new keys `inventory.adjust`, `inventory.view` (inventory Q5=A), `supplier.view`, `approval.auto_approve_own`, `sco.*` (seed none until M2); BR-AUTH-21 differences extended; BR-AUTH-26 machine name and code (inventory Q3=A adds the code); bootstrap points to known-defects.
- 2026-09-29 — pre-freeze touch-up: subcontracting is built now, so `sco.view/manage/issue_receive/qa_decide/close` seed ow + bo and `sco.loss_override` ow only. Confirmed rows for `inventory.adjust`, `inventory.view`, `supplier.view`, `approval.auto_approve_own`, `pr.link_machine`; BR-AUTH-21 now also lists owner `inventory.adjust` and the `sco.*` seed. BR-AUTH-24 example no longer uses `sco.manage`.
- 2026-09-29 — frozen v5 (all questions answered by Arun)
- 2026-09-29 — v6 clarified during build: key `employees.directory.view` (ow) for the existing Employee Directory screen (owner sees it today); `landing` and `approvals` screens need no key (any signed-in user); unbuilt seed pages get no screen (BR-AUTH-06). Read routes: item list, stock movements and item last-rate need `inventory.view`; posting a movement needs `inventory.adjust`; supplier list/detail/items/services reads need `supplier.view`.
- 2026-09-29 — v7 clarified during build: `pr.link_machine` seeded to ow, bo, fs (was fs). Today owner and back office can save a maintenance PR with a machine, so BR-AUTH-21 (keep today's API access) requires it; they now also see the Machine field. The PR "Machine" field is `purchase_requests.assetId`.
- 2026-09-29 — v8 clarified during build (BR-AUTH-19): a role held only by inactive employees can't be deleted either — 409 `ROLE_HAS_INACTIVE_EMPLOYEES` ("move them to another role first"); employees always keep a role.
- 2026-09-29 — v9 clarified during build (security review): BR-AUTH-16 covers every change to an employee (edit, deactivate, QR regenerate), not only role assignment — a non-super-admin may act only on employees whose current role they could assign, never on a super-admin (403 `ROLE_NOT_ASSIGNABLE`). BR-AUTH-17's check runs inside the write transaction. BR-AUTH-20 also logs employee create, edit (email, password change — without the value — login method) and QR regenerate. BR-AUTH-05: a password or login-method change, or deactivation, revokes that employee's refresh tokens; rotation is atomic (a token can be used once even under concurrent calls). Error codes used: `ROLE_NOT_ASSIGNABLE` (BR-16), `SCREEN_HAS_NO_KEY` (BR-15, screen without a key can't be ticked), `UNKNOWN_KEY` (key not in the catalog).
