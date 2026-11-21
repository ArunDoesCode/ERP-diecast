# Test fixtures and helpers — read before writing a test

For **test-writer**. Built by reading `backend/tests/` on 2026-11-18 (40 test files + the preload, ~26,700 lines). It tells you
what exists so you copy a working pattern instead of inventing one. It describes test code and seed data
only — never use it to learn what production code does.

## 1. Facts that hold for every test
| Fact | Where it comes from |
|---|---|
| `bun test` always talks to the **test DB** (`DATABASE_URL_TEST`, `localhost:5433/diecast_test`) | `backend/bunfig.toml` preloads `backend/tests/setup-env.ts` |
| All test files run in **one process and share one DB client**. Never call `disconnectDb()` in a file — the preload closes it once, after all files | `backend/tests/setup-env.ts` |
| The test DB is in memory: empty after a container restart. Rebuild with `bun run db:test:prepare` (never `db:reset`) | `docs/runbooks/test-db-reset.md` |
| Real DB, no mocks. HTTP tests go through the full app: `createApp()` from `backend/src/app.ts` | every `tests/routes/*.test.ts` |
| Tests live in `backend/tests/<layer>/` (`routes`, `service`, `repository`, `lib`, `types`, `scripts`; `scenarios` is created with the first scenario test) and import with `../../src/...` | folder layout |
| **Three shared helpers exist in `backend/tests/helpers/`:** `rfqFixtures.ts` (section 3a, RFQ / rate-contract / PO-contract tests), `ratingFixtures.ts` (3b, supplier rating), `dispatchFixtures.ts` (3c, delivery notes). Everywhere else each test file defines its own helpers at the top; copy from the reference files below and never import helpers from another test file | `tests/helpers/` |

## 2. What the test DB already holds (after `db:test:prepare`)
Same as CI (`db:reset --no-fixtures`): schema, plus
- **Roles** (7): `super-admin`, `owner`, `back_office`, `floor_supervisor`, `operator`, `qa_inspector`,
  `die_designer` (`backend/src/db/seed_roles.sql`).
- **Permission catalog + grants per role** (source of truth: `docs/specs/auth-setup.md` key table).
- **One employee**: `admin@diecast.local` (super-admin).
- **Seed approval policies.**

Not there: suppliers, items, locations, machines, PR/PO/GRN/SCO documents, the `<role>@diecast.local` demo
logins. The demo fixtures of `bun run db:reset` and `bun run seed` exist only on the dev DB. Create every
row your test needs.

## 3. Reference files (copy the top-of-file helpers from these)
| Need | Copy from | What it has |
|---|---|---|
| HTTP test, one actor per role, token signed directly | `backend/tests/service/grnService.test.ts` | `RUN`/`uid()`, `userFor(role)`, `tokenFor(role)`, `call(method, path, role, body)`, `newPo()`, `newGrn()`, row readers, full FK-safe `afterAll` |
| HTTP test, actors that log in for real (email + password) | `backend/tests/routes/sco.test.ts` | `makeActor(key, roleName)`, `call(actor, method, path, body)`, `line()` / `payload()` builders with overrides, `requireRow()`, `daysFromNow()` |
| Service / repository level, no HTTP | `backend/tests/repository/approvalRepository.test.ts`, `backend/tests/service/poReceiptStatus.test.ts` | `roleId(name)`, `requireId()`, `makePo(qtys)`, `makeGrn(poId)` |
| Stock and ledger assertions | `backend/tests/service/inventoryStock.test.ts` (helpers), `stockPosting.test.ts` (ledger + concurrency cases) | `mkItem()`, `mkLocation()`, `mustOpen()`, `stockRow(sku)` |
| Permission matrix (role × route) | `backend/tests/routes/permissions-matrix.test.ts`, `permission-enforcement.test.ts` | 401 / 403 per route |
| Approval flow | `backend/tests/routes/approval-requests.test.ts`, `approval-policies.test.ts` | policies with negative priorities, `act()` helper |
| Smoke of the app + error mapping | `backend/tests/app.test.ts` | 401, 403, 404, validation |
| Scripts run as a child process on a scratch DB | `backend/tests/scripts/*.test.ts` | `run()`, `withDb(url)`, `assertScratchOnly()`, sentinels |

