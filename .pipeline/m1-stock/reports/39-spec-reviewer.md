# Report 39 — spec-reviewer, suppliers (saved by coordinator)
Verdict: READY. Gate ok; BR-SUP-01..24 enforced + named tests. FINDINGS: 0 blocker, 0 major, 5 minor
| SPEC-40 | minor | test | supplierService.test.ts:306 | BR-SUP-08 shares a test with 07 | optional own test |
| SPEC-41 | minor | spec | supplierService.ts:134-142 | history also tracks sku/qty/uom/lead time (superset of BR-SUP-10) | list tracked fields at next spec touch |
| SPEC-42 | minor | spec | supplierService.ts:187-188, 571-573 | single-row edit unknown row → 404 (spec: "row fails") | note in spec |
| SPEC-43 | minor | frontend | SupplierMasterModal.tsx:196 | changing GSTIN with a stale stored PAN → 400; modal fills PAN only when blank | refill PAN when GSTIN changes |
| SPEC-44 | minor | contract | contract.md errors | PAN mismatch message differs from contract ("Validation failed") | update contract.md |
