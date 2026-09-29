# Brief 24 — backend-dev — S6 items + S7 services & machines
Feature: m1-stock  Branch: work/m1-stock  Spec: docs/specs/inventory.md (v1, frozen)
BR scope: BR-INV-01, 02, 03, 04, 05, 06, 08, 09, 10, 16, 17, 18, 25
## Task
Implement S6 + S7 from plan.md part 2 until the tests for these BR ids in `inventoryMasters.test.ts` /
`inventoryStock.test.ts` pass. Unique clashes → 409 with a plain message (never raw DB text / 500).
BR-INV-05/10 on PR/PO/SCO: only what the tests need, smallest change, listed in the report
("take work/m1 version on merge"). Answers already decided: questions.md rows 1–6.
## Scope (required — every line filled)
- In: S6 + S7
- Out: tests (never edit), frontend, S8–S10, ENV.md off-limits files
- May edit: backend/src/** except *.test.ts        May read: anything
- Size: ≤ 8 files, ≤ 500 changed lines
- Stop if: a test seems to contradict the spec → BLOCKED, quote the spec rule
## Inputs
- .pipeline/m1-stock/{plan.md,contract.md,questions.md,ENV.md}, reports/20-backend-dev.md, reports/21-test-writer.md
## Done when
- S6/S7 BR tests green; typecheck + lint no new warnings; no green test turned red
- Report: files changed, test counts, PR/PO changes, "Map updates"
Write your report to: .pipeline/m1-stock/reports/24-backend-dev.md
