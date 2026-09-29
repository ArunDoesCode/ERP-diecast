# Report 02 — explorer — subcontracting feature reuse points

## Question 1: Stock posting service

**Service/function:** `postStock()` in `backend/src/repository/stockPostingRepository.ts:56`

**How it posts inventory_ledger rows:**
- Posts to `inventory_ledger` table via Drizzle insert (line 106-123)
- Called by GRN accept flow and other stock movements
- Requires transaction context (Tx parameter)

**BR-GRN-33 (no negative balance per item+location):**
- `blockNegative` parameter (line 33) — when true, throws `ConflictError` if balance would go negative (line 98-99)

**BR-GRN-38/39 (moving average):**
- Weighted moving average calculation (lines 131-149)
- `averageEffect` parameter (line 34) controls how the posting affects average:
  - `"in"`: weighted into average (default for positive qty)
  - `"out_at_cost"`: value removed at unitCostPaise (GRN correction)
  - `"none"`: average untouched (default for negative qty)
- Updates item's `averageCostPaise` after calculating new weighted average (lines 131-153)

**Transfer posting (two rows, item total/average unchanged):**
- Yes, can post two rows: issue at location A (negative qty) and receipt at location B (positive qty) in same transaction
- Use `averageEffect: "none"` on both rows to keep item's overall average unchanged (line 34)

**"main_store" location resolution:**
- `grnRepository.findDefaultReceivingLocationId()` at `backend/src/repository/grnRepository.ts:123`
- Finds first active `main_store` location by id order (line 127)
- Throws `NotFoundError` if none configured (line 132-134)

**`sco_loss` in inventoryRefTypeEnum:**
- YES — present at `backend/src/db/schemas/02_procurement-catalog.ts:91`
- Also includes `sco_issue` and `sco_receipt` (lines 84-85)

## Question 2: Document numbering

**File:** `backend/src/lib/document-number.ts:9`

**Function:** `allocateDocumentSequence(tx, docType, actorId, now?)`

**Current implementation:**
- Format: `<docType>-<YYYY-MM>-<seq>` (line 17, 244)
- Uses upsert on `documentNumberCounters` table with never-rolled-back counter (line 19-39)
- Returns `{ periodKey: "YYYY-MM", seq: number }`
- Called by: `grnRepository.ts:239`, `poRepository.ts` (PO numbering), `prRepository.ts` (PR numbering)

**What's needed for SCO:**
- `allocateDocumentSequence(tx, "sco", actorId)` → produces `SCO-YYYY-MM-<seq>`
- `allocateDocumentSequence(tx, "sco_grn", actorId)` → produces `SCO-GRN-YYYY-MM-<seq>`

**FY-based `JWC/<FY>/<seq>` (Job Work Challan):**
- NOT YET IMPLEMENTED
- Would require different periodKey logic (FY-based year, e.g., "2025-26" for Apr 2025–Mar 2026)
- Needs modification to `allocateDocumentSequence` or new function

## Question 3: Approval workflow hooks

**Approval module functions:**

- `submitApprovalRequest()` → `approvalService.ts:336` (submit for approval, creates request)
- `actOnApprovalRequest()` → `approvalService.ts:692` (approve, reject, send_back, withdraw actions)
- `findDocumentContext()` → `approvalRepository.ts:106-167` (fetch doc summary + matching policy)

**Mirror update functions:**
- `updatePoApprovalMirror()` → `approvalRepository.ts` (updates PO with approval fields)
- `updateScoApprovalMirror()` → `approvalRepository.ts` (updates SCO with approval fields)
- Called after each approval action (lines 570, 587, 593 in approvalService.ts)

**How PO submit/approve/reject/send-back/withdraw/cancel hook in:**
- `poService.create()` → calls `approvalService.submitApprovalRequest()` if approval needed (BR-APR-10)
- `approvalService.actOnApprovalRequest()` → updates mirror via `updatePoApprovalMirror()`
- State transitions flow through `approvalRequests.status` (pending_approval → approved/rejected/require_more_info)

