# API standards — data design (index plan, money columns)

> One row per `idx-fk` (72) and `idx-filter` (35) finding of the 2026-11-18 baseline. No table is added.
> Rules: `../spec.md` BR-STD-20..23, 39, 40, 43. Conventions: `backend/CLAUDE.md`, `docs/specs/db-migrations.md`.

## How a decision is recorded
- **index** → add the index in the table's `pgTable` extras in `backend/src/db/schemas/`, name as given.
- **exempt** → put `// no-index: <tag> <free text>` at the end of the column's line (or on the line above it) in
  the schema file. One comment covers both rules for that column.
- Totals: 107 findings = 20 findings → index (17 new indexes) + 87 findings → exempt (87 findings = 84 columns get a comment):
  `audit` 52, `covered` 13, `tiny` 10, `low-card` 8, `pk-join` 1.

Exemption tags (BR-STD-40). The reason must start with exactly one of them:
| Tag | Meaning | Refused when |
|---|---|---|
| `audit` | who-did-it column (name ends in `_by`, points to `employees`); read only by joining to the employee key | growth table and the column is not a `_by` column |
| `tiny` | static or config table, under about 100 rows | growth table |
| `covered:<index name>` | every query also gives the leading column(s) of that index | the named index does not exist in the schema files |
| `low-card` | a few distinct values; an index would not be used | — |
| `pk-join` | only joined toward the parent's primary key; the parent is never deleted | growth table |

Growth tables (rows grow with every document): `inventory_ledger`, `purchase_request_items`,
`purchase_order_items`, `grn_items`, `subcontracting_order_items`, `sco_challan_lines`,
`subcontracting_grn_items`, `approval_requests`, `approval_trails`.

The developer adds to `backend/scripts/standards-check.ts`: read the comment from the raw (unmasked) source;
skip `idx-fk` and `idx-filter` for that column; one finding each for an empty reason, an unknown tag, a
`covered:` index that does not exist, and a refused tag; print `exempt: <n>` and the count per tag under "Notes".

## New indexes (17)
| # | Table | Column(s) | Index name | Clears | Query that needs it |
|---|---|---|---|---|---|
| 1 | role_permissions | permission_key | idx_role_permissions_permission_key | fk + filter | `listRoleKeysByKeys`; cascade when a permission key is removed |
| 2 | refresh_tokens | employee_id | idx_refresh_tokens_employee_id | fk + filter | `deleteRefreshTokensByEmployee`; cascade from employees |
| 3 | subcontracting_order_items | sco_id | idx_sco_items_sco_id | fk + filter | `findLines`, delete lines of a draft SCO |
| 4 | qa_tests | grn_item_id | idx_qa_tests_grn_item_id | fk | FK check when GRN lines are deleted (draft GRN delete) |
| 5 | purchase_returns | po_id | idx_purchase_returns_po_id | fk | document link: returns of a PO |
| 6 | purchase_returns | supplier_id | idx_purchase_returns_supplier_id | fk | document link: returns of a supplier |
| 7 | purchase_return_items | pro_id | idx_purchase_return_items_pro_id | fk | lines of a return (header → lines) |
| 8 | supplier_invoices | po_id | idx_supplier_invoices_po_id | fk | invoice of a PO |
| 9 | supplier_bank_details | supplier_id | idx_supplier_bank_details_supplier_id | fk | bank details of a supplier |
| 10 | supplier_payments | invoice_id | idx_supplier_payments_invoice_id | fk | payments of an invoice |
| 11 | inventory_ledger | reference_type, id | idx_inventory_ledger_reftype_id | filter | `listInventoryMovements` with a `referenceType` filter and the default ordering (`assetRepository.ts:423–424`, `:455` `orderFn(sortCol), asc(id)`, default sort column `id`, `:408–413`): `WHERE reference_type = $1 ORDER BY id LIMIT n`, read straight from the index, either direction; also its count query (`:458`). A chosen sort (created date, type, quantity) uses the index for the filter, then sorts |
| 12 | grns | status, id | idx_grns_status_id | filter | GRN list with a `status` filter and the default ordering (`grnRepository.ts:546`, `:566` `orderFn(sortCol), asc(grns.id)`, default sort column `grns.id`, `:534–537`): `WHERE status = $1 ORDER BY id LIMIT n`, either direction; also its count query (`:569`). `received_date` is not in the index: it is nullable (`02_procurement-purchasing.ts:450`) and only one of four sort options |
| 13 | approval_requests | policy_id | idx_approval_requests_policy_id | fk | growth table, no tag fits; requests of a policy |
| 14 | subcontracting_order_items | raw_item_id | idx_sco_items_raw_item_id | fk | growth table, no tag fits; where-used of an item |
| 15 | subcontracting_order_items | service_id | idx_sco_items_service_id | fk | growth table, no tag fits; where-used of a service |
| 16 | subcontracting_order_items | finished_item_id | idx_sco_items_finished_item_id | fk | growth table, no tag fits; where-used of an item |
| 17 | sco_challan_lines | item_id | idx_sco_challan_lines_item_id | fk | growth table, no tag fits; where-used of an item |

