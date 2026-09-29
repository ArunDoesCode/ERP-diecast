# Report 03 — test-writer — GRN tests
File: backend/src/service/grnService.test.ts (75 tests, HTTP via createApp, real DB, TEST_grn_ fixtures). Run: 48 pass, 27 fail. typecheck clean; biome only non-null warnings.
Covers BR-GRN-01,02,04,05,06,08,09,10,12,13,15,18,19,25,27,29,34,35.

## FAIL-BUG / FAIL-EXPECTED (code exists; violates spec or handler not updated)
- BR-GRN-01: accept/bypass on cancelled PO returns 400, spec says 409 (PO-state check in qa/bypass path).
- BR-GRN-02: duplicate poItemId in one GRN accepted (201); fractional qty for pcs item accepted (201).
- BR-GRN-05: duplicate supplier+challan gives 500 (raw unique-index error), spec says 409.
- BR-GRN-09: concurrent double accept/bypass not serialized (fails).
- BR-GRN-10 / 12 / 13 / 29 / 34 / 35, BR-GRN-15 with reason / bypass over tolerance: handlers still on old body shape (acceptedQty+rejectedQty, no `decision`), correctedQty/netAcceptedQty absent from details, correction returns error "not posted" / no 409 on closed/invoiced PO.
- BR-GRN-15: over tolerance by back_office with no overrideReason returns 200, spec says 400; concurrent 2x600 not blocked.
Most of these = slices S1-S5 not landed yet (FAIL-EXPECTED); 01, 02, 05 are true bugs in existing code.

## Notes
- Setup assumes a `main_store` location exists; creates one if missing and removes it after.
- Cleanup detaches document_number_counters rows from the fixture employee (never deletes counters: BR-GRN-04).
- Roles tested via signed tokens (userId = fixture employee), no DB user lookup needed.
