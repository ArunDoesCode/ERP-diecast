---
module: api-standards
status: frozen           # draft | frozen (set only by /freeze)
version: 2
frozen_on: 2026-11-18
owner: Arun
depends_on: [auth-setup, suppliers, inventory, purchase-requisition, purchase-order, grn, grn-stock, subcontracting, approval, approval-policies, db-migrations, known-defects, design-system]
brief: docs/plans/standards-baseline-2026-11-18.md   # owner instruction of 2026-11-18, quoted below; no separate brief
research:                # none: choices follow the code's own conventions + ERPNext / Odoo / SAP B1, logged in assumptions.md
---

# API standards (cross-cutting)

> Agent layer. The owner reads `OWNER.md`. Index plan: `design/data.md`. Error contract, search and every
> field limit: `design/api.md`. Cases: `design/edge-cases.md`. Choices made without the owner: `assumptions.md`.
> This spec changes no business rule of any module. Where a frozen module spec says something else, that spec wins.

## Summary
Owner, 2026-11-18: "Clear the standards findings (216 backend, 65 frontend), then make the checks and the two
hooks block. Do the backend ones first: the missing 409 mapping, the unescaped `ilike` searches, and the
missing indexes."

Every rule of the two standards checks (`backend/scripts/standards-check.ts`, `frontend/scripts/standards-check.ts`)
becomes a business rule here with an example a test can assert. Done = backend check prints 0 findings and
blocks CI; frontend check blocks on `mutation-invalidate` and `motion`; both hooks deny by default.
Example data used below: item `ADC12` (kg), item "50% flux", supplier "Hindalco", a required-by date of
2026-11-18, server clock 2026-11-18T20:00:00Z (= 01:30 on 19 Nov in India).

Baseline (commit 930eec2): backend 216 = idx-fk 72, idx-filter 35, raw-ilike 32, zod-string 55, zod-number 18,
db-error-409 2, ist-date 2. Frontend 65 = mutation-invalidate 1, motion 2, raw-palette 62 (not in scope).
Added by the pre-freeze review: new check rule `zod-array` (24 hits today), `raw-ilike` also inside `sql`
templates (3 more hits), exemption tags for the index rules, BR-STD-43 (round 2). The one owner decision (Card 1, money limit) is answered: 64-bit now.

## Who can do what
No new permission key, no new route, no change to who may do what.
| Action | Key | Seed roles |
|---|---|---|
| (none added) | — | — |

## Flow
No document, no states. Build order (owner: backend first): errors → search → indexes → input limits →
money limit → IST day → frontend fixes → blocking → tooling.

## Rules
IDs are permanent. Tests are named by rule id. "400" = the existing validation answer
(`{ success: false, message: "Validation failed" }`); "409 body" = `design/api.md` → Error contract.
"Checked by": a standards-check rule name, `backend test`, `Playwright`, `script` or `human`.

