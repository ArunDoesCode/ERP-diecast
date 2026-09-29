# Brief 14 — backend-dev — fix review round 1 (backend)
Feature: m1-stock  Branch: work/m1-stock  Spec: docs/specs/grn.md (v1), docs/specs/grn-stock.md (v1)
BR scope: BR-GRN-05, 06, 21, 22, 25, 27, 39, 43, 44 (fix side)
## Task
Fix these findings (details + suggested fixes in `.pipeline/m1-stock/reports/11-*.md`, status in findings.md):
- PERF-1: lock GRN header then PO row (FOR UPDATE) first in qaAction, bypass, correction — same order everywhere.
- PERF-2, PERF-4: ledger indexes on `reference_line_id`, and `(item_id, location_id, id desc)`.
- PERF-3: reconciliation in one pass (`count(*) over()` / CTE, `distinct on` last balance).
- SEC-1 + SPEC-3 + CR-1: draft update/delete in one tx; lock GRN row, re-check draft and every line pending inside.
- SPEC-2 + CR-1: challan clash on update → 409 (check excluding own id + 23505 mapping; share with create).
- CR-2: persist `batchNumber` on draft edit (null clears).
- SPEC-1: correction keeps old average if the candidate is negative (BR-GRN-39).
- SEC-2: upper bounds on qty (≤ 1e9) and paise (≤ 1e11) in Zod. SEC-3: manual movement 404 for unknown location.
  SEC-4: certificateUrl http(s) only.
- SPEC-4: remove stale comment. SPEC-5: `// BR-GRN-nn` comments at enforcement lines for 04, 06, 12, 13, 25, 27, 39.
Not SPEC-6 (backlogged). Then `contract:generate` if shapes changed, and `db:test:prepare`.
## Scope (required — every line filled)
- In: the findings above
- Out: tests (never edit), frontend, ENV.md off-limits files, new behaviour
- May edit: backend/src/** except *.test.ts, backend/.contracts/**        May read: anything
- Size: ≤ 8 files, ≤ 400 changed lines
- Stop if: a fix needs a business decision → BLOCKED
## Inputs
- .pipeline/m1-stock/findings.md, reports/11-*.md, reports/12-test-writer.md
## Done when
- full `bun test` green (incl. 3 new regression tests); typecheck + lint no new warnings; contract:check clean
- Report: per finding id → fixed where; "Map updates"
Write your report to: .pipeline/m1-stock/reports/14-backend-dev.md