Not added: a single-column index on `subcontracting_orders.status`. Nine values; the list is served by
`idx_sco_vendor_status` (vendor given) and `idx_sco_created_at` (newest first). Tag `low-card`.

## idx-fk findings (72)
| Table | Column | Decision | Index name | Reason |
|---|---|---|---|---|
| roles | created_by | exempt | — | `audit` |
| role_permissions | permission_key | index | #1 | filtered and cascaded |
| role_permissions | granted_by | exempt | — | `audit` |
| screens | permission_key | exempt | — | `tiny` |
| refresh_tokens | employee_id | index | #2 | delete by employee |
| refresh_tokens | created_by | exempt | — | `audit` |
| document_number_counters | created_by | exempt | — | `audit` |
| document_number_counters | last_updated_by | exempt | — | `audit` |
| approval_policies | created_by | exempt | — | `audit` |
| approval_policies | last_updated_by | exempt | — | `audit` |
| approval_requests | policy_id | index | #13 | growth table: `pk-join` is refused |
| approval_requests | current_approver_employee_id | exempt | — | `covered:idx_approval_requests_status_employee` (status always given) |
| approval_requests | requested_by | exempt | — | `audit` |
| approval_trails | action_by | exempt | — | `covered:idx_approval_trails_request_id` (always with request_id; under 10 rows per request) |
| item_master | created_by | exempt | — | `audit` |
| item_master | last_updated_by | exempt | — | `audit` |
| service_master | created_by | exempt | — | `audit` |
| service_master | last_updated_by | exempt | — | `audit` |
| locations | created_by | exempt | — | `audit` |
| locations | last_updated_by | exempt | — | `audit` |
| inventory_ledger | created_by | exempt | — | `audit` (largest table: an unused index costs every posting) |
| machines | created_by | exempt | — | `audit` |
| machines | last_updated_by | exempt | — | `audit` |
| purchase_requests | requested_by | exempt | — | `audit` (no "my PRs" filter exists) |
| purchase_requests | approved_by | exempt | — | `audit` |
| purchase_requests | cancelled_by | exempt | — | `audit` |
| purchase_request_items | cancelled_by | exempt | — | `audit` |
| purchase_orders | approved_by | exempt | — | `audit` |
| purchase_orders | created_by | exempt | — | `audit` |
| purchase_orders | confirmed_by | exempt | — | `audit` |
| purchase_orders | closed_by | exempt | — | `audit` |
| purchase_orders | cancelled_by | exempt | — | `audit` |
| purchase_orders | invoiced_by | exempt | — | `audit` |
| po_communications | sent_by | exempt | — | `audit` |
| subcontracting_orders | approved_by | exempt | — | `audit` |
| subcontracting_orders | created_by | exempt | — | `audit` |
| subcontracting_orders | last_updated_by | exempt | — | `audit` |
| subcontracting_orders | cancelled_by | exempt | — | `audit` |
| subcontracting_orders | closed_by | exempt | — | `audit` |
| subcontracting_order_items | sco_id | index | #3 | lines of an SCO |
| subcontracting_order_items | raw_item_id | index | #14 | growth table: `pk-join` is refused |
| subcontracting_order_items | service_id | index | #15 | growth table: `pk-join` is refused |
| subcontracting_order_items | finished_item_id | index | #16 | growth table: `pk-join` is refused |
| sco_challans | created_by | exempt | — | `audit` |
| sco_challan_lines | item_id | index | #17 | growth table: `pk-join` is refused |
| grns | created_by | exempt | — | `audit` |
| grn_items | qa_bypassed_by | exempt | — | `audit` |
| grn_items | over_receipt_by | exempt | — | `audit` |
| grn_corrections | created_by | exempt | — | `audit` |
| qa_tests | grn_item_id | index | #4 | child of deletable GRN lines |
| qa_tests | tested_by | exempt | — | `audit` |
| subcontracting_grns | created_by | exempt | — | `audit` |
| subcontracting_grn_items | qa_decided_by | exempt | — | `audit` |
| purchase_returns | po_id | index | #5 | document link |
| purchase_returns | supplier_id | index | #6 | document link |
| purchase_returns | created_by | exempt | — | `audit` |
| purchase_return_items | pro_id | index | #7 | header → lines |
| purchase_return_items | item_id | exempt | — | `pk-join` (no code reads this table yet) |
| supplier_invoices | po_id | index | #8 | document link |
| supplier_bank_details | supplier_id | index | #9 | document link |
| supplier_payments | invoice_id | index | #10 | document link |
| supplier_payments | created_by | exempt | — | `audit` |
| supplier_master | created_by | exempt | — | `audit` |
| supplier_history | changed_by | exempt | — | `audit` |
| supplier_services | service_id | exempt | — | `covered:unique_supplier_service_idx` (supplier_id always given) |
| supplier_services | created_by | exempt | — | `audit` |
| supplier_services | last_updated_by | exempt | — | `audit` |
| supplier_items | created_by | exempt | — | `audit` |
| supplier_items | last_updated_by | exempt | — | `audit` |
| employees | created_by | exempt | — | `audit` |
| employees | last_updated_by | exempt | — | `audit` |
| company_settings | updated_by | exempt | — | `audit` (one row) |