### Conflict errors (check rule `db-error-409`)
| ID | Rule | Example (given → then) | Checked by |
|---|---|---|---|
| BR-STD-01 | A Postgres unique violation (23505) that no service caught answers HTTP 409 with `code: "DUPLICATE_RECORD"` and message "This record already exists.", never 500. | (a) the shared handler gets a thrown error whose `cause.code` is `"23505"` → 409 `DUPLICATE_RECORD`; (b) `POST /api/setup/employees` twice with email `a@x.in` (`employees.email` is unique, no service pre-check) → second call 409, one employee row | `db-error-409`, backend test |
| BR-STD-02 | A Postgres foreign-key violation (23503) that no service caught answers HTTP 409 with `code: "LINKED_RECORD"` and message "This record is linked to another record that is missing or still in use.", never 500. | (a) the shared handler gets a thrown error whose `cause.code` is `"23503"` → 409 `LINKED_RECORD`; (b) a test-only route on the real app deletes a `roles` row that an employee still points to (`employees.role_id`) → 409, the role is still there | `db-error-409`, backend test |
| BR-STD-03 | The 409 body from BR-STD-01/02 has exactly `success`, `message`, `code`; it never carries a constraint, table or column name, SQL text or the driver message, in any `NODE_ENV` (development included). | `NODE_ENV=development`, 23505 on `employees_email_key` → body has no "employees", no "_key", no "duplicate key" | backend test |
| BR-STD-04 | The error is recognised anywhere in the cause chain (Drizzle wraps the driver error), through `isUniqueViolation()` / `isForeignKeyViolation()` in `backend/src/lib/db-errors.ts`. | `DrizzleQueryError` whose `cause.code` is `"23503"` → 409 `LINKED_RECORD` | backend test |
| BR-STD-05 | The hand-written catches stay and win: a service that catches 23505 keeps its own message and code; the shared handler is only the safety net. | second submit of the same document → still 409 `APPROVAL_ALREADY_OPEN`; active policy into a taken slot → still 409 `POLICY_PRIORITY_TAKEN` | backend test |
| BR-STD-06 | Any other database error stays a 500 with message "Internal server error" outside development. | Postgres 23502 (not-null violation) → 500, not 409 | backend test |
| BR-STD-34 | Every mapped 409 is logged once, by `onError`: `console.error("db-conflict", fields)` for 23503, `console.warn("db-conflict", fields)` for 23505 (no logger module exists in `backend/src/lib`). `fields` is exactly `{ pgCode, constraint, table, method, path, actorId }`. The log never holds the request body, any value or the driver `detail`; `asyncHandler` (`src/lib/async-handler.ts:15`), which today prints the whole error object, skips its print for 23505 / 23503. | duplicate email `a@x.in`, with spies on `console.warn` and `console.error` → one `warn` call with `{ pgCode: "23505", constraint: "employees_email_key", table: "employees", method: "POST", path: "/api/setup/employees", actorId }`, no `error` call; no call argument, as JSON, holds "a@x.in" or "Key (" | backend test |
| BR-STD-35 | A 23505 / 23503 raised inside a transaction rolls the whole transaction back: nothing of that request is saved. | the duplicate-email create writes the employee and an audit row in one transaction → after the 409 there is no second employee and no new audit row | backend test |
| BR-STD-36 | Whether a unique value already exists is shown only to callers who hold the create or edit permission of that module: the permission check runs first (403), and the public routes (BR-STD-42) never answer 409: `onError` (exported from `src/app.ts` as `handleAppError`) matches `c.req.path` against the public list and skips the 23505 / 23503 branch there, answering 500 "Internal server error" in every `NODE_ENV`. | a role without `setup.employees.manage` posts the duplicate email → 403 `PERMISSION_DENIED`; a bare Hono app with `onError(handleAppError)` and a route that throws an error whose `cause.code` is `"23505"`: mounted at `POST /api/auth/login` → 500 "Internal server error", no `code`; mounted at `POST /api/x` → 409 `DUPLICATE_RECORD` | backend test |

