# Report 03 — backend-dev — db-migrations

STATUS: DONE. `tests/scripts/db-migrations.test.ts`: 46 pass, 1 fail (the `.claude/**` db:push test, by design — still lists `.claude/skills/feature/SKILL.md` and `.claude/agents/backend-dev.md`). Full `bun test`: 1392 pass, 1 fail (same test). typecheck + lint exit 0 (259 existing warnings, none new). No routes changed, so no `contract:generate`.

## What changed
| BR | Change |
|---|---|
| 01-03 | Old `src/db/migrations/*` deleted (nothing imported them). `drizzle-kit generate --name baseline` -> `20261001074802_baseline`. Read by eye: has `uq_*_norm` on `lower(btrim(..))`, `uq_locations_one_main_store`, `uq_open_approval_request_per_doc`, `idx_inventory_ledger_sco_loss` (all with WHERE), CHECK `company_settings_single_row`. |
| 04 | `generate --custom --name drop_legacy_pages` -> `20261001074833_drop_legacy_pages`, SQL = `DROP TABLE IF EXISTS "role_pages"; DROP TABLE IF EXISTS "pages";` |
| 05, 07 | `backend/package.json`: added `db:generate`, `db:migrate`; removed `db:push`. Deleted `scripts/drizzle-reset.config.ts` (only push used it). |
| 13-15 | New `backend/scripts/lib/migrate.ts` (journal read, plan, apply in one tx with advisory lock, target parser). New `backend/scripts/db-migrate.ts` (CLI). |
| 14 | Journal check: unknown row, edited hash, or pending older than applied -> exit 3, nothing changed. |
| 16, 17 | Unusual target (not local `*_test` on 5432/5433) needs `MIGRATE_CONFIRM=<db>` (exit 2 before connecting), then `pg_dump --format=custom` to `backend/backups/<db>-YYYYMMDD-HHMM.dump`; refused if pg_dump missing/fails/empty. No dump when nothing is pending. Credentials go via PG* env, not argv. `.gitignore`: `backend/backups/`. |
| 09 | `scripts/db-reset.ts`: step "push schema" -> "apply migrations" (in-process, after the existing schema drop). |
| 10, 11 | `scripts/prepare-test-db.ts`: applies migrations; tables-but-no-journal or journal mismatch -> prints why, drops `public` + `drizzle`, rebuilds. Non-`*_test` refused by existing `resolveTestDatabaseUrl`. |
| 12 | `.github/workflows/ci.yml`: new step after `db:reset --no-fixtures` runs `drizzle-kit generate`, `drizzle-kit check`, fails on `git status --porcelain -- src/db/migrations`. |
| 22 | Nothing in `src/` imports a migrator; unchanged. |
| docs | `backend/CLAUDE.md` (3 spots: setup, deployment workflow, "what not to do"), `docs/WORKFLOW.md` UAT-1 row. |

Also ran `db:test:prepare` on the worktree test DB (was push-built; it printed "being rebuilt" and rebuilt).

## Not done / left
- `.claude/**` db:push mentions (owner's). `tests/repository/approvalRepository.test.ts:5` comment, `src/db/schemas/*` comments, `docs/modules/*`, `docs/STATUS.md`, `docs/diecastos-dev-handbook.html` still mention db:push (out of scope).
- BR-MIG-08 is a review rule; 18-20 deferred.

## Map updates
- New: `backend/scripts/lib/migrate.ts` (runner + `parseTarget`), `backend/scripts/db-migrate.ts`; migrations in `backend/src/db/migrations/<14-digit>_<name>/{migration.sql,snapshot.json}`; `backend/backups/` gitignored.
- Journal table `drizzle.__drizzle_migrations(id, hash, created_at, name, applied_at)`; hash = sha256 of the whole `migration.sql`, so any edit is refused (BR-MIG-14).
- Exit codes `db:migrate`: 0 ok, 1 failed (rolled back), 2 guard, 3 journal mismatch.
- Traps: (1) drizzle-orm's own `migrate()` and `drizzle-kit migrate` are NOT used: no hash/ahead check, no pending list, no backup hook. (2) `generate --custom` makes a file holding only a comment; the SQL is typed in by hand, split statements with `--> statement-breakpoint`. (3) `drizzle-kit generate`/`check` need `DATABASE_URL` set (config throws without it). (4) No `pg_dump` on this host; the tests use a fake. (5) A column rename in `generate` is interactive and will hang/fail in CI. (6) `db:reset`'s guard is still the v3 one (known-defects v5 not built here); `db:migrate` already follows v5 (only local `*_test` is "usual").
