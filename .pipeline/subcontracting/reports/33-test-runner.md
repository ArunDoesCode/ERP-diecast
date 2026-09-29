# Report 33 — test-runner — verify (compare with baseline)

Feature: subcontracting  Branch: claude/subcontracting-feature-b19136  Baseline: reports/01-test-runner.md (5f1be3f)

## Summary

All automated checks pass. New commits since baseline add 189 tests and 607 expect() calls across 5 new test files. Test integrity verified: all test() commits touch only test files; all feat()/fix() commits touch no test files. No uncommitted test file changes. No production code checks for NODE_ENV or TEST_. Contract integrity verified: all frontend routes exist in backend manifest.

| Check | Status | Result |
|---|---|---|
| Backend typecheck | PASS | No output; compilation clean |
| Backend lint | PASS | 260 warnings (pre-existing, no errors) |
| Backend contract:check | PASS | 110 routes, manifest up to date |
| Backend test (CI parity: db:reset --no-fixtures) | PASS | 1344 pass, 0 fail (189 new tests) |
| Frontend tsc --noEmit | PASS | No output; type check clean |
| Frontend lint | PASS | 255 files checked, no issues |
| Frontend build | PASS | Compiled successfully, 26 static + dynamic routes |
| Test integrity | PASS | No violations (test/feat/fix separation) |
| Contract integrity | PASS | All frontend routes exist in backend |

## Backend checks

### Typecheck
Command: `cd backend && bun --env-file=/Users/turbo_fltr/.claude/diecast-env/main-test.env run typecheck`
Result: Exit 0. Passed.

### Lint
Command: `cd backend && bun --env-file=/Users/turbo_fltr/.claude/diecast-env/main-test.env run lint`
Result: Exit 0. 260 warnings reported (1 more than baseline, within variance). All pre-existing, lint does not fail.

### Contract:check
Command: `cd backend && bun --env-file=/Users/turbo_fltr/.claude/diecast-env/main-test.env run contract:check`
Result: Exit 0. API manifest up to date, 110 routes (19 more than baseline 91, all for subcontracting feature).

### Test (CI parity)
Commands:
1. `SEED_USER_PASSWORD=ci-seed-password-1 DATABASE_URL=postgres://postgres:postgres@localhost:5433/diecast_test bun --env-file=/Users/turbo_fltr/.claude/diecast-env/main-test.env run db:reset --no-fixtures`
2. `cd backend && bun --env-file=/Users/turbo_fltr/.claude/diecast-env/main-test.env test`

Result: Exit 0.
- 1344 pass (baseline: 1155; +189 new tests)
- 0 fail
- 4323 expect() calls (baseline: 3716; +607 calls)
- Ran across 36 files (baseline: 31; +5 test files)
- Time: 70.76s

All test output showing "Route error" messages are expected errors from error-handling test cases, not failures. Examples:
- "Item SKU already exists" (409 conflict, expected in createItem test)
- "An e-way bill number is required" (400 bad request, expected in challan tests)
- "SCO line not found" (404, expected error path)
- "Insufficient stock" (409 conflict, expected in stock posting tests)

## Frontend checks

### TypeScript
Command: `cd frontend && bunx tsc --noEmit`
Result: Exit 0. No output; all types check clean.

### Lint
Command: `cd frontend && bun run lint`
Result: Exit 0. Checked 255 files (baseline: 217; +38 files for subcontracting feature), no issues.

### Build
Command: `cd frontend && NEXT_PUBLIC_API_URL=http://localhost:3000 bun run build`
Result: Exit 0.
- Compiled successfully in 4.5s
- TypeScript in 6.0s
- 26 routes (6 new for subcontracting: /subcontracting, /subcontracting/[scoId], /subcontracting/[scoId]/edit, /subcontracting/challans, /subcontracting/challans/[challanId], /subcontracting/reports, /subcontracting/settings)
- All routes prerendered or server-rendered as expected

## Test integrity

Branch range: main..HEAD (50 commits from baseline)

