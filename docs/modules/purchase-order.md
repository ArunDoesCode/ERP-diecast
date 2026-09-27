---
module: purchase-order
spec: none yet
last_verified_commit: 0a406f4
last_verified_on: 2026-09-27
depends_on: [purchase-requisition, approval, suppliers, grn]
---

# Purchase Order — as-built map

> What the code **is** (the spec says what it **should be**). Agents read this before touching the module
> and only explore code changed since `last_verified_commit`
> (`git diff 0a406f4..HEAD --stat -- backend/src/routes/po.ts backend/src/controller/poController.ts backend/src/service/poService.ts backend/src/repository/poRepository.ts backend/src/types/po.types.ts frontend/src/lib/api/purchase-orders frontend/src/components/views/purchase-orders frontend/src/components/pages/purchase-orders`).
> Use symbol names, not line numbers — lines rot.

## Summary
Purchase Order (PO) is drafted from pending PR line items (never typed from scratch), tracks
supplier terms/pricing, and moves through a supplier-communication lifecycle (send → reminder/
escalate → confirm → delay-track) up to receipt (driven by the GRN module) and finally invoice/
close. Full CRUD + list + the full action set (send/reminder/escalate/delay/confirm/invoice/close)
are implemented end-to-end, including a manual-log-only `po_communications` trail. Maturity:
full for draft/create/update/cancel/communication actions; GRN-driven receipt-status transitions
and 3-way invoice matching are only partially built (invoice creates a bare `supplierInvoices`
row, no matching logic yet).

## Code locations
| Layer | Path | Key symbols |
|---|---|---|
| schema | `backend/src/db/schemas/02_procurement-purchasing.ts` | `purchaseOrders`, `purchaseOrderItems`, `poStatusEnum`, `poCommunications`, `poCommunicationTypeEnum/ChannelEnum/StatusEnum`, `prPoItemLinks`, `supplierInvoices` |
| types | `backend/src/types/po.types.ts` | `poSchema`, `poDetailsSchema`, `createPoSchema`, `updatePoSchema`, `cancelPoSchema`, `markPoSentSchema`, `logPoCommunicationSchema`, `updatePoDelaySchema`, `confirmPoSchema`, `markPoInvoicedSchema`, `closePoSchema`, `poCommunicationSchema`, `poListQuerySchema` |
| repository | `backend/src/repository/poRepository.ts` | `list`, `getDetails`, `findPoById`, `createWithItems`, `updateWithItems`, `setStatusCancelled/Dispatched/setStatus`, `insertCommunication`, `insertSupplierInvoice`, `findPurchaseRequestItemsByIdsForUpdate`, `findPoItemQuantitiesByPoId`, `hasGrnForPo` |
| service | `backend/src/service/poService.ts` | `poService.list/getDetails/create/update/cancel/markSent/logReminder/escalate/updateDelay/confirmSupplier/markInvoiced/close/recomputeReceiptStatus`, `PO_STATUS_TRANSITIONS`, `assertLinesAreDraftable` |
| controller | `backend/src/controller/poController.ts` | `poController.list/details/create/update/remove/markSent/reminder/escalate/updateDelay/confirmSupplier/markInvoiced/close` |
| routes | `backend/src/routes/po.ts` + `end-points.ts` `END_POINTS.po` | `poRoutes`, `PO_ROUTES.list/details/create/update/remove/send/reminder/escalate/delay/confirm/invoice/close` |
| frontend api | `frontend/src/lib/api/purchase-orders/` | `fetchers.ts` (one function per endpoint above, e.g. `createPurchaseOrder`, `cancelPurchaseOrder`, `sendPurchaseOrder`, `sendPurchaseOrderReminder`, `escalatePurchaseOrder`, `updatePurchaseOrderDelay`, `confirmPurchaseOrder`, `markPurchaseOrderInvoiced`, `closePurchaseOrder`, `getItemLastRate`), `queries.ts` (matching `use*Query`/`use*Mutation` hooks) |
| frontend ui | `frontend/src/app/(protected)/purchase-orders/page.tsx` (queue), `.../purchase-orders/[prId]/page.tsx` (detail — **param misnamed `prId`, actually a PO id**), `.../purchase-orders/tracking/page.tsx`; `frontend/src/components/views/purchase-orders/{PurchaseOrdersView,PurchaseOrderDetailView,PurchaseOrderTrackingView}.tsx` + `use-po-queue-controls.ts`/`use-po-tracking-controls.ts`; `frontend/src/components/pages/purchase-orders/{PurchaseOrdersQueueCards,PurchaseOrderTrackingCards,EditPOModal,ClosePoAlert,ConfirmPoDialog,DelayPoDialog,LogPoCommunicationDialog,MarkPoInvoicedDialog}.tsx` |

