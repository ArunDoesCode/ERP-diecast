# Report 08 — backend-dev — S2 create & draft

Result: DONE. All S2 tests green (BR-GRN-01 create part, 02, 04, 05, 06, 08, 19). typecheck clean, lint 121 warnings (unchanged). Full `bun test`: 135 pass / 18 fail (was 132 / 21). No green test turned red. Remaining 18 reds are S3/S4 ids (BR-GRN-01 accept/bypass part, 10, 12, 15, 29, 33-correction, 34, 35).

## Files changed
- `backend/src/service/grnService.ts` — `create`: duplicate PO line -> 400; whole numbers for lines in pcs/set/sets/nos -> 400; (supplier, challan) already recorded -> 409 plain message, with a catch of unique-index error 23505 for two creates racing (never raw DB text).
- `backend/src/repository/grnRepository.ts` — `findByChallan(supplierId, challanNo)`; `findPoItemsByIds` also returns the PO line `uom`.

## PO files touched
None.

## Map updates
- Unit rule uses the PO line's `uom` (not item master), list `WHOLE_NUMBER_UNITS` in grnService.
- Challan uniqueness = service pre-check + DB unique index `uq_grns_supplier_challan` (deleted GRNs are hard-deleted, so the challan frees up).
- Gap: `update` (draft edit) does not re-check the whole-number rule for pcs lines.