## idx-filter findings (35)
| Table | Column | Decision | Index name | Reason |
|---|---|---|---|---|
| approval_policies | doc_type | exempt | — | `tiny` |
| approval_policies | is_active | exempt | — | `tiny` |
| approval_policies | sub_doc_type | exempt | — | `tiny` |
| approval_policies | min_amount_paise | exempt | — | `tiny` |
| approval_policies | max_amount_paise | exempt | — | `tiny` |
| approval_policies | name | exempt | — | `tiny` |
| employees | is_active | exempt | — | `low-card` |
| approval_requests | doc_id | exempt | — | `covered:idx_approval_requests_doc` (doc_type always given) |
| approval_trails | action | exempt | — | `covered:idx_approval_trails_request_id` |
| approval_trails | action_by | exempt | — | `covered:idx_approval_trails_request_id` |
| approval_requests | current_approver_role | exempt | — | `covered:idx_approval_requests_status_role` |
| approval_requests | current_approver_employee_id | exempt | — | `covered:idx_approval_requests_status_employee` |
| item_master | is_active | exempt | — | `low-card` |
| item_master | category | exempt | — | `low-card` (5 values) |
| supplier_items | is_active | exempt | — | `covered:unique_supplier_item_idx` (supplier_id + item_id given) |
| service_master | is_active | exempt | — | `low-card` |
| inventory_ledger | reference_type | index | #11 | largest table; movement list by type in id order (the default) |
| inventory_ledger | transaction_type | exempt | — | `low-card` ; the list is paged in primary-key order |
| locations | is_active | exempt | — | `tiny` |
| machines | status | exempt | — | `tiny` |
| machines | is_active | exempt | — | `tiny` |
| refresh_tokens | expires_at | exempt | — | `covered:refresh_tokens_token_hash_key` (token hash always given) |
| refresh_tokens | employee_id | index | #2 | delete by employee |
| grns | challan_no | exempt | — | `covered:uq_grns_supplier_challan` (supplier_id always given) |
| grns | status | index | #12 | list filter in id order (the default) |
| role_permissions | permission_key | index | #1 | `inArray` filter |
| supplier_invoices | invoice_number | exempt | — | `covered:uq_supplier_invoice_number` (supplier_id always given) |
| purchase_requests | type | exempt | — | `low-card` (used with the indexed status filter) |
| subcontracting_grns | vendor_challan_no | exempt | — | `covered:uq_sco_grns_vendor_challan` (vendor_id always given) |
| subcontracting_orders | status | exempt | — | `low-card` (9 values; lists by vendor use `idx_sco_vendor_status`, newest-first uses `idx_sco_created_at`) |
| subcontracting_order_items | sco_id | index | #3 | lines of an SCO |
| supplier_services | service_id | exempt | — | `covered:unique_supplier_service_idx` |
| supplier_services | is_active | exempt | — | `covered:unique_supplier_service_idx` |
| supplier_master | is_active | exempt | — | `low-card` |
| supplier_history | entity | exempt | — | `covered:idx_supplier_history_supplier_changed` (supplier_id always given) |

