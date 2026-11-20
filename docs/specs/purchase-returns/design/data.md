# Purchase returns — data design

> Written by solution-designer from `../spec.md`. Conventions: `backend/CLAUDE.md`, `backend/.claude/reference/`.
> Existing tables `purchase_returns` / `purchase_return_items` are schema-only today (no code, no rows): they are
> reshaped in place by one migration. Quantities: `numeric(14,3)` (new columns), money: integer paise.

## Tables

### `purchase_returns` (changed — reshaped)
| Column | Type | Null | Unit / decimals | Rule | Note |
|---|---|---|---|---|---|
| id | serial pk | no | | | |
| pro_number | text unique | no | | BR-PRT-23 | `PRT-<YYYY-MM>-<seq 4 digits>`; counter doc_type `purchase_return`, period = IST month; never reused |
| grn_id | int fk grns | no | | BR-PRT-01 | NEW; one GRN per return |
| po_id | int fk purchase_orders | no | | BR-PRT-01 | copied from the GRN (GRN without PO → 400) |
| supplier_id | int fk supplier_master | no | | BR-PRT-01 | copied from the GRN |
| status | enum `purchase_return_status` | no | | Flow | `draft` `posted` `cancelled`; default draft. Was free text (draft/dispatched/closed): no rows, converted in migration |
| reason | text | no | 3–500 chars | BR-PRT-08 | |
| vendor_return_ref | text | yes | ≤ 100 | BR-PRT-08 | RMA, optional |
| transporter | text | yes | ≤ 100 | BR-PRT-08 | |
| vehicle_no | text | yes | ≤ 20 | BR-PRT-08 | printed on challan (BR-PRT-35) |
| remarks | text | yes | ≤ 500 | BR-PRT-08 | |
| challan_number | text unique | yes | ≤ 16 chars | BR-PRT-35 | NEW; `PRC/<yy>-<yy+1>/<seq 4 digits>` e.g. `PRC/26-27/0001`; allocated at post, doc_type `return_challan`, FY key from `financialYearOf` (same allocator as the debit note); null in draft; never reused |
| replacement_expected | boolean | no | | BR-PRT-22, 27 | default false; editable in draft only; read again at cancel |
| posted_by / posted_at | int fk employees / timestamp | yes | server time | BR-PRT-23, 41 | null until post |
| cancelled_by / cancelled_at | int fk employees / timestamp | yes | | BR-PRT-41 | set on posted cancel only |
| cancel_reason | text | yes | 3–500 | BR-PRT-25 | |
| created_by / created_at | fk employees / timestamp | no | | BR-PRT-41 | |
| last_updated_by / last_updated_at | fk employees / timestamp | no | | BR-PRT-41 | draft edits |
| ~~debit_note_amount_paise~~ | — | — | | | DROPPED: the debit note table owns every amount |

- **Keys:** grn_id, po_id, supplier_id, posted_by, cancelled_by, created_by, last_updated_by FKs (no cascade).
- **Indexes:** `po_id` (exists; PO details returns), `supplier_id` (exists; supplier filter), NEW `grn_id`
  (GRN details returns, cap sums), NEW `(status, id desc)` (list filter status, default sort), NEW
  `(created_at desc, id)` (date filter/sort), NEW gin trgm on `pro_number` (list `q`, as `idx_grns_grn_number_trgm`).
  Audit user columns: `no-index` comment (same as the rest of the schema).
- **Status enum:** draft → posted → cancelled; draft → cancelled (BR-PRT-10, 11, 25).

