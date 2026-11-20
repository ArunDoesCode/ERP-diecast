# Sale order — data design

> Written by solution-designer from `../spec.md` (draft v0). Conventions: `backend/CLAUDE.md`,
> `backend/.claude/reference/`. New tables live in a new schema file `05_sales.ts` (barrel in `index.ts`).
> BOM tables and service are the real names from `docs/specs/bom/design/data.md` (`boms`, `bom_lines`, `expandBomLevel`, `computeBomNeeds`).
> Ids are `serial` integers, audit columns `created_by/created_at/last_updated_by/last_updated_at` (project pattern).
> Quantities `numeric(14,3)` (no float, BR-SO-07); money `bigint` paise; plant days are `date` (IST, D-022).

## Tables

### `customers` (new)
| Column | Type | Null | Unit | Rule | Note |
|---|---|---|---|---|---|
| id | serial pk | no | | | |
| name | text | no | max 120 | BR-SO-01 | unique on `lower(btrim(name))` |
| state_code | text | no | 2 digits, GST state code | BR-SO-01 | checked against GSTIN prefix |
| address | text | no | max 300 | BR-SO-01 | |
| gstin | text | yes | 15 chars | BR-SO-01 | check regex GST format; prefix = state_code (API) |
| is_active | boolean | no | default true | BR-SO-02 | never deleted |
| audit columns | | | | BR-SO-52 | |
- **Indexes:** unique `uq_customers_name_norm`; trgm GIN on `name` (list `q`).

### `sale_orders` (new)
| Column | Type | Null | Unit | Rule | Note |
|---|---|---|---|---|---|
| id | serial pk | no | | | |
| so_number | text | no | `SO-<IST yyyy-mm>-<seq>` | BR-SO-05 | unique; counter docType `SO` (D-019) |
| customer_id | int fk customers | no | | BR-SO-06 | restrict |
| status | enum `so_status` | no | draft, confirmed, on_hold, closed, cancelled | Flow | default draft |
| order_date | date | no | | BR-SO-06 | not in future (API) |
| customer_po_number / customer_po_date | text(50) / date | yes | | BR-SO-06 | |
| notes | text | yes | max 1000 | BR-SO-13 | |
| ship_to_address | text | yes | max 300 | for dispatch | optional; null = customer address |
| ship_to_state_code | text | yes | 2 digits | for dispatch | required when ship_to_address is set; drives CGST/SGST vs IGST later |
| total_amount_paise | bigint | no | paise | BR-SO-11 | Σ line_amount_paise, rewritten in the edit tx |
| edit_version | integer | no | default 0 | BR-SO-52 | +1 on every write; optimistic check only |
| need_version | integer | no | default 0 | BR-SO-38 | +1 only on a change that affects need: line qty, item, delivery date, line added / removed, hold, resume; not notes, price, GST %, ship-to, customer PO |
| delivery_version | integer | no | default 0 | BR-SO-38 | +1 only by `applyDelivery` and `reopenAfterDeliveryCancel` (post / cancel / reopen); lets the API say `delivery_changed` vs `so_changed` |
| last_line_no | integer | no | default 0 | BR-SO-05 | line numbers come from `last_line_no + 1`, so a removed line's number is never reused |
| confirmed_by/at | int fk employees / timestamp | yes | | BR-SO-12 | |
| hold_reason, held_by, held_at | text(500) / fk / ts | yes | 3–500 chars | BR-SO-16 | overwritten on next hold; history in audit log |
| close_kind | enum `so_close_kind` (manual, fully_delivered) | yes | | for dispatch | null until closed; `fully_delivered` set only by the dispatch hook |
| close_reason, closed_by, closed_at | same | yes | | BR-SO-17 | manual: reason 3–500 chars; fully_delivered: reason null, closed_by = the dispatching user; cleared on reopen (audit log keeps it) |
| cancel_reason, cancelled_by, cancelled_at | same | yes | | BR-SO-18 | |
| audit columns | | | | | |
- **Keys:** customer_id → customers.id restrict. No delete path (BR-SO-20).
- **Indexes:** unique so_number; `(status, created_at desc)` list filter/sort; `(customer_id)` FK + filter;
  `(order_date desc)` date-range filter; `(status, order_date)` dispatch pending list (open SOs by order date); trgm GIN `so_number`, `customer_po_number` (list `q`);
  partial unique `(customer_id, lower(btrim(customer_po_number))) where status <> 'cancelled' and customer_po_number is not null` (BR-SO-06, race-safe).

