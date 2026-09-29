# Brief 01 — test-runner — baseline
Feature: subcontracting  Branch: claude/subcontracting-feature-b19136  Spec: docs/specs/subcontracting.md (v1, frozen)
BR scope: none (baseline)
## Task
mode: baseline. Run every automated check on the branch as it is now (= origin/main 5f1be3f) and record
pass/fail counts and any failing test names, so later runs can be compared.
## Scope (required — every line filled)
- In: backend typecheck, lint, `bun test`, contract:check; frontend `bunx tsc --noEmit`, lint.
- Out: no fixes, no edits outside the report file.
- May edit: .pipeline/subcontracting/reports/01-test-runner.md   May read: anything
- Size: report only
- Stop if: DB not reachable → FAILED with the error
## Inputs
- .pipeline/subcontracting/ENV.md — how to run backend commands (env file prefix; tests use the diecast_test DB only)
## Done when
- Report lists each check with pass/fail and counts; failing tests named.
Write your report to: .pipeline/subcontracting/reports/01-test-runner.md
