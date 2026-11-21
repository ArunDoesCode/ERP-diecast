---
module: rfq
spec: docs/specs/rfq/spec.md (v1, frozen)
last_verified_commit: 986ea76
last_verified_on: 2026-11-21
depends_on: [purchase-requisition, purchase-order, approval, suppliers, inventory, auth-setup]
---

# RFQ, supplier quotes, award and rate contracts — as-built map

> What the code **is** (the spec says what it **should be**). Built on `feature/scm-rfq` inside epic `epic/scm`.
> Explore only code changed since `last_verified_commit`. Symbol names, not line numbers.

## Summary
An RFQ asks 1–10 suppliers to quote for pending lines of approved PRs. Draft → sent; quotes are typed in
per supplier (draft → submitted), compared on read by landed rate, and lines are awarded: the award drafts
one PO per winning supplier through the shared PO draft (`poService.createDraftInTx`). Rate contracts fix a
supplier's rate + GST per item for a period (optional agreed qty + allowance); a usable contract wins the PO
rate chain, locks GST, and caps ordered qty at PO create / update / submit / last-level approve. Full
(BR-RFQ-01..57, 60, 61, 70..74). No e-mail: supplier sheets are printed.

## Code locations
| Layer | Path | Key symbols |
|---|---|---|
| schema | `backend/src/db/schemas/02_procurement-rfq.ts` (re-exported by `02_procurement.ts`) | `rfqs`, `rfqSuppliers`, `rfqItems`, `rfqQuotes`, `rfqQuoteItems`, `rateContracts`, `rateContractItems`; enums `rfq_status`, `rfq_line_status`, `rfq_quote_status`, `rate_contract_status` |
| schema (PO) | `02_procurement-purchasing.ts` `purchaseOrderItems` | `quoteItemId`, `contractItemId`, `contractRatePaise`, `rateOverrideReason/By/At`; `idx_po_items_contract_item`, `idx_po_items_quote_item` |
| migration | `backend/src/db/migrations/20261121092924_regular_barracuda/` | 7 tables, 4 enums, 6 PO line columns + 2 indexes |
| types | `types/rfq.types.ts`, `types/rateContract.types.ts`; `po.types.ts` (line `rateOverrideReason`, detail extras); `asset.types.ts` (`onDate`, source `contract`, `assetLastRatesQuerySchema`) | strict bodies; several checks left to the service so they carry a code |
| lib | `lib/rfq-math.ts` | `computeLinePaise` (moved here from `poService`, re-exported there), `landedRatePaise`, `pickLowest`, `contractCapQty`, `GST_SLABS`, `MAX_FREIGHT_PAISE` (1e12), `isRealDay`, `round3`, `percentOf`, `formatRupees` |
| lib | `lib/advisory-locks.ts` | `RFQ_CONTRACT_LOCK_NS` (7101) |
| repository | `repository/rfqRepository.ts` | `lockRfq`, `plainLines`, `detailedLines`, `openRfqForPrItems`, `listPrLines`, `listRfqs`, `listCounts`, quote readers/writers, `comparisonQuoteItems`, `markLinesAwarded` / `setPoItems` (one `UPDATE … FROM VALUES` each), `markLinesDropped`, `dropOpenLines`, `cancelDraftQuotes`, `markNotAwarded`, `contractRates`, `lastPoRates` |
| repository | `repository/rateContractRepository.ts` | `lockById`, `lockSupplierForActivation` (advisory), `findOverlap`, `fulfilmentByLine` (ordered/received over approved-or-later POs), `lockLinesForCap` (`FOR UPDATE OF rate_contract_items`, id asc), `contractLinesOfPo`, `list`, `lineSummaries` |
| repository | `repository/rateChainRepository.ts` | `findRateChoices` — the one rate chain (see `inventory.md`), `contractUsableOn(day)`, `APPROVED_OR_LATER_PO_STATUSES` |
| service | `service/rfqService.ts` | `prLines`, `list`, `details`, `create`, `update`, `send`, `cancel`, `close`, `print`, `quoteDetails`, `createQuote`, `updateQuote`, `submitQuote`, `cancelQuote`, `comparison`, `award`; helpers `lockPrLinesForRfq`, `ratesBesideLines`, `buildQuoteRows` |
| service | `service/rateContractService.ts` | `list`, `getDetails`, `create`, `update`, `activate`, `terminate`, `cancel`; `assertContractLines` (exported, used by `poService`), `assertPoContractsForSubmit`, `assertPoContractsForApprove`, `lockUsableContractLines` |
| controller / routes | `controller/rfqController.ts`, `routes/rfq.ts` (`/api/rfq`); `controller/rateContractController.ts`, `routes/rateContract.ts` (`/api/rate-contract`); `END_POINTS.rfq`, `.rateContract` | 16 + 7 routes; static paths registered before `/:id` |
| permissions | `lib/permissions.ts` | `rfq.view`, `rfq.manage`, `rfq.award`, `contract.view`, `contract.manage`, `contract.override_rate`; owner all six, back_office the first four. Screens `rfq` `/rfq` (172), `rate-contracts` `/rate-contracts` (173), group Procurement |
| cross-module | `poService.createDraftInTx` / `update` / `getDetails`, `approvalService.submitRequest` / `actOnRequest`, `assetService.getLastRate(s)` | see `purchase-order.md`, `approval.md`, `inventory.md` |
| frontend api | `lib/api/rfq/{fetchers,queries}.ts`, `lib/api/rate-contract/{fetchers,queries}.ts`, `types/rfq.ts`, `types/rate-contract.ts`, `API_ROUTES.rfq` / `.rateContract` | `rfqKeys` {all, lists, list, detail, prLines, quote, comparison, print}; `rateContractKeys` {all, lists, list, detail} |
| frontend ui (RFQ) | `app/(protected)/rfq/` (list, `new?pr=`, `[id]`, `[id]/edit`, `[id]/quotes/new?supplier=`, `[id]/quotes/[quoteId]`, `[id]/compare`, `[id]/print?supplier=`); `components/views/rfq/{RfqListView,RfqFormView,RfqDetailView,QuoteFormView,RfqCompareView,RfqPrintView,use-rfq-controls}`; `components/pages/rfq/{SupplierPicker,RfqLinePickerDialog,RfqDetailCards,QuoteLinesTable,quote-calc,CompareBlock,RfqPrintSheets}` | print page always light (`print-sheet-light`) |
| frontend ui (contracts) | `app/(protected)/rate-contracts/` (list, `new`, `[id]`, `[id]/edit`); `components/views/rate-contracts/{RateContractListView,RateContractFormView,RateContractDetailView,use-contract-controls}`; `components/pages/rate-contracts/ContractItemPicker` | activate / terminate / cancel on detail |
| frontend ui (shared / PO) | `components/shared/ReasonDialog`, `components/pages/purchase-orders/ContractRateControls`, `EditPOModal`, `PoDetailPanel`, `PurchaseOrderDetailView`, `PurchaseOrdersView` | "Request quotes", "On RFQ-…", contract badge + read-only rate/GST + override with reason, "Rate source" column; status tones rfq, quote, rfqLine, rfqFlag, contract; nav icons + nested breadcrumbs |

