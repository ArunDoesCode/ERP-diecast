# Reorder — API design

> Written by solution-designer from `../spec.md` and `data.md`. Source for the run's `contract.md`.
> Checked by security-auditor (permission on every route) and code-reviewer (conventions) before freeze.
> Conventions: `backend/.claude/reference/hono-build-conventions.md`, skills `api-endpoint-intake`,
> `pagination-contract`. Max 150 lines. Answers D4 (and the API side of D3).

## Endpoints
New router `src/routes/reorder.ts`, mounted at `/api/reorder` (constants in `end-points.ts`, descriptors via `register`).
| Method | Path | Permission key | Purpose | Rules |
|---|---|---|---|---|
| GET | `/api/reorder/items` | `inventory.view` | live low-stock list, saves nothing | BR-RO-01..08, 21, 24 |
| GET | `/api/reorder/runs` | `inventory.view` | run history, newest first | BR-RO-22, 24 |
| GET | `/api/reorder/runs/:id` | `inventory.view` | one run with raised / skipped items and PR link | BR-RO-22, 23, 24 |
| POST | `/api/reorder/check-now` | `reorder.manage` | start a run now, returns the run | BR-RO-11, 12, 13..16, 24, 25 |
| GET | `/api/reorder/settings` | `inventory.view` | switch, run hour, draft owner, last changed by | BR-RO-20, 24 |
| PATCH | `/api/reorder/settings` | `reorder.manage` | change switch / run hour / draft owner, audited | BR-RO-20, 24 |
| GET | `/api/reorder/owner-candidates` | `reorder.manage` | active employees holding `pr.manage` for the owner select (helper; `/setup/employees/search` needs `setup.employees.manage`, so it cannot be reused) | BR-RO-20 |

The daily run has no endpoint: the in-process timer calls the same service function as `check-now` (BR-RO-10). Reused, no new endpoint:
raised PR is read and edited / submitted / cancelled through the existing `/api/pr/*` routes (BR-RO-17); item reorder fields through
`POST /api/asset/items` and `PATCH /api/asset/items/:id` (`asset.manage`, BR-RO-09).

## Payloads
Success envelope `{ success: true, data }`; lists add `meta`. Errors `{ success: false, message, code }`. Quantities are numbers, item unit, max 3 decimals.

### `GET /api/reorder/items`
- **Query:** see Lists.
- **200 row:** `{ itemId, sku, name, uom, usableQty, onTheWayQty, projectedQty, reorderLevel, reorderQty, orderQty|null, state, coveredBy|null }`
  - `state`: `will_be_ordered` (projected ≤ level and reorder qty > 0) · `covered` (usable ≤ level but projected > level) · `needs_reorder_qty`
    (level > 0, reorder qty 0) · `ok`. `orderQty` is set only for `will_be_ordered` (same `computeOrderQty` as the run).
  - `coveredBy`: `{ type: "pr"|"po", id, number }` of the newest open PR, else PO, that counts as on the way; null unless `covered`.
  - `meta`: page fields plus `stateCounts` (all four states, ignoring the `state` filter) for the quick filters.
- **Errors:** 400 bad query · 401 · 403 `PERMISSION_DENIED` (BR-RO-24).

### `GET /api/reorder/runs` · `GET /api/reorder/runs/:id`
- **Run:** `{ id, trigger: "schedule"|"manual", state, startedBy: {id,name}|null, startedAt, finishedAt|null, draftOwner: {id,name}|null,
  itemsChecked, itemsRaised, itemsSkipped, pr: {id, prNumber, status}|null, po: {id, poNumber, status}|null (newest PO linked to the PR lines, for the DocumentFlow), itemsDeferred, failureReason|null }`; `failureReason` is the fixed whitelist text, never a raw error. List rows are this shape.
- **Detail adds** `items: [{ itemId, sku, name, uom, outcome, usableQty, onTheWayQty, projectedQty, reorderLevel, reorderQty, orderQty|null, prItemId|null }]`
  (not paged: under 20 rows by volume; a run stores at most 500 raised lines plus skipped / deferred rows, and the service enforces a 500-row limit). `outcome` ∈ raised, needs_reorder_qty, invalid_line, deferred.
- **Errors:** 400 `:id` not a positive integer · 401 · 403 · 404 `REORDER_RUN_NOT_FOUND`.

### `POST /api/reorder/check-now`
- **Request:** no body (an empty `{}` is accepted, anything else 400, `.strict()`).
- **Response 201:** the run, after it finished: `state` `done` (PR link set, or `pr: null` with "Nothing to order") or `failed` (no PR,
  `failureReason`). A run that fails for owner or data reasons is a saved run, so it is a 201 with `state: "failed"`, not a 4xx (BR-RO-14, 15, 16, 22).
- **Errors:** 401 · 403 `PERMISSION_DENIED` (BR-RO-24) · 409 `REORDER_RUN_BUSY` (BR-RO-12; nothing saved).
- Runs synchronously in the request (a few seconds at plant scale); the unique-index guard makes a double click return 409.

