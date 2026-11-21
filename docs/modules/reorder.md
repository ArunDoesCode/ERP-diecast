---
module: reorder
spec: docs/specs/reorder/spec.md (v1, frozen)
last_verified_commit: 9d56369
last_verified_on: 2026-11-21
depends_on: [inventory, purchase-requisition, purchase-order, auth-setup]
---

# Reorder (automatic stock reorder) — as-built map

> What the code **is** (the spec says what it **should be**). Built on `feature/scm-reorder` inside epic
> `epic/scm`. Explore only code changed since `last_verified_commit`. Symbol names, not line numbers.

## Summary
Live list of items below their reorder level, classified `will_be_ordered` / `covered` / `needs_reorder_qty`
/ `ok`. A run (daily scheduled or "Check now") raises one draft PR (type `stock_reorder`, max 500 lines)
under a configured draft owner and records every item outcome. Settings: daily switch, run time, owner.
Read-only on stock. Full.

## Code locations
| Layer | Path | Key symbols |
|---|---|---|
| schema | `backend/src/db/schemas/02_procurement-reorder.ts` (barrel `02_procurement.ts`) | `reorderSettings` (one row, id 1), `reorderSettingsHistory`, `reorderRuns`, `reorderRunItems`; enums `reorder_run_trigger`, `reorder_run_state`, `reorder_item_outcome` |
| schema (others) | `02_procurement-catalog.ts`; `02_procurement-purchasing.ts` | `item_master.reorder_qty`, `min_order_qty`, `order_multiple` (numeric(14,3), mode number), partial `idx_item_master_reorder`; `purchase_requests.reorder_run_id` (lazy FK) + `uq_purchase_requests_reorder_run`, `idx_pr_items_pending_item` |
| migration | `backend/src/db/migrations/20261121071528_conscious_blindfold/` | + hand-appended settings row (id 1, off, 07:00) |
| types | `types/reorder.types.ts`; `types/pr.types.ts`; `types/asset.types.ts` | item states, run states/triggers, outcomes; PR create/update `.strict()`, list filters `raisedByReorder`, `reorderRunId` |
| lib | `lib/reorder-math.ts` | `computeOrderMilli` (BR-RO-06..08, integer thousandths) |
| repository | `repository/reorderRepository.ts`; `prRepository.createWithItemsTx` | one CTE (base / usable / otw_pr / otw_po / classified) for list + run read; `failStaleRuns`, `finishRun`, `setRunOwner`, owner candidates |
| service | `service/reorderService.ts`, `service/reorderRunService.ts`, `service/reorderScheduler.ts` | list, runs, detail (`RUN_DETAIL_ITEM_LIMIT` 5000), settings, `checkDraftOwner`; `openRun` / `executeRun` / `start` / `checkNow`, `ReorderRunInsertError`; pure `tick(now)` + `startReorderScheduler()` (started in `index.ts` after `serve()`, stopped on shutdown) |
| cross-module | `assetService` / `assetRepository` | whole-number check for the 3 item fields (pcs/set) |
| controller / routes | `controller/reorderController.ts`, `routes/reorder.ts` (`/api/reorder`), `END_POINTS.reorder` | 7 routes |
| permissions | `lib/permissions.ts` | `reorder.manage` (owner, back_office); screen `reorder` `/inventory/reorder` (`inventory.view`) |
| frontend api | `lib/api/reorder/{fetchers,queries}.ts`, `types/reorder.ts`, `API_ROUTES.reorder` | `reorderKeys` {all, items, runs, run, settings, ownerCandidates}; items query `staleTime` 30 s, no refetch on focus |
| frontend ui | `app/(protected)/inventory/reorder/` (+ `runs/`, `runs/[id]`); `components/views/reorder/` (ReorderListView, ReorderRunsView, ReorderRunDetailView, use-reorder-controls); `components/pages/reorder/` (CheckNowButton, ReorderLastRunStrip, ReorderRunFactsCard, ReorderRunItemsCard, ReorderSettingsDialog, reorder-format) | status-tone `reorderRun`, `reorderItem`, `reorderOutcome`, `prSource`; item form fields; PR list filter "Raised by reorder", `?prId=` opens the PR modal |

