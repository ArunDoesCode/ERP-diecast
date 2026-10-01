# Brief 07 — backend-dev — fix guard findings (BR-KD-53)
Feature: known-defects  Branch: work/known-defects  Spec: docs/specs/known-defects.md (v5, frozen)
BR scope: BR-KD-53 (also BR-KD-30, 52)
## Task
Fix findings CR-1/SEC-1 (blocker: URL with no DB name skips the confirm), SEC-2 (guard must read host/port/db the way the postgres driver does; refuse >1 host; PGHOST/PGPORT/PGDATABASE count when the URL omits them; clear PG* env for the child/in-process client or pass the resolved target explicitly), SEC-4 (NODE_ENV compared case-insensitively). Details: .pipeline/known-defects/reports/03-code-reviewer.md and 04-security-auditor.md. An empty DB_RESET_CONFIRM counts as no confirm.
## Scope
- In: BR-KD-53 in the two scripts; the same guard is reused by prepare-test-db (share one helper if simplest)
- Out: tests (never edit), specs, docs/CLAUDE.md, CR-2/CR-3/SEC-3 (backlogged)
- May edit: backend/scripts/db-reset.ts, backend/scripts/prepare-test-db.ts, a new backend/scripts/lib file if needed   May read: anything
- Size: ≤ 3 files, ≤ 100 changed lines
- Stop if: anything outside scope → BLOCKED with the question
## Inputs
- Tests: backend/tests/scripts/ (db-guard-target.test.ts is new and red)
- NEVER run db:reset against any DB except scratch/test DBs on port 5433 (worktree backend/.env points at diecast_kd_test)
## Done when
- `cd backend && bun test tests/scripts/` green; typecheck + lint clean
Write your report to: .pipeline/known-defects/reports/07-backend-dev.md
