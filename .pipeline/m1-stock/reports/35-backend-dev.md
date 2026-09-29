# Report 35 — backend-dev — suppliers contract (S11-S12)

Contract step done. typecheck pass, `bun test` 302 pass / 0 fail (no test broken). `contract:generate` and `db:test:prepare` run. Lint: 0 errors (191 pre-existing warnings). Contract: `.pipeline/m1-stock/contract.md` -> "Suppliers".

## What changed
- `backend/src/db/schemas/02_procurement-suppliers.ts`: unique index `uq_supplier_master_name_norm` on `lower(btrim(name))`; new enum `supplier_history_entity` + table `supplier_history` + index.
- `backend/src/types/supplier.types.ts`: field rules (GSTIN/PAN upper-case + format, PAN = GSTIN[3..12], email, terms 0-365, price >= 1, GST slab list, lead time 0-365, qty 3 dp); `status` filter on list; batch arrays `.max(100)` and rows no longer refined (service returns per-row reasons); history schemas.
- `backend/src/routes/supplier.ts`, `end-points.ts`: per-route guards (`supplier.view` = sa/ow/bo/fs, `supplier.manage` = sa/bo, `// perm:` comments); new `GET /:supplierId/history`.
- `backend/src/controller/supplierController.ts`: `history` 501 stub only.
- `backend/.contracts/api-manifest.json` regenerated (85 routes).

## Notes for implementer
- db:push risk: the name index fails on a dev DB with names that clash ignoring case/outer spaces. Test DB pushed fine (empty).
- Batch 400 must be built by the controller (global `onError` only emits `message`/`code`): body `{success:false, message, code:"BATCH_FAILED", data: rows, summary}`. Current controller always returns 200; service must throw/return failed count and controller switches to 400.
- Zod `.default()` on create fields (`type`, `taxPercentage`, `leadTimeDays`, `qty`, `defaultPaymentTermsDays`) means parsed input always has them; repo insert code still typechecks.
- Blank strings: `""` is valid for GSTIN/PAN/email (means none) — service must turn `""` into null.
- `uom` kept required on create/`item` row (making it optional broke repo insert typing, and repo is out of scope); service checks it equals the item's unit.
- Batch row fields keep today's names `success`/`error` (= spec "ok"/"reason").
- Error `code`s beyond existing `CONFLICT`/`BAD_REQUEST`/`NOT_FOUND` are only `BATCH_FAILED`; spec gives only messages.

## Map updates (docs/modules/suppliers.md)
- New: table `supplier_history`, enum `supplier_history_entity`, endpoint `GET /api/supplier/:supplierId/history` (501 until S12), `status` query on `/listSuppliers`.
- Guards changed from router-level `requireRole` to per-route (view vs manage); PO picker call (Q4) no longer 403 for owner.
- Trap: batch edit schemas intentionally have no `superRefine` — per-row target/field checks live in the service.
- Trap: `z.email()` inside `.refine` used for optional-blank email; `.default()` fields make Zod input vs output types differ.
