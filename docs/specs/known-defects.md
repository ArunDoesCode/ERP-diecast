---
module: known-defects
status: draft            # draft | frozen | changed-after-freeze
version: 0
frozen_on:
owner: Arun
depends_on: [purchase-requisition, approval, purchase-order, grn, inventory, auth-setup]
backlog: [BL-001, BL-004, BL-005]
---

# Known defects (M1 blockers) — functional spec

Retroactive mini-spec for three P1 items that block M1. Code exists for BL-001; BL-004/BL-005 are new
scripts. Each rule states the **should-be** behaviour; §12 says what the code does today.
Rules marked **ASSUMED — confirm** are defaults picked without an interview; confirm or change before `/freeze`.

## 1. Purpose
- **BL-001 PR cancel ("delete")** — the PR "Cancel" button has to work end to end, leave an audit trail, close
  any open approval, and never leave a PO pointing at a dead PR. Users: requester, back office, owner.
- **BL-004 bootstrap-admin** — an empty database (fresh dev machine, CI, first factory install) needs
  its first super-admin login without going around the API's rules.
- **BL-005 db:reset** — one command gives a developer a known, realistic local DB (users per role,
  suppliers, items, PR/PO/GRN in many states) and cannot wipe a non-local database by accident.

"Done" = the UI Cancel button works; `bun run db:reset` on a clean checkout gives a DB where every role
can log in and every PR/PO/GRN status is on screen; `bun run bootstrap-admin` on an empty prod DB
creates exactly one admin.

**Benchmark (adapted, not copied)**
- ERPNext: submitted docs are never deleted, only *cancelled* (docstatus 2). Cancel is blocked while a
  submitted downstream doc (PO against a Material Request) is linked. Only drafts can be hard-deleted.
- Odoo (OCA purchase_request): a request can only be removed while in draft; cancel is refused while PO lines exist.
- SAP B1: added documents cannot be deleted, only Closed/Cancelled. Cancel is refused once the doc is
  copied to a target document.
- First admin: ERPNext `bench new-site --admin-password`, Odoo master password at DB creation. Both are
  one-shot and non-interactive-capable.
- Reset safety: Rails `db:reset` raises `ProtectedEnvironmentError` on production unless an explicit
  override env is set. Same idea here: default-deny anything that isn't local.
- Adaptation: soft-cancel only, a reason is required once the PR has left draft (same as the existing PO cancel).
  Fixtures go through the real services so numbering, approval trails and `inventory_ledger` postings are genuine.

## 2. Actors & permissions
| Actor / role | PR cancel | bootstrap-admin | db:reset |
|---|---|---|---|
| super-admin, owner, floor_supervisor, back_office | yes (BR-KD-07) | — | — |
| qa_inspector, die_designer, operator | no → 403 | — | — |
| Developer / installer with shell + `DATABASE_URL` | — | yes (only if no active super-admin, BR-KD-21) | yes, local DB only (BR-KD-31/32) |

Scripts are not HTTP routes and have no `requireRole`. The guard is shell access plus the rules below.

## 3. Documents & key fields
| Record | Fields that drive rules | Notes |
|---|---|---|
| `purchase_requests` | `status` (`pr_status`), `requestedBy`, `updatedAt`, **new** `cancelledBy` (FK employees), `cancelledAt`, `cancelReason` (text ≤ 500) | New columns needed for BR-KD-08 (schema change) |
| `purchase_request_items` | `status`, `issuedQty` | read-only for cancel; cancel does not rewrite lines (see §10) |
| `pr_po_item_links` → `purchase_order_items` → `purchase_orders.status` | live link = linked PO not `cancelled` | drives BR-KD-04 |
| `approval_requests` / `approval_trails` | request `status`, trail `action=cancelled`, `actionBy`, `notes` | BR-KD-09 |
| `employees` / `roles` | `roles.name='super-admin'`, `employees.isActive`, `email` unique, `passwordHash` | BR-KD-21..26 |
| `item_master` | `currentStock`, `averageCostPaise` — **fixtures never write these** | BR-KD-47, BL-014 |
| `inventory_ledger` | only via GRN accept/bypass in fixtures | BR-KD-47 |

