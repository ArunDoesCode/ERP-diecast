---
module: dispatch
spec: docs/specs/dispatch/spec.md (v1, frozen)
last_verified_commit: d386e04
last_verified_on: 2026-11-21
depends_on: [sale-order, inventory, grn-stock, subcontracting, auth-setup]
---

# Dispatch (delivery note against a sale order) — as-built map

> What the code **is** (the spec says what it **should be**). Built on `feature/scm-rfq` inside epic `epic/scm`
> (run id `scm-dispatch`). Explore only code changed since `last_verified_commit`. Symbol names, not line numbers.

## Summary
A delivery note ships part or all of the open qty of a confirmed sale order. Draft → posted (or cancelled);
a posted note can only be cancelled (stock back) or get transport / e-way details added. Posting takes a
`DN/<FY>/<seq>` number, raises the SO lines' delivered qty through the sale-order hooks, closes the SO when
fully delivered, writes one ledger out row per line at average cost, and freezes price, GST, customer and
company snapshots. E-way flag: value incl. GST ≥ limit (same state: company setting, default ₹50,000; other
state: fixed ₹50,000). No invoice, no portal call. Full (BR-DSP-01..44; 37, 38 are screens with no automated test).

## Code locations
| Layer | Path | Key symbols |
|---|---|---|
| schema | `backend/src/db/schemas/06_dispatch.ts` (barrel `schemas/index.ts`) | `deliveryNotes`, `deliveryNoteLines`, `deliveryNotePackages`, `deliveryNoteTransportHistory`, enum `delivery_note_status`; `inventory_ref_type` + `delivery_note`, `delivery_note_cancel`; `company_settings.eway_intra_limit_paise` (`04_company.ts`) |
| migrations | `20261121111833_flat_yellowjacket/` (enum adds), `20261121111904_colorful_the_twelve/` (tables, indexes, checks), `20261121111910_empty_goblin_queen/` (e-way limit column + check) | |
| types | `backend/src/types/dispatch.types.ts` | create / update / transport / cancel bodies (all strict), pending / notes / history queries, transport normalisers (vehicle no, transporter id, e-way no); `sco.types.ts` history field enum + optional `ewayIntraLimitPaise` on the settings upsert |
| lib | `backend/src/lib/delivery-note-math.ts` | `computeNoteLine` (BigInt half-up), `computeNoteTotals`, `isEwayNeeded`, `EWAY_INTERSTATE_LIMIT_PAISE`, `ewayValidUntil` (e-way date + ceil(km/200) days, 23:59 IST), `isEwayExpired`, `toMilli` / `fromMilli` |
| repository | `backend/src/repository/deliveryNoteRepository.ts` | `findHeader`, `lockHeader`, `insertHeader`, `updateHeader`, `findEwayClash`, lines / packages / history CRUD, `findSoHeader`, `findSoLines`, `findCustomer`, `findCompany`, `findLocation`, `findDefaultSourceLocationId`, `lockItems` (id asc), `findLedgerRows`, `stockAtLocation`, `listActivity`, `listPending` + option queries, `listNotes`, `noteCustomerOptions`, `totalQtyByNote`, `findSoPickerHeader` |
| service | `backend/src/service/deliveryNoteService.ts` | `settings`, `pending`, `list`, `getDetails`, `transportHistory`, `create`, `update`, `cancelDraft`, `post`, `cancel`, `updateTransport`; helpers `buildDetail`, `refreshDraftAmounts`, `checkNoteAgainstSoLines`, `ewayAnswer`, `mergeTransport`, `validateTransport`, `assertEwayFree`, `mapEwayUnique`, `assertSourceLocation`, `resolveLines`, `resolvePackages`, `audit` |
| controller / routes | `controller/deliveryNoteController.ts`, `routes/deliveryNote.ts` (`dispatchRoutes`, mounted `/api/dispatch`), `END_POINTS.dispatch` | 11 routes |
| permissions | `lib/permissions.ts` | `dispatch.view`, `dispatch.manage` (ow, bo, fs), `dispatch.cancel` (ow); screens `delivery-notes-pending` (130), `delivery-notes` (135), group Dispatch |
| cross-module | `saleOrderService.applyDelivery` / `closeFullyDelivered` / `reopenAfterDeliveryCancel`, `saleOrderRepository.lockById` / `findAllLinesForUpdate`, `postStock`, `allocateFinancialYearSequence` (`delivery_note`), `salesAuditRepository` (`targetType` + `delivery_note`), `companySettingsRepository` (e-way history), `assetRepository.listInventoryMovements` (joins `delivery_notes`) | see `sale-order.md`, `inventory.md`, `subcontracting.md` |
| frontend api | `frontend/src/types/delivery-note.ts`, `lib/api/delivery-note/{fetchers,queries}.ts`, `lib/delivery-note-math.ts` (live hint), `API_ROUTES.dispatch` | `deliveryNoteKeys` {all, pending, settings, lists, list, detail, history}; post / cancel also invalidate `soKeys.lists/detail(soId)` and `["assets","stock"|"movements"|"reconciliation"]` |
| frontend ui | `app/(protected)/delivery-notes/` (register, `pending`, `new?so=&line=`, `[id]`, `[id]/edit`, `[id]/print`, loading, error); `components/views/delivery-notes/{PendingDispatchView, DeliveryNoteListView, DeliveryNoteFormView, DeliveryNoteDetailView, DeliveryNotePrintView, use-pending-controls, use-dn-controls}`; `components/pages/delivery-notes/{DeliveryNoteForm, DnLinesEditor, DnPackagesEditor, DnTransportFields, DnEwayHint, DnField, DnActionDialogs, DnDetailCards, DnSidePanels, DnPrintSheet, dn-format}` | status docs `dn`, `dnTag` in `status-tone.ts`; `hooks/use-min-width.ts`; `@page dn-print` in `globals.css`; nav icons + breadcrumbs (Dispatch > …) |
| frontend (other screens) | `SaleOrderDetailView` + `SoSidePanels.SoDeliveryNotesPanel` (Dispatch button, notes panel, DocumentFlow steps), `CompanySettingsForm` / history (e-way limit), `InventoryMovementsManager` + `types/asset.ts` (labels, links) | |

