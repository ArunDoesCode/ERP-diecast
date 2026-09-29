# Contract — m1-stock (grn + grn-stock)

Source of truth for shapes: `backend/.contracts/api-manifest.json` (`bun run contract:query "<METHOD> <path>"`).
Envelope: success `{ success: true, data, meta? }`; error `{ success: false, message, code? }`.
Base paths `/api/grn`, `/api/asset`. All routes need auth (401 otherwise). Wrong role = 403, nothing changes.
Qty = number, up to 3 decimals (else 400). Whole numbers for items in pcs/set (service, 400). Money = integer paise.
"Handler" column: **new/changed shape, handler not yet updated** = tests written from this will fail until the slice lands.

## GRN — roles (perm key = seed roles + super-admin)
| Key | Roles |
|---|---|
| `grn.view` | super-admin, owner, back_office, floor_supervisor, qa_inspector, die_designer |
| `grn.edit_draft` | super-admin, owner, back_office, floor_supervisor |
| `grn.qa_decide` | super-admin, owner, back_office, qa_inspector |
| `grn.qa_bypass` | super-admin, owner, back_office (floor_supervisor removed) |
| `grn.correct` | super-admin, owner, back_office |
| `grn.over_receipt_override` | owner, back_office (+ super-admin). Checked in the service, not the route guard |

## GRN endpoints
### GET `/api/grn/getgrns` — `grn.view` — unchanged
Query: `page`(1) `pageSize`(10, max 100) `sortBy`(id|grnNumber|status|receivedDate) `sortDir`(asc) `poId` `status` `qaStatus` `q`.
200 paginated list of GRN header rows (`meta {page,pageSize,total,totalPages}`).

### GET `/api/grn/getgrndetails/:id` — `grn.view`
200 `data = { grn, items[] }`. `grn`: header row (id, grnNumber, poId, supplierId, status, receivedDate, createdBy, challanNo, challanDate, vehicleNo, driverName, driverPhone, remarks).
Each `items[]` line: id, grnId, poItemId, receivedQty (= arrived), acceptedQty, rejectedQty, qaStatus (`pending|passed|failed|waived`), isQaBypassed, qaBypassReason, qaBypassedBy, qaBypassedAt, challanPhotoUrl, **batchNumber**, **overReceiptExcessQty**, **overReceiptReason**, **overReceiptBy**, itemId, itemSku, itemName, orderedQty, **correctedQty**, **netAcceptedQty** (= acceptedQty − correctedQty; acceptedQty never changes).
Errors: 400 bad id, 404.

### POST `/api/grn/creategrn` — `grn.edit_draft` — 201 `data = { grn, items[] }` (status `draft`)
Body:
```
{ poId: int,
  challanNo: string (1..100, REQUIRED),
  challanDate?: date, vehicleNo?, driverName?, driverPhone?, remarks?,
  lines: [{ poItemId: int, arrivedQty: >0 (3 dp), batchNumber?: string(1..100) }] (min 1) }
```
No `receivedDate` (ignored if sent; server time, BR-GRN-08).
Errors: 400 missing/blank challan, PO not `dispatched`/`partial_received`, line not of this PO, duplicate line, qty <= 0 / >3 dp / fractional pcs; 403; 404 PO; 409 same supplier + challanNo already used.

### PATCH `/api/grn/updategrn` — `grn.edit_draft` — 200 `data = { grn, items[] }`
Body: `{ grnId: int, challanNo?: string(1..100) (cannot be cleared), challanDate?, vehicleNo?, driverName?, driverPhone?, remarks?: nullable, lines?: [{ id: int (grn line id), arrivedQty: >0, batchNumber?: nullable }] }` — at least one field.
Errors: 400 GRN not draft ("use the correction"), bad qty; 403; 404; 409 challan clash.

### DELETE `/api/grn/deletegrn/:id` — `grn.edit_draft` — 200 `data = { id }`
Errors: 400 not draft; 403; 404. Number is never reused.

