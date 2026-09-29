# Report 20 — backend-dev — inventory contract (part 2)

Shapes, routes, guards, schema columns done. `contract.md` has a new "Inventory (part 2)" section. No business logic.

## Changed
- `backend/src/db/schemas/02_procurement-catalog.ts` — item `standard_rate_paise` (default 0), who/when; locations `is_active` + who/when; machines `code` (nullable) + `is_active`; case-insensitive unique indexes (sku, service code, location name, machine name + code).
- `backend/src/types/asset.types.ts` — fixed lists, strict item create/update, SAC, machine date, `isActive` list filters, stock view schemas, movement list row (source document), new manual movement union, last-rate source `standard_rate`.
- `backend/src/routes/asset.ts`, `end-points.ts` — new `GET /inventory/stock`; `GET /items` now `inventory.view` roles; descriptors updated.
- `backend/src/controller/assetController.ts` — `createInventoryMovement` and `inventoryStock` are 501 stubs.
- `backend/.contracts/api-manifest.json` regenerated; `.pipeline/m1-stock/contract.md`.

## Checks
- typecheck OK, lint OK (only old warnings), `db:test:prepare` OK (new columns/indexes applied to `diecast_stock_test`).
- Dev DB `db:push` NOT run: no `backend/.env` in this worktree. Run it on the dev DB; existing rows are safe (defaults) unless dev data has case-duplicate sku / service code / location name / machine name, which would fail index creation.
- `bun test`: 129 pass, 28 fail. All 28 are manual-movement tests in `stockPosting.test.ts` (BR-GRN-32/33/37/38/39/40/42/43/44); they post the old body shape and the route is now 501 by design. S9 turns them green only if they are rewritten to the new shape (test-writer, from the frozen spec).

## Decisions taken (please confirm)
1. Stock view lists active items plus inactive items with stock != 0 (spec BR-INV-06 only says inactive-with-stock stays visible).
2. Stock-take with a positive difference takes optional `unitCostPaise` (needed then, BR-GRN-44); negative valued at average.
3. Inactive item: contract says it can still be adjusted to zero (stock-out only); spec wording is "adjusted to zero".
4. `pr_estimate` source name kept for item average cost (frontend already uses it); `standard_rate` added.
5. Legacy `assetManualMovementCreateSchema` kept (unrouted) only so `assetService`/`assetRepository` still compile; S9 removes it.
6. Not indexed: one `main_store`, one `vendor_premise` per supplier (service check only; push-safety).

## QUESTIONS (for coordinator)
1. BR-AUTH-26 says `pr.link_machine` holders read the active machine list; `GET /machines` is still `asset.manage` only. Left to the auth session (their permission version wins on merge) — confirm.

## Map updates
- New endpoint `GET /api/asset/inventory/stock`; `GET /api/asset/items` guard = `inventory.view`.
- Columns: `item_master.standard_rate_paise/last_updated_*`, `locations.is_active/created_by/last_updated_*`, `machines.code (nullable)/is_active`; functional unique indexes `lower(btrim(x))`.
- Trap: the shell tool here refuses commands mixing `git` with variables/heredoc-with-git; use plain separate commands. Item/manual-movement shape changes break the manual-movement tests until S9.
