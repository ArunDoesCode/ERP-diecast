---
module: grn
spec: docs/specs/grn.md (v1 frozen) + docs/specs/grn-stock.md (v1 frozen)
last_verified_commit: 1fe3cfd
last_verified_on: 2026-09-29
depends_on: [purchase-order, inventory, suppliers]
---

# GRN (Goods Received Note) — as-built map

> What the code **is** (the spec says what it **should be**). Agents read this before touching the module
> and only explore code changed since `last_verified_commit`
> (`git diff 1fe3cfd..HEAD --stat -- backend/src/service/grnService.ts backend/src/repository/grnRepository.ts backend/src/repository/stockPostingRepository.ts backend/src/routes/grn.ts backend/src/types/grn.types.ts frontend/src/lib/api/grn frontend/src/lib/grn-units.ts frontend/src/components/pages/grn frontend/src/components/views/grn`).
> Use symbol names, not line numbers — lines rot.

## Summary
GRN header + lines against a `dispatched`/`partial_received` PO, one QA decision per line (accept/reject
with accepted + rejected = arrived), QA bypass with reason, over-receipt override with reason, and
post-posting correction. Every posting (accept, bypass, correction) runs in **one transaction** through
`stockPostingRepository.postStock`, which also keeps item stock and moving average in step with the
ledger. All grn + grn-stock BRs are implemented and tested (`grnService.test.ts`, `stockPosting.test.ts`).

## Code locations
| Layer | Path | Key symbols |
|---|---|---|
| schema | `backend/src/db/schemas/02_procurement-purchasing.ts` | `grns` (unique `uq_grns_supplier_challan`), `grnItems`, `grnCorrections`, `qaTests`, `grnStatusEnum` (+ schema-only purchase return / invoice / payment / subcontracting tables) |
| types | `backend/src/types/grn.types.ts` | `createGrnSchema`, `updateGrnSchema`, `updateGrnLineSchema`, `grnQaActionBodySchema` (registered in manifest) / `grnQaActionSchema`, `grnBypassSchema`, `grnCorrectionSchema`, `grnDetailsSchema`, `qty3` (≤ 3 decimals, ≤ 1e9) |
| repository | `backend/src/repository/grnRepository.ts` | `createWithItems`, `findByChallan`, `lockGrnAndPo`, `lockDraftGrn`, `findGrnItemForUpdate`, `updateLineArrivedQty`, `insertQaTest`, `sumCorrections`, `findPostedRow`, `findLineUoms`, `getDetails`, `withTransaction` |
| posting | `backend/src/repository/stockPostingRepository.ts` | `postStock` (only stock-posting path), `rowValuePaise` |
| service | `backend/src/service/grnService.ts` | `create`, `update` (`applyDraftUpdate`), `remove`, `qaAction`, `bypass`, `correction`, `recomputeGrnHeaderStatus`, `mapChallanClash`, `WHOLE_NUMBER_UNITS` |
| PO hook | `backend/src/service/poService.ts` | `recomputeReceiptStatus` (both directions, BR-PO-10) |
| routes | `backend/src/routes/grn.ts` + `END_POINTS.grn` | guards = `requireRole(...)` with `// perm: grn.*` comments (auth session converts them) |
| frontend | `frontend/src/lib/api/grn/{fetchers,queries}.ts` (`invalidateGrnAndPO`, `usePoItemUoms`), `frontend/src/lib/grn-units.ts`, `frontend/src/lib/grn-permissions.ts`, `frontend/src/components/pages/grn/*`, `frontend/src/components/views/grn/*` | |

