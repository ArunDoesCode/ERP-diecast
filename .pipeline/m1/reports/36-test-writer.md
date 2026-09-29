# Report 36 — test-writer — PR lifecycle tests

File: `backend/src/routes/pr-lifecycle.test.ts` (62 tests, HTTP via createApp, real DB). Result: 45 pass, 17 fail. Typecheck + biome clean.
Run: `bun --env-file=/Users/turbo_fltr/.claude/diecast-env/main-test.env test src/routes/pr-lifecycle.test.ts`

## FAIL-BUG (code exists, breaks the rule)
| id | BR | test | got | suspect |
|---|---|---|---|---|
| TEST-36-1 | BR-PR-15 | edit on pending_approval PR | 200 (expected 409 PR_NOT_EDITABLE) | prService.update status check |
| TEST-36-2 | BR-PR-21 | edit after reject | 200 (expected 409) | same |
| TEST-36-3 | BR-PR-17 | other pr.manage holder edits | 200 (expected 403 PR_NOT_REQUESTER) | prService.update, no requester check |
| TEST-36-4 | BR-PR-15 | delete only line | 200 (expected 400 PR_MIN_ONE_LINE) | prService.update |
| TEST-36-5 | BR-PR-19 | auto-approve submit | approvedBy = 1317 (expected null, BR-APR-28) | approvalService submit auto-approve path |
| TEST-36-6 | BR-PR-11 | estimate recomputed at submit | old estimate kept (10000, expected 20000) | approvalService.submit does not recompute |
| TEST-36-7 | BR-PR-08 | required-by date yesterday | 201 (expected 400) | no date check |
| TEST-36-8 | BR-PR-06 | inactive item | 201 (expected 400 PR_INVALID_ITEM) | prService.create checks existence only |
| TEST-36-9 | BR-PR-06 | unknown item / duplicate item (create, insert, update) | 400 but code `BAD_REQUEST` (expected PR_INVALID_ITEM / PR_DUPLICATE_ITEM) | error codes missing |
| TEST-36-10 | BR-PR-08 | decimal qty 12.5, 2.5, 0.125, 0.333 | 400 (expected 201) | `pr.types.ts` requestedQty is `.int()`; also drives the BR-PR-11 rounding test |

## Needs a decision (not marked as bug)
- TEST-36-11 BR-PR-19: second submit while open returns `APPROVAL_INVALID_SOURCE_STATUS`; BR-PR-19 says `APPROVAL_ALREADY_OPEN`, BR-APR-24 says non-draft -> `APPROVAL_INVALID_SOURCE_STATUS`. Both rules fit one input. Test follows BR-PR-19 (red). Spec should say which wins.
- TEST-36-12 BR-PR-21 withdraw: contract has no withdraw endpoint; `actOnRequest` action `cancel` by the requester cancels the PR (status cancelled) instead of returning it to draft. Test uses that action and expects draft (red). Spec/contract should name the withdraw call.

## Not tested (gaps)
- BR-PR-14: `item_master` has no standard-rate column; fixture cannot be built. Needs schema + feature first.
- BR-PR-17 line cancel, BR-PR-46 PO-driven change: no endpoint / PO module slice.
- Minor: PATCH `updates` entries require both `itemId` and `requestedQty` (schema quirk); tests send both.

## Passing (already correct)
BR-PR-01 (all), BR-PR-02 (all), BR-PR-11 sum/recompute-on-edit/frozen after submit, BR-PR-15 header edit + PR_STATUS_VIA_ACTION, BR-PR-17 view/super-admin/submit 403, BR-PR-19 pending levels + approved resubmit 409, BR-PR-21 middle/last/send-back, BR-PR-45 all endpoints 401/403, BR-PR-46 trail, BR-PR-47 submit race + edit/submit race.

Brief contamination: none.