## 3a. Shared helper — `backend/tests/helpers/rfqFixtures.ts`
Used by `rfq.test.ts`, `rfqQuotes.test.ts`, `rfqAward.test.ts`, `rateContract.test.ts`, `poContract.test.ts`.
- `const fx = makeRfqFx("<tag>")` per file: its own `TEST_<tag>_<now>` prefix, its own rows, its own `fx.cleanup()` (call in `afterAll`). Files never share data.
- Actors: `fx.owner()`, `owner2()`, `bo()`, `floor()`, `superAdmin()` (seed roles), or `fx.actor(key, ["rfq.view", …])` for a throw-away role with exactly those keys. Cached per key.
- **`fx.call` signs a fresh token on every request**, so tests that move the clock with `setSystemTime(+N days)` stay authenticated (a token cached before the jump expires after 15 min of shifted time → 401).
- Builders: `newSupplier`, `newItem`, `newPr` (approved PR + lines inserted straight into the tables — fixture shortcut), `mkRfq`, `quoteBody` / `enterQuote` / `mkQuote`, `award`, `mkContract`, `poLine` / `createPo`, `maintenancePoPolicy`, `submitPo`, `approve`, `poItems`; HTTP wrappers `rfqApi`, `rcApi`, `poApi`; `istDay(offset)`.
- Extend this file for RFQ-area tests instead of copying it; for other modules the per-file rule still holds.

## 3b. Shared helper — `backend/tests/helpers/ratingFixtures.ts`
Used by `supplierRating.test.ts`, `supplierRatingList.test.ts`, `supplierRatingLines.test.ts`.
- `const fx = makeRatingFx("<tag>")` per file: own `TEST_<tag>_<now>` prefix, own rows, `fx.cleanup()` in `afterAll`.
- **Fixture shortcut:** suppliers, items, POs, GRNs and their lines are inserted straight into the tables so every date and qty is exact (not a production path). Timestamps are written at noon IST (`noonIst(day)`) so the IST day never slips.
- Actors: `fx.owner()`, `bo()`, `floor()`, `qa()`, `superAdmin()`, or `fx.actor(key, ["supplier.rating.view"])` for a role with exactly those keys.
- Reads: `fx.rating(path, who?)` (GET under `/api/supplier-rating`, default actor back_office), `card(id)`, `lines(id, query)`, `trend(id)` (return `data`).
- Builders: `newSupplier({active?, name?})`, `newItem({uom?, standard?})`, `mkPo(supplierId, spec)` (status default `fully_received`, `due`, `revised`, `created`, lines, `grns: [{day, lines: [{line, recv, rej}]}]`), `delivered(supplierId, n, {due?, recv?, rej?, qty?})` (n on-time lines in one call), `addCorrection(grnItemId, qty)`.
- Date helpers (exported): `istDay(offset)`, `monthDay(monthsAgo, dd)`, `monthKey(monthsAgo)`, `noonIst(day)`.

## 3c. Shared helper — `backend/tests/helpers/dispatchFixtures.ts`
Used by `dispatch.test.ts`, `dispatchPost.test.ts`, `dispatchCancel.test.ts`.
- `const fx = makeDispatchFx("<tag>")` per file; `fx.cleanup()` in `afterAll`. **The single `company_settings` row is saved on the first `setupCompany()` and restored in `cleanup()`** — call `setupCompany()` before a post test (plant `PLANT`, state 27, limit ₹50,000).
- Actors by seed role name (`"owner" | "back_office" | "floor_supervisor" | …`), token cached per role: `fx.call(role, method, path, body)`, `fx.dsp(role, method, "/notes…", body)` (prefix `/api/dispatch`); `null` role = no token.
- Builders: `mkItem(over)`, `mkLoc()`, `mkVirtualLoc()`, `mkVendorLoc()`, `setLocActive(id, bool)`, `mkCustomer(over)`, `stock(item, loc, qty, cost)` (opening stock through the real movements route), `mkSo({customerId, lines, orderDate?, shipTo?, confirm?})` (created and confirmed through the real SO routes by back_office), `soDetail`, `soOp`, `soEdit`, `soPrice`, `setLimit(paise)`, `setCompany(over)`, `ewayNo()` (unique 12 digits), `roadTransport(over)`.
- Notes: `draft(body, role?)` / `mustDraft`, `post(id, role = floor_supervisor)` / `mustPost`, `cancelPosted`, `cancelDraft`, `noteDetail(id, role = owner)`; `scenario({qty, soQty, price, gst, stockQty, cost, customerOver, transport, lotNo, uom})` = customer + location with stock + confirmed SO + draft, ready to post (defaults match the spec example: 1000 on the SO, 700 in stock, 600 on the note).
- Readers: `ledgerOfNote(id)`, `ledgerOfItem(itemId)`, `balance(item, loc)`, `itemRow(id)`. Exported `istDay(offset)`, `fyOf(day)` (DN number FY), `PLANT`.

## 4. Helper patterns and their defaults
- **Unique names.** `const RUN = \`TEST_<module>_${Date.now()}\`; let seq = 0; const uid = () => \`${RUN}_${++seq}\`;`
  Use `uid()` for every unique column (SKU, document number, name). Emails: lower-case prefix,
  `test_<module>_<key>@diecast.test`.
