# Report 11 - backend-dev - S2 implement (challan)
BLOCKED: 6 of 47 tests contradict BR-SCO-10. 41 pass. Implementation is otherwise complete; not committed.

## Blocker
Spec BR-SCO-10: e-way bill number required when "the challan value is >= Rs 50,000". The tests themselves fix the unit as paise (`4999 x 1,000 paise = Rs 49,990` -> no EWB; `5000 x 1,000` = exactly Rs 50,000 -> EWB). Under that rule these tests must get 400 (EWB_REQUIRED), but they expect 201 with no `ewayBillNo`, local registered vendor:
| test (scoChallan.test.ts) | qty x cost | value |
|---|---|---|
| BR-SCO-07 first challan of 600 (l.395) | 600 x 12,000 | Rs 72,000 |
| BR-SCO-07 second challan of 400 (l.411; its first 600) | 600 x 12,000 | Rs 72,000 |
| BR-SCO-07 issued 600, then 500 -> 400 (l.427; its first 600) | 600 x 12,000 | Rs 72,000 |
| BR-SCO-08 600 out (l.538) | 600 x 12,000 | Rs 72,000 |
| BR-SCO-24 last 400 race (l.965; its first 600) | 600 x 12,000 | Rs 72,000 |
| BR-SCO-24 two full-qty first challans (l.983) | 1000 x 12,000 | Rs 120,000 |
Cause: fixture cost `12_000` paise is too high (spec example "@ 12,000" reads as rupees per unit, or the fixture should pass `ewayBillNo`). Rule quoted: BR-SCO-10 "the challan value is >= Rs 50,000".
Recommendation: fix the tests (test-writer): use cost <= 1,000 paise where no EWB is meant, or send `ewayBillNo`. Do not change the rule.

## What was built
- `lib/document-number.ts`: `financialYearOf` (Apr-Mar, IST), `allocateFinancialYearSequence` (counter `docType sco_challan`, periodKey `27-28`; rolled back with the tx so a refused challan burns no number).
- `repository/scoChallanRepository.ts`: challan/line queries, open list (SQL days-left vs JS today, filters vendor/sco/dueStatus, sort), item lock in id order, vendor location `ensureVendorLocation` (`vendor_premise`, virtual, insert `onConflictDoNothing` + re-select), main store, `addIssuedQty`.
- `service/scoChallanService.ts`: create (one tx: unlocked status + arrival check -> 400; lock SCO; status + re-check -> 409; company settings/HSN 400; EWB rule 400; number; challan + lines; two `sco_issue` ledger rows per line via `postStock`, `averageEffect: none`, out row `blockNegative` -> 409; `issuedQty` up; SCO -> `material_issued`), listBySco, listOpen, getPrintData (company, vendor, declaration "Goods sent for job work u/s 143, no tax charged.").
- No route/schema/contract changes (contract:check ok, 103 routes). No db push needed.
- Checks: typecheck pass; lint 0 errors (259 pre-existing warnings); full `bun test` 1252 pass / 6 fail (the six above); contract:check pass.

## Map updates
- Files: `repository/scoChallanRepository.ts`, `service/scoChallanService.ts`, FY numbering in `lib/document-number.ts`.
- Ledger `sco_issue` rows: `referenceId` = challan id, `referenceLineId` = challan line id.
- Vendor location name `<vendor name> (job work)`, `isVirtual` true; name clash with an unrelated location -> 409 `VENDOR_LOCATION_CONFLICT`.
- Trap: unit is paise everywhere; a fixture with average cost >= 1,000 paise x 50+ pcs crosses the Rs 50,000 EWB line.
- Trap: 400 (over qty on arrival) is checked before the SCO lock, 409 after it; keep both.
- daysLeft = calendar-day diff (UTC) between due date and today; warning 0..60, overdue < 0.
