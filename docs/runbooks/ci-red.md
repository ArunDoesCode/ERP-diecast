# CI red

## Symptom
`gh pr checks <n>` shows `backend` or `frontend` failed, or the same check fails locally.

## Check
```bash
gh pr checks <n>
gh run list --branch <branch> --limit 5
gh run view <run-id> --log-failed          # find the first failing step
```
CI order (`.github/workflows/ci.yml`), backend: typecheck → lint → `db:reset --no-fixtures` on the test DB
→ migration sync → `bun test` → `contract:check`. Frontend: `bunx tsc --noEmit` → `bun run lint`.
A step that fails hides the steps after it. Reproduce locally, then pick the branch below.

## Fix
**Typecheck** — `cd backend && bun run typecheck` / `cd frontend && bunx tsc --noEmit`
1. Error in production code → the owning developer agent, commit `fix(<id>): …`.
2. Error in a `*.test.ts` file after a code change (past: F-TEST-9, CR-8-T) → test-writer, with the spec
   rule quoted in `findings.md`, commit `test(<id>): …`.

**Lint** — `cd backend && bun run lint` / `cd frontend && bun run lint` (both are Biome)
1. Production files: `bunx biome check --write <file> <file>` then commit `fix(<id>): lint`.
2. Test files (past: F-TEST-4) → test-writer runs the same command and commits `test(<id>): format`.
3. Do not use `bun run fix` on the backend: it rewrites every file, test files included.

**Tests** — `cd backend && bun test` (one file: `bun test tests/routes/<file>.test.ts`)
1. Dozens of unrelated failures at once (403, missing roles, empty tables; past: F-TEST-10) → the test DB
   lost its seed → [test-db-reset.md](test-db-reset.md), then run again.
2. Green locally, red in CI (past: CI-1) → CI builds the DB with `db:reset --no-fixtures`; rebuild your
   test DB the same way ([test-db-reset.md](test-db-reset.md)) and rerun before changing anything.
3. Connection refused → [docker-or-port-problem.md](docker-or-port-problem.md).
4. Real failure → default: the code is wrong → developer agent. Test-writer only if the failure message
   contradicts a quoted spec rule.
5. `TEST-INTEGRITY` (a `feat(`/`fix(` commit touches a test file) → blocker; new commits must split them.

**contract:check** → [contract-manifest-stale.md](contract-manifest-stale.md).

**Migration sync** ("Schema changed without a migration")
```bash
cd backend && bun run db:generate            # needs DATABASE_URL set; it does not connect
git status --porcelain -- src/db/migrations  # new files = the missing migration
```
1. Commit the new migration with the schema change: `feat(<id>): migration for <what>`.
2. Never edit a migration that is already on `main`; add a new one.
3. `bun run db:test:prepare`, then `bun test`.

After any fix: push, then `gh pr checks <n> --watch`.

## If it fails twice
Same job red after 2 fix pushes → find the slice that owns the failing file and
[park-a-slice.md](park-a-slice.md). If the failure is not in any slice of this run (red on the base too:
compare `.pipeline/<id>/reports/00-test-runner-baseline.md`) → open an issue (`defect`, `mod:<module>`),
list it in `HANDOVER.md` under "red before this run", continue.

## Never
- Never hand over a PR with CI red and no parked issue that explains it.
- Never skip, delete or loosen a test, and never edit `.github/workflows/ci.yml` to get green.
- Never re-run CI hoping it passes without reading `--log-failed` first.
- Never run `bun run db:reset` without [test-db-reset.md](test-db-reset.md).
