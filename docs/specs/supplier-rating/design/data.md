# Supplier rating — data design

> Written by solution-designer from `../spec.md`. Checked by performance-auditor and security-auditor
> before freeze. Conventions: `backend/CLAUDE.md`, `backend/.claude/reference/`. Max 150 lines.

## Tables
**No new table, no new column.** The rating is computed live (BR-SRT-01); nothing is stored. Every rule reads
columns that already exist. Existing tables are read only; none is owned-and-changed here.

### Source columns read (all existing)
| Rule | Table.column | Type | Unit / decimals | How it is used |
|---|---|---|---|---|
| 01, 02 | all timestamps below | `timestamp` (no tz, stored UTC) | IST day = `(ts at time zone 'UTC' at time zone 'Asia/Kolkata')::date` | one SQL expression for every date compare; window start = today(IST) − 12 months + 1 day |
| 03, 04, 16 | `purchase_orders.status` | `po_status` | | counts only `dispatched, partial_received, fully_received, invoiced, closed`; the rest are ignored |
| 05, 06 | `purchase_orders.expected_delivery_date` | timestamp, null | IST day | due date (never overwritten, so it is the original). Null = line left out and counted as `noDueDateCount` (BR-SRT-32) |
| 05, 27 | `purchase_orders.revised_delivery_date` | timestamp, null | IST day | shown only, never compared |
| 09, 10 | `purchase_orders.short_closed`, `closed_at` | boolean, timestamp | IST day | short-closed flag and close date |
| 16 | `purchase_orders.created_at` | timestamp | IST day | "PO date" for price variance (`created_at`; no separate sent-date column) |
| 03, 07 | `purchase_order_items.qty` | double precision | item UOM, up to 3 decimals | ordered qty; compared as `round(qty::numeric, 3)` |
| 11, 17, 19 | `purchase_order_items.unit_price_paise` | bigint | paise per UOM unit | PO rate; money stays integer, products computed in `numeric`, never float |
| 18 | `purchase_order_items.uom` | text | | must equal `item_master.uom` for the standard-rate reference, or the previous line's `uom` for the fallback |
| 07, 11 | `grn_items.received_qty`, `rejected_qty` | double precision | item UOM, 3 decimals | arrived = `received_qty`, from any GRN including draft, dated by the GRN received date; `rejected_qty` is the rejected part. Corrections never change these, so BR-SRT-14 holds by itself |
| 07, 12, 13 | `grn_items.qa_status`, `is_qa_bypassed` | text, boolean | | arrival for completion = any GRN line (draft included) by `received_date`, regardless of QA status (BR-07); draft GRNs are excluded only from rejection %; rejection set = decided only: `qa_status in ('passed','failed')` and not bypassed (BR-12); `waived`, bypassed and `pending` lines are not decided and are out of rejection % and the 5-line minimum (BR-13); waived/bypassed lines are counted as not inspected with their `rejected_qty` summed (BR-13) |
| 07, 11 | `grns.received_date`, `grns.status`, `grns.po_id` | timestamp, enum | IST day | arrival date; `draft` GRNs count for arrival but are excluded from rejection %; GRNs without a PO are ignored |
| 17 | `item_master.standard_rate_paise`, `uom` | bigint, text | paise per UOM unit | reference rate; `0` means "none" (column default 0, API enforces > 0 on edit) |
| 17 | previous sent PO line of the same supplier and item | `purchase_order_items` + `purchase_orders` | paise | fallback reference: latest earlier line by (`purchase_orders.created_at`, line id) with a status in the list above |
| 26 | `supplier_master.is_active`, `name` | boolean, text | | list filter and default sort |
| 30 | SCO tables (`subcontracting_*`) | | | never read, so BR-SRT-30 holds by construction |

### Derived values (computed in SQL, returned, never stored)
| Name | Formula | Rule | Type returned |
|---|---|---|---|
| line completion date | min IST arrival date where running sum of `received_qty` over all GRN lines (any QA status, draft included) of that PO line, ordered by (`received_date`, `grns.id`, `grn_items.id`), reaches ordered qty | 07 | date |
| line judgement | complete → completion date; short-closed (arrived < ordered, PO `short_closed`) → `closed_at` date, late if after due, on time otherwise; else open → due + 1 day (only if ≤ today) | 08, 09, 10 | date + `on_time` / `late` |
| days late | judgement date − due date (≥ 1 when late), open lines count to today | 06, 08 | integer days |
| on-time % | `on_time lines * 1000 / judged lines`, rounded half up | 10 | integer tenths of a percent (800 = 80.0 %) |
| rejection % | `Σ rejected × rate * 1000 / Σ received_qty × rate` (non-draft GRNs, decided lines only), rounded half up | 11 | integer tenths |
| price variance % | `Σ (rate − ref) × qty * 1000 / Σ ref × qty`, rounded half away from zero | 19 | signed integer tenths |
| score | `round_half_up((on_time_tenths + (1000 − rejection_tenths)) / 20)`, from the displayed 1-decimal values so the drill-down reproduces it | 21 | integer 0–100 |
| label | ≥ 80 good, ≥ 60 watch, else poor; null with no score. No score unless both on-time and rejection have data (BR-36); the 5-line minimum applies to the window card and list only, not to trend months (BR-28) | 22, 24, 36 | enum string |
| counts | notInspectedLines, notInspectedRejectedQty (3-decimal qty per line UOM, summed as a string list per UOM never added across UOMs; shown as count + per-line qty), shortClosedLateCount, noDueDateCount, judged lines, decided GRN lines, bypassed lines, lines with rejects, price lines compared / not compared | 13, 15, 18, 22 | integers |

