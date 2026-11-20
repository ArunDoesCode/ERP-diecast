# BOM — data design

> Written by solution-designer from `../spec.md`. Checked by performance-auditor and security-auditor
> before freeze. Conventions: `backend/CLAUDE.md`, `backend/.claude/reference/`. Max 150 lines.
> Patterns copied from the real schema: `serial` int ids, `timestamp` (no tz) audit columns, `employees.id`
> int for actors, `text` + CHECK style enums via `pgEnum`, history table like `supplier_history`, counter
> upsert like `document_number_counters`. Schema file: `backend/src/db/schemas/02_procurement-bom.ts`
> (re-exported from `02_procurement.ts`).

## Tables
Quantities are exact decimals (`numeric`), never float. Services convert to scaled integers / BigInt
for maths (milli-kg, hundredths of a percent), so the needs calculation has no rounding drift.

### `boms` (new) — one row per revision
| Column | Type | Null | Unit / decimals | Rule | Note |
|---|---|---|---|---|---|
| id | serial pk | no | | | |
| part_id | int fk item_master | no | | BR-BOM-01 | part is `pcs`/`set`, active (service check); a part never changes (not in PATCH) |
| revision_no | int | no | 1 = A, 2 = B … 27 = AA | BR-BOM-02 | letter derived in code; number `BOM-<sku>-<letter>` is never stored (SKU is locked by BR-BOM-20) |
| kind | enum `bom_kind` | no | `casting` `job_work` `assembly` | BR-BOM-01, 08 | changeable only while draft (BR-BOM-11) |
| version | int | no | | BR-BOM-11, 12 | starts 1, `+1` on every draft save; the token PATCH and release must send (409 `BOM_CHANGED_SINCE_REVIEW` on mismatch, checked under the row lock) |
| status | enum `bom_status` | no | `draft` `active` `retired` | Flow, BR-BOM-11..17 | default `draft` |
| alloy_item_id | int fk item_master | yes | unit kg | BR-BOM-04 | casting only |
| net_weight_kg | numeric(10,3) | yes | kg, 3 dec | BR-BOM-04 | > 0; API max 1,000.000 |
| shot_weight_kg | numeric(10,3) | yes | kg, 3 dec | BR-BOM-04 | per shot, all cavities; API max 1,000.000 |
| cavities | smallint | yes | whole, 1–64 | BR-BOM-04 | |
| melt_loss_pct | numeric(4,2) | yes | %, 2 dec | BR-BOM-04 | 0 ≤ x < 50 |
| casting_reject_pct | numeric(4,2) | yes | %, 2 dec | BR-BOM-04, 06 | 0 ≤ x < 50 |
| sent_item_id | int fk item_master | yes | unit pcs | BR-BOM-07 | job work only; ≠ part_id |
| send_qty / return_qty | int | yes | whole pcs, ≥ 1, API max 1,000 | BR-BOM-07 | default 1 : 1 |
| job_worker_id | int fk supplier_master | yes | | BR-BOM-07 | type `service_provider` or `both`, active |
| service_id | int fk service_master | yes | | BR-BOM-07 | must be on the worker's active list (`supplier_services`, as BR-SCO-02) |
| job_work_loss_pct | numeric(4,2) | yes | %, 2 dec | BR-BOM-07 | 0 ≤ x < 50 |
| change_reason | text | yes | ≤ 500 chars | BR-BOM-12 | required at release unless the part has no active and no retired revision |
| released_by / released_at | int fk employees / timestamp | yes | | BR-BOM-12, 23 | |
| retired_by / retired_at / retire_reason | int fk employees / timestamp / text ≤ 500 | yes | | BR-BOM-16, 23 | reason ≥ 3 chars |
| created_by / created_at, last_updated_by / last_updated_at | audit | | | BR-BOM-23 | project pattern |

- **Computed, never stored (BR-BOM-05):** poured weight = shot ÷ cavities; yield % = net × cavities ÷ shot;
  alloy per good piece = net + poured × melt ÷ (1 − reject). Reason: all inputs are on the row; a released
  row is frozen so no stale copy can exist; a draft edit would otherwise need a second write to keep in sync.
  Computed in `backend/src/lib/bom-math.ts` (BigInt, round half up for display only).
- **CHECKs:** `cavities between 1 and 64`; `*_pct >= 0 and < 50`; weights, send/return `> 0`;
  `shot_weight_kg >= net_weight_kg * cavities` when all three set (BR-BOM-04); `sent_item_id <> part_id`;
  kind consistency (BR-BOM-08): casting columns null unless `kind='casting'`, job-work columns null unless
  `kind='job_work'`. Completeness (all casting / job-work fields set) is checked at release in the service,
  because a draft may be saved half-filled.
