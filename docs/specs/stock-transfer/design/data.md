# Stock transfer — data design

> Written by solution-designer from `../spec.md`. Checked by performance-auditor and security-auditor
> before freeze. Conventions: `backend/CLAUDE.md`, `backend/.claude/reference/`. Max 150 lines.
> Schema file: `backend/src/db/schemas/02_procurement-catalog.ts` (next to `locations`, `inventoryLedger`).
> Naming, serial ids, `created_by/at`, `last_updated_by/at` and the `// no-index:` tag follow `subcontracting_orders`.

## Tables

### `stock_transfers` (new)
| Column | Type | Null | Unit / decimals | Rule | Note |
|---|---|---|---|---|---|
| id | serial pk | no | | | |
| transfer_number | text unique | no | `ST-<IST year>-<seq, 4 digits min>` | BR-STR-08 | counter `doc_type='stock_transfer'`, `period_key='<yyyy>'` (see Choices) |
| status | enum `stock_transfer_status` | no | | BR-STR-08..10, 17, 19, 24 | `draft` (default), `posted`, `cancelled`, `reversed` |
| source_location_id | integer fk locations | no | | BR-STR-01, 02 | |
| destination_location_id | integer fk locations | no | | BR-STR-01, 02 | check `source <> destination` |
| notes | text | yes | max 500 chars (API) | BR-STR-09 | |
| created_by / created_at | fk employees / timestamp | no | server time | BR-STR-08 | |
| last_updated_by / last_updated_at | fk employees / timestamp | no | | BR-STR-09 | set on every edit and status change |
| cancelled_by / cancelled_at | fk employees / timestamp | yes | | BR-STR-10 | no reason column (spec: none) |
| posted_by / posted_at | fk employees / timestamp | yes | server time | BR-STR-18 | |
| reversed_by / reversed_at | fk employees / timestamp | yes | server time | BR-STR-19 | |
| reverse_reason | text | yes | 1-500 chars | BR-STR-19 | required when status `reversed` |

- **Keys:** both location FKs `on delete no action` (locations are never deleted, BR-INV-14). Audit FKs to `employees`, no action.
- **Checks:** `source_location_id <> destination_location_id` (BR-STR-01, belt and braces); `reversed_at is null or reverse_reason is not null` (BR-STR-19); `status='posted' -> posted_at not null`; `status='cancelled' -> cancelled_at not null`; `status='reversed' -> reversed_at not null` (CR-004).
- **Indexes:** unique `transfer_number` (lookup, BR-STR-08). `idx_stock_transfers_status_id (status, id desc)` (list filter status, newest first, BR-STR-27). `idx_stock_transfers_source (source_location_id)` and `idx_stock_transfers_destination (destination_location_id)` (FK + list filters). `idx_stock_transfers_created_at (created_at desc)` (default sort, date filter). Audit FK columns: `// no-index: audit who-did-it column`.
- **Status enum:** `draft`, `posted`, `cancelled`, `reversed` (spec Flow).

### `stock_transfer_items` (new)
| Column | Type | Null | Unit / decimals | Rule | Note |
|---|---|---|---|---|---|
| id | serial pk | no | | BR-STR-11 | this id is the ledger `reference_line_id` |
| transfer_id | integer fk stock_transfers | no | | BR-STR-04 | on delete no action (drafts are cancelled, never deleted; a draft edit replaces lines inside one tx, the only delete) |
| item_id | integer fk item_master | no | | BR-STR-04, 06 | |
| qty | numeric(13,3) | no | item unit; 3 dp; whole for `pcs`/`set` | BR-STR-04, 05 | check `qty > 0 and qty <= 1000000000`; drizzle `mode: "number"` |
| posted_unit_cost_paise | bigint | yes | paise per item unit | BR-STR-14, 20, 23 | item average read under the item lock at post; null until posted; the reversal reads it |
| posted_value_paise | bigint | yes | paise, rounded half away from zero (as `postStock`) | BR-STR-14 | qty x cost, positive; the out row is the negative of it |

- **Keys:** unique `(transfer_id, item_id)` (BR-STR-04 "same item once"; also the index for the detail query). FK `item_id` indexed.
- **Indexes:** the unique covers `transfer_id`. `idx_stock_transfer_items_item (item_id)` (list filter by item, BR-STR-27; FK). Max 50 lines per transfer: API check (BR-STR-04), not a DB rule.
- No audit columns: lines are only written through the header's edit/post (header carries who and when).