- **Actors must be real employees with a seed role.** The permission layer reads the role and its keys from
  the employee row in the DB, not from the token. A token for a user id that does not exist gets **401**; a
  role name only in the token gets **403**. Two working ways:
  - `signAccessToken({ userId, userName, role, allowedPages: [] })` from `src/lib/token` after inserting the
    employee (`{ name, roleId, isActive: true }`) — fast, no password.
  - `authService.login(email, PASSWORD)` after inserting the employee with
    `passwordHash: await Bun.password.hash(PASSWORD)` — use when login itself matters.
- **`call()` returns `{ status, json }`**, `json` is `null` when the body is not JSON. No actor → no
  `Authorization` header (for 401 tests).
- **Builders take overrides:** `payload({ vendorId: other })`, `line({ rawQtyToIssue: 0 })`. Typical defaults
  in existing files: PO line `qty 1000`, `uom "kg"`, item `category "Raw Material"`, PO status `dispatched`.
- **Default-parameter trap (caused two test repairs):** a helper written as `act(id, notes = "x")` turns
  `undefined` into a valid value, so "field missing" cases can never fail. For optional fields pass an
  explicit object and leave the key out.
- **Dates:** build them relative to now (`daysFromNow(n)`); business days are IST. Never hard-code today.
- **Money** is integer paise. **Quantities:** take units and decimals from the spec.
- **Approval policies** your test adds: use a negative `priority` no other file uses (taken: `-95001`,
  `-95002`), and delete by that priority.

## 5. Response shapes — never guess, never read the controller
```bash
cd backend && bun run contract:query "POST /api/pr/createpr"   # exact route id → full descriptor
cd backend && bun run contract:query "grn"                     # free text → list of matching routes
```
Also the run's `.pipeline/<id>/contract.md`. Things that were guessed wrong before:
- The payload sits under a **named key**, e.g. `POST /api/pr/createpr` returns `data.pr.id`, not `data.id`.
- Lists return paging under `meta` (e.g. `json.meta.page`).
- Errors: `{ success: false, message, code }` + extra detail fields. Status by class in
  `backend/src/lib/errors.ts`: 400 `BadRequestError`, 401 `UnauthorizedError`, 403 `ForbiddenError`,
  404 `NotFoundError`, 409 `ConflictError`, 429 `TooManyRequestsError`. A Zod failure is 400 with message
  `"Validation failed"` and **no** `code`.
- Permission denied is 403 with code `PERMISSION_DENIED`; missing or inactive user is 401.
- Assert the `code` the **spec** names. If the spec names none, assert the status only.

## 6. Ordering rules
1. **Rows have no order unless you ask for one.** Any assertion on "first", "last" or `rows[n]` needs an
   `orderBy` in your query, or sort in the test. (A trail read without `ORDER BY` was flaky.)
2. **Files run in no fixed order and share the DB.** Never depend on rows from another file. Never assert a
   global count (`count(*) from …`); filter by your `RUN` prefix or your ids.
3. **Clean up in `afterAll`, children first** (FK-safe). Order used today:
   QA tests / GRN corrections → `inventory_ledger` (by your item ids) → GRN items → GRNs → PO items → POs →
   SCO items → SCOs → approval trails → approval requests → your approval policies → items / services →
   supplier services → suppliers → locations → employees.
4. **`document_number_counters` is shared and is never deleted or rolled back.** Before deleting your
   employees, set its `createdBy` and `lastUpdatedBy` to `null` for your employee ids (missing this broke
   `afterAll` with an FK error).
5. **Delete only what you created**: by collected ids or by your prefix (`like(employees.email, 'test_<module>_%')`).
6. **Race tests:** fire the calls with `Promise.all`, then assert on the set of outcomes ("one 201, one
   409"), never on which call won.
7. **Script tests** create their own scratch databases and must never touch `diecast_test` or the dev DB
   (a past test wiped the shared seed and 40 other tests failed).

## 7. Before you return
- `cd backend && bun test <your file>` — only your files.
- `bunx biome check --write <your files>` and `bun run typecheck` (nullable columns: `string | null`).
- Test names start with the rule id: `test("BR-GRN-04 rejects received qty above PO open qty", …)`.
- Every asserted outcome is stated in the spec rule the test names. If it is not, return `BLOCKED`.

## Not there yet
- `frontend/e2e/` (Playwright) does not exist; this file gets a frontend section when it does.
- No general shared factory module (only the per-area helpers `rfqFixtures.ts`, `ratingFixtures.ts`, `dispatchFixtures.ts`). If the same helper is
  copied a fifth time elsewhere, test-writer may propose another `backend/tests/helpers/` file in its report;
  the coordinator opens an issue (it is a change to tests, so only test-writer builds it).
