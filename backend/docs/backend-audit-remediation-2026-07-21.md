# Backend Audit Remediation Plan

Date: 2026-07-21
Scope: Backend changes currently in working tree (`src/**`) focused on Purchase Requisition flow.

Environment: Dev-only. No production deployment or external users yet. Several findings below are re-prioritized with this in mind — see inline "Dev-only note" callouts on affected items.

> **Status as of 2026-09-27** (BL-021 — every item re-checked against current `backend/src` / `frontend/src`; status tags are inline on each item)
>
> 25 items: **13 resolved**, **4 partially resolved** (remainder open), **7 open**, **1 no-action** (backend) with a frontend follow-up.
> Section numbering (1–16, 11.1, P0.1–P2.4, S1–S7, B1–B4) checked — already sequential, no renumbering needed.
>
> Open and tracked: P0.3 → BL-011 (generated migrations, D-004) · P2.3 frontend side → BL-001.
>
> Open and **not in `docs/backlog.md`**:
> - P1.2 — `prService.update` still writes PR lines one row at a time (`prRepository.updatePrItemById` / `createPrItem` in loops); reads are batched now.
> - §4 — `prService.update` has not been split into helpers (still one ~200-line function).
> - §5 — no PR route/service tests yet (covered by milestone M1 "PR spec + BR tests", no BL id).
> - §14 — no supplier tests.
> - S1 — supplier batch edit now runs `Promise.all` over the whole batch with no concurrency cap and no `.max()` on the batch array (`supplierService.editSupplierItems` / `editSupplierServices`, `supplier.types.ts` `supplierItemBatchEditSchema` / `supplierServiceBatchEditSchema`).
> - S2 — no `pg_trgm` / trigram indexes; supplier search still uses `OR + ILIKE + EXISTS` (`supplierRepository.list`).
> - S4 — item and service create/batch-edit logic is still duplicated (`supplierService.createSupplierItem` vs `createSupplierService`, `editSupplierItems` vs `editSupplierServices`).
> - B1 remainder — `q` still ILIKE-matches `type::text` / `status::text` (`prRepository.list`), and the frontend still sends status/type through `q` (`PurchaseRequisitionsView` → `usePurchaseRequisitionsQuery({ q })`).
> - B2 remainder — supplier batch edit rows return the raw `error.message` for non-conflict errors (`supplierService.editSupplierItems` / `editSupplierServices` catch blocks).
> - B3 — access token is still returned in the JSON body and read only from `Authorization` (`authController`, `auth-middleware.ts` `requireAuth`); frontend keeps it in localStorage, a JS cookie and Zustand persist (`frontend/src/lib/auth/token.ts`, `auth-session-store.ts`).
> - B4 follow-up (frontend) — `frontend/proxy.ts` still fetches `/auth/me` on navigation.

## 1) Executive Summary

This document translates the backend audit findings into an implementation-ready remediation plan.

Primary risk themes:

- Data integrity risk in procurement schema (nullable fields that should be required).
- Runtime contract inconsistency (raw errors, weak lifecycle guardrails).
- Performance scaling risk (month-wide sequence scans, update-path N+1 queries).
- Delivery risk (no automated tests and no lint gate in current scripts).

Current checks observed (as of 2026-07-21 — **stale 2026-09-27:** `lint` = `biome check .`, `bun test` has tests, both run in `.github/workflows/ci.yml`; see §6):

- Typecheck: passing (`bun run typecheck`).
- Lint: script missing.
- Tests: no tests found.

## 2) Files In Scope

- `src/routes/pr.ts`
- `src/controller/prController.ts`
- `src/service/prService.ts`
- `src/repository/prRepository.ts`
- `src/types/pr.types.ts`
- `src/db/schemas/02_procurement-purchasing.ts`
- `src/db/schemas/02_procurement-approval.ts`
- `src/db/schemas/02_procurement.ts`
- `src/lib/async-handler.ts`
- `src/routes/index.ts`
- `package.json`

## 3) Prioritized Remediation Backlog

### P0 (Do First: correctness + integrity)

#### P0.1 Enforce non-null integrity for PR core columns

