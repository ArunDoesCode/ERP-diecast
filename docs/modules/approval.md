---
module: approval
spec: none yet
last_verified_commit: 0a406f4
last_verified_on: 2026-09-27
depends_on: [auth-setup]
---

# Approval policy engine — as-built map

> What the code **is** (the spec says what it **should be**). Agents read this before touching the module
> and only explore code changed since `last_verified_commit`
> (`git diff 0a406f4..HEAD --stat -- backend/src/db/schemas/02_procurement-approval.ts backend/src/service/approvalService.ts backend/src/repository/approvalRepository.ts backend/src/routes/approval.ts frontend/src/types/approval.ts frontend/src/lib/api/approval frontend/src/components/pages/setup/approval frontend/src/components/views/approval`).
> Use symbol names, not line numbers — lines rot. See also `backend/docs/approval_policy_engine.md`
> (product-level reference: matching rules, seed baseline policies, scenarios).

## Summary
A rule-based, specificity-ranked policy engine that decides who must approve a PR/PO/SCO
(subcontracting order) and drives a multi-level approval chain via `approval_requests` +
`approval_trails`. PRs and POs are fully wired end-to-end (submit → approve/reject/sent_back
→ mirrored status back onto the source document); SCO mirroring exists in the repository/
service but there is no `subcontractingOrders`-owning feature (no `scoService`/`scoController`
found) wired to submit one yet. Maturity: policy CRUD + PR/PO approval flow = full; SCO = 
partial (repository plumbing only). Frontend has both the super-admin policy editor
(`setup/approval`) and an operational "my pending approvals" inbox (`ApprovalView`).

## Code locations
| Layer | Path | Key symbols |
|---|---|---|
| schema | `backend/src/db/schemas/02_procurement-approval.ts` | `approvalPolicies`, `approvalRequests`, `approvalTrails`, `procurementCategoryEnum`, `approvalDocTypeEnum`, `approvalActionEnum`, `approvalStatusEnum`, `ApprovalChainStep` |
| types | `backend/src/types/approval.types.ts` | `createApprovalPolicySchema`, `updateApprovalPolicySchema`, `submitApprovalRequestSchema`, `approvalActionRequestSchema`, `approvalPolicyListQuerySchema`, `myPendingApprovalsQuerySchema` |
| repository | `backend/src/repository/approvalRepository.ts` | `findMatchingActivePolicy`, `findOrCreateFallbackPolicy`, `createRequest`, `updateRequestById`, `insertTrail`, `findDocumentContext`, `updatePrApprovalMirror`, `updatePoApprovalMirror`, `updateScoApprovalMirror`, `listPendingRequests`, `cancelOpenRequestForDocument` |
| service | `backend/src/service/approvalService.ts` | `getPolicies`, `createPolicy`, `updatePolicy`, `submitRequest`, `actOnRequest`, `getMyPendingApprovals`, `getCurrentApprovalByDoc` |
| controller | `backend/src/controller/approvalController.ts` | thin, parse + call service |
| routes | `backend/src/routes/approval.ts` + `END_POINTS.approval` | `approvalRouter` |
| seed | `backend/scripts/seed-approval-policies.ts` | baseline `POLICIES` array, idempotent upsert on `(priority, docType, subDocType)` |
| PR/PO integration | `backend/src/service/prService.ts`, `backend/src/service/poService.ts` | call `approvalRepository.cancelOpenRequestForDocument` on cancel; status transition maps (`draft → pending_approval → approved/...`) |
| frontend api | `frontend/src/lib/api/approval/{fetchers,queries}.ts` | `getApprovalPolicies`, `createApprovalPolicy`, `updateApprovalPolicy`, `submitApprovalRequest`, `actOnApprovalRequest`, `getMyPendingApprovals`, `getCurrentApprovalByDoc`, `useSubmitApprovalRequestMutation`, `useActOnApprovalRequestMutation`, `useCurrentApprovalByDocQuery` |
| frontend types | `frontend/src/types/approval.ts` | `ApprovalPolicySummary`, `ApprovalPolicyCreateInput`, `ApprovalPolicyUpdateInput`, `approvalPolicyFormSchema` (**see gap below — two different field names for the same backend column**) |
| frontend ui — setup | `frontend/src/app/(protected)/setup/approval/page.tsx`, `frontend/src/components/views/setup/SetupApprovalView.tsx`, `frontend/src/components/pages/setup/approval/{ApprovalPoliciesView,ApprovalPolicyTable,ApprovalPolicyForm,ApprovalPolicyChainFields,ApprovalPolicyDetails,approval-policy-helpers}.tsx` | policy CRUD screens, super-admin/owner/back_office read, super-admin write |
| frontend ui — operational | `frontend/src/components/views/approval/ApprovalView.tsx` | "my pending approvals" inbox, act (approve/reject/sent_back/cancel) |
| frontend ui — consumers | `frontend/src/components/views/purchase-orders/PurchaseOrderDetailView.tsx`, `frontend/src/components/pages/purchase-orders/PurchaseOrderTrackingCards.tsx`, `frontend/src/components/pages/purchase-requisitions/PurchaseRequisitionModals.tsx` | submit-for-approval buttons, current-approval-by-doc display |

