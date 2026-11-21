# RFQ, quotes, award and rate contracts — data design

> Written by solution-designer from `../spec.md`. Checked by performance-auditor and security-auditor
> before freeze. Conventions: `backend/CLAUDE.md`, `backend/.claude/reference/`.
> Naming, `serial` ids, `timestamp` (no tz), `bigint` paise, `// no-index:` notes follow
> `backend/src/db/schemas/02_procurement-purchasing.ts`. New file: `02_procurement-rfq.ts`, re-exported in `02_procurement.ts`.
> Audit shorthand: `xBy` = integer FK `employees.id` (no index, who-did-it), `xAt` = timestamp. Qty = `numeric(14,3)`
> (mode number, 3 decimals, upper bound 1,000,000,000 in the API); money = `bigint` paise; GST % = `numeric(5,2)`.
> Calendar dates (due, valid, terminated) = pg `date`, the IST day (api-standards: "today = India date").

## Tables

### `rfqs` (new) — BR-RFQ-05..07, 35..37, 71
| Column | Type | Null | Unit | Rule | Note |
|---|---|---|---|---|---|
| id | serial pk | no | | | |
| rfq_number | text unique | no | `RFQ-{periodKey}-{seq}` | 05 | `allocateDocumentSequence(tx,"rfq",…)`, IST month; never reused |
| status | enum `rfq_status` | no | | Flow | draft, sent, partially_awarded, awarded, closed, cancelled |
| due_date | date | no | IST day | 05 | not before today at create / edit |
| notes | text | yes | max 2000 | 05 | |
| createdBy / createdAt / lastUpdatedBy / lastUpdatedAt | | no | | 05, 71 | |
| sentBy, sentAt | | yes | | 07, 71 | |
| completedAt | timestamp | yes | | 34 | set when status becomes `awarded` |
| closedBy, closedAt, closeReason | | yes | reason 3–500 | 35, 71 | |
| cancelledBy, cancelledAt, cancelReason | | yes | reason 3–500 | 36, 71 | |
- **Indexes:** `idx_rfqs_status (status)` list filter; `idx_rfqs_created_at (created_at desc)` default sort;
  trigram GIN on `rfq_number` and `notes` (list `q`, same as PR/PO).

### `rfq_suppliers` (new) — BR-RFQ-04, 06
`id`, `rfq_id` FK rfqs (cascade no — rows are never deleted after send; draft edit deletes rows), `supplier_id` FK
`supplier_master`, `createdAt`. **Unique** `(rfq_id, supplier_id)` (also serves the `rfq_id` FK lookup). Index
`idx_rfq_suppliers_supplier (supplier_id)` — "RFQs sent to supplier X" and FK. Max 10 rows per RFQ checked by service.

### `rfq_items` (new) — BR-RFQ-01..03, 11, 25, 27, 31, 34, 35
| Column | Type | Null | Unit | Rule | Note |
|---|---|---|---|---|---|
| id | serial pk | no | | | |
| rfq_id | int FK rfqs | no | | 01 | |
| pr_item_id | int FK purchase_request_items | no | | 01, 02 | |
| item_id | int FK item_master | no | | 03 | copied from the PR line |
| qty | numeric(14,3) | no | item uom, 3 dec | 03 | = PR line `requestedQty − issuedQty` at add time; never editable |
| uom | text | no | | 03 | copied from the PR line |
| line_status | enum `rfq_line_status` | no | | 25, 34, 35 | `open`, `awarded`, `dropped` |
| awarded_quote_item_id | int (no FK) | yes | | 25, 31 | the single award; no FK because rfq_items ↔ rfq_quote_items would be circular (CR-07), service checks it belongs to the line; unique where not null |
| po_item_id | int FK purchase_order_items | yes | | 31, 33 | RFQ line → PO line (PO number by join) |
| awardedBy, awardedAt | | yes | | 71 | same value on all lines of one award save |
| award_reason | text | yes | 3–500 | 27 | required when the chosen quote line is not the lowest eligible |
| award_lowest_landed_paise, award_chosen_landed_paise | bigint | yes | paise per item uom | 71 audit | before → after, snapshot at award |
| droppedAt | timestamp | yes | | 11, 35 | set when RFQ closes / cancels, or when the PR line is found cancelled at award |
- **Unique:** `(rfq_id, pr_item_id)`. **Partial unique** `uq_rfq_items_open_pr_item (pr_item_id) where line_status='open'`
  — BR-RFQ-02 enforced by the DB: a PR line is open on at most one RFQ (draft, sent, partially_awarded).
  A PR line stays `pending` while on an RFQ; award turns it `po_draft` and the line `awarded`, so the index is only
  needed for `open`. Cancel / close set lines `dropped`, which frees the PR line.
