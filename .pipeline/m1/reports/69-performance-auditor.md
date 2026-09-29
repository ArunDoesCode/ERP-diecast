# 69 performance-auditor — m1 merge integration (`git diff dfbf5f5 HEAD`)
Saved by coordinator (auditor is read-only). No blockers, no majors.

Checked fine: merged indexes (pr_items/po_items item_id, grn_items grn_id/po_item_id, grn_corrections, inventory_ledger, uq_grns_supplier_challan with NULL-distinct); lock order — GRN: GRN header → PO → GRN line+PO line → item; PR/PO: PO → PR headers asc (lockHeadersInOrder) → PR lines; only shared lock is PO row, taken first by both → no cycle; actor load 2s cache; BR-PR-14 estimate is one batched PK join, noCostHistory in SQL, recalc inside PR lock.

| id | sev | where | issue | fix |
|---|---|---|---|---|
| PERF-M1 | minor | 02_procurement-purchasing.ts `grns` (~333); poRepository.ts:857 hasGrnForPo; grnRepository.ts:545 | no index on `grns.po_id`; seq scan on every PO edit/cancel while PO row locked | add `idx_grns_po_id` |
| PERF-M2 | minor | grnRepository.ts:541-573 | leading-wildcard ilike on grn_number in list count | backlog with PERF-05 (trigram) |
