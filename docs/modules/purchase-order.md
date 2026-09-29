---
module: purchase-order
spec: docs/specs/purchase-order.md (frozen)
last_verified_commit: eea4fb1
last_verified_on: 2026-09-29
depends_on: [purchase-requisition, approval, suppliers, grn, auth-setup]
---

# Purchase Order (PO) — as-built map

> What the code **is** (the spec says what it **should be**). Agents read this before touching the module
> and only explore code changed since `last_verified_commit`
> (`git diff eea4fb1..HEAD --stat -- backend/src/routes/po.ts backend/src/controller/poController.ts backend/src/service/poService.ts backend/src/repository/poRepository.ts backend/src/types/po.types.ts backend/src/db/schemas/02_procurement-purchasing.ts frontend/src/app/\(protected\)/purchase-orders frontend/src/components/views/purchase-orders frontend/src/components/pages/purchase-orders frontend/src/lib/api/purchase-orders`).
> Use symbol names, not line numbers — lines rot.

## Summary
A PO is always drafted **from** approved PR lines (never from scratch). Creating one locks the PR lines, takes
their remaining quantity and links them (`pr_po_item_links`). Built (BR-PO-01..23): create / edit (draft) /
cancel with reason, send, reminder, escalate, supplier confirmation, delay, invoice, close, short-close, PO
log, overdue filter, GST per line. Receipt status comes from GRN postings. Sending is log-only (no e-mail).
Maturity: full for M1 scope. Users: anyone with `po.manage`.

## Code locations
| Layer | Path | Key symbols |
|---|---|---|
| schema | `backend/src/db/schemas/02_procurement-purchasing.ts` | `purchaseOrders`, `purchaseOrderItems`, `poStatusEnum`, `poCommunications`, `poCommunicationTypeEnum`/`ChannelEnum`/`StatusEnum`, `prPoItemLinks`, `supplierInvoices` |
| types | `backend/src/types/po.types.ts` | `createPoSchema`, `updatePoSchema`, `cancelPoSchema`, `markPoSentSchema`, `logPoCommunicationSchema`, `updatePoDelaySchema`, `confirmPoSchema`, `markPoInvoicedSchema`, `closePoSchema`, `shortClosePoSchema`, `poListQuerySchema`, `poDetailsSchema`, `poCommunicationDetailSchema` |
| repository | `backend/src/repository/poRepository.ts` | `poRepository.{list,findPoById,lockPoById,findSupplierById,findPurchaseRequestItemsByIdsForUpdate,findPurchaseRequestItemsByIds,findActivePriceRows,createWithItems,updateWithItems,getDetails,hasGrnForPo,listLinkedPrLines,orderPrLinesOfPo,cancelPrLinesOfPo,closePrLinesOfPo,cancelLockedPo,setStatus,updatePoById,insertCommunication,listCommunications,findSupplierInvoice,insertSupplierInvoice,findPoItemQuantitiesByPoId,incrementPoItemReceivedQty}`, `computeLinePaise` |
| service | `backend/src/service/poService.ts` | `poService.{list,getDetails,create,update,cancel,markSent,logReminder,escalate,updateDelay,confirmSupplier,markInvoiced,close,shortClose,communications,recomputeReceiptStatus}`, `PO_STATUS_TRANSITIONS`, `withLockedPo`, `resolveLines` |
| controller | `backend/src/controller/poController.ts` | one handler per route |
| routes | `backend/src/routes/po.ts` + `END_POINTS.po` in `end-points.ts` | mounted at `/api/po`; all routes `requirePermission("po.manage")` |
| frontend api | `frontend/src/lib/api/purchase-orders/{fetchers,queries}.ts` | `getPurchaseOrders`, `getPurchaseOrderById`, `createPurchaseOrder`, `updatePurchaseOrder`, `cancelPurchaseOrder`, `sendPurchaseOrder`, `sendPurchaseOrderReminder`, `escalatePurchaseOrder`, `updatePurchaseOrderDelay`, `confirmPurchaseOrder`, `markPurchaseOrderInvoiced`, `closePurchaseOrder`, `shortClosePurchaseOrder`, `getPurchaseOrderCommunications`, `getItemLastRate`, `toPOCreatePayload` + hooks (`useMarkPoSentMutation`, `useShortClosePoMutation`, `usePoCommunicationsQuery`, `useItemLastRateQuery`, …) |
| frontend ui | `frontend/src/app/(protected)/purchase-orders/{page.tsx,[prId]/page.tsx,tracking/page.tsx}`, `components/views/purchase-orders/{PurchaseOrdersView,PurchaseOrderTrackingView,PurchaseOrderDetailView}.tsx`, `components/pages/purchase-orders/{PurchaseOrdersQueueCards,PurchaseOrderTrackingCards,PoDetailPanel,EditPOModal,ClosePoAlert,ShortClosePoAlert,ConfirmPoDialog,DelayPoDialog,LogPoCommunicationDialog,MarkPoInvoicedDialog}.tsx` | see "Frontend split" below |

