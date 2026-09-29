# Report 27 — performance-auditor, inventory (saved by coordinator)
FINDINGS: 0 blocker, 3 major, 4 minor
| PERF-20 | major | backend | assetRepository.ts:150 isItemInUse; 02_procurement-purchasing.ts:82,154 | exists checks on pr_items/po_items/supplier_items.item_id unindexed; getLastRate scans po_items by item_id | index item_id on po items + pr items (+ supplier_items if not leading) |
| PERF-21 | major | backend | assetRepository.ts:419 locationHasLedgerRows; :599 listStock; :365 movements | ledger filtered by location_id alone → seq scan | index (location_id, id desc) |
| PERF-22 | major | backend | assetRepository.ts:401-412 listInventoryMovements | date/ref-type filters sort + count whole ledger | index created_at; consider capping date range |
| PERF-23 | minor | backend | listStock | value sort / ilike not indexable | accept; backlog pg_trgm at >50k items |
| PERF-24 | minor | backend | listStock balances | fine, O(page×rows) JS filter | none |
| PERF-25 | minor | backend | inventoryReconciliation | full ledger aggregate per call | don't poll; note in map |
| PERF-26 | minor | frontend | InventoryStockManager / asset queries | prefix invalidation incl. inactive | optional refetchType active |
Checked OK: manualMovement item lock; pagination capped 100; no N+1.
