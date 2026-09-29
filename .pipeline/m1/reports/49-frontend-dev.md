# 49 frontend-dev: approval policies + inbox UI
tsc + lint clean. 15 files (1 over the size cap: 2 small edits to PR/PO views for the history panel).

## Screens touched
- /setup/approval (policy list + form; roles with approval.policy.view/manage)
  - Create Policy button and clickable policy name (edit) only with approval.policy.manage.
  - Min/Max amount fields are in rupees (step 0.01). Sent as paise (x100, rounded); stored paise shown /100. List "Rules" column shows rupees.
  - Auto approve on: chain hidden, not required, not sent on create. Off: needs at least one step.
  - isSaleOrderLinked removed. Doc type disabled on edit (not sent in PATCH).
  - Edit opens only after fresh details load; seeded once, so background refetch does not wipe edits. Cancel/Back discards. Save closes and refreshes list + details.
- /approvals (inbox; any login)
  - Approve / Reject / Send back open a comment dialog; comment required (button disabled while empty). Withdraw button only if you are the requester; comment optional.
  - Backend codes shown as plain messages (APPROVAL_NOTES_REQUIRED, NOT_PENDING, ALREADY_ACTED, POLICY_PRIORITY_TAKEN, etc).
- PR edit modal (/purchase-requisitions): new "Approval history" panel.
- PO section of /purchase-orders/[prId]: per-PO "Approval history" toggle.
  - History = newest request first, trail oldest first, with actor, time, comment. Live "Level x of N, waiting for ..." on the first item if pending.

## Map updates
- Routes: API_ROUTES.approval.getApprovalHistory(docType, docId).
- New: pages/approval/ApprovalActionDialog.tsx, pages/approval/ApprovalHistoryPanel.tsx.
- Query key: approvalKeys.history(docType, docId) = ["approval","history",...]; invalidated by act + submit.
- Types: ApprovalHistoryEntry; ApprovalPolicyCreateInput.approvalChain optional; form schema chain check moved to superRefine.
- Error messages live in lib/api/purchase-requisitions/error-messages.ts (shared by approval queries).
- Traps: PR-modal withdraw button still sends no comment (optional per BR-APR-39, left as is). Trail action for withdraw is unknown in the contract; panel shows "cancelled" as "Withdrawn" and falls back to raw text for unknown actions. View-only policy holders see names as plain text, no details screen.
