# 56 — code-reviewer — procurement (saved by coordinator)

1 blocker, 3 major, 6 minor.

| id | sev | area | where | finding | fix |
|---|---|---|---|---|---|
| CRP-1 | blocker | frontend | PurchaseRequisitionModals.tsx:610 + purchase-requisitions/queries.ts:245 | edit payload sends `status` → backend 400 PR_STATUS_VIA_ACTION → PR edit unusable from UI | stop sending status (form schema, payload type); drop `status` from backend updatePrSchema |
| CRP-2 | major | backend | prService.ts:378-383 vs :449, prRepository.ts:598-617, poRepository.ts:283 | inconsistent lock order (= PERF-01/02) → deadlock 500 | PR header first everywhere; join lock `of: purchaseRequestItems` + orderBy |
| CRP-3 | major | backend | approvalService.ts:748-771 | approval `cancel` on a PR sets header cancelled via mirror only: no cancelledBy/At/Reason, pending lines stay pending (BR-PR-46) | route through prRepository.cancelPr in the same tx |
| CRP-4 | major | frontend+backend | PurchaseRequisitionModals.tsx:608-609, prService.ts:20,139 | edit resends unchanged assetId → 403 pr.link_machine for users without the key | backend: check only when assetId changes; frontend: send only when changed |
| CRP-5 | minor | backend | poRepository.ts (several) | repository throws HTTP AppErrors and duplicates assertEditable | service throws; repo returns sentinel |
| CRP-6 | minor | backend | prService.ts, prController.ts | `new AppError(…,404/400)` instead of NotFoundError/BadRequestError | use typed subclasses |
| CRP-7 | minor | backend | prController.ts:60-87, poController.ts:68 | cancel-reason parsing copy-pasted; PO uses raw JSON.parse → 500 on bad JSON | shared parseCancelReason, 400 on bad JSON |
| CRP-8 | minor | backend | poService.ts:194-205, 511-514 | free-text confirmationMethod silently → in_person; stale transitions table | enum confirmationMethod (400 unknown); trim table |
| CRP-9 | minor | backend | approvalService.ts:573-585, 341-355 | SCO submit no lock/re-check | add lock or backlog (M2) |
| CRP-10 | minor | backend | prService.ts, routes/approval.ts, prRepository.ts:655 | dead code, untyped changedItems, double requireAuth, auto-cancel sets no cancelledBy | clean up; document auto-cancel audit |
| CRP-n | note | frontend | PR fetchers types; line-cancel mutation invalidation | response types loose; header auto-cancel not reflected in approval screens until refetch | type + invalidate |
