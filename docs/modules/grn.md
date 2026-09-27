---
module: grn
spec: none yet
last_verified_commit: 0a406f4
last_verified_on: 2026-09-27
depends_on: [purchase-order, inventory, suppliers]
---

# GRN (Goods Received Note) — as-built map

> What the code **is** (the spec says what it **should be**). Agents read this before touching the module
> and only explore code changed since `last_verified_commit`
> (`git diff 0a406f4..HEAD --stat -- backend/src/service/grnService.ts backend/src/repository/grnRepository.ts backend/src/routes/grn.ts backend/src/types/grn.types.ts frontend/src/lib/api/grn frontend/src/components/pages/grn frontend/src/components/views/grn`).
> Use symbol names, not line numbers — lines rot.

## Summary
Full slice covering GRN header + line capture against a dispatched/partial_received PO, per-line QA
accept/reject, a fast-track QA bypass path, and post-posting correction. Accept/bypass are the only
paths that post to `inventory_ledger` (via `assetRepository.createInventoryMovement`) and roll the
linked PO item/PO status forward. No automated tests exist for this module. Several schema tables in
the same file (`purchase_returns`, `supplier_invoices`, `supplier_payments`, subcontracting
orders/items/GRNs) have no service/controller/route layer at all — see Known gaps.

## Code locations
| Layer | Path | Key symbols |
|---|---|---|
| schema | `backend/src/db/schemas/02_procurement-purchasing.ts` | `grns`, `grnItems`, `qaTests`, `grnStatusEnum`, (schema-only: `purchaseReturns`, `purchaseReturnItems`, `supplierInvoices`, `supplierBankDetails`, `supplierPayments`, `subcontractingOrders`, `subcontractingOrderItems`, `subcontractingGrns`, `subcontractingGrnItems`) |
| types | `backend/src/types/grn.types.ts` | `grnSchema`, `grnItemSchema`, `grnItemDetailSchema`, `grnDetailsSchema`, `createGrnSchema`, `updateGrnSchema`, `grnQaActionSchema`, `grnBypassSchema`, `grnCorrectionSchema`, `grnListQuerySchema` |
| repository | `backend/src/repository/grnRepository.ts` | `createWithItems`, `findGrnItemForUpdate`, `updateGrnItemLine`, `insertQaTest`, `setGrnStatus`, `findDefaultReceivingLocationId`, `list`, `getDetails`, `withTransaction` |
| service | `backend/src/service/grnService.ts` | `create`, `update`, `remove`, `qaAction`, `bypass`, `correction`, `recomputeGrnHeaderStatus` (private), `overReceiptGuard` (private) |
| controller | `backend/src/controller/grnController.ts` | `list`, `details`, `create`, `update`, `remove`, `qaAction`, `bypass`, `correction` |
| routes | `backend/src/routes/grn.ts` + `END_POINTS.grn` (`backend/src/routes/end-points.ts`) | `list`, `details`, `create`, `update`, `remove`, `qaAction`, `bypass`, `correction` |
| frontend api | `frontend/src/lib/api/grn/fetchers.ts`, `frontend/src/lib/api/grn/queries.ts` | list/detail/create/update/remove/qaDecision/bypass/correction fetchers + TanStack Query hooks |
| frontend ui | `frontend/src/app/(protected)/grn`, `frontend/src/app/(protected)/grn/[grnId]`, `frontend/src/components/views/grn/{GrnView,GrnDetailView}.tsx`, `frontend/src/components/pages/grn/{CreateGrnModal,EditGrnModal,GrnLinesTable,GrnTrackingTable,GrnQaDecisionModal,GrnBypassAlert,GrnCorrectionAlert}.tsx`, `frontend/src/lib/grn-status-badge.ts`, `frontend/src/lib/grn-permissions.ts` | |

