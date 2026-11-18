# API standards — API design (error contract, search, limits)

> No new endpoint, no permission change. Rules: `../spec.md`. Files are under `backend/`. Line numbers are
> from the 2026-11-18 baseline (commit 930eec2). The developer decides nothing here: every finding has its value.

## Error contract (BR-STD-01..06, 34..36, 39, 43)
Body shape is the project's own (`src/app.ts` `onError`, manifest `errorEnvelope`): `{ success: false, message, code }`.
| Case | Status | `code` | `message` |
|---|---|---|---|
| uncaught 23505 unique violation | 409 | `DUPLICATE_RECORD` | This record already exists. |
| uncaught 23503 foreign-key violation | 409 | `LINKED_RECORD` | This record is linked to another record that is missing or still in use. |
| caught by a service (below) | 409 | the service's own | the service's own |
| Zod validation (limits, list sizes, search length) | 400 | — | Validation failed (unchanged) |
| computed amount above the money limit, stock value or money sum above the JS-safe range (Money, below) | 400 | `AMOUNT_TOO_LARGE` | names the limit, see Money |
| any other DB / unknown error | 500 | — | Internal server error (unchanged) |

- `onError` (`src/app.ts:48`) becomes a named export `handleAppError(error, c)`; `createApp()` passes it to
  `app.onError`. It checks `AppError` first (unchanged), then `isUniqueViolation(error)` /
  `isForeignKeyViolation(error)`, then the existing branches. `isForeignKeyViolation` is new in
  `src/lib/db-errors.ts`, same cause-chain walk.
- The 409 body is built from constants only: nothing from the error object reaches the client, also when
  `NODE_ENV=development`.
- Log (BR-STD-34). No logger module exists in `src/lib`; the code logs with `console.*` (`app.ts:27`,
  `async-handler.ts:15`). `handleAppError` makes exactly one call per 23505 / 23503:
  `console.warn("db-conflict", fields)` for 23505, `console.error("db-conflict", fields)` for 23503, with
  `fields = { pgCode, constraint, table, method, path, actorId }` (`constraint` / `table` = the driver's
  `constraint_name` / `table_name`; `actorId` = the id of `c.get("actor")`, set at `auth-middleware.ts:117`, or `"none"`). Never the request body,
  column values, the error object or the driver `detail` (it holds the offending values).
- `asyncHandler` (`src/lib/async-handler.ts:15`) today calls `console.error("Route error…", error)` with the whole
  error object, `detail` included. It skips that call when the error is a 23505 / 23503; other errors as today.
- Tests spy on `console.warn` and `console.error` and assert: the call count, the six fields, and that no call
  argument (as JSON) holds the duplicate value or the text `Key (`.
- Public routes (BR-STD-36, mechanism): the list `PUBLIC_PATHS` (the four paths of BR-STD-42) lives in
  `src/lib/public-routes.ts` (new). `handleAppError` compares `c.req.path` with it; on a public path the
  23505 / 23503 branch is skipped and the answer is `{ success: false, message: "Internal server error" }`, 500,
  in every `NODE_ENV` (the log call above still runs). Today such an error on login already ends in the generic
  500 branch (the two 401 branches at `app.ts:69–75` match only the texts "Invalid credentials" / "Login failed").
  Test, at handler level: a bare `new Hono()` with `onError(handleAppError)` and one route that throws an error
  whose `cause.code` is `"23505"`; mounted at `POST /api/auth/login` → 500, no `code`; at `POST /api/x` → 409.
  On every other route the permission check runs before the handler, so a caller without the module's
  create / edit key gets 403, never 409.
- A 23505 / 23503 raised inside `db.transaction` is re-thrown, never swallowed, so the whole transaction rolls
  back (BR-STD-35).
- Tests (BR-STD-01, 02, 35): (a) the shared handler given a thrown error whose `cause.code` is `"23505"` / `"23503"`;
  (b) real database: 23505 = `POST /api/setup/employees` twice with the same `email` (`employees.email`, constraint
  `employees_email_key`; the service has no pre-check; the insert and its audit row share one transaction, so the
  test also proves no second employee and no audit row). 23503 = no shipped route reaches it today (every
  service pre-checks its parents), so the test mounts one throw-away route on `createApp()` that deletes a
  `roles` row an employee still points to (`employees.role_id`) after an insert in the same transaction.