**[RESOLVED 2026-09-27 — `src/db/schemas/02_procurement-purchasing.ts`: `purchaseRequests.requestedBy/createdAt/updatedAt` and `purchaseRequestItems.prId/itemId` are all `.notNull()`; applied via `db:push`, no backfill needed (dev-only)]**

> **Dev-only note:** No production data exists yet, so skip the backfill/quarantine ceremony below. Add `NOT NULL` directly and reset/reseed the local dev DB if any rows violate it. Revisit the full backfill-safe version of this migration only before staging/production use with real data.

Problem:

- PR and PR item schema columns used as mandatory by service logic are nullable.

Targets:

- `purchase_requests.requested_by`
- `purchase_requests.created_at`
- `purchase_requests.updated_at`
- `purchase_request_items.pr_id`
- `purchase_request_items.item_id`

Solution:

1. Create migration with backfill strategy before constraints.
2. Backfill null rows to safe values (or quarantine invalid rows in temp table for manual reconciliation).
3. Apply `NOT NULL` constraints and verify FK consistency.

Example migration sketch:

```sql
-- 1) Optional: move bad rows out for manual review
-- CREATE TABLE purchase_request_items_invalid AS
-- SELECT * FROM purchase_request_items WHERE pr_id IS NULL OR item_id IS NULL;

-- 2) Remove or fix invalid child rows before constraints
DELETE FROM purchase_request_items
WHERE pr_id IS NULL OR item_id IS NULL;

-- 3) Backfill timestamps
UPDATE purchase_requests
SET created_at = NOW()
WHERE created_at IS NULL;

UPDATE purchase_requests
SET updated_at = COALESCE(updated_at, created_at, NOW())
WHERE updated_at IS NULL;

-- 4) If requested_by can be null historically, pick policy:
--    a) backfill to system user id OR
--    b) keep nullable by explicit domain decision
-- Recommended: enforce non-null after backfill
-- UPDATE purchase_requests SET requested_by = <SYSTEM_USER_ID> WHERE requested_by IS NULL;

ALTER TABLE purchase_requests
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE purchase_request_items
  ALTER COLUMN pr_id SET NOT NULL,
  ALTER COLUMN item_id SET NOT NULL;

-- Add this only after requested_by backfill policy is complete
-- ALTER TABLE purchase_requests ALTER COLUMN requested_by SET NOT NULL;
```

Acceptance criteria:

- No rows violate new constraints.
- PR create/update/details/list paths continue to work on migrated DB.

#### P0.2 Remove raw `Error` throw path; use AppError contract

**[RESOLVED 2026-09-27 — `prRepository.createWithItems` throws `AppError("Failed to create purchase request", 500, "PR_CREATE_FAILED")`; no raw `Error` left in PR files]**

Problem:

- `prRepository.createWithItems()` throws generic `Error`.

Solution:

- Replace raw `Error` with typed domain error (`ConflictError`/`BadRequestError`/custom `AppError`) either:
  - directly in repository, or
  - by mapping unknown repository exceptions in service boundary.

Acceptance criteria:

- All PR API failures return stable JSON error shape and expected HTTP status.

#### P0.3 Generate and apply migration for new schema fields

**[OPEN — tracked as BL-011 (switch to generated migrations before UAT-1, D-004). Schema has `currentApprovalLevel`/`totalApprovalLevels` + approval tables and is applied with `db:push`, but `src/db/migrations/` stops at `20260702160914_add_role_pages_unique` and has none of them]**

> **Dev-only note:** Still worth doing now to keep Drizzle migration history in sync with schema, but no data-loss risk since there's no production data. Safe to `drizzle-kit push` directly during active dev.

Problem:

- New procurement/approval schema changes appear without a guaranteed migration in this workset.

Solution:

1. Run migration generation.
2. Inspect SQL to ensure all added columns and enums are included.
3. Apply to local DB.

Commands:

```bash
bun drizzle-kit generate:pg
bun drizzle-kit push
bun run typecheck
```

Acceptance criteria:

- DB and code contracts match for `currentApprovalLevel`, `totalApprovalLevels`, and approval tables.

