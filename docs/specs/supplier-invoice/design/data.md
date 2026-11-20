# Supplier invoice — data design

> Written by solution-designer from `../spec.md`. Checked by performance-auditor and security-auditor
> before freeze. Conventions: `backend/CLAUDE.md`, `backend/.claude/reference/`. Max 150 lines.
> Ids are `serial` (as every existing table). Qty = `numeric(14,3)`, read in the service as whole thousandths
> (`toMilli`, BigInt for qty × rate) — no float. GST % = integer basis points (18% = 1800; slab 0.1% = 10).

## Tables

### `supplier_invoices` (changed — table exists from BR-PO-15, `supplier_payments` already points at it)
| Column | Type | Null | Unit / decimals | Rule | Note |
|---|---|---|---|---|---|
| id | serial pk | no | | | kept |
| our_number | text unique | no | `SINV-<YYYY-MM>-<seq>` | 11 | `allocateDocumentSequence(tx,"SINV")` as POs; old rows backfilled `LEGACY-<id>` |
| invoice_number | text | no | 1–16 chars A–Z 0–9 - / | 05 | trimmed + upper-cased by service; CHECK `~ '^[A-Z0-9/-]{1,16}$'` on non-legacy |
| invoice_date | date | no | IST calendar day | 07 | was `timestamp`; migrated with `AT TIME ZONE 'Asia/Kolkata'` |
| fy | text generated stored | no | `26-27` (Apr–Mar) | 06 | from `invoice_date`; same format as `financialYearOf()`; edits re-derive it |
| po_id | integer fk | no | | 01 | was null; all old rows have it |
| supplier_id | integer fk | no | | 01 | copied from PO |
| status | enum `supplier_invoice_status` | no | draft, blocked, approved, cancelled, legacy | Flow | default `draft` |
| billed_amount_paise | bigint | no | paise | 10 | kept; = printed bill total |
| printed_taxable_paise, printed_cgst_paise, printed_sgst_paise, printed_igst_paise | bigint | no | paise ≥ 0 | 10 | default 0 (old rows) |
| taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise | bigint | no | paise | 13, 15 | computed, sums of lines; ≤ MAX_SAFE_INTEGER (36) |
| tax_type | enum `cgst_sgst`,`igst`,`none` | yes | | 14, 16 | set on every save; `none` = unregistered supplier |
| supplier_gstin, supplier_state_code, plant_state_code | text | yes | 15 / 2 / 2 chars | 14, 18 | snapshot at submit |
| reverse_charge, itc_ineligible | boolean | no | | 17 | default false; no effect |
| payment_terms_days | integer | no | days | 28 | snapshot of PO terms |
| due_date | date | yes | IST day | 28 | invoice_date + terms; null on old rows |
| payment_status | text | no | `unpaid` | 28 | kept, stays `unpaid` |
| price_tol_bp_used, weight_tol_bp_used | smallint | yes | bp (50 = 0.5%) | 23, 32 | stored on submit with the result |
| submitted_by / _at | fk employees / timestamp | yes | | 23 | |
| released_by / _at / release_reason | fk / timestamp / text(500) | yes | | 25 | |
| cancelled_by / _at / cancel_reason | fk / timestamp / text(500) | yes | | 26 | |
| created_by, created_at, updated_at | fk / timestamp | no | | 35 | `match_status` column dropped (replaced by `status`) |

- **Keys:** po_id → purchase_orders, supplier_id → supplier_master, all `*_by` → employees (no cascade).
- **Indexes:** `uq_supplier_invoice_live_number` unique (supplier_id, invoice_number, fy) WHERE status in
  (draft, blocked, approved) — BR-06 (old `uq_supplier_invoice_number` dropped; legacy rows are excluded from the
  index and checked by the service, see Choices D1/D2). `idx_sinv_po_id` (po_id): PO coverage, billable qty.
  `idx_sinv_supplier_id` (FK). `idx_sinv_created` (created_at desc, id desc): default list sort (PERF-03). `idx_sinv_status_date` (status, invoice_date desc, id desc): list chips and default
  sort. `idx_sinv_due_open` (due_date) WHERE status='approved': overdue chip and sort. `idx_sinv_created_by` not
  added (audit, see no-index rule). Trigram GIN on `our_number` and `invoice_number`: list search BR-37
  (supplier name and PO number trigram indexes already exist).