- **Indexes:** `idx_rfq_items_rfq (rfq_id)` detail + comparison; `idx_rfq_items_item (item_id)` FK + "quoted before";
  `uq_rfq_items_awarded_quote_item (awarded_quote_item_id) where not null` (a quote line is awarded once; quote-awarded lookup); `idx_rfq_items_po_item (po_item_id)` where PO is cancelled → show on RFQ line.

### `rfq_quotes` (new) — BR-RFQ-12..19, 24, 34
| Column | Type | Null | Unit | Rule | Note |
|---|---|---|---|---|---|
| id | serial pk | no | | | |
| quote_number | text unique | no | `SQ-{periodKey}-{seq}` | 31 | counter `rfq_quote`, IST month |
| rfq_id | int FK rfqs | no | | 12 | |
| supplier_id | int FK supplier_master | no | | 12, 13 | must be on `rfq_suppliers` (service check) |
| status | enum `rfq_quote_status` | no | | Flow | draft, submitted, cancelled, not_awarded. "Awarded" is derived from `rfq_items.awarded_quote_item_id` |
| supplier_quote_ref | text | no | max 100 | 14 | |
| quote_date | date | no | not future | 14 | |
| valid_till | date | no | ≥ quote_date | 14 | eligibility `valid_till >= today` is computed, never stored (22) |
| payment_terms_days | integer | no | days 0–365 | 14 | default supplier `defaultPaymentTermsDays` |
| is_late | boolean | no | | 17 | set at submit: submit day (IST) > RFQ due date |
| createdBy / createdAt / lastUpdatedBy / lastUpdatedAt | | no | | 71 | |
| submittedBy, submittedAt | | yes | | 18, 23, 71 | `submittedAt` is the last tie-break (23) |
| cancelledBy, cancelledAt, cancelReason | | yes | 3–500 | 19, 71 | |
- **Partial unique** `uq_rfq_quotes_live (rfq_id, supplier_id) where status in ('draft','submitted')` — BR-RFQ-13 `QUOTE_EXISTS`.
- **Indexes:** `idx_rfq_quotes_rfq_status (rfq_id, status)` comparison + "end of RFQ" sweep (34); `idx_rfq_quotes_supplier (supplier_id)` FK; trigram on `quote_number`.

### `rfq_quote_items` (new) — BR-RFQ-15, 16, 20..23, 26, 31
| Column | Type | Null | Unit | Rule | Note |
|---|---|---|---|---|---|
| id | serial pk | no | | | |
| quote_id | int FK rfq_quotes | no | | 15 | |
| rfq_item_id | int FK rfq_items | no | | 15 | **Unique** `(quote_id, rfq_item_id)`; one row per RFQ line |
| is_quoted | boolean | no | | 15 | false = "not quoted"; the value columns below are then null |
| rate_paise | bigint | yes | paise per item uom, ≥ 1 | 15, 73 | integer only |
| gst_percent | numeric(5,2) | yes | % | 15 | from `SUPPLIER_GST_SLABS`; default supplier price list, else 0 |
| lead_days | integer | yes | days 0–365 | 15 | |
| freight_paise | bigint | yes | paise, whole line, ≤ 1e12 | 15, 30 | default 0 |
| line_value_paise, line_tax_paise | bigint | yes | paise, value ≤ 1e15 (else 400) | 16 | `computeLinePaise` (same function as PO) so PO and quote agree |
| landed_rate_paise | bigint | yes | paise per item uom | 16, 21, 23 | rate + round(freight ÷ qty); stored, cheap to sort |
- **Indexes:** unique above covers `quote_id`; `idx_rfq_quote_items_rfq_item (rfq_item_id)` comparison grid column fill + FK.

### `rate_contracts` (new) — BR-RFQ-40, 43..49
| Column | Type | Null | Unit | Rule | Note |
|---|---|---|---|---|---|
| id | serial pk | no | | | |
| contract_number | text unique | no | `RC-{periodKey}-{seq}` | 40 | counter `rate_contract`, IST month |
| supplier_id | int FK supplier_master | no | | 40 | active at create |
| status | enum `rate_contract_status` | no | | Flow | draft, active, terminated, cancelled. `expired` is computed: active and `valid_to < today` (47) |
| valid_from, valid_to | date | no | IST day | 40 | to ≥ from |
| allowance_percent | numeric(4,2) | no | % 0–20 | 40, 52 | default 0 |
| notes | text | yes | max 2000 | 40 | |
| createdBy / createdAt / lastUpdatedBy / lastUpdatedAt | | no | | 71 | |
| activatedBy, activatedAt | | yes | | 45, 71 | |
| terminated_on | date | yes | IST day | 48 | contract is usable through this day; server default today |
| terminatedBy, terminatedAt, terminateReason | | yes | 3–500 | 48, 71 | |
| cancelledBy, cancelledAt, cancelReason | | yes | 3–500 | 44, 71 | draft only |
- **Indexes:** `idx_rate_contracts_supplier_status (supplier_id, status)` — rate lookup on PO draft and overlap check
  (supplier, status='active'); `idx_rate_contracts_status_valid_to (status, valid_to)` list "ends within 30 days" / expired filter;
  trigram on `contract_number`.

