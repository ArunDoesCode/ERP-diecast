---
module: subcontracting
spec: docs/specs/subcontracting.md (v3, frozen)
last_verified_commit: de0fcfc
last_verified_on: 2026-09-29
depends_on: [suppliers, inventory, approval, grn]
---

# Subcontracting (SCO / job work) — as-built map

> What the code **is** (the spec says what it **should be**). Built in PR `feature/subcontracting`
> (S1 order + approval, S2 challan, S3 receipt + QA, S4 close + loss + reports). Spec clarifications made
> during the build are in the spec Changelog.

## Code locations
| Layer | Path | Key symbols |
|---|---|---|
| schema | `backend/src/db/schemas/02_procurement-purchasing.ts` | `subcontractingOrders`, `subcontractingOrderItems`, `scoChallans`, `scoChallanLines`, `subcontractingGrns` (receipts), `subcontractingGrnItems`, `scoReceiptSettlements` |
| schema | `backend/src/db/schemas/04_company.ts` | `companySettings` (one row: plant name, address, GSTIN, state) |
| schema | `02_procurement-catalog.ts` | `item_master.hsn_code`; ledger types `sco_issue`, `sco_receipt`, `sco_loss` |
| routes | `backend/src/routes/sco.ts`, `company.ts` (+ `end-points.ts`) | `/api/sco/*`, `/api/company/settings` |
| service | `service/scoService.ts`, `scoChallanService.ts`, `scoReceiptService.ts`, `scoReportService.ts`, `companySettingsService.ts` | order/approval/close, challan, receipt + QA, reports |
| repository | `repository/scoRepository.ts`, `scoChallanRepository.ts`, `scoReceiptRepository.ts`, `scoReportRepository.ts` | `escapeLike` in scoRepository |
| lib | `lib/sco-math.ts`, `lib/document-number.ts` (`allocateFinancialYearSequence`) | ratio math, JWC numbering |
| approval | `service/approvalService.ts`, `repository/approvalRepository.ts` | SCO branch: amount incl. GST, category `subcontracting`, sent back → `draft`, row lock on submit |
| frontend | `frontend/src/app/(protected)/subcontracting/**`, `components/{views,pages}/subcontracting/**`, `lib/api/subcontracting/**` | list, form, detail, challans, receipts, QA, close, reports, company settings |

Endpoints and payloads: `.pipeline/subcontracting/contract.md`, or `bun run contract:query "<METHOD /path>"`.

## Data model (as built)
- Order + line: line names kept from the old schema — `rawQtyToIssue` = send qty, `expectedReturnQty` = return qty; counters `issuedQty`, `acceptedQty`, `rejectedQty`, `unprocessedQty`, `pendingQaQty`, `lossQty`; `serviceId` FK; price + GST rate copied from the vendor's service row.
- Challan `JWC/<FY>/<seq>` (FY = Apr–Mar, e.g. `27-28`) + lines (qty, issue cost, heat, HSN, `settledQty`); due date = date + 1 year.
- Receipt (`subcontracting_grns`) + lines; status/qaStatus reuse `grn_status` (`draft` never used; default `pending_qa`); vendor challan/invoice no. unique per vendor.
- `sco_receipt_settlements`: receipt line ↔ challan line, `qty`, `processed_qty` (the part drawn by processed pieces — QA cost uses only this).
- Ledger rows: `sco_issue` (referenceId = challan id), `sco_receipt` (receipt id / line id), `sco_loss` (SCO id / line id, notes = reason). Vendor location = `<vendor> (job work)`, virtual, one per vendor (unique index).

## Gotchas
- `qtyAtVendor` = still to claim (pending QA already reserved). `material_received` = all pieces covered by receipts, even if QA pending; close then returns 409 until QA is decided.
- Over-qty challan: 400 if over on arrival, 409 if it lost the race after the SCO lock (both checks are needed).
- Uneven send:return ratio: raw used = round half up of cumulative processed × ratio, minus already used (spec Changelog).
- E-way bill: required if vendor state ≠ ours, no GSTIN, or challan value ≥ ₹50,000 (5,000,000 paise) — money is paise everywhere; a fixture cost ≥ 1,000 paise × 50+ pcs crosses the line.
- Challan needs company settings + raw item `hsn_code`, else 400. Frontend shows the e-way field always as optional; the server decides.
- Route order: `/challans/open` before `/challans/:challanId`. Close body may be empty (`.json().catch`).
- Drizzle subqueries need unique column aliases; `db:generate` asks interactively about renames — old empty `subcontracting_grn*` tables were dropped once; schema changes now go through migrations (`db:generate` then `db:migrate`).
- Loss write-off also raises `settledQty` on open challan lines with no settlement row (keeps ITC-04 data honest); there is no SCO delete route (404).
- Receipt statuses (`pending_qa`, `accepted`, `partial_accepted`, `rejected`) and receipt number `SCO-GRN-<period>-<seq>` are build choices, not in the spec.
- Challan date: future → 400 (`SCO_CHALLAN_DATE_FUTURE`, UTC day) — the picker uses local day, so 00:00–05:30 IST mismatches (BL-079).
- Post stock lines in item-id order in every multi-line path (receipt, QA, close, challan) or two SCOs sharing items can deadlock (PERF-5).
- QA/unprocessed issue cost comes only from the `processed_qty` part of settlements; mixing lots of different cost once skewed it (CR-1, `scoReceiptCost.test.ts`).
- Scrap yard = first `scrap_yard` location; missing → 409 at QA when there are rejects.

