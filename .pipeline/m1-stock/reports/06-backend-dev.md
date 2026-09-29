# Report 06 — backend-dev — S1 posting engine

Result: DONE. S1 tests that do not need the manual-movement route are green. typecheck clean, lint 121 warnings (was 121 before; none new from these files), full `bun test`: 107 pass / 46 fail (all failures are BR ids of S2-S5).

## Files changed
- `backend/src/repository/stockPostingRepository.ts` (new) — `postStock(tx, input)`: locks item row first, reads last balance of item+location, writes one ledger row (reference line id, batch, value = qty x cost half away from zero), updates item stock + moving average. All qty math on integer thousandths. `averageEffect`: `in` (default for +qty), `out_at_cost` (correction), `none`.
- `backend/src/repository/assetRepository.ts` — `createInventoryMovement` now runs `postStock` (same signature; the "ponytail" lock comment is gone).
- `backend/src/repository/grnRepository.ts` — `batchNumber` on line columns/create; `findGrnItemForUpdate` takes row lock when given `tx`; `findDefaultReceivingLocationId(tx?)`; `insertCorrection`; `updateGrnItemLine` accepts `batchNumber`.
- `backend/src/service/grnService.ts` — `qaAction`, `bypass`, `correction` each in one transaction (line lock, ledger, item, line, QA row, PO line, PO/GRN status). `create` passes `batchNumber` through.

## Tests (stockPosting.test.ts)
- Green: BR-GRN-21 (4), 22 (3), 24 (2), 37 (2 of 3), 38 (4 of 5), plus BR-GRN-32/39 correction-cost tests.
- Still red, need S5 route (`POST /api/asset/inventory/movements` is still the 501 stub): BR-GRN-37 "sum across locations", BR-GRN-42 (3 tests — they post through that route), BR-GRN-39 manual stock-out, BR-GRN-40/41/43/44.
- Still red, other slices: BR-GRN-01 (cancelled PO check), 02, 05, 10, 12, 15, 29, 33, 34, 35.
- No previously green test turned red.

## PO files touched
None. Only calls existing `poRepository.incrementPoItemReceivedQty` (negative delta on correction) and `poService.recomputeReceiptStatus` with `tx`.

## Notes / QUESTIONS
- Correction now also writes a `grn_corrections` row and lowers the PO line received qty (needed for BR-GRN-22's correction test). PO status going back (BR-GRN-34), sum-of-corrections (29), negative-balance 409 (33) are left for S4.
- accepted + rejected = arrived (BR-GRN-10) is not enforced yet (S3); accept stores both qtys as sent.

## Map updates
- New `repository/stockPostingRepository.ts` (`postStock`) is the only stock-posting path; `assetRepository.createInventoryMovement` delegates to it. Grn accept/bypass/correction use it inside their own tx.
- Gotcha: order ledger rows by `id`, not `createdAt` (created_at = tx start time, wrong under concurrency).
- Gotcha: lock order is GRN line + PO line first (`findGrnItemForUpdate` with tx), then item row (`postStock`). Keep it, or accept and manual posting can deadlock.
- Ledger row insert now stores `referenceLineId`; `grn_corrections` is written on correction; `grn_items.batch_number` set on create and accept.
- No schema change in this slice; contract unchanged.
