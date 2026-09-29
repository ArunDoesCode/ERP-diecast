# Brief 38 — backend-dev — S11 supplier master + S12 price list, history, batch
Feature: m1-stock  Branch: work/m1-stock  Spec: docs/specs/suppliers.md (v1, frozen)
BR scope: BR-SUP-01..24
## Task
Implement S11 then S12 from plan.md part 3 until `backend/src/service/supplierService.test.ts` passes
(the failing list is in reports/36-test-writer.md, incl. TEST-1: create response shape must match contract.md).
Batch edit: one tx, all or nothing, per-row reasons in the 400 body (built in the controller). Error text is a
fixed plain sentence (BR-SUP-22). BR-SUP-06/07 PO side only if a test needs it — smallest change, marked
"take work/m1 version on merge".
## Scope (required — every line filled)
- In: S11 + S12
- Out: tests (never edit), frontend, ENV.md off-limits files
- May edit: backend/src/** except *.test.ts, backend/.contracts/**        May read: anything
- Size: ≤ 8 files, ≤ 600 changed lines
- Stop if: a test seems to contradict the spec → BLOCKED, quote the spec rule
## Inputs
- .pipeline/m1-stock/{plan.md,contract.md,ENV.md}, reports/35-backend-dev.md, reports/36-test-writer.md
## Done when
- full `bun test` green; typecheck + lint no new warnings; contract:check clean
- Report: files changed, test counts, PO changes, "Map updates"
Write your report to: .pipeline/m1-stock/reports/38-backend-dev.md
