# Brief 26 — backend-dev — S10 last rate (+ close the location race)
Feature: m1-stock  Branch: work/m1-stock  Spec: docs/specs/inventory.md (v1, frozen)
BR scope: BR-INV-24, BR-INV-12, BR-INV-13
## Task
- S10: `getLastRate` per BR-INV-24 until its tests pass; response includes `source`.
- COORD-2 (your S9 note): back BR-INV-13 (one `main_store`) and BR-INV-12 (one `vendor_premise` per supplier)
  with partial unique indexes, and map their unique violation to the same 409 the service returns. `db:push`-safe.
## Scope (required — every line filled)
- In: S10 + COORD-2
- Out: tests (never edit), frontend, PR/PO code, ENV.md off-limits files
- May edit: backend/src/** except *.test.ts, backend/.contracts/**        May read: anything
- Size: ≤ 5 files, ≤ 200 changed lines
- Stop if: a test seems to contradict the spec → BLOCKED, quote the spec rule
## Done when
- full `bun test` green; typecheck + lint no new warnings; contract:check clean
- Report: files changed, test counts, "Map updates"
Write your report to: .pipeline/m1-stock/reports/26-backend-dev.md
