# Factory flows — data design

> Written by solution-designer from `../spec.md` and its parts. Conventions: `backend/CLAUDE.md`,
> `backend/.claude/reference/`. Real schema read in `backend/src/db/schemas/`. Pass 2.

## Summary
No new table, no new column on a document table (BR-FF-05, spec "Not now": no history table). Every
number and row on the new pages is **read** from existing tables. Writes: one data migration (menu),
three indexes. Ids are `serial` integers, timestamps are `timestamp` (no zone), quantities are
`doublePrecision` (3 decimals by API rule), money is `bigint` paise — all as the existing tables.

## Tables

### `screens` (changed data, no DDL) — owned by auth-setup (v9)
| Row key | path | permission | label | sort_order | menu_group | Rule |
|---|---|---|---|---|---|---|
| `home` (new, replaces `landing`) | `/home` | null (any signed in) | Home | 10 | General | BR-FF-10, 100, 102 |
| `approvals` | `/approvals` | null | Approvals | 20 | General | BR-FF-100 |
| `purchase-requisitions` | unchanged | `pr.manage` | Requisitions | 30 | General | BR-FF-100 |
| `purchase-orders` | unchanged | `po.manage` | Purchase orders | 40 | General | BR-FF-100 |
| `grn` | unchanged | `grn.view` | Goods receipts | 50 | General | BR-FF-100 |
| `subcontracting` | unchanged | `sco.view` | Subcontracting | 60 | General | BR-FF-100 |
| `inventory` | unchanged | `inventory.view` | Inventory | 70 | General | BR-FF-100 |
| `suppliers` | unchanged | `supplier.view` | Suppliers | 80 | General | BR-FF-100 |
| `employee-directory` | unchanged | `employees.directory.view` | Employee directory | 90 | Admin | BR-FF-100 |
| `setup` | unchanged | `setup.roles.manage` | Setup | 100 | Admin | BR-FF-100 |
- **Code side:** `SCREENS` in `permissions.ts` loses `landing`, gains `home` with the defaults above, and
  the other defaults change to the table (new installs). `syncCatalog` already deletes `landing` and logs
  `catalog.screen_removed`; it never rewrites label / order / group after first insert.
- **Existing installs (BR-FF-101):** one migration (a) inserts `home`, (b) sets label / sort_order /
  menu_group of the nine existing keys to the table, (c) deletes `landing` (`home` has no key, so no
  `role_permissions` rows move). Runs once; later Setup → Screens edits are kept by sync.
- `menu_group` is set to one group ("General") for the eight work screens because the sidebar groups by
  `menu_group` and would otherwise split the order of BR-FF-100 (Subcontracting, Inventory, Suppliers).

### Indexes (new) — all on tables owned by other specs, listed in "Changes to other modules"
| Index | Table | Query that needs it |
|---|---|---|
| `idx_purchase_requests_requested_by_status` (requested_by, status) | `purchase_requests` | tiles 21 / 22 and PR list `mine=true` + status |
| `idx_purchase_orders_created_by_status` (created_by, status) | `purchase_orders` | tile 25 and PO list `mine=true` + status |
| `idx_grn_items_pending_grn` (grn_id) `where qa_status = 'pending'` (partial) | `grn_items` | tile 28 / GRN list "QA pending"; also the receivable-open-qty subquery on `po_item_id` uses existing `idx_grn_items_po_item_id` |
Already covered, no new index: PO status (`idx_purchase_orders_status`) for tiles 24 / 26 / 27 (status
filter first, then a scan of tens of rows); PR line status (`idx_pr_items_status`) tile 23;
`idx_approval_requests_status_role` / `_status_employee` tile 20; `idx_sco_challans_due` tile 29;
`idx_grns_po_id`, `idx_po_items_po_id`, `idx_pr_po_links_*` for linked documents; `idx_approval_requests_doc`,
`idx_approval_trails_request_id`, `idx_po_communications_po_id_sent_at`, `idx_grn_corrections_grn_item_id`,
`idx_qa_tests_grn_item_id` for History. `item_master` (a few hundred rows) tile 30: no index.

