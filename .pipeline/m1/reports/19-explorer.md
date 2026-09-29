# Brief 19 — explorer — PR + known-defects module input

Map dated 2026-09-27 (commit 0a406f4). Diff since: auth migration to permission-based system, no PR logic changes. Five answers below.

## 1. PR cancel/delete end-to-end

**Frontend→Backend contract mismatch (BL-001, known):**
- Frontend: `deletePurchaseRequisition(payload)` → `fetchers.ts:54` calls `api.delete(API_ROUTES.purchaseRequisitions.remove, payload)` where `remove = "/pr/deletepr"` + body `{ prId }` (queries.ts:118)
- Backend route: `DELETE /api/pr/deletepr/:id` expects id in **path param** (pr.ts:67, prController.remove reads `c.req.param("id")`)
- **Flow:** prController.remove:52 → prService.cancel:347 → prRepository.setStatusCancelled:527 + approvalRepository.cancelOpenRequestForDocument (prService.ts:360)
- Status check: PR_STATUS_TRANSITIONS[current] must allow "cancelled" (prService.ts:353, assertValidStatusTransition:37)
- Cancel rules: BR-PR-39/41/42 need status/line checks, audit fields (`cancelledBy`, `cancelledAt`, `cancelReason`); schema missing all three (02_procurement-purchasing.ts:37 shows only `createdAt`/`updatedAt`)

## 2. PR create/update/submit: status checks, line status writes, cost estimate, audit

- **Create flow (prService.create:84):** validates assetId + type combo, resolves all itemIds vs itemMaster, derives uom server-side, calls createWithItems:377 → allocateDocumentSequence, calculates estimatedAmountPaise = sum(requestedQty × itemMaster.averageCostPaise), inserts PR (status="draft") + items (status="pending" implicit on insert)
- **Update flow (prService.update:134):** blocks direct setting of approval-owned statuses (approved/rejected/partial_ordered/fully_ordered); validates status transitions via PR_STATUS_TRANSITIONS; re-validates assetId/type; applies inserts/updates/deletes on items; calls recalculateEstimatedAmountByPrId:499 — recalc uses **current itemMaster.averageCostPaise**, not stored rate
- **Submit:** not in prService — goes through approvalService.submitRequest (separate endpoint POST /approval/submitRequest), mirrors status onto PR header
- **PR item status write:** only "pending" on create (default); "po_draft" written by poRepository on PO create (prRepository.ts:72 notes this deliberately); "ordered"/"closed" values declared but never written (map says dead code)
- **Audit columns:** schema has none on purchase_requests (createdBy missing; updatedAt exists). BR-PR-41/46 in map list need `updatedBy`, `cancelledBy`, `cancelledAt`, `cancelReason`
- **Cost source:** averageCostPaise from itemMaster (map says per GRN spec / BL-014, no standard-rate fallback today)

## 3. PO actions that change PR lines/headers (BR-PR-30/31/36)

- **PO create (poRepository.createWithItems:377):** locks PR items FOR UPDATE, requires PR items status="pending" and parent PR status ∈ {approved, partial_ordered}, bumps issuedQty, flips item to po_draft, inserts pr_po_item_links row, calls recomputeHeaderStatusFromItems:541 (line 421 in poRepository)
- **PO update (poRepository.updateWithItems:580):** same flow (line 679)
- **PO cancel (setStatusCancelled:743 + cancel:750):** calls recomputeHeaderStatusFromItems (line 777) after reverting issuedQty via PR item update
- **approvalService:** no direct PR-line writes found; approval reject/cancel maps back to PR header status only (not reverting lines per map known gap BR-PR-31)
- **Header recompute logic:** allPending? → "approved" : allOrdered(po_draft/ordered/closed)? → "fully_ordered" : "partial_ordered" (prRepository.ts:541). Map gap BR-PR-36: doesn't skip cancelled lines, doesn't skip draft/pending/rejected/cancelled headers as terminal states

## 4. Bootstrap-admin & db:reset: what exists

- **Scripts:** None for bootstrap-admin or db:reset (BL-004, BL-005 in CI comment .github/workflows/ci.yml)
- **What exists:** `scripts/prepare-test-db.ts` (schema + test seed), `scripts/seed-approval-policies.ts` (approval-policy rows), no CI bootstrap
- **Implication:** Tests don't need super-admin but approval policies do (map gap). Production initialization story unclear.

## 5. Frontend PR screens & API calls

- **Screens:** CreatePurchaseRequisitionModal (PurchaseRequisitionModals.tsx:80) – form with machines, items lookup; EditPurchaseRequisitionModal:426 (same, pre-populated); PurchaseRequisitionsView.tsx – list with filter controls (status/type/search)
- **No detail page route** (map notes: no `purchase-requisitions/[id]/page.tsx`; detail data consumed only inside EditModal)
- **API calls:** getPurchaseRequisitions (list, paginated with sortBy/sortDir), getPurchaseRequisitionById (used only in modal), createPurchaseRequisition, updatePurchaseRequisition, deletePurchaseRequisition (broken by contract mismatch above). Mutations invalidate both list + detail query keys on success (queries.ts:75, 99, 126)
- **Auth:** all routes require `pr.manage` permission (pr.ts route blocks; prService.create/update check `pr.link_machine` when assetId set — BR-AUTH-26)

---

## Map edits needed

- **section: Known gaps / debt, line "Frontend `deletePurchaseRequisition`..."** — confirmed still broken; status: HIGH priority
- **section: Invariants, line "**`prItemStatusEnum` values..."** — confirmed "ordered"/"closed" never written; dead code confirmed
- **section: Known gaps (from spec draft 2026-09-27), line "Schema: add `updatedBy`..."** — updatedBy + cancelledBy + cancelledAt + cancelReason still missing; map should note these in schema section as **missing audit fields**

---

## Notable findings

- `estimatedAmountPaise` is point-in-time snapshot; recalc on every PR-item mutation uses **current** itemMaster.averageCostPaise, not stored rate (policy choice, not a bug)
- Auth migration from roles to permission keys complete in this diff; all PR routes now use `requirePermission("pr.manage")`
- recomputeHeaderStatusFromItems has no transaction parameter in its signature — always uses db, not passed tx (potential consistency gap during nested PO operations, but PO module passes tx correctly per line 421/679/777)
