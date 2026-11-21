---
module: supplier-invoice
spec: docs/specs/supplier-invoice/spec.md (v1, frozen)
last_verified_commit: de68fdf
last_verified_on: 2026-11-21
depends_on: [purchase-order, grn, purchase-returns, suppliers, subcontracting, auth-setup]
---

# Supplier invoice and 3-way match — as-built map

> What the code **is** (the spec says what it **should be**). Built on `feature/scm-supplier-invoice` inside
> epic `epic/scm`. Explore only code changed since `last_verified_commit`. Symbol names, not line numbers.

## Summary
Enter the supplier's bill against one PO, line by line against QA-passed GRN lines, plus up to 10 charges.
Submit runs the 3-way match (PO rate / GST, billable qty, printed tax and total): no mismatch → `approved`
("Payable"), else `blocked`. A blocked bill goes back to draft or is released by someone else with
`invoice.release`. Approved/blocked bills can be cancelled. The service owns PO `invoiced` (set and cleared)
and links debit notes from purchase returns. The old manual "Record invoice" on the PO is gone. Full.

## Code locations
| Layer | Path | Key symbols |
|---|---|---|
| schema | `backend/src/db/schemas/02_procurement-purchasing.ts` | `supplierInvoices` (rebuilt), `supplierInvoiceLines`, `supplierInvoiceMismatches`, `supplierInvoiceHistory`; 7 enums `supplier_invoice_*`; partial unique `uq_supplier_invoice_live_number` (supplier, number, fy where live); CHECKs number format (non-legacy), kind ⇔ grn_item_id |
| schema (others) | `04_company.ts` | `company_settings.price_tolerance_bp` (0), `weight_tolerance_bp` (50), CHECK 0–1000 |
| migration | `backend/src/db/migrations/20261121083459_supplier_invoice/` (hand-edited) | old rows → `legacy`, `our_number` `LEGACY-<id>`, dates UTC → IST `date`, supplier/terms/creator from PO, generated `fy` added after the date change |
| types | `backend/src/types/supplierInvoice.types.ts`; `grn.types.ts` `WEIGHT_UNITS` | strict bodies, list / billable / detail / tolerance schemas |
| lib | `lib/supplier-invoice-math.ts` | `computeAmounts`, `taxHeadsOf`, `resolveTaxType`, `runMatch`, `TAX_TOLERANCE_PAISE` (100), `financialYearOfDay`, `istDay`, `addDays` |
| repository | `repository/supplierInvoiceRepository.ts` | `LIVE_STATUSES` (draft, blocked, approved), `billedMilliByGrnItem`, `listBillableCandidates`, `findNumberClash`, `hasLegacyInvoice`, `hasHistoryBy`, `updateLinesAmounts` (raw `UPDATE … FROM VALUES`), `list`, `findOldestApprovedBillCovering`, `lockUnlinkedNotesForGrnLines`, `setNoteLink` |
| service | `service/supplierInvoiceService.ts` | `list`, `getDetails`, `billableLines`, `create`, `update`, `remove`, `submit`, `backToDraft`, `release`, `cancel`; helpers `lockBillRows`, `billableFacts`, `prepareDraft`, `diffDraft`, `addHistory`; `CREATE_PO_STATUSES` (partial_received, fully_received, closed), `SUBMIT_PO_STATUSES` (+ invoiced) |
| link service | `service/supplierInvoiceLinkService.ts` | `reevaluatePoInvoiced`, `findBillForReturnPost`, `linkOnApproval`, `unlinkOfInvoice` — imports neither invoice nor return service (no cycle) |
| tolerances | `companySettingsController/Service/Repository`, `routes/company.ts` | `GET/PATCH /api/company/invoice-tolerances`, history rows `priceToleranceBp` / `weightToleranceBp` |
| cross-module | `grnService.correction` (BR-SINV-30 floor + re-test), `purchaseReturnService.post/cancel`, `poService.recomputeReceiptStatus` (leaves invoiced alone), `PO_STATUS_TRANSITIONS` (`invoiced → fully_received`) | |
| controller / routes | `controller/supplierInvoiceController.ts` (`jsonOrEmpty`: bad JSON → 400), `routes/supplierInvoice.ts` (`/api/supplier-invoice`), `END_POINTS.supplierInvoice` | 10 routes |
| permissions | `lib/permissions.ts` | `invoice.view`, `invoice.manage` (ow, bo), `invoice.release` (ow); screen `supplier-invoices` `/supplier-invoices` (order 177, Procurement) |
| frontend api | `lib/api/supplier-invoice/{fetchers,queries}.ts`, `types/supplier-invoice.ts`, `lib/supplier-invoice-calc.ts`, `API_ROUTES.supplierInvoices` + `company.invoiceTolerances` | `supplierInvoiceKeys` {all, lists, list, detail, billable, tolerances}; mutations also invalidate PO cards/detail and GRN list/detail |
| frontend ui | `app/(protected)/supplier-invoices/` (+ `new?poId=&grnId=`, `[id]`, `[id]/edit`); `components/views/supplier-invoices/` (List, Form, Detail, use-invoice-controls); `components/pages/supplier-invoices/` (InvoiceForm, InvoiceLinesEditor, InvoiceTotalsPanel, InvoiceDetailCards, InvoiceActionDialogs, InvoiceToleranceCard, InvoicesCard, EnterInvoiceButton, invoice-format, invoice-form-types) | status tones `supplierInvoice`, `supplierInvoiceMatch`; GRN + PO detail: Enter supplier invoice + Invoices card; "Invoice matching" card on `/subcontracting/settings`; `PO_BILLABLE_STATUSES` in `lib/po-status-badge.ts` |