## Data model
- `rfqs`: `rfqNumber` `RFQ-<IST YYYY-MM>-<seq>` (counter `rfq`), `status` draft | sent | partially_awarded | awarded | closed | cancelled, `dueDate` (IST day), `notes` (internal, never printed), sent / completed (on awarded) / closed + reason / cancelled + reason, audit.
- `rfq_suppliers`: unique (rfq, supplier).
- `rfq_items`: one per PR line; `qty` = PR requested − issued at add time (never editable), `uom`, `lineStatus` open | awarded | dropped; award snapshot `awardedQuoteItemId` (no FK, circular), `poItemId`, `awardedBy/At`, `awardReason`, `awardLowestLandedPaise`, `awardChosenLandedPaise`, `droppedAt`. Partial unique `uq_rfq_items_open_pr_item` (one **open** RFQ line per PR line — BR-RFQ-02 in the DB); partial unique on `awardedQuoteItemId`.
- `rfq_quotes`: `quoteNumber` `SQ-<period>-<seq>` (counter `rfq_quote`), `status` draft | submitted | cancelled | not_awarded ("awarded" is derived from `rfq_items`), supplier ref, `quoteDate`, `validTill` (eligibility computed, never stored), `paymentTermsDays`, `isLate` (set at submit), submit / cancel audit. Partial unique `uq_rfq_quotes_live` (rfq, supplier) where draft/submitted.
- `rfq_quote_items`: one per RFQ line; `isQuoted` false → value columns null; `ratePaise`, `gstPercent`, `leadDays`, `freightPaise` (whole line), stored `lineValuePaise`, `lineTaxPaise`, `landedRatePaise` = rate + round(freight / qty).
- `rate_contracts`: `contractNumber` `RC-<period>-<seq>` (counter `rate_contract`), `status` draft | active | terminated | cancelled (`expired` computed: active and `validTo` < today), `validFrom/To`, `allowancePercent` (0–20, 2 dp), `terminatedOn` (usable through this day), audit.
- `rate_contract_items`: unique (contract, item); `uom` copy, `ratePaise`, `gstPercent`, `agreedQty` (null = rate-only, no cap).
- Usable on day D (`contractUsableOn`): status active or terminated, `validFrom` ≤ D ≤ coalesce(`terminatedOn`, `validTo`).
- Cap = `contractCapQty(agreed, allowance)` (floored to 3 dp). Ordered = sum of PO line qty on approved-or-later POs.

