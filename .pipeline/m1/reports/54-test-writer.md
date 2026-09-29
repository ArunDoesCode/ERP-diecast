# Report 54 — test-writer
File: backend/src/routes/po-lifecycle.test.ts (only file changed)
- F-TEST-16: both approval_trails reads (BR-PO-11 cancel trail, BR-PO-21 trail) now ORDER BY id.
- PO-F2 / BR-PO-17: new test "confirm is a log row with who, when, channel and note" — RED (FAIL-EXPECTED): expects a `type: "confirmation"` row in GET /po/:id/communications with sentBy, sentAt, channel=phone, note.
- BR-PR-33: new describe "PR line cancel" (5 tests: pending cancel ok, po_draft/ordered 409 PR_LINE_ON_LIVE_PO, cancelled again 409, closed 409, short reason 400) — PASS.
- PO-F1 / BR-PR-46: test "line cancel stores who, when and the reason" — PASS against current code. It reads `item.cancelledBy / cancelledAt / cancelReason` from the cancel response (names copied from header fields; spec does not name line columns). It does not check the DB or a later GET, so a response-only implementation would pass.
- Run: 160 pass / 34 fail in the file; 33 failures are other tests, none in my groups except the confirm test. Lint clean on the file.
