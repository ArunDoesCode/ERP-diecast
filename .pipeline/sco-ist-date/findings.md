# Findings — sco-ist-date
| id | sev | decision |
|---|---|---|
| SPEC-1 | major | test change: backend/tests/routes/scoChallan.test.ts:764-783 asserts the omitted challan date equals the UTC day. Spec BR-SCO-09 v4: "Challan date can't be in the future (400); it defaults to today. 'Today' is the plant's calendar day in IST (Asia/Kolkata), the same on the server and in the date picker." → test must expect the IST day. |
| SPEC-2 | minor | decide after code review (formatScoDate uses browser zone, frontend/src/lib/sco-format.ts:59) |
| SPEC-3 | minor | spec status row + changelog — coordinator, docs step |
| SPEC-4 | minor | receipt-number period stays UTC → GitHub issue (not in spec v4 rules) |
