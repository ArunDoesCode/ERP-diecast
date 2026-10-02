# Report 03 — frontend-dev — IST day in SCO date pickers
Result: DONE. tsc + lint clean.

- New helper `frontend/src/lib/ist-date.ts`: `istTodayIso()` (Intl en-CA, Asia/Kolkata), `istMidnightIso(d)` -> `${d}T00:00:00+05:30`.
- IssueMaterialDialog: challan date default + max use `istTodayIso()`; sent as `istMidnightIso`.
- EnterReceiptDialog: default uses `istTodayIso()`; sent as `istMidnightIso`. No new future-date rule.
- ScoForm: expected-return `min` and the "before today" check use `istTodayIso()` (dropped the inventory-format `todayIso` import).

## Screens touched
- SCO detail: Issue material dialog (Challan date field: default/max = IST today) — roles that can issue material.
- SCO detail: Enter receipt dialog (Received date default = IST today; sent as IST midnight).
- SCO create/edit form (Expected return date: min = IST today).

## Map updates
- New lib helper `src/lib/ist-date.ts`; SCO dialogs no longer define local `todayIso`.
- Trap: the receipt dialog used `toISOString().slice(0,10)` (UTC date) and both dialogs converted via browser-local midnight.
- Not touched: other modules (`inventory-format` / PR `todayIso`) still use browser-local date.