### P1 (Performance + complexity)

#### P1.1 Replace month-wide PR number scan with atomic sequence strategy

**[RESOLVED 2026-09-27 — `src/lib/document-number.ts` `allocateDocumentSequence` does one atomic `INSERT … ON CONFLICT DO UPDATE last_seq = last_seq + 1 RETURNING` on `document_number_counters` (`01_auth.ts`, keyed by `docType` + `periodKey`), called inside the `prRepository.createWithItems` transaction; `getMonthlyPrNumbers` and the retry loop are gone. Shared with PO/GRN numbering]**

> **Dev-only note:** Concurrency collisions are unlikely with a single/small dev team creating PRs. Safe to defer until before shared/staging use or once PR volume grows — the existing retry loop is functionally correct today, just not scalable.

Problem:

- PR creation scans all monthly PR numbers and retries on collision.

Current behavior:

- `getMonthlyPrNumbers(prefix)` + in-memory max suffix parsing.

Risks:

- O(n) scan per create at month scale.
- Retry loops increase contention during concurrent inserts.

Recommended solution (DB-safe):
Option A (recommended): dedicated monthly counter table with row lock.

- Table: `pr_number_counters(month_key text primary key, last_seq int not null)`.
- Transaction flow:
  1. `INSERT ... ON CONFLICT DO NOTHING` for current month key.
  2. `SELECT ... FOR UPDATE` row.
  3. increment `last_seq`.
  4. format `PR-YYYY-MM-<seq>` and insert PR.

Example SQL concept:

```sql
CREATE TABLE IF NOT EXISTS pr_number_counters (
  month_key text PRIMARY KEY,
  last_seq integer NOT NULL
);
```

Acceptance criteria:

- Concurrent create requests never duplicate PR number.
- No month-wide scans in create path.

#### P1.2 Collapse update path N+1 queries into batched transaction

**[PARTIAL — OPEN, not in backlog. Done: `prService.update` runs in one `db.transaction`, fetches existing lines once (`findPrItemsByPrId`) and item master once (`findItemMasterByIds`), validates duplicates in memory, deletes in one call (`deletePrItemsByIds`). Open: updates and inserts are still one query per row (`prRepository.updatePrItemById` / `createPrItem` inside `for` loops), so round-trips still grow with item count]**

Problem:

- `prService.update()` issues per-item existence checks + updates sequentially.

Solution:

1. Build in-memory plan from request payload:

- item IDs to validate
- existing PR item IDs to update
- new rows to insert

2. Fetch existing PR items once.
3. Fetch item master map once.
4. Validate duplicates once.
5. Execute all writes in one transaction.

Repository additions (suggested):

- `findPrItemsByIds(prId, ids[])`
- `bulkUpdatePrItems(prId, updates[])`
- `bulkCreatePrItems(prId, creates[])`

Acceptance criteria:

- DB round-trips no longer scale linearly with item count.
- Update logic remains behaviorally identical for valid inputs.

#### P1.3 Add status transition guardrails