- **Status enum:** `draft, blocked, approved (shown "Payable"), cancelled, legacy` (read-only, old rows).
- **Overdue** is not stored: `status='approved' and due_date < today(IST)` (BR-28).

### `supplier_invoice_lines` (new)
| Column | Type | Null | Unit / decimals | Rule | Note |
|---|---|---|---|---|---|
| id | serial pk | no | | | |
| invoice_id | integer fk | no | | 01 | on delete cascade (draft delete only) |
| line_no | smallint | no | | | order on paper |
| kind | enum `item`,`charge` | no | | 08, 09 | |
| grn_item_id | integer fk | yes | | 01, 02 | item lines only; CHECK kind='item' ⇔ not null |
| charge_type | enum freight, packing, tooling, other | yes | | 09 | charge lines only |
| description | text | yes | ≤ 200 chars | 09 | charge lines |
| uom | text | yes | unit code | 22 | snapshot of the PO line unit (decides weight tolerance) |
| qty | numeric(14,3) | yes | unit of line, 3 decimals, > 0, ≤ 1e9 | 08 | item lines |
| rate_paise | bigint | yes | paise per unit, ≥ 1 | 08 | item lines |
| gst_bp | integer | no | bp from slab list | 08, 09 | |
| taxable_paise | bigint | no | paise ≥ 1 | 09, 13 | item: round(qty × rate); charge: typed |
| cgst_paise, sgst_paise, igst_paise | bigint | no | paise | 15 | each rounded half-up per line |
| po_rate_paise, po_gst_bp, billable_qty | bigint, integer, numeric(14,3) | yes | paise, bp, unit | 21, 22, 40 | snapshot at submit for the stored result |
| below_po_rate | boolean | no | | 21 | default false |

- **Keys:** grn_item_id → grn_items (no cascade); unique (invoice_id, grn_item_id) WHERE grn_item_id is not null
  (BR-01 "at most once").
- **Indexes:** `idx_sinv_lines_grn_item` (grn_item_id): billable-qty sum per GRN line (hot query, BR-02/03/30).
  `idx_sinv_lines_invoice` (invoice_id): detail, FK.

### `supplier_invoice_mismatches` (new) — the stored match result (BR-23, 24, 39)
| Column | Type | Null | Unit | Rule | Note |
|---|---|---|---|---|---|
| id | serial pk | no | | | |
| invoice_id | integer fk | no | | 23 | cascade; rows deleted on back-to-draft (24) |
| line_id | integer fk | yes | | 39 | null for tax, total |
| check | enum qty, price, tax, tax_rate, total, charge | no | | 19–22, 40, 41 | |
| expected, billed | bigint | no | per `unit` | 23 | whole numbers only |
| unit | enum paise, milli_qty, bp | no | | | milli_qty = thousandths of the line unit |
| head | text | yes | cgst, sgst, igst | 19 | which tax head |
- **Indexes:** (invoice_id) — FK, detail read.

### `supplier_invoice_history` (new) — append-only (BR-35)
| Column | Type | Null | Rule | Note |
|---|---|---|---|---|
| id | serial pk | no | | |
| invoice_id | integer fk | yes | 35 | on delete SET NULL: a deleted draft keeps its history |
| our_number | text | no | 35 | snapshot, survives delete |
| action | enum create, edit, submit, back_to_draft, release, cancel, delete | no | 35 | |
| from_status, to_status | invoice status | yes | 35 | |
| reason | text(500) | yes | 25, 26 | |
| detail | jsonb | yes | 25 | mismatch list at release / submit result |
| created_by, created_at | fk employees, timestamp | no | 35 | |
- **Indexes:** (invoice_id, id desc) detail read; FK.

