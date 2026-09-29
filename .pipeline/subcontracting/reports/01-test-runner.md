# Report 01 — test-runner — baseline

Feature: subcontracting  Branch: claude/subcontracting-feature-b19136  Baseline: origin/main 5f1be3f

## Summary

All automated checks pass on the baseline commit (5f1be3f).

| Check | Status | Result |
|---|---|---|
| Backend typecheck | PASS | No output; compilation clean |
| Backend lint | PASS | 259 pre-existing warnings (Biome), no errors |
| Backend contract:check | PASS | 91 routes, manifest up to date |
| Backend test | PASS | 1155 pass, 0 fail |
| Frontend tsc --noEmit | PASS | No output; type check clean |
| Frontend lint | PASS | 217 files checked, no issues |

## Backend checks

### Typecheck
Command: `cd backend && bun --env-file=/Users/turbo_fltr/.claude/diecast-env/main-test.env run typecheck`
Result: Exit 0. Passed.

### Lint
Command: `cd backend && bun --env-file=/Users/turbo_fltr/.claude/diecast-env/main-test.env run lint`
Result: Exit 0. 259 warnings reported:
- Unused imports (20+)
- `noExplicitAny` (15+)
- `noNonNullAssertion` (10+)
- `useOptionalChain` (2)
- Other style issues

All pre-existing, lint does not fail.

### Contract:check
Command: `cd backend && bun --env-file=/Users/turbo_fltr/.claude/diecast-env/main-test.env run contract:check`
Result: Exit 0. API manifest up to date, 91 routes.

### Test
Command: `cd backend && bun --env-file=/Users/turbo_fltr/.claude/diecast-env/main-test.env test`
Result: Exit 0.
- 1155 pass
- 0 fail
- 3716 expect() calls
- Ran tests across 31 files in 46.44s

All test output showing "Route error" messages are expected errors from error-handling test cases, not failures.

## Frontend checks

### TypeScript
Command: `cd frontend && bunx tsc --noEmit`
Result: Exit 0. No output; all types check.

### Lint
Command: `cd frontend && bun run lint`
Result: Exit 0. Checked 217 files, no fixes applied.

## Test integrity

Branch is at baseline (HEAD = origin/main = 5f1be3f). No new commits to check.

Uncommitted changes: `docs/STATUS.md` (not a test file, no violation).

No violations found.

## Environment

- Test DB: `diecast_test` (docker compose, port 5433)
- Env file: `/Users/turbo_fltr/.claude/diecast-env/main-test.env`
- DATABASE_URL overridden to test DB for all backend commands
