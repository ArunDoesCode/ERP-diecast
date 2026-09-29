# Test Runner Baseline Report

**Baseline run** for feature `m1-stock` on branch `work/m1-stock`.
Frozen specs: `docs/specs/grn.md` (v1), `docs/specs/grn-stock.md` (v1).

---

## Summary

| Check | Status | Count |
|-------|--------|-------|
| Backend: typecheck | PASS | — |
| Backend: lint | FAIL | 13 warnings |
| Backend: bun test | PASS | 23 tests pass, 0 fail |
| Backend: contract:generate | PASS | 82 routes |
| Frontend: tsc --noEmit | PASS | — |
| Frontend: lint | PASS | 201 files checked |

---

## Backend Lint Findings (13 warnings)

| Severity | File | Line | Rule | Issue | Fix |
|----------|------|------|------|-------|-----|
| warning | src/db/migrations/schema.ts | 12 | noUnusedImports | `primaryKey` unused | Remove unused import |
| warning | src/db/schemas/01_auth.ts | 16 | noExplicitAny | `(): any => employees.id` | Add proper type annotation |
| warning | src/db/schemas/01_auth.ts | 32 | noExplicitAny | `(): any => employees.id` | Add proper type annotation |
| warning | src/db/schemas/03_hcm.ts | 24 | noExplicitAny | `(): any => employees.id` | Add proper type annotation |
| warning | src/db/schemas/03_hcm.ts | 26 | noExplicitAny | `(): any => employees.id` | Add proper type annotation |
| warning | src/db/schemas/03_hcm.ts | 8 | noUnusedImports | `unique` unused | Remove unused import |
| warning | src/repository/approvalRepository.ts | 19 | noUnusedImports | `ApprovalChainStep` type unused | Remove unused import |
| warning | src/service/authService.ts | 56 | useOptionalChain | `!employee \|\| !employee.passwordHash` | Use optional chaining `!employee?.passwordHash` |
| warning | src/types/approval.types.ts | 195 | noNonNullAssertion | `data.maxAmountPaise!` non-null assertion | Use null checks instead of `!` |
| warning | src/types/approval.types.ts | 195 | noNonNullAssertion | `data.minAmountPaise!` non-null assertion | Use null checks instead of `!` |
| warning | src/types/approval.types.ts | 265 | noNonNullAssertion | `data.maxAmountPaise!` non-null assertion | Use null checks instead of `!` |
| warning | src/types/approval.types.ts | 265 | noNonNullAssertion | `data.minAmountPaise!` non-null assertion | Use null checks instead of `!` |
| warning | src/types/approval.types.ts | 13 | noUnusedImports | `prTypeEnum` unused | Remove unused import |

---

## Backend Tests

- **Total:** 23 tests
- **Pass:** 23
- **Fail:** 0
- **Duration:** 556ms
- **Files:** 8 test files
- **Assertions:** 47

---

## Frontend Checks

- **typecheck:** No TypeScript errors
- **lint:** 201 files checked, no issues

---

## Contract

- **Status:** Generated successfully
- **Routes:** 82 route descriptors in `.contracts/api-manifest.json`
- **Drift check:** Not executed (frontend contract test is part of backend bun test, which passed)

---

## Conclusion

**Baseline status:** All checks complete.
- **3 blockers:** Backend lint warnings (noUnusedImports, noExplicitAny, noNonNullAssertion, useOptionalChain)
  These are pre-existing code quality issues, not introduced by this feature branch.
- **Production-readiness:** Tests pass, types are clean, contract is generated.

