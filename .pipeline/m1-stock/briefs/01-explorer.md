# Brief 01 — explorer — GRN/stock code facts for the grn + grn-stock BRs
Feature: m1-stock  Branch: work/m1-stock  Spec: docs/specs/grn.md (v1), docs/specs/grn-stock.md (v1)
BR scope: all BR-GRN-* in the two specs
## Task
Map-first, diff-only. Read docs/modules/grn.md and docs/modules/inventory.md (last_verified_commit 0a406f4).
Diff each map's paths from 0a406f4 to HEAD; explore only changed code beyond what the map says. Answer:
1. `assetRepository.createInventoryMovement`: signature, how balanceAfter is computed, locks, can it take an outer tx? All callers.
2. `itemMaster` columns for current stock / average cost / unit — names and types (numeric scale?). `inventory_ledger` columns (value? referenceLineId? batch? notes?). `grn_items` qty column types.
3. `inventoryRefTypeEnum` + `inventoryTxTypeEnum` current values.
4. Item create/update Zod schemas: do they accept currentStock / averageCostPaise?
5. `POST /asset/inventory/movements`: route roles, validation, which ref types it accepts.
6. `poRepository.incrementPoItemReceivedQty`, `poService.recomputeReceiptStatus`: signatures, tx support, allowed transitions (can it go fully_received → partial_received / dispatched?). Any PO state guard that blocks that?
7. `grnService` create/qaAction/bypass/correction: request schema field names, response shapes, how actor/role reaches the service, `requireRole` per route in `routes/grn.ts`.
8. How existing tests set up the test DB, seed data and call the HTTP app (helpers in `approvalService.test.ts`, `app.test.ts`, any `test/` helpers).
9. Frontend GRN: which components render the line actions; where role checks live (`grn-permissions.ts`); inventory manual-movement screen location.
10. Is there any existing "period key"/document-sequence helper and does GRN numbering skip deleted seqs already?
## Scope (required — every line filled)
- In: read-only lookup, answers 1–10 with file + symbol
- Out: any edits; design proposals beyond one-line notes
- May edit: only your report file        May read: anything
- Size: report ≤ 200 lines
- Stop if: n/a
## Inputs
- docs/modules/grn.md, docs/modules/inventory.md, docs/modules/purchase-order.md
## Done when
- All 10 answered with file + symbol
Write your report to: .pipeline/m1-stock/reports/01-explorer.md
