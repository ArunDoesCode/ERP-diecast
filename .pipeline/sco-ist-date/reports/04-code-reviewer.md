# 04 — code-reviewer — sco-ist-date (BR-SCO-01, 03, 09, 11)

Result: backend IST logic is correct. One real gap on screen (date display zone), two minors.
Checked: window bounds (0..365), future-date check, FY edge (IST midnight 1 Apr), due date (bare date, 29 Feb), days-left SQL (timestamp::date minus text::date), number period, pickers.

| id | severity | area | file:line | finding | suggested fix |
|---|---|---|---|---|---|
| CR-1 | major | frontend | frontend/src/lib/sco-format.ts:59-66 | `formatScoDate` uses `toLocaleDateString` with no `timeZone`, so it shows the viewer's zone, not IST. Challan date saved from the dialog is IST midnight (`2026-09-30T18:30Z`); a challan saved with the date left empty is `new Date()`. Viewer or SSR in UTC (or any zone west of IST): 1 Oct IST shows "30 Sep 2026", while the due date (bare date, 00:00Z) shows 1 Oct 2027 and days-left is IST-based. Screen disagrees with spec "same on screen". Same for the printed challan date (ChallanDetailView:81). | Add `timeZone: "Asia/Kolkata"` to the options. Right for all three value kinds: bare date 00:00Z = 05:30 IST same day, IST midnight, full timestamp. |
| CR-2 | minor | backend | backend/src/repository/scoRepository.ts:268-272 | Passes `new Date()` only to reach the new positional `periodKey`, then calls `istMonthKey()` with a second clock read. At an IST month rollover the two reads can differ (harmless today, since `now` is only used for `lastUpdatedAt`), but the API invites period/`now` mismatch. | `const now = new Date();` once and pass `now, istMonthKey(now)`. Or make the 4th arg an options object. |
| CR-3 | minor | backend | backend/src/service/scoChallanService.ts:29-32 | `todayKey()` is a one-line wrapper around `istDayKey()`, used 4x. | Call `istDayKey()` directly and delete the wrapper. |

Not findings (checked):
- `istDaysBetween` rounds a whole-day difference of two UTC-midnight dates; no DST in IST, so exact.
- Upper bound `daysAway > 365` matches spec (365 ok, 366 rejected); old code was equivalent for bare dates.
- `addOneYear` now uses the IST day, so `returnDueDate` is a bare date and `::date - ::date` is correct (old code stored `…T18:30Z`, which read as the day before). Spec example 47 days holds.
- FY: `financialYearOf` already adds +330 min; IST-midnight challan on 1 Apr 2027 gives 27-28. Consistent with the new IST day.
- Pickers: `min`/`max` and the validation use `istTodayIso`; local-time `todayIso` is gone from SCO screens. `new Date("YYYY-MM-DD")` bare dates still go to the backend as midnight UTC = same IST day.
- Out of scope, left as UTC: `createdFrom/createdTo` filters (`endOfDayBound`) are timestamp filters, not an SCO "today" rule. Other doc types keep the UTC month (default unchanged).
