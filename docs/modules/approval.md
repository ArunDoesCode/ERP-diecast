---
module: approval
spec: docs/specs/approval.md (frozen) + docs/specs/approval-policies.md (frozen)
last_verified_commit: eea4fb1
last_verified_on: 2026-09-29
depends_on: [auth-setup, purchase-requisition, purchase-order]
---

# Approval policy engine — as-built map

> What the code **is** (the spec says what it **should be**). Agents read this before touching the module
> and only explore code changed since `last_verified_commit`
> (`git diff eea4fb1..HEAD --stat -- backend/src/db/schemas/02_procurement-approval.ts backend/src/service/approvalService.ts backend/src/repository/approvalRepository.ts backend/src/routes/approval.ts backend/src/types/approval.types.ts backend/src/controller/approvalController.ts frontend/src/types/approval.ts frontend/src/lib/api/approval frontend/src/components/pages/setup/approval frontend/src/components/pages/approval frontend/src/components/views/approval`).
> Symbol names, not line numbers. Product-level reference: `backend/docs/approval_policy_engine.md`.

## Summary
Rule-based policy engine that decides who approves a PR / PO / SCO and runs the multi-level chain via
`approval_requests` + `approval_trails`. PR and PO are wired end to end (submit → approve / reject /
sent back / withdraw → status mirrored to the document). SCO (`sco` docType) has repository/service
plumbing only; SCO itself is not built (M2). Frontend: policy admin (`setup/approval`), approvals inbox
(`ApprovalView`), and `ApprovalHistoryPanel` on PR and PO detail. Maturity: full for PR/PO.

## Code locations
| Layer | Path | Key symbols |
|---|---|---|
| schema | `backend/src/db/schemas/02_procurement-approval.ts` | `approvalPolicies`, `approvalRequests`, `approvalTrails`, `ApprovalChainStep` |
| types | `backend/src/types/approval.types.ts` | `createApprovalPolicySchema`, `updateApprovalPolicySchema`, `approvalChainOrEmptySchema`, `submitApprovalRequestSchema`, `approvalActionRequestSchema`, `approvalHistoryItemSchema`, `myPendingApprovalsQuerySchema` |
| repository | `backend/src/repository/approvalRepository.ts` | `findMatchingActivePolicy`, `findFallbackPolicy`, `findDocumentContext`, `findPoCategory`, `createRequest`, `lockRequestById`, `hasEmployeeApproved`, `insertTrail`, `listRequestsWithTrailByDoc`, `listPendingRequests`, `update{Pr,Po,Sco}ApprovalMirror`, `cancelOpenRequestForDocument` |
| service | `backend/src/service/approvalService.ts` | `createPolicy`, `updatePolicy`, `submitRequest`, `actOnRequest`, `getMyPendingApprovals`, `getCurrentApprovalByDoc`, `getApprovalHistory`, `assertCanReadRequest` |
| controller / routes | `backend/src/controller/approvalController.ts`, `backend/src/routes/approval.ts` + `END_POINTS.approval` | thin; `requirePermission` on policy routes |
| fallback name | `backend/src/lib/approval-fallback.ts` | `fallbackPolicyName(docType)` |
| permissions | `backend/src/lib/permissions.ts` | `approval.policy.view/.manage`, `approval.view_all`, `approval.view_others_pending`, `approval.auto_approve_own` |
| seed | `backend/scripts/seed-approval-policies.ts` | baseline policies + one inactive fallback per docType (priority 9999), upsert on `(priority, docType, subDocType)` |
| doc integration | `prService`, `poService`, `poRepository` | call `cancelOpenRequestForDocument` on doc cancel; `poRepository.cancelLockedPo` / `orderPrLinesOfPo` used by `actOnRequest` |
| frontend api | `frontend/src/lib/api/approval/{fetchers,queries}.ts` | `approvalKeys`, policy hooks, `useSubmitApprovalRequestMutation`, `useActOnApprovalRequestMutation`, `useMyPendingApprovalsQuery`, `useCurrentApprovalByDocQuery`, `useApprovalHistoryQuery` |
| frontend types | `frontend/src/types/approval.ts` | policy / request / history types, `approvalPolicyFormSchema` (uses `subDocType`) |
| frontend ui — policies | `frontend/src/components/views/setup/SetupApprovalView.tsx`, `components/pages/setup/approval/{ApprovalPoliciesView,ApprovalPolicyTable,ApprovalPolicyForm,ApprovalPolicyChainFields,ApprovalPolicyDetails,approval-policy-helpers}` | form takes ₹, helper converts to paise |
| frontend ui — requests | `components/views/approval/ApprovalView.tsx`, `components/pages/approval/{ApprovalCards,ApprovalActionDialog,ApprovalHistoryPanel,ApprovalPagination}` | inbox, action dialog (note required), history |
| frontend ui — consumers | `PurchaseOrderDetailView`, `PurchaseOrderTrackingCards`, `PurchaseRequisitionModals` | submit button, current approval, history panel |

