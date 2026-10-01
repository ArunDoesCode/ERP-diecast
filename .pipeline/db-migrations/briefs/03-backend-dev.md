# Brief 03 — backend-dev — switch db:push → generated migrations
Feature: db-migrations  Branch: work/db-migrations  Spec: docs/specs/db-migrations.md (v1, frozen) + clarifications in its changelog
BR scope: BR-MIG-01..17, 21, 22 (18..20 deferred; 08 is a review rule)
## Task
Implement the spec: one baseline migration generated from backend/src/db/schemas (drizzle-kit generate), delete the stale backend/src/db/migrations/* contents (check nothing imports schema.ts/relations.ts there), the custom drop migration for pages/role_pages, scripts `db:generate` + `db:migrate` (with the migrate guard: MIGRATE_CONFIRM, pg_dump backup to backend/backups/ gitignored, refuse if DB is ahead/edited, one transaction, prints host:port/db), `db:push` removed; `db:reset` and `db:test:prepare` apply migrations instead of push; CI drift check (`drizzle-kit generate` → no git diff, plus `check`) in .github/workflows/ci.yml; the app never migrates on start. Read the baseline SQL by eye: it must contain the expression index on lower(btrim(name)) and check constraint company_settings_single_row. Update every mention of `db:push` in repo docs/scripts/CI/package.json (docs/WORKFLOW.md, backend/CLAUDE.md — only those mentions, one line each). drizzle-kit is a pinned rc (1.0.0-rc.5): verify `migrate` / `generate --custom` behaviour locally.
## Scope
- In: the BRs above
- Out: tests (never edit), specs, `.claude/**` (owner updates agent/skill files; ignore their db:push mentions), frontend, `db:adopt`
- May edit: backend/package.json, backend/drizzle.config.ts, backend/scripts/**, backend/src/db/migrations/**, backend/.gitignore or root .gitignore (backups/), .github/workflows/ci.yml, docs/WORKFLOW.md, backend/CLAUDE.md (db:push lines only)   May read: anything
- Size: ≤ 15 hand-written files (generated SQL/snapshots excluded), ≤ 600 changed hand-written lines
- Stop if: anything outside scope → BLOCKED with the question
## Inputs
- Tests: backend/tests/scripts/db-migrations.test.ts (red). One test, "agent and skill instructions do not tell anyone to run db:push", can't go green by design (it covers `.claude/**`); leave it red and say so.
- Worktree backend/.env points at test DB diecast_mig_test (port 5433). NEVER touch any other DB; this host has no pg_dump (tests use a fake one).
## Done when
- `cd backend && bun test tests/scripts/` green except the one test above; full `bun test` has no new failures vs main; typecheck + lint clean
Write your report to: .pipeline/db-migrations/reports/03-backend-dev.md
