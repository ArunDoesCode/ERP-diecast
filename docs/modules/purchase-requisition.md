---
module: purchase-requisition
spec: none yet
last_verified_commit: 0a406f4
last_verified_on: 2026-09-27
depends_on: [approval, inventory]
---

# Purchase Requisition (PR) — as-built map

> What the code **is** (the spec says what it **should be**). Agents read this before touching the module
> and only explore code changed since `last_verified_commit`
> (`git diff 0a406f4..HEAD --stat -- backend/src/routes/pr.ts backend/src/controller/prController.ts backend/src/service/prService.ts backend/src/repository/prRepository.ts backend/src/types/pr.types.ts frontend/src/app/\(protected\)/purchase-requisitions frontend/src/components/views/purchase-requisitions frontend/src/components/pages/purchase-requisitions frontend/src/lib/api/purchase-requisitions`).
> Use symbol names, not line numbers — lines rot.

## Summary
PR is the intake document for procurement: a requester picks a type, optional sale-order/asset link,
and a list of catalog items with requested quantities. It moves through a status machine
(`draft → pending_approval → approved → partial_ordered/fully_ordered`) driven partly by the shared
approval module and partly by the PO module (draft/close a PO flips linked PR item statuses back).
Full CRUD + list + cancel is implemented end-to-end (backend + frontend); line-level PR→PO traceability
(`pr_po_item_links`) is implemented and surfaced on the PR detail page. Maturity: full for create/edit/cancel/
list/detail; the estimated-amount rollup and default-supplier suggestion are working conveniences, not
core to the workflow.

## Code locations
| Layer | Path | Key symbols |
|---|---|---|
| schema | `backend/src/db/schemas/02_procurement-purchasing.ts` | `purchaseRequests`, `purchaseRequestItems`, `prTypeEnum`, `prStatusEnum`, `prItemStatusEnum`, `prPoItemLinks` |
| types | `backend/src/types/pr.types.ts` | `createPrSchema`, `updatePrSchema`, `prListQuerySchema`, `prSchema`, `prDetailsSchema`, `prUpdateResultSchema` |
| repository | `backend/src/repository/prRepository.ts` | `prRepository.{list,findPrById,findPrDetailsById,createWithItems,updatePrById,updatePrItemById,createPrItem,deletePrItemsByIds,recalculateEstimatedAmountByPrId,setStatusCancelled,recomputeHeaderStatusFromItems}` |
| service | `backend/src/service/prService.ts` | `prService.{list,getDetails,create,update,cancel}`, `PR_STATUS_TRANSITIONS`, `assertValidStatusTransition` |
| controller | `backend/src/controller/prController.ts` | `prController.{list,details,create,update,remove}` |
| routes | `backend/src/routes/pr.ts` + `END_POINTS.pr` in `end-points.ts` | mounted at `/api/pr` |
| frontend api | `frontend/src/lib/api/purchase-requisitions/{fetchers,queries}.ts` | `getPurchaseRequisitions`, `getPurchaseRequisitionById`, `createPurchaseRequisition`, `updatePurchaseRequisition`, `deletePurchaseRequisition`, `usePurchaseRequisitionsQuery`, `usePurchaseRequisitionDetailQuery`, `useCreatePurchaseRequisitionMutation`, `useUpdatePurchaseRequisitionMutation`, `useDeletePurchaseRequisitionMutation`, `toPRCreatePayload`, `toPRUpdatePayload` |
| frontend ui | `frontend/src/app/(protected)/purchase-requisitions/page.tsx`, `components/views/purchase-requisitions/PurchaseRequisitionsView.tsx`, `components/pages/purchase-requisitions/{PurchaseRequisitionsCards,PurchaseRequisitionModals,PurchaseRequisitionsPagination,purchase-requisition-modal-shared}.tsx` | `PurchaseRequisitionsView`, `CreatePurchaseRequisitionModal`, `EditPurchaseRequisitionModal` (both lazy-loaded via `next/dynamic`) |

There is no PR detail *page* route today (no `purchase-requisitions/[id]/page.tsx`) — the detail schema/query/`prDetailsSchema` exist and are exercised through `EditPurchaseRequisitionModal`, not a standalone route.

## Data model
- `purchase_requests`: `prNumber` (unique, `PR-{periodKey}-{seq}`), `type` (`prTypeEnum`: sale_order, stock_reorder, maintenance, tooling, subcontracting, misc), `saleOrderId` (nullable, no FK enforced), `assetId` (nullable, required when `type = maintenance`), `status` (`prStatusEnum`), `requestedBy`/`approvedBy` (FK employees), `currentApprovalLevel`/`totalApprovalLevels` (mirrored from the approval module), `estimatedAmountPaise` (derived, recalculated on every item mutation from `itemMaster.averageCostPaise`), `createdAt`/`updatedAt`.
- `prStatusEnum` values: `draft, pending_approval, approved, rejected, partial_ordered, fully_ordered, cancelled`.
- `purchase_request_items`: `prId`, `itemId` (FK `itemMaster`), `requestedQty`, `issuedQty` (bumped by PO drafting, never by the PR module itself), `uom` (always derived server-side from `itemMaster.uom`, never trusted from the client), `expectedDate`, `status` (`prItemStatusEnum`: pending, po_draft, ordered, closed, cancelled).
- `pr_po_item_links`: many-to-many resolution table (`prItemId`, `poItemId`, `linkedQty`) — one PR item can spawn lines across multiple POs over time (as `issuedQty` is drawn down), and PR detail/PO detail both join through it for traceability.
- No direct FK from `purchase_requests` to `sale_order`/`asset` tables is enforced beyond `assetId` being checked at runtime against `machines` (see Invariants).

