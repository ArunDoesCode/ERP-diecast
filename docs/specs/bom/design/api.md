# BOM — API design

> Written by solution-designer from `../spec.md` and `data.md`. Source for the run's `contract.md`.
> Mounted at `/api/bom` (`MAIN_ROUTES.bom`, constants in `END_POINTS.bom`). Responses use
> `{ success, data }` / `{ success, data, meta }`; errors `{ success:false, message, code, details }`.
> Decimals travel as JSON numbers with at most the stated decimals (server does exact scaled-int maths).
> Part and item pickers reuse existing endpoints, no new lookup: `GET /api/asset/items` (`inventory.view`,
> filters `q`, `isActive`; seed roles with `bom.view` or `bom.manage` also hold it; a custom role with `bom.manage` needs `inventory.view` for the pickers, CR-007), `GET /api/supplier/:supplierId/listServices`,
> `GET /api/asset/services`. BOM detail responses embed item sku / name / unit / isActive so screens need no extra call.

## Endpoints
| Method | Path | Permission key | Purpose | Rules |
|---|---|---|---|---|
| GET | `/api/bom` | `bom.view` | list revisions; also "all revisions of a part" via `partId` | BR-BOM-25 |
| GET | `/api/bom/:id` | `bom.view` | one revision: header, lines, computed casting figures, audit, `nextStep` | BR-BOM-05, 21, 23, 24 |
| GET | `/api/bom/:id/tree` | `bom.view` | level tree under this revision (structure, qty per piece, "no BOM" / "inactive" tags) | BR-BOM-09, 10, 21 |
| GET | `/api/bom/:id/change-summary` | `bom.view` | added / removed / changed lines and header old → new vs the part's active revision (dry run of release incl. `problems[]`) | BR-BOM-12, 13 |
| GET | `/api/bom/needs` | `bom.view` | needs preview, full or one level (shared calculation) | BR-BOM-18 |
| GET | `/api/bom/items/:itemId/where-used` | `bom.view` | parts whose active revision uses the item | BR-BOM-19, 16 |
| GET | `/api/bom/parts/:partId/history` | `bom.view` | audit rows of a part, newest first | BR-BOM-23 |
| POST | `/api/bom` | `bom.manage` | create first BOM (draft rev A) | BR-BOM-01..08, 10 |
| PATCH | `/api/bom/:id` | `bom.manage` | replace draft header + lines | BR-BOM-03..11 |
| DELETE | `/api/bom/:id` | `bom.manage` | delete a draft | BR-BOM-15 |
| POST | `/api/bom/parts/:partId/revisions` | `bom.manage` | start new revision (copy of active, else latest retired) | BR-BOM-14 |
| POST | `/api/bom/:id/release` | `bom.release` | draft → active, previous active → retired | BR-BOM-12, 13, 17 |
| POST | `/api/bom/:id/retire` | `bom.release` | active → retired, no replacement | BR-BOM-16 |

One key per route; write routes carry no `alsoKeys`. Read routes (`bom.view`) use `alsoKeys: ["bom.manage", "bom.release"]`. Every write route (create, PATCH, delete, start revision, release, retire) returns only `{ id, status, version }` (delete: `{ id, deleted: true }`), so a write-only custom role sees no BOM content; the UI then reads detail with `bom.view`. Static paths (`/needs`, `/items/…`, `/parts/…`) are registered before `/:id`. Every route: `requireAuth` +
exactly one `requirePermission`; the three keys are new in `permissions.ts` (auth-setup change). No route for
editing a released revision (BR-BOM-11). BR-BOM-22: wrong key → 403 `PERMISSION_DENIED`.

## Payloads
Shared body `BomDraftInput` (POST create adds `partId`, `kind`; PATCH sends the same shape, full replace):
```
kind: 'casting'|'job_work'|'assembly'            (PATCH: may change, draft only)
casting?: { alloyItemId: int, netWeightKg: 0.001–1000 (3 dec), shotWeightKg: 0.001–1000 (3 dec),
            cavities: int 1–64, meltLossPct: 0–49.99 (2 dec), castingRejectPct: 0–49.99 (2 dec) }
jobWork?: { sentItemId: int, sendQty: int 1–1000, returnQty: int 1–1000, jobWorkerId: int, serviceId: int,
            jobWorkLossPct: 0–49.99 (2 dec) }
lines: [{ componentItemId: int, qtyPerPiece: 0.001–100000 (3 dec), buyAsIs: boolean, note?: string ≤ 200 }]  (max 50)
```
A draft may be saved incomplete (missing casting / job-work fields); present values are validated and
cross-checked (shot ≥ net × cavities). Sending the other kind's block → 400.