### `rate_contract_items` (new) — BR-RFQ-41, 49, 52
`id`, `contract_id` FK rate_contracts, `item_id` FK item_master, `uom` text (item uom copy), `rate_paise` bigint ≥ 1
(per uom), `gst_percent` numeric(5,2), `agreed_qty` numeric(14,3) null (null = rate-only, 41, 52). **Unique**
`(contract_id, item_id)`. Index `idx_rate_contract_items_item (item_id)` — lookup "contracts for item X" and FK.
No ordered / received column: see Choices D1.

### `purchase_order_items` (changed — owner module purchase-order, change request in `../spec.md` → "Change requests")
| Column | Type | Null | Unit | Rule | Note |
|---|---|---|---|---|---|
| quote_item_id | int FK rfq_quote_items | yes | | 31 | set only by the award; never by `createpo` |
| contract_item_id | int FK rate_contract_items | yes | | 50, 52, 53 | set by the server when the line is priced from a contract |
| contract_rate_paise | bigint | yes | paise per uom | 51, 71 | snapshot of the contract rate when linked (the "before" of an override) |
| rate_override_reason | text | yes | 3–500 | 51 | required when `unit_price_paise <> contract_rate_paise` |
| rate_overrideBy, rate_overrideAt | | yes | | 51, 71 | |
- **Indexes:** `idx_po_items_contract_item (contract_item_id)` — ordered / received qty sum (49, 52) and "PO lines on this contract";
  `idx_po_items_quote_item (quote_item_id)` — FK; award side lookup.
- `purchase_orders` and `pr_po_item_links`: no column change. Freight lines (30) go into `purchase_orders.notes`.
- Other modules: `purchase_request_items` / `purchase_requests` unchanged (no status added; a PR line on an RFQ stays `pending`).
  `getLastRate` (owner: inventory, BR-INV-30) gains the `contract` source and an optional `onDate`; see api.md.

## Stock and money
No `inventory_ledger` posting: RFQs, quotes and contracts move no stock. Stock still enters only by GRN against the PO
(unchanged). Money is integer paise everywhere; rates are paise per item uom; the contract and quote carry no totals.
Ordered qty of a contract line is **computed**: `sum(purchase_order_items.qty)` where `contract_item_id = line` and
PO status in `approved, dispatched, partial_received, fully_received, invoiced, closed` (draft, pending_approval, cancelled
excluded; short-closed = `closed`, full qty stays — 53). Received qty = `sum(received_qty)` over the same lines (49).
% ordered = ordered ÷ agreed (null for rate-only). Cap = `agreed_qty × (1 + allowance_percent/100)`, floored to 3 decimals.

## Volumes and locks
| Table | Rows per year | Hot query | Lock needed |
|---|---|---|---|
| rfqs | ~300 | list by status, newest first | `for update` on the RFQ row for send, award, close, cancel, quote enter / cancel (72) |
| rfq_items | ~1,500 | grid load by `rfq_id`; PR-line pick list left-join `line_status='open'` | PR lines `for update` at RFQ create / add line and at PO create (race with the partial unique) |
| rfq_quotes / items | ~1,200 / ~5,000 | comparison: quotes of one RFQ + items | quotes `for update` (id asc) at award and quote cancel |
| rate_contracts / items | ~60 / ~250 | PO draft: contract for (supplier, item, date) | contract line `for update` (id asc) at PO create, submit, last-level approve; `pg_advisory_xact_lock(supplier_id)` at activate (overlap check, 46) |
| purchase_order_items | existing + ~3,000 | `sum(qty) group by contract_item_id` | covered by the contract-line lock |
Lock order everywhere: RFQ → quotes → PR header → PR lines (id asc) → contract lines (id asc) → sequence counters last (72; PO / SQ numbers allocated just before insert). Contract advisory lock is the two-key form with a namespace constant. Existing indexes confirmed: `idx_po_items_item_id`, `idx_pr_items_pr_id/status/item_id`. Two POs approving past the cap: the
second waits on the contract-line lock, re-sums, gets 409 `CONTRACT_QTY_EXCEEDED`.

## Migration notes
One migration: 4 enums, 7 new tables, 6 columns + 2 indexes on `purchase_order_items`. All new columns nullable, so no
backfill and nothing to roll back. Add permission keys to `src/lib/permissions.ts` (below) before the routes.
Keys: `rfq.view`, `rfq.manage`, `rfq.award`, `contract.view`, `contract.manage`, `contract.override_rate` (+ seed rows per
"Who can do what"). Partial unique indexes use Drizzle `.where(sql\`…\`)`.

## Choices made
Moved to `../assumptions.md` (A-01..A-11) by spec-analyst, 2026-11-20.
| Question | Choice | Source |
|---|---|---|
