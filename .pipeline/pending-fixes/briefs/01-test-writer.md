# Brief 01 — test-writer — checklist
Feature: pending-fixes  Branch: work/pending-fixes  Worktree: /Users/turbo_fltr/codes/ERP-diecast/.claude/worktrees/pending-fixes (read-only except the report; do not run anything against any DB)
Specs: docs/specs/known-defects.md (v5, frozen), docs/specs/subcontracting.md (v4, frozen), docs/specs/db-migrations.md (v1, frozen)
BR ids: BR-KD-30, BR-KD-52, BR-KD-53, BR-SCO-03, BR-SCO-09, BR-SCO-11, BR-MIG-09, BR-MIG-10, BR-MIG-16
Screens touched: .pipeline/sco-ist-date/reports/03-frontend-dev.md#screens-touched
May edit: none   Out: production code, specs, tests
Write your report to: .pipeline/pending-fixes/reports/01-test-writer.md  (a short markdown checkbox list a human can run by hand, grouped per spec: UI steps for the subcontracting date pickers; shell steps for the db:reset / db:test:prepare / db:migrate guards on scratch databases only; each item: step, expected result, which BR)