### `POST /api/bom`
- **Request:** `{ partId: int, kind, ...BomDraftInput fields optional }`
- **Response 201:** `{ id, status, version }`.
- **Errors:** 400 validation (Zod: no code; service: `BAD_REQUEST`) (BR-BOM-01, 03, 04, 07, 08; part inactive / not pcs-set / casting on `set`) ·
  400 `BOM_LOOP`, `BOM_TOO_DEEP` (BR-BOM-10; `details.path`) · 401 · 403 · 404 `NOT_FOUND` (part, item) ·
  409 `BOM_ALREADY_EXISTS` (part already has a revision; use start revision, BR-BOM-14).

### `PATCH /api/bom/:id`
- **Request:** `BomDraftInput` + `version: int` (from the last detail). **Response 200:** `{ id, status, version }` (new `version`). Writes `edit` history row.
- **Errors:** 400 as create · 404 · 409 `BOM_NOT_DRAFT` (BR-BOM-11; nothing changes) · 409 `BOM_CHANGED_SINCE_REVIEW` (stale `version`).

### `DELETE /api/bom/:id`
- **Response 200:** `{ id, deleted: true }`. Writes `delete` history row. **Errors:** 404 · 409 `BOM_NOT_DRAFT` (BR-BOM-15).

### `POST /api/bom/parts/:partId/revisions`
- **Request:** none. **Response 201:** `{ id, status, version }` of the new draft (next letter, copy of source).
- **Errors:** 404 (part, or no BOM at all → `NOT_FOUND`) · 409 `BOM_DRAFT_OPEN` (`details: { draftId, revision }`, BR-BOM-14).

### `GET /api/bom/:id/change-summary`
- **Query:** none. **Response 200:**
  `{ bomId, version, against: { id, revision } | null, firstRevision: boolean, header: [{field, old, new}],
     lines: { added: [...], removed: [...], changed: [{componentItemId, qtyOld, qtyNew, buyAsIsOld, buyAsIsNew}] },
     canRelease: boolean, problems: [{ code, field?, message }] }`.
  Computed with the same level-by-level walk and 1,000-node cap as the tree (400 `BOM_TOO_LARGE`). For a non-draft the `against` is the revision before it. Read-only; the release screen calls this first (open Q2: separate endpoint, so a user without `bom.release` still sees the diff, BR-BOM-24).

### `POST /api/bom/:id/release`
- **Request:** `{ version: int (from detail / change-summary), reason?: string }`; reason is trimmed, 3–500 chars, required unless the part has no active and no retired revision.
- **Response 200:** `{ id, status, version, retiredPreviousId }`; the applied summary is stored in history (read it with `GET change-summary` / history).
- **Errors:** 400 `BOM_RELEASE_INVALID` with `details.problems[]` listing every failure (BR-BOM-12: reason missing, item / job worker / service inactive, casting data incomplete, no lines on assembly, loop BR-BOM-10, inactive item BR-BOM-21) · 404 · 409 `BOM_NOT_DRAFT` (already released, or the race loser, BR-BOM-17) · 409 `BOM_RELEASE_CONFLICT` (unique-index backstop, BR-BOM-17) · 409 `BOM_CHANGED_SINCE_REVIEW` (draft saved after the summary was read; the user re-reads the summary).

### `POST /api/bom/:id/retire`
- **Request:** `{ reason: string, trimmed, 3–500 }`. **Response 200:** `{ id, status: 'retired', version }`.
  The retire dialog's affected-BOMs list IS `GET /api/bom/items/:itemId/where-used` with `:itemId` = the part's item id (reuse, BR-BOM-16, CR-003).
- **Errors:** 400 validation (Zod: no code; service: `BAD_REQUEST`) (reason missing or outside 3–500, CR-005) · 404 · 409 `BOM_NOT_ACTIVE`.

### `GET /api/bom/needs`  (the shared calculation, BR-BOM-18)
- **Query:** `partId: int` · `qty: int 1–1,000,000` · `levels: 'all' | '1'` (default `all`).
  `levels=1` = one level of that part only, children are listed with their treatment but not walked.
- **Response 200:**
  `{ partId, qty, rootBomId, revision, rows: [{ index, parentIndex|null, level, path: [itemId…], itemId, sku, unit,
     qty, treatment: 'cast'|'job_work'|'assemble'|'buy'|'buy_as_is'|'no_bom'|'loop', bomId?, revision?,
     pourQty?, alloyItemId?, alloyKg?, sendQty?, jobWorkerId?, serviceId? }],
     toBuy: [{ itemId, sku, unit, qty, noBom: boolean }] }`.
  Each row also carries `partItemId`, `kind`, `inactive: boolean` (item deactivated), and on `job_work` rows
  `jobWorkerId`, `serviceId`, `sendQty`, `returnQty` (the send : return ratio) and `jobWorkLossPct`.
  `rows` is the one row shape for both the HTTP response and the service result (CR-006); it also carries `hasActiveBom: boolean` so the service reports a per-line "no active BOM" flag, not only the web 409 `NO_ACTIVE_BOM` for the root. For a part with no active revision the service returns `{ partId, status: 'no_bom' }` for that line and does not throw; this endpoint alone maps a `no_bom` root to 409 `NO_ACTIVE_BOM`. Hook for sale order is per level: `netNeedLevel(nodes[]) → qty[]` (one call per level, PERF-03).
  `qty` is rounded up: whole for pcs/set, 3 decimals for kg/ltr/m. Reads no stock, writes nothing, no prices.