Money is integer paise everywhere (D-001). Quantities are `doublePrecision`, and fixtures may use decimals for kg/ltr.

## 4. State machine (PR cancel only)
| From | Action | To | Who | Preconditions | Side effects |
|---|---|---|---|---|---|
| draft | cancel | cancelled | PR roles | BR-KD-03, 07 (reason optional, BR-KD-06) | audit cols (08) |
| pending_approval | cancel | cancelled | PR roles | BR-KD-03, 06, 07 | audit cols; open approval request → cancelled + trail (09) |
| approved | cancel | cancelled | PR roles | BR-KD-03, 04 (no live PO link), 06, 07 | audit cols; approval trail if any open |
| partial_ordered / fully_ordered | cancel | — refused 409 | — | BR-KD-04 | none. Cancel the PO(s) first, then the PR recomputes to `approved` |
| rejected / cancelled | cancel | — refused 409 | — | BR-KD-05 | none |
| any | PATCH `status=cancelled` | — refused 400 | — | BR-KD-12 | none |

Terminal: `cancelled`, `rejected` (and `fully_ordered` for cancel purposes while links are live).

## 5. Business rules

### 5a. PR cancel / delete (BL-001)
- **BR-KD-01** — The system must expose PR cancel only as `DELETE /api/pr/deletepr/:id`, with the id in the path.
  The frontend must build the path with the id (`API_ROUTES.purchaseRequisitions.remove(prId)`), the same way as
  `purchaseOrders.remove`. A non-positive or non-integer `:id` → 400 `INVALID_PR_ID`.
- **BR-KD-02** — "Delete" of a PR must always be a soft cancel: the header row, lines, links and `prNumber` stay, and
  `status` becomes `cancelled`. The PR number is never reused. There is no hard-delete path in M1. **ASSUMED — confirm.**
- **BR-KD-03** — A PR may be cancelled only from `draft`, `pending_approval` or `approved`.
- **BR-KD-04** — When any line of the PR has a `pr_po_item_links` row whose PO is not `cancelled`, cancel must be
  refused with 409 `PR_HAS_PO_LINES`. The message must name the linked PO numbers and say "cancel the PO first".
  This applies whatever the header status is. **ASSUMED — confirm** (see SME Q3).
- **BR-KD-05** — Cancelling a PR in `rejected` or `fully_ordered` must return 409 `PR_NOT_CANCELLABLE`. Cancelling one
  already in `cancelled` must return 409 `PR_ALREADY_CANCELLED`, not a silent 200. **ASSUMED — confirm.**
- **BR-KD-06** — A reason is optional when cancelling from `draft`. From any other status it is required: body
  `{ "reason": string }`, trimmed length 3–500. Otherwise 400 `CANCEL_REASON_REQUIRED`. An empty body is valid for
  draft. This matches the PO cancel convention. **ASSUMED — confirm** (SME Q4).
- **BR-KD-07** — Cancel must be role-checked with `requireRole("super-admin","owner","floor_supervisor","back_office")`
  (same as the PR router). Any other role gets 403 and nothing changes. There is no ownership restriction in M1.
  **ASSUMED — confirm** (SME Q1).
- **BR-KD-08** — A successful cancel must set `cancelledBy` = JWT actor id, `cancelledAt` = now,
  `cancelReason` = reason or null, and `updatedAt` = now.
- **BR-KD-09** — When an approval request for (`pr`, id) is still open (not approved/rejected/cancelled/auto_approved),
  cancel must set it to `cancelled` and write exactly one `approval_trails` row with `action=cancelled`,
  **`actionBy` = the cancelling actor** (not the requester), and notes containing the reason.
- **BR-KD-10** — The status change, the audit columns, the approval-request cancel and the trail row must commit in
  one transaction, with the PR header row locked `FOR UPDATE`. If any step fails, nothing is changed.
- **BR-KD-11** — BR-KD-03..06 must be evaluated on the **locked** row inside the transaction. If a concurrent approve,
  PO draft or cancel changed the PR first, the later request gets the matching 409. Two simultaneous cancels give
  exactly one 200 and one 409 `PR_ALREADY_CANCELLED`.
