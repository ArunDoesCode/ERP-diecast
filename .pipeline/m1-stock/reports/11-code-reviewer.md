# Report 11 — code-reviewer (saved by coordinator; agent has no write tool)
FINDINGS: 0 blocker, 3 major, 3 minor

| id | severity | area | file:line | finding | suggested fix |
|---|---|---|---|---|---|
| CR-1 | major | backend | grnService.ts:238-300 `update`; grnRepository.ts:365-390 | BR-GRN-05 challan check missing on update → 23505 → 500; header + line writes not in one tx (partial write on bad line id) | findByChallan excl. own id + 23505 → ConflictError (shared helper); one tx |
| CR-2 | major | backend | grnService.ts:292-300; grnRepository `updateLineArrivedQty`; grn.types.ts:83-85 | `batchNumber` accepted on draft edit but never saved → BR-GRN-21 traceability | persist batchNumber (null clears) |
| CR-3 | major | frontend | lib/api/grn/queries.ts:202-224; lib/api/asset/queries.ts:170-183 | correction doesn't invalidate GRN list/PO; no GRN/movement mutation invalidates items (stock/avg stale) | use invalidateGrnAndPO in correction; invalidate items + movements keys |
| CR-4 | minor | frontend | CreateGrnModal.tsx:21 | whole-number units ["pcs","set"] ≠ backend (pcs, set, sets, nos); edit/QA/bypass use step="any" | shared constant, apply in all modals |
| CR-5 | minor | frontend | GrnCorrectionAlert.tsx:70-75 | max correctable shown but not enforced | max + disable submit |
| CR-6 | minor | backend | grnRepository.ts:402-455 getDetails | corrections sum read outside item query snapshot | optional single query |