### Search (check rule `raw-ilike`)
| ID | Rule | Example (given → then) | Checked by |
|---|---|---|---|
| BR-STD-07 | Every text search is built by `backend/src/lib/safe-search.ts`; no `ilike` exists anywhere else in `backend/src`, as a call or inside a `sql` template. | check prints `raw-ilike 0`; the local `escapeLike()` / `likePattern()` copies are gone | `raw-ilike` |
| BR-STD-08 | `%`, `_` and `\` typed by the user match themselves, never "anything", on every search including the three `sql` template sites (PR type / status, location type). | items "50% flux" and "500 flux": `q=50%` → only "50% flux"; `q=__` with no double underscore in any name → 0 rows; `q=a\b` → only names holding `a\b`, no SQL error; PR list `q=dr_ft` → 0 rows | backend test |
| BR-STD-09 | Search ignores case and matches any part of the text. | `q=hind` → "Hindalco"; `q=ALCO` → "Hindalco" | backend test |
| BR-STD-10 | The term is trimmed first; an empty or spaces-only term means "no search filter" on every list where `q` is optional. | `q=` or `q=%20%20` on the PR list → 200 with the same rows as no `q` | backend test |
| BR-STD-11 | A term longer than 100 characters after trimming is refused with 400 before any query runs. | `q` of 100 characters → 200; 101 characters → 400 | backend test |
| BR-STD-12 | Which columns each list searches does not change. | supplier search still matches name, contact person, email, phone, GSTIN and supplied SKU (BR-SUP-23) | backend test |
| BR-STD-37 | The search pattern always reaches the database as a bound parameter, never as part of the SQL text. One shared `searchTermSchema` is the `q` of every list query schema (13 schemas, named in `design/api.md`). | `q=x' OR '1'='1` on the supplier list → 200 with 0 rows, no SQL error | `raw-ilike`, backend test |
| BR-STD-38 | A term of 1 character after trimming is treated as no filter (the list is not narrowed, nothing is hidden); searching starts at 2 characters. The employee name picker keeps its required term. | item list `q=a` → 200, same rows as no `q`; `q=ad` → only rows containing "ad" | backend test |

### Input limits (check rules `zod-string`, `zod-number`, `zod-array`)
| ID | Rule | Example (given → then) | Checked by |
|---|---|---|---|
| BR-STD-13 | Every text field in a request (body, query, path) has a maximum length from `design/api.md` → Standard limits; text at the limit is accepted, one character more is refused with 400 and nothing is saved. Text is never cut silently. | item name of 200 characters → saved; 201 → 400, no item row | `zod-string`, backend test |
| BR-STD-14 | Fields with a legal fixed length use it: GSTIN 15, PAN 10 (format rules of BR-SUP-02/04 unchanged). | GSTIN of 16 characters → 400 | `zod-string`, backend test |
| BR-STD-15 | A password is at most 128 characters on login, employee create and employee update (minimum 8 on create/update unchanged). | login with a 129-character password → 400, no password check runs | `zod-string`, backend test |
| BR-STD-16 | Money in a request is whole paise with an upper bound: `MAX_MONEY_PAISE` (10,000,000,000,000, see "Money limit") for prices, rates and billed amounts; 1,000,000,000,000 paise (₹1,000 crore) for approval-policy amount limits. The frontend forms take the same limit from one shared constant (`frontend/src/lib/money.ts`, same value as the backend); no 32-bit cap (`2147483647`) is left in `frontend/src` (4 sites, `design/screens.md`), so the UI accepts what the API accepts. | PO line `unitPricePaise` 10000000000000 → accepted; 10000000000001 → 400; policy `maxAmountPaise` 1000000000001 → 400; supplier price ₹3,00,00,000.00 (3000000000 paise) typed in the batch-edit dialog → no form error, saved (today: form error above ₹2,14,74,836.47); `grep -rnE "2147483647\|2_147_483_647" frontend/src` → no hit | `zod-number`, backend test, script, human |
| BR-STD-17 | A quantity in a request is at most 1,000,000,000; decimals stay as the module spec says (up to 3; whole numbers for `pcs`/`set`, BR-INV-08; whole pieces on subcontracting, BR-SCO-02). | a complete, valid SCO create with send qty 1000 → 201; the same request with send qty 1000000001 → 400, no SCO | `zod-number`, backend test |
| BR-STD-18 | GST % stays the fixed slab list (top slab 40). Already bounded today: no behaviour change. | supplier item `taxPercentage` 41 → 400; 18 → ok | `zod-number`, backend test |
| BR-STD-19 | Limits are checked before any database write, so a refused request changes nothing. | PR create with one 2,001-character note → 400, no PR, no number used | backend test |
| BR-STD-33 | Every list in a request has a maximum size: document lines 500; permission-key and role-id lists 1,000; `supplierItems` 500; approval chain and status lists 20; batch edits 100 (as today). One entry more is refused with 400 and nothing is saved. All 26 sites: `design/api.md` → zod-array. | PR create with 500 lines → 201; with 501 lines → 400, no PR, no number used | `zod-array`, backend test |

### Money limit (owner answer 2026-11-18: 64-bit now)
Today 23 money columns are 32-bit (`design/data.md` → Stock and money): a PO, SCO or invoice total above
₹2,14,74,836.47 overflows and becomes a server error. The owner chose 64-bit money (Card 1, answer A).
Approval-policy limits stay ₹1,000 crore; quantities stay BR-STD-17.
| | Decision |
|---|---|
| Columns | all 23 become `bigint` with `mode: "number"` |
| Money limit (each amount field and each computed value) | 10,000,000,000,000 paise (₹10,000 crore; below 2^53, above any real order) |

| ID | Rule | Example (given → then) | Checked by |
|---|---|---|---|
| BR-STD-39 | Every computed line value, line tax, subtotal, tax, total, estimated amount, challan value and average cost is checked on the server before it is saved. A value above the money limit answers 400 `AMOUNT_TOO_LARGE` with a plain message naming the limit, and nothing is saved. A computed amount can never produce a 500. Compute sites: `design/api.md` → Money. | PO line of 3 pcs at ₹1,00,00,000.00 each, GST 0% (total ₹3 crore) → 201, total 3000000000 paise; PO whose computed total is above ₹10,000 crore → 400 "Amount is above the largest value allowed (₹10,000 crore).", no PO, no number used | backend test |
| BR-STD-43 | Money stays an exact JS number (at most 2^53 − 1 = `Number.MAX_SAFE_INTEGER`). (a) `postStock` does its money maths exactly (`BigInt`) and, besides BR-STD-39, refuses a posting whose resulting item stock value (stock × average cost) is above `MAX_STOCK_VALUE_PAISE` = 9,000,000,000,000,000 paise (₹90 lakh crore, just under 2^53): 400 `AMOUNT_TOO_LARGE`, nothing saved. So the stock-list value is always exact. (b) Every SQL money aggregate is mapped by `toSafePaise()` (`Number()` + safe-integer check); a sum above 2^53 − 1 answers 400 `AMOUNT_TOO_LARGE`, never a rounded figure, never a 500. Response schemas stay `z.number().int()`. Sites: `design/api.md` → Money. | `assertStockValueInRange(900_000_000_000, 10_000_000)` (900,000,000 pcs at ₹1,00,000.00) → ok; `(900_000_001_000, 10_000_000)` → `AMOUNT_TOO_LARGE`; item seeded at 900,000,000 pcs and that average cost: stock-in of 1 pc at ₹1,00,000.00 → 400, no ledger row, stock unchanged; `toSafePaise("9007199254740991")` → 9007199254740991; `toSafePaise("9007199254740992")` → `AMOUNT_TOO_LARGE` | backend test |

### Indexes (check rules `idx-fk`, `idx-filter`)
| ID | Rule | Example (given → then) | Checked by |
|---|---|---|---|
| BR-STD-20 | Every foreign-key column and every column filtered in a repository query is the primary key, unique, the first column of an index, or carries an exemption comment `// no-index: <tag> <reason>` on its line in the schema file. | new FK column with neither → `standards:check:strict` exits 1 | `idx-fk`, `idx-filter` |
| BR-STD-21 | An exemption needs a reason; `// no-index:` with no text after it is itself a finding. The check prints how many columns are exempt, in total and per tag. | `// no-index:` alone → 1 finding; summary line "exempt: 84 (audit 52, covered 13, tiny 10, low-card 8, pk-join 1)" (87 findings = 84 columns) | `idx-fk`, `idx-filter` |
| BR-STD-22 | The 17 indexes of `design/data.md` exist in the database by name after `bun run db:migrate`, and the other 87 findings = 84 columns are exempt with the tag given there. | `pg_indexes` has `idx_inventory_ledger_reftype_id` on `(reference_type, id)` and `idx_grns_status_id` on `(status, id)` | backend test |
| BR-STD-23 | Indexes come only from a schema edit plus one generated migration (`bun run db:generate`); no hand-typed SQL, no merged migration edited (BR-MIG-06, 08). The migration changes no row. | CI step "Migrations are in sync with the schema" passes; row counts before = after | script (CI) |
| BR-STD-40 | The exemption reason starts with one tag: `audit`, `tiny`, `covered:<index name>`, `low-card`, `pk-join`. `covered:` must name an index that exists. `audit`, `tiny` and `pk-join` are refused on growth tables (list in `design/data.md`), except `audit` on a who-did-it column (`…_by`). A column that fits no tag gets an index. | `// no-index: pk-join` on `sco_challan_lines.item_id` → finding; `// no-index: covered:idx_nope` → finding; `// no-index: audit` on `inventory_ledger.created_by` → accepted | `idx-fk`, `idx-filter` |