- **BR-KD-12** — `PATCH /api/pr/updatepr` with `status: "cancelled"` must be refused with 400 `USE_CANCEL_ENDPOINT`.
  Cancel has exactly one code path.
- **BR-KD-13** — An approval action (`approve`/`reject`/`require_more_info`) on a request whose PR is `cancelled` must
  be refused with 409 and must not change the PR status. This is a guard in the approval mirror write. It will move
  to the approval spec (BL-002) once that exists.
- **BR-KD-14** — Cancel of a non-existent id → 404 `PR_NOT_FOUND`. Success → 200 `{ success: true, data: <PR> }` with
  `status: "cancelled"` and the audit fields from BR-KD-08.
- **BR-KD-15** — A cancelled PR is read-only. `PATCH /updatepr` on it (header or lines) → 409 `PR_NOT_EDITABLE`. It
  stays visible in the list and detail views and can be filtered with `status=cancelled`.
- **BR-KD-16** — Frontend: the "Cancel PR" action is shown only for `draft`/`pending_approval`/`approved`. For non-draft
  PRs it asks for a reason (3–500 chars) before calling DELETE. On success it invalidates the PR list, the PR detail
  and the approval queue queries. On 4xx it shows the server message and keeps the modal open.

### 5b. bootstrap-admin script (BL-004)
- **BR-KD-17** — The script runs as `cd backend && bun run bootstrap-admin` (`scripts/bootstrap-admin.ts`). Inputs come
  from env `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, and optionally
  `BOOTSTRAP_ADMIN_PHONE`. The password is never accepted as a CLI argument, because arguments show up in shell
  history and `ps`. **ASSUMED — confirm.**
- **BR-KD-18** — When `BOOTSTRAP_ADMIN_PASSWORD` is unset and stdin is a TTY, the script prompts twice without echo
  and the two entries must match. When stdin is not a TTY, it exits with code 4.
- **BR-KD-19** — Inputs must pass the same validation as `registerSchema` (name ≥ 1 char, valid email, password ≥ 8).
  On failure: exit 4, and the message names the field but never shows its value.
- **BR-KD-20** — If no `roles` row named `super-admin` exists, the script exits 3 with "roles not seeded — run
  seed_page_access.sql or db:reset" and writes nothing.
- **BR-KD-21** — If any **active** employee with role `super-admin` already exists, the script must refuse with exit 2
  ("already bootstrapped") and write nothing. If only inactive super-admins exist, it proceeds (lock-out recovery).
  **ASSUMED — confirm.**
- **BR-KD-22** — If the email already belongs to any employee, the script exits 5 and writes nothing. It never
  upgrades an existing user's role.
- **BR-KD-23** — The created employee has role `super-admin`, `isActive = true`, `email` and `name` from the input, and
  no `qrToken`. The script never creates an `owner`; the super-admin registers the owner afterwards via
  `/auth/register`.
- **BR-KD-24** — The password must be hashed by the same function `authService.register` uses (shared code, not a
  copy). A newly bootstrapped admin can log in immediately via `POST /api/auth/login`.
- **BR-KD-25** — The password (plain or hashed) must never be written to stdout, stderr, logs or error messages. On
  success the script prints only id, name, email and role.
- **BR-KD-26** — Audit: `createdBy` and `lastUpdatedBy` are set to the new employee's own id (self-created marker,
  since no actor exists yet). `createdAt` is now. **ASSUMED — confirm.**
- **BR-KD-27** — Check and insert run in one transaction under `pg_advisory_xact_lock(<fixed key>)`. Two simultaneous
  runs create exactly one admin, and the other run exits 2.
- **BR-KD-28** — Exit codes: `0` created · `1` unexpected error (DB unreachable, etc.) · `2` already bootstrapped ·
  `3` precondition missing (roles) · `4` invalid/missing input · `5` email conflict.
- **BR-KD-29** — bootstrap-admin has **no** localhost guard. It must work against a first factory DB, and BR-KD-21
  makes it safe to re-run. **ASSUMED — confirm.**

### 5c. db:reset script (BL-005)
- **BR-KD-30** — The script runs as `cd backend && bun run db:reset [--no-fixtures] [--allow-remote]`
  (`scripts/db-reset.ts`). It is non-interactive on a local DB.
- **BR-KD-31** — Before connecting, the script parses `DATABASE_URL`. If the host is not `localhost`, `127.0.0.1` or
  `::1`, it refuses with exit 2 and makes no connection. The only override is `--allow-remote` **and** env
  `DB_RESET_CONFIRM` equal to the target database name. **ASSUMED — confirm.**
- **BR-KD-32** — If `NODE_ENV=production`, the script always refuses with exit 2. There is no override.
- **BR-KD-33** — Before any write, the script prints the target as `host:port/dbname` (password masked) and the list of
  steps it will run.
- **BR-KD-34** — All inputs are validated **before** the drop: `DATABASE_URL` must parse (else exit 2), and
  `SEED_USER_PASSWORD` must be set and ≥ 8 chars (else exit 4). No dev password is hard-coded. **ASSUMED — confirm.**
- **BR-KD-35** — Steps run in this order: guard → drop → push → page-access seed → bootstrap admin → approval policies
  → fixtures → summary.
- **BR-KD-36** — Drop means `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`, plus `DROP SCHEMA IF EXISTS drizzle
  CASCADE`. The script never runs `DROP DATABASE` and never touches other schemas.
- **BR-KD-37** — Push runs `drizzle-kit push --force` against the same schema entry as CI (`src/db/schemas/index.ts`).
- **BR-KD-38** — Fail-fast: if any step fails, the script stops, prints the failed step name and the error, and exits 1.
  Later steps do not run. Recovery is to re-run.
- **BR-KD-39** — Two consecutive runs in the same calendar period must produce identical row counts per table and
  identical document numbers (`PR-{period}-0001` …).
- **BR-KD-40** — The page-access seed must fail loudly when a role or page name in its mapping does not exist, instead
  of dropping the row silently through the join. It must also set `is_system = true` for `super-admin`, `owner` and
  `back_office`.
- **BR-KD-41** — The admin is created through the bootstrap-admin logic (BR-KD-19..27, same code) with email
  `admin@diecast.local` (overridable by `BOOTSTRAP_ADMIN_EMAIL`) and password `SEED_USER_PASSWORD`.
- **BR-KD-42** — Approval policies are seeded by the existing `seed-approval-policies` logic, run after the admin
  exists.
- **BR-KD-43** — With `--no-fixtures`, the script stops after approval policies and prints the summary. This is the
  bare DB for tests and for UAT master-data entry.
- **BR-KD-44** — Fixture masters, at minimum:
  | Kind | Minimum set |
  |---|---|
  | locations | `Main Store` (main_store), `Scrap Yard` (scrap_yard) |
  | machines | 2 HPDC cells, e.g. "HPDC 250T #1", "HPDC 400T #2" (status idle) |
  | items (8) | ADC12 ingot (kg), LM24 ingot (kg), die release agent (ltr), cover flux (kg), plunger tip 60 mm (pcs), shot sleeve (pcs), H13 die steel block (kg), safety gloves (pcs) |
  | suppliers (4) | ingot supplier (raw_material), consumables supplier, CNC/plating job-worker (service_provider), one `both`. Each has a dummy but valid-format GSTIN/PAN and payment terms |
  | supplier_items | ≥ 1 priced link per item, `supplierUnitPricePaise` integer, GST 18%/12% |
- **BR-KD-45** — Fixture users: one desk user per role (`owner`, `back_office`, `floor_supervisor`, `qa_inspector`,
  `die_designer`) with email `<role>@diecast.local` and password `SEED_USER_PASSWORD`, plus one QR-only `operator`
  with no email or password. Each user can log in and sees the pages granted to its role.
- **BR-KD-46** — Fixture **documents** (PR, approval actions, PO, GRN) must be created through the service layer
  (`prService`, `approvalService`, `poService`, `grnService`) acting as named fixture users. No raw inserts, so
  numbering, trails and postings are real.
- **BR-KD-47** — Fixtures must never write `item_master.currentStock` or `averageCostPaise`. They also never post to
  `inventory_ledger` directly. Stock arrives only through GRN accept/bypass. Because of BL-014, `currentStock` reads 0
  after reset. That is expected and must not be papered over. The summary prints the ledger balance per item instead.
- **BR-KD-48** — Every fixture amount is an integer paise literal (e.g. `24_500` = ₹245.00). Rupee floats are not
  allowed anywhere in fixture source.
- **BR-KD-49** — State coverage after a full reset, at least one of each:
  PR `draft`, `pending_approval` (level 1 of 2), `approved`, `rejected`, `cancelled` (with reason), `partial_ordered`,
  `fully_ordered`. PO `draft`, `pending_approval`, `approved`, `dispatched`, `partial_received`. GRN `draft`,
  `accepted`, `partial_accepted` (one line rejected), plus one QA-bypassed line. Dates are relative to the run date,
  and at least one PO is past its expected delivery date.
- **BR-KD-50** — Each fixture approval step is acted on by a fixture user who holds that step's role and is not the
  requester (approvalService forbids self-approval).
- **BR-KD-51** — On success the script prints row counts per table, the fixture login emails (never passwords) and the
  ledger balance per item, then exits 0.

## 6. Cross-module effects
- **Approval** — the cancel closes the open request and writes a trail with the real actor (BR-KD-09). The mirror
  write must refuse cancelled PRs (BR-KD-13). Fixtures exercise the real policy chains.
- **Purchase order** — cancel reads `pr_po_item_links` and the PO status (BR-KD-04). PO cancel already reverts PR
  items and recomputes the PR header to `approved`, after which PR cancel is allowed. PO drafting requires the parent
  PR in `approved`/`partial_ordered`, so a committed cancel blocks new PO lines.
- **Numbering** — cancelled PR numbers are never reused. Fixtures consume `document_number_counters` from 1 on a fresh
  DB (BR-KD-39).
- **Inventory** — fixtures post only through GRN (BR-KD-47). This interacts with BL-014 (stale `currentStock`) and
  BL-016 (non-atomic GRN posting), but neither is solved here.
- **Auth/RBAC** — bootstrap-admin unblocks `/auth/register`, the approval-policy seed and CI's policy seeding. The
  page-access seed fix (BR-KD-40) gives `back_office` its pages.
- **Schema** — new `purchase_requests.cancelled_by / cancelled_at / cancel_reason`. New scripts in
  `backend/package.json`. New env vars in `.env.example` (`SEED_USER_PASSWORD`, `BOOTSTRAP_ADMIN_*`, `DB_RESET_CONFIRM`).
- **CI** — `.github/workflows/ci.yml` "Schema + seed" can become `bun run db:reset --no-fixtures`, with
  `SEED_USER_PASSWORD` set in the job env.

## 7. Acceptance criteria
PR cancel
- **AC-01** (BR-KD-01) — Given PR 12 in draft, when the UI clicks Cancel, then the request is `DELETE /api/pr/deletepr/12` and it returns 200.
- **AC-02** (BR-KD-01) — Given any user, when `DELETE /api/pr/deletepr/abc` is called, then the response is 400 `INVALID_PR_ID`.
- **AC-03** (BR-KD-02, 14) — Given PR-2609-0003 in draft, when it is cancelled, then the row still exists with status `cancelled`, the lines are unchanged, and the next new PR does not get number 0003.
- **AC-04** (BR-KD-03, 06, 08) — Given a PR in `pending_approval`, when back_office cancels it with reason "duplicate", then the status is `cancelled`, `cancelledBy` is that user, `cancelReason` is "duplicate", and `cancelledAt` is set.
- **AC-05** (BR-KD-04) — Given an approved PR with one line linked to PO-2609-0002 in `draft`, when it is cancelled, then the response is 409 `PR_HAS_PO_LINES` mentioning PO-2609-0002, and nothing changes.
- **AC-06** (BR-KD-04) — Given a PR in `partial_ordered` whose only linked PO is then cancelled (the PR recomputes to `approved`), when the PR is cancelled with a reason, then the response is 200.
- **AC-07** (BR-KD-05) — Given a `rejected` PR, when it is cancelled, then the response is 409 `PR_NOT_CANCELLABLE`.
- **AC-08** (BR-KD-05, 11) — Given a `cancelled` PR, when it is cancelled again, then the response is 409 `PR_ALREADY_CANCELLED` and no second trail row is written.
- **AC-09** (BR-KD-06) — Given an approved PR, when it is cancelled with no body or with reason "  ", then the response is 400 `CANCEL_REASON_REQUIRED`.
- **AC-10** (BR-KD-06) — Given a draft PR, when it is cancelled with an empty body, then the response is 200 and `cancelReason` is null.
- **AC-11** (BR-KD-07) — Given a qa_inspector token, when they cancel any PR, then the response is 403 and the PR is unchanged.
- **AC-12** (BR-KD-09) — Given a PR in `pending_approval` raised by user A, when user B cancels it, then the approval request is `cancelled` and exactly one trail row exists with `action=cancelled`, `actionBy=B`, and notes containing the reason.
- **AC-13** (BR-KD-10) — Given the trail insert fails (simulated), when the PR is cancelled, then the PR status is still `pending_approval` and the approval request is still open.
- **AC-14** (BR-KD-11) — Given an approved PR, when a PO-line draft and a PR cancel run concurrently, then exactly one succeeds. Either the PO line exists and the cancel gets 409 `PR_HAS_PO_LINES`, or the PR is cancelled and PO creation fails.
- **AC-15** (BR-KD-11) — Given a draft PR, when two cancel requests run concurrently, then one gets 200 and the other gets 409 `PR_ALREADY_CANCELLED`.
- **AC-16** (BR-KD-12) — Given a draft PR, when `PATCH /api/pr/updatepr {prId, status:"cancelled"}` is sent, then the response is 400 `USE_CANCEL_ENDPOINT` and the status stays `draft`.
- **AC-17** (BR-KD-13) — Given a PR cancelled while its approval request was (wrongly) left pending, when the approver approves, then the response is 409 and the PR stays `cancelled`.
- **AC-18** (BR-KD-14) — Given no PR with id 99999, when it is cancelled, then the response is 404 `PR_NOT_FOUND`.
- **AC-19** (BR-KD-15) — Given a cancelled PR, when a PATCH changes notes or adds a line, then the response is 409 `PR_NOT_EDITABLE`; and when the list is filtered `status=cancelled`, then the PR appears.
- **AC-20** (BR-KD-16) — Given a `fully_ordered` or `rejected` PR open in the UI, then no Cancel button is shown. Given an approved PR, when Cancel is clicked, then a reason field is required before the request is sent, and on success the list, detail and approval queue refresh.

bootstrap-admin
- **AC-21** (BR-KD-17, 23, 24, 28) — Given a seeded DB with no employees, when `BOOTSTRAP_ADMIN_*` are set and the script runs, then it exits 0, a super-admin exists, and `POST /auth/login` with those credentials returns 200.
- **AC-22** (BR-KD-18) — Given the password env is unset and stdin is not a TTY, when the script runs, then it exits 4 and writes nothing.
- **AC-23** (BR-KD-19, 25) — Given password "short", when the script runs, then it exits 4, the message names `password`, and "short" appears nowhere in the output.
- **AC-24** (BR-KD-20) — Given an empty DB without roles, when the script runs, then it exits 3 and no employee exists.
- **AC-25** (BR-KD-21) — Given an active super-admin exists, when the script runs with a different email, then it exits 2 and the employee count is unchanged.
- **AC-26** (BR-KD-21) — Given the only super-admin is inactive, when the script runs, then it exits 0 and a new active super-admin exists.
- **AC-27** (BR-KD-22) — Given `owner@x.in` exists as owner and there is no super-admin, when the script runs with that email, then it exits 5 and the owner's role is unchanged.
- **AC-28** (BR-KD-25) — Given a successful run, when stdout and stderr are captured, then neither the password nor the hash appears.
- **AC-29** (BR-KD-26) — Given a successful run, then the new row has `createdBy = lastUpdatedBy = id`.
- **AC-30** (BR-KD-27) — Given no super-admin, when two runs start at the same time, then exactly one exits 0 and the other exits 2. There is 1 super-admin.
- **AC-31** (BR-KD-29) — Given `DATABASE_URL` points to a non-localhost host with no super-admin, when the script runs, then it is not refused because of the host.

db:reset
- **AC-32** (BR-KD-31) — Given `DATABASE_URL=postgres://u:p@db.example.com:5432/diecast`, when `db:reset` runs, then it exits 2 before connecting and the remote DB is untouched.
- **AC-33** (BR-KD-31) — Given a remote host with `--allow-remote` but `DB_RESET_CONFIRM` missing or wrong, then it exits 2. With both set correctly, it proceeds.
- **AC-34** (BR-KD-32) — Given `NODE_ENV=production` and a localhost host, when the script runs, then it exits 2 even with `--allow-remote`.
- **AC-35** (BR-KD-33, 34) — Given `SEED_USER_PASSWORD` is unset, when the script runs, then it exits 4, the existing local data is still present (no drop happened), and the printed target shows `***` in place of the password.
- **AC-36** (BR-KD-35, 36, 37) — Given a local DB with extra junk tables in `public`, when the script runs, then the junk is gone and the schema matches `src/db/schemas`.
- **AC-37** (BR-KD-38) — Given the fixtures step throws, when the script runs, then it exits 1, prints "fixtures" as the failed step, and does not print the summary.
- **AC-38** (BR-KD-39) — Given two consecutive full runs, then the per-table row counts and the first PR number are identical.
- **AC-39** (BR-KD-40) — Given the mapping contains an unknown role name, when the seed runs, then it fails naming that role. Given the fixed mapping, then `back_office` has the `purchase-requisitions` page and `owner` has `is_system = true`.
- **AC-40** (BR-KD-41, 42) — After a reset, `admin@diecast.local` can log in and the number of approval policies equals the count defined in `seed-approval-policies.ts` (19 today).
- **AC-41** (BR-KD-43) — Given `--no-fixtures`, then there are 0 suppliers, 0 PRs and 1 employee, and the script exits 0.
- **AC-42** (BR-KD-44, 45) — After a full reset, each of the 5 desk-role emails can log in, the operator has no email, and there are ≥ 8 items, ≥ 4 suppliers and 1 `main_store` location.
- **AC-43** (BR-KD-46, 50) — After a full reset, every approved PR has a `submitted` trail plus an approval trail row whose `actionBy` differs from the PR's `requestedBy`.
- **AC-44** (BR-KD-47) — After a full reset, every `inventory_ledger` row references a GRN (`grn`/`grn_bypass`), and `item_master.currentStock` and `averageCostPaise` are at their defaults.
- **AC-45** (BR-KD-48) — The fixture source contains no non-integer money literal (a lint/test greps `*Paise` values).
- **AC-46** (BR-KD-49) — After a full reset, `GET /pr/getprs?status=<s>` returns ≥ 1 row for each of the 7 PR statuses, and the same holds for the listed PO/GRN statuses.
- **AC-47** (BR-KD-51) — After a successful run, the output lists the login emails and per-item ledger balances, contains no password, and the exit code is 0.

