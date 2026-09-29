# Brief 11 — backend-dev — S2 implement (challan)
Feature: subcontracting  Branch: claude/subcontracting-feature-b19136  Spec: docs/specs/subcontracting.md (v2, frozen; see changelog for S2 clarifications)
BR scope: BR-SCO-07..11, 24, 25
## Task
Implement the S2 stubs until `backend/src/routes/scoChallan.test.ts` passes. Do not touch tests.
- Challan on `approved`/`material_issued` SCO; qty >0 per line, ≤ send qty − issued. Over on arrival → 400; lock SCO row first, re-check → over now = 409 (lost race). Store stock short → 409 (BR-GRN-33 via `postStock blockNegative`).
- Two ledger rows per line (`sco_issue`, `averageEffect: "none"`): main store −qty, vendor location +qty at current average cost, heat number copied, referenceId = challan id. Vendor location created on first use (`onConflictDoNothing` + re-select). SCO → `material_issued` on first challan.
- `allocateFinancialYearSequence`: `JWC/<FY>/<seq>` (FY Apr–Mar `27-28`), consecutive per FY, ≤16 chars, never reused.
- Company settings + raw item `hsn_code` required else 400 (BR-SCO-09); EWB rule (BR-SCO-10): required if vendor GSTIN state ≠ ours, vendor no GSTIN, or challan value ≥ ₹50,000 (5,000,000 paise).
- Due date = challan date + 1 year; open challans list with days left, warning ≤60, overdue flag; nothing blocked (BR-SCO-11).
- Print data (Rule 55 fields) in details response; `sco.issue_receive` on create, `sco.view` reads; audit who/when/reason/heat (BR-SCO-25).
## Scope (required — every line filled)
- In: S2 backend only.
- Out: no tests, no receipts/QA/close, no frontend, no refactors.
- May edit: backend/** except test files, .pipeline/subcontracting/contract.md   May read: anything
- Size: as needed; SCO-focused diffs
- Stop if: test contradicts spec → BLOCKED quoting the rule
## Done when
- scoChallan.test.ts green; full bun test, typecheck, lint 0 errors, contract:check pass. Do NOT commit.
Write your report to: .pipeline/subcontracting/reports/11-backend-dev.md
