# Report 11 — performance-auditor (saved by coordinator; agent has no write tool)
FINDINGS: 0 blocker, 2 major, 3 minor

| id | severity | area | file:line | finding | suggested fix |
|---|---|---|---|---|---|
| PERF-1 | major | backend | grnService.ts qaAction/bypass/correction; poService.ts `recomputeReceiptStatus`; grnService `recomputeGrnHeaderStatus` | Concurrent decisions on different lines of one GRN (or two GRNs on one PO) lock only their own line/PO line; header/PO recompute under READ COMMITTED can miss the other tx → header stuck partial/pending, PO stuck partial_received. Stock stays correct. | Lock parent rows first in every posting tx: `grns ... for update`, then `purchase_orders ... for update`, before line lock, same order in all three flows |
| PERF-2 | major | backend | 02_procurement-catalog.ts inventoryLedger indexes; grnRepository `findPostedRow` | Lookup on `reference_line_id` + `reference_type` has no index → seq scan of ledger on each correction, under item + line lock | Add index on `reference_line_id` (partial `where not null` ok) |
| PERF-3 | minor | backend | assetRepository `inventoryReconciliation` | Full-ledger aggregate runs twice (page + count); `array_agg(... order by id desc)` over all rows | One pass (`count(*) over()` / CTE); `distinct on` for last balance |
| PERF-4 | minor | backend | stockPostingRepository `postStock` last-balance select | Index (item_id, location_id) lacks id → sort per posting | Index `(item_id, location_id, id desc)` |
| PERF-5 | minor | backend | grnRepository `findGrnDetail` corrections sum | Second query outside the detail snapshot; harmless for display | none |

Checked OK: no N+1; postStock item lock correct (BR-GRN-42); lock order line → PO line → item, no cycle;
challan unique index + 23505 fallback; `grn_corrections` indexed; reconciliation paginated; frontend fine.