## Data model
- `approval_policies(id, name, description, isActive, priority, docType[pr|po|sco],
  subDocType[procurement_category enum: any|sale_order|stock_reorder|maintenance|tooling|
  subcontracting|misc] default "any", isSaleOrderLinked nullable bool, minAmountPaise/
  maxAmountPaise bigint nullable, autoApprove, approvalLevels, approvalChain jsonb
  `ApprovalChainStep[]`, audit cols)`. Unique index
  `uq_policy_priority_doctype_subdoctype` on `(priority, docType, subDocType)` **where
  isActive = true** — inactive duplicates are allowed, only one active policy per
  priority/docType/subDocType triple.
- `ApprovalChainStep = { level, approverType: "role"|"specific", role?, employeeId? }` —
  role-based steps resolve at act-time to "whoever currently holds that role"; specific
  steps pin one `employeeId`.
- `approval_requests(id, docType, docId, policyId → approval_policies.id, status
  [approval_status enum], currentLevel, totalLevels, chainSnapshot jsonb (frozen copy of the
  chain at submit time), currentApproverRole/currentApproverEmployeeId (materialized "who
  can act now" columns), requestedBy → employees.id, requestedAt, completedAt)`. Unique index
  `uq_open_approval_request_per_doc` on `(docType, docId)` **where status =
  'pending_approval'** — only one open request per document at a time. Indexed on
  `(status, currentApproverRole)` and `(status, currentApproverEmployeeId)` for the pending-
  approvals inbox query.
- `approval_trails(id, requestId → approval_requests.id, docType, docId, level, action
  [approval_action enum: submitted|approved|rejected|require_more_info|auto_approved|
  cancelled], actionBy → employees.id, actionAt, notes)` — append-only audit log, one row per
  transition including the initial `submitted` (level 0) and any `auto_approved` row.
- PR/PO/SCO tables (`02_procurement-purchasing.ts`) carry a **mirrored** subset of approval
  state (`status`, `currentApprovalLevel`, `totalApprovalLevels`, `approvedBy` for PR/PO;
  `status` only for SCO) kept in sync by `approvalRepository.updatePrApprovalMirror` /
  `updatePoApprovalMirror` / `updateScoApprovalMirror` — the source document's own status
  column is the field UI list/detail pages actually read; `approval_requests` is the
  authoritative workflow state.

