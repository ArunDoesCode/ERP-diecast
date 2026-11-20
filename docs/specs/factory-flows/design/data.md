# Factory flows — data design

> Written by solution-designer from `../spec.md` and its parts. Conventions: `backend/CLAUDE.md`,
> `backend/.claude/reference/`. Real schema read in `backend/src/db/schemas/`. Pass 3 (pre-freeze fix round 1).

## Summary
No new table, no new column on a document table (BR-FF-05, spec "Not now": no history table). Every
number and row on the new pages is **read** from existing tables. Writes: one data migration (menu),
four indexes. Ids are `serial` integers, timestamps are `timestamp` (no zone), quantities are
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
  menu_group of the nine existing keys to the table **only for rows whose label, sort_order and menu_group still equal the old seed values** (admin edits kept, SPEC-07), (c) deletes `landing` (`home` has no key, so no
  `role_permissions` rows move). Runs once; later Setup → Screens edits are kept by sync.
- `menu_group` (A-26): the eight work screens are "General"; Employee directory and Setup are "Admin". The sidebar
  groups by `menu_group`, so this keeps the BR-FF-100 order.

### Indexes (new) — all on tables owned by other specs, listed in "Changes to other modules"
| Index | Table | Query that needs it |
|---|---|---|
| `idx_purchase_requests_requested_by_status` (requested_by, status) | `purchase_requests` | tiles 21 / 22 and PR list `mine=true` + status |
| `idx_purchase_orders_created_by_status` (created_by, status) | `purchase_orders` | tile 25 and PO list `mine=true` + status |
| `idx_grn_items_pending_grn` (grn_id) `where qa_status = 'pending'` (partial) | `grn_items` | tile 28 / GRN list "QA pending"; also the receivable-open-qty subquery on `po_item_id` uses existing `idx_grn_items_po_item_id` |
| `idx_grns_received_date` (received_date, id) | `grns` | GRN list `bucket` filter + sort by received date (PERF-06) |
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
| BR-FF-21, 22, 18 | `purchase_requests.requested_by, status`; "Sent back" = latest `approval_requests.status = require_more_info` for the PR (docType pr, max id; one batched query over the page's PR ids on lists) | draft PR whose last request was sent back |
| BR-FF-23 | `purchase_requests.status in (approved, partial_ordered)` + `purchase_request_items.status = pending`; split by `min(expected_date)` of pending lines | no date = Later |
| BR-FF-24, 25, 26 | `purchase_orders.status`, `created_by`; late = BR-PO-19 predicate, unchanged | one shared SQL predicate for list and tile (BR-FF-02), `today` passed in |
| BR-FF-27, 61, 09 | PO status `dispatched` / `partial_received`; open qty per line (tiles 27 and picker, display fields), due = `coalesce(revised_delivery_date, expected_delivery_date)` | open = `qty − received_qty − sum(grn_items.received_qty where qa_status = 'pending')` |
| BR-FF-28 | `grn_items.qa_status = pending`; date = `grns.received_date` | |
| BR-FF-29 | `sco_challans` + lines not settled (existing `challans/open` rule); due = `return_due_date` | |
| BR-FF-30 | `item_master.is_active`, `reorder_level`, `current_stock` | same predicate as the stock list `belowReorder` flag |
| BR-FF-14, 08 | `today` = IST calendar day from `istDayKey()` (`src/lib/ist-day.ts`), computed once per request and passed as a parameter; compared with `due_column::date` | used by `getcounts`, `getreceivablepos`, and passed into the BR-PO-19 predicate as its "today" (rule text unchanged) |
| BR-FF-42, 43 | `pr_po_item_links`, `purchase_order_items`, `grns.po_id`, `grn_items` | PR line shows its PO via links; PO line open qty |
| BR-FF-50..52 | totals: `purchase_requests.estimated_amount_paise`, `purchase_orders.*_paise`, `grn_items.received/accepted/rejected_qty`; approvals: `approval_requests` + trails | GRN has no Approvals block |
| BR-FF-54 | see History sources below | |
| BR-FF-106..109 | list rows + `meta.statusCounts` from the existing list queries | |
| Home tile hints + tone | per-tile `min` / `max` of the date columns the tile already reads (`approval_requests.requested_at`, `expected_date`, due date, `received_date`) and the count of sent-back drafts; `tone` derived in the service from count / late | no new column |
| PR list "To order" chip | `meta.toOrderCount` = `count(*)` of the BR-FF-23 predicate under the other filters | same predicate as `toOrder=true` |
| PO list chips | `meta.statusCounts` = `group by status` over the filtered set; Late = BR-PO-19 predicate (same as tile 26) | BR-FF-09 open qty is display only |
| GRN list PO link | `poCanOpen` = caller holds `po.manage`; no column | BR-FF-03 |
| PR line default supplier / rate (SPEC-02, 03) | existing `prRepository` default-supplier lookup (item ↔ supplier link / preferred flag per spec); suggested rate from the same price lookup; no column | line with no supplier or rate 0 / null goes to the Create PO dialog |
| PR line "On order" | `pr_po_item_links` → `purchase_order_items` → `purchase_orders.po_number` per `prItemId`; default supplier from the existing lookup in `prRepository` | idx_pr_po_links_pr_item_id |
| GRN link QA status / list `qaSummary` | `grn_items.qa_status` of the GRN's lines: pending if any pending; failed if any failed and none pending; passed if all passed / waived; else `mixed` | idx_grn_items_grn_id |
| Requester's note | `purchase_requests.notes`, `purchase_orders.notes`, `subcontracting_orders.notes` | |
| BR-FF-85 | tile 20 count (`getcounts?tiles=approvals`) | |
| BR-FF-53 | latest `approval_requests` row per `(doc_type, doc_id)` (`idx_approval_requests_doc`) + `approval_trails` row by caller | read-via-approval rule, api.md |
| BR-FF-80 | pending-approval rows; doc number / amount batched per docType by `inArray` (PERF-05); sort `requested_at`, `id` | amount only when target is the caller |
| BR-FF-104..105, 111..112 | no data (screen rules) | |

### History sources (BR-FF-54), newest first, built in the service, not stored
Each source query is `limit 200` newest first; merged and cut to 200 after the merge (`historyTruncated`). For via-approval readers `po_communications.note` is not returned (event name only).

| Document | Event | Source (who · when) |
|---|---|---|
| PR | created | `purchase_requests.requested_by · created_at` |
| PR / PO | submitted, approved, rejected, sent back, withdrawn, auto-approved | `approval_trails.action_by · action_at · notes` |
| PR / PO | cancelled (+ reason) | `cancelled_by · cancelled_at · cancel_reason` |
| PR | line cancelled | `purchase_request_items.cancelled_by / _at / cancel_reason` |
| PO | created | `purchase_orders.created_by · created_at` |
| PO | sent, reminder, escalation, confirmation | `po_communications.sent_by · sent_at · type · note` |
| PO | invoiced, closed (+ note, short-closed) | `invoiced_by / _at`, `closed_by / _at / close_note` |
| PO | delay | `revised_delivery_date`, `delay_reason` only, pinned above dated events, no who / when (A-24) |
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
- Home = one SQL per source table with `count(*) filter (where …)` per tile (≤ 6 statements), each on an indexed filter over < 10k rows: target < 100 ms total. A failed statement returns `error` for that table's tiles only (BR-FF-19). Fallback: parallel with concurrency cap 4. Menu badge = the `approvals` tile alone.
- PO list with `bucket` and no status filter: scans the open-status POs, accepted risk (PERF-06).
- Writes reuse frozen endpoints and their locks. The two races this feature creates are covered by them:
  two people on "Create PO" → `findPurchaseRequestItemsByIdsForUpdate` in `createpo` → 409 (BR-FF-59);
  two receipts of the same PO → `creategrn` re-checks PO status; over-receipt is judged at QA (BR-GRN-15).
- No row lock needed on any new read endpoint.

## Changes to tables owned by another module
| Owner spec | Change | Why |
|---|---|---|
| auth-setup (`docs/specs/auth-setup.md`) | data migration on `screens` + `SCREENS` defaults (above) | BR-FF-100..102 |
| purchase-requisition | index `idx_purchase_requests_requested_by_status` | BR-FF-21, 22 |
| purchase-order | index `idx_purchase_orders_created_by_status` only. The Late filter keeps the frozen BR-PO-19 predicate (no change to the rule; BR-FF-09 open quantity is for display fields only) | BR-FF-25, 26 |
| grn | partial index `idx_grn_items_pending_grn`; index `idx_grns_received_date` | BR-FF-28 |
| approval | no table change; code only: export `assertCanReadRequest` with an options argument | BR-FF-53 |

## Migration notes
One drizzle migration: 4 plain `create index` (tables are small; `concurrently` cannot run in a drizzle
transaction) then the `screens` data change. Rollback: drop the indexes,
re-insert `landing`, restore old labels (values in the migration's down comment). No backfill.

## Open points — all resolved in spec pass 2
1. **Open quantity** — resolved: BR-FF-09 (open = ordered − accepted − arrived on lines pending QA; rejected re-opens) and A-23. One shared SQL expression feeds tiles 26 / 27, the picker, `getpos` Late and `getpodetails` `openQty`.
2. **Delay in History** — resolved: A-24 (current revised date + reason pinned above dated events; no who / when, no new column).
3. **Below reorder** — resolved: A-25 (existing flag: stock <= reorder level, reorder level > 0, active).

## Choices made
Moved to `../assumptions.md` (A-26, A-39..A-44; pre-freeze round 1: A-54, A-65, A-80).
| Question | Choice | Source |
|---|---|---|