### India day (check rule `ist-date`)
| ID | Rule | Example (given → then) | Checked by |
|---|---|---|---|
| BR-STD-24 | "Today" is the calendar day in India (Asia/Kolkata), whatever the server clock zone; day maths lives only in `backend/src/lib/ist-day.ts`. | check prints `ist-date 0` | `ist-date` |
| BR-STD-25 | The PR required-by check (BR-PR-08) compares with the India day. | clock 2026-11-18T20:00:00Z (19 Nov 01:30 IST): required-by 2026-11-18 → 400 `PR_DATE_IN_PAST`; 2026-11-19 → saved | backend test |
| BR-STD-26 | The stock-movement date filter takes whole India days: from 00:00 IST of `fromDate` up to, not including, 00:00 IST of the day after `toDate`. | movement posted 2026-11-18T19:00:00Z (19 Nov 00:30 IST): `fromDate=toDate=2026-11-18` → not listed; `fromDate=toDate=2026-11-19` → listed | backend test |

### Frontend (check rules `mutation-invalidate`, `motion`)
| ID | Rule | Example (given → then) | Checked by |
|---|---|---|---|
| BR-STD-27 | Every `useMutation(` refreshes the query cache (`invalidateQueries` / `setQueryData`) or carries `// no-invalidate: <reason>`. Logout carries the comment: it clears the whole cache. | check prints `mutation-invalidate 0`; after logout no cached data is left | `mutation-invalidate` |
| BR-STD-28 | Motion classes (`transition-*`, `animate-*`, `duration-*`) exist only under `src/components/ui/**` or in a file on `frontend/design/motion-allowlist.json`. The two present hits are removed; the allow-list stays empty. | check prints `motion 0`; the approval action button shows a still icon and stays disabled while it works; an SCO card changes background on hover with no fade | `motion`, human |

