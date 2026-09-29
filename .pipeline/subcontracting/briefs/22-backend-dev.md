# Brief 22 — backend-dev — S4 implement (close, loss, reports)
Feature: subcontracting  Branch: claude/subcontracting-feature-b19136  Spec: docs/specs/subcontracting.md (v2, frozen; read changelog)
BR scope: BR-SCO-19, 22, 23, 24, 25
## Task
Implement the S4 stubs until `backend/src/routes/scoClose.test.ts` passes (it may get one extra case for close vs pending QA). Do not touch tests.
- Close from `material_issued`/`material_received`, `sco.close`. Anything left at the vendor also needs `sco.loss_override` (403) and reason 3–500 chars (400); written off from the vendor location at issue cost, `sco_loss` rows (referenceId = SCO id, referenceLineId = SCO line id, notes = reason), line `lossQty`. Un-issued qty dropped. Close with a receipt line pending QA → 409 "decide QA first" (spec changelog). One transaction, SCO row lock first, loser 409 (BR-SCO-24). Store closedBy/At/reason (BR-SCO-25).
- Reports: vendor stock (per vendor + item, qty, value), loss log, SCO register date filters, open challans (reuse). Paginated per the pagination-contract skill.
## Scope (required — every line filled)
- In: S4 backend only.
- Out: no tests, no frontend, no refactors.
- May edit: backend/** except test files, .pipeline/subcontracting/contract.md   May read: anything
- Size: as needed; SCO-focused
- Stop if: test contradicts spec → BLOCKED quoting the rule
## Done when
- scoClose.test.ts green; full bun test, typecheck, lint 0 errors, contract:check pass. Do NOT commit.
Write your report to: .pipeline/subcontracting/reports/22-backend-dev.md