### `company_settings` (changed — owner: subcontracting spec, D-017; edit listed in "Changes elsewhere")
`price_tolerance_bp integer not null default 0`, `weight_tolerance_bp integer not null default 50` (seed: price 0%, weight 0.5%), both CHECK
0–1000 (0–10%, 2 decimals) — BR-32. Changes write `company_settings_history` rows, field `priceToleranceBp` /
`weightToleranceBp`, old → new as text.

## Stock and money
No `inventory_ledger` posting: an invoice never moves stock (the GRN already did). Money columns are integer paise.
Line value = round(qty_milli × rate / 1000) half-up in BigInt; tax head = round(taxable × gst_bp / 10000), CGST and
SGST each at gst_bp/2 (`round(taxable × gst_bp / 20000)`); any result above MAX_SAFE_INTEGER → 400 (BR-36).
Price check `rate × 10000 > po_rate × (10000 + price_tol_bp)` in BigInt (BR-21).

## Changes to other modules' tables
| Table | Change | Owner spec |
|---|---|---|
| `company_settings` | two tolerance columns above; history field names | subcontracting (D-017) — extend BR-SCO-09/29 |
| `purchase_orders` | no new column; `invoiced_by/at` now set by the invoice service (approver, time) and nulled on revert | purchase-order BR-PO-15/21 |
| `grn_items`, `purchase_order_items` | none. Returned qty is read through one repository function `returnedQtyByGrnItem(ids, tx)` owned by purchase-returns, so I do not care if it is a column or a sum | purchase-returns |
| `purchase_debit_notes` (purchase-returns, new) | owns nullable `supplier_invoice_id` fk → `supplier_invoices.id` (+ index, `status`, `total_paise`). On approval (submit clean or release) the invoice service links unlinked posted debit notes whose returned GRN lines the bill covers, only when billed qty includes the returned qty (BR-31) | purchase-returns |
| `supplier_payments` | none; FK stays | — |
| `types/grn.types.ts` | add `WEIGHT_UNITS = ["kg","g","tonne"]` next to `WHOLE_NUMBER_UNITS` (+ frontend copy and contract test) | grn |

## Volumes and locks
| Table | Rows per year | Hot query | Lock needed |
|---|---|---|---|
| supplier_invoices | ~1,500 (≈120 bills a month) | list by status/date; dup check | `for update` on the invoice row on every state change (BR-34) |
| supplier_invoice_lines | ~6,000 (≈4 per bill) | sum(qty) of live lines per grn_item_id | `for update` on the GRN lines of the bill, ascending id |
| mismatches / history | ~3,000 / ~8,000 | by invoice_id | none (append, delete-with-invoice) |
Lock order (D5, BR-SINV-34): invoice row (not on create) → GRN header(s) asc → PO → GRN lines asc → debit-note rows (link on approval) → counter (create only).
GRN correction uses the same GRN header → PO → line order and only reads invoice lines after it holds the line lock. Purchase-returns posting uses the same order (GRN header → PO → GRN lines); submit re-reads returned qty after the line lock (PERF-02). Both take GRN
header, then PO, then line, and correction never locks an invoice, so there is no cycle. The line lock is what serialises "bill 980 kg" against "correct 30 kg" (BR-30).

## Migration notes
1. Enum `supplier_invoice_status`; add new columns with defaults; backfill old rows: `status='legacy'`,
   `our_number='LEGACY-'||id`, `payment_status` kept, `invoice_date`/`due_date` to `date` (IST), totals = billed amount.
2. Drop `uq_supplier_invoice_number` and `match_status`; add live partial unique, generated `fy`, indexes, new tables.
3. Backfill (PERF-01): `supplier_id` from the PO, `payment_terms_days` from the PO (default 0), legacy `created_by` = PO `invoiced_by`
   (else PO `created_by`), `created_at` kept; abort the migration if any row has no PO or supplier.
4. `po_id` set NOT NULL (pre-check: no null rows; abort if any). Not reversible without data loss on the dropped column.

## Choices made
Moved to `../assumptions.md` by spec-analyst.
| Question | Choice | Source |
|---|---|---|
