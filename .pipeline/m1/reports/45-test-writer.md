# Report 45 — test-writer — approval-policies tests

File: `backend/src/routes/approval-policies.test.ts` (HTTP via `createApp()`, real DB, real logins). 89 tests: 76 pass, 13 red.
Run: `bun --env-file=/Users/turbo_fltr/.claude/diecast-env/main-test.env test src/routes/approval-policies.test.ts`

## FAIL-BUG (code exists, breaks the rule)
| id | BR | test | got | suspect |
|---|---|---|---|---|
| TEST-1 | BR-APR-07 | 4 tests: create dup / re-prioritise / change category / re-activate into a taken slot | 500, want 409 `POLICY_PRIORITY_TAKEN` | approvalService create/update: DB unique index `uq_policy_priority_doctype_subdoctype` violation not mapped to ConflictError |
| TEST-2 | BR-APR-06 | edit max below stored min; edit min above stored max | 200, want 400 | update path validates only the request body (`updateApprovalPolicySchema` superRefine), not stored + change |
| TEST-3 | BR-APR-05 | PATCH `approvalChain: []` on a policy with autoApprove off | 200, want 400 | same: edit does not check the effective autoApprove/chain pair |
| TEST-4 | BR-APR-21 | PO of tooling PRs only, with PO/any and PO/tooling active | any policy chosen, want tooling | PO category derivation (source PR types) or PO matcher |
| TEST-5 | BR-APR-21 | PO 1,00,000 + 18% GST | matched on 1,00,000 (no GST), want 1,18,000 | PO amount excludes GST; contract says GST columns are absent until the build, so this may be FAIL-EXPECTED |

## FAIL-EXPECTED (contract "B" changes not built)
- BR-APR-01: holder of only `approval.policy.manage` gets 403 on list (want 200).
- BR-APR-05: auto-approve create with `approvalChain` omitted gets 400 (want 201, levels 0).
- BR-APR-15: `isSaleOrderLinked: true` is stored on create and on edit (want 400 or ignored). Test accepts either.

## PASS (already correct)
BR-APR-01 (401/403 matrix, view-only, manage create/edit), 02 (all header checks, default category any), 03 (gap/repeat/role/specific shapes, levels set by server), 05 (auto-on with `[]`, auto-off no steps), 06 (create-side checks, edit valid), 08 (partial edit keeps category and all fields), 09 (null clears / null on other fields 400), 10, 11 (docType change 400, no delete endpoint, retired stops matching), 13 (in-flight 2-step request survives edit/re-prioritise/retire), 14, 16, 18 (boundary at min/max), 19 (all four levels, priority order), 21 (PR type + estimate; mixed PO = any), 22 (fallback: 1 owner step, record inactive, real policy still wins, not in active list).

## Not covered
- BR-APR-57..60, BR-APR-01 button visibility: frontend, for the manual UI checklist.
- BR-APR-19 tie on policy id: unreachable through the API (two active policies at one level need the same slot, which BR-APR-07 forbids).
- BR-APR-21 SCO row: no SCO module yet (M2).
- BR-APR-11 "same docType value sent again": spec silent (contract says any docType in PATCH = 400); not tested. Question for spec owner, low priority.

## Notes
- Test DB holds 19 seeded active policies, including active "PR/PO/SCO Fallback - Owner Review" rows. BR-APR-22 says the fallback record is inactive. The test switches all non-TEST policies off in beforeAll and back on in afterAll (restore runs first). Flag: seed conflicts with BR-APR-22 (seed script `scripts/seed-approval-policies.ts`).
- Typecheck error exists in someone else's file `src/routes/approval-requests.test.ts:1275`; not mine, not touched. My file typechecks and passes biome.
- No brief contamination.
