# Report 38 — backend-dev — S11 + S12 suppliers

Full `bun test`: 358 pass / 0 fail (supplier file all green). typecheck ok, `contract:check` clean (85 routes, no route change). biome: no warnings in files I touched (repo total went 191 -> 224 from the new test file, not my code).

## Files changed (4, backend only)
- `backend/src/service/supplierService.ts` (rewritten): name/GSTIN 409s (from DB unique index, wrapped `cause` handled), GSTIN/PAN checks + PAN autofill, blank -> null, create returns supplier row (TEST-1), create-with-items names bad ids and checks unit, uom = item uom on create/edit, history rows for supplier and price rows (only real changes, in the same tx), batch edit in one tx with per-row reasons and rollback, `listHistory`.
- `backend/src/repository/supplierRepository.ts`: list (status filter, GSTIN search, LIKE-escaped, default sort name), tx helpers (`transaction`, `findMasterForUpdate`, `findItemRow`/`findServiceRow` with row lock, `updateItemRow`/`updateServiceRow`, `insertHistory`, `findItemUoms`, `listHistory`).
- `backend/src/controller/supplierController.ts`: `history` implemented; batch replies 400 `BATCH_FAILED` with `{data, summary}` when any row failed.
- `backend/src/repository/assetRepository.ts` (`getLastRate`): supplier-catalog tier skips inactive price-list rows (BR-SUP-15/16).

## PO changes
None. BR-SUP-06/07 PO side not touched (no test needs it).

## Notes
- Old `Promise.all` / per-entry try-catch batch code and raw `error.message` in rows are gone (BL-031, BL-035).
- History value fields tracked for rows: supplierSku, price, GST %, lead time, qty, uom, isActive (superset of spec).
- Changing GSTIN while a stored PAN exists and PAN is not resent returns 400 (PAN must match) — the UI has to send both.

## Map updates (docs/modules/suppliers.md)
- Batch edit is now transactional, all-or-nothing; the "not transactional" gotcha and Known gaps rows for BR-SUP-01..24 are resolved. `createSupplier` returns the supplier row only.
- Tests: `backend/src/service/supplierService.test.ts` (HTTP, real DB).
- Trap: drizzle wraps driver errors, the Postgres code is in `error.cause` — `getConflictError` checks both.
- Trap: name uniqueness is enforced by DB index `uq_supplier_master_name_norm`; the service maps the constraint to the 409.
- Trap: `getLastRate` supplier tier now also needs `supplier_items.isActive`; supplier-level `isActive` is not checked there.
