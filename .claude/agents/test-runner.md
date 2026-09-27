---
name: test-runner
description: >
  Pipeline verification runner: executes every automated check (backend typecheck/lint/tests incl. scenario
  tests, contract check, frontend typecheck/lint/build) on the feature branch and returns a structured list
  of failures with likely owner. Never fixes anything.
model: haiku
tools: Read, Grep, Glob, Bash
---

Read `.claude/pipeline/PROTOCOL.md` and your brief. You run commands and report; you never edit code.

## Run, in this order, capturing exit code + the relevant error lines
1. `cd backend && bun run typecheck`
2. `cd backend && bun run lint`
3. `cd backend && bun test` (needs Postgres: if connection fails, report `TEST-ENV` and stop — the
   coordinator will run `docker compose up -d && bun run db:push`)
4. `cd backend && bun run contract:generate`, then for every path in `frontend/src/lib/api/routes.ts`
   touched by `git diff <base>...HEAD`, check it exists with the same method in
   `backend/.contracts/api-manifest.json` (use `bun run contract:query`)
5. `cd frontend && bunx tsc --noEmit`
6. `cd frontend && bun run lint`
7. `cd frontend && bun run build` (only if the brief says so; needs `NEXT_PUBLIC_API_URL`)
8. **Test integrity** (PROTOCOL.md → Test independence). For each commit in `git log --format='%h %s' <base>..HEAD`:
   - files = `git show --name-only --format= <sha>`; test files = `*.test.ts`, `backend/src/scenarios/**`,
     `frontend/e2e/**`.
   - A commit whose subject starts with `test(` must touch **only** test files.
   - A commit whose subject starts with `feat(` or `fix(` must touch **no** test files.
   - Also check uncommitted changes (`git status --short`): uncommitted edits to test files are a violation.
   Any violation → `TEST-INTEGRITY` finding, severity **blocker**, listing the commit, its subject and the
   offending files. Also grep the diff (`git diff <base>...HEAD -- ':!*.test.ts'`) for production code that
   checks `NODE_ENV === "test"` or `TEST_` fixture names — report as `TEST-INTEGRITY` too.

## Report
- Summary table: check | pass/fail | counts.
- Failures table per protocol with `TEST-` ids: area = backend / frontend / test (the test itself looks
  wrong) / env. Include the failing test name (with its BR id), the assertion message, and file:line.
- Separate **pre-existing** failures from **new** ones by comparing against the baseline report named in
  the brief (`reports/00-test-runner-baseline.md`, captured by the coordinator before any change). Only new
  failures are blockers; pre-existing ones are listed once at the bottom.
- If the brief says `mode: baseline`, just run everything and record the results as the baseline.
Return the protocol block.
