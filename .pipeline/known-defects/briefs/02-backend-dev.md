# Brief 02 — backend-dev — make BR-KD-30/52 tests green
Feature: known-defects  Branch: work/known-defects  Spec: docs/specs/known-defects.md (v5, frozen)
BR scope: BR-KD-30, BR-KD-35, BR-KD-52
## Task
Implement spec v5: (1) `backend/scripts/db-reset.ts` guard — only a local `*_test` DB on 5432/5433 resets without a confirm; any other DB (incl. local `diecast`) needs `DB_RESET_CONFIRM=<dbname>` else exit 2, data untouched. (2) `backend/scripts/prepare-test-db.ts` — one build path: run `db:reset --no-fixtures` with DATABASE_URL = DATABASE_URL_TEST; refuse (exit 2) if URL missing/invalid/not `*_test`/equal to DATABASE_URL; SEED_USER_PASSWORD missing/short → exit 4. Keep the schema step as is (push); migrations come later in db-migrations.
## Scope
- In: BR-KD-30, 35, 52 — the two scripts only
- Out: tests (never edit), specs, CLAUDE.md/docs, frontend, migrations switch, CI file
- May edit: backend/scripts/db-reset.ts, backend/scripts/prepare-test-db.ts   May read: anything
- Size: ≤ 2 files, ≤ 120 changed lines
- Stop if: needs anything outside scope → BLOCKED with the question
## Inputs
- Tests: backend/tests/scripts/db-reset.test.ts, backend/tests/scripts/prepare-test-db.test.ts; report .pipeline/known-defects/reports/01-test-writer.md (test names/results only)
- Env: worktree backend/.env points at test DB diecast_kd_test on port 5433; NEVER run db:reset against any other DB
## Done when
- `cd backend && bun test tests/scripts/` green; `bun run typecheck && bun run lint` clean
Write your report to: .pipeline/known-defects/reports/02-backend-dev.md