## Data model
- `approval_policies(id, name, description, isActive, priority, docType[pr|po|sco], subDocType[any|
  sale_order|stock_reorder|maintenance|tooling|subcontracting|misc] default any, minAmountPaise/
  maxAmountPaise nullable, autoApprove, approvalLevels, approvalChain jsonb, audit cols)`.
  No `isSaleOrderLinked` (dropped, BR-APR-15). Amounts are paise. Partial unique index on
  `(priority, docType, subDocType) where isActive` → `409 POLICY_PRIORITY_TAKEN`.
- `ApprovalChainStep = { level, approverType: "role"|"specific", role?, employeeId? }`. Chain may be
  empty only for `autoApprove` (levels 0); create rejects a non-auto policy with no step.
- `approval_requests(id, docType, docId, policyId, status[pending_approval|approved|rejected|
  require_more_info|cancelled], currentLevel, totalLevels, chainSnapshot jsonb, currentApproverRole /
  currentApproverEmployeeId, requestedBy, requestedAt, completedAt)`. Partial unique index
  `uq_open_approval_request_per_doc` (`status = pending_approval`); `idx_approval_requests_doc`
  on `(docType, docId)` for history.
- `approval_trails(id, requestId, docType, docId, level, action[submitted|approved|rejected|
  require_more_info|auto_approved|cancelled], actionBy, actionAt, notes)` — append-only. Submit = level 0.
- PR / PO / SCO rows carry mirrored `status` (+ level, `approvedBy` for PR/PO), kept in sync by the
  `update*ApprovalMirror` repo functions. `approval_requests` is the authoritative workflow state.