### POST `/api/grn/:id/lines/:lineId/qa` — `grn.qa_decide` — 200 `data = GRN line row` (fields as above, without joined item fields)
Body (no `decision` field any more; line is `passed` if acceptedQty > 0, else `failed`):
```
{ acceptedQty: >=0, rejectedQty: >=0,           // sum must equal the line's arrived qty; sum > 0
  remarks?: string, certificateUrl?: url, batchNumber?: string,
  overrideReason?: string }                      // needed when past 105% of ordered and actor has grn.over_receipt_override
```
Errors: 400 sum != arrived, qty rules, over-receipt without key or without overrideReason; 403; 404 line not in this GRN; 409 line already decided, or PO not `dispatched`/`partial_received`.
Side effects: one `qa_tests` row; if acceptedQty > 0 one ledger row (`in`, ref `grn`, refLineId = line id, cost = PO rate); PO line received qty up; header + PO status recomputed.

### POST `/api/grn/:id/lines/:lineId/bypass` — `grn.qa_bypass` — 200 `data = GRN line row`
Body: `{ bypassReason: string (1..1000, required), acceptedQty?: >0 (default arrived; less → rest recorded as rejected), batchNumber?, overrideReason? }`
Line becomes `waived`, `isQaBypassed=true`, `qaBypassedBy/At` set; ledger ref `grn_bypass`.
Errors: 400 empty reason, acceptedQty > arrived, over-receipt rules; 403 (incl. floor_supervisor); 404; 409 already decided / PO status.

### POST `/api/grn/:id/lines/:lineId/correction` — `grn.correct` — 201 `data = ledger row` (assetInventoryMovement shape, now with `referenceLineId`)
Body: `{ qty: >0 (3 dp), reason: string (1..1000) }`
Errors: 400 line not `passed`/`waived`, sum of corrections > acceptedQty, empty reason; 403; 404; 409 "Insufficient stock" (balance would go < 0), PO invoiced/closed.
Effect: ledger `adjustment`, −qty, cost = posted cost, ref `grn_correction`; PO line received qty down, PO status recomputed.

## Inventory endpoints (`/api/asset`)
Roles: masters (`/machines`, `/items`, `/services`, `/locations`) = `asset.manage`: super-admin, back_office (unchanged).

### POST `/api/asset/inventory/movements` — `inventory.adjust`: super-admin, owner, back_office — 201 `data = ledger row`
Body **(changed; handler not yet updated)**:
```
{ itemId: int, locationId: int,
  referenceType: "stock_adjustment" | "opening_stock"   // any other ref type (grn, grn_bypass, grn_correction, pro, sco_issue, sco_receipt, sco_loss, job_order_issue, scrap_dispatch) -> 400 "post from its source document"
  quantityChange: non-zero (3 dp), unitCostPaise?: int >=0, reason: string (1..1000, required), batchNumber?: string|null }
```
No `transactionType` / `referenceId` in the body (server sets `adjustment`). Stock-in needs unitCostPaise > 0; stock-out is valued at the current average whatever is sent.
Errors: 400 (validation, doc ref type, cost <= 0 on stock-in), 403, 404 item/location, 409 "Insufficient stock".

### GET `/api/asset/inventory/movements` — `inventory.view`: super-admin, owner, back_office, floor_supervisor — unchanged query/response (roles widened)
Ledger row now also has `referenceLineId: int | null`. `referenceType` filter enum gained `grn_correction`, `opening_stock`, `sco_loss`.

### GET `/api/asset/inventory/reconciliation` — `inventory.view` (same roles) — NEW, handler returns 501 until S5
Query: `page`(1) `pageSize`(10) `sortBy`(itemId) `sortDir`. 200 paginated rows; **zero rows = OK**:
`{ kind: "item_stock" | "item_location_balance", itemId, itemSku, locationId: int|null (null for item_stock), storedQty, ledgerQty }`
(`item_stock`: item.currentStock vs sum of ledger; `item_location_balance`: last balanceAfter vs sum for that item+location).

### POST `/api/asset/items`, PATCH `/api/asset/items/:id` — `asset.manage` — **changed**
Body no longer accepts `currentStock` or `averageCostPaise`; sending either (or any unknown key) → 400 (strict, BR-GRN-40). Response rows still show both, read-only.

## Data model additions (schema only)
- `inventory_ledger.reference_line_id` int null; ref enum + `grn_correction`, `opening_stock`, `sco_loss`.
- `grn_items`: `qa_bypassed_at`, `batch_number`, `over_receipt_excess_qty`, `over_receipt_reason`, `over_receipt_by`.
- new table `grn_corrections` (id, grn_item_id, qty, reason, created_by, created_at).
- unique index `uq_grns_supplier_challan (supplier_id, challan_no)`.
