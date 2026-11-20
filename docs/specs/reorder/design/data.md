# Reorder — data design

> Written by solution-designer from `../spec.md`. Checked by performance-auditor and security-auditor
> before freeze. Conventions: `backend/CLAUDE.md`, `backend/.claude/reference/`. Max 150 lines.
> Answers designer questions D1 (shapes, indexes), D2 (scheduler), D3 (transaction, locks). D4 is in `api.md`.
> Benchmark links: `docs/research/reorder.md` (ERPNext, Odoo, SAP B1, MRPeasy; read 2026-11-20).

## Tables
Schema file: new `backend/src/db/schemas/02_procurement-reorder.ts`, re-exported from `index.ts`.
Timestamps are `timestamp` (no zone, UTC) like every existing table. Quantities in new tables are
`numeric(14,3)` read as number (`mode: "number"`); all maths runs on integer thousandths (as `postStock`).

### `item_master` (changed — owned by inventory, see "Changes to other modules")
| Column | Type | Null | Unit / decimals | Rule | Note |
|---|---|---|---|---|---|
| reorder_qty | numeric(14,3) | no, default 0 | item unit, 3 dec | BR-RO-09, 06 | check >= 0; 0 = "needs a reorder qty" (BR-RO-02) |
| min_order_qty | numeric(14,3) | no, default 0 | item unit, 3 dec | BR-RO-09, 07 | check >= 0 |
| order_multiple | numeric(14,3) | no, default 0 | item unit, 3 dec | BR-RO-09, 07 | check >= 0; whole when uom is pcs/set (API) |
- **Indexes:** partial `idx_item_master_reorder` on (id) where reorder_level > 0 (PERF-01: base set of the live list and the run).
- Audit stays `last_updated_by/at` (BR-RO-09, BR-INV-25). `reorder_level` stays `double precision` (legacy).

### `purchase_requests` (changed — owned by purchase-requisition)
| Column | Type | Null | Rule | Note |
|---|---|---|---|---|
| reorder_run_id | integer FK reorder_runs.id | yes | BR-RO-17 | set only by the run; read-only for every PR endpoint |
- **Indexes:** `uq_purchase_requests_reorder_run` unique on (reorder_run_id) where not null — FK index, one PR per run
  (BR-RO-13), and the query for the PR list filter "raised by reorder".

### `reorder_settings` (new, one row)
| Column | Type | Null | Rule | Note |
|---|---|---|---|---|
| id | integer pk default 1 | no | BR-RO-20 | check id = 1; row inserted by the migration |
| enabled | boolean default false | no | BR-RO-10, 20 | switch |
| run_hour | smallint default 7 | no | BR-RO-10, 20 | check 0..23, IST hour |
| draft_owner_id | integer FK employees.id | yes | BR-RO-14, 15, 20 | null until set |
| schedule_changed_at | timestamp default now | no | BR-RO-10 | moved when `enabled` or `run_hour` changes (catch-up rule) |
| updated_by | integer FK employees.id | yes | BR-RO-20 | footer "Last changed by" |
| updated_at | timestamp default now | no | BR-RO-20 | |
- **Indexes:** none (one row). FK columns `no-index` comment: one row.

### `reorder_settings_history` (new, append-only)
Same shape as `company_settings_history`: `id serial`, `field text` (enabled / runHour / draftOwnerId), `old_value text null`,
`new_value text not null`, `created_by int FK employees not null`, `created_at timestamp`. Rule BR-RO-20 (who, when, before → after).
- **Indexes:** `(created_at desc, id desc)` — newest first; `created_by` is an audit column (no-index comment).

### `reorder_runs` (new, append-only except running → done/failed)
| Column | Type | Null | Unit | Rule | Note |
|---|---|---|---|---|---|
| id | serial pk | no | | BR-RO-22 | the run number ("run 12") |
| trigger | enum `reorder_run_trigger` schedule, manual | no | | BR-RO-10, 11 | |
| state | enum `reorder_run_state` running, done, failed | no | | BR-RO-22 | check: finished_at is null iff running |
| started_by | integer FK employees | yes | | BR-RO-11, 22 | null = "daily schedule" |
| scheduled_day | date | yes | IST day | BR-RO-10 | set only when trigger = schedule |
| draft_owner_id | integer FK employees | yes | | BR-RO-14 | owner used by this run (null if none was set) |
| started_at / finished_at | timestamp | no / yes | | BR-RO-22 | |
| items_checked / items_raised / items_skipped / items_deferred | integer default 0 | no | count | BR-RO-22 | skipped = needs a reorder qty or invalid line; deferred = over the 500-line cap |
| failure_reason | text (max 500) | yes | | BR-RO-14, 15, 16, 22 | whitelist code + fixed plain text (`OWNER_MISSING`, `OWNER_INACTIVE`, `OWNER_NO_PR_RIGHT`, `RUN_ERROR`, `INTERRUPTED`); raw error goes to the server log only, never to this column or the API |
- **PR link:** read through `purchase_requests.reorder_run_id` (one source, no circular FK).
- **Indexes:** `uq_reorder_runs_one_running` unique on (state) where state = 'running' — the guard (BR-RO-12);
  `uq_reorder_runs_schedule_day` unique on (scheduled_day) where trigger = 'schedule' — once per IST day across processes (BR-RO-10);
  `(started_at desc, id desc)` — run list newest first; `(state, started_at desc)` — list filter by state;
  `started_by`, `draft_owner_id` FK indexes (run list shows "started by" names).