## API
| Method | Path | Roles | Purpose |
|---|---|---|---|
| GET | `/api/pr/getprs` | super-admin, owner, floor_supervisor, back_office | Paginated list. Sortable: id, prNumber, type, status, createdAt. Free-text `q` matches prNumber/notes/type/status; `status`/`type` are separate filters. |
| GET | `/api/pr/getprdetails/:id` | same | PR header + items (joined to item master, plus default-supplier suggestion and linked PO summaries) |
| POST | `/api/pr/createpr` | same | Create PR + line items in one call |
| PATCH | `/api/pr/updatepr` | same | Update header fields and/or insert/update/delete line items in one call (`prId` in body) |
| DELETE | `/api/pr/deletepr/:id` | same | Cancel the PR (id in **path**) |

Full shapes: `cd backend && bun run contract:query "<METHOD /path>"`.

## Key flows
- **`create`**: `prController.create` parses `createPrSchema` → `prService.create(body, actorId)` validates `assetId` required/valid when `type=maintenance`, resolves all `itemId`s against `itemMaster` (400 on any unknown id), derives `uom` per item server-side → `prRepository.createWithItems` opens a transaction, calls `allocateDocumentSequence(tx, "pr", requestedBy)` to mint `PR-{periodKey}-{seq}`, computes `estimatedAmountPaise` from `averageCostPaise × requestedQty`, inserts the PR row (`status: "draft"`) and its items.
- **`update`**: `prService.update` blocks setting `status` to any of `approved/rejected/partial_ordered/fully_ordered` directly — those are "approval-owned" statuses (`APPROVAL_OWNED_STATUSES`) and must go through the approval action endpoint instead. Inside one transaction: validates the new status transition (if any) via `PR_STATUS_TRANSITIONS`, re-validates `assetId`/`type` combination, then applies `inserts`/`updates`/`deletes` against `purchase_request_items` (validating referenced line ids exist, no duplicate resulting `itemId`s), and finally calls `recalculateEstimatedAmountByPrId` to refresh the header total.
- **`cancel`** (`DELETE /deletepr/:id`): `prService.cancel` asserts `PR_STATUS_TRANSITIONS[current]` allows `cancelled`, sets status via `setStatusCancelled`, then calls `approvalRepository.cancelOpenRequestForDocument("pr", prId)` to close out any open approval request for this doc.
- **Approval hand-off**: the frontend's `EditPurchaseRequisitionModal`/`PurchaseRequisitionModals` calls `useSubmitApprovalRequestMutation` → `POST /approval/submitRequest` with `{ docType: "pr", docId }` — a *separate* endpoint from `updatepr`. `approvalService.submitRequest` looks up a matching policy (or an auto-approve fallback), opens the approval chain, and mirrors the resulting status/level back onto `purchase_requests` via `approvalRepository.updatePrApprovalMirror` (status becomes `pending_approval` or, if the policy auto-approves, `approved` immediately). Later, `approvalService.actOnRequest` (act on a pending step) again calls `updatePrApprovalMirror`, mapping the approval outcome to a PR status: `approved`/`rejected`/`cancelled`/`pending_approval` pass through as-is; `require_more_info` maps back to `draft`.
- **PO hand-off (PR → PO)**: PR itself never creates PO rows. `poRepository.createWithItems`/`updateWithItems` (in the PO module) lock the targeted `purchase_request_items` rows `FOR UPDATE`, require `status = "pending"` and parent PR `status` in `{approved, partial_ordered}`, then bump `issuedQty` and flip the PR item to `po_draft`, insert a `pr_po_item_links` row, and call `prRepository.recomputeHeaderStatusFromItems(prId)` — which recomputes the **PR header status** from its items' statuses (`approved` if all items still pending, `fully_ordered` if all items are po_draft/ordered/closed, else `partial_ordered`). This is a direct repository write from the PO side, bypassing `prService.assertValidStatusTransition` — documented in-code as intentional, matching the existing approval-mirror pattern.
- **List**: `prRepository.list` builds `ilike` search over `prNumber`/`notes`/`type`/`status`, `inArray` filters for `status[]`/`type`, sorts by an allowlist (`prSortColumns`), paginates with `count()` run in parallel.
- **Details**: `prRepository.findPrDetailsById` does 3 queries in parallel (PR+requester name, items+linked PO via `prPoItemLinks`, distinct linked POs) plus one more batched (`selectDistinctOn`) query for "last supplier used per item" — explicitly written to avoid N+1 per line.

