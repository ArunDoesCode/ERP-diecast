# Dispatch — data design

> Written by solution-designer from `../spec.md`. Checked by performance-auditor and security-auditor
> before freeze. Conventions: `backend/CLAUDE.md`, `backend/.claude/reference/`.
> Names of sale-order tables (`sale_orders`, `sale_order_lines`, `customers`) and hooks are the real ones from
> sale-order `design/data.md`.
> Benchmarks (read 2026-11-20 in `docs/research/dispatch.md`): ERPNext [delivery note](https://docs.frappe.io/erpnext/user/manual/en/delivery-note),
> [packing slip](https://docs.frappe.io/erpnext/user/manual/en/packing-slip); Odoo [multipack](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/shipping_receiving/setup_configuration/multipack.html);
> SAP B1 [copy from/to](https://help.sap.com/saphelp_sbo92/helpdata/en/44/fd948693202463e10000000a1553f7/content.htm); Zoho [e-way](https://www.zoho.com/in/books/gst/faq/e-way-bill.html).

## Tables

### `delivery_notes` (new)
| Column | Type | Null | Unit / decimals | Rule | Note |
|---|---|---|---|---|---|
| id | serial pk | no | | | ledger `reference_id` |
| dn_number | text | yes | max 16 chars | BR-DSP-17 | `DN/<FY>/<seq>`; null while draft; unique (nulls allowed) |
| status | enum `delivery_note_status` | no | | Flow | `draft`,`posted`,`cancelled` |
| so_id | integer fk sale_orders | no | | BR-DSP-01 | never changes |
| so_number | text | no | | BR-DSP-02 | copied |
| customer_po_number | text | yes | ≤ 50 | BR-DSP-02 | copied |
| customer_id | integer fk customers | no | | BR-DSP-02 | |
| customer_name / customer_address | text | no | | BR-DSP-02 | copied at create, re-copied at post (frozen for print) |
| customer_gstin | text | yes | 15 chars | BR-DSP-02 | null = "unregistered" |
| customer_state_code | text | no | 2-digit GST state code | BR-DSP-02, 23 | copied from `customers.state_code` |
| ship_to_address / ship_to_state_code | text | no | 300 / 2-digit | BR-DSP-02 | `sale_orders.ship_to_address` / `ship_to_state_code`, null there = customer's |
| company_name / company_address / company_gstin / company_state_code | text | yes | 200 / 500 / 15 / 2-digit | BR-DSP-18, 41 | copied from company settings at post (null while draft); the print reads these, never live settings |
| same_state | boolean | no | | BR-DSP-23 | customer_state_code = plant state code; fixed at post |
| source_location_id | integer fk locations | no | | BR-DSP-08 | active, not virtual, not `vendor_premise` (service check) |
| note_date | date | no | IST calendar day | BR-DSP-07 | ≤ today, ≥ SO order date (service check) |
| taxable_paise / gst_paise / value_paise | bigint | no | paise | BR-DSP-19 | Σ lines; drafts hold an indicative value from the SO's current price, overwritten at post |
| eway_required | boolean | no | | BR-DSP-23 | recomputed on every draft save and at post; register and detail read this stored value, "as of last save" for drafts (CR-DSP-4) |
| transport_mode | text, check in (road,rail,air,ship) | yes | | BR-DSP-24 | |
| vehicle_no | text | yes | ≤ 15, normalised upper no spaces | BR-DSP-25 | |
| transporter_id / transporter_name | text | yes | 15 (GSTIN pattern) / ≤ 100 | BR-DSP-24, 25 | |
| transport_doc_no / transport_doc_date | text ≤ 30 / date | yes | | BR-DSP-24 | rail, air, ship |
| distance_km | integer, check 1..4000 | yes | km | BR-DSP-24 | |
| eway_bill_no | text, check `~ '^\d{12}$'` | yes | 12 digits | BR-DSP-24, 25, 26 | |
| eway_bill_date | date | yes | IST day | BR-DSP-25 | ≥ note_date, ≤ today (service check) |
| remarks | text | yes | ≤ 500 | — | |
| posted_by / posted_at | fk employees / timestamptz | yes | | BR-DSP-36 | |
| cancel_reason / cancelled_by / cancelled_at | text ≤ 500 / fk / timestamptz | yes | 3–500 chars | BR-DSP-29, 30 | |
| created_by, created_at, last_updated_by, last_updated_at | as other tables | | | BR-DSP-36 | |

- **Valid-until** (BR-DSP-28) is not stored: computed on read as end of IST day of `eway_bill_date + ceil(distance_km/200)` days. No drift, no index.
- **Keys:** `so_id`, `customer_id`, `source_location_id`, `posted_by`… restrict on delete (nothing is ever deleted, BR-DSP-34).
- **Indexes:** unique `dn_number`; **partial unique** `eway_bill_no` where `status <> 'cancelled' and eway_bill_no is not null` (BR-DSP-26; cancel frees the number); `so_id` (SO screen note list, BR-DSP-38); `customer_id, note_date desc` (register filter by customer); `note_date desc, id desc` (register default sort and date range); `status, note_date desc` (register status filter); partial `note_date` where `status='draft' and eway_required and eway_bill_no is null` (filter "e-way needed but missing", BR-DSP-40); `source_location_id` (FK). Audit who-columns carry the usual `no-index` comment.
- **Status enum:** as Flow. `posted` and `cancelled` never go back; final-state guard is in the service under the row lock.

### `delivery_note_lines` (new)
| Column | Type | Null | Unit / decimals | Rule | Note |
|---|---|---|---|---|---|
| id | serial pk | no | | | ledger `reference_line_id` |
| note_id | integer fk delivery_notes | no | | | |
| so_line_id | integer fk sale_order_lines | no | | BR-DSP-03 | unique with `note_id` |
| item_id | integer fk item_master | no | | BR-DSP-03 | copied from SO line, never changes |
| qty | numeric(14,3), check > 0 | no | item unit; whole for pcs/set | BR-DSP-03, 04, 05 | API max 1,000,000 |
| uom | text | no | | BR-DSP-02 | copied |
| delivery_date | date | no | | BR-DSP-02 | copied from SO line |
| lot_no | text | yes | ≤ 50 | BR-DSP-09 | goes to ledger `batch_number` |
| hsn_code | text | yes | | BR-DSP-18 | copied from item at post; must be set then |
| unit_price_paise | bigint | no | paise per unit | BR-DSP-19 | draft: current SO price; frozen at post |
| gst_percent | numeric(5,2), check in (0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 28, 40) | no | % | BR-DSP-19 | SO line GST % (CR-SO-4); allowed list of BR-SUP-13 / BR-SO-57 |
| taxable_paise / gst_paise | bigint | no | paise | BR-DSP-19 | half up per line, integer math only |
| ledger_out_id | integer fk inventory_ledger | yes | | BR-DSP-12 | set at post; cancel reads the cost from this row |
| ledger_in_id | integer fk inventory_ledger | yes | | BR-DSP-31 | set at cancel |

- **Indexes:** `note_id` (detail, FK); unique `(note_id, so_line_id)`; `so_line_id` (reconciliation: Σ posted qty = SO `delivered_qty`); `item_id` (FK); `ledger_out_id`, `ledger_in_id` (FK).
- Unit cost is NOT stored on the line: it lives only on the ledger row (`inventory.view`, Security table).

### `delivery_note_packages` (new)
| Column | Type | Null | Unit / decimals | Rule | Note |
|---|---|---|---|---|---|
| id | serial pk | no | | | |
| note_id | integer fk delivery_notes | no | | BR-DSP-20 | |
| line_id | integer fk delivery_note_lines | no | | BR-DSP-20 | one line per box |
| package_no | text | no | ≤ 20 | BR-DSP-20 | unique per note |
| qty | numeric(14,3), check > 0 | no | item unit | BR-DSP-20, 21 | Σ per line = line qty at post |
| net_kg / gross_kg | numeric(10,3), check net > 0, gross ≥ net | no | kg, 3 decimals | BR-DSP-20 | API max 50,000 kg |
| lot_no | text | yes | ≤ 50 | BR-DSP-20 | |

- **Indexes:** unique `(note_id, package_no)`; `line_id` (FK, packed-qty sum at post). Rows change only while the note is `draft` (BR-DSP-22, service under note row lock).

### `delivery_note_transport_history` (new)
Pattern of `company_settings_history` (append-only; rows never edited or deleted).
| Column | Type | Null | Rule | Note |
|---|---|---|---|---|
| id | serial pk | no | | |
| note_id | integer fk delivery_notes | no | BR-DSP-27 | |
| field | text | no | BR-DSP-27 | `vehicleNo`,`transporterId`,`transporterName`,`transportDocNo`,`transportDocDate`,`ewayBillNo`,`ewayBillDate`,`distanceKm` (added once with the e-way no) |
| old_value / new_value | text | yes / no | BR-DSP-27 | |
| changed_by, changed_at | fk employees / timestamptz | no | BR-DSP-27 | |
- **Indexes:** `(note_id, id desc)` (history of one note, newest first).

## Changes to tables owned by other modules
| Table | Change | Owner spec | CR |
|---|---|---|---|
| `inventory_ref_type` enum | add `delivery_note`, `delivery_note_cancel` | grn-stock / inventory | CR-INV-1 |
| `company_settings` | add `eway_intra_limit_paise bigint not null default 5000000, check 1..10,000,000,000` | subcontracting (company settings) | CR-SCO-1 |
| `company_settings_history.field` | new value `ewayIntraLimitPaise` (text column, only the TS enum grows); `old_value`/`new_value` hold paise as text | subcontracting | CR-SCO-1, BR-DSP-42 |
| `sale_order_lines` | no change: `delivered_qty numeric(14,3)`, `gst_percent numeric(5,2)` already there; dispatch writes `delivered_qty` only through `applyDelivery(tx, lineId, qty)` (+ on post, − on cancel) | sale-order | BR-SO-09, CR-SO-4 |
| `sale_orders` | PERF-05: existing indexes are `(status, created_at desc)` and `(order_date desc)`; dispatch needs `(status, order_date)` for the pending list (confirmed SOs by SO date): change request to add it. `sale_order_lines(so_id)` is served by the `(so_id, item_id, delivery_date)` unique prefix, no CR. Otherwise no change: `close_kind` (manual / fully_delivered), `ship_to_address`, `ship_to_state_code` already there. Dispatch calls `closeFullyDelivered(tx, soId, actorId)` (BR-DSP-15) and `reopenAfterDeliveryCancel(tx, soId, actorId)` (BR-DSP-32), both after taking `sale_orders for update` | sale-order | CR-SO-1, 2, 3 |
| SO reservations | posting a note lowers the SO's reservations through `applyDelivery` (BR-SO-58); cancelling a note does not restore them (a re-run of the explosion rebuilds them) | sale-order | BR-SO-58 |
| explosion out-of-date (CR-SO-5) | no call needed: `applyDelivery` bumps `sale_orders.need_version`, so the snapshot reads as out of date (derived, BR-SO-38). Dispatch owns no snapshot column | sale-order | CR-SO-5, BR-DSP-14 |
| permissions seed | keys `dispatch.view`, `dispatch.manage`, `dispatch.cancel` + role seed | auth-setup | spec "Who can do what" |

## Stock and money
Through `stockPostingRepository.postStock` (locks the item, checks the location, `blockNegative`; `docs/modules/inventory.md`). Never a direct edit of `currentStock`.
| Action | Ledger rows | Qty | Cost |
|---|---|---|---|
| post note | per line: type `out`, ref `delivery_note`, `reference_id` = note id, `reference_line_id` = line id, `batch_number` = lot, `notes` = DN number | −qty (ledger stays double precision; line qty cast) | item average now; average unchanged (BR-GRN-39, 44) |
| cancel posted note | per line: type `in`, ref `delivery_note_cancel`, same location, same ids, lot | +qty | `unit_cost_paise` of `ledger_out_id`; average recomputed by BR-GRN-38 |
| draft save / draft cancel / transport update | none | | |
Money is integer paise; `taxable = round_half_up(qty_milli × price / 1000)`, `gst = round_half_up(taxable × pct / 100)` in bigint math (reuse `lib/money.ts`), no float. Ledger average cost never reaches note responses.

## Volumes and locks
| Table | Rows per year | Hot query | Lock needed |
|---|---|---|---|
| delivery_notes | ~10,000 (30–40/day) | register by date; pending list | note row `for update` on post, cancel, draft edit, transport update |
| delivery_note_lines | ~30,000 | detail; reconcile by `so_line_id` | — (parent locked) |
| delivery_note_packages | ~100,000 | detail | — (parent locked) |
| transport_history | ~5,000 | one note | — |
| inventory_ledger | +30,000 | existing | item row (inside `postStock`) |
| document_number_counters | 2 rows per FY (`DN`) | allocator | counter row, held to end of tx |

Lock order, always the same, to avoid deadlock with two posts, two cancels, or a post against an SO hold / close / edit:
1. `sale_orders` row `for update` (status checks BR-DSP-11, 15, 32) — sale-order's hold / close / edit / cancel paths must lock the header first too.
2. `sale_order_lines` rows of the lines on the note, ascending id (open-qty re-check BR-DSP-10; `applyDelivery` writes `delivered_qty`).
2b. the SO's `sale_reservations` rows (unreleased, by id) that `applyDelivery` lowers (PERF-03), after the lines.
3. the `delivery_notes` row (status guard: second post or second cancel → 409, BR-DSP-16, 33).
4. `item_master` rows of all items on the note, ascending id, locked up front before the posting loop on post and cancel (PERF-02); then `postStock` re-locks them harmlessly ( BR-GRN-42; a note with two SO lines of one item locks it once and posts the two rows in line order).
5. `document_number_counters` row last (post only), so the series lock is held shortest.
Reads: the pending list takes stock for a whole page in one query (`inArray` of item ids over the item-location index), with open qty > 0 filtered in SQL starting from confirmed SOs (PERF-01); detail loads lines, packages and history in batched queries (PERF-04).
Draft save and transport update lock the note row only (step 3), reading the SO unlocked.
BR-DSP-10: open-qty check first outside the lock (→ 400 when already over) and again under steps 1–2 (→ 409 when it lost a race). The number is allocated inside the post transaction, so a rollback gives it back; a cancelled posted note keeps its number (BR-DSP-17).

## Migration notes
1. Enum values `delivery_note`, `delivery_note_cancel` added in their own migration (`ALTER TYPE … ADD VALUE` cannot be used in the transaction that adds it). Not reversible.
2. New enum `delivery_note_status`, four tables, indexes, checks.
3. `company_settings.eway_intra_limit_paise` with default: existing row gets 5,000,000, no backfill.
4. Seed permissions and roles (ow, bo, fs get view and manage; ow gets cancel). No existing rows to backfill in dispatch tables.
5. Add to the stock reconciliation check: `sale_order_lines.delivered_qty` = Σ qty of `posted` note lines of that line (BR-GRN-41 style).

## Choices made
Moved to `../assumptions.md`.
