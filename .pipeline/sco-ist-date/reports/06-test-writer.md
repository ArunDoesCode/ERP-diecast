# Report 06 — test-writer — SPEC-1 test change
- Changed: backend/tests/routes/scoChallan.test.ts (test "BR-SCO-09 challan date of today is accepted; a past date is accepted; omitted defaults to today").
- Omitted-date assertion now compares the IST day (UTC+05:30) of the returned challanDate with the IST day of now, instead of the UTC day. Spec rule: BR-SCO-09 v4.
- Run: `bun test tests/routes/scoChallan.test.ts` 49 pass, 0 fail. Biome clean.
- Note: the logged "Insufficient stock" AppError in the output is from an existing negative-path test, not a failure.
- Edge: if run within a ms of IST midnight the two clocks could differ by a day (negligible).
