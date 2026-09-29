# Explorer Report 41 — approval, approval-policies, purchase-order, PR line states

**Map status:** Approval and PO maps (both 0a406f4, 2026-09-27) are largely current; all changes are additive or permission-layer rewrites. No data model changes to approval/PO schemas; PR schema gains `expectedDate` field.

## Gaps answered (code locations only; maps cover architecture/flow)

### 1. Approval: action paths and mirroring

- **withdraw action (new):** backend/src/types/approval.types.ts:314 added to `approvalActionSchema`; approvalService.ts:573, 614 (requester-only, like cancel); line 659 (withdraw → PR draft, vs cancel → various per logic).
- **approve/reject/sent_back:** Still at service lines 547–612; PO rejection → `cancelled` (not `rejected`); PR rejection → `rejected`; sent_back → `draft` for both.
- **Mirroring PR/PO:** updatePrApprovalMirror/updatePoApprovalMirror in approvalRepository.ts (unchanged); called from approvalService.ts lines 650–691.
- **cancelOpenRequestForDocument signature:** approvalRepository.ts:810–853 now accepts `options: { actorId?, notes?, tx? }`; prService.cancel (line 435) calls with `{ actorId: actor.id, notes: reason, tx }`, enabling one transaction and correct audit trail.

### 2. Approval: policy matching and chain storage

- **Amount recompute (BR-PR-11):** approvalService.submitRequest now re-reads and recalculates estimated amount for PR at submit time (lines 406–415 via `prRepository.recalculateEstimatedAmountByPrId`), re-matches policy against fresh amount.
- **Chain storage:** Still JSONB `approvalChain` on approvalPolicies; `ApprovalChainStep` has `{ level, approverType: "role"|"specific", role?, employeeId? }` (unchanged). **Fallback chain hard-coded at approvalRepository.ts:394** (issue F-APR-1: should move to seed data).
- **Self-approval (BR-APR-33):** Not blocked (map notes as gap, still open).

### 3. Approval: auto-approve and permissions

- **Auto-approve:** `approvalPolicy.autoApprove = true` auto-approves at submit (line 427). **New:** permission `approval.auto_approve_own` added (line 429) — if actor has it, their submission auto-approves. **Fixed:** `approvedBy` now set to `null`, not requester's ID (lines 487, 500; spec says empty).
- **Comments required on reject/sent_back:** Field exists, optional in schema (not enforced).

### 4. Approval: open-request lock rules

- **One open per doc:** Unique partial index on `(docType, docId, status='pending_approval')` (unchanged). For PR, approvalService.submitRequest re-checks under FOR UPDATE (lines 394–405).
- **Lock order:** prService.cancel locks open request BEFORE PR (lines 380–388), preventing deadlock with approvalService.actOnRequest.

### 5. Policy admin: CRUD, ₹ vs paise, auto-approve

- **Create/update/retire:** Schema unchanged; PATCH no longer resets `subDocType` to "any" on omit (line 212, optional; fixes BL-022).
- **Amount fields:** `minAmountPaise`/`maxAmountPaise` are integers (paise), but form label says ₹ (Rupees) — form/API mismatch (BL-025a candidate).
- **Auto-approve override:** New `approval.auto_approve_own` permission at actor level (approvalService.submitRequest line 429).

### 6. PO: create, edit, send, confirm, invoice, close, cancel/reject

- **Create from PR:** Unchanged; locks PR items FOR UPDATE, computes qty = requestedQty - issuedQty, bumps issuedQty, recomputes PR header.
- **Edit/send/confirm/invoice/close:** No changes since 0a406f4 (no service diff).
- **Rejection:** approvalService.actOnRequest maps PO rejection to `cancelled` (no `rejected` status in poStatusEnum).
- **Status transitions:** poService.PO_STATUS_TRANSITIONS map unchanged.

### 7. PR line updates when PO actions happen