### Blocking
| ID | Rule | Example (given → then) | Checked by |
|---|---|---|---|
| BR-STD-29 | Backend CI runs `bun run standards:check:strict` as a normal (blocking) step; one finding fails the job. | PR adds `ilike(` in a repository → backend job red | script (CI) |
| BR-STD-30 | Frontend CI blocks on `mutation-invalidate` and `motion` only; `raw-palette` is still printed and never fails the job until issue #91 lands. | 62 palette findings, 0 others → job green; one new `animate-pulse` in a page → job red | script (CI) |
| BR-STD-31 | The hooks `spec-gate.sh` and `test-ownership.sh` deny by default; `SPEC_GATE_MODE=warn` / `TEST_OWNERSHIP_MODE=warn` still gives warn-only. | env unset, a non-test-writer agent edits a test file → hook exits 2 with the reason | script |
| BR-STD-32 | Blocking is switched on only in the commit where the count is 0, so `main` is never red because of this spec. | backend 0 findings → same PR flips the CI step | human |
| BR-STD-41 | Both hooks resolve the target path with `realpath` before matching it, and in deny mode they fail closed: a missing `jq` or unreadable input blocks the call (today it allows). | `docs/link.ts` is a symlink to `backend/tests/a.test.ts`, edited by a non-test-writer → exit 2; `jq` not on `PATH`, mode deny → exit 2 | script |
| BR-STD-42 | The public routes are exactly `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout` (the 3 manifest routes with `auth: public`) and `GET /health` (a raw `app.get` in `src/app.ts:44`, not in the manifest). Adding a route to the public list needs an owner-approved spec line. | a new route with `auth: { type: "public" }` that is not on the list → permission matrix test (T-3) fails; `GET /health` with no token → 200 | backend test |

## Tooling
Same run, no business rules. Each line is an acceptance check. Details and choices: `design/api.md` → Tooling.
| Id | Tool | Acceptance check | Checked by |
|---|---|---|---|
| T-1 | `cd backend && bun run try` (`scripts/try.sh`) | Starts the Docker databases, then API (:4000) and UI (:3000) from the current branch on the dev database with the demo data it already holds. API and UI listen on 127.0.0.1 only: a request to the machine's LAN address is refused. It never resets, drops or seeds: pending migrations go only through `bun run db:migrate` after a typed yes (BR-MIG-13..17); an empty database gets a message with the command to run by hand, nothing else. `--check` starts and changes nothing. | script, human |
| T-2 | `cd backend && bun run db:test:rebuild` | Rebuilds the database in `DATABASE_URL_TEST` exactly as CI does (`db:reset --no-fixtures` steps). Refuses with exit 2, changing nothing, when the database name does not end in `_test` or `DATABASE_URL_TEST` is missing. Never reads `DATABASE_URL` as its target. | script |
| T-3 | Permission matrix test: extends the existing `backend/tests/routes/permissions-matrix.test.ts` (today: the BR-AUTH-21 seed-role matrix; its coverage check filters on auth type `"roles"`, which no route has any more). Edited only by test-writer. | Added, for every route of `getRegistry()` (= `backend/.contracts/api-manifest.json`; today 99 permission, 8 any-signed-in, 3 public): permission routes answer 401 with no token and 403 `PERMISSION_DENIED` with a token of a role that holds none of the route's keys; "any signed-in user" routes answer 401 with no token; the manifest's public routes are exactly the 3 auth routes of BR-STD-42, held in the test. `GET /health` is not in the manifest: checked on its own (200 with no token). A route of any other auth type fails the test (BR-AUTH-10). The existing BR-AUTH-21 tests stay. | backend test |
| T-4 | Playwright smoke (`frontend/e2e`, written by test-writer) | `cd frontend && bun run e2e` against the `try` stack: log in as the seeded admin, open the purchase requisitions list, see at least one row; exits non-zero on failure. CI job `e2e` stays non-blocking in this run. | Playwright |

