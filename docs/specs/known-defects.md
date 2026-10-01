---
module: known-defects
status: frozen           # draft | frozen | changed-after-freeze
version: 5
frozen_on: 2026-10-01
owner: Arun
depends_on: [purchase-requisition, approval, purchase-order, grn, inventory, auth-setup]
backlog: [BL-001, BL-004, BL-005, BL-071]
---
# Known defects (M1 blockers)

## Summary

Three P1 fixes that block M1:

- **BL-001 PR cancel**: the "Cancel PR" button works end to end, leaves an audit trail, closes any open
  approval, and never leaves a PO pointing at a dead PR.
- **BL-004 bootstrap-admin**: an empty DB (dev, CI, first factory install) gets its first super-admin login.
- **BL-005 db:reset**: one command gives a local DB with users per role and PR/PO/GRN in every state. It
  cannot wipe any DB but a local test DB without a typed confirm (BL-071). The test DB is built the same
  way locally and in CI.

Done = Cancel works in the UI; `bun run db:reset` gives a DB where every role can log in and every
PR/PO/GRN status shows up; `bun run bootstrap-admin` on an empty prod DB creates exactly one admin.

## Who can do what

| Action | Allowed |
|---|---|
| Cancel a PR | its requester or super-admin, per `purchase-requisition.md` (BR-PR-17, 45) |
| Run bootstrap-admin | the plant IT person (shell + `DATABASE_URL`), only while no active super-admin exists |
| Run db:reset | anyone with shell; no confirm only for a local `*_test` DB (BR-KD-30) |
| Run db:test:prepare | anyone with shell; test DB only (BR-KD-52) |

Scripts are not HTTP routes. Their guard is shell access plus the rules below.

## Rules

### PR cancel (BL-001)

PR cancel is owned by `purchase-requisition.md`; its error codes are the only ones. The BL-001 fix is done
when these PR rules pass. Old ids kept so tests can map:

| ID | Now defined in | Covers |
|---|---|---|
| BR-KD-01 | BR-PR-43, BR-PR-15 | one cancel path, bad/unknown id, PATCH `status` refused (`PR_STATUS_VIA_ACTION`) |
| BR-KD-02 | BR-PR-43, BR-PR-15 | soft cancel, number kept, read-only, `cancelled` filter |
| BR-KD-03 | BR-PR-39 | cancellable statuses; rejected/cancelled → 409 `PR_INVALID_TRANSITION` |
| BR-KD-04 | BR-PR-39 | line on a live PO → 409 `PR_HAS_ORDERED_LINES` naming the POs, "cancel the PO first" |
| BR-KD-06 | BR-PR-41 | reason always, 3–500, `PR_CANCEL_REASON_REQUIRED` |
| BR-KD-07 | BR-PR-17, 45 | `pr.manage` needed; only requester or super-admin cancels (403 `PR_NOT_REQUESTER`) |
| BR-KD-08 | BR-PR-41, 46 | who, when, reason saved |
| BR-KD-09 | BR-PR-42, BR-APR-48 | open approval closed, one trail row, actor = canceller |
| BR-KD-10 | BR-PR-47 | all-or-nothing, row lock, loser gets 409 |
| BR-KD-13 | BR-APR-48, 30 | action on a cancelled PR's request → 409 `APPROVAL_NOT_PENDING` |
| BR-KD-16 | BR-PR-39 | Cancel PR screen: button state, reason first, refresh, error handling |

### bootstrap-admin (BL-004)

| ID | Rule | Example (given → then) |
|---|---|---|
| BR-KD-17 | Run as `bun run bootstrap-admin`. Name, email, password (and optional phone) come from `BOOTSTRAP_ADMIN_*` env, never a command-line argument and never stored in code. No password env + a terminal → ask twice without echo, must match; no terminal → exit 4. Inputs follow the normal employee rules (email valid, password ≥ 8); the error names the field, never its value. | Password "short" → exit 4, message says `password`, "short" not printed |
| BR-KD-20 | Writes nothing and exits if: roles not seeded (exit 3, "run db:reset"); an **active** super-admin exists (exit 2, "already bootstrapped"); the email already belongs to someone (exit 5, never upgrades them). Only inactive super-admins → it proceeds, for lock-out recovery. | Active super-admin exists → exit 2, employee count unchanged |
| BR-KD-23 | Creates one active super-admin (never an owner), password hashed the same way as normal employee creation, so they can log in right away. At the plant this login belongs to the IT person, who puts the email and password in `BOOTSTRAP_ADMIN_*` env at install and runs the script (BR-KD-17); nobody types a user row into the DB by hand. Created-by/updated-by = their own id. | Run on seeded empty DB → exit 0, login with those details → 200 |
| BR-KD-25 | The password, plain or hashed, never appears in any output or log. Success prints only id, name, email, role. | Capture stdout/stderr of a good run → no password, no hash |
| BR-KD-27 | Two runs at the same time create exactly one admin; the other exits 2. | Parallel runs → one exit 0, one exit 2, 1 super-admin |
| BR-KD-28 | Exit codes: 0 created, 1 unexpected error, 2 already bootstrapped, 3 roles missing, 4 bad input, 5 email taken. | DB unreachable → exit 1 |
| BR-KD-29 | No localhost guard: it must work on the first factory DB; BR-KD-20 makes re-runs safe. | Remote DB, no super-admin → runs |

