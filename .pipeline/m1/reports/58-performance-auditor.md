# 58 — performance-auditor — procurement (saved by coordinator)

0 blocker, 2 major, 10 minor. Lists paginated (≤100), inbox batched, history trail one batch.

| id | sev | where | finding | fix |
|---|---|---|---|---|
| PERF-01 | major | prService.cancelLine (prService.ts:378-383) vs findPrByIdForUpdate (prRepository.ts:545), approvalService.ts:408 | line-then-header lock order vs header-then-line elsewhere → deadlock → 500 | lock PR header first in cancelLine |
| PERF-02 | major | poRepository.findPurchaseRequestItemsByIdsForUpdate (258-286) | FOR UPDATE on the join also locks parent PR rows, undefined order | `.for("update", {of: purchaseRequestItems})` + orderBy id; sort ids in updatePoWithItems |
| PERF-03 | minor | poRepository.ts:627-660, 459-479 | per-line queries in create/update loops | batch |
| PERF-04 | minor | poRepository cancelPrLinesOfPo / closePrLinesOfPo | per-line UPDATE + recompute per PR | single UPDATE … WHERE id IN |
| PERF-05 | minor | poService.ts:165-175 | getLastRate per line | getLastRatesForItems with DISTINCT ON |
| PERF-06 | minor | pr_po_item_links | no index on pr_item_id / po_item_id | add both |
| PERF-07 | minor | po_communications | no index on po_id | index(poId, sentAt) |
| PERF-08 | minor | purchase_orders / purchase_requests / purchase_request_items / approval_requests | no status/supplier indexes; overdue partial index; approval_requests(doc_type, doc_id) | add |
| PERF-09 | minor | list `q` ilike | no trigram | backlog |
| PERF-10 | minor | count(*) + offset | fine at size | none |
| PERF-11 | minor | approvalService.assertChainHasEligibleApprovers | one count per step | grouped query if touched |
| PERF-12 | minor | frontend purchase-orders/queries.ts:155-175 | invalidates all ["approval"] keys | narrow to myPending + history |