## Data model
- `delivery_notes`: `dnNumber` (null while draft; unique), `status` draft | posted | cancelled, `soId`, copied SO / customer / ship-to fields, company snapshot (null until post), `sameState`, `sourceLocationId`, `noteDate`, `taxablePaise` / `gstPaise` / `valuePaise` (draft = indicative, refreshed on each save; frozen at post), `ewayRequired` (as of last save / post), transport columns (mode, vehicle, transporter id / name, doc no / date, distance, e-way no / date), `remarks`, who / when for post, cancel (+ reason), create, last update. Unique partial index on `eway_bill_no` where not cancelled (cancel frees the number). Indexes: so, customer + date, date, status + date, partial e-way-missing (draft, required, no number), source location. Checks: mode, distance 1..4000, e-way no 12 digits.
- `delivery_note_lines`: `noteId`, `soLineId` (unique per note), `itemId`, `qty` numeric(14,3) > 0, `uom`, `deliveryDate`, `lotNo` (→ ledger `batch_number`), `hsnCode` (at post), price / GST / taxable / GST paise, `ledgerOutId` (post), `ledgerInId` (cancel).
- `delivery_note_packages`: `noteId`, `lineId`, `packageNo` (unique per note), qty, net / gross kg (gross ≥ net), `lotNo`.
- `delivery_note_transport_history`: one row per changed field after post (`field`, old, new (null = cleared), who, when).
- Audit: `sales_audit_log`, `targetType` `delivery_note`, `soId` set; actions `dispatch.create`, `dispatch.edit`, `dispatch.post`, `dispatch.transport`, `dispatch.cancel` (draft cancel and posted cancel both). The note's activity panel reads them (max 50, no prices).
- Ledger: `delivery_note` (out, `valueAtAverage`, notes = DN number), `delivery_note_cancel` (in at the out row's `unitCostPaise`); `referenceId` = note id, `referenceLineId` = note line id.

## API
Base `/api/dispatch`: GET `/pending` (view; open qty of confirmed SOs, `meta.customers` / `items` / `so`), GET `/settings` (view; e-way limit + plant state), GET `/notes` (view; register, filters date / customer / SO / status / `ewayMissing`), GET `/notes/:id` (view; detail = print data), POST `/notes`, PATCH `/notes/:id` (manage; draft), POST `/notes/:id/post` (manage), POST `/notes/:id/cancel-draft` (manage, reason), POST `/notes/:id/cancel` (`dispatch.cancel`, reason), PATCH `/notes/:id/transport` (manage; posted only), GET `/notes/:id/transport-history` (view). Price / tax / value fields are **absent** without `so.view`; `sortBy=valuePaise` without it = 400. No DELETE.
Changed: `PATCH /api/company/settings` takes optional `ewayIntraLimitPaise`; history field enum gained tolerance + e-way fields (`subcontracting.md`).
Full shapes: `cd backend && bun run contract:query "<METHOD /path>"`; run contract was `.pipeline/scm-dispatch/contract.md`.

Codes: 400 `DISPATCH_LINE_NOT_ON_SO`, `DISPATCH_OVER_OPEN_QTY` (on arrival), `DISPATCH_COMPANY_OR_HSN_MISSING`, `DISPATCH_PACKED_QTY_MISMATCH`, `DISPATCH_EWAY_REQUIRED`, `BAD_REQUEST`; 409 `DISPATCH_SO_NOT_CONFIRMED`, `DISPATCH_OVER_OPEN_QTY` (lost a race), `INSUFFICIENT_STOCK`, `DISPATCH_NOTE_STATUS`, `DISPATCH_EWAY_REUSED`, `DISPATCH_NOTE_FIELD_LOCKED`, `DISPATCH_SO_CLOSED_MANUALLY`; 403 `PERMISSION_DENIED`; 404.

## Key flows
- `create`: SO must be confirmed → note date (not future, not before SO date) → source location (default: active `finished_goods` lowest id, else main store; must be active, not virtual, not `vendor_premise`) → `resolveLines` (on this SO, once, ≤ open, whole qty for pcs / set) → packages → transport normalised + e-way no free → insert, price from SO, `ewayRequired` computed → audit.
- `update` (draft only; SO must still be confirmed): `lines` / `packages` replace all, `transport` merges key by key (`null` clears) → `refreshDraftAmounts` (live SO price, e-way flag) → audit with before / after.
- `post`: arrival checks without locks (400) → tx: SO `lockById` → `findAllLinesForUpdate` (id asc) → note `lockHeader` (draft guard) → SO confirmed → open qty re-check (409) → location, active items, company + HSN, packed qty = line qty, price + totals, e-way fields if required, e-way no free → `lockItems` (id asc) → DN number → `applyDelivery` per line (soLineId asc) → `closeFullyDelivered` → `postStock` per line (item, line order, `blockNegative`) + line frozen → header posted with snapshots → audit.
- `cancel` (posted; SO confirmed / on_hold / closed fully delivered): SO + lines locked → note locked → hand-closed SO → 409 `DISPATCH_SO_CLOSED_MANUALLY` → items locked → `applyDelivery` with negative qty → `reopenAfterDeliveryCancel` (`SO_CLOSED_BY_HAND` mapped to the dispatch code) → `postStock` in rows at the out cost → header cancelled → audit. Stock claims are not given back (A-57).
- `cancelDraft`: draft → cancelled with reason, no stock.
- `updateTransport` (posted): any `mode` key → 409 locked; e-way no / date / distance only once, together, while the number is empty; vehicle / transporter / doc fields may change or clear (road + e-way needed can't end with both vehicle and transporter id empty); equal values ignored; one history row per change + one audit row per request.

## Invariants & gotchas
- Lock order (A-66): SO header → SO lines (id asc) → note → items (id asc) → DN number → SO hooks → stock rows. The number comes before hooks and ledger so both carry it.
- Hooks take object arguments (A-65), see `sale-order.md`; dispatch pre-checks SO confirmed + open qty itself to return the spec's codes.
- E-way same / other state = company (plant) state vs SO ship-to state (else customer state). Plant state unknown → treated as other state (₹50,000) on a draft; post refused (A-68). E-way no without a date = 400 on drafts too (A-67).
- Draft edit of a non-confirmed SO is 409 `DISPATCH_SO_NOT_CONFIRMED` (BR-DSP-11, fix c7a5446) — the run contract still says "save still allowed"; the code wins.
- Cleared transport fields are stored as null (column nullable); transport history `newValue` is nullable in the API type.
- DN numbering: `allocateFinancialYearSequence(tx, "delivery_note", …)` by note date, format `DN/<FY>/<seq>` (e.g. `DN/26-27/1`).
- Frontend: `GET /pending` pageSize max 100, so the form lists the first 100 open lines of an SO. The transport PATCH form sends every key (empty = `null`). "Post note" saves first, then opens the Post dialog. Live e-way hint needs SO prices (`so.view`); without them the tag comes from the last save. BigInt literals fail tsc here: use `BigInt(n)`.
- Print is its own route, always light, A4; money absent from the HTML without `so.view`.

## Tests
| File | Covers |
|---|---|
| `backend/tests/routes/dispatch.test.ts` | BR-DSP-01..09, 11, 19, 20, 22, 23, 25, 26, 29, 33..36, 39, 40, 43 (pending, drafts, register, transport, permissions) |
| `backend/tests/routes/dispatchPost.test.ts` | BR-DSP-02, 03, 08..19, 21..24, 26, 28, 36, 41, 43, 44 (post, number, ledger, e-way, snapshots) |
| `backend/tests/routes/dispatchCancel.test.ts` | BR-DSP-12, 17, 25..27, 30..33, 35, 36, 42, BR-SO-18 (cancel, reopen, transport after post) |
| `backend/tests/service/saleOrderDispatchHooks.test.ts` | BR-SO-54, 55, 58 (hooks) |
| `backend/tests/lib/permissions.test.ts` | three keys, seeds, two screens |
Helper: `backend/tests/helpers/dispatchFixtures.ts` (`docs/testing/fixtures.md` §3c).

## Known gaps / debt
- BR-DSP-37 (Dispatch buttons) and 38 (SO screen qty + notes list) have no automated test; screens not checked in a browser by the build.
- Activity action labels on the frontend assume the five `dispatch.*` strings (they match the code); print footer "Page 1 of 2" is the browser's own.
- No invoice, no e-way portal call (out of scope v1).

## History
| Date | PR / commit | Change |
|---|---|---|
| 2026-11-21 | bb8cfe9..d386e04 | Map created: pending list, drafts, post through SO hooks (stock out, DN number, snapshots, e-way), cancel (stock back, SO reopen), transport history, audit to `sales_audit_log`, movements labels (CR-INV-1), e-way limit setting (CR-SCO-1), screens + SO Dispatch button / notes panel; fixes BR-DSP-11 edit guard, nullable cleared transport fields |
