# Contract — subcontracting S1 (order + approval, company settings, item HSN)

Base `/api`. All success bodies `{ success: true, data }` (+ `meta` on lists). Errors `{ success:false, message, code?, details? }`.
Implemented (S1). Query manifest: `bun run contract:query "<METHOD> <path>"`.
Qty are whole pieces (int). Money = integer paise. Dates are ISO strings.
Names kept from the existing table: `rawQtyToIssue` = SEND qty, `expectedReturnQty` = RETURN qty, `serviceUnitPricePaise`, `serviceTaxPercentage` (GST %).

## Endpoints
| Method | Path | Key (roles seeded) |
|---|---|---|
| GET | /sco/getscos | `sco.view` |
| GET | /sco/getscodetails/:id | `sco.view` |
| POST | /sco/createsco | `sco.manage` |
| PATCH | /sco/updatesco | `sco.manage` |
| POST | /sco/:id/submit | `sco.manage` |
| POST | /sco/:id/cancel | `sco.manage` |
| GET | /company/settings | `sco.view` |
| PATCH | /company/settings | `company.manage` (owner only) |
| PATCH | /asset/items/:id | `asset.manage` (existing; body now accepts `hsnCode`) |

## GET /sco/getscos
Query: `page`(1) `pageSize`(10, max 100) `sortBy` in `id|scoNumber|status|createdAt|expectedReturnDate`, `sortDir` asc|desc (asc),
`status` comma list of enum, `vendorId`, `q` (SCO number or vendor name contains).
Response: `data: SCO[]`, `meta {page,pageSize,total,totalPages}`.
SCO = all `subcontracting_orders` columns: id, scoNumber, vendorId, status, projectRef, notes, expectedReturnDate, subtotalPaise, taxAmountPaise, totalAmountPaise,
approvedBy, currentApprovalLevel, totalApprovalLevels, createdBy, createdAt, lastUpdatedBy, lastUpdatedAt, cancelledBy, cancelledAt, cancelReason, closedBy, closedAt, closeReason
+ `vendorName`, `cancelledByName|null`.
status enum: draft, pending_approval, approved, rejected, require_more_info, material_issued, material_received, closed, cancelled.

## GET /sco/getscodetails/:id
Response `data: { sco: SCO, items: Line[] }`. 404 if missing.
Line = id, scoId, rawItemId, rawItemBatch|null, rawQtyToIssue, serviceId, serviceDescription, serviceHsnSacCode|null, serviceUnitPricePaise, serviceTaxPercentage,
finishedItemId, expectedReturnQty, issuedQty, acceptedQty, rejectedQty, unprocessedQty, lossQty
+ `rawItemSku`, `rawItemName`, `finishedItemSku`, `finishedItemName`, `lineValuePaise` (price x return qty), `lineTaxPaise`.

