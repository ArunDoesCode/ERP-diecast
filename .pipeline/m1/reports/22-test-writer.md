# Report 22 — test-writer — PR-S1 cancel tests

File: backend/src/routes/pr-cancel.test.ts (HTTP via createApp, real logins, 32 tests). Lint + typecheck clean.
Run: 8 pass, 24 fail. All 24 are FAIL-EXPECTED (cancel feature not built: no reason, no cancelledBy fields, no
PR_INVALID_TRANSITION / PR_HAS_ORDERED_LINES, no approval close). No FAIL-BUG found on built behaviour.

| BR | tests |
|---|---|
| BR-PR-43 / BR-KD-01, 02 | bad id, unknown id, soft cancel keeps row/number/lines, cancelled filter + details, read-only 409 PR_NOT_EDITABLE, PATCH status 400 PR_STATUS_VIA_ACTION |
| BR-PR-41 / BR-KD-06 | empty, spaces, 2 chars, 501 chars, missing body, 3 and 500 accepted |
| BR-PR-39 / BR-KD-03, 04 | approved+draft cancel lines too, rejected and cancelled 409 PR_INVALID_TRANSITION, live-PO line 409 PR_HAS_ORDERED_LINES naming PO, nothing changed |
| BR-PR-17, 45 / BR-KD-07 | other pr.manage 403 PR_NOT_REQUESTER, super-admin ok, 401, 403 PERMISSION_DENIED |
| BR-PR-46 / BR-KD-08 | cancelledBy/Name/At/Reason on getprdetails (per contract), super-admin recorded |
| BR-PR-42 / BR-KD-09, 13 | request cancelled, one trail row (actor = canceller, notes = reason), approve/reject later 409 APPROVAL_NOT_PENDING |
| BR-PR-47 / BR-KD-10 | double cancel (draft, pending), cancel vs submit, cancel vs edit, refused cancel writes nothing |

## Not covered
- BR-KD-16 (Cancel PR screen): UI rule, no frontend test tooling in scope; belongs in the manual checklist.
- BR-PR-42 "trail insert fails -> PR stays pending_approval": needs a production failure hook (known gap, per contract).
- BR-PR-46 for submit / PO-driven changes: out of PR-S1 contract.
- Header partial_ordered / fully_ordered cancel: only via the live-PO line case.

## Notes
- Test policy inserted directly at priority -90210 (pr/misc) so it beats seeded policies; removed in afterAll.
- Race tests assert invariants (one 200 + one 409, single trail row, no open request), not ordering.
- Assumptions from contract: DELETE body `{reason}`, response `data.pr`, cancel fields on getprdetails `data.pr`.
- No BRIEF-CONTAMINATION.
