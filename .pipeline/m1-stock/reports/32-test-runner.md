# Report 32 — test-runner — full verify vs baseline

**Mode:** verify  
**Base commit:** a6ca63e (docs(spec): fold final answers, cross-spec touch-up, freeze all 11 specs)  
**Head:** HEAD (current branch tip)  
**Date:** 2026-09-29

## Summary

| Check | Status | Result |
|-------|--------|--------|
| Backend typecheck | PASS | 0 errors |
| Backend lint | PASS | 191 warnings (pre-existing style/cleanup) |
| Backend test | PASS | 302 pass, 0 fail |
| Contract generate/check | PASS | 84 routes, manifest up to date |
| Frontend typecheck | PASS | 0 errors |
| Frontend lint | PASS | 206 files checked, no issues |
| Frontend build | PASS | Next.js 16.2.9, 21 routes |
| **Test integrity** | **BLOCKER** | 4 test commits touched non-test files (.pipeline/) |

## Details

### Backend typecheck
- Command: `bun --env-file=/Users/turbo_fltr/.claude/diecast-env/stock-test.env run typecheck`
- Result: PASS (0 errors)

### Backend lint
- Command: `bun --env-file=/Users/turbo_fltr/.claude/diecast-env/stock-test.env run lint`
- Result: PASS (exit code 0)
- Warnings: 191 (all pre-existing style violations)
  - Increase from baseline 13 → report-17: 122 → current: 191 is due to new code additions (inventory masters, stock, services/machines)
  - Predominantly: noUnusedImports (5), noExplicitAny (8), noNonNullAssertion (6), useOptionalChain (1) per baseline; new additions in schemas and service files follow same patterns

### Backend test
- Command: `bun --env-file=/Users/turbo_fltr/.claude/diecast-env/stock-test.env test`
- Result: PASS
  - **302 tests pass, 0 fail** (up from 157 in report-17)
  - 875 expect() calls
  - Runtime: 4.91s
  - Files tested: 12 test files
  - New tests added since report-17: inventory masters, stock, services tests for BR-INV-01..25

### Contract
- Command: `bun run contract:generate`
- Result: PASS
  - 84 route descriptors written to `.contracts/api-manifest.json` (1 new route since report-17: 83 → 84)
- Command: `bun run contract:check`
- Result: PASS
  - Manifest up to date

### Frontend typecheck
- Command: `bunx tsc --noEmit`
- Result: PASS (0 errors, 206 files)

### Frontend lint
- Command: `bun run lint`
- Result: PASS (exit code 0)
  - 206 files checked, no fixes needed (5 new files since report-17: 201 → 206)

### Frontend build
- Command: `NEXT_PUBLIC_API_URL=http://localhost:3001 bun run build`
- Result: PASS
  - Next.js 16.2.9 with Turbopack
  - Compiled successfully in 2.6s
  - 21 routes (8 new dynamic/static routes for inventory)
  - TypeScript: 3.8s

## Test Integrity Check

**Status: BLOCKER** — Four test commits violated the test-independence rule per `.claude/pipeline/PROTOCOL.md` § Test independence.

Rule violations:
- Commits with `test(...)` subject must touch **only** test files: `*.test.ts`, `backend/src/scenarios/**`, `frontend/e2e/**`
- Commits with `feat(...)` or `fix(...)` subject must touch **no** test files

### Violations Found

All violations are in the form of test commits also touching `.pipeline/m1-stock/briefs/` and `.pipeline/m1-stock/reports/` files.