**[RESOLVED 2026-09-27 — `prService.ts` `PR_STATUS_TRANSITIONS` + `assertValidStatusTransition` (throws `BadRequestError`), used by `prService.update` and `prService.cancel`; approval-owned statuses (`approved`, `rejected`, `partial_ordered`, `fully_ordered`) are rejected on PATCH (`APPROVAL_OWNED_STATUSES`). Rules not yet spec'd / tested — PR spec is still draft]**

Problem:

- Status updates/cancel do not enforce transition policy.

Solution:

- Introduce explicit transition matrix in service:
  - `draft -> pending_approval|cancelled`
  - `pending_approval -> approved|rejected|cancelled`
  - `approved -> partial_ordered|fully_ordered`
  - `fully_ordered -> (terminal)`
  - etc.
- Reject illegal moves with `BadRequestError`.

Acceptance criteria:

- Illegal transitions are blocked consistently.

### P2 (Contract cleanup + operational hygiene)

#### P2.1 Remove request-body debug logs

**[RESOLVED 2026-09-27 — no `console.log` in `prController.ts` (or any controller/service); only the request logger in `src/app.ts` and startup logs in `src/index.ts` remain]**

Problem:

- Raw body logs in controller create/update handlers.

Solution:

- Remove `console.log("body", body)` from PR controller.
- If needed, replace with redacted structured logging under debug flag.

Acceptance criteria:

- No payload dumps in production logs.

#### P2.2 Validate actor ID from auth context

**[RESOLVED 2026-09-27 — `prController.ts` `parseActorId` checks integer > 0, throws `UnauthorizedError("Invalid user session")`; used by `create`]**

Problem:

- `Number(c.get("user").userId)` can produce NaN.

Solution:

- Parse and validate actor ID (`int > 0`) in controller or auth middleware.
- Throw `UnauthorizedError` for invalid auth context.

Acceptance criteria:

- Actor identity failures return clean auth errors, not DB-level failures.

#### P2.3 Align delete contract to path param

**[RESOLVED (backend) 2026-09-27 — `END_POINTS.pr.remove = "/deletepr/:id"`, `prController.remove` reads `c.req.param("id")`. Frontend OPEN — tracked as BL-001: `frontend/src/lib/api/routes.ts` still has `remove: .../deletepr` with the id in the body → 404]**

Problem:

- Delete endpoint uses JSON body for PR id.

Solution:

- Change route from `/deletepr` body-based to `/:id` path-based delete.
- Keep backward compatibility window only if needed.

Acceptance criteria:

- Delete works with standard REST client/proxy behaviors.

#### P2.4 Remove `uom` from create payload contract

**[RESOLVED 2026-09-27 — `pr.types.ts` `createPrItemSchema` picks only `itemId`, `requestedQty`; `prService.create` / `update` take `uom` from item master]**

Problem:

- Input schema requires `uom` but service always derives from item master.

Solution:

- Remove `uom` from create item schema.
- Keep server-side authoritative derivation.

Acceptance criteria:

- API payload is minimal and semantically accurate.

## 4) Complexity Reduction Plan (Refactor Structure)

**[OPEN — not in backlog. `prService.update` is still one ~200-line function; none of the helpers below exist]**

Target split for `prService.update()`:

- `validateUpdateRequest(input, existingPr)`
- `buildItemMutationPlan(inputItems, existingItems)`
- `validateCatalogItems(itemIds)`
- `applyItemMutations(tx, plan, itemMasterMap)`

Benefits:

- Lower cognitive load in one function.
- Easier unit testing by function boundary.
- Fewer regressions when modifying business rules.

## 5) Test Strategy (Minimum Viable Coverage)

**[OPEN — no BL id; covered by milestone M1 (PR spec + business-rule tests). There are no PR tests: current tests are `app.test.ts`, `approvalRepository.test.ts`, `approval.types.test.ts`, `route-registry.test.ts`, `test-db-url.test.ts`, `frontend-routes-contract.test.ts`. Test DB infra is in place (BL-006). Note: `parseExpectedDate` no longer exists in `src/`; the sequence test now targets `allocateDocumentSequence`]**

Add tests under `src/**/__tests__` or `src/**/*.test.ts`.

### Route-level integration tests

- `GET /pr/getprs`:
  - pagination defaults and bounds
  - `q`, `sortBy`, `sortDir` behavior
  - unauthorized and forbidden role cases
- `GET /pr/getprdetails/:id`:
  - invalid id
  - not found
  - success response shape
- `POST /pr/createpr`:
  - maintenance requires `assetId`
  - invalid item IDs
  - duplicate item in payload
  - PR number uniqueness under concurrency (parallel calls)
- `PATCH /pr/updatepr`:
  - status-only update
  - item update/create mix
  - duplicate final item set blocked
- `DELETE /pr/...`:
  - cancel allowed state
  - illegal state rejection (after transition matrix)

### Service-level unit tests

- `parseExpectedDate`
- monthly/sequence behavior (or counter strategy)
- transition matrix validation

## 6) Quality Gates to Add

**[RESOLVED 2026-09-27 — `package.json` has `typecheck`, `lint` (`biome check .`), `lint:fix`, `format`, `test`; Biome in devDependencies + `biome.json`; `.github/workflows/ci.yml` runs typecheck → lint → `bun test` → `contract:check` (BL-000)]**

Current gap:

- no `lint` script and no tests.

Recommended scripts in `package.json`:

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "bun test",
    "lint": "biome check .",
    "format": "biome format --write ."
  }
}
```

If Biome is not installed in this repository yet, either:

- install and configure Biome, or
- add an alternative lint gate already used by this backend.

CI gate order:

1. `bun run typecheck`
2. `bun run lint`
3. `bun test`

## 7) Delivery Plan (Practical Sequence)

1. Data safety first:

- Migration for not-null/FK integrity and new approval/level columns.
- Verify seed and existing data compatibility.

2. Runtime correctness:

- AppError normalization.
- remove payload logs.
- actorId validation.
- status transition matrix.

3. Performance hardening:

- Replace PR monthly scan with atomic counter.
- refactor update path to batch operations.

4. Test + quality gates:

- add route/service tests for PR flow.
- add lint script and ensure it runs in CI.

## 8) Done Definition

A remediation cycle is complete when all are true:

- DB schema constraints and code assumptions are aligned.
- No raw `Error` in PR flow boundary.
- PR create path is atomic without month-wide scans.
- PR update avoids N+1 per-item lookups/writes.
- status transitions enforced.
- request payload logs removed.
- tests exist for critical PR paths.
- local gates pass:

```bash
bun run typecheck
bun run lint
bun test
```

## 9) Known Risks / Tradeoffs

- Tightening `NOT NULL` on historical data requires a clear backfill policy.
- Introducing transition matrix can block existing client behavior if UI sends illegal transitions; coordinate rollout.
- Atomic counter migration touches ID generation logic; test concurrency before production use.

## 10) Suggested Next Action

Start with P0.1 + P0.3 in one branch, then P1.1 in the next commit to isolate migration risk from performance refactor.

## 11) Supplier Routes Audit Addendum

Date Added: 2026-07-22
Scope: Supplier backend flow only.

Files reviewed:

- `src/routes/supplier.ts`
- `src/controller/supplierController.ts`
- `src/service/supplierService.ts`
- `src/repository/supplierRepository.ts`
- `src/types/supplier.types.ts`
- `src/db/schemas/02_procurement-suppliers.ts`

### 11.1 Summary

- No high-severity security or authorization break detected in supplier flow.
- Main concerns are medium-severity performance and technical debt items:
  - sequential batch update loops,
  - search-query scalability,
  - avoidable join-heavy count queries,
  - duplicated route aliases and duplicated service orchestration.

## 12) Supplier Findings and Fixes

### S1 (Medium) Sequential batch edit writes

**[PARTIAL — OPEN, not in backlog. Done: `supplierService.editSupplierItems` / `editSupplierServices` no longer `await` in a loop; they run `Promise.all` over the batch and keep the per-row `success`/`error` result + `buildBatchSummary`. Open: concurrency is unbounded (no cap of 5–10) and `supplierItemBatchEditSchema` / `supplierServiceBatchEditSchema` have no `.max()`, so one request can open as many concurrent queries as it has rows]**

Locations:

- `src/service/supplierService.ts` (`editSupplierItems`, `editSupplierServices`)

Problem:

- Batch edit methods execute per-row updates sequentially with `await` inside loops.

Impact:

- Latency increases linearly with batch size.
- Higher p95 response time and connection hold time under load.

Solution:

1. Preserve existing per-item result shape (`success`/`error` per row).
2. Execute DB writes with bounded concurrency (for example, max 5-10 concurrent operations), or
3. move to repository-level bulk mutation in one transaction where possible.

Acceptance criteria:

- Same response contract as today.
- Lower p95 for large edit batches.
- No partial data corruption on mixed-success batches.

### S2 (Medium) Supplier list search likely to degrade at scale

**[OPEN — not in backlog. `supplierRepository.list` still uses `OR` of `ILIKE` on name/contactPerson/email/phone + `EXISTS` subquery on `item_master.sku`; no `pg_trgm` extension or trigram indexes in `src/db/schemas/`]**

Locations:

- `src/repository/supplierRepository.ts` (`list` query with `OR + ILIKE + EXISTS` SKU subquery)

Problem:

- Combined text search across supplier fields and SKU correlated `EXISTS` can produce expensive query plans.

Impact:

- Query cost growth with supplier/item volume.
- Potential full scans under broad text queries.

Solution:

1. Add `pg_trgm` extension and trigram indexes for searched text columns.
2. Add trigram index for `item_master.sku`.
3. Optionally split SKU lookup into an explicit filter path if query plans remain unstable.

Migration sketch:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_supplier_master_name_trgm
  ON supplier_master USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_supplier_master_contact_person_trgm
  ON supplier_master USING gin (contact_person gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_supplier_master_email_trgm
  ON supplier_master USING gin (email gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_supplier_master_phone_trgm
  ON supplier_master USING gin (phone gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_item_master_sku_trgm
  ON item_master USING gin (sku gin_trgm_ops);
```