## 8. Screens (frontend)
- **PR edit modal footer** (`PurchaseRequisitionModals.tsx`) — the "Cancel PR" button is visible only in
  draft/pending_approval/approved. For non-draft PRs a confirm dialog with a required reason (3–500) appears. The
  button calls `useDeletePurchaseRequisitionMutation(prId, reason)`, not the update mutation.
- **PR cards/list** — cancelled PRs render greyed out (already the case) and open read-only.
- No new screens for the scripts.

## 9. Reports / queries needed
- None new. The `db:reset` summary (BR-KD-51) serves as the fixture sanity report.

## 10. Out of scope / later
- **BL-002** approval-policy decision (`isSaleOrderLinked`) and the full approval spec. BR-KD-13 is a guard that moves there.
- **BL-014** deriving `currentStock`/`averageCostPaise` from the ledger (GRN/inventory spec). BL-016 atomic GRN posting.
- Hard delete of never-submitted drafts (BR-KD-02 keeps soft-cancel only).
- Line-level cancel / short-close of the un-ordered remainder of a partially ordered PR (SME Q3).
- Setting PR line statuses to `cancelled` on header cancel (BL-019 territory, PR spec).
- Password reset / recovery for a locked-out admin beyond BR-KD-21. Operator QR login (BL-017).
- Separate test DB (BL-006), generated migrations instead of push (BL-011).
- Restricting `owner` from registering a `super-admin` via `/auth/register` (gap found, needs its own BL item).

