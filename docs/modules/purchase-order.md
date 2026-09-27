---
module: purchase-order
spec: none yet
last_verified_commit: 0a406f4
last_verified_on: 2026-09-27
depends_on: [purchase-requisition, approval, suppliers, grn]
---

# Purchase Order (PO) — as-built map

> What the code **is** (the spec says what it **should be**). Agents read this before touching the module
> and only explore code changed since `last_verified_commit`
> (`git diff 0a406f4..HEAD --stat -- backend/src/routes/po.ts backend/src/controller/poController.ts backend/src/service/poService.ts backend/src/repository/poRepository.ts backend/src/types/po.types.ts frontend/src/app/\(protected\)/purchase-orders frontend/src/components/views/purchase-orders frontend/src/components/pages/purchase-orders frontend/src/lib/api/purchase-orders`).
> Use symbol names, not line numbers — lines rot.

## Summary
A PO is always drafted **from** one or more pending PR line items (never from scratch) — creating a PO
locks the source PR items, snapshots their remaining quantity, and links them via `pr_po_item_links`.
The status machine covers the full lifecycle from `draft` through supplier dispatch, receiving, invoicing,
and terminal `closed`/`cancelled`, but only `draft → pending_approval → approved → dispatched → cancelled`
is exercised by anything built today — `partial_received/fully_received/invoiced/closed` are "pre-wired"
for the GRN/invoicing phase (GRN module calls back into `poService.recomputeReceiptStatus`). Supplier
communication (send/reminder/escalate) is a manual, log-only trail (`po_communications`) — no real
email/SMTP integration exists yet. Maturity: full for create/edit/cancel/list/detail/send/communications/
delay/confirm; invoice/close are implemented but only reachable once GRN fully receives a PO, which is a
separate, less-verified module.

## Code locations
| Layer | Path | Key symbols |
|---|---|---|
| schema | `backend/src/db/schemas/02_procurement-purchasing.ts` | `purchaseOrders`, `purchaseOrderItems`, `poStatusEnum`, `poCommunications`, `poCommunicationTypeEnum`/`ChannelEnum`/`StatusEnum`, `prPoItemLinks`, `supplierInvoices` |
| types | `backend/src/types/po.types.ts` | `createPoSchema`, `updatePoSchema`, `cancelPoSchema`, `markPoSentSchema`, `logPoCommunicationSchema`, `updatePoDelaySchema`, `confirmPoSchema`, `markPoInvoicedSchema`, `closePoSchema`, `poListQuerySchema`, `poSchema`, `poDetailsSchema`, `poCommunicationSchema` |
| repository | `backend/src/repository/poRepository.ts` | `poRepository.{list,findPoById,createWithItems,updateWithItems,getDetails,hasGrnForPo,setStatusCancelled,setStatus,setStatusDispatched,insertCommunication,insertSupplierInvoice,listCommunications,findPoItemQuantitiesByPoId,incrementPoItemReceivedQty}` |
| service | `backend/src/service/poService.ts` | `poService.{list,getDetails,create,update,cancel,markSent,logReminder,escalate,updateDelay,confirmSupplier,markInvoiced,close,recomputeReceiptStatus}`, `PO_STATUS_TRANSITIONS` |
| controller | `backend/src/controller/poController.ts` | `poController.{list,details,create,update,remove,markSent,reminder,escalate,updateDelay,confirmSupplier,markInvoiced,close}` |
| routes | `backend/src/routes/po.ts` + `END_POINTS.po` in `end-points.ts` | mounted at `/api/po` |
| frontend api | `frontend/src/lib/api/purchase-orders/{fetchers,queries}.ts` | `getPurchaseOrders`, `getPurchaseOrderById`, `createPurchaseOrder`, `updatePurchaseOrder`, `cancelPurchaseOrder`, `sendPurchaseOrder`, `sendPurchaseOrderReminder`, `escalatePurchaseOrder`, `updatePurchaseOrderDelay`, `confirmPurchaseOrder`, `markPurchaseOrderInvoiced`, `closePurchaseOrder` |
| frontend ui | `frontend/src/app/(protected)/purchase-orders/{page.tsx,[prId]/page.tsx,tracking/page.tsx}`, `components/views/purchase-orders/{PurchaseOrdersView,PurchaseOrderTrackingView,PurchaseOrderDetailView}.tsx`, `components/pages/purchase-orders/{PurchaseOrdersQueueCards,PurchaseOrderTrackingCards,EditPOModal,ClosePoAlert,ConfirmPoDialog,DelayPoDialog,LogPoCommunicationDialog,MarkPoInvoicedDialog}.tsx` | see "Key flows" for what each page actually shows |