### `purchase_return_items` (changed — reshaped)
| Column | Type | Null | Unit / decimals | Rule | Note |
|---|---|---|---|---|---|
| id | serial pk | no | | | |
| pro_id | int fk purchase_returns | no | | | exists |
| grn_item_id | int fk grn_items | no | | BR-PRT-01, 03 | NEW |
| po_item_id | int fk purchase_order_items | no | | BR-PRT-20 | NEW; copied from the GRN line |
| item_id | int fk item_master | no | | BR-PRT-09 | copied from the GRN line |
| source | enum `purchase_return_source` | no | | BR-PRT-03 | `rejected` `accepted` |
| return_qty | numeric(14,3) | no | item unit (kg/pcs…), 3 decimals, > 0, ≤ 1e9 | BR-PRT-04 | type changed from float |
| uom | text | no | | BR-PRT-04, 09 | copied from PO line (whole-number check) |
| batch_number | text | yes | | BR-PRT-09, 14 | heat no., copied from the GRN line |
| unit_price_paise | bigint | no | paise per unit, no GST | BR-PRT-09 | = PO line rate; server-set |
| gst_percent | numeric(5,2) | no | % | BR-PRT-09 | = PO line GST % |
| hsn_code | text | yes | | BR-PRT-33, 34 | stamped at post from the item; null in draft |
| taxable_paise | bigint | yes | paise | BR-PRT-31 | set at post: round(qty × rate) |
| gst_paise | bigint | yes | paise | BR-PRT-31 | set at post |
| cgst_paise / sgst_paise / igst_paise | bigint | yes | paise | BR-PRT-32 | set at post, per line; BR-PRT-32 |
| location_id | int fk locations | yes | | BR-PRT-14 | accepted lines, set at post: location of the GRN line's original posting |
| unit_cost_paise | bigint | yes | paise | BR-PRT-14 | accepted lines, set at post: that posting's cost |
| ledger_id / cancel_ledger_id | int | yes | | BR-PRT-14, 26 | the `pro` / `pro_cancel` row ids; `no-index` (never filtered; ledger points back by reference) |

- **Keys:** pro_id (no cascade, drafts' lines are deleted by the service on edit), grn_item_id, po_item_id, item_id, location_id.
- **Unique:** `(pro_id, grn_item_id, source)` — BR-PRT-03.
- **Indexes:** `pro_id` (exists), NEW `(grn_item_id, source)` (cap sum per GRN line, BR-PRT-05/06/07/42; joined to
  `purchase_returns.status <> 'cancelled'`), NEW `po_item_id` (FK), NEW `item_id` (FK; comment "no code reads" removed), `location_id` (FK).

### `purchase_debit_notes` (new)
| Column | Type | Null | Unit / decimals | Rule | Note |
|---|---|---|---|---|---|
| id | serial pk | no | | | |
| dn_number | text unique | no | ≤ 16 chars | BR-PRT-30 | `DN/<yy>-<yy+1>/<seq>` e.g. `DN/26-27/12`; doc_type `debit_note`, period = FY key from `financialYearOf` (IST) |
| pro_id | int fk purchase_returns, unique | no | | BR-PRT-29 | exactly one per return |
| debit_note_date | timestamp | no | server time | BR-PRT-30, 33 | print as IST day |
| status | enum `debit_note_status` | no | | BR-PRT-28 | `issued` `cancelled` |
| taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise | bigint | no | paise | BR-PRT-31, 32 | sums of the return lines; total = taxable + GST |
| is_interstate | boolean | no | | BR-PRT-32 | |
| supplier_invoice_id | int fk supplier_invoices | yes | | BR-PRT-33, 44 | NEW; oldest approved bill covering the returned GRN lines, set at post, or later on that bill's approval (supplier-invoice side); a later-approved bill links only if its billed qty includes the returned qty; offset = accepted-lines value; rejected-qty notes link with offset 0; null if none; indexed. Net payable = bill total − sum of `bill_offset_paise` of linked non-cancelled notes |
| bill_offset_paise | bigint | no | paise | BR-PRT-44, 45 | NEW; default 0; value of the accepted lines taken off the linked bill |
| plant_name, plant_address, plant_gstin, plant_state_code | text | no | | BR-PRT-33, 34 | copied from `company_settings` at post, so a later settings edit never rewrites a printed note |
| supplier_name, supplier_address, supplier_gstin | text | no / yes / yes | | BR-PRT-33 | copied from `supplier_master` at post |
| created_by / created_at, cancelled_by / cancelled_at | | | | BR-PRT-41 | |

- **Indexes:** `pro_id` unique (details join), `dn_number` unique (lookup by number); `challan_number` unique on `purchase_returns`. No list of its own.
- Indexes add: `supplier_invoice_id` (FK; bill → its debit notes). Bill no./date for the print are read through `supplier_invoice_id`.

### `purchase_return_events` (new, append-only)
`id`, `pro_id` fk, `action` (`create` `edit` `post` `cancel_draft` `cancel_posted`), `from_status`, `to_status`,
`reason` (nullable, ≤ 500), `actor_id` fk employees, `at`. BR-PRT-41. Index `(pro_id, id)` (details history).
Rows are never edited or deleted.

## Changes to tables owned by other modules
| Table | Change | Owner spec (rule to add there) |
|---|---|---|
| `inventory_ledger` enum `inventory_ref_type` | add value `pro_cancel` (`pro` exists) — BR-PRT-26 | inventory |
| `grn_items` | add `rejected_returned_qty`, `accepted_returned_qty` numeric(14,3) not null default 0 — posted returns only (BR-PRT-19, 38) | grn (BR-PRT-42 also lives there) |
| `grn_items` | partial index `(id) where rejected_qty > 0` — "Awaiting return" (BR-PRT-39) | grn |
| `purchase_order_items` | add `returned_qty` numeric(14,3) not null default 0 (BR-PRT-20, 38) | purchase-order |
| `purchase_orders` | none; status comes from `recomputeReceiptStatus` (BR-PO-10) | purchase-order |
| `supplier_invoices` / `supplier_invoice_lines` | add index on `supplier_invoice_lines.grn_item_id`; on bill approval, link unlinked posted debit notes for its GRN lines (`purchase_debit_notes.supplier_invoice_id`); reads `returnedQtyByGrnItem` | supplier-invoice |

## Stock and money
All stock through `postStock` (only path; item row locked inside it; `blockNegative` for BR-PRT-16).
| Action | Ledger rows | Value |
|---|---|---|
| post, `accepted` line | one row: type `out`, ref `pro`, `referenceId` = return id, `referenceLineId` = return line id, −qty, location + cost of the GRN line's original `grn` / `grn_bypass` posting (found by `referenceLineId` IN the return's grn_item_ids and `referenceType` IN (`grn`, `grn_bypass`), one batched query (PERF-003); index `idx_inventory_ledger_reference_line`), batch no. copied | BR-PRT-17, 18 |
| post, `rejected` line | none (BR-PRT-15); only counters move | — |
| cancel posted, `accepted` line | one row: type `in`, ref `pro_cancel`, same ids, +qty, same location and cost, average as stock-in (BR-GRN-38) | BR-PRT-26 |
| cancel draft | none | — |
Money is integer paise everywhere; line math round half away from zero (BR-PRT-31); row value cap `Number.MAX_SAFE_INTEGER` (BR-PRT-18).
Ledger `unit_cost_paise` is int4: GRN cost above 2,147,483,647 cannot exist, so no extra check.
Post also: `grn_items.<source>_returned_qty += qty`; `purchase_order_items.returned_qty += qty`; if `replacement_expected`
and source accepted, `purchase_order_items.received_qty -= qty` then `recomputeReceiptStatus`. Cancel reverses each.