Acceptance criteria:

- `EXPLAIN ANALYZE` shows index-assisted plans for common text search.
- Observable reduction in list query latency on realistic data volumes.

### S3 (Medium) Count queries are heavier than needed

**[RESOLVED 2026-09-27 — `supplierRepository.listSupplierItems` / `listSupplierServices` count only `supplier_items` / `supplier_services` by `supplierId` when there is no `q`; the joined count runs only when a search pattern is present]**

Locations:

- `src/repository/supplierRepository.ts` (`listSupplierItems`, `listSupplierServices` count branches)

Problem:

- Count queries always inner-join catalog tables even when `q` is empty.

Impact:

- Avoidable CPU/IO overhead for common non-search requests.

Solution:

- Branch count logic by `q`:
  - if no `q`: count only `supplier_items` or `supplier_services` filtered by `supplierId`.
  - if `q` present: keep current joined count for searchable fields.

Acceptance criteria:

- Lower DB cost for default list pages with no search text.

### S4 (Medium) Duplicated service logic for item/service workflows

**[OPEN — not in backlog. Only small helpers are shared (`getConflictError`, `normalizeToArray`, `buildBatchSummary`); `createSupplierItem`/`createSupplierService` and `editSupplierItems`/`editSupplierServices` in `supplierService.ts` are still near-copies]**

