# Report 06 — spec-reviewer — db-migrations (spec v1, frozen)

Gate: `docs/specs/db-migrations.md` status frozen, v1. Diff: `git diff main...HEAD`. Tests: `bun test tests/scripts/db-migrations.test.ts` -> 46 pass, 1 fail (the `.claude/**` db:push scan, red by design: `.claude/agents/backend-dev.md:39`, `.claude/skills/feature/SKILL.md:29`).
Verdict: READY with 0 blockers, 2 major, 4 minor. Both majors are doc leftovers or a decision, not code.

## Rule coverage
| BR | Enforced at | Test (name starts) | OK |
|---|---|---|---|
| 01 | `src/db/migrations/20261001074802_baseline` | BR-MIG-01 (6 tests incl. generate/check says nothing) | yes |
| 02 | old files deleted | BR-MIG-02 x2 | yes |
| 03 | baseline SQL | BR-MIG-03 x3 | yes |
| 04 | `...074833_drop_legacy_pages/migration.sql` (exactly 2 DROPs) | BR-MIG-04 x2 | yes |
| 05 | `package.json` db:generate, db:migrate | BR-MIG-05 x2 ("add a column -> one folder" not tested, needs a schema edit) | yes |
| 06 | ci.yml step (via 12) | BR-MIG-01/06 | yes |
| 07 | package.json, scripts, CI, WORKFLOW, backend/CLAUDE.md | BR-MIG-07 x3 | partly, see SPEC-1 |
| 08 | review rule: diff only deletes the 3 old July folders (spec'd by BR-MIG-02); nothing else merged is edited/renamed | n/a | yes |
| 09 | `scripts/db-reset.ts` "apply migrations" step | BR-MIG-09 x2 | yes |
| 10 | `scripts/prepare-test-db.ts` | BR-MIG-10 x2 | yes |
| 11 | `scripts/prepare-test-db.ts` rebuild + `resolveTestDatabaseUrl` | BR-MIG-11 x3 | yes |
| 12 | `.github/workflows/ci.yml` new step after db:reset | BR-MIG-12 x3 (text check only; real CI run still to see) | yes |
| 13 | `scripts/db-migrate.ts`, `scripts/lib/migrate.ts` applyMigrations (one tx) | BR-MIG-13 x2 | yes |
| 14 | `lib/migrate.ts` planFrom | BR-MIG-14 x2 | yes |
| 15 | `db-migrate.ts` | BR-MIG-15 | yes |
| 16 | `db-migrate.ts` backup(), `.gitignore` | BR-MIG-16 x6 | yes |
| 17 | `db-migrate.ts` guard before connect/backup | BR-MIG-17 x4 | yes |
| 21 | nothing to build (db:adopt absent) | none needed | see SPEC-5 |
| 22 | no migrator import in `src/` | BR-MIG-22 x2 | yes |

2b tests-from-spec: asserted outcomes (exit 2 for confirm, rollback, "up to date", refusals, names) all trace to spec text or its examples. No BRIEF-CONTAMINATION in reports 01/02; briefs 01/02 are pointer-only (brief 02 adds a Worktree/env note, harmless). TEST-B (delete `.claude` scan) was never applied, so the red test remains; the owner decides.

## Findings
| id | severity | area | file:line | finding | suggested fix |
|---|---|---|---|---|---|
| SPEC-1 | major | spec | docs/STATUS.md:32; docs/diecastos-dev-handbook.html:651,931; docs/modules/{subcontracting,auth-setup,grn,suppliers}.md | BR-MIG-07 says db:push is removed from docs. Live instructions still tell people to run `db:push` (STATUS next-action line, handbook command table and glossary). The test only scans package.json, scripts/, CLAUDE.md, WORKFLOW.md, .github, so it misses these. Module-map lines are history. | Update STATUS.md:32 and handbook 651/931 (maps' gotchas if you want them clean); decisions.md D-004 is append-only, mark superseded. Optional: widen the test scan (test-writer). |
| SPEC-2 | major | spec | backend/CLAUDE.md:93,138-142 vs spec "Who can do what" | Spec table says `db:migrate` on a local dev DB needs nothing. Changelog (BR-KD-30 v5) makes only a local `*_test` DB on 5432/5433 "usual". So the normal dev `.env` DB `diecast` needs `MIGRATE_CONFIRM=diecast` and a working `pg_dump` for every `db:migrate`. Code follows the changelog; CLAUDE.md tells devs to just run it. | Owner decision (Q1). Recommend keep the code; fix the spec table and backend/CLAUDE.md to say `diecast` needs `MIGRATE_CONFIRM` + pg_dump, or run dev work on a `*_test` DB. |
| SPEC-3 | minor | backend | scripts/lib/migrate.ts (`outOfOrder` in planFrom) | New refusal "pending migration older than one already applied" is in no rule. Also makes db:test:prepare rebuild (BR-MIG-11 names only "journal row the repo doesn't have"). | Add a line to BR-MIG-14 via /spec, or remove. |
| SPEC-4 | minor | backend | scripts/lib/migrate.ts (`pg_advisory_xact_lock`); scripts/db-migrate.ts (same-minute dump file refused; multi-host / no-db URL refused exit 2; exit 3 for journal) | Small behaviours the spec does not describe. Safe; none contradict a rule. | Record in spec changelog as "clarified during build", or drop. |
| SPEC-5 | minor | spec | scripts/db-migrate.ts / backend/CLAUDE.md | BR-MIG-21 ("old dev DB -> db:reset") is written nowhere. A push-built dev DB run through `db:migrate` fails on the baseline with a raw "already exists" error (rolled back, harmless), no hint. | One line in backend/CLAUDE.md and/or the error: "built by push? use db:reset". |
| SPEC-6 | minor | spec | docs/specs/known-defects.md BR-KD-35, BR-KD-52 vs BR-MIG-09/10/11 | KD-35 still says "push schema"; KD-52 says `db:test:prepare` = `db:reset --no-fixtures`. Code follows MIG-10/11 (applies migrations, rebuilds a push-built DB), not db:reset. Two specs describe two builds. Also stale `db:push` comments in `src/db/schemas/02_procurement-*.ts` and `tests/repository/approvalRepository.test.ts:5`. | Pick one (recommend MIG-10/11; edit KD-35/52 via /spec). Test comment: test-writer follow-up. |

Not in scope, noted: `.claude/settings.json:46` allow-rule for `drizzle-kit push` (owner).
