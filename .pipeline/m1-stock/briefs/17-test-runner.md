# Brief 17 — test-runner — full verify vs baseline
Feature: m1-stock  Branch: work/m1-stock  Spec: docs/specs/grn.md (v1), docs/specs/grn-stock.md (v1)
BR scope: all BR-GRN-*
## Task
mode: verify. Run every check (backend typecheck, lint, bun test, contract:check; frontend tsc --noEmit, lint,
build). Compare with `reports/00-test-runner-baseline.md`. Run the test-integrity check for commits
`a6ca63e..HEAD`: test files changed only in `test(` commits; `feat(`/`fix(` commits touch no test file.
## Scope (required — every line filled)
- In: all checks + integrity check
- Out: fixing anything
- May edit: only your report file        May read: anything
- Size: report only
- Stop if: env missing → FAILED
## Inputs
- .pipeline/m1-stock/ENV.md — backend bun commands MUST use `--env-file=/Users/turbo_fltr/.claude/diecast-env/stock-test.env` (DB diecast_stock_test)
## Done when
- Each check pass/fail, new failures vs baseline, integrity result
Write your report to: .pipeline/m1-stock/reports/17-test-runner.md