## Data model
- `grns`: `grnNumber` `GRN-<YYYY-MM>-<seq>` (`allocateDocumentSequence`, never reused), `poId`, `supplierId` (copied from PO), `status`, `receivedDate` (server time only), `challanNo` (required; unique per supplier), vehicle/driver fields.
- `grnItems`: `receivedQty` (= arrived), `acceptedQty` (never changed by corrections), `rejectedQty`, `qaStatus` (text: pending/passed/failed/waived), `isQaBypassed`, `qaBypassReason`, `qaBypassedBy`, `qaBypassedAt`, `batchNumber` (heat no.), `overReceiptExcessQty`, `overReceiptReason`, `overReceiptBy`.
- `grnCorrections`: one row per correction (line, qty, reason, who, when). Details expose `correctedQty` and `netAcceptedQty` = accepted − corrections.
- Ledger rows from GRN: accept → `grn`, bypass → `grn_bypass`, correction → `grn_correction` (type `adjustment`, −qty at the cost + location of the line's original posting). `referenceId` = GRN id, `referenceLineId` = GRN line id.

## API
| Method | Path | Roles (perm key) | Purpose |
|---|---|---|---|
| GET | `/api/grn/getgrns` | sa, ow, bo, fs, qa, dd (`grn.view`) | List, paginated |
| GET | `/api/grn/getgrndetails/:id` | same | Header + lines + corrected/net qty |
| POST | `/api/grn/creategrn` | sa, ow, bo, fs (`grn.edit_draft`) | Create draft |
| PATCH | `/api/grn/updategrn` | same | Edit draft (header, arrived qty, batch no.) |
| DELETE | `/api/grn/deletegrn/:id` | same | Delete draft |
| POST | `/api/grn/:id/lines/:lineId/qa` | sa, ow, bo, qa (`grn.qa_decide`) | Accept/reject (accepted + rejected qty) |
| POST | `/api/grn/:id/lines/:lineId/bypass` | sa, ow, bo (`grn.qa_bypass`) | Bypass with reason; optional smaller accepted qty |
| POST | `/api/grn/:id/lines/:lineId/correction` | sa, ow, bo (`grn.correct`) | Correction with reason |

Over-receipt override inside qa/bypass: sa, ow, bo (`grn.over_receipt_override`) + `overrideReason`.
Full shapes: `cd backend && bun --env-file=… run contract:query "<METHOD /path>"`.

## Key flows
- `create`: PO must be dispatched/partial_received (400) → each line on this PO, once, qty > 0, whole number for `WHOLE_NUMBER_UNITS` (unit from the PO line) → challan clash (409, also from unique index 23505) → `createWithItems`.
- `update` / `remove`: one tx; `lockDraftGrn` (GRN FOR UPDATE), re-check draft and every line pending, else 400 "use the correction".
- `qaAction` / `bypass`: one tx; `lockGrnAndPo` (GRN, then PO FOR UPDATE) → PO dispatched/partial_received (409) → `findGrnItemForUpdate` (line + PO line FOR UPDATE) → one decision per line (409) → accepted + rejected = arrived → over-receipt vs latest PO received qty (> ordered × 1.05 → 400 unless override key + reason; excess above 105% stored) → `postStock` → QA row / bypass info → PO received qty + `recomputeReceiptStatus` → `recomputeGrnHeaderStatus`. Full reject posts nothing and skips the PO check.
- `correction`: one tx; same locks → line passed/waived, qty > 0, reason, sum of corrections ≤ accepted (400) → PO not invoiced/closed (409) → `postStock` with `blockNegative` (409) at the original posting's cost/location, average via BR-GRN-39 → PO received qty down + status recomputed (can go back to partial_received or dispatched).

## Invariants & gotchas
- **Lock order everywhere: GRN header → PO row → GRN line + PO line → item row.** Keep it or postings can deadlock.
- Order ledger rows by `id`, never `createdAt` (created_at = tx start time, wrong under concurrency).
- `postStock` is the only way to change stock. Never write `itemMaster.currentStock` / `averageCostPaise` elsewhere.
- Ledger `unit_cost_paise` is int4 (cap 2,147,483,647); `total_value_change_paise` is bigint (number mode); a row value above `Number.MAX_SAFE_INTEGER` → 400.
- A body schema with `.transform()` shows as `body: unknown` in the manifest — register the pre-transform schema (`grnQaActionBodySchema`).
- Zod strips unknown keys; use `.strict()` where an extra key must be a 400.
- The frontend whole-number unit list (`grn-units.ts`) duplicates backend `WHOLE_NUMBER_UNITS` — change both (BL-043).
- Schema changes reach DBs only via `db:push` (no migrations yet, BL-011). Dev DB needs `db:push` after this batch (bigint column + 2 ledger indexes).

## Tests
| File | Covers |
|---|---|
| `backend/src/service/grnService.test.ts` | BR-GRN-01, 02, 04, 05, 06, 08, 09, 10, 12, 13, 15, 18, 19, 25, 27, 29, 34, 35 (HTTP via `createApp()`, `TEST_grn_` fixtures) |
| `backend/src/service/stockPosting.test.ts` | BR-GRN-21, 22, 24, 32, 33, 37, 38, 39, 40, 41, 42, 43, 44 |

## Known gaps / debt
- Schema-only, no code: purchase returns, supplier invoices, supplier payments, supplier bank details, subcontracting orders/GRNs.
- `grnItems.qaStatus` is free text, not a pg enum.
- `challanPhotoUrl` column unused (upload is "Not now").
- Frontend over-receipt warning ignores earlier receipts (BL-042); server enforces.
- Race tests for concurrent draft edit vs QA are not automated (non-deterministic); covered by locks + review.

## History
| Date | PR / commit | Change |
|---|---|---|
| 2026-09-27 | 0a406f4 | Initial as-built map written |
| 2026-09-29 | work/m1-stock 8cab134..1fe3cfd | grn + grn-stock v1 built: one-tx posting engine, challan rules, QA/bypass/over-receipt rules, corrections with PO roll-back, lock order, tests |
