# Report 53 — frontend-dev — purchase order screens

Status: DONE. Commit c5518a5 `feat(m1): purchase order screens` (15 files, frontend only). `tsc --noEmit` and `bun run lint` clean.

## Screens touched
| URL | Who | Changes |
|---|---|---|
| `/purchase-orders/[prId]` (PR lines + POs from this PR) | `po.manage` (line cancel: PR requester) | Create PO dialog: inactive suppliers hidden; payment terms prefilled from supplier default (0-365, editable); per-line GST % select (0..40, prefilled from active price-list row, else 0); rate prefill unchanged; total shows incl. GST; delivery date label says "needed before sending". PR lines table: "Cancel line" on `pending` lines when PR is approved/partial_ordered and user is the requester -> reason dialog (3-500). Draft PO: "Discard" replaced by "Cancel" with required reason (3-500). Per PO: "Short-close" (partial_received, reason), "Details, GST and log" (lines with GST %, subtotal/GST/total, communications log). |
| `/purchase-orders/tracking` | `po.manage` | Same PO actions per card: Cancel now also on draft (reason), only draft/pending/approved/dispatched (was also partial_received); Short-close on partial_received; details/GST/log panel; overdue badge uses due date (revised else expected). Overdue-only toggle already existed. |
| Edit PO dialog (both screens) | `po.manage`, draft only | GST % select per line (existing and added), totals incl. GST; PO_NOT_EDITABLE / DOC_LOCKED_IN_APPROVAL shown as plain toast message. |
| Send / Mark as sent dialog | `po.manage`, approved | Blocked with a message when the PO has no expected delivery date. |
| Approval history panel (all docs) | any | Trail action `cancelled` now reads "Cancelled" with its note; request status `cancelled` also "Cancelled". |

## Map updates
- Routes: `API_ROUTES.purchaseOrders.shortClose`, `.communications`; `purchaseRequisitions.cancelLine(prId, lineId)`.
- Fetchers/queries: `shortClosePurchaseOrder`/`useShortClosePoMutation`, `getPurchaseOrderCommunications`/`usePoCommunicationsQuery`, `cancelPurchaseRequisitionLine`/`useCancelPurchaseRequisitionLineMutation`. New key `purchaseOrderKeys.communications(poId)`; PO mutations now also invalidate it and `["approval"]`.
- New components: `pages/purchase-orders/PoDetailPanel`, `ShortClosePoAlert`; `pages/purchase-requisitions/CancelPrLineDialog`.
- Types: `GST_PERCENT_VALUES`, `PO_REASON_MIN/MAX`, new optional PO fields (cancel*, shortClosed, invoiced*, dueDate), item `gstPercent/lineValuePaise/lineTaxPaise`.
- `lib/po-status-badge`: `canCancelPurchaseOrder` now draft/pending/approved/dispatched only; new `canShortClosePurchaseOrder`.
- Traps: PO detail page is really keyed by prId (route `[prId]`); the tracking cards have their own duplicate CancelPOAlert. Worktree shell guard rejects long heredoc commands; use Edit/Write.

## Notes for coordinator
- `POST /api/pr/:id/lines/:lineId/cancel` is not in `api-manifest.json` yet (backend in parallel); the `API_ROUTES` contract test will fail until the backend route lands. Body `{ reason }` per contract.md.
- `GET /api/po/:id/communications` response row shape assumed to equal the existing `PoCommunication` type (`type, channel, note, sentAt`); manifest only says `array<object>`.
- Supplier active price list: used `taxPercentage` and `isActive` from `GET supplier/:id/listItems` rows; "last PO rate" prefill still comes from the existing item last-rate call.
- Line-cancel button is shown to the PR requester only; the spec also allows super-admin, but the UI has no reliable super-admin flag (role is display-only per store comment). Backend enforces either way.
- Expected delivery date is optional at PO create/edit (BR-PO-18 gates send, not save); the send dialog blocks when missing.
- Unrelated modified backend files in the worktree belong to the parallel backend work; not committed by me.

## Questions
none
