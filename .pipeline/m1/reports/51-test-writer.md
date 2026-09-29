# Report 51 — test-writer — F-TEST-15

Fixed `act` helper in backend/src/routes/approval-requests.test.ts: now uses `...rest: [notes?: string]`.
Argument omitted -> default "TEST_aprreq note"; explicit `undefined` -> no `notes` field sent.

- BR-APR-37 tests (no comment / "" / "   " on approve, reject, sent_back; reject; send back): PASS.
- typecheck, biome: clean.
- File total: 59 pass, 5 fail. Failures are all PO-related, not touched here:
  BR-APR-43 (2), BR-APR-47 (2, PO edit lock), BR-APR-48 (1, PO cancel). PO stays `po_draft` / not cancelled. Likely FAIL-BUG or unbuilt PO hooks in approval (BR-APR-43/47/48).
