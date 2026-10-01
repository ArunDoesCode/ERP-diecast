# Findings — db-migrations
| id | sev | decision |
|---|---|---|
| TEST-A | major | test change on backend/tests/scripts/db-migrations.test.ts (new, not yet committed): its "usual local DB" follows BR-KD-30 v3 (`diecast` or `*_test`). Spec BR-MIG-16 points to BR-KD-30, now v5: only a local `*_test` on 5432/5433 is "usual". Align. |
| TEST-B | major | same file: the test that scans `.claude/agents` and `.claude/skills` for `db:push` contradicts spec changelog "BR-MIG-07 'docs' means repo docs, scripts, CI, package.json; `.claude/` files are the owner's". Remove that scan. |