## API
| Method | Path | Roles | Purpose |
|---|---|---|---|
| GET | `/api/approval/getPolicies` | super-admin, owner, back_office | List policies, paginated, filter/search |
| GET | `/api/approval/getPolicyDetails/:id` | super-admin, owner, back_office | Full policy definition |
| POST | `/api/approval/createPolicy` | super-admin | Create a policy |
| PATCH | `/api/approval/updatePolicy/:id` | super-admin | Update a policy |
| POST | `/api/approval/submitRequest` | any authenticated | Submit a PR/PO/SCO for approval against its matching policy |
| GET | `/api/approval/getRequestDetails/:id` | any authenticated (see gotchas — read-scoped) | Request + policy name/description |
| GET | `/api/approval/getRequestTrail/:id` | any authenticated (read-scoped) | Full action trail |
| POST | `/api/approval/actOnRequest/:id` | any authenticated (must be current-step approver, or requester for cancel) | approve / reject / sent_back / cancel |
| GET | `/api/approval/getMyPendingApprovals` | any authenticated (super-admin may pass `employeeId` for another employee) | Paginated pending-on-me list |
| GET | `/api/approval/getCurrentApprovalByDoc/:docType/:docId` | any authenticated (read-scoped) | Currently open request for a document, if any |
Full shapes: `cd backend && bun run contract:query "<METHOD /path>"`.

## Key flows
- **Policy matching** (`approvalRepository.findMatchingActivePolicy`): filters active
  policies by `docType`, `subDocType ∈ {"any", exact}`, amount range, and
  `isSaleOrderLinked` match, then ranks by a `CASE` expression (exact subDocType+amount
  constraints > exact subDocType, no amount > "any"+amount > "any", no amount), then by
  `priority` ascending. If nothing matches, `findOrCreateFallbackPolicy` gets/creates a
  priority-99 catch-all per `docType` (routes to owner).
- **`submitRequest`** (`approvalService.submitRequest`): loads document context via
  `findDocumentContext` (PR: `type` column → `subDocType`, `saleOrderId !== null` →
  `isSaleOrderLinked`, `estimatedAmountPaise`; PO: `totalAmountPaise`, subDocType always
  `"any"`; SCO: subDocType always `"any"`) → asserts caller is the doc's creator and doc is
  `status === "draft"` → resolves policy → `assertChainHasEligibleApprovers` (every role step
  needs ≥1 active employee with that role; every specific step needs an active employee) →
  in one transaction: re-checks no open request exists (unique-violation caught as
  `ConflictError APPROVAL_ALREADY_OPEN`), inserts `approval_requests` row (`auto_approve:true`
  → immediately `status:"approved"`, `currentLevel:approvalLevels`), inserts a `submitted`
  trail row (+ an `auto_approved` trail row if auto-approved), then mirrors status onto the
  source PR/PO/SCO row.
- **`actOnRequest`** (`approvalService.actOnRequest`): locks the request row
  (`lockRequestById`, `SELECT ... FOR UPDATE` semantics) inside a transaction → requires
  `status === "pending_approval"` → for `cancel`, only the original requester may act; for
  approve/reject/sent_back, `assertEligibleActorForCurrentStep` requires the actor's active
  role to match `chainSnapshot[currentLevel].role` (or, for a `"specific"` step, requires
  `employeeId === actorId`) → `approve` at the last level → `status:"approved"`; `approve`
  before the last level → increments `currentLevel` only (`status` stays
  `"pending_approval"`); `reject`/`sent_back`/`cancel` each terminate the request
  (`rejected`/`require_more_info`/`cancelled`) → inserts one trail row → re-mirrors status
  onto the source PR/PO/SCO (PR: `require_more_info` mirrors back to `"draft"`; PO: `reject`
  mirrors to `"cancelled"`, not `"rejected"` — PO has no rejected status of its own).
- **PR/PO cancel path**: `prService`/`poService` cancel handlers call
  `approvalRepository.cancelOpenRequestForDocument(docType, id[, reason])` directly (not
  through `actOnRequest`) when cancelling a document that already has an open approval
  request, so the two entry points (approval action vs. document cancel) both need to stay in
  sync with any future status-mapping change.
