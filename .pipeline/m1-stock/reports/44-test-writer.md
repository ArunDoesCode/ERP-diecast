# Report 44 — test-writer — suppliers manual checklist
Checklist written: `.pipeline/m1-stock/manual-ui-checklist-suppliers.md` (12 groups, BR-SUP-01..25, golden + negative paths).
Source: spec suppliers.md v1 + contract + Screens touched. No tests or code changed.
Notes:
- BR-SUP-07 block on new SCO has no screen listed; checked via API only.
- BR-SUP-24 PO picker `status=active` was not wired by frontend-dev (its own note), so section 4 picker item may fail.
- BR-SUP-17 unknown-item case cannot be produced from the UI; marked API check.
