# Report 37 — frontend-dev

Challan date input now has `max={todayIso()}`. `todayIso()` changed from UTC to local date so early-morning IST users can still pick today. Server 400 already shows inline via existing `onError` (no change). tsc + lint clean. Not committed.

## Screens touched
- SCO detail page, Issue material dialog (roles that can issue material): Challan date field cannot pick a future date.

## Map updates
- Trap: `todayIso()` used UTC and would have set max to yesterday in IST early morning; now local date.
