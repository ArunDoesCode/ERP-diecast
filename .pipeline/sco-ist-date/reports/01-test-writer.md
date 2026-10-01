# Report 01 — test-writer — sco-ist-date

New file: `backend/tests/routes/scoIstDay.test.ts` (22 tests, 10 pass, 12 FAIL-BUG). No existing test edited. Not committed.
Also run with `TZ=America/Los_Angeles`: same result (10 pass, 12 fail).

Clock is moved with `setSystemTime` (bun:test); fixtures are made on the real clock, actors re-login after each clock move. Date-only inputs ("2026-10-01") = what a date picker sends.

## FAIL-BUG (code exists, uses the UTC day, violates v4)
| test | rule | suspect |
|---|---|---|
| 02:00 IST 1 Oct 2026, challan dated 1 Oct -> 201 JWC/26-27 | BR-SCO-09 | `backend/src/service/scoChallanService.ts:44-49` (`assertChallanDateNotFuture` uses UTC day) |
| same, timestamp 23:59 IST 1 Oct -> 201 | BR-SCO-09 | same |
| 00:30 IST 1 Apr 2027, challan dated 1 Apr -> 201 JWC/27-28 | BR-SCO-09 | same |
| challan 1 Oct 2026 return due 1 Oct 2027 | BR-SCO-11 | same (challan rejected) |
| challan 1 Oct 2026, 15 Aug 2027 -> 47 days, warning (SCO list) | BR-SCO-11 | same + days-left calc (not reached) |
| same via open-challans list | BR-SCO-11 | same |
| 0 days left on 1 Oct 2027, -1 / overdue next day | BR-SCO-11 | same |
| overdue challan blocks nothing | BR-SCO-11 | same (fresh challan dated 1 Oct rejected) |
| 02:00 IST 1 Oct 2026, expected return 30 Sep -> 400 (got 201) | BR-SCO-03 | `backend/src/service/scoService.ts` near "Expected return date cannot be before today" |
| expected return 1 Oct 2027 -> 201 (got 400, 366 days UTC) | BR-SCO-03 | same |
| expected return 23:59 IST 30 Sep -> 400 (got 201) | BR-SCO-03 | same |
| SCO at 23:00 IST 31 Mar vs 00:30 IST 1 Apr 2027: number periods differ (both "2027-03") | BR-SCO-01 | SCO number period uses UTC month/day |

## PASS (already correct, guard against regression)
- 02:00 IST: challan dated 2 Oct -> 400 `SCO_CHALLAN_DATE_FUTURE`, nothing posts.
- 02:00 IST: timestamp 00:00 IST 2 Oct -> 400 `SCO_CHALLAN_DATE_FUTURE`, nothing posts.
- 02:00 IST: empty date -> IST day 1 Oct, JWC/26-27.
- 00:30 IST 1 Apr 2027: empty date -> JWC/27-28 (IST day 1 Apr); dated 31 Mar -> JWC/26-27; dated 2 Apr -> 400.
- Expected return: today in IST ok; 2 Oct 2027 -> 400; 00:00 IST 1 Oct ok; missing -> 400.

## QUESTIONS
1. Existing `backend/tests/routes/scoChallan.test.ts:764-783` ("omitted defaults to today") asserts the default equals the **UTC** date (`new Date().toISOString().slice(0,10)`). Spec BR-SCO-09: "'Today' is the plant's calendar day in IST ... it defaults to today". Between 18:30 and 24:00 UTC this assertion contradicts the spec (flaky for the IST/UTC day gap). Needs a test-change request citing that rule; I did not touch it. The same file's lines 927-939, 941-954 use "about N days" ranges and stay valid.
2. Timestamp inputs (not date-only): I read a full timestamp as the IST day it falls in (e.g. `2026-10-01T18:30Z` = 2 Oct IST -> future). Spec says "calendar day in IST" so I took that; if you want timestamps compared as instants, say so (4 tests: 2 for SCO-03, 2 for SCO-09).
3. BR-SCO-01 test assumes the SCO number period changes between 31 Mar and 1 Apr (current period looks like `YYYY-MM`). The spec gives no period format; a spec line fixing it would make this test exact.

## Notes
- Fixtures `TEST_scoist_`, cleaned in `afterAll`; company_settings saved/restored; number counters are detached (not deleted) like the other SCO tests. Test DB gets counter rows for FY 27-28 / period 2027-03/04 (the existing challan test already does this for 27-28).
- `tests/` is not ordered with `--randomize`; clock is reset in `afterEach`.
