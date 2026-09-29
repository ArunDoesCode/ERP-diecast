# Report 36 — test-writer — suppliers BR-SUP-01..25

File: `backend/src/service/supplierService.test.ts` (56 tests, HTTP via createApp, real DB, TEST_sup_ fixtures). Result: 33 pass, 23 fail. Typecheck ok, lint no new errors.

## FAIL-EXPECTED (S11-S12 not built)
- BR-SUP-01: duplicate name create/rename returns 500, not 409
- BR-SUP-02: blank GSTIN saved as "" not null
- BR-SUP-03: duplicate GSTIN 500, not 409
- BR-SUP-04: PAN not filled from GSTIN; update with mismatching PAN accepted (200)
- BR-SUP-09: cleared email saved "" not null
- BR-SUP-10: no history rows written (supplier, item, service); GET history 501
- BR-SUP-11/18/22: duplicate price-list row 500, not 409 "Already on this supplier's price list"
- BR-SUP-14: uom "ton" on kg item accepted (201)
- BR-SUP-15/16: last-rate still uses an inactive price-list row
- BR-SUP-19..21: batch edit returns 200 for bad rows, no BATCH_FAILED / summary / all-or-none
- BR-SUP-23: q does not match GSTIN part (and possibly other columns/SKU-case)
- BR-SUP-24: status filter ignored

## FAIL-BUG vs contract
| id | file | finding |
| --- | --- | --- |
| TEST-1 | createSupplier controller/service | 201 `data` is `{ supplier, supplierItems }`; contract.md says `data = supplier row`. Test "contract: createSupplier 201 data is the supplier row" fails. Other tests tolerate both shapes. |

## Not covered (PO code, other session)
BR-SUP-06 PO copies terms, BR-SUP-07 new PO/SCO for inactive supplier (400), BR-SUP-16 po_history and pr_estimate sources. BR-SUP-25 tests assert status 403 only (code becomes PERMISSION_DENIED on merge with work/m1).
Note: test contract section lists no `type`/`defaultPaymentTermsDays` requirement; manifest shows them "required" in the response schema only.

BRIEF-CONTAMINATION: none.