## Where each rule reads its data (no new columns)
| Rule | Reads | Note |
|---|---|---|
| BR-FF-20 | `approval_requests` + `approval_trails` | same predicate as `listPendingRequests` (role or employee, minus levels I approved); oldest = `min(requested_at)` |
| BR-FF-21, 22, 18 | `purchase_requests.requested_by, status`; "Sent back" = latest `approval_requests.status = require_more_info` for the PR (docType pr, max id) | draft PR whose last request was sent back |
| BR-FF-23 | `purchase_requests.status in (approved, partial_ordered)` + `purchase_request_items.status = pending`; split by `min(expected_date)` of pending lines | no date = Later |
| BR-FF-24, 25, 26 | `purchase_orders.status`, `created_by`; late = BR-PO-19 predicate | one shared SQL predicate for list and tile (BR-FF-02) |
| BR-FF-27, 61 | PO status `dispatched` / `partial_received`; open qty per line, due = `coalesce(revised_delivery_date, expected_delivery_date)` | open qty definition: see Open point 1 |
| BR-FF-28 | `grn_items.qa_status = pending`; date = `grns.received_date` | |
| BR-FF-29 | `sco_challans` + lines not settled (existing `challans/open` rule); due = `return_due_date` | |
| BR-FF-30 | `item_master.is_active`, `reorder_level`, `current_stock` | same predicate as the stock list `belowReorder` flag |
| BR-FF-14, 08 | `today` = IST calendar day, computed once per request as `(now() at time zone 'Asia/Kolkata')::date`; compared with `due_column::date` | PO late (BR-PO-19) moves from `current_date` (DB zone) to IST day |
| BR-FF-42, 43 | `pr_po_item_links`, `purchase_order_items`, `grns.po_id`, `grn_items` | PR line shows its PO via links; PO line open qty |
| BR-FF-50..52 | totals: `purchase_requests.estimated_amount_paise`, `purchase_orders.*_paise`, `grn_items.received/accepted/rejected_qty`; approvals: `approval_requests` + trails | GRN has no Approvals block |
| BR-FF-54 | see History sources below | |
| BR-FF-106..109 | list rows + `meta.statusCounts` from the existing list queries | |
| BR-FF-85 | tile 20 count | |
| BR-FF-104..105, 111..112 | no data (screen rules) | |

### History sources (BR-FF-54), newest first, built in the service, not stored
| Document | Event | Source (who · when) |
|---|---|---|
| PR | created | `purchase_requests.requested_by · created_at` |
| PR / PO | submitted, approved, rejected, sent back, withdrawn, auto-approved | `approval_trails.action_by · action_at · notes` |
| PR / PO | cancelled (+ reason) | `cancelled_by · cancelled_at · cancel_reason` |
| PR | line cancelled | `purchase_request_items.cancelled_by / _at / cancel_reason` |
| PO | created | `purchase_orders.created_by · created_at` |
| PO | sent, reminder, escalation, confirmation | `po_communications.sent_by · sent_at · type · note` |
| PO | invoiced, closed (+ note, short-closed) | `invoiced_by / _at`, `closed_by / _at / close_note` |
| PO | delay | `revised_delivery_date`, `delay_reason` only — **no who / when stored** (Open point 2) |
| GRN | created | `grns.created_by · received_date` |
| GRN | QA accepted / rejected | `qa_tests.tested_by · tested_at · status · notes` |
| GRN | bypass | `grn_items.qa_bypassed_by / _at / qa_bypass_reason` |
| GRN | correction | `grn_corrections.created_by · created_at · reason · qty` |

## Stock and money
Nothing posts to `inventory_ledger` from this feature. Stock still moves only on QA accept / bypass /
correction through `postStock` (frozen GRN rules). No money column changes; the Home endpoint returns
counts only (BR-FF-33); the receive picker selects no price, GST or total column (BR-FF-62) — enforced by
a column whitelist in its repository query, not by stripping fields afterwards.