## Stock and money
All ledger rows come from `postStock` (never an edit of `currentStock`), inside the one transaction of the action. `inventory_tx_type` is reused: `out` and `in` (no new tx type). Two new `inventory_ref_type` values: `stock_transfer` and `stock_transfer_reversal`. Every row: `reference_id = stock_transfers.id`, `reference_line_id = stock_transfer_items.id`, `notes = 'Stock transfer ST-…'` (BR-STR-25), `created_by` = actor.
| Action | Rows per line (item locked first, in item-id order) |
|---|---|
| create / edit / cancel | none (BR-STR-08, 10) |
| post | 1. `out`, `stock_transfer`, location = source, qty = -q, `blockNegative: true`. 2. `in`, `stock_transfer`, location = destination, qty = +q. Both: `unitCostPaise` = item average read once after the lock (saved on the line as `posted_unit_cost_paise`), `averageEffect: "none"` on both, so average and plant stock do not move (BR-STR-14, 15). Row values are equal and opposite because the same cost and qty are used (BR-GRN-24). |
| reverse | 1. `out`, `stock_transfer_reversal`, location = destination, qty = -q, `blockNegative: true` (BR-STR-21). 2. `in`, `stock_transfer_reversal`, location = source, qty = +q. Cost = line `posted_unit_cost_paise`, `averageEffect: "none"` (BR-STR-20, 23). |
Money is bigint paise (`MAX_MONEY_PAISE` range checks inside `postStock`); no float for money. Quantity is `numeric(13,3)` in the new tables; the ledger keeps its existing `double precision` columns (`postStock` works in integer thousandths).

## Volumes and locks
| Table | Rows per year (plant scale) | Hot query | Lock needed |
|---|---|---|---|
| stock_transfers | ~5,000 (10-20 per working day) | list by status / date, detail by id | `for update` on the header row for edit, cancel, post, reverse (as `scoRepository.lockById`); then status re-checked on the locked row (BR-STR-09, 17, 24) |
| stock_transfer_items | ~15,000 (avg 3 lines, max 50) | detail by transfer_id; list by item | none (written under the header lock) |
| inventory_ledger | +30,000 (2 rows per line, 4 with reversal) | existing indexes `item_location`, `reference_line` | item rows, see order below |
| document_number_counters | 1 per year for `stock_transfer` | upsert at create | held by the upsert until commit (same as PO/SCO) |

**Lock order (every transfer action, one transaction):** (1) transfer header `for update`; (2) both locations `for share`, ascending id (blocks a deactivation or type change between the checks and the postings, BR-STR-02, 22); (3) item rows `for update`, ascending `item_id`, in one `select … order by id` before any posting (then average cost and active flag are read under the lock, BR-STR-06, 16); (4) postings in line-id order: per line the first leg, then the second. `postStock` re-locks the same item (a no-op in the same tx). Two transfers sharing items thus queue on the lowest shared item id and cannot deadlock each other. Residual risk: GRN, SCO and manual postings lock item rows in their own order; they take one item at a time or are not sorted. Not changed here; logged as an `info` assumption.
Balances (PERF-01): one batch query per action, `select distinct on (item_id) item_id, balance_after from inventory_ledger where location_id = $loc and item_id in (…) order by item_id, id desc` (index `idx_inventory_ledger_item_location`); used for the draft hint, the post check and the reverse check, never one query per line. Deadlock (SQLSTATE 40P01) or serialization failure is mapped to a retryable 409 `STR_RETRY` ("Another change was in progress, try again"); nothing is saved.
Per-line failure message (BR-STR-12, 21): the service reads the location balance (last ledger `balance_after`) under the item lock to build "Line n: insufficient stock at <name>" / "only x kg left at <name>"; `postStock`'s own `blockNegative` is the backstop. Any throw rolls the whole transaction back.

## Changes to tables owned by other modules
| Table / type | Change | Owner spec |
|---|---|---|
| `location_type` enum | add value `store` (BR-STR-32). `ALTER TYPE … ADD VALUE 'store'` inside the one generated migration (nothing in it uses the value). Not virtual; no unique index (the `main_store` and `vendor_premise` partial uniques stay as they are). | inventory (BR-INV-11, 27 change; coordinator raises the change request) |
| `inventory_ref_type` enum | add `stock_transfer`, `stock_transfer_reversal` (same generated migration; nothing in it uses them). | inventory + grn-stock (BR-GRN-43 list of document types) |
| code, not tables | `assetService` location create/update accepts `store` (`isVirtual` false); Zod `inventoryReferenceTypeSchema` and `documentMovementReferenceTypeSchema` (asset.types.ts) get the two values so the manual screen answers 400 (BR-STR-26); movement list joins `stock_transfers` for the source name (BR-STR-25). | inventory |
| permissions | new keys `stock_transfer.manage`, `stock_transfer.reverse` in `src/lib/permissions.ts` + seed roles ow, bo; `inventory.view` reused. | auth-setup |
Existing `item_master`, `locations` rows: no backfill, no column change.

## Migration notes
One generated migration (`bun run db:generate`, db-migrations spec): enum value adds, `stock_transfer_status` enum, the two tables, indexes, checks. Forward-only. Enum values cannot be removed later; rollback = restore backup. Existing data untouched. If drizzle emits the `ADD VALUE` and the table DDL in one transaction, that is fine: no statement in the migration uses the new values.

## Choices made
| Question | Choice | Source |
|---|---|---|
| — | Moved to `../assumptions.md` (A-01..A-10) by spec-analyst, 2026-11-20. | |
