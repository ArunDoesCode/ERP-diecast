# Brief 10 — backend-dev — S4 correction (+ one S3 fix)
Feature: m1-stock  Branch: work/m1-stock  Spec: docs/specs/grn.md (v1), docs/specs/grn-stock.md (v1), docs/specs/purchase-order.md BR-PO-10
BR scope: BR-GRN-29, BR-GRN-32, BR-GRN-33 (correction part), BR-GRN-34, BR-GRN-35, BR-GRN-39
## Task
Implement slice S4 from plan.md until the tests for these BR ids pass. Correction runs in one tx with the S1
posting function (`blockNegative`), cost = the line's posted cost, ref `grn_correction`, PO received qty down
and PO status recomputed per BR-PO-10 (can go back to `partial_received` or `dispatched`); 409 if PO
invoiced/closed. Details expose corrected total and `netAcceptedQty`.
Also fix (finding SPEC-pre-1): BR-GRN-01 says accept/bypass only while the PO is `dispatched` or
`partial_received`; S3 also allows `fully_received`. Remove `fully_received` from the allowed set.
## Scope (required — every line filled)
- In: S4 + SPEC-pre-1
- Out: tests (never edit), frontend, ENV.md off-limits files; PO code only the smallest change for the backward status move (list it)
- May edit: backend/src/** except *.test.ts        May read: anything
- Size: ≤ 6 files, ≤ 350 changed lines
- Stop if: a test seems to contradict the spec → BLOCKED, quote the spec rule
## Inputs
- .pipeline/m1-stock/{plan.md,contract.md,ENV.md}, reports/09-backend-dev.md
## Done when
- All tests green; typecheck + lint no new warnings; contract:check clean
- Report: files changed, test counts, PO changes, "Map updates"
Write your report to: .pipeline/m1-stock/reports/10-backend-dev.md
