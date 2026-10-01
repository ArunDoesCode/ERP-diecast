# Report 02 — backend-dev — sco-ist-date

Done. `scoIstDay.test.ts` 22/22 green (also under `TZ=America/Los_Angeles`). Full `bun test` 1368 pass / 0 fail; typecheck clean; lint 0 errors (260 pre-existing warnings, none in touched files).

## Changes
- `backend/src/lib/ist-day.ts` (new): `istDayKey`, `istMonthKey`, `istDayStart`, `istDaysBetween` — Intl `Asia/Kolkata` only, no dependency.
- `backend/src/service/scoChallanService.ts`: `todayKey()` -> IST day (feeds days-left in all 4 challan reads); `assertChallanDateNotFuture` compares IST days; `addOneYear` works from the challan's IST day (due date is a bare date).
- `backend/src/service/scoService.ts`: `assertReturnDateInWindow` uses IST days (0..365 away); removed unused `DAY_MS`.
- `backend/src/lib/document-number.ts`: `allocateDocumentSequence` got an optional 5th param `periodKey` (default = old UTC month, so PR/PO/GRN unchanged).
- `backend/src/repository/scoRepository.ts`: SCO number passes `istMonthKey()`.

## Deviations / notes
- `scoRepository.ts` is outside the brief's "May edit" glob (`service/sco*.ts`, `lib/**`) but the SCO number is allocated there; 1 import + 2 lines. Needed for BR-SCO-01.
- 5 files, ~30 changed lines (within size).
- Not changed (out of size/scope): SCO receipt number (`SCO-GRN-<period>`, `scoReceiptService.ts:241`) still uses the UTC month. Spec v4 says "number period" generally; coordinator to decide whether to follow up (same 2-line change).
- Not changed: `endOfDayBound` in scoRepository (UTC `createdTo` list filter, not an SCO "today").
- Frontend files seen modified in the worktree are not mine.

## Map updates
- New `backend/src/lib/ist-day.ts` — the one place for IST calendar-day logic; use it for any new SCO date rule.
- `allocateDocumentSequence(tx, docType, actorId, now, periodKey?)`: period defaults to UTC month; SCO passes IST month.
- Trap: a bare date ("2026-10-01") parses as 00:00 UTC = 05:30 IST same day, so it reads as that day; full timestamps map to the IST day they fall in. Challan `returnDueDate` is stored as 00:00 UTC of the IST due day so SQL `::date` days-left is correct.
- Open: SCO-GRN number period still UTC month.
