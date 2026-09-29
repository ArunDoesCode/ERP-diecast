# Brief 36 — backend-dev — challan date not in the future
Feature: subcontracting  Branch: claude/subcontracting-feature-b19136  Spec: docs/specs/subcontracting.md (v3, frozen)
BR scope: BR-SCO-09
## Task
Reject a challan whose date is after today (UTC whole day, same day rule as the return-date window) with 400; default stays today. Make the new test in `backend/src/routes/scoChallan.test.ts` pass. Do not touch tests. Update `.pipeline/subcontracting/contract.md` error list for create challan.
## Scope (required — every line filled)
- In: that check only.
- Out: everything else; no tests; no frontend.
- May edit: backend/src/service/scoChallanService.ts, backend/src/types/scoChallan.types.ts, .pipeline/subcontracting/contract.md   May read: anything
- Size: ≤ 3 files, ≤ 30 lines
- Stop if: needs more → BLOCKED
## Done when
- scoChallan.test.ts green; full bun test, typecheck, lint 0 errors, contract:check pass. Do NOT commit.
Write your report to: .pipeline/subcontracting/reports/36-backend-dev.md