Locations:

- `src/service/supplierService.ts` (`createSupplierItem` vs `createSupplierService`,
  `editSupplierItems` vs `editSupplierServices`)

Problem:

- Near-identical orchestration logic duplicated for items and services.

Impact:

- Higher maintenance overhead.
- Bug-fix divergence risk.

Solution:

- Extract shared helper(s) with typed strategy callbacks:
  - validate referenced master ids,
  - select update path by selector,
  - normalize conflict error mapping,
  - build standard batch summary.

Acceptance criteria:

- Shared behavior centralized.
- No change in API response payload.

### S5 (Medium) API/DB contract ambiguity on payment terms nullability

**[RESOLVED 2026-09-27 — `supplierMaster.defaultPaymentTermsDays` is `.default(0).notNull()` (`02_procurement-suppliers.ts`) and the response schema is `supplierSchema = createSelectSchema(supplierMaster)` (`supplier.types.ts`), so the API type is a non-null number; create/update take `z.number().int().nonnegative().optional()`]**

Locations:

- `src/types/supplier.types.ts` (`defaultPaymentTermsDays` in response schema)
- `src/db/schemas/02_procurement-suppliers.ts` (`default_payment_terms_days` default)

Problem:

- API model allows nullable field while DB and create/update flow use numeric defaults.

Impact:

- Contract ambiguity for frontend consumers.
- Extra null-branch handling with unclear domain meaning.

Solution:

1. Decide canonical domain: recommended `number` (non-null, default 0).
2. Backfill historical nulls if present.
3. Align Zod response schema and repository return normalization.

Acceptance criteria:

- Single stable type for `defaultPaymentTermsDays` across API responses.

### S6 (Low) Duplicate legacy route aliases

