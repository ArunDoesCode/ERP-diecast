---
module: purchase-requisition
spec: docs/specs/purchase-requisition.md (frozen)
last_verified_commit: eea4fb1
last_verified_on: 2026-09-29
depends_on: [approval, inventory, purchase-order, auth-setup]
---

# Purchase Requisition (PR) — as-built map

> What the code **is** (the spec says what it **should be**). Agents read this before touching the module
> and only explore code changed since `last_verified_commit`
> (`git diff eea4fb1..HEAD --stat -- backend/src/routes/pr.ts backend/src/controller/prController.ts backend/src/service/prService.ts backend/src/repository/prRepository.ts backend/src/types/pr.types.ts backend/src/db/schemas/02_procurement-purchasing.ts frontend/src/app/\(protected\)/purchase-requisitions frontend/src/components/views/purchase-requisitions frontend/src/components/pages/purchase-requisitions frontend/src/lib/api/purchase-requisitions`).
> Use symbol names, not line numbers — lines rot.

## Summary
PR is the intake document for procurement: a requester picks a type, an optional sale-order / machine link,
notes and catalog item lines. Built end to end (backend + frontend): create, edit (draft only), submit,
withdraw, cancel (whole PR), cancel one line, list, detail. Approval is the shared approval module; the PO
module moves the lines (`pending → po_draft → ordered → closed / cancelled`) and the header follows.
Maturity: full for M1 scope (BR-PR-01..47). Users: requester (edit/cancel own PR), super-admin (all).

## Code locations
| Layer | Path | Key symbols |
|---|---|---|
| schema | `backend/src/db/schemas/02_procurement-purchasing.ts` | `purchaseRequests`, `purchaseRequestItems`, `prTypeEnum`, `prStatusEnum`, `prItemStatusEnum`, `prPoItemLinks` |
| types | `backend/src/types/pr.types.ts` | `createPrSchema`, `updatePrSchema`, `cancelPrSchema`, `prListQuerySchema`, `prSchema`, `prItemDetailSchema`, `prDetailsSchema`, `prUpdateResultSchema`, `prCancelResultSchema`, `prLineCancelResultSchema` |
| repository | `backend/src/repository/prRepository.ts` | `prRepository.{list,findPrById,findPrByIdForUpdate,lockHeadersInOrder,findPrItemsByPrId,findPrDetailsById,findMachineById,findItemMasterByIds,createWithItems,updatePrById,updatePrItemById,createPrItem,deletePrItemsByIds,recalculateEstimatedAmountByPrId,findOrderedLinesWithLivePos,cancelPr,findItemByIdForUpdate,cancelItem,recomputeHeaderStatusFromItems}` |
| service | `backend/src/service/prService.ts` | `prService.{list,getDetails,create,update,cancel,cancelLine}` |
| controller | `backend/src/controller/prController.ts` | `prController.{list,details,create,update,remove,cancelLine}` |
| routes | `backend/src/routes/pr.ts` + `END_POINTS.pr` in `end-points.ts` | mounted at `/api/pr`; all routes `requirePermission("pr.manage")` |
| frontend api | `frontend/src/lib/api/purchase-requisitions/{fetchers,queries,error-messages}.ts` | `getPurchaseRequisitions`, `getPurchaseRequisitionById`, `createPurchaseRequisition`, `updatePurchaseRequisition`, `deletePurchaseRequisition` (id in path, `{reason}` body), `cancelPurchaseRequisitionLine`, matching `use…Query/Mutation` hooks, `toPRCreatePayload`, `toPRUpdatePayload`, `PR_ERROR_MESSAGES`, `prErrorMessage` |
| frontend ui | `frontend/src/app/(protected)/purchase-requisitions/page.tsx`, `components/views/purchase-requisitions/{PurchaseRequisitionsView,use-pr-list-controls}`, `components/pages/purchase-requisitions/{PurchaseRequisitionsCards,PurchaseRequisitionModals,PurchaseRequisitionsPagination,CancelPurchaseRequisitionDialog,CancelPrLineDialog,purchase-requisition-modal-shared}.tsx` | `PurchaseRequisitionsView`, `CreatePurchaseRequisitionModal`, `EditPurchaseRequisitionModal` (holds submit / withdraw / approval actions) |

No PR detail *page* route (no `purchase-requisitions/[id]/page.tsx`): detail is shown inside `EditPurchaseRequisitionModal`.