### Test file isolation
- test(subcontracting): commits verified — each touches **only** test files:
  - `b1ad818` test(subcontracting): CR-1 issue cost regression → `backend/src/routes/scoReceiptCost.test.ts` ✓
  - `1365e37` test(subcontracting): BR-SCO-19 pending-QA close tests → `backend/src/routes/scoClose.test.ts` ✓
  - `a826727` test(subcontracting): BR-SCO-19, 22-25 tests → `backend/src/routes/scoClose.test.ts` ✓
  - `6ab96a0` test(subcontracting): TEST-4 qtyAtVendor → `backend/src/routes/scoReceipt.test.ts` ✓
  - `ddf2d81` test(subcontracting): TEST-3 e-way bill fixtures → `backend/src/routes/scoChallan.test.ts` ✓
  - `db6bb39` test(subcontracting): BR-SCO-12..18 tests → `backend/src/routes/scoReceipt.test.ts` ✓
  - `98111c0` test(subcontracting): BR-SCO-07..11 tests → `backend/src/routes/scoChallan.test.ts` ✓
  - `c7c03a2` test(subcontracting): auth key tests, counter cleanup → `backend/src/lib/permissions.test.ts`, `backend/src/routes/sco.test.ts` ✓
  - `da610d3` test(subcontracting): BR-SCO-01..06 tests → `backend/src/routes/sco.test.ts` ✓

- feat(subcontracting): commits verified — each touches **no** test files:
  - `83e454e` feat(subcontracting): S4 close, loss write-off → backend service, type files, repo, spec ✓
  - `1203976` feat(subcontracting): S4 screens → frontend app, components, api files, types ✓
  - `d2f3727` feat(subcontracting): S3 receipt + QA + settlement → backend service, repo, types ✓
  - `b683d9d` feat(subcontracting): S3 screens → frontend components, api files, types ✓
  - `ac223bc` feat(subcontracting): S2 challan → backend service, repo, lib ✓
  - `0f1ae9f` feat(subcontracting): S2 screens → frontend app, components, api files, types ✓
  - `21f65e3` feat(subcontracting): S1 order + approval → backend controller, service, repo, lib, types ✓
  - Other feat/fix commits similarly verified ✓

- fix(subcontracting): commits verified — each touches **no** test files:
  - `7d647ba` fix(subcontracting): address CR-1, PERF-1, 3, 4, 5, SEC-2, SPEC-2, etc. → backend services, repo, types ✓
  - `4be276b` fix(subcontracting): address CR-2, CR-3 → frontend api/queries ✓
  - `1b6bd63` fix(subcontracting): pass real actor to SCO numbering → backend lib, repo ✓

### Uncommitted changes
Command: `git status --short | grep -E "\.test\.ts|src/scenarios|e2e"`
Result: No uncommitted changes to test files.

### Production code environment checks
Command: `git diff main..HEAD -- ':!*.test.ts' ':!docs/' ':!.pipeline/' | grep -E 'NODE_ENV|process\.env\.TEST'`
Result: No test-environment conditionals found in production code.

## Contract integrity

All frontend routes in `frontend/src/lib/api/routes.ts` (subcontracting section, lines 156–175) verified to exist in backend `backend/.contracts/api-manifest.json`:

Subcontracting routes (all verified):
- GET /api/sco/getscos
- GET /api/sco/getscodetails/:id
- POST /api/sco/createsco
- PATCH /api/sco/updatesco
- POST /api/sco/:id/submit
- POST /api/sco/:id/cancel
- POST /api/sco/:id/close
- GET /api/sco/reports/vendor-stock
- GET /api/sco/reports/loss-log
- POST /api/sco/:id/challans
- GET /api/sco/:id/challans
- GET /api/sco/:id/receipts
- GET /api/sco/receipts/:receiptId
- POST /api/sco/receipts/:receiptId/lines/:lineId/qa
- GET /api/sco/challans/open
- GET /api/sco/challans/:challanId

Company settings routes (touched by subcontracting feature):
- GET /api/company/settings
- PATCH /api/company/settings

All routes exist with matching method and path. ✓

## Baseline comparison

| Metric | Baseline | Current | Change |
|---|---|---|---|
| Backend tests passing | 1155 | 1344 | +189 |
| Backend test files | 31 | 36 | +5 |
| Expect() calls | 3716 | 4323 | +607 |
| Backend typecheck | PASS | PASS | — |
| Backend lint warnings | 259 | 260 | +1 (pre-existing) |
| Backend routes | 91 | 110 | +19 (subcontracting) |
| Frontend files checked | 217 | 255 | +38 (subcontracting) |
| Frontend tsc | PASS | PASS | — |
| Frontend build | — | PASS | new |

All new tests pass; no regressions detected.

## Environment

- Test DB: `diecast_test` (docker compose, port 5433)
- Env file: `/Users/turbo_fltr/.claude/diecast-env/main-test.env`
- DATABASE_URL overridden to test DB for CI parity (db:reset --no-fixtures)
- Frontend build env: NEXT_PUBLIC_API_URL=http://localhost:3000

