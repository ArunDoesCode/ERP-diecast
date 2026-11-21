---
module: sale-order
spec: docs/specs/sale-order/spec.md (v1, frozen)
last_verified_commit: 9d56369
last_verified_on: 2026-11-21
depends_on: [bom, purchase-requisition, purchase-order, subcontracting, inventory, auth-setup]
---

# Sale order (customers, SO, BOM explosion, drafts) — as-built map

> What the code **is** (the spec says what it **should be**). Built on `feature/scm-sale-order` inside epic
> `epic/scm` (S1 customers + SO lifecycle, S2 explosion + netting + reservations, S3 draft PRs/SCOs).
> Explore only code changed since `last_verified_commit`. Symbol names, not line numbers.

## Summary
Customer master and sale orders (draft → confirmed → on hold / closed / cancelled). A confirmed SO can be
exploded through active BOMs into a snapshot of rows (cast / job_work / assemble / buy), netted against free
stock and open PR / PO / SCO supply, with reservations. From a current snapshot the user raises one draft PR
and SCOs per job worker. Dispatch (delivery notes) is not built; its hooks exist as service functions.

## Code locations
| Layer | Path | Key symbols |
|---|---|---|
| schema | `backend/src/db/schemas/05_sales.ts` (barrel `schemas/index.ts`) | `customers`, `saleOrders`, `saleOrderLines`, `saleExplosions`, `saleExplosionRows`, `saleExplosionSources`, `saleReservations`, `salesAuditLog`; enums `so_status`, `so_close_kind`, `explosion_status`, `explosion_row_type`, `reservation_kind` |
| schema (PR) | `02_procurement-purchasing.ts` | `purchase_requests.sale_order_id` FK → `sale_orders` (lazy `(): AnyPgColumn =>`), `idx_purchase_requests_sale_order_id`, partial `idx_pr_items_item_open` |
| migration | `backend/src/db/migrations/20261121063850_condemned_miss_america/` | hand-edited: orphan cleanup, FK `NOT VALID` then `VALIDATE` |
| types | `types/customer.types.ts`, `types/saleOrder.types.ts` | create/PATCH bodies `.strict()` |
| repository | `customerRepository.ts`, `saleOrderRepository.ts`, `salesAuditRepository.ts`, `saleExplosionRepository.ts`, `inventoryReadRepository.ts` | out-of-date SQL `soChangedSql`, `deliveryChangedSql`, `bomChangedSql`, `explosionOutOfDate`; `markRaised`; `freeStockByItems(executor, itemIds)` |
| service | `customerService.ts`, `saleOrderService.ts`, `saleExplosionService.ts`, `saleDraftService.ts` | lifecycle + dispatch hooks + `assertConfirmedForPrLink`; run / list / details / rows; create drafts |
| seams in other modules | `prService.create(.., tx?)`, `prRepository` item lookup with `tx`; `scoService.create(.., outerTx?)`, `prepareScoCreate`, `insertPreparedSco`, `loadScoDetails`, `assertReturnDateInWindow`; `lib/db-errors.ts` `isLockTimeout`; `lib/milli.ts` | |
| controller / routes | `controller/{customerController,saleOrderController,notImplemented}.ts`; `routes/customer.ts`, `routes/saleOrder.ts`; `END_POINTS.customer`, `END_POINTS.saleOrder` | |
| permissions | `lib/permissions.ts` | `so.view`, `so.manage`, `so.explode`, `customer.manage`; screens `sale-orders` (120), `customers` (125), group Sales |
| frontend api | `lib/api/customers/`, `lib/api/sale-order/`, `types/customer.ts` (GST_STATES, GSTIN_PATTERN), `types/sale-order.ts` | `customerKeys` root `["customers"]`; `soKeys` root `["sale-orders"]` (list, detail, audit, explosions, explosion, explosion-rows) |
| frontend ui | `app/(protected)/customers/**`, `app/(protected)/sale-orders/**` (list, new, `[id]`, `[id]/edit`, `[id]/explosion?run=E1`); `components/views/{customers,sale-orders}/`; `components/pages/customers/` (CustomerForm, CustomerActiveDialog); `components/pages/sale-orders/` (SaleOrderForm, SoItemPicker, SoLinesCard, SoInfoCards, SoSidePanels, SoReasonDialog, ExplosionTable, explosion-helpers, so-format) | status-tone `so`, `soSnapshot`, `customer`, `soRowTag` |

## Data model
- `customers`: name (unique), state, GSTIN (normalised upper case, first 2 digits = state), address, `isActive`.
- `sale_orders`: number `SO-<yymm>-<seq4>` (counter "SO", IST month); `status` draft | confirmed | on_hold | closed | cancelled; `closeKind` manual | fully_delivered; `editVersion`, `needVersion`, `deliveryVersion`; reasons stay on the row.
- `sale_order_lines`: qty, price (paise), GST %, delivery date, `deliveredQty`, soft remove.
- `sale_explosions`: status current | superseded, run number `E<n>`; `sale_explosion_rows` (type cast | job_work | assemble | buy, level ≤10, gross / free / reserved / open PR/PO/SCO / net, tags, block reason); `sale_explosion_sources` (row ↔ SO line); `sale_reservations` (kind stock | open_pr | open_po | open_sco).
- `sales_audit_log`: actions so.create/edit/confirm/hold/resume/close/cancel/explode/drafts_created/delivery_applied/close_fully_delivered/reopen; customer.create/edit/activate/deactivate.
- No ledger postings (reservations are claims only).

