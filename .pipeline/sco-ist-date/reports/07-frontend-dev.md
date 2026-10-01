# Report 07 — frontend-dev — CR-1 fix

Fixed CR-1: `formatScoDate` now formats in Asia/Kolkata (one line added: `timeZone: "Asia/Kolkata"`), so the day no longer shifts in a non-IST browser or UTC server render. `ist-date.ts` not changed (its helpers return ISO strings, not display format). `formatDaysLeft` is not a date helper; no other date helper in the file.

Checks: `bunx tsc --noEmit` clean, `bun run lint` clean.

## Screens touched
- Every SCO page that shows a date via `formatScoDate` (challan/order dates). Display only, no new buttons or fields.

## Map updates
- `formatScoDate` (frontend/src/lib/sco-format.ts) formats in IST regardless of browser zone.