## 11. Open questions for factory SME
1. Can a floor supervisor cancel a PR that someone else raised, or only their own? (default: anyone with PR access)
2. After a PR is approved, can the person who raised it cancel it with a reason, or must the owner do it? (default: anyone with PR access, reason required)
3. If half a PR is already on a PO, do you cancel the leftover lines only, or leave the PR open until the PO is cancelled? (default: block until the PO is cancelled)
4. Do you need a written reason to cancel a PR that was never submitted for approval? (default: no)
5. Who at the plant should hold the first super-admin login: the owner, or an accounts/IT person? (decides who runs bootstrap-admin at install)
6. For test data: name your 5 most-bought items with their unit (kg/pcs/ltr) and a rough rate in ₹. (default: the list in BR-KD-44)

Developer decisions pending (not SME)
- D1: Should fixtures set `averageCostPaise` as an opening standard cost? Without it, every PR estimate is ₹0 and
  every PR hits the "<₹10k" policy tier. This depends on the BL-014 decision. Default: no (BR-KD-47).
- D2: Idempotent 200 vs 409 for a repeat cancel (BR-KD-05). Default: 409.

## 12. Implementation status
| BR | Status | Current code / gap | Test |
|---|---|---|---|
| 01 | todo | FE sends `DELETE /pr/deletepr` with body `{prId}` (`routes.ts:120`, `fetchers.ts:54-58`); BE path `/deletepr/:id` is correct | — |
| 02 | done (BE) | `setStatusCancelled` is a soft update | — |
| 03–04 | todo | `PR_STATUS_TRANSITIONS` allows `approved/partial_ordered → cancelled` with no PO-link check (`prService.ts:17-18`) | — |
| 05 | todo | same-status early return makes cancel of a cancelled PR a 200 (`prService.ts:28-30`) | — |
| 06, 08 | todo | no reason, no actor, no audit columns (`prController.ts:52-60`, schema `02_procurement-purchasing.ts:37-54`) | — |
| 07 | done | router-level `requireRole` (`routes/pr.ts:29-33`) | — |
| 09 | partial | cancels the request but trail `actionBy = requestedBy` (`approvalRepository.ts:837`) | — |
| 10–11 | todo | status write and approval cancel are separate transactions, no lock (`prService.ts:332-348`, `prRepository.ts:527-535`) | — |
| 12 | todo | PATCH accepts `status=cancelled` and skips the approval cancel (`prService.ts:140-142,165`); the UI uses this path (`PurchaseRequisitionModals.tsx:598-627`) | — |
| 13 | todo | `updatePrApprovalMirror` writes unconditionally (`approvalRepository.ts:641-671`) | — |
| 14 | partial | 404 exists; error codes not set | — |
| 15 | todo | `prService.update` never checks the current status before editing (`prService.ts:120-176`) | — |
| 16 | todo | button shown for every non-cancelled status (`PurchaseRequisitionModals.tsx:880`) | — |
| 17–29 | todo | no script; `seed-approval-policies.ts:270-285` needs a super-admin nothing creates | — |
| 30–39, 41–51 | todo | no script, no guard (`db/client.ts:7`, `drizzle.config.ts:23`); CI hand-rolls push + seed (`ci.yml:40-45`) | — |
| 40 | todo | `'back-office'` vs role `back_office` silently drops 15 grants (`seed_page_access.sql:90-104`); `is_system` never set (`:14`) | — |

## Changelog
- 2026-09-27 v0 — draft created (BL-001, BL-004, BL-005)