## API
| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/api/customers`, `/api/customers/:id` | `so.view` or `customer.manage` | list (sort name, `isActive` "true/false"), detail |
| POST / PATCH | `/api/customers`, `/api/customers/:id` | `customer.manage` | create, edit / activate |
| GET | `/api/sale-orders`, `/:id`, `/:id/audit` | `so.view` | list (`meta.statusCounts`), detail (`currentSnapshot`, `raisedDocuments`), audit |
| POST / PATCH | `/api/sale-orders`, `/:id` | `so.manage` | create; PATCH lines: `id` = update, none = add, `removeLineIds`, `editVersion` |
| POST | `/:id/confirm`, `/hold`, `/resume`, `/close`, `/cancel` | `so.manage` | state moves (reasons 3–500) |
| POST | `/:id/explosions` | `so.explode` | run explosion |
| GET | `/:id/explosions`, `/:id/explosions/:eid`, `/:eid/rows` | `so.view` | runs, header (`totals`), rows |
| POST | `/:id/explosions/:eid/drafts` | `so.explode` (+ `pr.manage` / `sco.manage` per row type) | create draft PR + SCOs |
Seeds: owner + back_office all four keys; floor_supervisor none.

## Key flows
- Explode: one tx. `pg_try_advisory_xact_lock(7101, so)` (fail → 409 `EXPLOSION_IN_PROGRESS`), `pg_try_advisory_xact_lock(7100, 0)` (fail → 409 `EXPLOSION_BUSY`), SO row lock (lock_timeout 15 s), must be confirmed → supersede old snapshot + release claims → pass 1 shape (`expandBomLevel` qty 1, visited set) → pass 2 quantities by deepest level (an item at two levels is netted once) → insert snapshot / rows / sources / reservations → audit.
- Netting: free stock (on hand minus other SOs' claims; excludes virtual, scrap yard, inactive, `vendor_premise` locations) → open PR (pending / po_draft) → PO → SCO; supply due after `requiredBy` is late and not counted; undated counts.
- Drafts: pre-read (404 / 403) outside tx; tx: SO lock → status → snapshot superseded / out of date → rows `FOR UPDATE OF` → validate all → `prService.create(.., tx)` → SCOs → `markRaised` → audit. Numbers allocated only after validation.
- Dispatch hooks (exported from `saleOrderService`, `tx` first, SO row lock first, one audit row each): `applyDelivery(tx, {lineId, qty, actorId, noteRef})` (signed qty, needs confirmed, lowers stock claims oldest first); `closeFullyDelivered(tx, {soId, actorId, noteRef?})`; `reopenAfterDeliveryCancel(tx, {soId, actorId, noteRef?})` (hand-closed → 409 `SO_CLOSED_BY_HAND`).

## Invariants & gotchas
- `saleOrderId` on a PR (create, or edit when set/changed) must be a **confirmed** SO, else 400 `PR_SALE_ORDER_INVALID` (BR-SO-48). An old PR whose SO later closed stays editable.
- Migration `20261121063850` nulls every pre-existing `purchase_requests.sale_order_id` (no SO table existed) and appends "(old SO ref N)" to the PR notes.
- PR create/update schemas are `.strict()`: any extra key → 400.
- Error bodies: `handleAppError` spreads `details` at the top **and** nests it under `details`. `LIVE_DOCUMENTS_LINKED` → `details.documents[{type, number}]`; `CUSTOMER_PO_EXISTS` → `details.soNumber`.
- Hono strict routing: list routes have no trailing slash (`/api/sale-orders`, `/api/customers`).
- Version check runs before status check (`STALE_VERSION` first). A no-op PATCH bumps nothing. Zero lines → 400 `SO_MIN_ONE_LINE`. On a confirmed SO, `orderDate`, `customerPoNumber`, `customerPoDate` → 409 `SO_FIELD_LOCKED` if changed.
- Out-of-date SQL is one shared set of fragments in `saleOrderRepository`; any new version-bumping change must keep `need_version` / `delivery_version` / `bom_revision_id` in step. Out of date is set only on the current snapshot.
- Keep `sale_orders` unaliased in the list query (correlated subqueries for `snapshotStatus`, `nextDeliveryDate`).
- Explosion passes net/1000 (exact thousandths) to bom-math; job-work rows need a whole picked qty. Flag precedence `bom_loop` > `inactive_item` > `no_active_bom`.
- `timestamp` columns (PR expected date, PO / SCO dates) are UTC wall time; due days use `at time zone 'UTC' at time zone 'Asia/Kolkata'`.
- `05_sales.ts` and `02_procurement-purchasing.ts` import each other; safe only with lazy FK callbacks.
- Frontend: no PR detail route (links go to `/purchase-requisitions`); 409 PR/SCO numbers are scanned from `details`.

## Tests
| File | Covers |
|---|---|
| `backend/tests/routes/saleOrderCustomers.test.ts` | BR-SO-01..04, 52 (customers + audit) |
| `backend/tests/routes/saleOrder.test.ts` | BR-SO-02, 04..18, 20, 48, 52..54, 56, 57, 59..61 |
| `backend/tests/routes/saleOrderExplosion.test.ts` | BR-SO-09, 14..17, 19..47, 49..52, 54, 60, 62 |
| `backend/tests/service/saleOrderDispatchHooks.test.ts` | BR-SO-54, 55, 58 |

## Known gaps / debt
- Dispatch screens ("Dispatch" button, delivery-notes panel) wait for the dispatch build.
- BR-SO-49 (next-step button) is manual UAT only. PERF-05 counts query → backlog.
- Customer select on the SO form lists the first 100 active customers (no search).

## History
| Date | PR / commit | Change |
|---|---|---|
| 2026-11-21 | 93bb4c9..c179312, 6619864, 0f69a73 | Map created: sale order built to spec v1 on `epic/scm` (S1–S3, fixes CR-01..05, PERF-01/02, SEC-001/002) |
