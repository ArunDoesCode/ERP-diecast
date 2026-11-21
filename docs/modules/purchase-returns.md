---
module: purchase-returns
spec: docs/specs/purchase-returns/spec.md (v1, frozen)
last_verified_commit: de68fdf
last_verified_on: 2026-11-21
depends_on: [grn, inventory, purchase-order, suppliers, supplier-invoice, auth-setup]
---

# Purchase returns (PRO, debit note, return challan) — as-built map

> What the code **is** (the spec says what it **should be**). Built on `feature/scm-purchase-returns` inside
> epic `epic/scm`. Explore only code changed since `last_verified_commit`. Symbol names, not line numbers.

## Summary
Send goods from a GRN back to the supplier. A return is made from one GRN (PO-backed only), each line from the
`rejected` or `accepted` qty of a QA-decided GRN line. Draft → post → (cancel). Post takes accepted qty out of
stock, writes GRN/PO returned counters, issues a debit note (`DN/yy-yy/n`) and a return challan
(`PRC/yy-yy/0001`), and links the note to the oldest approved supplier bill. Replacement returns also lower
PO received qty. Cancel of a posted return writes counter ledger rows and undoes everything. Full.

## Code locations
| Layer | Path | Key symbols |
|---|---|---|
| schema | `backend/src/db/schemas/02_procurement-purchasing.ts` | `purchaseReturns`, `purchaseReturnItems`, `purchaseDebitNotes`, `purchaseReturnEvents`; enums `purchase_return_status`, `purchase_return_source`, `debit_note_status`, `purchase_return_event_action`; `grnItems.rejectedReturnedQty` / `acceptedReturnedQty`, `purchaseOrderItems.returnedQty`, partial `idx_grn_items_awaiting_return` (`rejected_qty > 0`) |
| schema (others) | `02_procurement-catalog.ts` | `inventory_ref_type` + `pro_cancel` (`pro` was already there) |
| migration | `backend/src/db/migrations/20261121081805_sleepy_spiral/` | aborts if old `purchase_returns` rows exist |
| types | `backend/src/types/purchaseReturn.types.ts` | strict create/update/cancel bodies, list + awaiting queries, detail/prefill schemas |
| lib | `lib/purchase-return-math.ts` | `computeReturnLine`, `computeReturnTotals` (BigInt, `AMOUNT_TOO_LARGE`), `isInterstateSupply`, `istMonthKey`; `lib/document-number.ts` `allocateFinancialYearSequence` (counters `debit_note`, `return_challan`) |
| repository | `repository/purchaseReturnRepository.ts` | `lockHeader`, `lockGrnLines`, `lockPoLines`, `reservedByGrnLine` (drafts + posted), `correctionsMilliByGrnLine`, `postedCounters`, `addGrnLineReturned`, `addPoLineReturned`, `findPostedRows`, `insertDebitNote` / `cancelDebitNote`, `list`, `listAwaiting`, `statusCounts`, `countAwaiting`, `listReturnsOfGrn/Po` |
| service | `service/purchaseReturnService.ts` | `list`, `awaiting`, `prefill`, `getDetails`, `create`, `update`, `cancelDraft`, `post`, `cancel`, `returnedQtyByGrnItem` (used by supplier invoice); helpers `buildLines`, `capMilli`, `lockReturnUnderGrn`, `lockPostingRows`, `previewOf` |
| cross-module | `grnService.correction` (BR-PRT-42 floor), `grnRepository.getDetails`, `poRepository.getDetails` (`returns[]`, returned qty), `stockPostingRepository.postStock` (`INSUFFICIENT_STOCK`), `supplierInvoiceLinkService` (`findBillForReturnPost`, `reevaluatePoInvoiced`), `poService.recomputeReceiptStatus` | |
| controller / routes | `controller/purchaseReturnController.ts`, `routes/purchaseReturn.ts` (`/api/purchase-return`), `END_POINTS.purchaseReturn` | 9 routes; `/awaiting`, `/prefill/:grnId` registered before `/:id/...` |
| permissions | `lib/permissions.ts` | `purchase_return.view` (ow, bo, fs, qa), `.edit_draft` (ow, bo, fs), `.post`, `.cancel_posted` (ow, bo); screen `purchase-returns` `/purchase-returns` (order 175, Procurement) |
| frontend api | `lib/api/purchase-return/{fetchers,queries}.ts`, `types/purchase-return.ts`, `API_ROUTES.purchaseReturns` | `purchaseReturnKeys` (`["purchase-returns", "list"\|"awaiting"\|"detail"\|"prefill", …]`), `prtErrorMessage`; mutations invalidate returns + GRN + PO + stock |
| frontend ui | `app/(protected)/purchase-returns/` (+ `new?grnId=`, `[id]`, `[id]/edit`, `[id]/debit-note`, `[id]/challan`); `components/views/purchase-returns/` (PurchaseReturnListView, FormView, DetailView, PrintView, use-return-controls); `components/pages/purchase-returns/` (ReturnForm, ReturnLinesEditor, ReturnLinesCard, ReturnSidePanels, ReturnActionDialogs, ReturnPrintSheets, return-format) | status tones `purchaseReturn`, `debitNote`; GRN detail "Return to supplier" (from prefill `mainAction`) + returned qty per line; PO detail panel "Returned" column; `.print-sheet-light` in `globals.css` |

