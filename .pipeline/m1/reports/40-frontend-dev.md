# Report 40 — frontend-dev — PR-S2 UI

tsc and lint clean. 8 files.

## Screens touched
- `/purchase-requisitions` (roles with the PR screen; edit needs `pr.manage`)
  - Card: estimate shown in Indian format (paise / 100).
  - Edit modal: header shows PR number + estimate (paise -> Rs).
  - Edit + Save + Submit only when status is draft AND signed-in user is the requester; otherwise read-only with an explanatory line.
  - New "Withdraw" button: pending_approval and requester only -> `POST /approval/actOnRequest/:id {action:"withdraw"}` (request id from current-by-doc); PR returns to draft, modal closes.
  - Line table: qty accepts up to 3 decimals; new "Required by" date column (min today) on create and edit.
  - Form checks: qty > 0, max 3 decimals, no duplicate item, date not in past.
  - Error codes shown as plain text via `error-messages.ts` (PR_NOT_EDITABLE, PR_NOT_REQUESTER, PR_MIN_ONE_LINE, PR_INVALID_ITEM, PR_DUPLICATE_ITEM, PR_DATE_IN_PAST, APPROVAL_ALREADY_OPEN, APPROVAL_NOT_REQUESTER).

## Notes / questions
1. Super-admin exception for edit: the frontend has no super-admin flag (only permissions), so edit is hidden for non-requesters including super-admin. Backend still allows it. Recommend `/auth/me` returns `isSuperAdmin` if the UI should show it (backlog).
2. Item picker uses the existing lookup (`useAssetItemsLookupQuery`); I did not verify it returns active items only. Backend rejects inactive with PR_INVALID_ITEM.
3. Submit still = PATCH updatepr then submitRequest (two calls), unchanged.

## Map updates
- New: `lib/api/purchase-requisitions/error-messages.ts` (`PR_ERROR_MESSAGES`, `prErrorMessage`); `ItemDateCell` in modal-shared; `todayIso` in types.
- `ApprovalRequestAction` now includes `withdraw`; act/submit mutations invalidate `["purchase-requisitions"]` and `["approval","current-by-doc"]`.
- `toPRUpdatePayload` sends `expectedDate` on inserts/updates.
- Trap: requester check compares `String(pr.requestedBy)` with auth store `userId` (employee id, string).