## API
RFQ base `/api/rfq`: GET `/pr-lines` (manage), GET `/getrfqs` (view; filters status, supplierId, from/to, `prId`; rows carry `createdByName`), GET `/getrfqdetails/:id` (view), POST `/createrfq`, PATCH `/updaterfq`, POST `/:id/send`, `/:id/cancel`, `/:id/close` (manage), GET `/:id/print` (view), GET `/quotes/:quoteId` (view), POST `/:id/quotes`, PATCH `/quotes/:quoteId`, POST `/quotes/:quoteId/submit`, `/quotes/:quoteId/cancel` (manage; submitted quote also needs `rfq.award` in the service), GET `/:id/comparison` (view), POST `/:id/award` (route guards `rfq.award` **and** `po.manage`).
Rate contract base `/api/rate-contract`: GET `/getcontracts`, `/getcontractdetails/:id` (contract.view); POST `/createcontract`, PATCH `/updatecontract` (full replace), POST `/:id/activate`, `/:id/terminate`, `/:id/cancel` (contract.manage).
Full shapes: `cd backend && bun run contract:query "<METHOD /path>"`; run contract with codes per endpoint was `.pipeline/scm-rfq/contract.md`.

Codes: 400 `RFQ_LINE_NOT_PENDING`, `ITEM_INACTIVE`, `SUPPLIER_INACTIVE`, `RFQ_DUE_DATE_PAST`, `RFQ_SUPPLIER_LIMIT`, `RFQ_DUPLICATE_ID`, `RFQ_EMPTY`, `SUPPLIER_NOT_ON_RFQ`, `QUOTE_LINE_INVALID`, `QUOTE_DATES_INVALID`, `QUOTE_EMPTY`, `AMOUNT_TOO_LARGE`, `AWARD_REASON_REQUIRED`, `CONTRACT_DATES_INVALID`, `CONTRACT_LINE_INVALID`; 409 `PR_LINE_ON_OPEN_RFQ`, `RFQ_NOT_EDITABLE`, `RFQ_INVALID_STATUS`, `RFQ_HAS_AWARD`, `RFQ_LINE_AWARDED`, `RFQ_LINE_STALE`, `SUPPLIER_INACTIVE_STALE`, `QUOTE_EXISTS`, `QUOTE_AWARDED`, `QUOTE_EXPIRED`, `QUOTE_NOT_EDITABLE`, `QUOTE_INVALID_STATUS`, `CONTRACT_NOT_EDITABLE`, `CONTRACT_INVALID_STATUS`, `CONTRACT_OVERLAP`, `CONTRACT_QTY_EXCEEDED`, `CONTRACT_NOT_ACTIVE`; 403 `PERMISSION_DENIED` (body `key`).