### `GET /api/reorder/settings`
- **200:** `{ enabled, runHour, draftOwner: {id,name}|null, draftOwnerValid: boolean (read-only; owner set, active, holds `pr.manage` now), updatedBy: {id,name}|null, updatedAt }`. Defaults (off, 7, null) exist from the migration.

### `PATCH /api/reorder/settings`
- **Request** (`.strict()`, at least one field, else 400): `{ enabled?: boolean, runHour?: integer 0..23, draftOwnerId?: integer ≥ 1 | null }` (null clears the owner).
- **200:** the settings object. Writes one history row per changed field in the same transaction (BR-RO-20); no history row when a value is unchanged.
- **Errors:** 400 validation · 400 `REORDER_OWNER_INVALID` (owner missing, inactive, or without `pr.manage`; super-admin counts as holding it; also when `enabled: true` and no valid owner) · 401 · 403.
- `enabled` ends up true with a null or invalid owner (stored or sent in the same body, incl. clearing the owner while on) → 400 `REORDER_OWNER_INVALID`. The owner check is the same service function as `owner-candidates` and `draftOwnerValid`.

### `GET /api/reorder/owner-candidates`
- **Query:** `q` (≤ 100), `page`, `pageSize`, `sortBy` = `name`, `sortDir` default `asc`. **200 row:** `{ id, name }`: active employees holding `pr.manage`, super-admin included. Errors 401 · 403.

### Changes to existing endpoints (owned by other modules)
| Endpoint | Change | Owner spec | Rule |
|---|---|---|---|
| `POST/PATCH /api/asset/items`, `GET /api/asset/items` | add `reorderQty`, `minOrderQty`, `orderMultiple`: number ≥ 0, ≤ 1 000 000 000, ≤ 3 decimals, whole for `pcs`/`set` units (same check as `reorderLevel`); responses return them. 400 on breach | inventory | BR-RO-09 |
| `GET /api/pr/getprs` | add query `raisedByReorder` (`"true"`/`"false"`, like `isActive` filters) and `reorderRunId` (int ≥ 1); both added to the `.strict()` schema | purchase-requisition | BR-RO-17 |
| `GET /api/pr/getprs`, `GET /api/pr/getprdetails/:id` | add read-only `reorderRunId: number\|null` to the PR object (run number = id) | purchase-requisition | BR-RO-17 |
| `POST/PATCH /api/pr/*` | `reorderRunId` is not accepted (schema omits it); only the run writes it | purchase-requisition | BR-RO-17 |
| permissions catalog | new key `reorder.manage` (seed ow, bo) | auth-setup | BR-RO-24 |

### Two "low" flags
`GET /api/asset/inventory/stock` returns `belowReorder` from **stock alone** (all locations, BR-INV-07). The reorder `state` (usable stock + on the way) is the source of truth for what gets raised; the two can differ (job-worker metal, open PRs/POs) and the UI must label them.

## Lists
- **`GET /api/reorder/items`:** `page` (default 1), `pageSize` (default 10, max 100), `sortBy` ∈ `sku, name, usableQty, projectedQty, state`
  (default `sku`), `sortDir` (default `asc`), `state` (comma list of the four states, ≤ 4 entries), `q` (≤ 100, SKU or name, `safeSearch`).
  Tiebreaker `item_master.id`. Rows are computed in one set-based query (rule in `data.md`); filter and sort run in SQL on a few hundred rows.
- **`GET /api/reorder/runs`:** `page`, `pageSize` (1/10, max 100), `sortBy` ∈ `startedAt, id, state` (default `startedAt`), `sortDir`
  (default `desc`), `state` (comma list of running/done/failed), `trigger` (`schedule`|`manual`). Tiebreaker `id`. Indexes in `data.md`.
- **`state` / `trigger` comma lists:** split on commas, each entry checked against the enum (else 400), duplicates dropped. Descending default sort on runs is deliberate (newest first).
- Items list: filter and sort run on one CTE that also yields `stateCounts`; base set is `reorder_level > 0`.
- All use `{ success, data, meta: { page, pageSize, total, totalPages } }`; whitelists appear in the manifest `sortableFields`.

## Error codes
| Code | HTTP | Rule |
|---|---|---|
| `PERMISSION_DENIED` | 403 | BR-RO-24 |
| `REORDER_RUN_BUSY` | 409 | BR-RO-12 |
| `REORDER_OWNER_INVALID` | 400 | BR-RO-20 |
| `REORDER_RUN_NOT_FOUND` | 404 | BR-RO-22 |
Run failure reasons (saved text, not HTTP codes): no owner set · owner inactive · owner lacks `pr.manage` (BR-RO-15) · "Something went wrong, nothing was
saved" plus the logged error (BR-RO-16) · "Interrupted — server stopped" (stale sweep, `data.md`).

## Choices made
Moved to `../assumptions.md` (A-10, A-13, A-24..A-29) by spec-analyst, 2026-11-20.
| Question | Choice | Source |
|---|---|---|