## Data model
- `purchase_orders`: `poNumber` (`PO-{periodKey}-{seq}`), `supplierId`, `status`, `subtotalPaise`/`taxAmountPaise`/`totalAmountPaise` (sums of stored line values), `paymentTermsDays`, `deliveryTerms`, `notes`, `expectedDeliveryDate` (never overwritten), `revisedDeliveryDate`/`delayReason`, confirmation fields (`supplierConfirmed`, `confirmationMethod`, `confirmedAt`, `confirmedBy`, `confirmationNote`; never gate a status), cancel audit (`cancelledBy/At`, `cancelReason`), `shortClosed`, `closedAt/By`, `closeNote`, `invoicedBy/At`, approval mirror (`approvedBy`, `currentApprovalLevel`, `totalApprovalLevels`).
- `poStatusEnum`: `draft, pending_approval, approved, dispatched, partial_received, fully_received, invoiced, closed, cancelled`. No `rejected`: an approval reject cancels the PO.
- `purchase_order_items`: `poId`, `itemId`, `qty` (the PR line's remaining quantity at draft time; never editable), `receivedQty` (GRN only), `unitPricePaise`, `gstPercent`, `lineValuePaise`, `lineTaxPaise`, `uom`.
- `pr_po_item_links`: PO side written and deleted only by this module.
- `po_communications`: log rows, `type` (po_sent / reminder / escalation / confirmation), `channel` (email, whatsapp, phone, in_person), `status` (always the default `logged`), `toEmail`, `note`, `sentBy`, `sentAt`.
- `supplier_invoices`: created by `markInvoiced`; unique per supplier and invoice number (`uq_supplier_invoice_number`); match / payment status stay at table defaults.

## API
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/po/getpos` | Paginated list. `overdue=true`: `dispatched`/`partial_received`, due date (revised, else expected) before today, some line not fully received. `dueDate` is returned on each row |
| GET | `/api/po/getpodetails/:id` | PO + lines joined to PR line / PR number |
| POST | `/api/po/createpo` | Draft a PO from pending PR lines of approved / partial-ordered PRs |
| PATCH | `/api/po/updatepo` | Draft-only edit of header, line rate / GST, add / remove lines |
| DELETE | `/api/po/deletepo/:id` | Cancel; body `{reason}` 3–500 always |
| POST | `/api/po/:id/send` | `approved → dispatched`; logs a `po_sent` row with channel |
| POST | `/api/po/:id/reminder`, `/escalate` | Log rows only (`dispatched`/`partial_received`) |
| PATCH | `/api/po/:id/delay` | Revised date + reason (both required) |
| POST | `/api/po/:id/confirm` | Supplier confirmation: method, note; also a log row |
| POST | `/api/po/:id/invoice` | Record supplier invoice on a `fully_received` PO → `invoiced` |
| POST | `/api/po/:id/close` | `fully_received` / `invoiced` → `closed` |
| POST | `/api/po/:id/short-close` | `partial_received` → `closed`, `{reason}` 3–500 |
| GET | `/api/po/:id/communications` | PO log, newest first |

Submit / decide go through `POST /approval/submitRequest` and `actOnRequest` (`docType: "po"`). Full shapes: `cd backend && bun run contract:query "<METHOD /path>"`.

## Key flows
- **create**: supplier must exist and be active (`SUPPLIER_INACTIVE`); expected date not before today (`PO_DATE_BEFORE_PO_DATE`); `assertLinesAreDraftable` (friendly 400: PR line `pending`, PR `approved`/`partial_ordered`) then `createWithItems` in one transaction: PR headers locked first, then the lines (CRP-2), status re-checked → 409 `PO_LINE_ALREADY_DRAFTED`; `qty = requestedQty - issuedQty`; `computeLinePaise` per line; PR line → `po_draft`, `issuedQty` set, link row, PR header recomputed. Payment terms default to the supplier's `defaultPaymentTermsDays` (BR-PO-23).
- **rate and GST defaults (`resolveLines`)**: omitted rate → `assetRepository.getLastRate` (last PO rate with this supplier, else the price list, else item average cost); still under 1 paise → `PO_RATE_REQUIRED`. Omitted GST % → active price-list row (`findActivePriceRows`), else 0. `computeLinePaise`: value = round(qty × rate), tax = round(value × GST% / 100); totals = sums.
- **update**: `PO_NOT_EDITABLE` unless `draft`, `DOC_LOCKED_IN_APPROVAL` while `pending_approval` (checked again under `lockPoById`); PR locks taken up front; removing a line reverts the PR line to `pending`; cannot leave zero lines; totals recomputed.
- **cancel** (`poService.cancel`): one transaction. Locks the open approval request first when `pending_approval`, then the PO row. Allowed from `draft`, `pending_approval`, `approved`, `dispatched` (else 409 `PO_INVALID_TRANSITION`); any GRN → 409 `PO_HAS_GRN`. `cancelLockedPo` stores who / when / reason and calls `cancelPrLinesOfPo` (PR lines `cancelled`, `issuedQty` given back, PR headers recomputed); the open approval request is cancelled in the same transaction.
- **`withLockedPo`** (send, reminder, escalate, delay, confirm, invoice, close, short-close): status check → 400 `PO_INVALID_STATUS`, then row lock and re-check → 409 `PO_STATUS_CHANGED`. Each writes its log / invoice row and the status in one transaction.
- **send**: needs `expectedDeliveryDate` (`PO_EXPECTED_DATE_REQUIRED`). **invoice**: same supplier + invoice number twice → 409 `SUPPLIER_INVOICE_DUPLICATE` (pre-check and unique-violation catch). **short-close**: `closePrLinesOfPo` sets ordered PR lines `closed`.
- **approval effects** (in `approvalService`): submit auto-approved or last-level approve → `orderPrLinesOfPo` (PR lines `ordered`); reject → `cancelLockedPo` (PO `cancelled`, PR lines cancelled); withdraw / send back → PO `draft`; middle-level approve stays `pending_approval`.
- **`recomputeReceiptStatus(poId, tx?)`** (called by `grnService` after postings and corrections): all lines received → `fully_received`; some → `partial_received`; none received while `partial_received` → back to `dispatched`. Moves between `dispatched`, `partial_received` and `fully_received` are allowed both ways until invoiced / closed (BR-PO-10); other moves go through `PO_STATUS_TRANSITIONS`.
- **Frontend split**: `/purchase-orders` (`PurchaseOrdersView`) is the queue of approved PR lines (`usePurchaseRequisitionsQuery`, status approved / partial_ordered); PO list, overdue view and actions are at `/purchase-orders/tracking`; `/purchase-orders/[prId]` is per PR (the param is a PR id) and holds create-PO-from-lines plus the action dialogs and the GRN entry. Buttons use `useCan("po.manage")` / `useCan("grn.edit_draft")`. `PurchaseOrderTrackingCards` label fix (FE-LABEL) is in.

## Invariants & gotchas
- `qty` on a PO line is never client-editable; only rate and GST %.
- Double-draft is stopped by the `FOR UPDATE` re-check inside `createWithItems` / `updateWithItems`, not by the service pre-check.
- PR line and PO state are coupled: every PO create / edit / cancel / approve / short-close changes PR lines and the PR header in the same transaction.
- A cancelled or rejected PO cancels its PR lines for good (they do not return to `pending`); only removing a line from a draft PO returns it to `pending`.
- `send` reuses `dispatched` for "sent"; there is no separate sent status.
- `dispatched` may jump straight to `fully_received` (single GRN pass).
- `po_communications.status` is always `logged`; nothing is sent.
- `PurchaseOrderDetailView` route param `prId` is a PR id. Do not rename it.
- Last-rate `source` values from `getLastRate`: `po_history`, `supplier_catalog`, `pr_estimate` (= item average), `standard_rate`.

## Tests
| File | Covers |
|---|---|
| `backend/src/routes/po-lifecycle.test.ts` | BR-PO-01..23, BR-PR-25, 28, 30, 31, 32, 33, 36, 46, 47, BR-SUP-16, BR-GRN-27 |
| `backend/src/service/poReceiptStatus.test.ts` | BR-PO-10, BR-GRN-27 (receipt status both ways) |
| `backend/src/routes/approval-requests.test.ts` | approval submit / act effects on PO docs |
| `backend/src/service/grnService.test.ts` | GRN side that calls `recomputeReceiptStatus` |

No frontend tests.

## Known gaps / debt
- Fixed by the code (verified at `eea4fb1`): BL-019 (PR lines get `ordered` / `closed` / `cancelled`), BL-028 (approval reject cancels the PO through `cancelLockedPo` and cancels PR lines), BL-029 (header recompute is status-guarded); tax is no longer hardcoded 0; cancel is one transaction with audit columns; short-close and communications endpoint exist; delay fields required; invoice duplicate check exists.
- BL-046 open: no active-item check when a PO line is drafted (`assertLinesAreDraftable` / `resolveLines`).
- BL-047 open: `pr_estimate` name still means item average; the detail view label map has no `standard_rate` entry and `LastRateSource` in `frontend/src/types/purchase-orders.ts` lacks it.
- BL-053 partly: the supplier picker fetches the first 20 suppliers and hides inactive ones client-side (`supplier.isActive`); it does not ask the server for active only.
- PO log has no `lastUpdatedBy/At` on `purchase_orders`.
- CRP-5 (repo layering): `poRepository` writes PR line rows and calls `prRepository`; PERF-03 / 05 / 09 minor batching and search items are in `.pipeline/m1/findings.md`, not fixed.
- Sending is log-only; `supplier_invoices` never leave `pending` / `unpaid` (AP work is later).
- Approval reject and manual cancel both end as `cancelled`; only the approval trail tells them apart.

## Benchmarks
Kept in `docs/specs/purchase-order.md` (ERPNext, Odoo, SAP B1 and what was adapted).

## History
| Date | PR / commit | Change |
|---|---|---|
| 2026-09-27 | 0a406f4 | Map first verified |
| 2026-09-29 | work/m1 0a406f4..eea4fb1 | M1 build: GST per line, supplier defaults, row locks with 409 races, cancel audit + PR line cancel, short-close, communications, invoice duplicate check, overdue by due date, receipt status both ways, approval effects on PR lines; frozen spec v2; po-lifecycle test |