## Key flows
- Lock order everywhere (BR-RFQ-72): RFQ → quotes (id asc) → PR header → PR lines → contract lines (id asc) → document counters.
- `create` / `update` (draft only): suppliers active, `lockPrLinesForRfq` (PR line pending, PR approved / partial_ordered, qty left > 0, item active, not on another open RFQ); a unique violation on `uq_rfq_items_open_pr_item` maps to 409 `PR_LINE_ON_OPEN_RFQ`.
- `send`: draft → sent after re-reading PR lines under lock (`RFQ_LINE_STALE`) and suppliers (`SUPPLIER_INACTIVE_STALE`).
- Quotes: only on a sent / partially_awarded RFQ; one live quote per supplier; lines replaced on edit; `submitQuote` needs ≥ 1 priced line on a line still **open** (A-44), sets `isLate` = IST today > due date. `cancelQuote`: submitted needs `rfq.award` (checked before and again under lock); a quote with an awarded line → `QUOTE_AWARDED`.
- `comparison` (computed on read): cell state priced | not_quoted | no_quote | expired | inactive; eligible = priced + submitted + line open; `pickLowest` = lowest landed, then fewer lead days, then earlier submit. `lastPoRatePaise` / `contract` only for `po.manage` or `contract.view`.
- `award`: lock RFQ → validate lines (awarded → `RFQ_LINE_AWARDED`, dropped → `RFQ_LINE_STALE`) → lock quotes, PR lines → per pick: quote line belongs to the line, PR line still pending, supplier active, quote not expired, reason when not the lowest → group by supplier (id asc) → `rateContractService.lockUsableContractLines` per supplier → `markLinesAwarded` **before** the PO draft (so the open-RFQ check passes, A-42) → drop open lines whose PR line is cancelled → per supplier `poService.createDraftInTx` (quote rate + GST, `quoteItemId`, supplier's quote payment terms, freight written into PO notes; a usable contract overrides the quote rate with no override reason) → `setPoItems` → no open line left → `awarded` (+ remaining draft quotes cancelled, submitted ones `not_awarded`), else `partially_awarded`.
- `close` (sent / partially_awarded): open lines dropped, draft quotes cancelled, submitted → `not_awarded`. `cancel` (draft / sent only; partially_awarded → `RFQ_HAS_AWARD`): open lines dropped, draft + submitted quotes cancelled; submitted quotes present → needs `rfq.award` (A-48).
- Contracts: `create` / `update` (draft, full line replace) → `activate` (advisory lock per supplier, re-locked if the supplier changed after the pre-read; `validTo` ≥ today; `findOverlap` against active/terminated contracts sharing an item and dates → `CONTRACT_OVERLAP`) → `terminate` (active, not expired; `terminatedOn` today..validTo) / `cancel` (draft).
- `assertContractLines(tx, lines, {checkActive, poId?})`: locks contract lines, optional usable-today check (`CONTRACT_NOT_ACTIVE`), then ordered (excluding this PO) + wanted ≤ cap (`CONTRACT_QTY_EXCEEDED`). Called by PO create (checkActive), PO update (no active check), approval submit (checkActive), last-level approve (cap only, A-47).

## Invariants & gotchas
- BR-RFQ-02 is enforced twice: partial unique index on `rfq_items` and `poService.assertNoOpenRfq` (PO create / update inserts, re-checked under the PR line lock).
- An RFQ line stays `awarded` when its PO is cancelled (BR-RFQ-33); the PR line can then be ordered by hand. A PO line made by an award can't be removed from the draft PO (409 `PO_LINE_FROM_AWARD`, A-43).
- `quoteItemId` on a PO line is set only by the award; `createpo` / `updatepo` never accept it.
- Contract-linked PO line: GST is always the contract's (`CONTRACT_LINE_LOCKED_FIELD`); a different rate needs `contract.override_rate` (403 checked first) and a reason (`OVERRIDE_REASON_REQUIRED`). Award lines take the contract rate with no override.
- Rate visibility (BR-RFQ-56): last PO rate and contract rates only for `po.manage` or `contract.view`; override reason/by/at on PO details only for `po.manage`.
- Money cap is the app-wide 1e13 paise (A-41), freight 1e12; GST must be a slab of `GST_SLABS`.
- Numbers use the IST month (`istMonthKey`); PO numbers from the award use the PO counter as before.
- Award notes: one "Freight ₹… on <item> as per <supplier ref>" line per line with freight.
- `PurchaseOrderDetailView` is keyed by PR id: award toast links need the PR id from the RFQ lines.
- `rfqRepository.lastPoRates` (comparison column) is per item across suppliers — not the supplier rate chain.

## Tests
| File | Covers |
|---|---|
| `backend/tests/routes/rfq.test.ts` | BR-RFQ-01..11, 34..38, 70..73; A-46 (`createdByName`, `prId` filter) |
| `backend/tests/routes/rfqQuotes.test.ts` | BR-RFQ-12..24, 70..74; A-44 |
| `backend/tests/routes/rfqAward.test.ts` | BR-RFQ-08, 11, 12, 19, 25..39, 70..72; A-43, A-45 |
| `backend/tests/routes/rateContract.test.ts` | BR-RFQ-40, 41, 43..49, 52, 70, 71, 73, 74 |
| `backend/tests/routes/poContract.test.ts` | BR-RFQ-02, 45, 47, 48, 50..57, 71, 72, 74; A-46; batched last-rate endpoint |
| `backend/tests/lib/permissions.test.ts` | six new keys + seed grants |
Shared helper: `backend/tests/helpers/rfqFixtures.ts` (`makeRfqFx(tag)`), see `docs/testing/fixtures.md`.

## Known gaps / debt
- `rfqService.award` calls `rfqRepository.setPoItems(poLinks, tx)` twice in a row (harmless, redundant).
- No "RFQ · Awarded → PO" line in the PR flow after an RFQ ends; the PR page lists RFQs through `getrfqs?prId=`.
- Comparison `suppliers[]` names on the compare screen come from the details call; read-only quote view recomputes value/tax locally.
- Contract hint on the new-RFQ form is not shown (shown on edit only).
- BR-RFQ-42 (fixed rate per period) is a policy, no code; BR-RFQ-60/61 (screens, next-step buttons) have no automated test.

## History
| Date | PR / commit | Change |
|---|---|---|
| 2026-11-21 | df25886..986ea76 | Map created: RFQ, quotes, comparison, award via shared PO draft, rate contracts, PO/approval contract checks, single last-rate chain contract-first, batched last-rates endpoint; fixes A-43/44, CR-01..05, SEC-01/02, PERF-01/03 |
