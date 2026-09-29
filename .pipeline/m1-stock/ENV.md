# Running checks in this worktree (m1-stock)

No `backend/.env`. Prefix every backend bun command:

    bun --env-file=/Users/turbo_fltr/.claude/diecast-env/stock-test.env <command>

Test DB: `diecast_stock_test` (port 5433). Never use `diecast_test` (the other session uses it).
After a schema change: `bun --env-file=… run db:test:prepare`.

Boundaries with the auth session (branch `work/m1`):
- Don't edit `backend/src/lib/{token,auth-middleware,route-registry}.ts`, `backend/src/db/schemas/01_auth.ts`,
  `seed_page_access.sql`, setup routes/screens, or any spec.
- Guard new/changed routes with today's `requireRole(...)` using the seed roles of the spec's permission key
  (+ super-admin), with a comment `// perm: <key>` on that line.
- Service role checks: add `// perm: <key>` comments; no new role-name lists.
- PO/PR code belongs to the other session: smallest possible change in `poRepository`/`poService`, listed in the report.