## Stock and money
No ledger posting changes. Money columns are whole paise. 23 of them are 32-bit `integer` today (largest value
2,147,483,647 paise = ₹2,14,74,836.47):
| Table | `integer` money columns |
|---|---|
| purchase_requests | estimated_amount_paise |
| purchase_orders | subtotal_paise, tax_amount_paise, total_amount_paise |
| purchase_order_items | unit_price_paise, line_value_paise, line_tax_paise |
| subcontracting_orders | subtotal_paise, tax_amount_paise, total_amount_paise |
| subcontracting_order_items | service_unit_price_paise |
| sco_challans | value_paise |
| sco_challan_lines | unit_issue_cost_paise |
| supplier_invoices | billed_amount_paise |
| supplier_payments | amount_paid_paise |
| purchase_returns | debit_note_amount_paise |
| purchase_return_items | unit_price_paise |
| supplier_items | supplier_unit_price_paise |
| supplier_services | service_unit_price_paise |
| item_master | average_cost_paise, standard_rate_paise |
| inventory_ledger | unit_cost_paise |
| employees | daily_rate_paise |

Already 64-bit (`bigint`, `mode: "number"`): `approval_policies.min_amount_paise`, `max_amount_paise`,
`inventory_ledger.total_value_change_paise`.

Card 1 answered: 64-bit now (`../spec.md` → Money limit):
- All 23 columns become `bigint("…", { mode: "number" })` in the same generated migration as the
  indexes (`ALTER COLUMN … TYPE bigint`; no value changes, row counts before = after).
- `mode: "number"` is exact only up to 2^53 − 1. Stored amounts stay at or below `MAX_MONEY_PAISE` (BR-STD-39);
  stock value and money sums are kept in range by BR-STD-43 (`design/api.md` → JS-number safety). No new column.

## Volumes and locks
| Table | Rows per year | Hot query | Lock needed |
|---|---|---|---|
| inventory_ledger | tens of thousands | movement list by type in id order, stock balance | none new (`postStock` already locks the item row; BR-STD-43 adds checks, no lock) |
| all others touched | under 10,000 | lists by status | none new |

## Migration notes
- One migration, made by `bun run db:generate` after the schema edit; committed in the same PR (BR-MIG-06). Never typed by hand, never pushed.
- Forward-only (BR-MIG-08): a wrong index is fixed by a new migration.
- `db:migrate` applies all pending migrations in one transaction (BR-MIG-13), so `CREATE INDEX CONCURRENTLY`
  is not possible. Plain `CREATE INDEX` (and `ALTER COLUMN … TYPE bigint` for the 23 money columns) is accepted because
  no production data exists yet.
- A later index on a populated ledger needs a maintenance window and the backup step first (BR-MIG-16, 17).
- CI must find nothing more to generate (BR-MIG-12). No backfill, no data change.

## Choices made
Moved to `../assumptions.md` (A-13..A-18, A-38..A-42, A-45, A-46).
| Question | Choice | Source |
|---|---|---|
