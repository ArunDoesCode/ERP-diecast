# Report 18 — test-writer — checklist
Wrote `.pipeline/m1-stock/manual-ui-checklist.md` from grn.md and grn-stock.md (both frozen v1). Screens touched section read for URLs/roles only.
Covers all BR-GRN-01..44 in the specs, in 10 groups (create, edit/delete, QA, over-receipt, bypass, correction, manual movements, item edit, concurrency/atomicity, role sweep). Each has golden and negative paths.
Notes:
- Two items need dev help or an endpoint that may not have a screen: forced-failure atomicity (BR-GRN-22) and reconciliation check (BR-GRN-41).
- BR-GRN-43 document-type 400s need API/dev tools since the screen only offers two types.
No tests or production code changed. No brief contamination.
