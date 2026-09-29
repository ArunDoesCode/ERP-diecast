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
