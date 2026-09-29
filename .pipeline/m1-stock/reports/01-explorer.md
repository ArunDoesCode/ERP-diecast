# Report 01 — explorer — GRN/stock code facts for BR specs

## Summary

All 10 questions answered with file + symbol pointers. Code is current to HEAD. No changes detected in mapped files since `last_verified_commit: 0a406f4`.

---

## Question-by-question findings

### 1. `assetRepository.createInventoryMovement`: signature, balanceAfter, locks, outer tx, callers

**File**: `backend/src/repository/assetRepository.ts:436–484`

- **Signature**: `async createInventoryMovement(input: assetInventoryMovementCreateSchemaType, actorId: number)`
- **balanceAfter computation** (line 460): `balanceAfter = previousBalance + input.quantityChange`. Previous balance read from most-recent ledger row for `(itemId, locationId)` or defaults to 0.
- **Locks**: Line 457 — `SELECT ... FOR UPDATE` on most recent row; prevents lost-update race. Known gap (map line 94): does not lock new item+location pairs (no prior rows).
- **Outer tx support**: **NOT supported**. Opens own transaction (line 445: `db.transaction(async (tx) => { ... })`). No `tx?` parameter.
- **Callers**: `grnService` (accept/bypass/correction) and direct manual posting route.

### 2. `itemMaster` columns, `inventory_ledger` columns, `grn_items` qty types

**File**: `backend/src/db/schemas/02_procurement-catalog.ts` + `02_procurement-purchasing.ts`

**itemMaster**: `currentStock` (doublePrecision), `averageCostPaise` (integer paise), `uom` (text)

**inventoryLedger**: `quantityChange` (doublePrecision), `balanceAfter` (doublePrecision), `unitCostPaise` (integer), `totalValueChangePaise` (integer), `notes` (text), `batchNumber` (text nullable). **NO `referenceLineId`**.

**grnItems**: `receivedQty` (doublePrecision), `acceptedQty` (doublePrecision), `rejectedQty` (doublePrecision, default 0).

### 3. `inventoryRefTypeEnum` + `inventoryTxTypeEnum` current values

**File**: `backend/src/db/schemas/02_procurement-catalog.ts:46–62`

**inventoryTxTypeEnum**: `"in"`, `"out"`, `"adjustment"`

**inventoryRefTypeEnum**: `"grn"`, `"grn_bypass"`, `"pro"`, `"sco_issue"`, `"sco_receipt"`, `"job_order_issue"`, `"scrap_dispatch"`, `"stock_adjustment"`

Only grn, grn_bypass, stock_adjustment are written by current code.

### 4. Item create/update Zod schemas: do they accept currentStock / averageCostPaise?

**File**: `backend/src/types/asset.types.ts:43–54` (create), `:78–109` (update)

Both `assetItemCreateSchema` and `assetItemUpdateSchema` **DO accept** `currentStock` and `averageCostPaise` (optional fields).

### 5. `POST /asset/inventory/movements` route: roles, validation, ref types

**File**: `backend/src/routes/asset.ts:219–231`

- **Roles**: super-admin, back_office (line 44)
- **Validation**: `assetInventoryMovementCreateSchema`
- **Ref types accepted**: all enum values (grn, grn_bypass, pro, sco_issue, sco_receipt, job_order_issue, scrap_dispatch, stock_adjustment)
- **No guard**: referenceId is bare int, no FK or document-existence check

### 6. `poRepository.incrementPoItemReceivedQty` + `poService.recomputeReceiptStatus`

**File**: `backend/src/repository/poRepository.ts:877–892`

**incrementPoItemReceivedQty**(poItemId, deltaQty, tx?): accepts optional tx, updates receivedQty by delta.

**File**: `backend/src/service/poService.ts:389–422`

**recomputeReceiptStatus**(poId, tx?): accepts optional tx, transitions to fully_received (all items received) or partial_received (any received). Does not transition backwards.

### 7. `grnService` create/qaAction/bypass/correction: schemas, responses, roles

**File**: `backend/src/types/grn.types.ts:44–157` (schemas)
**File**: `backend/src/routes/grn.ts:107–201` (requireRole per operation)

- **create**: floor_supervisor, back_office, owner, super-admin
- **qaAction**: qa_inspector, back_office, owner, super-admin
- **bypass**: floor_supervisor, back_office, owner, super-admin
- **correction**: back_office, owner, super-admin

### 8. How existing tests set up test DB, seed data, call HTTP app

**File**: `backend/src/app.test.ts` (HTTP pattern via `createApp().request(path)`)
**File**: `backend/src/repository/approvalRepository.test.ts` (real-DB pattern with named fixtures)

Tests use `beforeAll` to insert fixtures with name prefix, helpers like `roleId()` to look up seeded data, `db.insert().returning()` for fixture creation. Run against `diecast_test` DB.

### 9. Frontend GRN: line action components, role checks, inventory manual-movement

**File**: `frontend/src/components/pages/grn/GrnLinesTable.tsx`: renders Decide/Bypass/Correct buttons per line
**File**: `frontend/src/lib/grn-permissions.ts`: role helpers (canManageGrnDraft, canDecideGrnQa, canBypassGrnQa, canCorrectGrnLine, isExemptFromOverReceiptGuard)
**File**: `frontend/src/components/views/inventory/InventoryMovementsView.tsx`: inventory manual movement screen

### 10. Existing "period key" helper, does GRN numbering skip deleted sequences?

**File**: `backend/src/lib/document-number.ts:9–51`

**allocateDocumentSequence** (tx, docType, actorId): returns {periodKey, seq}
- periodKey format: `"YYYY-MM"` (e.g., "2026-09")
- GRN format: `"GRN-YYYY-MM-SEQ"` (e.g., "GRN-2026-09-1")
- Uses documentNumberCounters table with atomic INSERT ... ON CONFLICT DO UPDATE
- **Does NOT skip deleted sequences** — continues from last allocated counter

---

## Code areas likely to change for BR specs

1. assetRepository.createInventoryMovement — accept outer tx?
2. inventoryLedger schema — add referenceLineId
3. grnItems.qaStatus — become enum
4. assetItemCreateSchema — drop currentStock/averageCostPaise acceptance
5. POST /asset/inventory/movements — add owner role, mandatory reason
6. poService.recomputeReceiptStatus — handle reverse transition (fully_received → partial_received)
7. GRN bypass route — may drop floor_supervisor

---

## Key red flags

1. createInventoryMovement cannot compose with outer tx (non-atomic ledger + rollup in GRN)
2. POST /asset/inventory/movements fully open — no document-existence guard
3. itemMaster.currentStock/averageCostPaise never synced from ledger
4. qaStatus is free text, not enum
5. GRN line correction does not roll back PO.receivedQty

---

STATUS: DONE