### `sale_order_lines` (new)
| Column | Type | Null | Unit | Rule | Note |
|---|---|---|---|---|---|
| id | serial pk | no | | | |
| so_id | int fk sale_orders | no | | BR-SO-05 | restrict |
| line_no | integer | no | | | unique per SO (also among removed lines), never reused |
| removed_at / removed_by | timestamp / int fk employees | yes | | BR-SO-10, 14 | soft remove; removed lines are excluded from totals, the unique index, explosion and lists; removing a line with `delivered_qty > 0` → 409 |
| item_id | int fk item_master | no | | BR-SO-07, 13 | active at save; fixed after confirm |
| uom | text | no | copied from item | BR-SO-07 | |
| qty | numeric(14,3) | no | item unit; whole for pcs/set; API max 1,000,000 | BR-SO-07 | check > 0 |
| unit_price_paise | bigint | no | paise; API max 100,000,000 | BR-SO-07 | check >= 0 |
| line_amount_paise | bigint | no | paise | BR-SO-11 | `round(qty × unit_price)` computed in SQL numeric |
| gst_percent | numeric(5,2) | no | percent, no default | for dispatch | required; one of the BR-SUP-13 list (API); stored only, no tax totals on the SO (BR-SO-11) |
| delivery_date | date | no | | BR-SO-07 | |
| delivered_qty | numeric(14,3) | no | default 0 | BR-SO-09, 14 | check >= 0; written only by dispatch hook (`applyDelivery`) |
| notes | text(500) | yes | | BR-SO-13 | |
| audit columns | | | | | |
- **Indexes:** partial unique `(so_id, item_id, delivery_date) where removed_at is null` (BR-SO-08; its `so_id` prefix serves the FK);
  unique `(so_id, line_no)`; `(item_id)` FK + "open demand for item" query; partial `(delivery_date) where removed_at is null and delivered_qty < qty` (list filter `deliveryBefore`, open lines only). The SO list reads `sale_orders.total_amount_paise` only, never the lines.

### `sale_explosions` (new) — one numbered snapshot
| Column | Type | Null | Rule | Note |
|---|---|---|---|---|
| id | serial pk | no | | |
| so_id | int fk sale_orders | no | BR-SO-21 | |
| run_no | integer | no | BR-SO-21 | shown `<so_number>/E<run_no>` |
| status | enum `explosion_status` (current, superseded) | no | BR-SO-36 | |
| so_need_version | integer | no | BR-SO-38 | `sale_orders.need_version` at run time |
| so_delivery_version | integer | no | BR-SO-38 | `sale_orders.delivery_version` at run time |
| created_by / created_at | fk / timestamp | no | BR-SO-21 | who, when |
| superseded_at | timestamp | yes | BR-SO-36 | |
- **Indexes:** unique `(so_id, run_no)` (serves FK); partial unique `(so_id) where status='current'` (one current). Rows are capped at 200 per run (400 `EXPLOSION_TOO_LARGE`).
- **Out of date (BR-SO-38) is derived, not stored:** `so_need_version <> need_version` (reason `so_changed`), `so_delivery_version <> delivery_version` (reason `delivery_changed`), OR any row where
  the item's active BOM revision id is distinct from the row's `bom_revision_id` (null-safe; catches release, retire
  and a BOM created for a "no BOM" item). No write from BOM into this table.

