---
module: bom
spec: docs/specs/bom/spec.md (v1, frozen)
last_verified_commit: 9d56369
last_verified_on: 2026-11-21
depends_on: [inventory, suppliers, subcontracting, auth-setup]
---

# BOM (bill of materials) — as-built map

> What the code **is** (the spec says what it **should be**). Built on `feature/scm-bom` inside epic
> `epic/scm` (slices S1 drafts, S2 release/lifecycle, S3 needs + where-used, S4 cross-module + UI rules).
> Explore only code changed since `last_verified_commit`. Symbol names, not line numbers.

## Summary
One BOM per part revision (A, B, C…), kind `casting` (alloy poured), `job_work` (sent out, returned) or
`assembly` (components). Draft → release (one active per part) → retire. Gives a level tree, a needs
preview for N pieces, and where-used. The needs walk (`computeBomNeeds` / `expandBomLevel`) is reused by
sale-order explosion. Full; no prices anywhere on BOM responses.

## Code locations
| Layer | Path | Key symbols |
|---|---|---|
| schema | `backend/src/db/schemas/02_procurement-bom.ts` (barrel `02_procurement.ts`) | `boms`, `bomLines`, `bomPartSeq`, `bomHistory`; enums `bom_kind`, `bom_status`, `bom_history_action` |
| migration | `backend/src/db/migrations/20261120175350_free_pestilence/` | tables, CHECKs, partial unique indexes |
| types | `backend/src/types/bom.types.ts` | request + response Zod (recursive tree via `z.lazy`) |
| lib | `backend/src/lib/bom-math.ts` | revision letters, `bomNumber`, casting figures (BigInt), `ceilDiv`, `pourQty`, `alloyKg`, `sendNeed`, `childNeed` (take **thousandths**), `MAX_BOM_LEVELS` (10), `MAX_BOM_NODES` (1,000) |
| repository | `repository/bomRepository.ts`, `repository/vendorServiceRepository.ts` | list, detail, history, locks, `listActiveFullByParts`, `findItemsWithActiveBom`, `whereUsed`, `workerHasActiveService`; shared `findActiveVendorServiceRows` (SCO's `findVendorServiceRows` delegates to it) |
| service | `service/bomService.ts`, `service/bomGraph.ts`, `service/bomNeedsService.ts` | lifecycle; active-graph walk (`tooDeep`, `tooLarge`, `loopError`, `loadClosure`); `expandBomLevel`, `computeBomNeeds`, `bomNeedsService.preview` |
| controller / routes | `controller/bomController.ts`, `routes/bom.ts`, `END_POINTS.bom`, mount `/bom` in `routes/index.ts` | 13 routes, `register()` with `fullPath` |
| cross-module | `repository/assetRepository.ts` (`itemInUse` also checks boms + bom_lines, BR-BOM-20); `types/asset.types.ts` (category "Manufactured part") | |
| permissions | `lib/permissions.ts` | `bom.view`, `bom.manage`, `bom.release`; screen `bom` `/bom` (group Inventory, order 175) |
| frontend api | `frontend/src/lib/api/bom/{fetchers,queries}.ts`, `frontend/src/types/bom.ts`, `API_ROUTES.bom` | `bomKeys` root `["bom"]` (list, detail, tree, change-summary, needs, where-used, history); every mutation invalidates `["bom"]` |
| frontend ui | `app/(protected)/bom/{page,loading,error}.tsx`, `new/`, `[bomId]/edit/`, `part/[itemId]/`; `components/views/bom/` (BomListView, BomPartView, BomFormView, use-bom-controls); `components/pages/bom/` (BomForm, BomItemPicker, BomHeaderCard, BomLevelTree, BomNeedsPanel, BomUsedInPanel, BomRevisionsPanel, BomHistoryPanel, BomMiniPager, ReleaseBomDialog, RetireBomDialog, bom-format) | status-tone docs `bom`, `bomNode`; nav icon IconSitemap |

## Data model
- `boms`: `partId`, `revisionNo`, `kind`, `status` (draft | active | retired), `version` (optimistic token, BR-BOM-28); casting block (`alloyItemId`, `netWeightKg`, `shotWeightKg`, `cavities`, `meltLossPct`, `castingRejectPct`); job-work block (`sentItemId`, `sendQty`, `returnQty`, `jobWorkerId`, `serviceId`, `jobWorkLossPct`); `changeReason`, `releasedBy/At`. Partial unique index: one `active` per part (`uq_boms_one_active`).
- `bom_lines`: components (assembly/casting), max 50 per BOM. Job-work BOMs have no lines; the sent item is their only child.
- `bom_part_seq`: one row per part, next revision letter; locked `FOR UPDATE` on create / start revision.
- `bom_history`: create, edit, delete, release, retire, with actor and reason; index `(part_id, changed_at)`.
- No ledger postings. No money.

## API (`/api/bom`)
| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/api/bom` | any of view/manage/release | list (status csv ≤3, kind, `q`, `partId`, paging ≤100) |
| GET | `/needs` | any | needs preview for a part + pieces (`levels` optional) |
| GET | `/items/:itemId/where-used` | any | active parents; top-level `part {id, sku, name}` beside `data`/`meta` |
| GET | `/parts/:partId/history` | any | history page |
| POST | `/parts/:partId/revisions` | `bom.manage` | start revision (no body) |
| GET | `/:id`, `/:id/tree`, `/:id/change-summary` | any | detail (+ `nextStep`, `openDraftId`, inactive flags), level tree, release preview |
| POST | `/api/bom` | `bom.manage` | create draft (`lines` optional) |
| PATCH | `/:id` | `bom.manage` | edit draft (`lines` full replace, `version`) |
| DELETE | `/:id` | `bom.manage` | delete draft |
| POST | `/:id/release`, `/:id/retire` | `bom.release` | release (body `version`, reason), retire (reason) |
Write routes return `{id, status, version}`. Seeds: owner all three; back_office view + manage; floor_supervisor view.
Route order: `/needs`, `/items/*`, `/parts/*` before `/:id`. Shapes: `bun run contract:query "<METHOD /path>"`.

## Key flows
- Release: advisory lock `bom_graph` → `bom_part_seq` row → `boms` row; re-check status + `version`; full graph walk (loop, depth 10, 1,000 nodes); old active → retired with an extra `retire` history row "Replaced by revision X"; unique violation → 409 `BOM_RELEASE_CONFLICT`. Release and retire bump `version`.
- PATCH: only the `boms` row lock; a second saver waits, then fails the version check.
- Needs: `computeBomNeeds` walks level by level (one `expandBomLevel` batch, 3 queries per level), loop guard by path, `onLoop` throw|flag, `netNeedLevel` hook (sale-order netting), caps 10 levels / 1,000 rows / qty 1e12. `toBuy` holds alloy, `no_bom` and `buy_as_is` rows; `loop` rows are not bought.
- `nextStep`: `open_draft` (open draft exists and the viewed revision is not it) for every reader; `start_revision` only with `bom.manage` and no open draft.

## Invariants & gotchas
- Error bodies carry both the top-level `details` spread and a nested `details` key (`handleAppError` in `app.ts`); tests read `json.details.*`. `ConflictError` / `BadRequestError` take no details — use `new AppError(msg, status, code, details)` for `BOM_DRAFT_OPEN`, `BOM_LOOP`, `BOM_RELEASE_INVALID`.
- Hono strict routing: the list is `/api/bom` with **no trailing slash**; `/api/bom/` 404s.
- Unknown component / alloy / sent item → 400 `BAD_REQUEST`; unknown part → 404.
- `expandBomLevel` takes `{items:[{partId, qty}]}`; qty is integer-safe BigInt inside; bom-math takes thousandths. The alloy is `node.alloy`, not in `children`.
- Where-used rows come from raw `db.execute` (numerics are strings); the service converts.
- Rows inserted straight into `boms` (as the 1,000-node test does) have no `bom_part_seq` row; start revision on them clashes.
- Rounding: whole numbers for pcs/set, 3 dp otherwise. Job-work `sendQty`/`returnQty` default 1 on save; worker, service, sent item, loss % required at release only.
- `bo` lacks `bom.release` (cannot make own draft live). An owner holding both keys may.

## Tests
| File | Covers |
|---|---|
| `backend/tests/routes/bom.test.ts` | BR-BOM-01..28 |

## Known gaps / debt
- PERF-02: `q` search is ILIKE `%q%` on item sku/name; add pg_trgm if item master passes ~100k (backlog).
- No item-by-id endpoint; the part page reads sku/name from where-used `part`.

## History
| Date | PR / commit | Change |
|---|---|---|
| 2026-11-21 | 87b1e67..0639d79, e3b409f, 4dc7885 | Map created: BOM built to spec v1 on `epic/scm` (S1–S4, review fixes CR-01..07, PERF-01/03, SPEC-1) |