## Data model
- `reorder_runs`: `trigger` schedule | manual; `state` running | done | failed; `startedBy`, `scheduledDay` (IST), `draftOwnerId` (owner actually used), counts, `failureReason`. Unique: one running run; one scheduled run per IST day.
- `reorder_run_items`: per item outcome raised | needs_reorder_qty | invalid_line | deferred; unique (run_id, item_id).
- `reorder_settings_history`: one row per changed field, cleared owner stored as "none".
- PR link: `purchase_requests.reorder_run_id` (unique). No ledger postings.

## API (`/api/reorder`)
| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/items` | `inventory.view` | live list (state csv ≤4, search, sort, paging ≤100, `stateCounts` ignore the state filter) |
| GET | `/runs`, `/runs/:id` | `inventory.view` | run list; run detail with up to 5000 items |
| POST | `/check-now` | `reorder.manage` | manual run (body strict `{}`; 409 if one is running) |
| GET / PATCH | `/settings` | `inventory.view` / `reorder.manage` | settings |
| GET | `/owner-candidates` | `reorder.manage` | active `pr.manage` holders + super-admin |

## Key flows
- Run: `openRun` (tx A: stale sweep of runs older than 15 min → insert running row) → `executeRun` (tx B: re-read settings + `checkDraftOwner` inside the tx; bad owner → failure reason, no PR; else `setRunOwner`, read low items, one pass: invalid → `invalid_line`, valid beyond 500 → `deferred`, rest → PR via `createWithItemsTx`, items inserted in chunks of 500) → `finishRun` (guarded by `state = 'running'`). A crash in `start()` saves a failed run; that save is itself wrapped in try/catch.
- Scheduler: 60 s timer (first tick 15 s, unref, `ticking` guard); `tick(now)` decides from settings and the IST day; unique indexes guard across processes.
- Order qty: `computeOrderMilli` = shortfall vs reorder qty, min order qty, order multiple; estimate = BigInt paise, line > 1e13 or running total > 1e13 → `invalid_line`.

## Invariants & gotchas
- Never bind a JS `Date` inside raw `` sql`` `` — it 500s. Use drizzle `lt()` / `gt()` (the stale sweep once broke on `started_at < ${Date}`).
- Run detail returns up to 5000 items (deferred ones beyond the 500-line PR must show).
- PR create/update schemas are `.strict()`: `reorderRunId` or any other extra key → 400. Only the run sets `reorderRunId`.
- The run bypasses `prService.create` checks (usable item, duplicates, asset/SO rules); safe because the base read picks active items, one row per item.
- Owner check bypasses `loadActor` (2 s cache) and reads `authRepository.getActorRowById` on `db`, not the tx — a tiny window remains.
- A failed scheduled run uses up that IST day; "Check now" is the retry.
- reorderRepository SQL uses raw table refs and raw column names; renaming a column is not caught by typecheck.
- numeric `mode:"number"` columns give `z.number` from createSelectSchema (unlike `05_sales` numerics, which are strings).
- Failure texts use an en dash ("Draft owner is inactive – choose a new owner").
- Error bodies: top-level `details` spread plus nested `details` (`handleAppError`). Hono strict routing: no trailing slash.
- Frontend: no PR detail route and no PO page; links use `/purchase-requisitions?prId=`.

## Tests
| File | Covers |
|---|---|
| `backend/tests/routes/reorder.test.ts` | BR-RO-01..09, 11, 15, 20..22, 24, 31 (live list, settings, guards) |
| `backend/tests/routes/reorderRun.test.ts` | BR-RO-10..22, 25, 27, 29, 30 (runs, PR, strict bodies, stale sweep) |
| `backend/tests/routes/reorderRunCap.test.ts` | BR-RO-13 (520 items, cap 500) |
| `backend/tests/service/reorderScheduler.test.ts` | BR-RO-10, 15 (`tick(now)`) |

## Known gaps / debt
- BR-RO-23, 26, 28 untested (UI / concurrency, manual try).
- PERF-02: `reorder_run_items` has no retention (~1M rows/yr worst case) → backlog.

## History
| Date | PR / commit | Change |
|---|---|---|
| 2026-11-21 | cdafd5d..9ef757e, 60dd23a | Map created: reorder built to spec v1 on `epic/scm` (fixes CR-01, PERF-01/03, SEC-02, SPEC-04/05/08; Date bind fix; detail limit 5000) |