- **Keys:** FKs as above, no cascade (restrict). `unique (part_id, revision_no)`.
- **One active, one draft (BR-BOM-14, 17):** partial unique indexes
  `uq_boms_one_active on (part_id) where status = 'active'` and
  `uq_boms_one_draft on (part_id) where status = 'draft'`. Violation (23505) → 409 (mapped in `db-errors.ts`).
- **Indexes:** `uq (part_id, revision_no)` also serves "revisions of a part, newest first" (BR-BOM-25);
  `idx_boms_sent_item_id` (where-used, BR-BOM-19; in-use check BR-BOM-20); `idx_boms_alloy_item_id`
  (same); `idx_boms_job_worker_id`, `idx_boms_service_id` (FK; "BOMs using this job worker/service" when a
  vendor is deactivated); `idx_boms_status_kind (status, kind)` (list filter, BR-BOM-25);
  `idx_boms_released_at` (list sort). Part search joins `item_master` and uses its existing trigram indexes.
- **Status enum:** `draft → active → retired`; `draft → (deleted)`. `retired` is final.

### `bom_lines` (new) — component lines (inserts, packing, sub-assemblies)
| Column | Type | Null | Unit / decimals | Rule | Note |
|---|---|---|---|---|---|
| id | serial pk | no | | | |
| bom_id | int fk boms **on delete cascade** | no | | BR-BOM-03, 15 | only a draft is ever deleted |
| component_item_id | int fk item_master | no | | BR-BOM-03 | active item, not the part, never a service (services live in `service_master`) |
| qty_per_piece | numeric(10,3) | no | item's own unit, 3 dec | BR-BOM-03, 06 | per ONE piece (per poured piece on casting); > 0; API max 100,000.000 |
| buy_as_is | boolean | no | | BR-BOM-09 | default false |
| note | text | yes | ≤ 200 chars | BR-BOM-03 | |
| line_no | smallint | no | 1–50 | BR-BOM-03 | display order; max 50 lines enforced in service |

- **Keys:** `unique (bom_id, component_item_id)` (BR-BOM-03: same item twice → 400; also gives the bom_id index).
- **Indexes:** `idx_bom_lines_component_item_id` — where-used (BR-BOM-19) and in-use lock (BR-BOM-20).

### `bom_part_seq` (new) — revision counter and per-part lock
| Column | Type | Null | Rule | Note |
|---|---|---|---|---|
| part_id | int pk fk item_master | no | BR-BOM-02, 17 | |
| last_revision_no | int | no | BR-BOM-02 | upsert `+1` returning, so a deleted draft's letter is never reused |
- Every create / start-revision / delete / release / retire for a part first does `select … for update` on this
  row (inserted with the first BOM). It serialises one part's changes; the partial unique indexes are the backstop.

### `bom_history` (new) — audit rows (BR-BOM-23), survives draft delete
| Column | Type | Null | Rule | Note |
|---|---|---|---|---|
| id | serial pk | no | | |
| bom_id | int | no | | **no FK** on purpose: the row stays after the draft is deleted (BR-BOM-15) |
| part_id | int fk item_master | no | | the history page is per part |
| revision_no | int | no | | |
| action | enum `bom_history_action` | no | | `create` `edit` `delete` `release` `retire` (start-revision logs `create`) |
| changes | jsonb | no | BR-BOM-13, 23 | `{ header: {field:{old,new}}, lines: {added[], removed[], changed[]} }`; `release` stores the change summary |
| reason | text | yes | | ≤ 500 chars |
| changed_by / changed_at | int fk employees / timestamp | no | | |
- **Indexes:** `idx_bom_history_part_changed (part_id, changed_at)` — "history of a part" (`bom.view`), newest first.

## Stock and money
No money on a BOM (spec Security). **No `inventory_ledger` posting by any BOM action**; BOM never touches
`currentStock`. The needs calculation reads no stock (BR-BOM-18); sale order does its own netting.

## Needs calculation (BR-BOM-18) — one function, two callers
`backend/src/service/bomNeedsService.ts` → `computeBomNeeds(executor, { partId, qty, options })`.
`executor` = db or a tx; read-only. Maths in `lib/bom-math.ts` (BigInt; percent as hundredths:
pour = ⌈Q × 10000 ÷ (10000 − rejectBp)⌉; alloy milli-kg = ⌈Q × net_m + pour × shot_m × meltBp ÷ (cavities × 10000)⌉).
- **Two entry points, one maths path.** `expandBomLevel(executor, { items: [{ partId, qty }] })` = ONE level of
  each listed part: returns that node (treatment, bom id, revision, pour / send / alloy kg) and its direct child needs
  (item, unit, qty rounded up, `buy_as_is`, has-active-BOM flag), no recursion, no stock. `computeBomNeeds`
  is only the loop around it (walk, cycle guard, to-buy sum), so the full preview and sale order's
  level-by-level call (netting stock between levels, BR-SO-23) run the same code. Sale order may call
  `expandBomLevel` directly and does its own recursion; it must then keep its own path and depth guard
  (it can reuse the exported `assertNoLoop(path, partId)` / `MAX_BOM_LEVELS = 10`).
