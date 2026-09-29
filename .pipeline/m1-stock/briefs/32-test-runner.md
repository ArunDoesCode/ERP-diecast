# Brief 32 — test-runner — full verify vs baseline (inventory)
Feature: m1-stock  Branch: work/m1-stock  Spec: docs/specs/inventory.md (v1), grn.md (v1), grn-stock.md (v1)
BR scope: all BR-GRN-*, BR-INV-*
## Task
mode: verify. Run every check (backend typecheck, lint, bun test, contract:check; frontend tsc --noEmit, lint,
build). Compare with `reports/00-test-runner-baseline.md` and `reports/17-test-runner.md`. Test-integrity check
for commits `a6ca63e..HEAD` per PROTOCOL.md rule 5 as written: every test-file change is in a `test(` commit, and
no `feat(`/`fix(` commit touches a test file (decisions.md D-010 point 4).
## Scope (required — every line filled)
- In: all checks + integrity check
- Out: fixing anything
- May edit: only your report file        May read: anything
- Size: report only
- Stop if: env missing → FAILED
## Inputs
- .pipeline/m1-stock/ENV.md — backend bun commands MUST use `--env-file=/Users/turbo_fltr/.claude/diecast-env/stock-test.env`
## Done when
- Each check pass/fail, new failures vs baseline, integrity result
Write your report to: .pipeline/m1-stock/reports/32-test-runner.md
