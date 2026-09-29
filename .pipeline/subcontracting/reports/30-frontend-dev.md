# Report 30 — frontend-dev — CR-2, CR-3

- CR-2: `["subcontracting","vendor-stock"]` now invalidated in useIssueChallanMutation, useCreateReceiptMutation, useDecideQaMutation (`frontend/src/lib/api/subcontracting/queries.ts`).
- CR-3: `["subcontracting"]` now invalidated in useSubmitApprovalRequestMutation and useActOnApprovalRequestMutation (`frontend/src/lib/api/approval/queries.ts`).
- tsc + lint clean. Not committed. 11 lines added, 2 files.

## Screens touched
None (cache invalidation only).

## Map updates
None. Trap: file uses 4-tab indentation in these blocks.
