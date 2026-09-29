# Report 13 — test-writer — TEST-3
- Cause: 6 tests made challans of Rs 72,000 (600 x 12,000) or more with no EWB; BR-SCO-10 needs one at >= Rs 50,000.
- Fix: added shared `EWB = { ewayBillNo }` and passed it in the affected challan calls (BR-SCO-07 x3, BR-SCO-08, BR-SCO-24 x2, plus the 500-qty call in the 400 test). Rule and expectations unchanged.
- File: backend/src/routes/scoChallan.test.ts. Result: 47 pass, 0 fail.
- No production bugs found. No BRIEF-CONTAMINATION.