- **`expandBomLevel` output (shared with sale order):** takes `{ items: [{ partId, qty }] }` (batch; one
  query for all parts, a single part is a list of one) and returns per part a node
  `{ partId, kind, bomId, revision, treatment, qty, pourQty?, alloy?, jobWork?: { jobWorkerId, serviceId,
  sendQty, returnQty, jobWorkLossPct, sentItemId, sendNeed } }` and `children: [{ itemId, unit, qty,
  buyAsIs, hasActiveBom, inactive }]`. `inactive` = the item's `is_active` is false (BR-BOM-21).
  `computeBomNeeds` calls it once per level with all parts of that level.
- **No active revision:** for a part with none, `expandBomLevel` / `computeBomNeeds` return `{ partId, status: 'no_bom' }` for that line and never throw; only the web `GET /needs` turns a root with `no_bom` into 409.
- **Level query (PERF-02):** one statement per level joins `item_master` (unit, `is_active`) and an `EXISTS` on the active BOM for `hasActiveBom`; part ids via `inArray`, distinct. Per-level sale-order hook is `netNeedLevel(nodes[]) → qty[]`. The tree endpoint walks the same way (CR-002); the where-used list is one `UNION ALL` + count.
- **Loop check (BR-BOM-10):** a visited set of part ids over the active graph, loaded batched per level (not path enumeration), run under the release advisory lock; the error still names one path. Per-line `hasActiveBom` is part of the service result.
- One query per level: active revisions of all parts at that level (`bomRepository.listActiveByParts`, uses
  `uq_boms_one_active`) plus their lines; cached per call by part id. At most 10 queries.
- Cycle guard: the path of part ids is kept; revisiting one → `BOM_LOOP` (400, path named). Level 11 →
  `BOM_TOO_DEEP`. Row cap 1,000 → `BOM_TOO_LARGE`. Qty cap 1,000,000 at the root; any level above 10^12 → `BOM_TOO_LARGE`.
- Sale order hooks (options): `onLoop: 'throw' | 'flag'` (flag = row stays, no children, as BR-SO-28);
  `netNeed(node) → qty` called before a node expands, so stock netting per level (BR-SO-23) stays in sale
  order and the walk itself stays stock-free. Output rows carry bom id, revision, kind, treatment
  (`cast` `job_work` `assemble` `buy` `buy_as_is` `no_bom` `loop`), level, path, qty in the item's unit.

## Volumes and locks
| Table | Rows per year | Hot query | Lock needed |
|---|---|---|---|
| boms | < 500 (about 300 parts × 1–3 revisions) | list by status/kind; active BOM by part | `for update` on `bom_part_seq` row per part; global `pg_advisory_xact_lock(hashtext('bom_graph'))` on release (cycle check reads other parts' active revisions, two releases of different parts could otherwise form a loop) |
| bom_lines | < 6,000 (≤ 50 per BOM) | lines of one bom; where-used by component | none beyond the parent |
| bom_part_seq | < 300 | lock row | the lock itself |
| bom_history | < 5,000 | by part, newest first | none |
Edit of a draft: `select … for update` on the `boms` row, re-check `status = 'draft'` inside the tx (BR-BOM-11).
Release is a few releases a day, so the global lock costs nothing.

## Changes to tables owned by other modules
| Module (spec) | Change |
|---|---|
| inventory (change request to `inventory` spec; open question 5) | `assetRepository.updateItemLocked` `isInUse`: add `boms.part_id`, `boms.sent_item_id`, `boms.alloy_item_id`, `bom_lines.component_item_id` (BR-BOM-20 → 409 `ITEM_IN_USE`). No column change on `item_master`. |
| auth-setup | New keys `bom.view`, `bom.manage`, `bom.release`; module `bom`, screen `/bom` (`bom.view`); seed `bom.view` ow/bo/fs, `bom.manage` ow/bo, `bom.release` ow. |
| subcontracting | No table change. The job-worker / service check reuses the BR-SCO-02 vendor-service lookup (extract as a shared function, not a copy). |

## Migration notes
One migration: 3 enums, 4 tables, 2 partial unique indexes. No backfill (no BOM data exists). Drop-able in
full. Do not run `db:reset` against the dev DB; tests use the test DB only.

## Choices made
| Question | Choice | Source |
|---|---|---|

Moved to `../assumptions.md` (A-03, A-20..A-28) by spec-analyst, pass 2.
