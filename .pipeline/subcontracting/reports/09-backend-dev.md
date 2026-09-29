# Report 09 - backend-dev - S2 contract step
Done. Schema + 4 descriptors + Zod + 501 stubs. No logic, no tests, not committed.
- Schema: `sco_challans`, `sco_challan_lines` in 02_procurement-purchasing.ts. Settlement table skipped (S3; `settledQty` ready). Vendor location uniqueness already exists (`uq_locations_one_vendor_premise`) - no schema change.
- FY numbering: `allocateFinancialYearSequence(tx, docType, actorId, date)` stub in lib/document-number.ts (plan: counters table, periodKey `27-28`).
- Endpoints: POST /sco/:id/challans (`sco.issue_receive`), GET /sco/:id/challans, GET /sco/challans/open, GET /sco/challans/:challanId (`sco.view`). Permission keys already existed.
- New files: types/scoChallan.types.ts, controller/scoChallanController.ts, service/scoChallanService.ts, repository/scoChallanRepository.ts. Routes added in routes/sco.ts; paths in end-points.ts.
- contract.md S2 section appended; contract:generate (103 routes), contract:check ok; db:test:prepare run.
- Checks: typecheck pass, lint 0 errors, bun test 1211 pass / 0 fail.
## Map updates
- New tables/files/endpoints above. Trap: `/challans/open` must stay registered before `/challans/:challanId`. Assumption: challanDate and per-line heatNumber optional inputs.
