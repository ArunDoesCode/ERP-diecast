# Report 02 — backend-dev — contract (grn + grn-stock)

Result: contract done. typecheck ok, lint ok (13 old warnings), `bun test` 23 pass. `db:test:prepare` run (diecast_stock_test). Manifest regenerated (83 routes). Contract: `.pipeline/m1-stock/contract.md`.

## Changed
- `backend/src/types/grn.types.ts`: challan required, `batchNumber` on lines, 3-dp qty, QA body = acceptedQty + rejectedQty (+ remarks, certificateUrl, batchNumber, overrideReason), bypass/correction shapes, details lines gain `correctedQty`/`netAcceptedQty`.
- `backend/src/types/asset.types.ts`: items strict without stock/avg; new `assetManualMovementCreateSchema`, reconciliation schemas; ref-type enum +3.
- `backend/src/db/schemas/02_procurement-catalog.ts`: ledger `reference_line_id`, enum values.
- `backend/src/db/schemas/02_procurement-purchasing.ts`: grn_items columns, `grn_corrections`, unique (supplier, challan).
- `backend/src/routes/{grn,asset,end-points}.ts`: per-key guards with `// perm:`; bypass drops floor_supervisor; asset router split into per-route guards (masters bo+sa; movements list `inventory.view`; create `inventory.adjust`); new reconciliation route.
- `backend/src/controller/assetController.ts`: 501 stub for reconciliation (outside "may edit" list; needed for the route to compile).
- `backend/.contracts/api-manifest.json`, `.pipeline/m1-stock/contract.md`.

## Decisions (small, spec-silent)
- QA body drops `decision`; body schema registered is `grnQaActionBodySchema`, `grnQaActionSchema` = same + derived `decision` so today's service still compiles.
- Manual movement body has no `transactionType`/`referenceId`; `referenceType` uses the full enum so the service can return the "post from its source document" 400. Server must pick a `reference_id` (ledger column is NOT NULL) — S5 decision (suggest 0).
- Reconciliation is paginated (repo rule) with one flat row list.
- Unique index on (supplier_id, challan_no): existing dev DB rows with duplicate/null-mixed challans could make dev `db:push` fail (nulls are fine in Postgres). Not pushed to dev DB.
- Qty columns left `double precision`; numeric(14,3) move deferred to S1.

## Existing handlers vs contract (tests will fail until slices land)
Create requires challan (Zod only, service unchanged); bypass roles changed at route level; QA service still lacks accepted+rejected sum check, over-receipt override reason, batch no.; `POST /inventory/movements` controller still parses the OLD schema; item PATCH/POST now 400 on stock/avg.

## Map updates
- New files: none. New endpoint `GET /api/asset/inventory/reconciliation`; `inventoryReconciliation` in assetController.
- Tables: `grn_corrections`; columns listed above; index `uq_grns_supplier_challan`; ref types `grn_correction`, `opening_stock`, `sco_loss`.
- Traps: (1) a `.transform()` on a body schema makes the manifest show `body: unknown` — register the pre-transform schema. (2) Zod object strips unknown keys; use `.strict()` when an extra key must be a 400. (3) Asset router had one global role guard; now per-route `requireAssetManage`, new asset routes must add their own guard. (4) In this worktree bun commands need `--env-file=…/stock-test.env` written literally (no shell variables, the sandbox refuses).