### db:reset (BL-005)

| ID | Rule | Example (given → then) |
|---|---|---|
| BR-KD-30 | Run as `bun run db:reset [--no-fixtures] [--allow-remote]`. Only a local (localhost/127.0.0.1/::1) DB whose name ends in `_test`, on port 5432 or 5433, runs without a confirm. Any other local DB, **including `diecast`**, needs `DB_RESET_CONFIRM=<db name>`. A non-local host needs `--allow-remote` **and** that confirm. A confirm that is set but does not match the DB name is always refused. `NODE_ENV=production` → always refused, no override. Every refusal is exit 2 before connecting, data untouched. | Local `diecast`, no confirm → exit 2, dev data untouched; local `diecast`, `DB_RESET_CONFIRM=diecast_test` → exit 2; local `diecast`, `DB_RESET_CONFIRM=diecast` → runs; local `diecast_test` on 5433, no confirm → runs; local `diecast_test` on 6543, no confirm → exit 2; `db.example.com` with confirm, no `--allow-remote` → exit 2; production on localhost → exit 2 |
| BR-KD-33 | Before any write: print the target as `host:port/db` with the password masked, and the steps. Check all inputs before dropping: bad `DATABASE_URL` → exit 2; `SEED_USER_PASSWORD` missing or < 8 → exit 4. No dev password in the code. | No seed password → exit 4, old data still there, target shows `***` |
| BR-KD-35 | Steps in order: guard → drop `public` (and `drizzle`) schema only, never the DB → push schema (same as CI) → roles + permission-key seed (auth-setup BR-AUTH-21) → admin via BR-KD-17..27 (`admin@diecast.local`) → approval policies → fixtures → summary. `--no-fixtures` stops after policies; this is the one test-DB build, used by CI and by `db:test:prepare` (BR-KD-52). Any step fails → stop, print the step name, exit 1. Two runs give the same row counts and document numbers. | Fixtures throw → exit 1, "fixtures" printed, no summary; `--no-fixtures` → 1 employee, 0 PRs, baseline approval policies present |
| BR-KD-40 | The role + permission-key seed (auth-setup BR-AUTH-21; page grants are retired, BR-AUTH-15) fails loudly on an unknown role or key, never drops rows silently. It marks super-admin, owner and back_office as system roles. | Unknown key in the seed table → fails naming it; back_office gets `pr.manage` |
| BR-KD-44 | Fixtures hold at least: Main Store + Scrap Yard; 2 HPDC machines; 8 items, each with a standard rate (ADC12 and LM24 ingot kg, release agent ltr, cover flux kg, plunger tip, shot sleeve, H13 block kg, gloves); 4 suppliers with valid-format GSTIN/PAN and priced items; one login per desk role (`<role>@diecast.local`) plus one QR-only operator. At least one of each PR, PO and GRN status, one QA-bypassed line, and one overdue PO; dates relative to the run date. | After reset each desk role logs in; `status=<s>` returns ≥ 1 PR for all 7 PR statuses |
| BR-KD-46 | Fixture documents go through the real services as named fixture users, so numbers, trails and stock postings are real. Each approval is done by someone holding that step's role who is not the requester, with a comment (BR-APR-37). Stock arrives only via GRN; fixtures never set stock or average cost directly — after reset each item's `currentStock` equals its ledger balance (BL-014 fixed). All money is integer paise. The summary prints row counts, login emails (no passwords) and ledger balance per item. | Every ledger row points to a GRN; `24_500` not `245.00` |
| BR-KD-52 | `bun run db:test:prepare` builds the test DB by running `db:reset --no-fixtures` (BR-KD-35) with `DATABASE_URL` set to `DATABASE_URL_TEST`: one build path, so local and CI test DBs never drift. Before that it refuses with exit 2, nothing changed, if `DATABASE_URL_TEST` is missing, not a valid URL, names a DB not ending in `_test`, or equals `DATABASE_URL`. It needs `SEED_USER_PASSWORD` like db:reset (exit 4). | `DATABASE_URL_TEST=…/diecast` → exit 2, dev DB untouched; `DATABASE_URL_TEST` = `DATABASE_URL` → exit 2; good run → same roles, permission keys, approval policies and employee count as CI's `db:reset --no-fixtures` |
| BR-KD-53 | The guard (BR-KD-30, 52) judges the DB the driver will really connect to: it reads host, port and database name the way the postgres driver does (`PGHOST` / `PGPORT` / `PGDATABASE` count when the URL omits them). A URL with no database name, with more than one host, or whose name can't be read exactly is refused: exit 2 before connecting, data untouched. An empty confirm counts as no confirm. `NODE_ENV` is compared case-insensitively. | `postgres://u:p@localhost:5432` (no DB name) → exit 2; `postgres://a@b,prod.example.com:p@localhost:5433/x_test` → exit 2; URL without port + `PGPORT=6543` on a `_test` DB → exit 2; `DB_RESET_CONFIRM=` (empty) on local `diecast` → exit 2; `NODE_ENV=Production` → exit 2 |