## Data model
- `grns` — header: `grnNumber` (unique, `GRN-<periodKey>-<seq>` via `allocateDocumentSequence`), `poId` → `purchase_orders`, `supplierId` → `supplier_master`, `status` (`grn_status`: `draft`, `pending_qa`, `accepted`, `rejected`, `partial_accepted`), `receivedDate`, `createdBy`, plus arrival-desk fields `challanNo`, `challanDate`, `vehicleNo`, `driverName`, `driverPhone`, `remarks`. No `locationId` column — every accept/bypass posts to the first `main_store` location (see gotchas).
- `grnItems` — line: `grnId`, `poItemId` → `purchase_order_items`, `receivedQty` (arrived qty at draft time), `acceptedQty`, `rejectedQty`, `qaStatus` (free-text: `pending`/`passed`/`failed`/`waived`, not a pg enum), `isQaBypassed`, `qaBypassReason`, `qaBypassedBy`, `challanPhotoUrl` (column exists, no upload path wired to it yet).
- `qaTests` — one row per QA decision on a line: `grnItemId`, `type` (`internal`/`external`, service only ever writes `"internal"`), `status`, `externalLabName`, `testReportUrl`, `testedBy`, `testedAt`, `notes`. Accept/reject each insert exactly one row here (`certificateUrl`/`remarks` from the request land in `testReportUrl`/`notes`, not on `grnItems` — that table has no such columns).
- Ledger posting: on accept, `assetRepository.createInventoryMovement` inserts into `inventory_ledger` with `referenceType="grn"`; on bypass, `referenceType="grn_bypass"`; on correction, `referenceType="stock_adjustment"` with a negative `quantityChange`. `unitCostPaise` on every posting is the PO line's `unitPricePaise` — GRN does not itself recompute or write `itemMaster.averageCostPaise` (see Known gaps, shared with `inventory.md`).
- PO linkage: `grnItems.poItemId` → `purchaseOrderItems`; on accept/bypass, `poRepository.incrementPoItemReceivedQty` bumps `purchaseOrderItems.receivedQty` and `poService.recomputeReceiptStatus` may move the PO to `partial_received`/`fully_received`.
- Known-gap schema (same file, no routes/service/repository/controller at all): `purchaseReturns` + `purchaseReturnItems` (Purchase Return Order), `supplierInvoices` (3-way match), `supplierBankDetails`, `supplierPayments`, `subcontractingOrders` + `subcontractingOrderItems`, `subcontractingGrns` + `subcontractingGrnItems`.

## API
| Method | Path | Roles | Purpose |
|---|---|---|---|
| GET | `/api/grn/getgrns` | super-admin, owner, back_office, floor_supervisor, qa_inspector, die_designer | List GRNs, paginated, filterable by `poId`/`status`/`qaStatus` (line-level EXISTS filter) |
| GET | `/api/grn/getgrndetails/:id` | same as list | GRN header + lines joined to `itemMaster`/`purchaseOrderItems` |
| POST | `/api/grn/creategrn` | super-admin, owner, back_office, floor_supervisor | Create draft GRN + lines against a `dispatched`/`partial_received` PO |
| PATCH | `/api/grn/updategrn` | same as create | Edit header fields / line `arrivedQty` — draft only |
| DELETE | `/api/grn/deletegrn/:id` | same as create | Delete a draft GRN + its lines |
| POST | `/api/grn/:id/lines/:lineId/qa` | super-admin, owner, back_office, qa_inspector | Accept/reject a line; accept posts to ledger + rolls PO forward |
| POST | `/api/grn/:id/lines/:lineId/bypass` | super-admin, owner, back_office, floor_supervisor | Fast-track bypass (mandatory reason), posts immediately as `grn_bypass` |
| POST | `/api/grn/:id/lines/:lineId/correction` | super-admin, owner, back_office | Negative `stock_adjustment` ledger entry against an already-posted line |

Full shapes: `cd backend && bun run contract:query "<METHOD /path>"`.

