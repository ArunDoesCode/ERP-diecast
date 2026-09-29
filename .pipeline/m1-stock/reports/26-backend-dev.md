# Report 26 — backend-dev — S10 last rate + location race

Full `bun test`: 295 pass, 0 fail. Typecheck OK, lint 190 warnings (unchanged), `contract:check` clean.

## Changed (3 files)
- `backend/src/repository/assetRepository.ts` — `getLastRate` per BR-INV-24: newest line of an approved-or-later PO (approved, dispatched, partial_received, fully_received, invoiced, closed) → supplier catalog price → item average if > 0 → standard rate. Returns `source` (`po_history`, `supplier_catalog`, `pr_estimate` = average, `standard_rate`). Unknown item → undefined.
- `backend/src/service/assetService.ts` — unknown item gives 404 "Item not found"; unique violations of the two new indexes map to the same 409 messages the service already returns.
- `backend/src/db/schemas/02_procurement-catalog.ts` — partial unique indexes `uq_locations_one_main_store` (type where main_store) and `uq_locations_one_vendor_premise` (linked_vendor_id where vendor_premise).

## Notes
- `db:test:prepare` ran OK. Dev DB `db:push` (not run, no `.env` here) fails only if dev data already has two main stores or two vendor premises for one supplier; fix the data first.
- No route/shape change, so the manifest is unchanged.

## Map updates
- BR-INV-12/13 are now backed by partial unique indexes as well as the service check.
- `getLastRate` only counts approved-or-later POs; never returns 0.