## Data model
- `purchase_returns`: `proNumber` `PRT-YYYY-MM-0001` (IST month), `grnId`, `poId`, `supplierId` (all from the GRN, never the body), `status` draft | posted | cancelled, `reason`, optional RMA/transporter/vehicle/remarks, `challanNumber` (unique, set at post), `replacementExpected`, posted/cancelled who/when, `cancelReason`, audit columns.
- `purchase_return_items`: `grnItemId`, `poItemId`, `itemId`, `source`, `returnQty`, `uom`, `batchNumber`, `unitPricePaise` + `gstPercent` (from the PO line), `hsnCode` + tax amounts (null until post), `locationId`, `unitCostPaise`, `ledgerId`, `cancelLedgerId`. Unique (pro, grn item, source).
- `purchase_debit_notes`: one per return (`proId` unique), `dnNumber`, totals + heads, `isInterstate`, plant + supplier snapshots, `supplierInvoiceId` + `billOffsetPaise` (link to a bill), status issued | cancelled.
- `purchase_return_events`: create / edit / post / cancel_draft / cancel_posted with from/to status, reason, actor.
- Ledger: accepted lines only. Post → `pro` (out, `out_at_cost`, `blockNegative`), cancel → `pro_cancel` (in, same location and cost). `referenceId` = return id, `referenceLineId` = return line id. Rejected lines never touch stock.

## API (`/api/purchase-return`)
| Method | Path | Key | Purpose |
|---|---|---|---|
| GET | `/getreturns` | view | list; `meta.statusCounts` + `awaitingCount` |
| GET | `/awaiting` | view | GRN lines with rejected qty not yet on a return; meta also carries the counts |
| GET | `/getreturndetails/:id` | view | header, lines with cap facts, `documentFlow`, `debitNote`, `events`, draft `preview`; prints read this |
| GET | `/prefill/:grnId` | edit_draft | suggested lines (rejected qty) + `mainAction` prefilled \| secondary \| none; writes nothing |
| POST / PATCH | `/createreturn`, `/updatereturn` | edit_draft | draft; `lines` on update replace all; GRN can't change |
| POST | `/:id/cancel-draft` | edit_draft | draft → cancelled |
| POST | `/:id/post` | post | draft → posted (stock, counters, DN, challan, bill link) |
| POST | `/:id/cancel` | cancel_posted | posted → cancelled, reason 3–500 |

Codes: `PRT_GRN_MISMATCH`, `PRT_QA_PENDING`, `PRT_DUPLICATE_LINE`, `PRT_CAP_EXCEEDED` (400 at save, 409 at post), `PRT_NOT_EDITABLE`, `PRT_NOT_POSTED`, `PRT_REPLACEMENT_PO_CLOSED`, `PRT_OVER_RECEIPT`, `PRT_HSN_MISSING`, `PRT_COMPANY_SETTINGS_MISSING`, `INSUFFICIENT_STOCK`, `AMOUNT_TOO_LARGE`. Full shapes: `bun run contract:query "<METHOD /path>"`.

