# Baseline Test Report — m1

**Date:** 2026-09-29  
**Branch:** work/m1  
**Mode:** Baseline (recording initial state)

## Summary

| Check | Result | Details |
|-------|--------|---------|
| Backend typecheck | ✓ PASS | 0 exit code |
| Backend lint | ✓ PASS | 13 pre-existing warnings (no new issues) |
| Backend tests | ✓ PASS | 23 pass, 0 fail, 47 expect() calls |
| Contract generate | ✓ PASS | 82 route descriptors written |
| Frontend typecheck | ✓ PASS | 0 exit code |
| Frontend lint | ✓ PASS | 0 exit code |
| Test integrity | ✓ PASS | All commits are docs(spec); no code changes in branch |

## Details

### Backend typecheck
```
tsc --noEmit
EXIT_CODE=0
```

### Backend lint (pre-existing warnings)
Biome identified 13 fixable warnings, all pre-existing:
- Unused imports: `primaryKey`, `unique`, `ApprovalChainStep`, `prTypeEnum`
- Lint rules: `noExplicitAny` (6 occurrences), `useOptionalChain` (1), `noNonNullAssertion` (2)

No new violations introduced.

### Backend tests
```
23 pass
0 fail
47 expect() calls
Ran 23 tests across 8 files. [610.00ms]
EXIT_CODE=0
```

All test suites passing:
- `backend/src/app.test.ts`
- `backend/src/service/authService.test.ts`
- `backend/src/service/approvalService.test.ts`
- `backend/src/repository/approvalRepository.test.ts`
- And others (8 files total)

### Contract verification
Contract generation completed successfully:
```
Wrote 82 route descriptors to .contracts/api-manifest.json
EXIT_CODE=0
```

### Frontend typecheck
```
bunx tsc --noEmit
EXIT_CODE=0
```

### Frontend lint
```
biome check
Checked 201 files in 85ms. No fixes applied.
EXIT_CODE=0
```

### Test integrity
- **Commits on branch:** 6 commits, all `docs(spec):` type
- **Files modified:** Only spec files and docs
- **Uncommitted changes:** None affecting production/test code
- **Production code checks:** Found pre-existing `NODE_ENV === "test"` check in `backend/src/app.ts:25` (logging conditional), not a new violation

**Conclusion:** Test independence rules are satisfied. No code changes in this branch.

## Pre-existing Issues

**Node:** The only existing issue flagged:

| ID | Severity | Area | File:Line | Issue |
|---|---|---|---|---|
| TEST-INTEGRITY-1 | Minor | backend | `backend/src/app.ts:25` | Production code checks `NODE_ENV === "test"` to skip logging during tests |

This is pre-existing code, not introduced in this branch. It bypasses logging conditionally based on environment, which violates strict test-production separation but exists in the baseline.