## POST /sco/createsco  -> 201 `data: { sco, items }`
Body: `{ vendorId, expectedReturnDate, projectRef?, notes?, lines: [ { rawItemId, finishedItemId, serviceId, rawQtyToIssue, expectedReturnQty, serviceUnitPricePaise?, serviceTaxPercentage?, rawItemBatch? } ] }` (lines >= 1).
`serviceTaxPercentage` in 0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 28, 40. Price/GST omitted = copied from the vendor's service price list.
Errors: 400 (validation; vendor not service_provider/both or inactive; no lines; raw = finished item; inactive item; service not on vendor's active list; non-integer/<=0 qty; return date before today or > 365 days), 403, 404 (unknown ids).

## PATCH /sco/updatesco  -> `data: { sco, items }`
Body (strict; unknown keys e.g. `status` -> 400): `{ scoId, expectedReturnDate?, projectRef?: string|null, notes?: string|null, lines?: Line input[] }`. `lines`, if sent, REPLACES all lines. At least one field besides scoId.
Errors: 400, 403, 404, 409 (not draft, BR-SCO-05).

## POST /sco/:id/submit  -> `data: { sco, items }`
No body. Creator only. Result `pending_approval`, or `approved` if no chain applies. Errors: 403 (not creator / no key), 404, 409 (not draft / already open request).

## POST /sco/:id/cancel  -> `data: { sco, items }`
Body `{ reason }` (3-500 chars, always; missing -> 400 `SCO_CANCEL_REASON_REQUIRED`). Allowed from draft/pending_approval/approved with nothing issued. Errors: 400, 403, 404, 409 (issued or final status).

## GET /company/settings
`data: { id, name, address, gstin, stateCode, updatedBy, updatedAt } | null` (null until first save).

## PATCH /company/settings  (create-or-replace the single row)
Body (strict, all required): `{ name (<=200), address (<=500), gstin (15 chars, uppercased), stateCode (2 digits) }`. Errors: 400, 403.

## PATCH /asset/items/:id
Existing body plus `hsnCode?: string | null` (1-20 chars; null clears). Item responses now include `hsnCode`.

## Notes (implemented)
- Error codes: 400 `SUPPLIER_INACTIVE`, `SCO_VENDOR_TYPE_INVALID`, `SCO_SAME_ITEM`, `SCO_RETURN_DATE_INVALID`, `SCO_SERVICE_NOT_OFFERED`, `ITEM_INACTIVE`; 409 `SCO_NOT_DRAFT`, `DOC_LOCKED_IN_APPROVAL`, `SCO_INVALID_TRANSITION`, `SCO_HAS_ISSUE`, `APPROVAL_ALREADY_OPEN`.
- Approval: SCO amount = totalAmountPaise (incl. GST), category `subcontracting`; sent back / withdraw -> `draft`.
- New permission key `company.manage` (owner seed only); new screen `/subcontracting` (key `sco.view`).

---

# Contract — subcontracting S2 (challan = issue material)

Status: CONTRACT ONLY. Handlers return 501 `NOT_IMPLEMENTED` until S2 backend lands. Qty whole pcs, money paise, dates ISO.
Challan number `JWC/<FY>/<seq>` (FY Apr-Mar, e.g. `27-28`, <=16 chars). Return due date = challan date + 1 year.

## Endpoints (all under `/api/sco`)
| Method | Path | Key | Notes |
|---|---|---|---|
| POST | /sco/:id/challans | `sco.issue_receive` | `:id` = SCO id. 201 |
| GET | /sco/:id/challans | `sco.view` | challans of one SCO, newest first, not paginated |
| GET | /sco/challans/open | `sco.view` | paginated, open challans across SCOs |
| GET | /sco/challans/:challanId | `sco.view` | challan + print data |

## Shapes
Challan = id, challanNumber, scoId, vendorId, challanDate, ewayBillNo|null, valuePaise, returnDueDate, createdBy, createdAt
+ `scoNumber`, `vendorName`, `createdByName|null`, `daysLeft` (int, whole days to due date, negative = overdue),
`dueStatus` in `ok` (>60 days) | `warning` (0..60 days) | `overdue` (past due).
ChallanLine = id, challanId, scoItemId, itemId, qty, unitIssueCostPaise, heatNumber|null, hsnCode, settledQty
+ `itemSku`, `itemName`, `lineValuePaise` (qty x unitIssueCostPaise).

## POST /sco/:id/challans -> 201 `data: { challan, lines }`
Body: `{ challanDate?: ISO date (default now; decides FY), ewayBillNo?: string (1-50), lines: [ { scoItemId, qty (int >=1), heatNumber? (default = SCO line rawItemBatch) } ] }` (lines >= 1).
Errors: 400 (validation; qty > send qty - issued; plant settings or raw item HSN missing; EWB missing when inter-state / vendor unregistered / value >= 50,000 paise*100 i.e. Rs 50,000 = 5,000,000 paise), 403, 404 (SCO / scoItemId not on this SCO),
409 (SCO not approved/material_issued; store stock short; concurrent challan lost the SCO lock, BR-SCO-24).
Effect: two `sco_issue` ledger rows per line (store -qty, vendor location +qty, average cost, heat), `issuedQty` += qty, SCO -> `material_issued`.

## GET /sco/:id/challans -> `data: Challan[]`. 404 if SCO missing.

## GET /sco/challans/open
Query: `page`(1) `pageSize`(10, max 100) `sortBy` in `id|challanNumber|challanDate|returnDueDate` (returnDueDate), `sortDir` asc|desc (asc),
`vendorId`, `scoId`, `dueStatus` ok|warning|overdue. Open = any line with settledQty < qty.
Response `data: Challan[]`, `meta {page,pageSize,total,totalPages}`.

## GET /sco/challans/:challanId -> `data: { challan, lines, company, vendor, declaration }`
`company` = company_settings row (id, name, address, gstin, stateCode, updatedBy, updatedAt).
`vendor` = `{ id, name, address|null, gstin|null (null => print "unregistered"), stateCode|null }`.
`declaration` = fixed text "sent for job work u/s 143, no tax charged". 404 if missing.

## Notes
- New tables `sco_challans`, `sco_challan_lines`. Receipt<->challan settlement table deferred to S3 (`settledQty` column is ready).
- Vendor location: existing `uq_locations_one_vendor_premise` already makes one-per-vendor unique; implementation must create with `onConflictDoNothing` then re-select.
- Route order: `/challans/open` is registered before `/challans/:challanId`.
- Assumption to confirm: `challanDate` and per-line `heatNumber` are optional inputs (spec only says date and heat copied).
