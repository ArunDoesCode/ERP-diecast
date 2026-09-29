# 10 test-writer — BR-AUTH-11, BR-AUTH-26

Files: `backend/src/lib/no-role-names.test.ts` (4 tests), `backend/src/routes/pr-machine.test.ts` (12 tests). Typecheck and biome clean.

## Results (no FAIL-BUG; code not switched yet)
| Test | Result |
|---|---|
| BR-AUTH-11 scan covers routes/service/controller/repository | PASS |
| BR-AUTH-11 custom-named role with grn.view reads GRNs, pr.manage-only role gets 403 | PASS |
| BR-AUTH-11 no role-name string literal outside seed files + auth-middleware | FAIL-EXPECTED (approvalRepository:394, types/auth.types.ts, lib/token.ts, employeeService:14, approvalService:112-114,707, grnService:24, routes/auth.ts) |
| BR-AUTH-11 no `requireRole(` / `*_ROLES` constants | FAIL-EXPECTED (grnService, routes/auth.ts) |
| BR-AUTH-26 machine list: pr.link_machine w/o asset.manage 200 | PASS (check if it is by role list today) |
| BR-AUTH-26 asset.manage 200; pr.manage-only 403; no keys 403; link key does not open machine writes 403 | PASS |
| BR-AUTH-26 create with machine w/o key 403; no PR left behind; update to add machine w/o key 403 | FAIL-EXPECTED |
| BR-AUTH-26 link holder creates PR with machine (assetId stored); updates PR with machine | FAIL-EXPECTED |
| BR-AUTH-26 same user creates PR without machine 201; super-admin creates with machine 201 | PASS or FAIL-EXPECTED (per run) |

Exact pass/fail split: no-role-names 2 pass / 2 fail; pr-machine 7 pass / 5 fail. Fixtures use `test_prmach_` / `test_norole_` prefixes and clean up (including `document_number_counters` rows created by fixture users, which otherwise block employee delete).

## Notes
- BR-AUTH-11 scan allows exactly: `db/`, `test/`, `lib/permissions.ts`, `lib/permissions-sync.ts` (seed) and `lib/auth-middleware.ts` (super-admin check). Legacy files (`types/auth.types.ts`, `lib/token.ts` Role type) will need the literals removed or a spec-cited exemption; a `SEED_FILES` widening needs coordinator/spec decision, not a silent edit.
- Frontend half of BR-AUTH-11 is not covered (backend-only brief).
- Machine list "name and code": `machines` has no `code` column yet (inventory Q3=A, BR-INV-16), so only id/name asserted.
- "Active machine list": machines have no active flag, so not tested.

## QUESTIONS
1. Spec conflict: `createPrSchema` requires `assetId` when `type = maintenance`, but BR-AUTH-26 says a PR saved with a machine by a non-holder is 403 (back_office lacks `pr.link_machine`). Can back_office still create a maintenance PR? Tests use type `tooling` and avoid this. Needs a spec answer.
2. I treated PR "Machine" as `purchase_requests.assetId`. Confirm.
