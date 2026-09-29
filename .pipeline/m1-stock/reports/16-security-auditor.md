# Report 16 — security-auditor re-review (saved by coordinator)
FINDINGS: 0 blocker, 0 major, 0 minor

| id | status | evidence |
|---|---|---|
| SEC-1 | fixed | update/remove in one tx; `lockDraftGrn` FOR UPDATE + re-check draft and no decided line; lock order GRN → PO → line → item; `lockGrnAndPo` in QA/bypass/correction |
| SEC-2 | fixed | qty cap 1e9; unitCostPaise ≤ int4; row value ≤ MAX_SAFE_INTEGER → 400; value column bigint |
| SEC-3 | fixed | manual movement checks location in tx → 404 |
| SEC-4 | fixed | certificateUrl http(s) only |

New issues: none (batchNumber write scoped to locked draft; challan check excludes own id + 23505 → 409; reconciliation SQL interpolates only validated `dir` + numbers).
