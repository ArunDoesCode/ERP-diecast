# Brief 00 — test-runner — baseline
Feature: m1-stock  Branch: work/m1-stock  Spec: docs/specs/grn.md (v1, frozen), docs/specs/grn-stock.md (v1, frozen)
BR scope: none (baseline)
## Task
mode: baseline. Run every automated check on the branch as-is and record pass/fail counts per check.
## Scope (required — every line filled)
- In: backend typecheck, lint, bun test, contract:check; frontend tsc --noEmit, lint
- Out: fixing anything; frontend build (skip)
- May edit: only your report file        May read: anything
- Size: report only
- Stop if: env missing → FAILED with details
## Inputs
- .pipeline/m1-stock/ENV.md — every backend bun command MUST use
  `bun --env-file=/Users/turbo_fltr/.claude/diecast-env/stock-test.env …` (test DB diecast_stock_test; never diecast_test)
## Done when
- Report lists each check with pass/fail and failing test names
Write your report to: .pipeline/m1-stock/reports/00-test-runner-baseline.md