## Not now

- Role checks by permission key everywhere: auth-setup spec.
- Stock and average cost from the ledger (BL-014); atomic GRN posting (BL-016).
- Hard delete of drafts. PR line cancel and line status on header cancel are owned by `purchase-requisition.md` (BR-PR-33, 39).
- Admin password reset beyond BR-KD-20; operator QR login (BL-017).
- Separate test DB (BL-006); migrations instead of push (BL-011).

## Questions for you

None open.

## Changelog

- 2026-09-27 v0 — draft created (BL-001, BL-004, BL-005)
- 2026-09-28 — rewritten in slim format. Merged: 12, 14 → 01; 15 → 02; 05 → 03; 11 → 10; 18, 19 → 17; 21, 22 → 20; 24, 26 → 23; 31, 32 → 30; 34 → 33; 36–39, 41–43 → 35; 45, 49 → 44; 47, 48, 50, 51 → 46.
- 2026-09-29 — answers folded in. Q2=A (BR-KD-04), Q3 reason always required (BR-KD-06, 16, flow), Q4 IT person holds first admin (BR-KD-23, who-table; how → Q4 reworded), Q5=A (BR-KD-44), Q6=A (BR-KD-46), Q7 409 + disabled button (BR-KD-03, 16). Q1 kept for clarification. Roles → `pr.manage` (BR-KD-07, who-table).
- 2026-09-29 — consistency pass: PR-cancel rules (BR-KD-01..16) now point to `purchase-requisition.md`, one set of codes (PR's); flow table dropped. Q1 merged into PR Q3. Page-access seed → permission-key seed (BR-KD-35, 40). "owner registers super-admin" dropped (register retired). Q4 reworded.
- 2026-09-29 — final answers folded. Q4=A: IT person uses env + `bun run bootstrap-admin` (BR-KD-23). PR Q3=A carried into BR-KD-07 and who-table. PR Q2=A: fixture items get a standard rate (BR-KD-44, 46). "(assumed)" tags dropped (BR-KD-20, 23, 29, 30, 33). Not-now BL-019 line fixed to point at PR spec. Tables re-padded.
- 2026-09-29 — frozen v1 (all questions answered by Arun)
- 2026-09-29 — v2 clarified during build: every fixture login, including `admin@diecast.local` (super-admin), uses `SEED_USER_PASSWORD`; desk fixture users are `<role>@diecast.local` (owner, back_office, floor_supervisor, qa_inspector, die_designer). The "fixtures throw" (BR-KD-35) and "unknown seed key" (BR-KD-40) failure paths are not covered by automated tests (no test-only hooks in production code).
- 2026-09-29 — v3 clarified during build (security review): BR-KD-30's local guard also requires `DB_RESET_CONFIRM=<db name>` when the database name is not `diecast` or ends in `_test`, or the local port is not 5432/5433 (an SSH tunnel to a real DB on localhost must not pass unconfirmed); for such a local target the confirm alone is enough — `--allow-remote` stays for non-local hosts. After a run with `--allow-remote`, the summary prints "rotate the seed admin password now".
- 2026-09-29 — v4 clarified during build: BL-014 is fixed (GRN accept posts stock and average cost), so BR-KD-46 no longer expects `currentStock` 0 after reset; it expects `currentStock` = ledger balance per item, with no direct writes.
- 2026-10-01 — v5 change request #56 (BL-071), pending re-freeze: BR-KD-30 now lets only a local `*_test` DB on 5432/5433 reset without a confirm; local `diecast` and any other DB need `DB_RESET_CONFIRM=<db name>`, a wrong confirm is exit 2 (replaces v3's "diecast is usual" and "confirm without --allow-remote is refused"). New BR-KD-52: `db:test:prepare` = `db:reset --no-fixtures` on `DATABASE_URL_TEST`, refuses a non-test URL. BR-KD-35 names it the one test-DB build. Who-table updated.
- 2026-10-01 — v5 frozen (Arun): BR-KD-30, 35, 52 as above; no open questions.

- 2026-10-01 — v5 clarified during build (security + code review SEC-1, SEC-2, CR-1): new BR-KD-53 — the guard checks the DB the driver will really use; no DB name / several hosts / empty confirm are refused. No other rule changed.