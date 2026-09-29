# Brief 02 — explorer — map-first, diff-only lookup for subcontracting build
Feature: subcontracting  Branch: claude/subcontracting-feature-b19136  Spec: docs/specs/subcontracting.md (v1, frozen)
BR scope: BR-SCO-01..25
## Task
The map `docs/modules/subcontracting.md` (last_verified_commit 5bbfd58) says: schema + approval plumbing
only, no SCO feature code. Read the map first, then look only at what changed since 5bbfd58
(`git diff --stat 5bbfd58..HEAD -- backend frontend`) plus the reuse points below. Answer, with file:line:
1. Stock posting: which service/function posts `inventory_ledger` rows today (GRN accept, stock-take)?
   How does it lock, check BR-GRN-33 (no negative balance per item+location), and move the moving
   average (BR-GRN-38)? Can it post a transfer (two rows, item total/average unchanged)? Where is "main
   store" and "scrap yard" location resolved? Is `sco_loss` already in `inventoryRefTypeEnum`?
2. Document numbering (`document-number.ts` or similar): how PO numbers are made; what's needed for
   `SCO-<period>-<seq>` and FY-based `JWC/<FY>/<seq>`.
3. Approval: how PO submit/approve/reject/send-back/withdraw/cancel hook into the approval module
   (functions, the mirror update, `findDocumentContext`). What the SCO branch does today (amount 0,
   category any, `updateScoApprovalMirror`, BL-065 no row lock on submit).
4. PO module as the pattern to copy: file list per layer (routes descriptor in `end-points.ts`, routes,
   controller, service, repository, Zod types, error helpers, `requireRole`/permission middleware, audit
   trail), and the frontend pattern (page → view → pages-component, API_ROUTES, hooks, nav screen entry in
   `SCREENS` in `backend/src/lib/permissions.ts`).
5. Suppliers: supplier type, active flag, `supplierServices` (price, tax %), GSTIN; service master
   active flag. Company/plant GSTIN + state: does any settings/config hold it? Item HSN: any field?
6. Test helpers: existing factories/fixtures for users with roles, suppliers, items, locations, stock,
   approval policies (paths only).
7. Scenario tests folder layout (`backend/src/scenarios/**`).
## Scope (required — every line filled)
- In: read-only lookup answering the 7 questions above.
- Out: no edits, no design proposals beyond "reuse X", no reading unrelated modules in depth.
- May edit: .pipeline/subcontracting/reports/02-explorer.md   May read: anything
- Size: report ≤ 200 lines, file:line pointers over pasted code
- Stop if: a question needs a business decision → note it under QUESTIONS
## Inputs
- docs/modules/subcontracting.md, docs/modules/grn.md, docs/modules/inventory.md, docs/modules/purchase-order.md, docs/modules/approval.md, docs/modules/suppliers.md
## Done when
- Each of the 7 questions answered with file:line.
Write your report to: .pipeline/subcontracting/reports/02-explorer.md