## Indexes
Existing and used: `idx_po_items_po_id`, `idx_po_items_item_id` (previous-rate fallback), `idx_grn_items_po_item_id`,
`idx_grn_items_grn_id`, `idx_grns_po_id`, `idx_purchase_orders_supplier_id`, `idx_purchase_orders_status`.
`supplier_master.is_active` stays unindexed (low-card, repo convention, ~10–50 rows).

New (one migration, both are plain btree, `create index`, no lock-heavy backfill at this size):
| Index | Query that needs it |
|---|---|
| `idx_purchase_orders_supplier_created_at` on `purchase_orders (supplier_id, created_at)` | supplier card / lines / trend: one supplier's POs in order; previous-PO price fallback (latest earlier PO per supplier + item) |
| `idx_grns_received_date` on `grns (received_date)` | rejection window: GRNs received in the last 12 months across all suppliers (list endpoint) |

## Stock and money
No `inventory_ledger` posting, no write at all. Money is integer paise end to end; the only products
(`qty × paise`) are done in Postgres `numeric` and divided once at the end. No float leaves the API: percentages
are integer tenths, money is integer paise, quantities are strings with 3 decimals (`"1000.000"`).

## Volumes and locks
| Table | Rows per year (plant scale: 10–50 suppliers) | Hot query | Lock needed |
|---|---|---|---|
| `purchase_order_items` | ~3,000–8,000 | list: one CTE over all sent lines; card: same filtered by supplier | none |
| `grn_items` | ~4,000–10,000 | running sum per PO line (window function) | none |
| `grns` | ~2,000–5,000 | window range scan | none |

- **List = one statement, no N+1:** CTE `lines` (sent PO lines + running arrival sum) → CTE `judged` (one row per
  line with judgement date and verdict) → CTE `grn_lines` (decided passed/failed lines whose GRN received date is in the window or month, with value; not-inspected lines kept apart for the counts) → CTE `price`
  (line, reference, source) → `group by supplier_id` joined to `supplier_master`; filter, sort, limit/offset applied
  on the grouped result. The total is a plain count on `supplier_master` with the filters, run with `Promise.all`.
  Estimate: scanning 5 years of lines (~40k rows) is under 100 ms in Postgres; the `lines` CTE has a floor: POs created on/after window start − 12 months, OR with any GRN line
  received on/after window start (uses `idx_grns_received_date`), OR still open past due / short-closed (so an old PO
  completed inside the window is still found). Revisit above ~500k lines.
- **Trend:** the same CTEs for one supplier, `group by to_char(judgement month)` over a generated 12-month series
  (left join, so empty months return nulls). One statement, 12 rows.
- **Read consistency:** each endpoint is one SQL statement, so one snapshot; no `for update`, no transaction needed.
  A GRN posted a minute ago shows on the next read (BR-SRT-01).
- No cache and no materialized view (BR-SRT-01: no stored score).

## Migration notes
One migration: the two indexes above (`bun run db:generate`). No backfill, rollback = drop the indexes.
Permission and screen are catalog entries, not migrations (`backend/src/lib/permissions.ts`, applied by
`syncCatalog` + `seedGrants` at start, both idempotent):
- permission `supplier.rating.view` (module `supplier`, label "View supplier rating"), added to `PERMISSIONS`;
- `SEED_GRANTS`: `owner` and `back_office` get it; `super-admin` bypasses; nobody else (BR-SRT-29, spec table);
- screen `supplier-ratings`, path `/supplier-ratings`, key `supplier.rating.view`, label "Supplier rating",
  group "Procurement", sort order 145 (after Suppliers = 140).
Existing databases get the grant on the next start because `seedGrants` only inserts missing grants and never
removes any (BR-AUTH-21/24). A grant the owner later removes by hand is re-inserted on the next start (known
`seedGrants` behaviour); no extra work here.

Changes to tables owned by other modules: none (suppliers, purchase-order, grn read only). Spec change needed in
`auth-setup` is only the new key + seed grant row (permission catalog), listed above.

## Choices made
Technical choices not asked of the owner. spec-analyst moves these rows into `../assumptions.md`.
| Question | Choice | Source |
|---|---|---|
| — | moved to `../assumptions.md` (A-02, A-03, A-06, A-07, A-10, A-13, A-15..A-21) | — |
