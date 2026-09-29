---
module: subcontracting
spec: docs/specs/subcontracting.md (draft v0)
last_verified_commit: 5bbfd58
last_verified_on: 2026-09-29
depends_on: [suppliers, inventory, approval, grn]
---

# Subcontracting (SCO / job work) — as-built map

> What the code **is** (the spec says what it **should be**). Today: schema + approval plumbing only.
> No routes, controller, service, repository, types or frontend for SCO exist.

## Code locations
| Layer | Path | Key symbols |
|---|---|---|
| schema | `backend/src/db/schemas/02_procurement-purchasing.ts` | `scoStatusEnum`, `subcontractingOrders`, `subcontractingOrderItems`, `subcontractingGrns`, `subcontractingGrnItems` (reuses `grnStatusEnum`) |
| schema | `backend/src/db/schemas/02_procurement-catalog.ts` | `locationTypeEnum.vendor_premise`, `locations.linkedVendorId`/`isVirtual`, `inventoryRefTypeEnum.sco_issue`/`sco_receipt`, `serviceMaster` |
| schema | `backend/src/db/schemas/02_procurement-suppliers.ts` | `supplierTypeEnum` (`service_provider`, `both`), `supplierServices` (price, tax %, lead time) |
| approval | `backend/src/repository/approvalRepository.ts` | `updateScoApprovalMirror` (status only), SCO branch of `findDocumentContext` / doc summaries (amount hard-coded 0) |

## Data model (as built)
- `subcontracting_orders`: `scoNumber` unique, `vendorId` → supplier, `status` (`draft, pending_approval, approved, rejected, require_more_info, material_issued, material_received, closed, cancelled`), `projectRef`, `notes`, `createdBy` (nullable), `createdAt`.
- `subcontracting_order_items`: `rawItemId`, `rawItemBatch` (heat no.), `rawQtyToIssue`, `serviceDescription` (free text), `serviceHsnSacCode`, `serviceUnitPricePaise`, `serviceTaxPercentage` (default 18), `finishedItemId`, `expectedReturnQty`.
- `subcontracting_grns`: `grnNumber` unique, `scoId`, `vendorId`, `status` (grn_status), `receivedDate`, `createdBy`.
- `subcontracting_grn_items`: `scoItemId`, `receivedQty`, `acceptedQty`, `rejectedQty`, `qaStatus` (free text), `isQaBypassed`, `qaBypassReason`.

## Known gaps vs spec (draft v0)
- No SCO feature at all: routes, service, repository, Zod types, frontend, numbering (`document-number.ts` has no `sco`, `sco_grn`, FY-based `JWC`) — BR-SCO-01, 09.
- No challan (issue) document: needs `sco_challans` + lines (number, date, e-way bill no., value, due date) and a receipt↔challan settlement table — BR-SCO-07..11, 17.
- Order line has no issued / accepted / rejected / unprocessed / loss counters, no `serviceId` FK (free text), no expected return date on header — BR-SCO-02, 03, 07, 12, 18.
- Header lacks cancel/close fields (who, when, reason) and the approval level fields PR/PO have (`approvedBy`, `currentApprovalLevel`, `totalApprovalLevels`); `createdBy` nullable but approval submit checks it — BR-SCO-06, 19, 20, 25.
- Receipt lacks vendor challan no. (unique per vendor), unprocessed qty, QA actor/time; `qaStatus` is free text; `draft` grn_status has no meaning here — BR-SCO-12, 13, 16.
- `inventory_ref_type` has no value for the loss write-off or vendor → scrap-yard move; propose `sco_loss` (and use `sco_receipt` for scrap move) — BR-SCO-15, 19.
- `item_master` has no HSN code; plant GSTIN / state has no home (company settings); supplier state only derivable from GSTIN — BR-SCO-09, 10.
- `locations.linkedVendorId` not unique → two job-work locations per vendor possible — BR-SCO-08.
- Approval: SCO amount = 0 and category `any` in `findDocumentContext` (BL-028) — BR-SCO-04; SCO sent back stays `require_more_info` (approval BR-APR-44) — BR-SCO-06.
- `POST /asset/inventory/movements` can post `sco_issue`/`sco_receipt` directly (BL-015; grn-stock BR-GRN-43 will block it).

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