## Tests
| File | BRs |
|---|---|
| `backend/tests/routes/sco.test.ts` | 01–06, 20, 21, 23 |
| `backend/tests/routes/scoChallan.test.ts` | 07–11, 24, 25 |
| `backend/tests/routes/scoReceipt.test.ts` | 12–18, 22, 24, 25 |
| `backend/tests/routes/scoReceiptCost.test.ts` | 14, 17 (issue cost regression, CR-1) |
| `backend/tests/routes/scoClose.test.ts` | 19, 22–25 + reports |

## Indian GST notes (why the rules look like this)
- CGST Sec 143: inputs sent for job work without tax must come back (or be supplied from the job worker's place) within 1 year; capital goods 3 years; moulds, dies, jigs, fixtures, tools exempt. Late = deemed supply on the day sent out, tax + interest.
- Rule 55: goods move on a delivery challan, serial no. consecutive per FY, max 16 characters, with GSTINs, HSN, qty, taxable value, place of supply.
- Rule 45 / ITC-04: principal reports goods sent, received back and supplied from job worker; half-yearly if turnover > ₹5 cr, else annual.
- E-way bill: inter-state movement to a job worker needs one irrespective of value; intra-state follows the ₹50,000 rule.
- Waste/scrap at job worker: registered job worker may sell it on payment of tax; otherwise principal supplies it.
- Job-work rate on the service: keep per line (`serviceTaxPercentage`); do not hard-code, rates changed with GST rationalisation.

## ERP benchmark (with links)
| ERP | Model | Take for us |
|---|---|---|
| ERPNext v14/v15 | PO for the service → Subcontracting Order → Stock Entry "Send to Subcontractor" into a supplier warehouse → Subcontracting Receipt that consumes supplied raw material (backflush) and shows consumed qty. India Compliance app adds challan/e-way bill and ITC-04 from these documents, linking receipts to original challans. [ERPNext subcontracting](https://docs.frappe.io/erpnext/user/manual/en/subcontracting-in-erpnext), [v13→v15 evolution](https://havenir.com/blog/product-features/evolution-of-subcontracting-in-erpnext-a-comparison-from-v13-to-v15), [v14 blog](https://erpnext.com/blog/ERPNext%20Features/how-to-manage-subcontracting-with-version-14-of-erpnext), [India Compliance subcontracting](https://docs.indiacompliance.app/blog/posts/post5) | one SCO doc (no separate PO); vendor location as "supplier warehouse"; receipt consumes raw at the vendor; challan-linked receipts (BR-SCO-08, 14, 17) |
| Odoo 17 | Subcontracting BoM; PO to subcontractor; "Resupply subcontractor" auto-creates a delivery of components to a dedicated Subcontracting Location; receipt of finished product consumes components there. [Subcontracting](https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/manufacturing/subcontracting.html), [Resupply](https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/manufacturing/subcontracting/subcontracting_resupply.html) | one location per vendor holds our stock; moves history = our ledger. BoM-driven auto resupply is M4 |
| SAP (ERP / S/4) | Components go to "stock provided to vendor" (mvt 541, no financial impact); GR of the assembly (101) consumes them (543); subcontracting cockpit monitors stock at vendor. [SAP Learning](https://learning.sap.com/courses/inventory-management-and-physical-inventory-in-sap-s-4hana/performing-the-process-of-subcontracting), [ERP Corp](https://erpcorp.com/sap-controlling-blog/sap-subcontracting), [Subcontracting Cockpit](https://help.sap.com/docs/SAP_ERP_SPV/96bf9ad642cf4b26a29595e3d573fb8c/cb60bd534f22b44ce10000000a174cb4.html) | issue is a transfer at cost, item stock unchanged; value moves only on receipt (BR-SCO-08, 14) |
| SAP Business One | No native subcontracting document; common practice = transfer to a vendor warehouse, production order with the service as a resource/non-stock line, PO for the service. [SAP B1 purchasing](https://learning.sap.com/courses/managing-logistics-in-sap-business-one/purchasing-items), [SAP community thread](https://community.sap.com/t5/enterprise-resource-planning-q-a/subcontracting-an-operation-in-a-production-order/qaq-p/9854382) | confirms small plants run it as transfer + service charge; we keep that but in one document |
| Business Central (extra) | Subcontracting location on the vendor card; transfer orders move components there. [Subcontracting components](https://learn.microsoft.com/en-us/dynamics365/business-central/subcontract-components) | auto-created vendor location (BR-SCO-08) |

**Common pattern:** material stays ours at a vendor location; issue is a transfer, receipt consumes it and
books the service; loss is an explicit write-off. **Adapted:** no separate PO for the service, no BoM yet
(ratio per line), GST challan + 1-year clock + e-way bill number built in, ITC-04 export later.

GST sources: [TaxGuru Sec 143](https://taxguru.in/goods-and-service-tax/job-work-procedure-gst-section-143-cgst-act-2017.html),
[TaxGuru ITC-04 guide](https://taxguru.in/goods-and-service-tax/job-work-gst-itc-04-filing-detailed-compliance-guide.html),
[Tally job work](https://tallysolutions.com/gst/job-work-transactions-under-gst/),
[GST portal ITC-04 manual](https://tutorial.gst.gov.in/userguide/inputtaxcredit/Manual_itc04.htm).

## History
| Date | PR / commit | Change |
|---|---|---|
| 2026-09-29 | — | Map created with spec draft v0 (schema only, no feature code) |
| 2026-09-29 | PR #14 (0c84bea) | Built S1–S4 to spec v2; review fixes (CR-1 cost, indexes, deadlock order); v3: future challan date → 400 |