### `sale_explosion_rows` (new) — one row per item per snapshot (BR-SO-25)
| Column | Type | Null | Unit | Rule | Note |
|---|---|---|---|---|---|
| id | serial pk | no | | | |
| explosion_id | int fk | no | | | |
| item_id | int fk item_master | no | | BR-SO-25 | unique with explosion_id |
| level | smallint | no | 1..10, top item = L1 | BR-SO-50 | deepest level the item occurs at |
| row_type | enum `explosion_row_type` (cast, job_work, assemble, buy) | no | | BR-SO-22 | |
| tag | text | yes | `no_bom`, `buy_as_is` | BR-SO-22, 50 | |
| block_reason | text | yes | `inactive_item`, `no_active_bom`, `bom_loop` | BR-SO-26, 27, 28 | not raisable when set |
| bom_revision_id | int fk boms | yes | | BR-SO-21, 38 | null for bought / no BOM |
| uom | text | no | | BR-SO-50 | |
| gross_qty, on_hand_qty, reserved_other_qty | numeric(14,3) | no | item unit | BR-SO-29, 30, 50 | free = max(0, on_hand − reserved_other), derived |
| open_pr_qty, open_po_qty, open_sco_qty | numeric(14,3) | no | item unit | BR-SO-31, 32 | counted supply after the date cut and other-SO claims |
| late_supply_qty | numeric(14,3) | no | item unit | BR-SO-32 | excluded because due after required_by; shown only |
| net_qty | numeric(14,3) | no | item unit | BR-SO-29 | check >= 0 |
| pour_qty / send_qty | numeric(14,3) | yes | pcs | BR-SO-23, 42, 44 | cast row / job-work row; values as returned by the BOM service |
| required_by | date | no | | BR-SO-41 | earliest delivery date of the SO lines needing it |
| pr_item_id | int fk purchase_request_items | yes | | BR-SO-46 | line this row became |
| sco_item_id | int fk subcontracting_order_items | yes | | BR-SO-46 | check: not both |
| raised_qty, raised_by, raised_at | numeric(14,3) / fk / ts | yes | | BR-SO-39, 46 | the picked qty |
- **Indexes:** unique `(explosion_id, item_id)` (serves FK); partial unique `(pr_item_id)` and `(sco_item_id)` where not null
  (a document line comes from one row; also the reverse lookup PR/SCO line → snapshot row); `(item_id)` FK; `(bom_revision_id)` FK.

### `sale_explosion_sources` (new) — trace of which SO line needed the row (BR-SO-25)
| Column | Type | Null | Unit | Note |
|---|---|---|---|---|
| id | serial pk | no | | |
| row_id | int fk sale_explosion_rows | no | | |
| so_line_id | int fk sale_order_lines | no | | |
| via_item_id | int fk item_master | yes | | parent item at the level above; null at level 1 |
| qty | numeric(14,3) | no | item unit | gross contribution |
- **Indexes:** `(row_id)` FK (rows + sources read together); `(so_line_id)` FK ("which rows came from this line").

### `sale_reservations` (new) — soft claims, never ledger postings (BR-SO-34, 35)
| Column | Type | Null | Unit | Note |
|---|---|---|---|---|
| id | serial pk | no | | |
| row_id | int fk sale_explosion_rows | no | | |
| so_id | int fk sale_orders | no | | denormalised: release on close / cancel / re-run without a join |
| item_id | int fk item_master | no | | |
| kind | enum `reservation_kind` (stock, open_pr, open_po, open_sco) | no | | |
| pr_item_id / po_item_id / sco_item_id | int fk | yes | | exactly the one matching `kind`; all null for `stock` (check) |
| qty | numeric(14,3) | no | item unit | check > 0 |
| released_at | timestamp | yes | | set on supersede, close, cancel; rows kept for trace |
- **Indexes (hot, all partial `where released_at is null`):** `(item_id) where kind='stock'` (free stock, BR-SO-30);
  `(pr_item_id)`, `(po_item_id)`, `(sco_item_id)` (supply claimed by others, BR-SO-33); `(so_id)` (release);
  plus plain `(row_id)` FK.

### `sales_audit_log` (new, insert-only) — BR-SO-52 and customer audit
`id serial, actor_id fk employees, action text, target_type text (customer|sale_order|explosion), target_id int,
so_id int fk null, before jsonb, after jsonb, at timestamp`. Modelled on `auth_audit_log`. Indexes `(so_id, at desc)`,
`(target_type, target_id, at desc)`, `(actor_id)`.