## Volumes and locks
| Table | Rows per year | Hot query | Lock needed |
|---|---|---|---|
| `purchase_requests` / `_items` | ~600 / ~2,500 | tiles 21–23 (index above) | none (reads) |
| `purchase_orders` / `_items` | ~1,500 / ~4,500 | tiles 24–27, list strip counts | none (reads) |
| `grns` / `grn_items` | ~2,500 / ~5,000 | tile 28, picker open-qty subquery | none for reads; GRN create keeps frozen `FOR UPDATE` |
| `approval_requests` | ~2,500 | tile 20, menu badge (every page load) | none |
| `item_master` | ~500 | tile 30 | none |
- Home = up to 11 count queries per call, each on an indexed filter over < 10k rows: target < 100 ms total.
  Run in parallel; a failed one returns `error` for that tile only (BR-FF-19).
- Writes reuse frozen endpoints and their locks. The two races this feature creates are covered by them:
  two people on "Create PO" → `findPurchaseRequestItemsByIdsForUpdate` in `createpo` → 409 (BR-FF-59);
  two receipts of the same PO → `creategrn` re-checks PO status; over-receipt is judged at QA (BR-GRN-15).
- No row lock needed on any new read endpoint.

## Changes to tables owned by another module
| Owner spec | Change | Why |
|---|---|---|
| auth-setup (`docs/specs/auth-setup.md`) | data migration on `screens` + `SCREENS` defaults (above) | BR-FF-100..102 |
| purchase-requisition | index `idx_purchase_requests_requested_by_status` | BR-FF-21, 22 |
| purchase-order | index `idx_purchase_orders_created_by_status`; late predicate uses IST day | BR-FF-25, 08 |
| grn | partial index `idx_grn_items_pending_grn` | BR-FF-28 |

## Migration notes
One drizzle migration: 3 plain `create index` (tables are small; `concurrently` cannot run in a drizzle
transaction) then the `screens` data change. Rollback: drop the indexes,
re-insert `landing`, restore old labels (values in the migration's down comment). No backfill.

## Open points (returned to spec-analyst, not decided here)
1. **Open quantity.** Frozen BR-GRN-27 adds to `purchase_order_items.received_qty` only at QA accept. So
   after GRN-2026-11-4 (600 kg arrived, QA pending) the PO line still reads received 0. BR-FF-27's example
   ("still 1, 400 kg open") and BR-FF-66 ("counting every earlier receipt") need 400. Design assumes
   **open = ordered − accepted (received_qty) − arrived on lines still `pending` QA**, so a rejected line
   re-opens and a pending one does not double-count. BR-FF-43 / BR-FF-26 say "ordered − received" — pick one.
2. **Delay history.** BR-FF-54 lists "delay" with who and when; the PO stores only revised date + reason.
3. **Below reorder.** BR-FF-30 says "below"; the existing stock flag is `stock <= reorder level` and needs
   `reorder_level > 0`. Design reuses the existing flag so the tile equals the list (BR-FF-02).

## Choices made
| Question | Choice | Source |
|---|---|---|
| New tables for Home / history? | None; read from existing tables | scope rule, A-09 |
| Index on "mine" filters | Composite (owner, status) on PR and PO | convention: index for every list filter |
| Partial index for QA pending | Partial on `grn_items(grn_id) where qa_status='pending'` | table is mostly non-pending after QA |
| "Today" | IST day computed in the service; DB zone never used for tiles | BR-FF-08; `timestamp` columns hold no zone |
| Menu group | One group for the eight work screens | sidebar groups by `menu_group` |
| Existing-install default | One migration; sync keeps UI-owned fields | A-17, existing `syncCatalog` |
| Money / quantity types | Keep existing (`bigint` paise, `doublePrecision` qty) | existing schema pattern |