- **issuedQty:** Bumped on PO create per line; decremented on line delete or PO cancel via prRepository.revertPrItemToPending.
- **Item status:** pending → po_draft (PO draft) → ordered (PO send) → closed (GRN full) → cancelled (PO cancel).
- **Header recompute:** prRepository.recomputeHeaderStatusFromItems called after PO create/update/cancel; now also from prService.cancel (line 395 when PR cancelled).
- **PR cancel blocks ordered lines:** prService.cancel checks findOrderedLinesWithLivePos (line 403); throws CONFLICT with PO numbers if any line is on a live PO (lines 409–412).

### 8. PR line state transitions (BR-PR-25/28/30/31/32/33/36)

- **BR-PR-25 (submit):** estimate recomputed; policy re-matched against fresh amount (lines 406–415).
- **BR-PR-28 (auto-approve):** approvedBy = null (fixed, was requester).
- **BR-PR-30 (cancel ordered lines):** blocks if any line is po_draft/ordered on live PO; message shows PO numbers (lines 403–412).
- **BR-PR-31 (withdraw returns to draft):** withdraw action at approvalService.ts:659 returns PR to draft.
- **BR-PR-32 (cancel reason required):** prService.cancel takes `reason: string` (line 372); no check if draft allows omit (gap).
- **BR-PR-33 (self-approval):** Still not blocked (gap).
- **BR-PR-36 (withdraw):** Requester-only (line 573), returns to draft (line 659).

### 9. Frontend: approvals, policies, PO screens and API calls

- **Approvals inbox:** ApprovalView (unchanged) → useMyPendingApprovalsQuery, useActOnApprovalRequestMutation.
- **Policy admin:** SetupApprovalView → ApprovalPoliciesView/ApprovalPolicyForm; routes now use requirePermission("approval.policy.view" / "approval.policy.manage") (backend/src/routes/approval.ts lines 30, 50, 68, 87).
- **PO screens:** Routes now require permission("po.manage") (po.ts lines 31, 57, 72, 90, 108, 126, 148); page structure unchanged (/purchase-orders queue, /purchase-orders/tracking list, /purchase-orders/[prId]).
- **Approval API:** No signature changes; auth migrated to permission keys.
- **PO API:** No signature changes; all endpoints require `po.manage` permission.

### 10. Auth system: roles → permissions

- **Routes:** Approval/PO routes migrated from `requireRole(…)` to individual `requirePermission()` calls with keys (approval.policy.view, approval.policy.manage, po.manage).
- **Services:** approvalService.submitRequest takes optional `actor: Actor` (line 323); if has `approval.auto_approve_own`, auto-approves. prService.create/update/cancel take `actor: Actor` for permission checks (pr.link_machine, requester/super-admin).

## Files likely to change

- **specs:** docs/specs/approval.md, approval-policies.md, purchase-order.md; PR line states in purchase-requisition or approval module.
- **contracts:** .contracts/api-manifest.json (auth changed); bun run contract:generate.
- **tests:** No approval/PO tests exist (map note); test-writer covers BR-APR-*, PO flows, BR-PR-25/28/30–36.

## Map edits needed

- **approval.md:** Add BR-PR-11 (estimate recompute + policy re-match at submit), BR-PR-47 (PR FOR UPDATE on submit), submitRequest(…, actorId, actor?) signature, cancelOpenRequestForDocument options param, withdraw action, approval.auto_approve_own permission, approvedBy=null for auto-approve.
- **approval.md:** Note F-APR-1 (fallback chain hard-coded, should be seeded).
- **purchase-order.md:** Note permission change (po.manage replaces role-based auth); no service logic changes.
- **purchase-requisition.md (if exists):** Add BR-PR-11, BR-PR-25, BR-PR-28, BR-PR-30–31–32–36, expectedDate field, issuedQty/status tracking, ordered-lines cancel block, reason-required on cancel (or in approval module if PR cancel is owned there).