## API
| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/approval/getPolicies` | `approval.policy.view` or `.manage` | Paginated policy list |
| GET | `/api/approval/getPolicyDetails/:id` | same | One policy |
| POST | `/api/approval/createPolicy` | `approval.policy.manage` | Create policy |
| PATCH | `/api/approval/updatePolicy/:id` | `approval.policy.manage` | Update (docType fixed after create) |
| POST | `/api/approval/submitRequest` | authenticated + doc creator + `pr.manage`/`po.manage` | Submit PR/PO/SCO |
| GET | `/api/approval/getRequestDetails/:id` | authenticated, read rule | Request + policy name |
| GET | `/api/approval/getRequestTrail/:id` | authenticated, read rule | Trail |
| POST | `/api/approval/actOnRequest/:id` | current-step approver; requester for withdraw | approve / reject / sent_back / withdraw |
| GET | `/api/approval/getMyPendingApprovals` | authenticated; another `employeeId` needs `approval.view_others_pending` | Pending on me |
| GET | `/api/approval/getCurrentApprovalByDoc/:docType/:docId` | authenticated, read rule | Open request or null |
| GET | `/api/approval/getApprovalHistory/:docType/:docId` | authenticated, read rule | All requests of a doc, newest first, each with trail oldest first |
Full shapes: `cd backend && bun run contract:query "<METHOD /path>"`.

## Key flows
- **Match** (`findMatchingActivePolicy`): active, same docType, `subDocType` = exact or any, amount in
  `[min, max)`. Rank: exact category + amount, exact category, any + amount, any; then `priority`, `id`.
  No match → `findFallbackPolicy` (inactive seed record named by `fallbackPolicyName`; missing →
  500 `APPROVAL_FALLBACK_MISSING`). Code never creates it.
- **Document context** (`findDocumentContext`): PR = its `type` + `estimatedAmountPaise`; PO = category of
  its source PRs (mixed → any) + `totalAmountPaise` (incl. GST); SCO = any, amount 0.
- **`submitRequest`**: doc exists → caller is creator → holds `pr.manage`/`po.manage` (SEC-P3) → doc is
  `draft` (else `APPROVAL_ALREADY_OPEN` / `APPROVAL_INVALID_SOURCE_STATUS`) → match policy → tx:
  no open request, PR re-read under lock (amount changed → re-match) → auto-approve if
  `policy.autoApprove` or actor has `approval.auto_approve_own` (else every step needs an active
  approver, `APPROVAL_NO_ELIGIBLE_APPROVER`) → insert request + `submitted` trail (+ `auto_approved`
  trail) → mirror status. Auto-approved PO orders its PR lines at once.
- **`actOnRequest`**: approve / reject / sent_back need non-blank `notes` (`APPROVAL_NOTES_REQUIRED`).
  Tx with row lock → not pending → 409 `APPROVAL_NOT_PENDING` → withdraw: requester only
  (`APPROVAL_NOT_REQUESTER`); others: role or specific-employee check on `chainSnapshot`, and approve is
  blocked if the actor already approved a level (`APPROVAL_ALREADY_ACTED`). Approve at last level →
  `approved`, else `currentLevel + 1`; reject → `rejected`; sent_back → `require_more_info`;
  withdraw → `cancelled`. One trail row, then mirror:
  - PR: withdraw and sent_back → `draft`; others mirror the request status.
  - PO: reject → `cancelLockedPo` (PO cancelled, PR lines cancelled); withdraw / sent_back → `draft`;
    final approve → `approved` + `orderPrLinesOfPo` (PR lines ordered).
  - SCO: withdraw / sent_back → `draft`; approved / rejected mirrored.
- **Read rule** (`assertCanReadRequest`, BR-APR-51): `approval.view_all`, or the requester, or an active
  approver named in `chainSnapshot`. History returns the readable requests; none readable → 403.
- **Inbox** (`listPendingRequests`): pending requests whose current approver is the caller's role or id,
  hiding requests the caller already approved a level of.
- **Doc cancel**: `prService` / `poService` call `cancelOpenRequestForDocument` (trail `cancelled`) —
  a second entry point that must stay in sync with `actOnRequest` withdraw.

## Invariants & gotchas
- One open request per document, enforced by partial unique index (race → `APPROVAL_ALREADY_OPEN`).
- Always act on the request's `chainSnapshot`, never the live policy chain.
- Role steps mean "whoever holds the role now"; the role is read from the DB, not the token (BL-018).
- There is no `cancel` action; the requester uses `withdraw`.
- PO has no `rejected` status: a rejected PO shows `cancelled`; the request status tells them apart.
- Fallback lives in seed data only; a DB without the seed cannot submit an unmatched document.
- Permission keys are checked in the service with `can()`, so a route-level allow is not the whole rule.

## Tests
| File | Covers |
|---|---|
| `backend/tests/routes/approval-policies.test.ts` | policy admin: access, create / update rules, priority slot, amounts, chain |
| `backend/tests/routes/approval-requests.test.ts` | submit, act, withdraw, notes, two-level rule, read rule, history, document side effects |
| `backend/tests/service/approvalService.test.ts` | `updatePolicy` merge and validation (BR-APR-08, BL-022) |
| `backend/tests/types/approval.types.test.ts` | update schema keeps omitted fields, rejects empty PATCH |
| `backend/tests/repository/approvalRepository.test.ts` | matching rank, submit scenario |
| `backend/tests/lib/permissions.test.ts` | approval keys per role |

## Known gaps / debt
- **SPEC-P3**: UI rules BR-APR-57..60 (policy form) have no automated test; manual checklist only. No
  frontend tests for the module.
- SCO: only plumbing; amount 0 and category `any`, so every SCO hits the fallback. CRP-9 SCO submit
  lock deferred to M2.
- PR amount = line estimates (item average cost, else standard rate, BR-PR-14). Average cost is now kept
  in step with the ledger (BL-014 fixed), so bands follow real receipts.
- Two cancel entry points (`actOnRequest` withdraw vs `cancelOpenRequestForDocument`) can drift.
- Benchmark: ERPNext workflow has per-transition "Allow Self Approval" (default off); SAP B1 approves
  automatically when no template applies and asks a remark on reject; Odoo uses "reset to draft".

## History
| Date | PR / commit | Change |
|---|---|---|
| 2026-09-27 | 0a406f4 | Map created from as-built code (no prior spec) |
| 2026-09-29 | work/m1 0a406f4..eea4fb1 | approval + approval-policies v2 built: policy admin, request flow, history endpoint, keys |