## Invariants & gotchas
- `uom` on a PR item is **always** derived server-side from `itemMaster.uom` — never trust a client-sent `uom` (P2.4 in the remediation doc flagged the create schema still nominally accepting `uom`, but `prService.create`/`update` always overwrite it from the item master lookup).
- `assetId` is required when `type = "maintenance"` and must resolve to a real row in `machines` — checked on both create and update (including the case where `type` is being changed *to* maintenance without also setting `assetId`).
- Header `status` cannot be set to `approved/rejected/partial_ordered/fully_ordered` via `PATCH /updatepr` — must go through `POST /approval/submitRequest` + `POST /approval/actOnRequest/:id`. Attempting it throws `BadRequestError("Use the approval action endpoint to approve or reject a PR")`.
- `estimatedAmountPaise` is a point-in-time snapshot of `itemMaster.averageCostPaise × requestedQty` at the moment of the last create/update — it is **not** recalculated when `averageCostPaise` changes later on the item master; only a PR-item mutation triggers a recompute.
- `purchaseRequestItems.status` is the single source of truth the PO module reads to decide whether a line is still draftable (`"pending"`) — the PR module itself only ever sets it to `pending` (implicitly, at insert) or reverts it via the PO module's cancel path; it never writes `po_draft` itself (only the PO module does, in `createWithItems`/`updateWithItems`).
- **`prItemStatusEnum` values `ordered`/`closed` are declared but never written anywhere in `backend/src`** (verified by grep across `repository/` and `service/`, including the GRN module). A PR item only ever reaches `pending` or `po_draft` today; it never advances further even after its PO is fully received or closed. `recomputeHeaderStatusFromItems`'s "all ordered" check (`["po_draft", "ordered", "closed"].includes(...)`) therefore only ever matches on `po_draft` in practice — the PR header still correctly reaches `fully_ordered`, but this is effectively dead code for the `ordered`/`closed` item states.
- `PR_STATUS_TRANSITIONS` is a forward-only DAG (no `approved → draft` etc.); `require_more_info` isn't a PR-side concept at all — it's an approval-request outcome that maps back to PR `status: "draft"`.
- **Known frontend/backend contract mismatch**: `frontend/src/lib/api/purchase-requisitions/fetchers.ts`'s `deletePurchaseRequisition(payload)` calls `api.delete(API_ROUTES.purchaseRequisitions.remove, payload)` where `API_ROUTES.purchaseRequisitions.remove` is the **plain string** `"/pr/deletepr"` (no id interpolated) and the id is sent as `{ prId }` in the request body. The backend route is `DELETE /api/pr/deletepr/:id` (id in the **path**, no body parsing at all — `prController.remove` reads `c.req.param("id")` only). Contrast with the PO module's `remove: (poId) => \`/po/deletepo/${poId}\`` which is correctly parameterized. This means PR cancel from the UI is likely broken or silently hitting a 404/undefined-id route today — verify against the running backend before assuming cancel works from the PR list/detail UI.

## Tests
| File | Covers |
|---|---|
| *(none found)* | `backend/docs/backend-audit-remediation-2026-07-21.md` §5 proposes route-level and service-level tests for this module; none exist in `src/**/__tests__` or `*.test.ts` as of this writing. |

## Known gaps / debt
- Frontend `deletePurchaseRequisition` sends `DELETE /pr/deletepr` with `{ prId }` in the body; backend expects `DELETE /pr/deletepr/:id` with the id in the path — see gotcha above. High-priority fix candidate.
- No PR detail page route (`purchase-requisitions/[id]/page.tsx` doesn't exist) — detail data is only consumed inside the edit modal, not a shareable/linkable URL.
- `backend/docs/backend-audit-remediation-2026-07-21.md` P1.1 (atomic sequence strategy for PR numbers) and P2.4 (drop unused `uom` from the create payload contract) — both appear to already be implemented in current code (`allocateDocumentSequence`, service-side `uom` derivation) but the doc itself hasn't been marked resolved; treat the doc as historical audit input, not current status.
- No automated tests for any layer of this module (repository/service/controller/route).
- `saleOrderId` has no FK/existence check anywhere in `prService` — a nonexistent sale order id is accepted silently (there's no sale-order module yet per `backend/CLAUDE.md`, so this is presumably a forward-compatible placeholder, not a bug in isolation).

## History
| Date | PR / commit | Change |
|---|---|---|
| 2026-07-21 | (see `backend/docs/backend-audit-remediation-2026-07-21.md`) | Backend audit + remediation plan scoped to the PR flow (non-null integrity, AppError contract, atomic PR numbering, status transition guardrails, delete-contract path-param alignment) |
| 2026-09-27 | 0a406f4 | Map last verified against this commit |
