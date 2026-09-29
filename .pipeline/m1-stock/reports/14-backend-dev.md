# Report 14 — backend-dev — review round 1 fixes (backend)

Result: DONE. Full `bun test`: 157 pass / 0 fail (incl. the 3 new regression tests). typecheck clean. contract:check up to date (manifest unchanged, 83 routes). `db:test:prepare` run (2 new ledger indexes). Lint 122 warnings: 121 old + 1 that sits in the new test file (`grnService.test.ts`, non-null assertion); none in production files.

| id | fixed where |
|---|---|
| PERF-1 | `grnService.lockGrnAndPo` (GRN header FOR UPDATE, then PO row) called first in `qaAction`, `bypass`, `correction`; repo `lockGrn`, `lockPo` in `grnRepository.ts` |
| PERF-2, PERF-4 | `db/schemas/02_procurement-catalog.ts`: `idx_inventory_ledger_reference_line (reference_line_id)`; item+location index now `(item_id, location_id, id desc)` |
| PERF-3 | `assetRepository.inventoryReconciliation`: `distinct on` + window sum for last balance, `count(*) over ()` for total (extra count query only for a page past the end) |
| SEC-1, SPEC-3, CR-1b | `grnService.update` / `remove`: one tx, `lockDraftGrn` locks GRN row, re-checks draft + every line pending inside; `deleteGrnWithItems(grnId, tx)` |
| SPEC-2, CR-1a | `applyDraftUpdate` checks `findByChallan(..., excludeGrnId)` -> 409; `mapChallanClash` maps 23505 (shared with `create`) |
| CR-2 | `updateGrnLineSchema.batchNumber` now saved: `updateLineArrivedQty(..., batchNumber)` (undefined = keep, null = clear) |
| SPEC-1 | `stockPostingRepository.postStock`: negative candidate average keeps the old one |
| SEC-2 | qty <= 1e9 in `qty3` (`grn.types.ts`) and manual movement (`asset.types.ts`); manual `unitCostPaise` <= 2147483647; `postStock` rejects a row value above int4 with 400 |
| SEC-3 | `assetRepository.createInventoryMovement` looks the location up first: 404 |
| SEC-4 | `grn.types.ts` certificateUrl must start with http(s) |
| SPEC-4 | stale "slice S4" comment removed |
| SPEC-5 | `// BR-GRN-nn` comments at enforcement lines for 04, 06, 10, 12, 13, 25, 27, 39 |
| extra | removed now-unused `inventoryMovementWriteColumns` (lint) |

## Deviation
- Brief said paise <= 1e11. Ledger cost/value columns are int4 (max 2147483647), so the cap is that value, otherwise the DB would still 500.

## Map updates
- Lock order for GRN writes: GRN header -> PO row -> line + PO line -> item row. Draft update/delete lock the GRN header only.
- Draft update/delete are one tx and refuse (400) if any line is no longer pending.
- Ledger int4 limits: unit cost and row value <= 2147483647 paise; posting above that is 400.
- Reconciliation is a single SQL pass.