## Data model
- `purchase_requests`: `prNumber` (`PR-{periodKey}-{seq}`), `type` (sale_order, stock_reorder, maintenance, tooling, subcontracting, misc), `saleOrderId` (no FK, not checked), `assetId` (machine; required for `maintenance`), `status`, `requestedBy`, `approvedBy`, `currentApprovalLevel`/`totalApprovalLevels` (approval mirror), `notes`, `estimatedAmountPaise`, `cancelledBy`, `cancelledAt`, `cancelReason`, `createdAt`/`updatedAt`.
- `prStatusEnum`: `draft, pending_approval, approved, rejected, partial_ordered, fully_ordered, cancelled`.
- `purchase_request_items`: `prId`, `itemId`, `requestedQty` (3 decimals), `issuedQty` (moved by PO code), `uom` (from item master), `expectedDate`, `status` (`prItemStatusEnum`: pending, po_draft, ordered, closed, cancelled), line cancel audit `cancelReason`/`cancelledBy`/`cancelledAt`.
- `pr_po_item_links` (`prItemId`, `poItemId`, `linkedQty`): PR line to PO line trace; written only by the PO module.

## API
| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/api/pr/getprs` | `pr.manage` | Paginated list. Sort: id, prNumber, type, status, createdAt. `q` matches prNumber/notes/type/status; `status[]`, `type` filters. |
| GET | `/api/pr/getprdetails/:id` | same | Header (+ `requestedByName`, `cancelledByName`), lines (item info, `estRatePaise`, `noCostHistory`, cancel audit, linked PO, default supplier), `linkedPos` |
| POST | `/api/pr/createpr` | same | Create PR + lines (status `draft`) |
| PATCH | `/api/pr/updatepr` | same | Edit header and `inserts`/`updates`/`deletes` of lines (`prId` in body). `status` in body is rejected |
| DELETE | `/api/pr/deletepr/:id` | same | Cancel the PR; body `{reason}` 3–500 always |
| POST | `/api/pr/:id/lines/:lineId/cancel` | same | Cancel one pending line; body `{reason}` 3–500 |

Submit and withdraw are not PR routes: `POST /approval/submitRequest` (`docType: "pr"`) and `actOnRequest` with action `withdraw`.
Full shapes: `cd backend && bun run contract:query "<METHOD /path>"`.

## Key flows
- **create**: `assertCanLinkMachine` (needs `pr.link_machine` when `assetId` set, BR-AUTH-26); `maintenance` needs a valid `assetId` (`findMachineById`); duplicate item → `PR_DUPLICATE_ITEM`; required-by date in the past → `PR_DATE_IN_PAST`; every item must be active (`findItemMasterByIds` returns active only) else `PR_INVALID_ITEM`. `createWithItems` runs one transaction: `allocateDocumentSequence(tx, "pr", …)`, estimate, insert header (`draft`) and lines. Schema: notes required 1–2000, qty > 0 with at most 3 decimals, at least one line.
- **update**: one transaction. `findPrByIdForUpdate` (row lock) → requester or `isSuperAdmin` else 403 `PR_NOT_REQUESTER` (BR-PR-17) → status must be `draft` else 409 `PR_NOT_EDITABLE`. `pr.link_machine` is checked only when `assetId` is added or changed (unchanged `assetId` passes). Lines: unknown line id 404, zero lines left → `PR_MIN_ONE_LINE`, duplicate items → `PR_DUPLICATE_ITEM`. Lines are written one row at a time. Ends with `recalculateEstimatedAmountByPrId`. The controller rejects any `status` key with 400 `PR_STATUS_VIA_ACTION` (BL-026).
- **estimate (BR-PR-11/14)**: `effectiveRatePaise` = item average cost, or item `standardRatePaise` while average cost is 0. Detail lines carry `estRatePaise` and `noCostHistory` (average cost = 0); the edit modal shows a note for those lines (eea4fb1).
- **cancel** (`DELETE /deletepr/:id`): `parseCancelReason` → `prService.cancel` in one transaction. If `pending_approval`, the open approval request is locked first (same order as approval actions), then the PR row lock. Requester or super-admin only. Lines on a PO (`po_draft/ordered/closed`, PO not cancelled) → 409 `PR_HAS_ORDERED_LINES` listing PO numbers. Only `draft`, `pending_approval`, `approved` can be cancelled (`PR_INVALID_TRANSITION`). `cancelPr` sets header `cancelled` + `cancelledBy/At/cancelReason` and cancels pending lines; `approvalRepository.cancelOpenRequestForDocument` runs in the same transaction.
- **cancelLine** (BR-PR-33/36): PR lock, then line lock (CRP-2 order). Requester / super-admin; line `po_draft`/`ordered` → 409 `PR_LINE_ON_LIVE_PO`; not `pending` → `PR_LINE_NOT_PENDING`; header must be `approved`/`partial_ordered`. `cancelItem` stores reason/who/when, then `recomputeHeaderStatusFromItems`.
- **submit / withdraw / decide**: `approvalService.submitRequest` opens the chain (or auto-approves) and mirrors status onto the PR via `approvalRepository.updatePrApprovalMirror` (`pending_approval` or `approved`). `actOnRequest`: `withdraw` and `require_more_info` → `draft`; approve / reject / cancel pass through. Inactive items are not re-checked at submit.
- **header status from lines** (`recomputeHeaderStatusFromItems`, called by PO code and line cancel): runs only when the header is `approved`/`partial_ordered`/`fully_ordered`; ignores cancelled lines; all pending → `approved`, all on PO → `fully_ordered`, else `partial_ordered`; every line cancelled → header `cancelled` (reason "All lines cancelled", no `cancelledBy`).
- **PO hand-off**: PO code (`poRepository`) locks PR headers first (`lockHeadersInOrder`) then lines, sets `po_draft` and `issuedQty` on draft; `orderPrLinesOfPo` → `ordered` on PO approval; `cancelPrLinesOfPo` → `cancelled` (gives `issuedQty` back) on PO cancel or reject; `closePrLinesOfPo` → `closed` on PO short-close; deleting a line from a draft PO reverts the PR line to `pending`.
- **list / details**: `prRepository.list` does `ilike` over prNumber/notes and text casts of type/status, `inArray` for status/type, count in parallel. `findPrDetailsById` runs header, lines and linked POs in parallel plus one batched `selectDistinctOn` for the last supplier per item (no N+1).

## Invariants & gotchas
- `uom` is always taken from the item master, never from the client.
- Lock order everywhere: approval request → PR header → PR lines (CRP-2). Do not lock lines first.
- `recomputeHeaderStatusFromItems` is a direct repository write (no transition table). `PR_STATUS_TRANSITIONS` no longer exists in `prService`.
- `ordered` is written on PO approval; `closed` only by PO short-close (a fully received PO leaves its lines `ordered`).
- Estimate is a snapshot: recomputed on create / line edits, not when item cost changes later.
- `saleOrderId` is stored as given: no FK, no existence check (no sale-order module yet).
- Frontend: the edit modal reads `isSuperAdmin` from the auth session store (`/auth/me`) to show edit / cancel for non-requesters; machine field gated by `useCan("pr.link_machine")`. The list sends status / type search through `q` (`use-pr-list-controls`).

## Tests
| File | Covers |
|---|---|
| `backend/src/routes/pr-lifecycle.test.ts` | BR-PR-01, 02, 06, 08, 11, 14, 15, 17, 19, 21, 45, 46, 47 |
| `backend/src/routes/pr-cancel.test.ts` | BR-PR-15, 17, 39, 41, 42, 43, 45, 46, 47 (+ BR-KD-01..16) |
| `backend/src/routes/pr-machine.test.ts` | BR-AUTH-26, BR-PR-17 |
| `backend/src/routes/po-lifecycle.test.ts` | PR side of PO flows: BR-PR-25, 28, 30, 31, 32, 33, 36, 46, 47 |
| `backend/src/routes/approval-requests.test.ts`, `service/approvalService.test.ts` | approval submit / withdraw / act for PR docs |

No frontend tests.

## Known gaps / debt
- Fixed by the code (verified at `eea4fb1`): BL-001 (cancel sends id in path + reason), BL-019 (`ordered`/`closed`/`cancelled` are now written by the PO flows), BL-026 (edit only in draft, PATCH rejects `status`), BL-028 (PO reject cancels PR lines), BL-029 (header recompute has a status guard).
- BL-030 open: `prService.update` still writes lines one by one and is one long function.
- BL-034 open: `prRepository.list` `q` still matches `type::text` / `status::text`, and the frontend list sends status / type through `q`.
- CRP-5 (repo layering): `poRepository` writes PR line rows directly and calls `prRepository`; repositories cross module lines.
- `saleOrderId` existence is not validated (waits for the sale-order module, M4).
- Inactive items are checked at create / edit only, not at submit.
- No PR detail route; detail lives in the edit modal.
- PERF-03 / 05 / 09 (minor batching and search): named in review findings (`.pipeline/m1/findings.md`), not fixed.

## History
| Date | PR / commit | Change |
|---|---|---|
| 2026-07-21 | (see `backend/docs/backend-audit-remediation-2026-07-21.md`) | Backend audit + remediation plan scoped to the PR flow |
| 2026-09-27 | 0a406f4 | Map first verified |
| 2026-09-29 | work/m1 0a406f4..eea4fb1 | M1 build: draft-only edit, requester/super-admin rule, cancel with reason and audit, line cancel, line states written by PO flows, estimate fallback + `noCostHistory`, machine permission, row locks; frozen spec v2; 4 test files |
