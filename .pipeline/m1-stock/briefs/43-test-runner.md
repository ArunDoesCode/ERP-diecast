# Brief 43 — test-runner — full verify (suppliers)
Feature: m1-stock  Branch: work/m1-stock  Spec: suppliers.md, inventory.md, grn.md, grn-stock.md (all v1)
BR scope: all BR-GRN-*, BR-INV-*, BR-SUP-*
## Task
mode: verify. Run every check (backend typecheck, lint, bun test, contract:check; frontend tsc --noEmit, lint,
build). Compare with `reports/32-test-runner.md`. Test-integrity check for `a6ca63e..HEAD` exactly per PROTOCOL.md
rule 5 as written and decisions.md D-010 point 4: (a) every test-file change is in a `test(` commit; (b) no
`feat(`/`fix(` commit touches a test file. Non-test files inside a `test(` commit are NOT a violation.
## Scope (required — every line filled)
- In: all checks + integrity check
- Out: fixing anything
- May edit: only your report file        May read: anything
- Size: report only
- Stop if: env missing → FAILED
## Inputs
- .pipeline/m1-stock/ENV.md — backend bun commands MUST use `--env-file=/Users/turbo_fltr/.claude/diecast-env/stock-test.env`
## Done when
- Each check pass/fail, new failures vs report 32, integrity result (a) and (b)
Write your report to: .pipeline/m1-stock/reports/43-test-runner.md