### `reorder_run_items` (new, append-only)
One row per **raised**, **needs-a-reorder-qty**, **invalid-line** or **deferred** item (BR-RO-22). Items that are OK or covered are only counted (daily rows would be noise).
| Column | Type | Null | Unit | Rule | Note |
|---|---|---|---|---|---|
| id | serial pk | no | | | |
| run_id | integer FK reorder_runs | no | | BR-RO-22 | |
| item_id | integer FK item_master | no | | BR-RO-22 | unique with run_id |
| outcome | enum `reorder_item_outcome` raised, needs_reorder_qty, invalid_line, deferred | no | | BR-RO-02, 13 | invalid_line = computed line failed the PR checks (BR-PR-08, estimate range), item skipped, run continues; deferred = low but beyond the 500 largest shortfalls |
| uom | text | no | | | copy of the item unit at run time |
| usable_qty, on_the_way_qty, projected_qty | numeric(14,3) | no | item unit, 3 dec | BR-RO-03, 04, 05 | projected may be negative |
| reorder_level, reorder_qty | numeric(14,3) | no | item unit | BR-RO-05, 06 | snapshot |
| order_qty | numeric(14,3) | yes | item unit | BR-RO-06, 07, 08 | null when needs_reorder_qty; > 0 when raised |
| pr_item_id | integer FK purchase_request_items | yes | | BR-RO-13 | set when raised |
- **Indexes:** `uq (run_id, item_id)` (also the run-detail query); `item_id` (FK; "when was this item last raised");
  `pr_item_id` where not null (FK).

## Stock and money
- A run never posts to `inventory_ledger`, never writes `current_stock`, a PO or an approval (BR-RO-25). It only **reads** the ledger.
- Usable stock (BR-RO-03) = per item, the last `balance_after` of each (item, location) pair where location type is
  `main_store` or `finished_goods`, summed. Read with a lateral "latest row per pair" on `idx_inventory_ledger_item_location`.
- The base set is items with `reorder_level > 0` (then active, BR-RO-01); one CTE returns rows and `stateCounts`. On the way (BR-RO-04): (a) `purchase_request_items.requested_qty` where line `pending` and header in draft / pending_approval /
  approved / partial_ordered; (b) `purchase_order_items.qty − coalesce(received_qty,0)` (floor 0; `received_qty` is the accepted qty rolled up
  by GRN, BR-GRN-27) where PO not cancelled / closed / fully_received. A PR line already on a PO is no longer `pending`, so it is not counted twice.
  Float columns are converted with `round(x*1000)::bigint` inside the query; no float maths in the service.
- Money: the PR estimate is computed by the PR code (BR-PR-11/14, integer paise). Reorder stores no money.

## Volumes and locks
| Table | Rows per year | Hot query | Lock needed |
|---|---|---|---|
| reorder_runs | ~365 + manual (< 600) | list newest first; guard insert | partial unique indexes; no row lock |
| reorder_run_items | < 20 per run, < 12 000 | run detail by run_id | none |
| reorder_settings(+history) | 1 row / < 100 | read each timer tick (60 s) | `for update` on row 1 in PATCH |
| purchase_request_items (open lines) | < 500 open at once | on-the-way sum by item | none; add partial index below |
| inventory_ledger | tens of thousands | latest row per (item, location) | none |
- **Extra index (purchase-requisition):** `idx_pr_items_pending_item` on (item_id) where status = 'pending' — on-the-way (a).
  PO side: open POs are filtered first (status index), then joined to their lines (PERF-02).
