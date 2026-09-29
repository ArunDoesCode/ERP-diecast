# Report 26 — frontend-dev — PR cancel UI
STATUS: DONE. tsc + lint clean.
Files (6): routes.ts (remove = fn of id), fetchers.ts (DELETE /deletepr/:id, body {reason}), queries.ts (mutation, invalidates PR cards/detail + ["approval"]), types (cancel fields, reason limits), new CancelPurchaseRequisitionDialog.tsx, PurchaseRequisitionModals.tsx.

## Screens touched
- PR list -> Edit/View PR modal (role with pr.manage): "Cancel PR" button; disabled + hint when status not draft/pending_approval/approved or a line has a linked PO; hidden when cancelled. Dialog: required Reason (3-500 trimmed), errors inline, stays open on error, closes modal on success. Cancelled PR shows "Cancelled by / on / Reason".

## Map updates
- New: components/pages/purchase-requisitions/CancelPurchaseRequisitionDialog.tsx (exports getCancelBlockedReason).
- useDeletePurchaseRequisitionMutation now takes {prId, reason}, no error toast (dialog shows it).
- Old cancel went via PATCH status=cancelled; removed.

## Notes
- PO-block hint uses item.linkedPoId; if it slips through, backend PR_HAS_ORDERED_LINES message is shown.
- fully_ordered/rejected: button disabled with hint (spec BR-PR-39), not hidden.