- **Frontend consumption**: `PurchaseRequisitionModals`/`PurchaseOrderDetailView` call
  `useSubmitApprovalRequestMutation` to submit, poll `useCurrentApprovalByDocQuery` to render
  the live approval state on the doc's detail view, and the standalone `ApprovalView`
  (operational inbox, not under `/setup`) lists `useMyPendingApprovalsQuery` and drives
  `useActOnApprovalRequestMutation` for approve/reject/sent_back/cancel. The super-admin
  policy editor (`SetupApprovalView` → `ApprovalPoliciesView`/`ApprovalPolicyForm`) is a
  separate screen reachable from `/setup` via the "Approval Policies" link, gated the same as
  the rest of `/setup` (see `auth-setup.md`) plus its own read/write role split in
  `routes/approval.ts`.

## Invariants & gotchas
- Only one **open** (`pending_approval`) request per `(docType, docId)` — enforced by a
  partial unique index, not just application logic; re-submission after
  cancel/reject/approve is allowed once the prior request is no longer `pending_approval`.
- `chainSnapshot` is copied at submit time specifically so editing a policy's
  `approvalChain` afterward never mutates in-flight requests — always read the request's own
  `chainSnapshot`, never re-read the policy's live `approvalChain`, when acting on a request.
- Role-based approval steps resolve to *whoever currently holds the role*, not a fixed
  person — changing an employee's role can change who is allowed to act on a pending
  request at that level.
- PO rejection has no dedicated status: `actOnRequest`'s `poStatus` mapping sends
  `nextStatus:"rejected"` to `purchaseOrders.status = "cancelled"` (there is no `"rejected"`
  value in the PO status enum) — don't expect a PO to ever show `"rejected"` on its own
  status field, check the approval request status instead if you need to distinguish
  cancelled-by-approval-reject from cancelled-by-user.
- Read endpoints (`getRequestDetails`, `getRequestTrail`, `getCurrentApprovalByDoc`) are
  `any-authenticated` at the route level but scoped in the service
  (`assertCanReadRequest`): super-admin/owner/back_office and the original requester can
  always read; anyone else must currently be a matching approver in `chainSnapshot` (by role
  or by specific employeeId) and be active.
- SCO (subcontracting order) mirroring exists in `approvalRepository`/`approvalService` and
  the `approvalDocTypeEnum`/`ApprovalDocType` type, but no `subcontractingOrders`-owning
  service/controller/route was found — SCO is schema + approval-plumbing only, not a
  reachable feature yet.

## Frontend/backend field-name mismatch (real bug, not just naming)
The backend's actual column is `subDocType` (`02_procurement-approval.ts`,
`approval.types.ts`, `approvalPolicyFormSchema` in `frontend/src/types/approval.ts`, and
`ApprovalPolicyForm.tsx`'s `name="subDocType"` field all agree). But the frontend's
API-boundary types disagree with the form:
- `ApprovalPolicySummary`, `ApprovalPolicyDetails`, `ApprovalPolicyCreateInput`,
  `ApprovalPolicyUpdateInput` (all in `frontend/src/types/approval.ts`) declare a `prType`
  field instead of `subDocType`.
- `approval-policy-helpers.ts`'s `createDefaultFormValues`, `mapPolicyToFormValues`,
  `toCreatePayload`, and `toUpdatePayload` all read/write `prType`, while
  `ApprovalPolicyFormInput` (inferred from `approvalPolicyFormSchema`) only has
  `subDocType` — and `policy.prType`/`form.prType` are not present on the corresponding
  types at all.
- Net effect: the sub-doc-type value a user picks in the policy form (bound to
  `field name="subDocType"`) is never read into `prType` by these helpers, so it is not
  included in the `createApprovalPolicy`/`updateApprovalPolicy` payload — policies created or
  edited through this screen effectively always send `subDocType` unset (defaults to
  `"any"` server-side), regardless of what was selected in the UI. Also affects
  `mapPolicyToFormValues`, which will never populate the form's `subDocType` field from an
  existing policy's real value when opening it for edit.
- Fix direction: rename `prType` → `subDocType` consistently in `frontend/src/types/approval.ts`
  and `approval-policy-helpers.ts` to match the form schema and the backend contract.

## Tests
| File | Covers |
|---|---|
| `backend/src/repository/approvalRepository.test.ts` | repository-level query behavior (see file for exact cases) |