- **Lock order of the run (D3):** (1) guard row insert, committed first; (2) in the work transaction: one set-based read statement
  (single snapshot, no item locks), then `allocateDocumentSequence("pr")` counter row, PR header, PR lines, run items, run row update.
  Same order as `prRepository.createWithItems`, so no cycle with PR/PO code (approval → PR header → lines, CRP-2). The run takes **no**
  `item_master` lock, so it cannot deadlock with `postStock` (item `for update`). A posting that commits during the read statement is either
  fully seen or not at all (BR-RO-26). The PR counter lock is held to the end of the run transaction (seconds), like any PR create.
- **Transactions (D3):** A = sweep stale runs + insert `running` row (committed, visible). B = read, compute, create PR + lines, write
  run items, set run `done` — one transaction, so any error rolls back the whole PR (BR-RO-16). C (on error only) = set run `failed` + reason.
  `prRepository.createWithItems` opens its own transaction, so it cannot be reused as is: split it into `createWithItemsTx(tx, data, items)`
  (the body) plus the old wrapper; the run calls the `Tx` version with `reorderRunId`. Services checks (active item, uom copy, one line per item) are reused.
- **Caps and invalid lines:** more than 500 low items → the 500 largest shortfalls (level − projected, item id tiebreak) go on the PR, the rest are stored `deferred`
  and picked up by the next run. Each computed line is checked before insert (qty > 0, 3 decimals, line estimate ≤ `MAX_MONEY_PAISE` = 1e13 paise): the 1e9 item cap × a
  rate up to 1e13 does **not** fit by itself, so an over-range line becomes `invalid_line` and is skipped; the run continues. Header sum of ≤ 500 lines ≤ 5e15 < 2^53 (bigint column, BigInt maths).
  PR lines and run items are inserted in batches (PERF-04), the read is one set-based statement.
- **Race left open on purpose:** a user creates a PR for the same item between the read statement and the insert → two drafts for one item. Rare,
  harmless (both are drafts a person checks); ERPNext has the same window.

## Scheduler (D2)
- No job runner exists and the app is one Bun process. Design: `startReorderScheduler()` called from `src/index.ts` after `serve()` (never from
  `createApp()`, so tests do not start it). `setInterval` every 60 s, `unref()`ed, cleared in `shutdown`. First tick 15 s after boot (catch-up).
- Tick (pure `tick(now)` for tests): read settings; stop if `enabled` = false. Let `due` = today's IST day at `run_hour`. Run when `now >= due` and
  `schedule_changed_at < due` and no run with `scheduled_day` = today (IST, `istDayKey`). Insert uses `ON CONFLICT (scheduled_day) DO NOTHING`
  — two server processes cannot both start; the loser does nothing. 
- **Single run at a time (BR-RO-12):** the unique partial index on `state = 'running'`. The service maps 23505 on `uq_reorder_runs_one_running` (`isUniqueViolation`) to `ConflictError` `REORDER_RUN_BUSY` (409). A 23505 on `scheduled_day` is silent in the timer (already ran today). A scheduled start refused as busy is not recorded and retries next tick.
  A `running` row older than 15 minutes is a crashed run: transaction A first marks it `failed` ("Interrupted — server stopped"), then inserts.
  A day with a failed scheduled run is used up (no retry the same day); "Check now" is the retry.
- Timer cost when off: one 1-row read per minute.

## Migration notes
1. One migration: enums, `reorder_*` tables, three item columns (defaults 0, safe on existing rows), `purchase_requests.reorder_run_id`,
   indexes, insert of `reorder_settings` row (id 1, off, 07, no owner).
2. New permission key `reorder.manage` in `permissions.ts` (seed ow, bo) — auth-setup spec; `permissions-sync` adds it at boot.
3. Nothing to backfill. Rollback = drop new tables/columns; no data of other modules is rewritten.

## Changes to tables owned by another module
| Table / code | Change | Owner spec |
|---|---|---|
| `item_master` | + `reorder_qty`, `min_order_qty`, `order_multiple` (+ asset item create/update schema and item list/detail response) | inventory (BR-RO-09, BR-INV-04) |
| `purchase_requests` | + `reorder_run_id`; PR list filter, PR detail field (see `api.md`) | purchase-requisition (BR-RO-17) |
| `purchase_request_items` | + partial index `idx_pr_items_pending_item` | purchase-requisition |
| `prRepository` | split `createWithItems` into a `Tx` version | purchase-requisition |
| permissions catalog | + `reorder.manage` | auth-setup |

## Choices made
Moved to `../assumptions.md` (A-06, A-12, A-15..A-23) by spec-analyst, 2026-11-20.
| Question | Choice | Source |
|---|---|---|