## Key flows
- `create`: `grnController.create` → `grnService.create` → verify PO exists and is `dispatched`/`partial_received` → verify every `poItemId` belongs to that PO → `grnRepository.createWithItems` (tx: allocates `GRN-<periodKey>-<seq>`, inserts header as `draft`, inserts lines with `acceptedQty=0`, `qaStatus="pending"`).
- `qaAction` (accept): `grnRepository.findGrnItemForUpdate` (joined to PO item for `unitPricePaise`/`orderedQty`/`poItemReceivedQty`) → guard line not already finalized → `overReceiptGuard` (>105% of ordered qty blocks unless actor is owner/back_office) → `assetRepository.createInventoryMovement` (own transaction, posts ledger row + computes `balanceAfter`) → separate transaction: `updateGrnItemLine` (`acceptedQty`, `qaStatus="passed"`) + `insertQaTest` + `poRepository.incrementPoItemReceivedQty` + `poService.recomputeReceiptStatus` + `recomputeGrnHeaderStatus`.
- `qaAction` (reject): no ledger call — single transaction: `updateGrnItemLine` (`rejectedQty`, `qaStatus="failed"`) + `insertQaTest("failed")` + `recomputeGrnHeaderStatus`.
- `bypass`: same shape as accept but `referenceType="grn_bypass"`, `qaStatus` set to `"waived"`, `isQaBypassed=true`, mandatory `bypassReason` recorded on the line.
- `correction`: guard line already posted (`isQaBypassed` or `qaStatus==="passed"`) and `input.qty <= line.acceptedQty` → single `assetRepository.createInventoryMovement` call with `transactionType="adjustment"`, `referenceType="stock_adjustment"`, negative `quantityChange`. Does not touch the original `grnItems` row.
- `recomputeGrnHeaderStatus` (called after every line mutation): a line is "finalized" if bypassed or `qaStatus` is `passed`/`failed`; header becomes `accepted` if all finalized+accepted, `rejected` if all finalized+rejected, `partial_accepted` if finalized-but-mixed, else stays `pending_qa`. Only ever moves the header forward from `draft`, never back.

## Invariants & gotchas
- **Non-atomic posting is a known, accepted limitation**: `createInventoryMovement` opens its own internal transaction and cannot be composed with the grnItems/PO-rollup transaction that follows in `qaAction`/`bypass`. A crash between the two leaves a ledger entry with no matching GRN-line update. Explicitly called out in comments in `grnService.ts`, not fixed.
- GRN header has no `locationId` — every posting goes to the first row where `locations.type = "main_store"` ordered by `id`. Throws `NotFoundError` if none exists (`findDefaultReceivingLocationId`). Multi-warehouse receiving is not supported.
- Over-receipt tolerance is hardcoded at 105% of the PO line's ordered qty (`OVER_RECEIPT_TOLERANCE_RATIO`); only `owner`/`back_office` can override.
- `qaStatus` on `grnItems` is a free-text column (`"pending"|"passed"|"failed"|"waived"` by convention), not a pg enum — no DB-level constraint against typos.
- `update`/`remove` are draft-only; once any line has been QA-decided or bypassed, the GRN can no longer be edited or deleted — only individual lines via `correction`.
- `correction` never mutates the original `grnItems` row (audit trail preserved) — the accepted qty shown on the line will not reflect corrections; only the ledger does.
- No test coverage exists for `grnService`/`grnRepository` — verify behavior by direct code read, not by relying on existing specs/tests.

## Tests
| File | Covers |
|---|---|
| — | none — no `*.test.ts` file targets grn service/repository/controller |

## Known gaps / debt
- Schema-only, no routes/service/repository/controller anywhere in the codebase: purchase returns (`purchaseReturns`, `purchaseReturnItems`), supplier invoices / 3-way match (`supplierInvoices`), supplier payments (`supplierPayments`), supplier bank details (`supplierBankDetails`, see also `suppliers.md`), subcontracting orders + items (`subcontractingOrders`, `subcontractingOrderItems`), and subcontracting GRNs + items (`subcontractingGrns`, `subcontractingGrnItems`). The `sco_receipt`/`sco_issue`/`pro` values in `inventoryRefTypeEnum` exist for these but nothing ever writes them.
- Non-atomic ledger vs. rollup writes on accept/bypass (see gotchas) — a real crash-consistency gap, not just theoretical.
- `grnItems.qaStatus` is untyped text, drifting risk vs. the pg-enum pattern used elsewhere in this schema file.
- `challanPhotoUrl` column exists on `grnItems` with no upload endpoint or frontend wiring found.
- No automated tests for any part of this module.

## History
| Date | PR / commit | Change |
|---|---|---|
| 2026-09-27 | 0a406f4 | Initial as-built map written |