## Known gaps / debt
- **Field-name mismatch** `prType` (frontend API types/helpers) vs `subDocType` (backend,
  form schema, DB) — see dedicated section above; this silently drops the sub-doc-type
  filter on policy create/edit through the UI.
- SCO has approval plumbing (mirror function, enum values) but no owning feature — dead
  code path until an SCO module exists.
- PO rejection is not distinguishable from user-cancelled at the PO-status level (both land
  on `"cancelled"`); only the approval request's own `status`/trail distinguishes them.
- No frontend tests found for the approval module (policy form, `ApprovalView`, or the
  PR/PO submit-for-approval integration).

## Known gaps (from spec draft 2026-09-27)
- Spec now split: `docs/specs/approval.md` (requests) + `docs/specs/approval-policies.md` (policies); ref doc `backend/docs/approval_policy_engine.md`.
- Tested today: BR 01–04, 07, 11–14, 16–20, 23, 25–27, 30–32, 35–36, 40, 51–52, 55 partly covered by 19 cases + submit scenario 1 in `backend/src/repository/approvalRepository.test.ts`; rest untested.
- BR-APR-05: create schema chain `.min(1)` rejects autoApprove + empty chain (UI sends `[]`), so BR-APR-62 UI path is blocked too.
- BR-APR-06: PATCH checks max > min on the patch only, not stored + patch.
- BR-APR-08 / BL-022: `updateApprovalPolicySchema` has `subDocType .default("any")` → omitted category resets to any.
- BR-APR-09: null accepted for amounts; null on non-nullable fields not verified.
- BR-APR-10: `hasAnyField` ignores min/max, and is always true because of the subDocType default.
- BR-APR-15 / BL-002: `isSaleOrderLinked` still in schema, contract and `findMatchingActivePolicy`.
- BR-APR-21: `findDocumentContext` uses category `any` for PO and SCO; SCO amount = 0 → every SCO goes to fallback, seeded tooling/maintenance PO policies never match.
- BR-APR-22: fallback exists (inactive) but priority 9999 in code vs 99 in ref doc.
- BR-APR-28: auto-approve sets `approvedBy` = requester; spec says leave empty.
- BR-APR-33/34/53: self-approval and same-person-two-levels not blocked; inbox shows own requests.
- BR-APR-37/38/64: reject and send-back notes optional; `ApprovalView` sends none.
- BR-APR-39/42: withdraw sets PR/PO `cancelled` instead of `draft`.
- BR-APR-41: row lock exists but losing action returns 400, not 409.
- BR-APR-43: PO reject bypasses `poRepository.setStatusCancelled` → PR lines stay stuck, header not recomputed.
- BR-APR-44: SCO send back leaves SCO at `require_more_info`.
- BR-APR-46: `PATCH /pr/updatepr` accepts `pending_approval`/`cancelled` in its status field.
- BR-APR-47: `prService.update` has no status check (PO update is draft-only — ok).
- BR-APR-48: document cancel and request cancel run in separate transactions; trail actor = requester, not canceller.
- BR-APR-54/65: only "current open request" lookup exists; per-document history query and detail-page history are new.
- BR-APR-59: form reset effect depends on the `policy` object → background refetch wipes unsaved edits.
- BR-APR-61: amount label says ₹ but the raw number is sent as paise.
- BR-APR-63: fixed by the prType→subDocType rename; BR-APR-56–58, 60 done but untested.
- Untested but done: BR-APR-24, 29, 45, 49, 50.
- PR amount uses `averageCostPaise`, which is stale (BL-014) → a PR can route to a lower amount band.
- BL-018: token refresh keeps the old role, so the approver role check must read roles from the DB (it does).
- Benchmark: ERPNext workflow conditions can test any field and have "Allow Self Approval" per transition (default off); Odoo/SAP B1 approval templates key on doc type + amount; SAP B1 approves automatically when no template applies and asks remarks on reject; Odoo uses "reset to draft" for changes.

## History
| Date | PR / commit | Change |
|---|---|---|
| 2026-09-27 | 0a406f4 | Map created from as-built code (no prior spec) |
