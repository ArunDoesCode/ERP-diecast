# Brief 16 — backend-dev — S3 implement (receipt + QA)
Feature: subcontracting  Branch: claude/subcontracting-feature-b19136  Spec: docs/specs/subcontracting.md (v2, frozen; read the changelog for build clarifications)
BR scope: BR-SCO-12..18, 22, 24, 25
## Task
Implement the S3 stubs until `backend/src/routes/scoReceipt.test.ts` passes. Do not touch tests.
- Receipt only on `material_issued`; vendor challan/invoice no. unique per vendor (409). Per line: (processed × ratio) + unprocessed ≤ still at vendor. Unprocessed raw goes vendor → main store at issue cost at save (`sco_receipt`), no QA, no charge.
- QA decision per processed line, once (second → 409; concurrent → post once): accepted + rejected = processed. Accepted: raw −(used) from vendor at line issue cost; finished +accepted into main store at cost = ratio × issue cost + service price (no GST), average per BR-GRN-38. Rejected: raw vendor → scrap yard at issue cost, no charge. Raw pieces used = proportional to cumulative processed, rounded half up, minus already used (spec changelog).
- Settle oldest open challan first, record challan lines and qty in the settlement table; challan settled when all qty settled.
- `material_received` when all lines fully issued and nothing at vendor (after QA decisions, pending QA counts as at vendor).
- Add `sco_grn` receipt numbering. Charge due = Σ accepted × price + GST at line %. Lock SCO row first for receipt and QA; loser gets 409 (BR-SCO-24). Keys: `sco.issue_receive`, `sco.qa_decide`; who/when/heat stored (BR-SCO-25).
## Scope (required — every line filled)
- In: S3 backend only.
- Out: no tests, no close/loss/reports (S4), no frontend, no refactors.
- May edit: backend/** except test files, .pipeline/subcontracting/contract.md   May read: anything
- Size: as needed; SCO-focused
- Stop if: test contradicts spec → BLOCKED quoting the rule
## Done when
- scoReceipt.test.ts green; full bun test, typecheck, lint 0 errors, contract:check pass. Do NOT commit.
Write your report to: .pipeline/subcontracting/reports/16-backend-dev.md
