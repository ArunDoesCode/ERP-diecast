# Report 04 — test-writer — S1 tests
File: backend/src/routes/sco.test.ts (HTTP level via createApp; TEST_sco_ fixtures, cleaned in afterAll). 55 tests.
Result: 9 pass (403/401 paths), 46 FAIL-EXPECTED (handlers return 501 NOT_IMPLEMENTED). No FAIL-BUG.
Covered: BR-SCO-01..05, 06 (submit creator-only, double submit), 20, 21 (no delete route), 23.
Notes:
- BR-SCO-21 challan delete not testable in S1 (no challan endpoint); tested SCO delete is refused.
- BR-SCO-20 "issued -> 409" puts fixture into material_issued by direct DB update (no challan endpoint yet).
- BR-SCO-06 approve/reject/send-back is approval.md territory, not covered here; submit asserts pending_approval OR approved (depends on seeded policy).
- Approval matching on incl-GST total (BR-SCO-04) asserted only via totalAmountPaise 2,950,000, not via policy matching.