**[RESOLVED 2026-09-27 — `editItemLegacy` / `editServiceLegacy` and the `EditItem`/`EditService` paths are gone from `src/routes/supplier.ts` and `END_POINTS.supplier`; only the lowercase `editItem` / `editService` remain]**

Locations:

- `src/routes/supplier.ts` (`editItemLegacy`, `editServiceLegacy`)

Problem:

- Case-variant legacy aliases (`EditItem`, `EditService`) remain active beside canonical routes.

Impact:

- Route surface area and maintenance burden increase.

Solution:

1. Keep canonical lowercase paths as source of truth.
2. Mark legacy aliases deprecated.
3. Remove aliases after compatibility window.

Acceptance criteria:

- Single canonical endpoint per operation.

### S7 (Low) Raw `Error` throw in supplier repository create transaction

**[RESOLVED 2026-09-27 — `supplierRepository.create` throws `AppError("Failed to create supplier", 500, "SUPPLIER_CREATE_FAILED")`]**

Locations:

- `src/repository/supplierRepository.ts` (create transaction guard)

Problem:

- Uses `throw new Error("Failed to create supplier")` instead of typed `AppError`.

Impact:

- Inconsistent error semantics and observability taxonomy.

Solution:

- Throw typed domain error or map unknown repository errors to typed app error in service layer.

Acceptance criteria:

- Supplier create failure paths emit consistent structured errors.

## 13) Supplier Implementation Order

1. Performance first (safe, high ROI):

- S3 count query branching.
- S1 bounded concurrency/bulk edit strategy.

2. Scale-hardening:

- S2 trigram indexes and plan validation (`EXPLAIN ANALYZE`).

3. Debt reduction:

- S4 shared helper extraction.
- S6 legacy route deprecation path.
- S5 payment terms contract alignment.
- S7 typed error normalization.

## 14) Supplier Test Additions

**[OPEN — not in backlog. No supplier tests exist. Supplier is not in the M1 scope (PR, Approval, PO, GRN). The "legacy routes" case no longer applies (S6 resolved)]**

Minimum coverage to add:

- Batch item edit with mixed success/failure and summary counts.
- Batch service edit with mixed success/failure and summary counts.
- Supplier list search (name/contact/email/phone/SKU) with pagination.
- No-search list items/services validates low-cost count branch behavior.
- Legacy routes return expected behavior during deprecation window.

Commands:

```bash
bun run typecheck
bun run lint
bun test
```

## 15) Combined Done Definition (PR + Supplier)

Remediation is complete when all are true:

- PR and Supplier flows use consistent typed app errors.
- Supplier batch operations no longer perform purely sequential write loops.
- Supplier search/count query paths are optimized and index-backed.
- Supplier route contract is canonicalized (legacy aliases retired or clearly deprecated).
- API contracts are aligned with DB nullability/default semantics.
- Tests cover critical PR and Supplier route/service behavior.

## 16) Backend Action Items From Frontend Audit Cross-Reference

Date Added: 2026-07-22
Context: Frontend audit (`ERP-diecast/frontend`) reviewed separately. Per stated architecture — backend owns all logic/validation, UI is a display shell — most frontend findings (state management bugs, missing base URL prefix, a11y gaps, naming inconsistency) are UI-only and need no backend change. The items below are the exceptions that do need backend action or backend-side confirmation.

### B1 (Medium) PR list should expose explicit `status`/`type` filters instead of relying on free-text `q`

**[PARTIAL — OPEN, not in backlog. Done: `prListQuerySchema` has `status` (comma-separated list of `prStatusSchema`) and `type` (`prTypeSchema`); `prRepository.list` applies them as `inArray` / `eq`, separate from `q`. Open: `q` still ILIKE-matches `type::text` and `status::text` too, and the frontend still sends status/type through `q` (`PurchaseRequisitionsView` calls `usePurchaseRequisitionsQuery({ q, … })` with no `status`/`type` params)]**

Problem:

- Frontend list controls push `status`/`type` values into the generic `q` search param because `prListQuerySchema` only has `q`, `sortBy`, `sortDir`, `page`, `pageSize`.
- This "works" today only as a side effect: `prRepository.list` matches `q` against `type::text` and `status::text` via `ILIKE`. The contract is implicit and undocumented — a future free-text multi-word search would break it silently.