- **Errors:** 400 validation (Zod: no code; service: `BAD_REQUEST`) (qty bounds) · 400 `BOM_LOOP`, `BOM_TOO_DEEP`, `BOM_TOO_LARGE` (BR-BOM-10, 18) · 404 part · 409 `NO_ACTIVE_BOM` (part has no active revision).
- **Backend service, not HTTP, is what sale order calls** (no internal HTTP): `bomNeedsService.computeBomNeeds(executor, { partId, qty, options })` (full walk) and `bomNeedsService.expandBomLevel(executor, { items: [{ partId, qty }] })` (one level, batch of one or many parts, one query; output fields in `data.md`: node has `partId`, `kind`, job-work worker / service / ratio / loss %; each child has `inactive`); this endpoint is a thin controller over `computeBomNeeds` / `expandBomLevel`. Options `onLoop: 'throw'|'flag'` and `netNeed` as in `data.md`. Sale order's own routes need `so.explode`, not `bom.view`; the service does no permission check, the controller does.

### `GET /api/bom/items/:itemId/where-used`
- **Query:** `page`, `pageSize`, `sortBy`, `sortDir`. **Response 200 (paginated):**
  `[{ bomId, number, partId, partSku, partName, revision, role: 'line'|'sent_item'|'alloy', qtyPerPiece: number (3 dec), buyAsIs: boolean|null, returnQty: int|null }]` over **active** revisions only. `line`: the line's qty per piece and its flag. `sent_item`: `qtyPerPiece` = `sendQty` (whole pcs sent per `returnQty` returned; `returnQty` set only for `sent_item`, else null), `buyAsIs` null. `alloy`: `qtyPerPiece` = alloy kg per good piece (BR-BOM-05, 3 dec), `buyAsIs` null (CR-004). One `UNION ALL` of the three roles plus the count, one round trip (PERF).
- **Errors:** 404 item.

### `GET /api/bom/:id`  · `GET /api/bom/:id/tree`  · `GET /api/bom/parts/:partId/history`
- Detail also returns `version`. Detail adds `casting.computed: { pouredWeightKg, yieldPct, alloyPerGoodPieceKg }` (BR-BOM-05), per-line / header
  `inactive: boolean` tags (BR-BOM-21), `nextStep: 'create'|'release'|'waiting_for_release'|'start_revision'|'open_active'`,
  `nextRevision`, `activeBomId` (BR-BOM-24; computed from the caller's permissions). Tree nodes:
  `{ itemId, sku, name, kind?, unit, qtyPerPiece, treatment, bomId?, revision?, inactive, children[] }`, no qty scaling; `kind` is the walked BOM's kind; `treatment` is one of `cast` `job_work` `assemble` `buy` `buy_as_is` `no_bom` `loop`. Walked level by level through `expandBomLevel` (at most 10 queries); same loop / depth guard; more than 1,000 nodes → 400 `BOM_TOO_LARGE` (CR-002).
- History: paginated `[{ id, action, revision, changes, reason, changedBy: {id,name}, changedAt }]`.
- **Errors:** 404.

## Lists
| Endpoint | Filters | `sortBy` whitelist | Default sort | Page |
|---|---|---|---|---|
| `GET /api/bom` | `status` (csv of `draft,active,retired`; default `active,draft`, but with `partId` and no `status` = all three, CR-001), `kind`, `q` (part sku / name, `safe-search`), `partId` | `partSku`, `partName`, `revisionNo`, `kind`, `status`, `releasedAt`, `createdAt` | `partSku asc, revisionNo desc` then `id` tiebreaker; with `partId` and no `sortBy`: `revisionNo desc` | page 1, pageSize 10, max 100 |
| `GET /api/bom/items/:itemId/where-used` | none | `partSku`, `revisionNo` | `partSku asc`, `id` tiebreaker | same |
| `GET /api/bom/parts/:partId/history` | none | `changedAt` | `changedAt desc`, `id` tiebreaker | same |
List row: `{ id, number, partId, partSku, partName, kind, status, revision, releasedAt }`.

## Choices made
| Question | Choice | Source |
|---|---|---|

Moved to `../assumptions.md` (A-17, A-29..A-36, A-44) by spec-analyst, pass 2.
