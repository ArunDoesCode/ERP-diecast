# Brief 33 — test-runner — verify (compare with baseline)
Feature: subcontracting  Branch: claude/subcontracting-feature-b19136  Spec: docs/specs/subcontracting.md (v2, frozen)
BR scope: BR-SCO-01..25
## Task
mode: verify. Run every automated check; compare with `reports/01-test-runner.md` baseline. Include the test-integrity check (every change to a test file is in a `test(subcontracting):` commit; every `feat(`/`fix(` commit touches no test file) over `git log main..HEAD`. Then reproduce CI parity per `ENV.md` (db:reset --no-fixtures on the test DB with DATABASE_URL overridden, then bun test).
## Scope (required — every line filled)
- In: backend typecheck, lint, bun test, contract:check; frontend tsc, lint, build; integrity check; CI-parity run.
- Out: no fixes, no edits except your report.
- May edit: .pipeline/subcontracting/reports/33-test-runner.md   May read: anything
- Size: report only
- Stop if: DB unreachable → FAILED with error
## Done when
- Per-check pass/fail, new failures vs baseline named with likely owner.
Write your report to: .pipeline/subcontracting/reports/33-test-runner.md
