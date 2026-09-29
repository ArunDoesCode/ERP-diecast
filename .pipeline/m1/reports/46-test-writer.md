# Report 46 — test-writer — approval request tests

File: `backend/src/routes/approval-requests.test.ts` (64 tests, HTTP via `createApp()`, real DB, `test_aprreq_` fixtures, cleaned in `afterAll`).
Result: 45 pass, 19 fail. typecheck + biome clean. No BRIEF-CONTAMINATION.

## FAIL-BUG (code exists, breaks the spec)
| id | BR | test | suspect |
|---|---|---|---|
| TEST-1 | BR-APR-23 | no eligible approver returns code `BAD_REQUEST`, must be `APPROVAL_NO_ELIGIBLE_APPROVER` (role and specific step) | approvalService.ts ~154, ~169 |
| TEST-2 | BR-APR-23 | check also runs when request is auto-approved (400); spec says not checked | approvalService.ts submit, ~154 |
| TEST-3 | BR-APR-26 | second/concurrent submit gets `APPROVAL_INVALID_SOURCE_STATUS`, must be `APPROVAL_ALREADY_OPEN` | approvalService.ts ~347/392 |
| TEST-4 | BR-APR-28 / 61 | auto-approved trail note is "Auto-approved by policy" (no policy name); own-request path must say "Auto-approved: own request" | approvalService.ts submit auto path |
| TEST-5 | BR-APR-33 | same employee can approve two levels (200), must be 403 `APPROVAL_ALREADY_ACTED`; inbox still shows such request | approvalService.ts act / getMyPendingApprovals |
| TEST-6 | BR-APR-37 | approve / reject / sent_back without notes (missing, "", spaces) return 200, must be 400 `APPROVAL_NOTES_REQUIRED` (3 tests) | approvalService.ts act |
| TEST-7 | BR-APR-43 | rejected PO / cancelled PO does not cancel linked PR lines (line stays `po_draft` / `pending`); PR header not recomputed | approvalService.ts reject path, poService cancel |
| TEST-8 | BR-APR-48 | trail `cancelled` actor is the PO creator, not the person who cancelled the PO | poService.deletePo / approval cancel |

## FAIL-EXPECTED (contract "B" not built)
| id | BR | test | note |
|---|---|---|---|
| TEST-9 | BR-APR-54 / 51 | `GET /getApprovalHistory/:docType/:docId` returns 501 (3 tests: history order, empty history, history leg of read-rule test) | controller stub |
| TEST-10 | BR-APR-47 | PO `updatepo` with only `{poId, notes, inserts, updates, deletes}` returns 400 (Zod requires paymentTermsDays/deliveryTerms/expectedDeliveryDate); contract says these become optional. Two tests: pending PO -> 409 `DOC_LOCKED_IN_APPROVAL`, edit after withdraw -> 200 | po types schema |

## PASS
BR-APR-24 (403 non-creator PR + PO, 409 approved), 26 (only-one-row part), 27 (chain copy, level 1/2, one submitted trail level 0, PR 1/2; snapshot survives policy edit), 28 (status/trails order, actor, approvedBy null — note text fails, see TEST-4), 29, 30 (not pending, race 200/409, withdrawn), 31 (role, specific, reject/sent_back, role change), 33 (requester may approve own), 35, 39, 40, 42, 45, 46, 47 (PR), 48 (PR), 50, 51 (401, 403 for details/trail/current), 52 (all 5), 61 (auto PR/PO status, without key waits).

## Not tested (no way from spec/API)
- SCO rows of BR-APR-42/47/48: subcontracting not built (M2).
- BR-APR-27 "mirror fails", BR-APR-40 "doc update fails", BR-APR-48 "doc cancel fails": no production hook to force failure.
- BR-APR-29 re-match on changed amount (needs two amount policies + amount edit).
- BR-APR-45 "approved then sent back on new request": approved doc cannot be resubmitted; tested "approvedBy empty after every non-final outcome".

## Notes
- Tests mutate 4 fixture policies (priorities -90411..-90414) between cases; run sequentially (bun default).
- Trail action for send back / withdraw is only counted, not name-checked (spec names only submitted/auto_approved/cancelled/approved/rejected).