## Key flows
- Caps (`capMilli`): rejected = GRN `rejectedQty`; accepted = `acceptedQty` − corrections. Reserved = qty on non-cancelled returns (drafts + posted); `buildLines` checks reserved + new ≤ cap, post re-checks with this draft included.
- `post`: GRN header lock → PO lock → return header lock → status draft → GRN lines, PO lines (ascending id) → cap re-check → replacement on `invoiced`/`closed` PO → 409 → company GSTIN/state + item HSN → amounts (IGST if supplier GSTIN state ≠ plant state) → `postStock` per accepted line (items ascending) at the GRN line's posted location/cost (fallback: default receiving location + PO rate, A-54) → line amounts, GRN/PO returned counters, replacement lowers PO `receivedQty` + `recomputeReceiptStatus` → `reevaluatePoInvoiced` → DN + challan numbers (last) → `findBillForReturnPost` → debit note → header posted → event.
- `cancel`: same lock order; replacement checks PO not invoiced/closed and received + add-back ≤ ordered × 1.05 (`PRT_OVER_RECEIPT`, no override) → `pro_cancel` rows → counters back, replacement adds received qty back → debit note cancelled → `reevaluatePoInvoiced` → event.
- Bill link (BR-PRT-44, 45): oldest approved bill with a line on any returned GRN line; offset = taxable + GST of accepted lines (rejected-only → offset 0). Approving a bill later can link unlinked notes (`supplierInvoiceLinkService.linkOnApproval`).

## Invariants & gotchas
- **Lock order: GRN header → PO → return header → GRN lines → PO lines → items.** Same in update, cancel-draft, post, cancel.
- Counters (`rejected/acceptedReturnedQty`, PO `returnedQty`) move only on post/cancel; caps use reserved (drafts too). BR-PRT-42 GRN correction floor also counts drafts (A-56).
- Optional text: blank or `""` → null; `""` on update clears (A-53).
- `postStock` refusals now carry code `INSUFFICIENT_STOCK` for every caller (A-55).
- Spec says `debit_notes`; the table is `purchase_debit_notes`.
- PRT assumption A-52 ("invoiced re-test not built") is out of date: supplier-invoice built it (`reevaluatePoInvoiced` on post and cancel).
- Print: shell hides sidebar/top bar under `@media print`; print sheets always light.
- PO step in the document flow has no link (PO page is keyed by PR id).

## Tests
| File | Covers |
|---|---|
| `backend/tests/routes/purchaseReturn.test.ts` | BR-PRT-01..10, 23, 36, 37, 39..41 |
| `backend/tests/routes/purchaseReturnPost.test.ts` | BR-PRT-07, 12..22, 24, 29..35, 41, 42, 46, 47 |
| `backend/tests/routes/purchaseReturnCancel.test.ts` | BR-PRT-10, 11, 25..28, 41, 46 |
| `backend/tests/routes/purchaseReturnFlow.test.ts` | BR-PRT-19, 20, 38 (GRN/PO details) |
| `backend/tests/routes/supplierInvoiceLinks.test.ts` | BR-PRT-43..45 (bill link, offset) |

## Known gaps / debt
- Inventory movements list: frontend `assetReferenceTypeValues` has no `pro_cancel`, and source-document number is joined only for GRN types (return rows show no number).
- Same sidebar print gap existed on the SCO challan print (fixed globally here).

## History
| Date | PR / commit | Change |
|---|---|---|
| 2026-11-21 | c0f73b0..1507220 | Map created: purchase returns built to spec v1 on `epic/scm` (BR-PRT-01..42, 46, 47; CR-01..03, PERF-01/02/04 fixed) |
| 2026-11-21 | feda369..de68fdf | Supplier invoice adds bill link + offset (BR-PRT-43..45) and the PO invoiced re-test on post/cancel |
