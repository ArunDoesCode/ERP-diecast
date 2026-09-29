# Report 32 — spec-reviewer — subcontracting, full diff after fixes (BR-SCO-01..25)
Gate: spec v2 frozen OK. Round 1 fixes checked in commit 7d647ba (diff 5e5eca8..7d647ba). Tests not re-run by me (report 29: 1344 pass).

Round 1 spec items: SPEC-2 fixed (scoChallanService.ts:223, test scoChallan.test.ts:635 covers format only, not overflow). SPEC-5 fixed. SPEC-1/3/4/6 stay backlog/map-note/wont-fix per findings.md.

| id | sev | area | file:line | finding | fix |
|---|---|---|---|---|---|
| SPEC-7 | minor | backend | backend/src/service/scoReceiptService.ts:~458-465 | BR-SCO-14 after CR-1: issue cost now uses processed segments only. When processed pieces map to 0 raw pieces (send < return, e.g. 1:3, small processed qty; rawUsedFor rounds to 0) `settledQty` = 0, `issueCost` = 0, so the finished part is costed at service price only (casting cost lost). Before CR-1 it used all segments. | If `settledQty` is 0, fall back to the average over all settled qty (`r.qty`) for that line; add a test (ratio < 1). |
| SPEC-8 | minor | backend | backend/src/service/scoChallanService.ts:223-229 | BR-SCO-09 16-char limit throws 409 `SCO_CHALLAN_NUMBER_TOO_LONG`; spec gives no status for it. Only reachable at seq >= 10^6 per FY, no overflow test. | Accept 409 and note in map, or add a spec line; no code change needed. |
| SPEC-9 | minor | backend | backend/src/db/schemas/02_procurement-purchasing.ts:626 (`processed_qty` default 0) | Older `sco_receipt_settlements` rows pending QA would cost the finished part at 0 raw cost (same root as SPEC-7 after fix). Dev data only. | Map note; run a one-off backfill on dev if any pending-QA receipt exists. |

Focus checks (no finding):
- BR-SCO-17: receipt takes processed raw first, then unprocessed, both oldest-first via `takeFifo` over locked open challan lines (scoReceiptService.ts:89, 301-302); one settlement row per challan line, `processedQty` split recorded. Matches "Oct settled, Nov 100" example. Loss write-off raising challan settledQty is still SPEC-4 (map note).
- BR-SCO-14: raw out at issue cost, finished in main store at round(send x issueCost / ret) + service price, no GST (:512-526). Example 12,000 + 2,500 = 14,500 holds. Finished average per BR-GRN-38 via postStock.
- BR-SCO-09: `JWC/<FY>/<seq>`, length check inside the transaction, so a refusal rolls back and nothing posts. Company/HSN 400 checks unchanged. Removed `Math.round` on challan value is safe (integer qty x integer paise).
- BR-SCO-15/16/24/25: unchanged by fixes; posting re-order by item id (PERF-5) keeps all rows in one tx and the SCO lock first, so no rule impact.
- Scope creep: none. New indexes, `processed_qty`, `escapeLike`, `q` max 100 are internal, no new endpoint or status. SUBMIT_KEYS map in approvalService.ts does not change who can submit (sco.manage).

QUESTIONS: none
Verdict: READY (0 blockers, 0 major, 3 minor)