**SCO branch today (from map):**
- Amount hard-coded to 0 in `fetchDocSummaries()` (line 165)
- Category is "any" in `findDocumentContext()` (map says "category any, amount 0")
- `updateScoApprovalMirror()` exists but updates status only (map says "status only")
- BL-065: no row lock on submit (mentioned in map as known gap)

## Question 4: PO module as pattern to copy

**Backend layers:**

| Layer | File | Key symbols |
|---|---|---|
| Routes descriptor | `backend/src/routes/end-points.ts:86-101` | `po: { list, details, create, update, remove, send, reminder, escalate, delay, confirm, invoice, close, shortClose, communications }` |
| Routes | `backend/src/routes/po.ts` | Mounts poController methods at END_POINTS paths |
| Controller | `backend/src/controller/poController.ts:28-175` | `details, list, create, update, remove, markSent, reminder, escalate, updateDelay, confirmSupplier, markInvoiced, close, shortClose, communications` |
| Service | `backend/src/service/poService.ts` | Business logic: `list, getDetails, create, update, cancel, markSent, logReminder, escalate, updateDelay, confirmSupplier, markInvoiced, close, shortClose, communications` |
| Repository | `backend/src/repository/poRepository.ts:147+` | DB access: `list, findById, create, update, findByNumber, transaction` patterns |
| Zod types | `backend/src/types/po.types.ts` | `createPoSchema, updatePoSchema, poListQuerySchema, markPoSentSchema, logPoCommunicationSchema, closePoSchema, shortClosePoSchema, confirmPoSchema, markPoInvoicedSchema` |
| Error helpers | `backend/src/lib/errors.ts` | `BadRequestError, UnauthorizedError, NotFoundError, ConflictError, AppError` |
| Permissions/roles | `backend/src/lib/permissions.ts:127-149` | `po.view, po.manage, po.approve, po.send, po.receive` permission keys; used in `requireRole` middleware |
| Audit trail | `approvalRepository.ts`, `grnService.ts` | Approval history tracked in `approvalTrails` (docType, docId, level, action, actor, timestamp) |

**Frontend pattern:**

| Layer | Path | Pattern |
|---|---|---|
| Page | `frontend/src/app/(protected)/purchase-orders/page.tsx` | List page with sidebar nav, filters, pagination |
| Detail page | `frontend/src/app/(protected)/purchase-orders/[prId]/page.tsx` | Detail view layout |
| View (main component) | `frontend/src/components/views/purchase-orders/PurchaseOrdersView.tsx` | Container for list/queue/tracking views, state management |
| Detail view | `frontend/src/components/views/purchase-orders/PurchaseOrderDetailView.tsx` | Full detail with tabs (items, communications, approval history) |
| Page components | `frontend/src/components/pages/purchase-orders/*Modal*.tsx` | Modals: `EditPOModal.tsx, ConfirmPoDialog.tsx, ShortClosePoAlert.tsx, ClosePoAlert.tsx, etc.` |
| View hooks | `frontend/src/components/views/purchase-orders/use-po-*.ts` | `use-po-queue-controls.ts, use-po-tracking-controls.ts` — state + handlers |
| Queries/fetchers | `frontend/src/lib/api/purchase-orders/` | `queries.ts` (useQuery hooks), `fetchers.ts` (raw fetch functions) |
| API routes | `frontend/src/lib/api/routes.ts:11+` | Maps `API_ROUTES.po.*` to backend paths |
| Screens nav | `backend/src/lib/permissions.ts:SCREENS` | `po_list, po_details` entries in SCREENS; must add role grants |

## Question 5: Suppliers

**Supplier schema fields** (`backend/src/db/schemas/02_procurement-suppliers.ts`):

