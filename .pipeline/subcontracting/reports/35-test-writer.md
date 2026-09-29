# Report 35 — test-writer — BR-SCO-09 (v3: challan date not in future)
File: backend/src/routes/scoChallan.test.ts (only file changed)
Run: 48 pass, 1 fail.

## Added
- FAIL-EXPECTED: "challan date in the future -> 400, nothing posts, no number burned" (+3 days returned 201; feature not built)
- PASS: "date of today / past date accepted; omitted defaults to today"

## Existing tests fixed (spec-driven: they used future dates, now invalid under v3)
- FY test: 31 Mar / 1 Apr 2033 -> 2026 (numbers 25-26 / 26-27)
- consecutive-number test: 2034-04-05 -> 2026-04-05
- BR-SCO-11 due-date test: 2026-10-01 -> 2026-06-01 (due 2027-06-01)

## Notes
- Spec example "1 Apr 2027 -> JWC/27-28/1" is a future date, so it can't be tested literally; FY boundary covered with past dates.