## Data model
- `supplier_invoices`: `ourNumber` `SINV-<period>-<seq>`, supplier `invoiceNumber` (upper-cased `^[A-Z0-9/-]{1,16}$`), `invoiceDate` (`date`, IST), generated `fy`, `poId`, `supplierId`, `status` draft | blocked | approved | cancelled | legacy; printed amounts (`billedAmountPaise` = printed total, `printed*Paise`) vs computed (`taxablePaise`, heads, `totalPaise`, `taxType`); GSTIN/state snapshots at submit; `reverseCharge`, `itcIneligible`; `paymentTermsDays`, `dueDate` = invoice date + terms; tolerances used; submitted/released (+ reason)/cancelled (+ reason); audit.
- `supplier_invoice_lines`: `kind` item (one per GRN line per bill) | charge (freight, packing, tooling, other); `qty`, `ratePaise`, `gstBp`, amounts; at submit `poRatePaise`, `poGstBp`, `billableQty`, `belowPoRate`.
- `supplier_invoice_mismatches`: check qty | price | tax | tax_rate | total | charge, expected vs billed, unit paise | milli_qty | bp, `head` for tax. Replaced on each submit, cleared on back to draft.
- `supplier_invoice_history`: create / edit (`detail.changes[]` old → new) / submit (`detail.result`, mismatches, linked note ids) / back_to_draft / release / cancel / delete; survives delete (`invoiceId` set null, `ourNumber` kept).

## API (`/api/supplier-invoice`)
| Method | Path | Key | Purpose |
|---|---|---|---|
| GET | `/getsupplierinvoices` | view or manage | list; status tabs incl. payable / overdue; `meta.statusCounts` |
| GET | `/getbillablelines` | manage | billable GRN lines of a PO (+ optional GRN); `po.prId` for the PO link |
| GET | `/getsupplierinvoicedetails/:id` | view or manage | detail (also the response of every write) |
| POST / PATCH / DELETE | `/createsupplierinvoice`, `/updatesupplierinvoice`, `/deletesupplierinvoice/:id` | manage | draft only; `poId` immutable |
| POST | `/:id/submit`, `/:id/back-to-draft` | manage | match → approved / blocked; blocked → draft |
| POST | `/:id/release` | release | blocked → approved with reason; not by anyone with a create/edit/back_to_draft/submit history row |
| POST | `/:id/cancel` | manage | blocked (reason ≥ 3) / approved (reason ≥ 10) → cancelled |
| GET / PATCH | `/api/company/invoice-tolerances` | view or manage / `company.manage` | percent 0–10, 2 dp |