## Security
Sensitive data:
| Data | Who may see it | Who may change it |
|---|---|---|
| Constraint, table, column names, SQL | server log only | — |
| Driver `detail`, request bodies, duplicate values | nobody; never logged (BR-STD-34) | — |
| Whether a unique value exists (email, code, GSTIN) | holders of the module's create / edit key (BR-STD-36) | — |
| Passwords | nobody; never logged, capped at 128 before hashing | the user / setup admin (unchanged) |

List endpoints do return long text (GRN `remarks`, PR and SCO `notes`, movement `notes`); the 1,000 / 2,000
limits are accepted as they are, with at most 100 rows per page.

Abuse cases:
| Who | Tries to | Stopped by |
|---|---|---|
| any signed-in user | search `%` or `_` to match everything, or put SQL in the search box | BR-STD-08, 11, 37 |
| any signed-in user | type one letter again and again to force full scans | BR-STD-38; the rest is an accepted risk (Not now) |
| any signed-in user | send megabytes of text into a text column | BR-STD-13, 19 |
| any signed-in user | send a list with a million lines, keys or role ids | BR-STD-33 |
| any signed-in user | enter a price and quantity whose total overflows, to crash the save | BR-STD-39 |
| any signed-in user | pile up stock value past what a JS number holds exactly, to get wrong money figures | BR-STD-43 |
| anyone | send a huge password to burn CPU in hashing | BR-STD-15 |
| anyone, or a user without the module's key | learn which emails, codes or GSTINs exist from a 409 | BR-STD-36 |
| any signed-in user | read schema names from an error message | BR-STD-03 |
| a reader of the server log | read entered values from 409 log lines | BR-STD-34 |
| any signed-in user | call a route without its permission | T-3 (rules stay in auth-setup) |
| a developer | make a route public without anyone noticing | BR-STD-42, T-3 |
| someone on the same network | open a developer's `try` stack | T-1 |
| an agent | edit tests or build without a frozen spec, through a symlink or with `jq` missing | BR-STD-31, 41 |

The hooks do not cover (accepted, → GitHub issue): file writes made through Bash (`sed -i`, `cat >`,
`git apply`, redirects); the NotebookEdit tool; they allow when no run state exists (`.pipeline/*/state.json`)
or the run's mode is `bug`. Symlinked paths and a missing `jq` are closed by BR-STD-41. The hooks are a guard
rail for honest mistakes, not a security boundary; CI and review stay the boundary.

Audit: no new audit rows. Every 409 from BR-STD-01/02 is written to the server log as BR-STD-34 says.

## Edge cases
Full list: `design/edge-cases.md`. Every row names a rule in this file.
| Source | Count |
|---|---|
| benchmark | 14 |
| owner | 5 |
| invariant | 14 |

## Not now
- The 62 `raw-palette` findings: the frozen design-system spec replaces those files (issues #88 and #91). The rule stays report-only until #91.
- Naming the field in the 400 answer ("name is too long"): the answer stays "Validation failed" as today.
- Search cost of "contains" matching (leading wildcard): trigram indexes and a per-user rate limit on list searches are an accepted risk at factory size → GitHub issue.
- Ledger index on `(transaction_type, id desc)` if the movement list is slow at UAT → GitHub issue. A job that purges expired refresh tokens → GitHub issue.
- Hook gaps listed under Security (Bash writes, NotebookEdit) → GitHub issue.
- Playwright smoke as a blocking CI job; a "load demo data without wiping" script; a ratchet for `raw-palette`; `bun audit` findings; gitleaks and commit-separation blocking.

## Open questions
| # | Question | Goes to |
|---|---|---|
| — | none (Card 1 answered: 64-bit now) | — |

## Changelog
- 2026-11-18 v0 — draft
- 2026-11-18 v0 — pre-freeze review round 1: SEC-1..9, PERF-1..4, SPEC-1..5 folded in (rules BR-STD-33..42 added)
- 2026-11-18 v0 — pre-freeze review round 2: F1..F14 folded in (BR-STD-43 added; indexes #11, #12 reshaped; frontend money cap; 43 rules)
- 2026-11-18 v1 — frozen. Two review rounds passed their blockers; Card 1 answered (64-bit money); the 9 confirm lines go to the hand-over
- 2026-11-18 v2 — wording only, no rule change: text matches the code (`--strict=rule1,rule2`, `safeSearchMin` / `usableTerm`, `isPublicPath()`, second `AMOUNT_TOO_LARGE` text for stock value); status stays frozen
