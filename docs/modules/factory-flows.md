---
module: factory-flows
spec: docs/specs/factory-flows/spec.md
last_verified_commit: 2a95ae7
last_verified_on: 2026-11-21
depends_on: [purchase-requisition, purchase-order, grn, approval, subcontracting, inventory, auth-setup, design-system]
---

# Factory flows — as-built map

> What the code **is**. Cross-cutting module: it adds pages, read-only endpoints and list fields on top of the
> procurement modules; it owns no tables and posts no stock.

## Summary
Role Home with work-queue tiles; real PR / PO / GRN pages with a side panel (totals, approvals, linked documents,
history) and next-step buttons; full-page PR / PO / receive forms; "Receive goods" from the GRN list with a PO
picker; approvals inbox with a preview pane; fuller lists with summary strips. Full; built 2026-11-21.

## Code locations
| Layer | Path | Key symbols |
|---|---|---|
| migration | `backend/src/db/migrations/20261120175722_factory_flows_menu_indexes/` | screens default (guarded on old seed values), 4 indexes |
| screens | `backend/src/lib/permissions.ts` | `SCREENS.home` (no key), labels/order/groups General + Admin |
| home counts | `backend/src/{routes/home.ts, controller/homeController.ts, service/homeService.ts, repository/homeRepository.ts}` | `getCounts`, `getTileCounts` (one `count(*) filter` per table), `TILE_KEYS` |
| side panel | `backend/src/{routes/document.ts, controller/documentController.ts, service/documentService.ts, repository/documentRepository.ts}` | `getPanel` (access first, history ≤ 200 + `historyTruncated`) |
| approval read | `backend/src/service/approvalService.ts`, `repository/approvalRepository.ts` | `assertCanReadRequest({viaApprovalOnly})`, `resolveDocReadAccess`, `getDocumentView`, `findLatestApprovalByDoc` |
| receiving | `backend/src/{service/grnService.ts, repository/grnRepository.ts}` | `listReceivablePos` (no money columns) |
| shared SQL | `backend/src/repository/{openQty.ts, poPredicates.ts}`, `backend/src/lib/{grn-qa-summary.ts, ist-day.ts}` | BR-FF-09 open qty, BR-PO-19 Late, BR-FF-115 QA summary, `istDayBoundsOfKey` |
| lists | `prRepository.list`, `poRepository.list`, `grnRepository.list`, `scoChallanRepository` | `mine`, `toOrder`, `bucket`, csv `status`, `meta.statusCounts` |
| frontend api | `frontend/src/lib/api/{home,document,approval,grn,purchase-orders,purchase-requisitions}/` | `homeKeys`, `documentKeys`, `grn/keys.ts`, `purchase-orders/keys.ts` |
| frontend ui | `app/(protected)/{home, approvals/[docType]/[docId], purchase-requisitions/{new,[prId],[prId]/edit}, purchase-orders/{[poId],[poId]/edit}, grn/{receive,new,[grnId]}}` | `HomeView`, `ApprovalPreviewPane`, `PurchaseRequisitionPageView`, `PurchaseOrderPageView`, `GrnReceivePickerView`, `GrnReceiveFormView`, `DocumentSidePanel`, `TwoPaneLayout`, `StatCard` `split` |

## Gotchas
- Timestamp columns bucket on the IST day via day-start / next-day-start instants; never `col::date` (BR-FF-08).
- Late for POs is frozen BR-PO-19 (`poPredicates.ts`), not BR-FF-09 open qty (A-54).
- `suggestedRatePaise` only for `po.manage` (PO pricing).
- Read via approval: access check before any lookup; same 403 for missing and forbidden ids.
- `/purchase-orders/<id>` is a PO id now; `/purchase-orders/tracking` redirects.
- Invalidate `homeKeys`, `grnKeys.receivable()`, `documentKeys` after every PO/GRN/approval mutation (BR-FF-07).
- `contract:generate` / tests need `bun --env-file=../.pipeline/test.env` in a worktree.

## History
| Date | Change |
|---|---|
| 2026-11-21 | Built (epic/factory-flows, D-040, D-041). |