## Changes to tables owned by other modules
| Table | Change | Spec that owns it |
|---|---|---|
| `purchase_requests` | `sale_order_id` gets FK → `sale_orders.id` (restrict) + index `idx_purchase_requests_sale_order_id`; BR-SO-48 check in create (`saleOrderId` must name an existing confirmed SO); explosion PRs have type `sale_order`, so approval policies with category `sale_order` match them (BR-APR-02, 15); a hand-typed `saleOrderId` keeps the PR's own type | purchase-requisition (closes BR-PR-02 M4 gap) |
| `purchase_request_items` | partial index `idx_pr_items_item_open (item_id) where status in ('pending','po_draft')` for the open-PR supply read (one batched query per level) | purchase-requisition |
| `purchase_order_items`, `subcontracting_order_items`, `inventory_ledger` | no new index: existing `idx_po_items_item_id`, `idx_sco_items_finished_item_id`, `idx_inventory_ledger_item_location (item_id, location_id, id desc)` serve `distinct on (item_id, location_id)`; PO / SCO status filter is a join to the header (small tables) | purchase-order, subcontracting, inventory |
| `subcontracting_orders` | none; `project_ref` is set to the SO number (text, existing). Link SCO → SO goes through `sale_explosion_rows.sco_item_id`; for BR-SO-14 / 19 only explosion-linked PR / SCO lines (rows' `pr_item_id` / `sco_item_id`, any run) count as raised from the SO — a PR with `sale_order_id` but no row link does not block edits. Dispatch hooks write `sales_audit_log` in their transaction | subcontracting |
| `document_number_counters` | new `doc_type = 'SO'`, period key = IST month | auth-setup / D-019 |
| `permissions`, `screens` | new keys `so.view`, `customer.manage`, `so.manage`, `so.explode`; screens `sale-orders` (so.view), `customers` (so.view) | auth-setup (via `permissions.ts` sync) |
Read-only use (no schema change): `inventory_ledger` + `locations` (free stock), `purchase_request_items`,
`purchase_order_items`, `purchase_orders`, `subcontracting_order_items`, BOM tables (through the BOM service only).

## Stock and money
No posting to `inventory_ledger` anywhere in this module; reservations are rows in `sale_reservations`. Free stock is read
per item as the latest `balance_after` per location over active, non-virtual locations excluding `scrap_yard`, through an
inventory read function (not `item_master.current_stock`, which includes vendor premises). Money: `unit_price_paise`,
`line_amount_paise`, `total_amount_paise`, all bigint paise; no tax on the SO. Dispatch hook (BR-SO-09): repository
functions, called by dispatch inside its own transaction, all taking `sale_orders for update` first: `applyDelivery(tx, lineId, qty)`
(+qty on post, −qty on cancel; on post also lowers this SO's unreleased `stock` reservations for the shipped item by the shipped qty, oldest first, setting `released_at` when one reaches 0, BR-SO-58; a cancel does not restore claims, the next run does; keeps 0 <= delivered <= open check; bumps `delivery_version` (and `edit_version`) so the snapshot is out of date),
`closeFullyDelivered(tx, soId, actorId)` (all lines delivered >= qty → `closed`, `close_kind = fully_delivered`, reservations
released), `reopenAfterDeliveryCancel(tx, soId, actorId)` (only `closed` + `fully_delivered` → `confirmed`, close_* cleared,
`delivery_version` +1; a manually closed SO is never reopened). No SO route can write `delivered_qty` or call these.

## Volumes and locks
| Table | Rows per year | Hot query | Lock needed |
|---|---|---|---|
| sale_orders / lines | ~1,500 / ~6,000 | list by status; lines by so_id | `sale_orders for update` on every edit, state change, run, draft creation (always taken first) |
| sale_explosions | ~7,500 (5 runs per SO) | current by so_id | unique partial index backs "one current" |
| sale_explosion_rows / sources | ~300k / ~600k (≤ 60 rows per run) | rows by explosion_id | rows `for update`, ordered by id, in draft creation (BR-SO-46) |
| sale_reservations | ~900k, only unreleased count | free stock per item | none: runs are serialised |
- **Run serialisation (BR-SO-37):** in the run transaction: `pg_try_advisory_xact_lock(7101, so_id)` (two-key form, class 7101 = per-SO; fail → 409 `EXPLOSION_IN_PROGRESS`),
  then `pg_advisory_xact_lock(7100, 0)` (class 7100 = global; the classes never overlap a BOM or counter lock) with `lock_timeout 15 s` (fail → 409 `EXPLOSION_BUSY`), then `sale_orders for update`.
  Lock order is always advisory → SO row → explosion rows, so no cycles. Isolation stays READ COMMITTED (soft claims, no ledger writes).

## Migration notes
1. Enums + tables in the order customers, sale_orders, lines, explosions, rows, sources, reservations, audit log.
2. Before the PR foreign key: every existing `purchase_requests.sale_order_id` is an orphan (no SO table existed). Set it to
   null and append "(old SO ref N)" to `notes`; list the count in the hand-over. UAT-1 has not started, so these are test rows.
3. The PR foreign key is added `NOT VALID`, then `VALIDATE CONSTRAINT` in a second step (short lock).
4. Seed new permission keys through the existing catalog sync; rollback = drop the new tables and the FK (no data in
   other tables changes except step 2).

## Choices made
| Question | Choice | Source |
|---|---|---|
Moved to `../assumptions.md` (A-21..A-43, A-65, A-66, A-74, A-75) by spec-analyst, 2026-11-20.