## Data model
- `purchase_orders`: `poNumber` (unique, `PO-{periodKey}-{seq}`), `supplierId` (FK, must be `isActive`), `status` (`poStatusEnum`), `subtotalPaise`/`taxAmountPaise`(**hardcoded 0** — no per-line tax field yet)/`totalAmountPaise`, `paymentTermsDays`, `deliveryTerms`, `expectedDeliveryDate` (never overwritten once set — audit trail of the original promise), `revisedDeliveryDate`/`delayReason` (supplier's revised promise, from the delay endpoint), `supplierConfirmed`/`confirmationMethod`/`confirmedAt`/`confirmedBy`/`confirmationNote` (informational only, never gates a status transition), `closedAt`/`closedBy`/`closeNote` (terminal audit trail), `approvedBy`/`currentApprovalLevel`/`totalApprovalLevels` (mirrored from the approval module).
- `poStatusEnum` values: `draft, pending_approval, approved, dispatched, partial_received, fully_received, invoiced, closed, cancelled`. **No `rejected` value** — a PO approval rejection maps to `cancelled` (see approval hand-off below), unlike PR which has a real `rejected` state.
- `purchase_order_items`: `poId`, `itemId`, `qty` (**never user-editable** — always the full remaining PR-item quantity snapshotted at draft/insert time), `receivedQty` (updated only by the GRN module via `incrementPoItemReceivedQty`), `unitPricePaise` (the only repriceable field), `uom`.
- `pr_po_item_links`: same table as the PR module — `poItemId` side is written/deleted exclusively by this module (`createWithItems`, `updateWithItems`, `setStatusCancelled`).
- `po_communications`: manual log of `po_sent`/`reminder`/`escalation` events, each with `channel` (email/whatsapp/phone/in_person), `status` (logged/success/failed — always `"logged"` in practice today, no real send happens), `toEmail`, `note`, `sentBy`, `sentAt`. Comment in schema: "shaped so real auto-email can be added later without a schema change."
- `supplier_invoices`: created by `markInvoiced` with `matchStatus`/`paymentStatus` left at table defaults (`pending`/`unpaid`) — full 3-way-match/payment workflow is future AP work, not implemented here.

## API
| Method | Path | Roles | Purpose |
|---|---|---|---|
| GET | `/api/po/getpos` | super-admin, owner, back_office | Paginated list. `overdue=true` filters dispatched/partial_received POs past `expectedDeliveryDate` with remaining unreceived qty on any line. |
| GET | `/api/po/getpodetails/:id` | same | PO + items joined back to source PR lines |
| POST | `/api/po/createpo` | same | Draft a PO from pending PR items (full remaining PR-item qty always used) |
| PATCH | `/api/po/updatepo` | same | Update a **draft-only** PO's header/lines |
| DELETE | `/api/po/deletepo/:id` | same | Cancel — reverts linked PR items to pending; rejected if any GRN exists; `reason` required unless still draft |
| POST | `/api/po/:id/send` | same | `approved → dispatched`, logs a `po_sent` communication |
| POST | `/api/po/:id/reminder` | same | Log-only overdue-queue reminder, no status change |
| POST | `/api/po/:id/escalate` | same | Log-only overdue-queue escalation, no status change |
| PATCH | `/api/po/:id/delay` | same | Record supplier-revised delivery date + reason; `expectedDeliveryDate` untouched |
| POST | `/api/po/:id/confirm` | same | Record supplier confirmation of receipt/acceptance — informational only |
| POST | `/api/po/:id/invoice` | same | Record a supplier invoice against a `fully_received` PO, moves to `invoiced` |
| POST | `/api/po/:id/close` | same | Terminal close, legal from `fully_received` or `invoiced` |

Full shapes: `cd backend && bun run contract:query "<METHOD /path>"`.

## Key flows
- **`create`**: `poController.create` parses `createPoSchema` (`supplierId`, `lines: [{prItemId, unitPricePaise}] min 1`, optional terms/notes/expectedDeliveryDate) → `poService.create` checks supplier `isActive`, then `assertLinesAreDraftable` (friendly pre-check: each `prItemId` exists, its `status === "pending"`, its parent PR `status` is `approved` or `partial_ordered`) → `poRepository.createWithItems` opens one transaction: locks the target PR items `FOR UPDATE` (re-asserts `status === "pending"`, throwing `ConflictError` code `PO_LINE_ALREADY_DRAFTED` on a race), mints `poNumber` via `allocateDocumentSequence(tx, "po", createdBy)`, computes `qty = requestedQty - issuedQty` per line, computes totals (`computeTotalsPaise` — tax hardcoded 0), inserts the PO + items + `pr_po_item_links`, bumps each PR item's `issuedQty`/`status: "po_draft"`, and calls `prRepository.recomputeHeaderStatusFromItems` for every affected PR.
- **`update`**: only legal while `status === "draft"`. Same FOR-UPDATE + pending-status re-assert for new `inserts`; `updates` may only reprice (`unitPricePaise`), never change qty; `deletes` first revert the linked PR item to pending (`revertPrItemToPending`) and delete the `pr_po_item_links` row before deleting the PO item. Always ends with `recalculateTotalsByPoId` and a PR header status recompute for every touched PR.
- **`cancel`**: blocked if `hasGrnForPo` returns true (`ConflictError`); requires a `reason` unless the PO is still `draft` (a draft cancel is a discard, not a real cancellation); `setStatusCancelled` runs in its own transaction that walks every PO item's link and reverts the corresponding PR item to `pending`, recomputing each affected PR's header status — same reversal machinery as a line-level delete, just for the whole PO.
- **`markSent`** (send to supplier): `approved → dispatched` — reuses the existing `dispatched` enum value for "sent," there is no separate "sent" status. Logs a `po_sent` communication row (channel/toEmail/note).
- **`logReminder` / `escalate`**: pure logging (`reminder`/`escalation` communication rows) for the overdue queue — no status change, no PO row mutation at all.
- **`updateDelay`**: patches only `revisedDeliveryDate`/`delayReason`; `expectedDeliveryDate` is preserved forever as the original promise for audit purposes.
- **`confirmSupplier`**: sets `supplierConfirmed: true` + confirmation fields; **does not call `assertValidStatusTransition`** — can be recorded at any PO status.
- **`markInvoiced`**: requires legal transition to `invoiced` (only from `fully_received`), inserts a `supplierInvoices` row, then flips status.
- **`close`**: requires legal transition to `closed` (from `fully_received` or `invoiced` — both intentional per in-code comment), records `closedAt/closedBy/closeNote`.
- **`recomputeReceiptStatus(poId, tx?)`**: called by `grnService` (not this module) after a GRN line posts. Compares `receivedQty` vs `qty` across all PO lines: all received → `fully_received`; any received → `partial_received`; else no-op. Accepts an optional `tx` so the GRN caller can run it inside its own transaction (in-code comment flags a "known non-atomicity note" on the GRN side — worth checking when documenting GRN).
- **Approval hand-off**: identical mechanism to PR — frontend calls `POST /approval/submitRequest` with `{docType: "po", docId}`; `approvalService.submitRequest` mirrors the result onto `purchase_orders` via `updatePoApprovalMirror` (`pending_approval` or auto-approved `approved`). On `actOnRequest`, the PO-specific status mapping in `approvalService` is: `approved → "approved"`, `rejected → "cancelled"` (no `rejected` PO status exists), `require_more_info → "draft"`, `cancelled → "cancelled"`, anything else → `"pending_approval"`.
- **PR queue vs. PO tracking (frontend split)**: `/purchase-orders` (`PurchaseOrdersView`) is **not** a PO list — it queries `usePurchaseRequisitionsQuery({status: ["approved", "partial_ordered"]})`, i.e. it's the queue of *approved PR lines waiting for a PO draft* (`PurchaseOrdersQueueCards`). The actual PO list/search/filter/overdue view lives at `/purchase-orders/tracking` (`PurchaseOrderTrackingView` → `usePurchaseOrdersQuery`, `PurchaseOrderTrackingCards`). `/purchase-orders/[prId]` is a **per-PR** page, and `prId` really is a PR id: the queue card navigates with `pr.id` and `PurchaseOrderDetailView({ prId })` loads `usePurchaseRequisitionDetailQuery(prId)`, then lists the POs drafted from that PR (verified 2026-09-27, BL-020 closed as no-change). There is no standalone PO-by-id page; `PurchaseOrderDetailView` hosts the create-PO-from-PR-lines UI (line selection, supplier grouping, `SearchableSelect`, `EditPOModal`) plus every action dialog (`ClosePoAlert`, `ConfirmPoDialog`, `DelayPoDialog`, `LogPoCommunicationDialog`, `MarkPoInvoicedDialog`) and a `CreateGrnModal` entry point.

## Invariants & gotchas
- `qty` on a PO item is **never** directly editable by the client at any layer — only `unitPricePaise` is repriceable via `updatepo`. Line quantity always equals `requestedQty - issuedQty` from the PR item at the moment the line was drafted/inserted.
- `taxAmountPaise` is hardcoded to `0` in `computeTotalsPaise` — flagged in-code as a "KNOWN OPEN ITEM" (no per-line tax-rate column exists on `purchaseOrderItems` yet).
- Double-draft race protection is two-layered: `poService.assertLinesAreDraftable` is a best-effort, friendly 400 pre-check before opening a transaction; the actual guarantee is `poRepository.findPurchaseRequestItemsByIdsForUpdate`'s `FOR UPDATE` row lock + re-check inside the transaction (throws `ConflictError` / `PO_LINE_ALREADY_DRAFTED` on conflict, not a plain 400).
- PR ↔ PO status is bidirectionally coupled: every create/update/cancel on a PO writes back to the source PR item(s) and recomputes the PR header status in the same transaction. Editing this module without checking `prRepository.recomputeHeaderStatusFromItems` risks leaving PR headers stale.
- `markSent` reuses the `dispatched` status for "sent to supplier" — there's no distinct "sent but not yet in transit" state.
- `confirmSupplier` and `updateDelay` bypass `assertValidStatusTransition` entirely — they're audit/informational fields layered independently of the status machine and can be set regardless of current PO status.
- Only `draft → pending_approval → approved → dispatched → cancelled` is exercised by any UI flow today per the in-code comment on `PO_STATUS_TRANSITIONS`; `partial_received/fully_received/invoiced/closed` exist for the GRN/invoicing phase and are comparatively less battle-tested.
- `PurchaseOrderDetailView`'s route param `prId` is a PR id (the page is "POs for this PR"), despite living under `/purchase-orders/` and being named `…DetailView`. Don't rename it to `poId`.
- `po_communications.status` column exists (`logged/success/failed`) but nothing in `poService` ever sets anything other than the column default `"logged"` — there is no real send integration, `status`/`errorMessage` are dead columns until SMTP/WhatsApp wiring is added.

## Tests
| File | Covers |
|---|---|
| *(none found)* | No `*.test.ts` / `__tests__` files exist for any layer of this module as of this writing. |

## Known gaps / debt
- No automated tests (repository/service/controller/route) for any part of the PO lifecycle.
- Tax is hardcoded to 0 on every PO — `purchaseOrderItems` needs a per-line tax-rate column before real GST-compliant totals are possible (matches the pattern already used on `subcontractingOrderItems.serviceTaxPercentage`, which could be a template).
- `po_communications` is entirely manual/log-only — no actual email/WhatsApp send occurs; `channel="email"` with `toEmail` recorded doesn't send anything.
- `supplierInvoices` created by `markInvoiced` never advances past `matchStatus: "pending"` / `paymentStatus: "unpaid"` — the 3-way-match and payment-tracking workflow referenced in schema comments (`supplierPayments` table exists) isn't wired to this module yet.
- GRN → PO coupling (`recomputeReceiptStatus`, `incrementPoItemReceivedQty`) is called from `grnService`, which lives outside this map's read scope — the in-code "known non-atomicity note" on the GRN side should be checked when the GRN module map is written, since it directly affects PO status correctness.
- No PO "reject" status — an approval rejection is indistinguishable from a manual cancellation in `purchase_orders.status` (both land on `cancelled`); if the UI needs to show "rejected by approver" vs. "cancelled by user" it currently can't from PO status alone (would need the approval trail).

## History
| Date | PR / commit | Change |
|---|---|---|
| 2026-09-27 | 0a406f4 | Map last verified against this commit |
