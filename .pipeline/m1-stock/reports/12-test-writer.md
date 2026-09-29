# Report 12 — test-writer — regression
Added 4 tests (2 files). Full run of both files: 131 pass, 3 fail (the 3 new red tests).

| test | result | file | matches finding |
|---|---|---|---|
| BR-GRN-05 edit draft to another GRN's challan (same supplier) -> 409, unchanged | FAIL-BUG (got 500) | grnService.test.ts | SPEC-2 / CR-1a |
| BR-GRN-06 batchNumber edited on draft line is saved | FAIL-BUG (not saved) | grnService.test.ts | CR-2 |
| BR-GRN-39 negative computed average -> average stays | FAIL-BUG | stockPosting.test.ts | SPEC-1 |
| BR-GRN-05 challan cannot be cleared on edit (400) | PASS | grnService.test.ts | - |

Not tested:
- SEC-1 / SPEC-3 (draft edit/delete race): needs concurrent calls; not deterministic here.
- SPEC-6 (negative opening_stock): spec BR-GRN-40 says only "opening stock goes in"; decision D-m1s-1 is not in docs/decisions.md or the spec. Rejecting a negative opening_stock is not stated in the spec. Add a rule to the spec and I will test it.

BRIEF-CONTAMINATION: none.
