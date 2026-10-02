# Brief 01 — backend-dev — resolve merge conflict in prepare-test-db.ts
Feature: merge-fixes  Branch: work/pending-fixes (mid-merge of work/db-migrations; do NOT commit or abort the merge)
Specs: docs/specs/known-defects.md (v5, BR-KD-30/52/53) and docs/specs/db-migrations.md (v1; its changelog says BR-MIG-09/10/11 govern how the schema is applied and replace the "push schema" / "= db:reset --no-fixtures" wording of KD-35/52; the KD-30/53 guard rules still apply)
BR scope: BR-KD-30, 52, 53; BR-MIG-10, 11
## Task
`backend/scripts/prepare-test-db.ts` has two conflict hunks (`<<<<<<<` markers). Our side = known-defects (guard via db:reset, SEC fixes, query-string refusal, exit 2/4 codes). Their side = db-migrations (apply migrations then seed, rebuild only on journal mismatch, refuse multi-host/encoded host/query string via lib/migrate.ts parseTarget + assertDriverMatches, exit 2 on target refusals). Produce one file that satisfies both specs: every refusal of the target exits 2 before connecting (no DB name, several hosts, encoded host, any query string, non-`*_test`, equal to DATABASE_URL, missing/invalid URL); SEED_USER_PASSWORD missing/short exits 4; otherwise migrate + seed, rebuilding only on a journal mismatch. Prefer reusing the shared helpers over duplicating the guard. Also check backend/scripts/db-reset.ts (auto-merged) still has the BR-KD-53 guard and applies migrations (BR-MIG-09), no leftover push.
## Scope
- In: resolve the conflict; fix anything the merge broke in backend/scripts/**
- Out: tests (never edit), specs, `.claude/**`, other branches
- May edit: backend/scripts/**   May read: anything
- Size: ≤ 3 files, ≤ 120 changed lines
- Stop if: two tests contradict each other, or anything outside scope → BLOCKED with the exact test names and the spec quotes
## Inputs
- Tests: backend/tests/scripts/ (db-guard-target, prepare-test-db, db-reset, db-migrations, bootstrap-admin). Test DB: worktree backend/.env → diecast_fix_test on 5433. Run `cd backend && bun run db:test:prepare` first if the test DB is empty.
## Done when
- no conflict markers; `cd backend && bun test tests/scripts/` green; typecheck + lint clean; then full `bun test`
Write your report to: .pipeline/merge-fixes/reports/01-backend-dev.md
