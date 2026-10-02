# Findings — db-migrations
| id | sev | decision |
|---|---|---|
| TEST-A | major | test change on backend/tests/scripts/db-migrations.test.ts (new, not yet committed): its "usual local DB" follows BR-KD-30 v3 (`diecast` or `*_test`). Spec BR-MIG-16 points to BR-KD-30, now v5: only a local `*_test` on 5432/5433 is "usual". Align. |
| TEST-B | major | same file: the test that scans `.claude/agents` and `.claude/skills` for `db:push` contradicts spec changelog "BR-MIG-07 'docs' means repo docs, scripts, CI, package.json; `.claude/` files are the owner's". Remove that scan. |
| SEC-1 | blocker | fix: backup dir 0700, dump 0600 (spec changelog 1) |
| SEC-2 | major | fix: guard checks driver host/port/db (spec changelog 3) |
| SEC-3 | major | db-reset.ts same hole: already fixed on work/known-defects (BR-KD-53); resolved by merge, not here |
| SEC-4 / CR-4 | minor | fix: rebuild test DB only on journal mismatch + host check (changelog 3, 5) |
| SEC-6 | minor | fix: safe db name in dump file name (changelog 2) |
| SEC-5 | minor | backlog (pg_dump inherits PGHOSTADDR; sslmode not forwarded) |
| CR-2 / SPEC-5 | minor | fix: push-built DB → 'use db:reset' (BR-MIG-21, changelog 4) |
| SPEC-1 | major | docs: stale db:push in handbook + module maps |
| SEC-7 | major | fix: refuse any connection-override query key in the URL (changelog SEC-7); checked by hand: driver applies ?database= at connect |