| Commit | Subject | Files Touched | Violation |
|--------|---------|----------------|-----------|
| 7202d74 | test(m1-stock): more BR-INV-07, 13, 15, 24 tests | `.pipeline/m1-stock/briefs/28-test-writer.md`, `.pipeline/m1-stock/reports/28-test-writer.md`, `backend/src/service/inventoryMasters.test.ts`, `backend/src/service/inventoryStock.test.ts` | test commit touched non-test files (.pipeline/) |
| 694efd5 | test(m1-stock): BR-INV-01..25 tests (red); TEST-3 manual movement tests to counted-qty shape | `.pipeline/m1-stock/briefs/21-test-writer.md`, `.pipeline/m1-stock/briefs/22-test-writer.md`, `.pipeline/m1-stock/reports/21-test-writer.md`, `.pipeline/m1-stock/reports/22-test-writer.md`, `backend/src/service/inventoryMasters.test.ts`, `backend/src/service/inventoryStock.test.ts`, `backend/src/service/stockPosting.test.ts` | test commit touched non-test files (.pipeline/) |
| cd77a53 | test(m1-stock): regression tests BR-GRN-05, 21, 39 (draft edit, negative average) | `.pipeline/m1-stock/briefs/12-test-writer.md`, `.pipeline/m1-stock/reports/12-test-writer.md`, `backend/src/service/grnService.test.ts`, `backend/src/service/stockPosting.test.ts` | test commit touched non-test files (.pipeline/) [pre-existing, flagged in report-17] |
| b78b070 | test(m1-stock): BR-GRN-01..44 grn + stock tests (red) | `.pipeline/m1-stock/briefs/03-test-writer.md`, `.pipeline/m1-stock/briefs/04-test-writer.md`, `.pipeline/m1-stock/reports/03-test-writer.md`, `.pipeline/m1-stock/reports/04-test-writer.md`, `backend/src/service/grnService.test.ts`, `backend/src/service/stockPosting.test.ts` | test commit touched non-test files (.pipeline/) [pre-existing, flagged in report-17] |

### Other Integrity Checks

- ✅ No uncommitted changes to test files (only untracked `.pipeline/` briefs)
- ✅ No `feat(...)` or `fix(...)` commits touch test files
- ✅ No production code found checking `NODE_ENV === "test"` or using TEST_ fixture names outside tests

## Analysis vs Baseline and Report-17

**Baseline (00-test-runner-baseline.md):**
- Backend lint: 13 warnings
- Backend test: 23 tests pass
- Contract: 82 routes
- Frontend lint: 201 files
- Overall: All checks passed

**Report-17 (full verify after GRN/stock initial build):**
- Backend lint: 122 warnings (increase due to GRN + stock code)
- Backend test: 157 tests pass
- Contract: 83 routes
- Frontend lint: 202 files
- Frontend build: 20 routes
- Test integrity: **BLOCKER** (2 test commits: cd77a53, b78b070)

**Report-32 (current, after inventory spec freeze + build completion):**
- Backend lint: 191 warnings (further increase due to inventory masters/stock/services code)
- Backend test: 302 tests pass (new inventory tests added)
- Contract: 84 routes (1 new)
- Frontend lint: 206 files (5 new inventory screens)
- Frontend build: 21 routes (new inventory routes)
- Test integrity: **BLOCKER** (4 test commits: 7202d74, 694efd5, cd77a53, b78b070)

### New Violations (since report-17)
Two additional test commits in the new inventory work:
- **7202d74**: test commit in inventory masters/stock tests
- **694efd5**: test commit in inventory tests (red phase)

These follow the same pattern as the pre-existing violations (cd77a53, b78b070) — test-writer commits include pipeline briefing/reporting files.

## Production Readiness Assessment

**Code Quality:**
- All TypeScript checks pass (types clean, no errors)
- Backend lint 191 warnings are pre-existing style patterns (noUnusedImports, noExplicitAny, noNonNullAssertion) across schemas and service files — not blockers for functionality but should be addressed in maintenance pass

**Tests:**
- 302 tests covering BR-GRN-01..44, BR-INV-01..25 + new inventory tests (all specs frozen)
- All tests pass, 875 assertions
- Test coverage: GRN service, stock posting, inventory masters, inventory stock

**Contract & API:**
- 84 routes generated and validated
- Manifest matches backend routes
- Frontend routes compile successfully

**Critical Finding:**
Test integrity rule violations block this verification. While violations cd77a53 and b78b070 are pre-existing (flagged in report-17), the two new violations (7202d74, 694efd5) in the current work extend the pattern — test-writer commits should not modify `.pipeline/` infrastructure files (those belong in coordinator commits only).

## Recommendations

1. **Block current work on test integrity:** The 4 test commits must be corrected per protocol before merging:
   - Separate test files into `test(...)` commits
   - Move `.pipeline/briefs/` and `.pipeline/reports/` changes into coordinator `chore(...)` or `docs(...)` commits

2. **Fix pre-existing violations:** Commits cd77a53 and b78b070 should also be corrected via squash/rebase to remove `.pipeline/` file changes

3. **Going forward:** test-writer must only commit test files; pipeline infrastructure is coordinator-only

4. **Code quality cleanup (non-blocking):** Address 191 lint warnings in a separate maintenance pass (noUnusedImports, noExplicitAny, noNonNullAssertion patterns in schemas and service files)