- `supplierMaster.type` → `supplierTypeEnum`: `"raw_material"`, `"consumables"`, `"service_provider"`, `"both"`
- `supplierMaster.isActive` → boolean (line 20)
- `supplierServices` table (line 70+): `serviceUnitPricePaise`, `taxPercentage` (default 18%)
- `serviceMaster.isActive` → boolean flag on service master

**GSTIN:**
- `supplierMaster.gstNumber` field exists

**Item HSN:**
- NOT PRESENT in `itemMaster` schema — map notes this as a gap (BR-SCO-09)

**Company/plant GSTIN + state:**
- NOT FOUND in schema — no company/organization settings table exists
- Map notes: "plant GSTIN / state has no home (company settings)" (line 35 in module map)
- Needed for SCO/challan generation (rule 55 requires GSTIN, state on challan)

## Question 6: Test helpers

**Fixture/factory location:** `backend/scripts/db-reset-fixtures.ts`

**Contents:**
- Item definitions: ITEMS array (SKU, name, category, UOM, rate in paise)
- Supplier definitions: SUPPLIERS array (name, type, GSTIN)
- Demo users: creates employees with roles (owner, back_office, floor_supervisor, qa_inspector, die_designer)
- Creates approval policies, purchase requests, POs, GRNs via real services
- Stock arrives only through GRN postings (no direct stock setting)

**Bootstrap/setup:** `backend/scripts/bootstrap-admin.ts`
- Creates initial admin user and company structure

**Test database prep:** `backend/scripts/prepare-test-db.ts`
- Sets up test DB with schema + seed data

**Approval test helpers:** `backend/src/repository/approvalRepository.test.ts:36-90`
- Inline helper functions: `roleId(name)`, `requireId(row, what)`
- Creates fixture roles, employees, policies inline in beforeAll hook

## Question 7: Scenario test folder layout

**Current state:** No `backend/src/scenarios/**` directory exists yet

**Expected pattern (from map notes):** Should mirror GRN/PO test layout but at module level
- Likely would be `backend/src/scenarios/subcontracting/` or similar
- Tests would combine multiple services to verify end-to-end workflows
- Not yet designed; awaiting spec freeze

## Summary of reuse points

| What | Where | Pattern to copy |
|---|---|---|
| Stock posting (inventory_ledger) | `stockPostingRepository.ts:postStock()` | Call from accept flow, pass `blockNegative: true, averageEffect: "in"` |
| Document numbering | `document-number.ts:allocateDocumentSequence()` | Add docType "sco", "sco_grn" calls; FY logic not yet implemented |
| Approval submit | `approvalService.ts:submitApprovalRequest()` | Called post-create in service; amount/category from doc context |
| Approval accept/reject | `approvalService.ts:actOnApprovalRequest()` | Calls mirror update per action |
| PO mirror pattern | `approvalRepository.updatePoApprovalMirror()` | Model for `updateScoApprovalMirror()` implementation |
| Backend routes stack | `routes/po.ts`, `controller/poController.ts`, `service/poService.ts`, `repository/poRepository.ts` | Copy structure; adjust entity names |
| Frontend flow | `components/views/purchase-orders/*` → modals + detail view | Reuse nav sidebar, query hooks pattern |
| Test data | `scripts/db-reset-fixtures.ts` | Add SCO suppliers, items, policies to fixture seed |

## Map edits needed

Per brief scope (map-first): confirm if map `last_verified_commit: 5bbfd58` covers these findings:
- `stockPostingRepository.ts` is new since last verified commit — postStock function added
- `updateScoApprovalMirror()` exists and is stubbed
- FY-based document numbering (`JWC/<FY>/<seq>`) not yet implemented (confirmed in code)
- Item HSN field missing (confirmed in schema inspection)
- Company settings (plant GSTIN/state) still missing (confirmed, no table exists)
- `sco_loss` already in `inventoryRefTypeEnum` (confirmed at line 91)