## Data model
- `purchase_orders`: `poNumber` (unique, `PO-<periodKey>-<seq>`), `supplierId` FK `supplierMaster`, `status` (`poStatusEnum`), `subtotalPaise`/`taxAmountPaise`/`totalAmountPaise` (computed from lines), `paymentTermsDays`, `deliveryTerms`, `expectedDeliveryDate` (**never overwritten** — original promise kept for audit), `revisedDeliveryDate`/`delayReason` (supplier's updated promise, written by the delay action), `approvedBy`/`currentApprovalLevel`/`totalApprovalLevels`, `supplierConfirmed`/`confirmationMethod`/`confirmedAt`/`confirmedBy`/`confirmationNote` (informational only, never blocks a transition), `closedAt`/`closedBy`/`closeNote` (terminal audit trail).
- `purchase_order_items`: `poId`, `itemId` FK `itemMaster`, `qty` (= PR item's remaining `requestedQty - issuedQty` at draft time, always the **full** remaining PR-item quantity — no partial-line splitting on create), `receivedQty` (updated by GRN module), `unitPricePaise`, `uom`.
- `pr_po_item_links`: `prItemId`/`poItemId`/`linkedQty` — written on PO create/update, deleted on line delete/PO cancel; the join PR detail uses to show `linkedPos`.
- `po_communications`: `poId`, `type` (`po_sent`/`reminder`/`escalation`), `channel` (`email`/`whatsapp`/`phone`/`in_person`), `status` (`logged`/`success`/`failed`, defaults `logged`), `toEmail`, `note`, `errorMessage`, `sentBy`, `sentAt`. Manual-log-only today — no SMTP wiring; shaped so real send can be added later without a schema change. The latest `type=po_sent` row is what flips a PO to `dispatched`; `reminder`/`escalation` rows are just log entries feeding the overdue queue.
- `po_status` enum: `draft → pending_approval → approved → dispatched → partial_received → fully_received → invoiced → closed`, or `cancelled` from any non-terminal state. `dispatched` can also jump straight to `fully_received` (a single GRN pass can fully receive every line without passing through `partial_received`).
- `supplier_invoices`: created (not owned) by `markInvoiced` — `matchStatus`/`paymentStatus` left at table defaults (`pending`/`unpaid`); no 3-way-match logic implemented yet.

## API
| Method | Path | Roles | Purpose |
|---|---|---|---|
| GET | `/po/getpos` | super-admin, owner, back_office | Paginated PO list; `overdue=true` filters to dispatched/partial_received POs past `expectedDeliveryDate` with remaining qty. |
| GET | `/po/getpodetails/:id` | same | PO + items joined back to source PR lines for traceability. |
| POST | `/po/createpo` | same | Draft a PO from pending PR items (full remaining PR-item qty always used). |
| PATCH | `/po/updatepo` | same | Update a **draft-only** PO's header and/or insert/reprice/delete lines. |
| DELETE | `/po/deletepo/:id` | same | Cancel; reverts linked PR items to `pending`. Rejected if any GRN recorded. `reason` required unless still `draft`. |
| POST | `/po/:id/send` | same | `approved → dispatched`; logs a `po_sent` communication row. |
| POST | `/po/:id/reminder` | same | Log-only reminder for an overdue PO; no status change. |
| POST | `/po/:id/escalate` | same | Log-only escalation for an overdue PO; no status change. |
| PATCH | `/po/:id/delay` | same | Record `revisedDeliveryDate`/`delayReason`; `expectedDeliveryDate` untouched. |
| POST | `/po/:id/confirm` | same | Record supplier confirmation; informational only. |
| POST | `/po/:id/invoice` | same | Record a supplier invoice against a `fully_received` PO; moves to `invoiced`. |
| POST | `/po/:id/close` | same | Terminal close, legal from `fully_received` or `invoiced`. |

Full shapes: `cd backend && bun run contract:query "<METHOD /path>"`.

## Key flows
- `create`: `poController.create` → `poService.create` checks the supplier is active, pre-checks (`assertLinesAreDraftable`) that each `prItemId` is `pending` and its parent PR is `approved`/`partial_ordered`, then `poRepository.createWithItems` — inside one transaction — re-locks the PR items `FOR UPDATE`, re-asserts `pending` status (race guard against a concurrent PO draft on the same line), allocates `poNumber` via `allocateDocumentSequence(tx, "po", createdBy)`, computes each line's `qty` as the PR item's full remaining quantity, inserts PO + items + `pr_po_item_links`, bumps the source PR items to `issuedQty += qty`/`status = "po_draft"`, and calls `prRepository.recomputeHeaderStatusFromItems` per affected PR.
- `update`: `poService.update` only allows mutation while `status === "draft"`; `poRepository.updateWithItems` mirrors `createWithItems`'s locking/linking pattern for inserted lines and re-runs `prRepository.recomputeHeaderStatusFromItems`.
- `cancel` (`remove`): `poService.cancel` refuses if `poRepository.hasGrnForPo` is true; requires a non-empty `reason` unless the PO is still `draft` (a draft cancel is a discard); calls `approvalRepository.cancelOpenRequestForDocument("po", poId, reason)` then sets `cancelled`. Repository-side, cancel reverts linked PR items back to `pending` (undoing the `create`/`update` side effects).
- `markSent`: `approved → dispatched`, inserts a `po_sent` communication row, then sets status — the "sent to supplier" action reuses the existing `dispatched` status rather than adding a new enum value.
- `logReminder`/`escalate`: pure `po_communications` inserts (`type: "reminder"`/`"escalation"`), no status change — feed the frontend's overdue tracking queue.
- `updateDelay`: patches `revisedDeliveryDate`/`delayReason` only; `expectedDeliveryDate` is a permanent audit field, never reassigned.
- `confirmSupplier`: sets `supplierConfirmed`/`confirmationMethod`/`confirmationNote`/`confirmedAt`/`confirmedBy` — purely informational, never gated by or gating a status transition.
- `markInvoiced`: asserts `fully_received → invoiced` is legal, inserts a `supplierInvoices` row (defaults only, no matching), sets status to `invoiced`.
- `close`: asserts `closed` is legal from current status (`fully_received` or `invoiced`), stamps `closedAt`/`closedBy`/`closeNote`, sets status.
- `recomputeReceiptStatus(poId, tx?)`: called by the **GRN module** (not duplicated there) after a GRN line posts accept/bypass; reads `findPoItemQuantitiesByPoId`, derives `fully_received` (all lines' `receivedQty >= qty`) or `partial_received` (any `> 0`), and transitions via the same `PO_STATUS_TRANSITIONS` table. Accepts an optional `tx` so the GRN caller can run it inside its own transaction.
- Approval hand-off: identical pattern to PR — PO's own `update` endpoint does not accept approval-owned statuses directly; a separate approval-module call (`docType: "po"`) drives `draft → pending_approval → approved`/`rejected`, mirroring status + `approvedBy` back onto `purchaseOrders`.

## Invariants & gotchas
- A PO line's `qty` is always the **entire** remaining PR-item quantity at draft time — there's no partial-quantity PO line creation from a single PR item in one call; splitting requires a second PO against the same PR item once made pending again.
- `update` is draft-only — any PO past `draft` must go through the dedicated action endpoints, not `PATCH /po/updatepo`.
- `expectedDeliveryDate` vs `revisedDeliveryDate`: the former is immutable once set at create/update time; only the delay action writes the latter. Don't conflate them when computing "is this PO late" — overdue logic in `list` (`overdue=true`) likely compares against `expectedDeliveryDate`, not the revised one (verify in `poRepository.list` if building overdue-adjacent features).
- `supplierConfirmed`/`confirmationMethod` never block or drive a status transition — treat as pure audit/UI signal.
- Cancel is blocked entirely once any GRN exists for the PO (`hasGrnForPo`), regardless of status — even a `dispatched` PO with a single stray GRN can't be cancelled.
- `dispatched → fully_received` is a legal direct jump (skipping `partial_received`) — this is intentional (`grnService.recomputeReceiptStatus` needs the edge), don't "fix" it into a strict linear chain.
- Frontend detail route folder is `purchase-orders/[prId]/page.tsx` with a `prId` param name — this is a **PO** id despite the name; a literal grep for `prId` in the PO frontend tree will surface this false positive.

## Tests
| File | Covers |
|---|---|
| _none found under `backend/` for PO flow_ | No dedicated PO route/service/repository test files located. |

## Known gaps / debt
- `frontend/src/app/(protected)/purchase-orders/[prId]/page.tsx` names its dynamic route segment and local variable `prId` for what is actually a PO id — cosmetic/naming debt, not a functional bug (the value is correctly passed as `prId` prop into `PurchaseOrderDetailView`), but confusing when grepping across PR/PO frontend code.
- 3-way match (PO ↔ GRN ↔ supplier invoice) is schema-present (`supplierInvoices.matchStatus`/`paymentStatus`) but not implemented — `markInvoiced` only inserts the invoice row and flips PO status; no matching/exception logic exists yet.
- `po_communications` is manual-log-only — `send`/`reminder`/`escalate` never actually contact the supplier (no SMTP/WhatsApp integration); `channel`/`status` fields are shaped for a future real-send path but are always effectively `logged` today.
- No automated tests found for PO create/update/cancel/communication actions — treat `poService`/`poRepository` changes as untested territory, same caveat as the PR module.
- Cross-check `backend/docs/backend-audit-remediation-2026-07-21.md` for PO-adjacent items before assuming the PR-scoped findings there (N+1 patterns, typed-error normalization) don't also apply to `poService`/`poRepository`, which share several structural patterns with the PR code the audit reviewed.

## History
| Date | PR / commit | Change |
|---|---|---|
| 2026-09-27 | 0a406f4 (last verified) | Module map authored from as-built code; no code change made. |
