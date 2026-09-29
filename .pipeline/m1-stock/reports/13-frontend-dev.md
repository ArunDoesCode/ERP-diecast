# Report 13 — frontend-dev — CR-3, CR-4, CR-5
tsc + lint clean.

- CR-3: `invalidateGrnAndPO` now also invalidates `assetKeys.items()` and `assetKeys.movements()` (QA, bypass, correction). Correction mutation uses it (needs `poId`, passed from `GrnLinesTable` -> `GrnCorrectionAlert`). Manual movement create invalidates items too.
- CR-4: new `src/lib/grn-units.ts` (`WHOLE_UOMS` = pcs, set, sets, nos; `isWholeUom`; `qtyStep`). Used in Create, Edit, QA, Bypass, Correction. GRN lines carry no uom, so new hook `usePoItemUoms(poId, enabled)` in `lib/api/grn/queries.ts` maps poItemId -> uom from the cached PO detail (no contract change).
- CR-5: correction qty input has `max=netAcceptedQty`; submit disabled when qty <= 0 or > net accepted.

## Screens touched
- GRN detail page (Storekeeper/QA/Admin roles as before): Edit GRN modal arrived qty, QA decision modal accepted/rejected qty, Bypass alert accepted qty, Correction alert qty (whole-number step for pcs/set/sets/nos; correction max enforced). Create GRN modal: same unit list.
- Inventory movements: creating a movement refreshes item stock lists.

## Map updates
- New `lib/grn-units.ts`; new hook `usePoItemUoms`; `GrnCorrectionAlert` now takes `poId`.
- Trap: `grn/queries.ts` imports `asset/queries.ts` (assetKeys); keep asset queries free of grn imports to avoid a cycle.