Codes: `SINV_WRONG_PO`, `SINV_DUPLICATE_LINE`, `SINV_QA_PENDING`, `SINV_QTY_WHOLE`, `SINV_BAD_DATE`, `SINV_NOTHING_TO_BILL`, `SINV_AMOUNT_TOO_LARGE`, `SINV_DUPLICATE_NUMBER`, `SINV_PO_IMMUTABLE`, `SINV_NOT_DRAFT`, `SINV_NOT_BLOCKED`, `SINV_NOT_CANCELLABLE`, `SINV_REASON_LENGTH`, `SINV_SELF_RELEASE` (403), `SINV_PO_NOT_BILLABLE`, `SINV_STALE_QTY`, `SINV_BUSY` (cancel only), `SINV_COMPANY_SETTINGS_MISSING`, `SINV_COMPANY_NOT_SET`, `SINV_CORRECTION_BELOW_BILLED` (GRN correction).

## Key flows
- Billable (`billableFacts`) per GRN line = net accepted (accepted − corrections) − qty on other live bills − accepted returned, floor 0.
- Lock order (`lockBillRows`): GRN headers → PO → GRN lines (ascending id) → invoice/counter rows.
- `create`/`update` (`prepareDraft`): PO in `CREATE_PO_STATUSES`, no legacy invoice, date not in future and not before PO date, QA passed/waived, whole-number units, billable > 0, number unique per supplier + FY; server computes amounts, tax type (IGST when supplier GSTIN state ≠ plant state), due date.
- `submit`: company state + GSTIN required → PO in `SUBMIT_PO_STATUSES` → any line with billable 0 → `SINV_STALE_QTY` → recompute amounts → `runMatch` (unused head > 0 or used head/total off by > ₹1; rate above PO × (1 + price tol); qty above billable × (1 + weight tol, weight units only); GST ≠ PO; any charge) → `updateLinesAmounts` → mismatches → approved / blocked → if approved `linkOnApproval` + `reevaluatePoInvoiced`.
- `release`: re-checks billable under lock; stale only if a line is above billable and was not flagged `qty` at submit, or billable dropped below the submit value (A-52) → approved → link notes → re-test PO.
- `cancel`: pre-lock status read; moved under the lock → 409 `SINV_BUSY` → `unlinkOfInvoice` (notes back to offset 0, no re-link) → re-test PO.
- `reevaluatePoInvoiced` (BR-SINV-29, PO lock held): only for `fully_received`/`invoiced`, skipped when a legacy invoice exists; invoiced when every GRN line has approved qty ≥ net accepted − accepted returned and at least one approved bill; else back to `fully_received`. Called from submit, release, cancel, return post/cancel and GRN correction.

## Invariants & gotchas
- `invoiced` is set and cleared only here; `recomputeReceiptStatus` leaves an invoiced PO alone.
- `getbillablelines` on an invoiced PO: 200 empty list, or 409 if something is still billable (inconsistent). Create rejects invoiced; an existing draft may still be submitted (A-51).
- `updateLinesAmounts` is raw SQL with hardcoded column names and casts — keep in sync with the schema.
- Wrong-head printed tax is a mismatch for any amount > 0; used heads tolerate 100 paise.
- Tax split needs the plant state code, readable only with `sco.view`; without it the form shows total GST and the server decides at save.
- Form submit = save then `POST :id/submit`; a failed submit keeps the saved draft id.
- drizzle-kit asks rename-or-create per new column; pass `--hints` with `create` entries. Generated `fy` must come after `invoice_date` becomes `date`.
- Fixtures (`scripts/db-reset-fixtures.ts`) seed company settings and make PO7 invoiced through `supplierInvoiceService.create` + `submit`.
- `DetailHeader` shows at most 4 meta pairs.

## Tests
| File | Covers |
|---|---|
| `backend/tests/routes/supplierInvoice.test.ts` | BR-SINV-01..18, 28, 32, 33, 35..38 |
| `backend/tests/routes/supplierInvoiceRelease.test.ts` | BR-SINV-19..27, 34, 35, 39..41 |
| `backend/tests/routes/supplierInvoiceLinks.test.ts` | BR-SINV-02, 29..31, 38, 39; BR-PRT-43..45 |

## Known gaps / debt
- Payments are not built: `payment_status` stays `unpaid`; `supplier_payments` / bank details are schema-only.
- List sort fixed at created desc in the UI (no sortable headers).

## History
| Date | PR / commit | Change |
|---|---|---|
| 2026-11-21 | feda369..de68fdf | Map created: supplier invoice + 3-way match built to spec v1 on `epic/scm`; manual PO invoice removed; fixes CR-01..04, SEC-01/03, SPEC-04, PERF-A/D, release/cancel race, A-52 override-aware release |