Solution:

1. Add explicit optional `status` (enum) and `type` (enum) params to `prListQuerySchema`.
2. Add corresponding exact-match (`eq`) filter branches in `prRepository.list`, independent of the free-text `q` clause.
3. Update route documentation per the `api-endpoint-intake` / `pagination-contract` conventions.

Acceptance criteria:

- `GET /pr/getprs?status=draft&type=maintenance` filters by exact enum match, not substring/ILIKE.
- `q` becomes a documented free-text search (e.g. `prNumber` only, or explicitly listed multi-field search) and is no longer required to carry status/type.

### B2 (Medium) Error contract: guarantee only safe messages leave the backend

**[PARTIAL — OPEN, not in backlog. Done: P0.2 and S7 resolved; `src/app.ts` `onError` returns "Internal server error" for any non-`AppError`/`HTTPException`/`ZodError` outside `NODE_ENV=development`. Open: the supplier batch-edit catch blocks (`supplierService.editSupplierItems` / `editSupplierServices`) put the raw `error.message` into the row's `error` field for non-conflict errors, so a DB-driver message can reach the UI inside a 200 response]**

Problem:

- Frontend shows backend `error.message` verbatim in toasts. This is only safe if the backend guarantees every thrown error has an intentional, user-safe message.
- This directly reinforces the existing P0.2 / S7 findings: raw `Error` throws in `prRepository.createWithItems()` and `supplierRepository.create()` could leak internal details if ever surfaced to the UI unchanged.

Solution:

- Complete P0.2 and S7 (typed `AppError` normalization everywhere in PR and Supplier flows).
- Adopt a standing rule: never let a raw framework/DB-driver error cross the service boundary unmapped.

Acceptance criteria:

- Every error response across PR/Supplier flows originates from a typed `AppError` subclass with a deliberate, user-safe message.

### B3 (Low, deferred) Access token exposure — architecture decision, not urgent in dev

**[OPEN (deferred) — not in backlog. `authController` still returns `accessToken` in the JSON body; `auth-middleware.ts` `requireAuth` reads only the `Authorization: Bearer` header; the frontend still keeps the token in `localStorage` + a JS cookie (`frontend/src/lib/auth/token.ts`) and Zustand `persist` (`auth-session-store.ts`)]**

Problem:

- Frontend stores the access token in `localStorage`, a non-`httpOnly` cookie mirror, and a Zustand `persist` copy — three readable-by-JS copies of the same secret (XSS → session takeover surface).
- A real fix requires the backend to issue the access token itself via an `httpOnly` cookie (the same pattern already used for the refresh token in `setRefreshCookie`) instead of returning it in the JSON body for client-side storage.

Backend impact if pursued:

- `authService.login` / `authService.refresh` would set an additional `httpOnly` cookie carrying the access token.
- `auth-middleware.ts` would need to read the access token from the cookie first, falling back to the `Authorization` header for non-browser clients.
- Frontend would drop `localStorage`/Zustand persistence entirely (frontend-side change, tracked there).

Decision for now:

- Dev-only, no production traffic yet → defer. Track as a pre-production security item, not a current blocker.

Acceptance criteria (when picked up):

- Access token never touches `localStorage` or any client-JS-readable storage.

### B4 (No action needed) `allowedPages` already embedded in JWT — backend contract is correct

**[NO ACTION (backend) — still true: `authService` login/refresh put `allowedPages` in the token payload. Note that BL-018 (refresh reuses stale `role`/`allowedPages`) affects this. Frontend follow-up OPEN — not in backlog: `frontend/proxy.ts` still fetches `/auth/me`]**

- Frontend audit finding #8 flags `proxy.ts` re-fetching `/auth/me` on every navigation even though `allowedPages` is already in the JWT payload (see `authService.login`/`refresh` payload construction).
- This is a frontend caching/decoding fix only (decode the JWT locally instead of calling `/auth/me` every route change). No backend change required — confirms the token payload already carries the right data.
