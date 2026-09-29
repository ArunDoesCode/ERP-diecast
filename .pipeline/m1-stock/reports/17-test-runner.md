# Report 17 — test-runner — full verify vs baseline

**Mode:** verify  
**Base commit:** a6ca63e (docs(spec): fold final answers, cross-spec touch-up, freeze all 11 specs)  
**Head:** HEAD (1fe3cfd)  
**Date:** 2026-09-29

## Summary

| Check | Status | Result |
|-------|--------|--------|
| Backend typecheck | PASS | 0 errors |
| Backend lint | PASS | 122 warnings (pre-existing style/cleanup) |
| Backend test | PASS | 157 pass, 0 fail |
| Contract generate/check | PASS | 83 routes, manifest up to date |
| Frontend typecheck | PASS | 0 errors |
| Frontend lint | PASS | 202 files checked, no issues |
| Frontend build | PASS | Next.js 16.2.9 Turbopack, 20 routes |
| **Test integrity** | **BLOCKER** | 2 test commits touched non-test files |

## Details

### Backend typecheck
- Command: `bun --env-file=/Users/turbo_fltr/.claude/diecast-env/stock-test.env run typecheck`
- Result: PASS (0 errors)

### Backend lint
- Command: `bun --env-file=/Users/turbo_fltr/.claude/diecast-env/stock-test.env run lint`
- Result: PASS (exit code 0)
- Warnings: 122 (all pre-existing style violations, no blockers)
  - Unused imports: 5 occurrences
  - noExplicitAny: 8 occurrences (mostly in schemas, one in test helper)
  - noNonNullAssertion: 6 occurrences (test code)
  - useOptionalChain: 1 occurrence

### Backend test
- Command: `bun --env-file=/Users/turbo_fltr/.claude/diecast-env/stock-test.env test`
- Result: PASS
  - **157 tests pass, 0 fail**
  - 432 expect() calls
  - Runtime: 4.18s
  - Files tested: 10 (all .test.ts files under src/service/)

### Contract
- Command: `bun run contract:generate`
- Result: PASS
  - 83 route descriptors written to `.contracts/api-manifest.json`
- Command: `bun run contract:check`
- Result: PASS
  - Manifest up to date

### Frontend typecheck
- Command: `bunx tsc --noEmit`
- Result: PASS (0 errors, 202 files)

### Frontend lint
- Command: `bun run lint`
- Result: PASS (exit code 0)
  - 202 files checked, no fixes needed

### Frontend build
- Command: `NEXT_PUBLIC_API_URL=http://localhost:3001 bun --cwd=frontend run build`
- Result: PASS
  - Next.js 16.2.9 with Turbopack
  - Compiled successfully in 5.9s
  - TypeScript: 7.3s
  - 20 routes generated (1 static [not-found], 15 static prerendered, 4 dynamic)

## Test Integrity Check

**Status: BLOCKER** — Two test commits violated the test-independence rule.

Per `.claude/pipeline/PROTOCOL.md` § Test independence:
- Commits with `test(...)` subject must touch **only** test files: `*.test.ts`, `backend/src/scenarios/**`, `frontend/e2e/**`
- Commits with `feat(...)` or `fix(...)` subject must touch **no** test files

### Violations

| Commit | Subject | Violation |
|--------|---------|-----------|
| cd77a53 | test(m1-stock): regression tests BR-GRN-05, 21, 39 (draft edit, negative average) | Touched `.pipeline/m1-stock/briefs/12-test-writer.md`, `.pipeline/m1-stock/reports/12-test-writer.md` (non-test files) |
| b78b070 | test(m1-stock): BR-GRN-01..44 grn + stock tests (red) | Touched `.pipeline/m1-stock/briefs/03-test-writer.md`, `.pipeline/m1-stock/briefs/04-test-writer.md`, `.pipeline/m1-stock/reports/03-test-writer.md`, `.pipeline/m1-stock/reports/04-test-writer.md` (non-test files) |

### Other checks
- No uncommitted changes to test files (only untracked .pipeline/briefs and reports)
- No production code found checking `NODE_ENV === "test"` or using TEST_ fixture names outside tests

## Analysis

**Backend:** All checks pass. Lint warnings are pre-existing style issues (unused imports, explicit any, non-null assertions) spread across schemas and test helpers — fixable but not blockers.

**Frontend:** All checks pass. Clean typecheck and lint, successful Next.js 16 build.

**Baseline:** No baseline file exists (`reports/00-test-runner-baseline.md` not found). This is the first full verification for this branch.

**Critical Finding:** Test integrity rules were violated in two earlier commits (cd77a53, b78b070) where test commits modified pipeline infrastructure files. While these violations are pre-existing and not newly introduced on this branch, they represent a process deviation — test-writer agents should not be editing `.pipeline/` files as part of a test commit. These files are infrastructure (briefs, reports) and should be managed by the coordinator only.

### Recommendation
- Fix cd77a53 and b78b070 by squashing or amending them to remove the non-test-file changes from the test commits (those files belong in coordinator commits or separate docs commits)
- Or, re-categorize those commits as `chore(...)` if they legitimately include both test files and pipeline updates
- Going forward, test-writer commits must touch only `*.test.ts`, `backend/src/scenarios/**`, `frontend/e2e/**`
