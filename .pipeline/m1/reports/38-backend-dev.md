# Report 38 — backend-dev — PR-S2 (create/edit/submit/withdraw)

Result: pr-lifecycle 62/62 green (BR-PR-14 has no test yet). `bun test src`: 379 pass, 2 fail (see below). typecheck, lint (0 errors), contract:check clean.

## Changes
- pr.types.ts: qty `>0`, max 3 decimals (was `.int()`); optional per-line `expectedDate` (create, insert, update).
- prService.ts: create — PR_DUPLICATE_ITEM, PR_INVALID_ITEM (missing or inactive), past required-by date -> 400 `PR_DATE_IN_PAST`. update — requester or super-admin only (403 PR_NOT_REQUESTER), draft only (409 PR_NOT_EDITABLE), PR_MIN_ONE_LINE, PR_DUPLICATE_ITEM, PR_INVALID_ITEM, date check.
- prRepository.ts: `expectedDate` stored on create; `findItemMasterByIds` returns `isActive`.
- approvalService.ts: submit — open request -> 409 APPROVAL_ALREADY_OPEN (checked before status); PR estimate recomputed under the row lock, policy re-matched if it changed; `approvedBy` null on auto-approve (PR and PO). actOnRequest — new action `withdraw` (requester only, 403 `APPROVAL_NOT_REQUESTER`): request cancelled + trail row `cancelled`, PR -> draft (PO -> draft, SCO -> draft).
- approval.types.ts: `withdraw` added to `approvalActionSchema`.
- No schema change (`requested_qty` was already double precision). `contract:generate` re-run; manifest updated.

## Failures left in `bun test src` (not mine to fix)
1. `pr-machine.test.ts` "BR-AUTH-26 updating a PR to add a machine with pr.link_machine succeeds": PR is created by user `plain`, edited by `linker` -> now 403 PR_NOT_REQUESTER. This contradicts BR-PR-17 (only requester or super-admin edits). Test is stale; needs the fixture to edit as the requester. Coordinator: send to test-writer.
2. `no-role-names.test.ts` (BR-AUTH-11): hits `repository/approvalRepository.ts:394 owner` and `lib/token.ts` role literals. Pre-existing, not touched by this brief.

## Notes / questions
- Brief said "super-admin allowed" for edit/submit/withdraw. Spec: edit = requester or super-admin (done); submit/withdraw = requester only (BR-APR-24, 39, BR-PR-17) — left requester-only.
- Withdraw permission error code `APPROVAL_NOT_REQUESTER` is my choice (spec names none).

## Map updates
- purchase-requisition.md: edit is draft-only + requester/super-admin; new codes PR_NOT_EDITABLE, PR_NOT_REQUESTER, PR_MIN_ONE_LINE, PR_INVALID_ITEM, PR_DUPLICATE_ITEM, PR_DATE_IN_PAST; qty up to 3 decimals; per-line `expectedDate` accepted (`z.coerce.date`, not before today UTC).
- approval.md: actOnRequest actions now approve/reject/sent_back/cancel/withdraw; `withdraw` = request cancelled, doc -> draft; `cancel` still sets the PR to cancelled. Submit recomputes PR estimate under lock and re-picks the policy. Auto-approve leaves approvedBy null.
- Trap: `findPendingRequestByDoc` check must run before the status check on submit, otherwise a second submit returns the wrong code.

## Screens to change (frontend-dev)
- PR edit modal: only enabled in draft; show 409 PR_NOT_EDITABLE / 403 PR_NOT_REQUESTER messages; hide edit for non-requesters (super-admin excepted).
- Qty input: allow up to 3 decimals; optional required-by date per line (ISO string), not in the past.
- PR detail: "Withdraw" button for the requester while pending_approval -> `POST /approval/actOnRequest/:id {action:"withdraw"}` (not `cancel`).
- Map new error codes: PR_INVALID_ITEM, PR_DUPLICATE_ITEM, PR_MIN_ONE_LINE, PR_DATE_IN_PAST, APPROVAL_ALREADY_OPEN.