- Hand-written catches that stay as they are (5 sites, 3 files): `service/approvalService.ts:260, 340, 550`,
  `service/poService.ts:543`, `service/scoReceiptService.ts:262`. No new catch is required anywhere.

## Search (BR-STD-07..12, 37, 38)
`src/lib/safe-search.ts` exports:
- `searchTermSchema` — `z.string().trim().max(100).optional()`; a term shorter than 2 characters after the trim
  (empty included) becomes `undefined` = no filter. The one shared schema for every `q` field below.
- `safeSearch(term, ...columns)` — returns `undefined` for no term, else `or(ilike(col, pattern), …)` with
  pattern `%<term>%` where `\`, `%`, `_` are escaped with `\` (Postgres default escape).
- `safeSearchSql(term, sqlExpression)` for the three `sql` template sites (enum cast to text): same escape.
- The pattern is always a bound parameter (Drizzle `ilike(col, pattern)` or `${pattern}` inside `sql`), never
  joined into SQL text. `ilike` appears only in this file, as a call or inside a `sql` template.
- Check change: `raw-ilike` also flags the word `ilike` inside a `sql` template outside this file (3 more hits
  at baseline: 32 → 35).

All 31 call sites move to it; local `escapeLike()` (scoRepository, supplierRepository) and `likePattern()`
(assetRepository) are deleted.
| File (`src/repository/`) | Lines | Sites | Escaped today |
|---|---|---|---|
| approvalRepository.ts | 257 | 1 | no |
| assetRepository.ts | 174–176, 359–360, 487, 726 (2), 884–886; `sql` template 488 | 11 + 1 | no |
| employeeRepository.ts | 83 | 1 | no |
| grnRepository.ts | 544 | 1 | no |
| poRepository.ts | 177–178 | 2 | no |
| prRepository.ts | 191–192; `sql` template 193–194 | 2 + 2 | no |
| scoRepository.ts | 124–125 | 2 | yes |
| supplierRepository.ts | 146–150, 159, 218–220, 260–261 | 11 | yes |

`searchTermSchema` is the `q` of all 13 list schemas: approvalPolicyListQuerySchema, assetItemListQuerySchema,
assetServiceListQuerySchema, assetLocationListQuerySchema, assetStockListQuerySchema,
assetMachineListQuerySchema, grnListQuerySchema, poListQuerySchema, prListQuerySchema, scoListQuerySchema,
supplierListQuerySchema, supplierServiceListQuerySchema, supplierItemListQuerySchema.
`employeeSearchQuerySchema.q` keeps a required term (trim, min 1, max 100): a name picker on a small table.

Lists that return long text: GRN list `remarks`, PR list `notes`, SCO list `notes`, movement list `notes`.
The 1,000 / 2,000 limits are accepted as they are; pages hold at most 100 rows.

## Standard limits (BR-STD-13..18, 33)
All text columns are Postgres `text`, so no limit can exceed a column. Longest seeded value: name 40, SKU 10, code 6, unit 4.
| Kind | Limit | Kind | Limit |
|---|---|---|---|
| code / SKU | 50 | email | 254 |
| key (permission key) | 100 | phone | 30 |
| name | 200 | GSTIN / PAN | 15 / 10 (fixed) |
| short text (label, group, contact) | 200 | HSN / SAC | 20 / 6 digits "99…" (existing) |
| unit of measure | 20 | URL | 2,048 |
| description | 1,000 | search term | 100 |
| reason | 500 | password | 128 |
| remarks / notes | 1,000 / 2,000 (existing per module) | status list in a query | 200 |
| address | 500 | money (paise) | see Money; policy limits 1,000,000,000,000 |
| quantity | 1,000,000,000 | GST % | fixed slab list, top 40 (no change) |
| document line list | 500 | permission-key / role-id list | 1,000 |
| `supplierItems` | 500 | approval chain / status list | 20 |

`.max()` goes after `.trim()` where the field is trimmed. Existing bounded fields are not changed.

## zod-string findings (55) — file is `src/types/<name>.types.ts`
| File:line | Schema | Field | Limit |
|---|---|---|---|
| approval:21 | approvalChainStepSchema | role | 200 |
| approval:156 | approvalPolicyListQuerySchema | q | search term |
| approval:187 | createApprovalPolicySchema | description | 1,000 |
| approval:351 | approvalActionRequestSchema | notes | 2,000 |
| asset:74 | assetItemListQuerySchema | q | search term |
| asset:90 / 128 | assetItemCreateSchema / assetItemUpdateSchema | sku | 50 |
| asset:91 / 129 | assetItemCreateSchema / assetItemUpdateSchema | name | 200 |
| asset:92 / 130 | assetItemCreateSchema / assetItemUpdateSchema | description | 1,000 |
| asset:149 | assetServiceListQuerySchema | q | search term |
| asset:168 / 186 | assetServiceCreateSchema / assetServiceUpdateSchema | code | 50 |
| asset:169 / 187 | assetServiceCreateSchema / assetServiceUpdateSchema | name | 200 |
| asset:170 / 188 | assetServiceCreateSchema / assetServiceUpdateSchema | defaultUom | 20 |
| asset:281 | assetLocationListQuerySchema | q | search term |
| asset:303 / 319 | assetLocationCreateSchema / assetLocationUpdateSchema | name | 200 |
| asset:407 | assetManualMovementCreateSchema | reason | 500 |
| asset:452 | assetStockListQuerySchema | q | search term |
| asset:530 | assetMachineListQuerySchema | q | search term |
| asset:550 / 568 | assetMachineCreateSchema / assetMachineUpdateSchema | name | 200 |
| asset:551 / 569 | assetMachineCreateSchema / assetMachineUpdateSchema | code | 50 |
| auth:5 | loginSchema | password | 128 |
| grn:185 | grnListQuerySchema | q | search term |
| po:186 | poListQuerySchema | status (comma list) | 200, before the split |
| po:199 | poListQuerySchema | q | search term |
| pr:259 | prListQuerySchema | status (comma list) | 200, before the split |
| pr:272 | prListQuerySchema | q | search term |
| sco:117 | scoListQuerySchema | status (comma list) | 200, before the split |
| setup:38 / 58 | employeeInputSchema / employeeUpdateSchema | phone | 30 |
| setup:42 / 62 | employeeInputSchema / employeeUpdateSchema | password | 128 (min 8 stays) |
| setup:80 | employeeSearchQuerySchema | q | trim, min 1, max 100 (term stays required here) |
| setup:98 | roleInputSchema | name | 200 |
| setup:127 | roleCopyInputSchema | name | 200 |
| setup:155 / 156 | roleGrantsDiffSchema | added[] / removed[] (each string) | 100 |
| setup:186 | screenUpdateSchema | label | 200 |
| setup:189 | screenUpdateSchema | menuGroup | 200 |
| supplier:110 | gstinField | (GSTIN) | 15 |
| supplier:115 | panField | (PAN) | 10 |
| supplier:125 | optText (base of the other fields) | — | 2,000; each use keeps its own smaller max |
| supplier:175 | supplierListQuerySchema | q | search term |
| supplier:186 | supplierServiceListQuerySchema | q | search term |
| supplier:200 / 271 / 315 | supplierItemCreateSchema / supplierItemUpdateSchema / supplierItemEditSchema | uom | 20 |
| supplier:299 | supplierItemListQuerySchema | q | search term |

"search term" = `searchTermSchema` (trim, max 100, optional, empty = no filter). Rows with two or three line
numbers are that many findings: 41 rows = 55 findings.

## zod-number findings (18)
| File:line | Schema | Field | Upper bound |
|---|---|---|---|
| approval:192 / 238 | createApprovalPolicySchema / updateApprovalPolicySchema | minAmountPaise | 1,000,000,000,000 |
| approval:199 / 245 | createApprovalPolicySchema / updateApprovalPolicySchema | maxAmountPaise | 1,000,000,000,000 |
| po:103 / 115 / 126 | createPoSchema / updatePoInsertItemSchema / updatePoUpdateItemSchema | unitPricePaise | `MAX_MONEY_PAISE` |
| po:286 | markPoInvoicedSchema | billedAmountPaise | `MAX_MONEY_PAISE` |
| sco:49 | wholeQtySchema | (send qty, return qty) | 1,000,000,000 |
| sco:59 | scoLineInputSchema | serviceUnitPricePaise | `MAX_MONEY_PAISE` |
| scoChallan:65 | challanLineInputSchema | qty | 1,000,000,000 |
| scoReceipt:92 / 93 | receiptLineInputSchema | processedQty / unprocessedQty | 1,000,000,000 |
| scoReceipt:111 / 112 | qaDecisionSchema | acceptedQty / rejectedQty | 1,000,000,000 |
| setup:39 / 59 | employeeInputSchema / employeeUpdateSchema | dailyRatePaise | `MAX_MONEY_PAISE` |
| supplier:132 | gstPercentField | (GST %) | no change in behaviour: already bounded by `SUPPLIER_GST_SLABS` (top 40); `.max(40)` only clears the finding. `po.types.ts` `gstPercentSchema` is a union of literals: no change |

Money rows above (`unitPricePaise`, `billedAmountPaise`, `serviceUnitPricePaise`, `dailyRatePaise`):
`MAX_MONEY_PAISE` = 10,000,000,000,000 paise (Card 1 = A), see Money. No 2,147,483,647 bound stays in `src/types`.

## zod-array (26 sites, new check rule, BR-STD-33)
Every `z.array(` / `.array(` in a request-side schema needs `.max(N)` (same request detection as `zod-string`).
Over the max → 400, nothing saved. 24 sites get a max, 2 keep theirs.
| File:line | Schema | Field | Max |
|---|---|---|---|
| po:98 | createPoSchema | lines | 500 |
| po:147 / 151 / 155 | updatePoSchema | inserts / updates / deletes | 500 each |
| po:197 | poListQuerySchema | status (after the split) | 20 |
| pr:143 | createPrSchema | items | 500 |
| pr:210 / 214 / 218 | updatePrSchema | inserts / updates / deletes | 500 each |
| pr:270 | prListQuerySchema | status (after the split) | 20 |
| grn:77 | createGrnSchema | lines | 500 |
| grn:101 | updateGrnSchema | lines | 500 |
| sco:71 / 83 | createScoSchema / updateScoSchema | lines | 500 |
| sco:128 | scoListQuerySchema | status (after the split) | 20 |
| scoChallan:75 | createChallanSchema | lines | 500 |
| scoReceipt:105 | createReceiptSchema | lines | 500 |
| setup:155 / 156 | roleGrantsDiffSchema | added / removed (permission keys) | 1,000 each |
| setup:209 / 210 | screenRolesDiffSchema | added / removed (role ids) | 1,000 each |
| supplier:230 | supplierCreateSchema | supplierItems | 500 |
| supplier:322 | supplierItemBatchEditSchema | (batch) | 100 (existing, no change) |
| supplier:342 | supplierServiceBatchEditSchema | (batch) | 100 (existing, no change) |
| approval:85 / 93 | approvalChainSchema / approvalChainOrEmptySchema (`approvalChain` of create and update policy) | steps | 20 |

## Money (BR-STD-16, 39, 43 — Card 1 answered: 64-bit now)
The limits live in one place (`src/lib/money.ts`, new) with `assertMoneyInRange(valuePaise)`,
`assertStockValueInRange(stockMilli, averageCostPaise)` and `toSafePaise(value)`:
| | Value |
|---|---|
| `MAX_MONEY_PAISE` | 10,000,000,000,000 (₹10,000 crore; far below 2^53) |
| `MAX_STOCK_VALUE_PAISE` | 9,000,000,000,000,000 (₹90 lakh crore; just under 2^53 − 1 = 9,007,199,254,740,991) |
| Columns | 23 → `bigint`, `mode: "number"` (`design/data.md`) |
| Request fields | `.max(MAX_MONEY_PAISE)` |
| 400 message | Amount is above the largest value allowed (₹10,000 crore). |

Request amount fields: `unitPricePaise` (po:103 / 115 / 126), `billedAmountPaise` (po:286), `serviceUnitPricePaise`
(sco:59), `dailyRatePaise` (setup:39 / 59), plus the three fields bounded at 2,147,483,647 today, which move to
the same constant: `standardRateSchema` (asset:42), manual-movement `costSchema` (asset:371), `pricePaiseField`
(supplier:137). The frontend copies of this cap: `design/screens.md` fixes 4–7.
Every computed value is checked before the write (400 `AMOUNT_TOO_LARGE`, nothing saved):
| Site | Computes |
|---|---|
| `repository/poRepository.ts:144–159` | PO line value, line tax, subtotal, tax, total |
| `repository/scoRepository.ts:78–93` | SCO line value, line tax, subtotal, tax, total |
| `service/scoChallanService.ts:72, 199` | challan line value, challan value |
| `repository/prRepository.ts:410, 536` | PR estimated amount |
| `repository/stockPostingRepository.ts:41–48, 119, 130–147` | ledger row value, new average cost, resulting stock value (BR-STD-43) |
| `service/scoReceiptService.ts:357` | issue value of the unprocessed raw that comes back (Σ qty × issue cost); its unit cost at :366 |
| `service/scoReceiptService.ts:461` | issue value of the processed pieces at the QA decision (Σ processed qty × issue cost); issue cost at :464–465 |
| `service/scoService.ts:395, 409` | issue value of the pieces written off at close (Σ taken qty × issue cost); unit cost of that loss posting |
The three SCO sums are checked with `assertMoneyInRange` after the sum and before the division (a sum that
passes is exact: every term is a whole number below 2^53).

`stockPostingRepository.ts:41–48` today throws `BadRequestError("Row value is too large")` when a row value is
above `Number.MAX_SAFE_INTEGER` (2^53 − 1). That check is replaced: a row value above `MAX_MONEY_PAISE` answers
400 `AMOUNT_TOO_LARGE` with the Money message; the text "Row value is too large" is gone.

### JS-number safety (BR-STD-43)
Why: quantity (up to 1,000,000,000) × cost (up to `MAX_MONEY_PAISE`) can reach 1e22, far above 2^53; and
`stockPostingRepository.ts:45` multiplies thousandths × paise (up to 1e25) before it divides by 1,000.
- Guard, where it lives: `postStock` (`repository/stockPostingRepository.ts`), the only writer of
  `inventory_ledger`, `item_master.current_stock` and `average_cost_paise`. Row value (:45), the average-cost
  numerator (:136–138, :143–144) and the stock value are computed with `BigInt`, rounded as today (half away
  from zero), then checked, then turned into a number.
- Checks, in this order, before the `item_master` update (:151): row value ≤ `MAX_MONEY_PAISE`; new average
  cost ≤ `MAX_MONEY_PAISE`; `assertStockValueInRange(newMilli, averageCostPaise)`: |newMilli| ≤ 2^53 − 1 and
  |newMilli| × average cost ÷ 1,000 ≤ `MAX_STOCK_VALUE_PAISE`. A failure throws 400 `AMOUNT_TOO_LARGE`; the
  caller's transaction rolls back, so no ledger row, no stock change, no document. No clamp anywhere.
- Result: the read-only stock value `Math.round(currentStock × averageCostPaise)` (`assetRepository.ts:795`)
  is always ≤ 9e15 < 2^53, an exact integer. `scoService.ts:200` (charge due) sums stored line values of one
  SCO, each at most one line value (BR-STD-39), at most 500 lines (5e15): exact, no check.
- SQL money aggregates (all of them; `sum(` / `::bigint` searched in `src/repository`, `src/service`):
  `scoReportRepository.ts:26` `sum(total_value_change_paise)::bigint` (vendor stock value, mapped at :80) and
  `scoReportRepository.ts:102` `abs(total_value_change_paise)::bigint` (loss cost per row, mapped at :155). The
  driver returns `bigint` as text; both maps change from `Number(...)` to `toSafePaise(...)` = `Number()`, then
  `Number.isSafeInteger`, else 400 `AMOUNT_TOO_LARGE`. Line :102 is one row value (≤ `MAX_MONEY_PAISE`), so
  it cannot fail; line :26 fails only above 900 maximum-size rows for one vendor and item. A new money
  aggregate must use `toSafePaise`.
- Response schemas: Zod 4 `z.number().int()` accepts safe integers only (−(2^53 − 1) … 2^53 − 1), so
  `assetStockRowSchema.valuePaise` (`asset.types.ts:438`), `vendorStockRowSchema.valuePaise`
  (`scoReport.types.ts:14`) and `lossLogRowSchema.costPaise` already accept every value up to
  `Number.MAX_SAFE_INTEGER` and nothing above it: no schema change, no `.max()`. They are manifest-only
  (`route-registry.ts:26`, `scripts/generate-api-manifest.ts:165`); the server never parses a response with
  them, so they cannot cause a 500. The guards above keep every real value inside what they describe.

## India day (BR-STD-24..26)
- `service/prService.ts:34` `assertNotPastDate`: compare with `istDayStart()`.
- `repository/assetRepository.ts:134–144` `toStartOfDay` / `toNextDayStart`: replaced by a new helper in
  `src/lib/ist-day.ts` that gives the instant of 00:00 IST for a day (= `istDayStart(date)` minus 5 h 30 min)
  and of the next day. `fromDate` / `toDate` are read as calendar days (their `istDayKey`).

## Blocking (BR-STD-29..32)
- Backend `ci.yml`: the standards step becomes `bun run standards:check:strict`, no `continue-on-error`.
- Frontend: new option `--strict-rules=mutation-invalidate,motion` (exit 1 only for those rules; all rules still
  printed) behind a script `standards:check:blocking`; CI runs it without `continue-on-error`.
- Hooks (`.claude/hooks/spec-gate.sh`, `test-ownership.sh`): default of `SPEC_GATE_MODE` and
  `TEST_OWNERSHIP_MODE` becomes `deny`. Both resolve the target with `realpath` (for a new file: `realpath` of
  the nearest existing parent + the rest) before the path match, so a symlink cannot hide a path. In deny mode a
  missing `jq` or unreadable input exits 2 (fail closed); today `command -v jq || exit 0` allows.
- Public routes, the whole list (BR-STD-42): `POST /api/auth/login`, `POST /api/auth/refresh`,
  `POST /api/auth/logout` (the 3 descriptors with `auth: { type: "public" }`, `routes/auth.ts:49, 69, 81`) and
  `GET /health` (raw `app.get`, `app.ts:44`; no descriptor, so not in the manifest). T-3 holds the 3 manifest
  routes and checks `/health` on its own; a fifth entry needs an owner-approved spec line.
- Standards check gains: rule `zod-array`; `raw-ilike` inside `sql` templates; exemption tags and per-tag
  counts (`design/data.md`).

## Tooling (T-1..T-4)
- `try`: `backend/package.json` script → `scripts/try.sh` (repo root; no root package). Uses the dev database of
  `backend/.env`. Read-only status probe (`backend/scripts/try-status.ts`), then `db:migrate` only after a
  typed yes, then `bun run dev` in `backend` and `frontend`. No drop, no reset, no seed, ever. API and UI
  listen on 127.0.0.1 only: `try` sets `HOST=127.0.0.1` (new optional env, passed as `hostname` to `serve()` in
  `src/index.ts`; unset = as today) and starts `next dev -H 127.0.0.1`. Today both listen on every interface.
- `db:test:rebuild`: `backend/scripts/test-db-rebuild.ts`; runs `db:reset --no-fixtures` as a child with
  `DATABASE_URL` set from `DATABASE_URL_TEST` for that child only; `_test` check via `src/lib/test-db-url.ts`.
- Permission matrix: T-3 extends the existing `backend/tests/routes/permissions-matrix.test.ts` (BR-AUTH-21
  seed-role matrix, 240 lines). Its last test filters `getRegistry()` on auth type `"roles"`; the types are
  `public` / `any-authenticated` / `permission` (`route-registry.ts:4–13`), so it matches nothing today. Added: one
  loop over the whole registry (401 without a token; 403 `PERMISSION_DENIED` for a role with none of the keys;
  public = exactly the 3 auth routes; unknown auth type fails) and one `GET /health` check. Existing tests stay.
- Playwright smoke (`frontend/e2e`, script `e2e`). Both are tests, written only by `test-writer`.

## Choices made
Moved to `../assumptions.md`.
| Question | Choice | Source |
|---|---|---|