Loads of GRN lines, PO lines and items use batched `inArray` queries in ascending id order (PERF-005). Cap reads (BR-PRT-05, 06, 42; correction sum rounded to 3 dp before compare): reserved = sum of `return_qty` on non-cancelled returns (drafts + posted) per
`(grn_item_id, source)`, computed from `purchase_return_items`; posted counters on the GRN line are display + BR-PRT-43 only.
Rejected cap = `rejected_qty`; accepted cap = `accepted_qty − sum(grn_corrections.qty)`.

## Volumes and locks
| Table | Rows per year | Hot query | Lock needed |
|---|---|---|---|
| purchase_returns | ~50–200 | list by status/date; by grn_id | post/cancel: `for update` on GRN header first |
| purchase_return_items | ~100–600 | cap sum by `(grn_item_id, source)` | GRN line `for update` before the sum (post and create/edit) |
| purchase_debit_notes | = posted returns | by pro_id | counter row locked by the numbering upsert until commit |
| inventory_ledger | +1 per accepted line | existing | item row `for update` inside `postStock` |
Lock order (BR-PRT-13; create-edit-cancel-draft also start at the GRN header): GRN header → PO → GRN lines + PO lines (ascending id) → item rows (ascending item id) → counters.
Two posts of one return: the loser re-reads the return under the GRN lock and sees `posted` → 409.

## Migration notes
1. `ALTER TYPE inventory_ref_type ADD VALUE 'pro_cancel'` in its own migration step (a new enum value cannot be used in the same transaction).
2. Create enums; convert `purchase_returns.status` text → enum (tables hold no rows; migration asserts `count(*) = 0` and fails if not); add columns; drop `debit_note_amount_paise`; `return_qty` float → numeric(14,3).
3. New tables, indexes, and the two other-module column sets. Backfill: none (all counters start at 0).
4. Rollback of the enum value is not possible; the rest is reversible while no return exists.

## Choices made
Moved to `../assumptions.md` (A-13..A-22) by spec-analyst, pass 2.
| Question | Choice | Source |
|---|---|---|
