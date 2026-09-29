# Report 47 — test-writer — PO + PR/PO link tests

File: `backend/src/routes/po-lifecycle.test.ts` (new, uncommitted; 187 tests, HTTP-level via `createApp()`, real DB + real logins).
Result on the tree as it stood at run time: **113 pass, 74 fail**. Lint + typecheck clean.
Spec-only: no service/repository/controller bodies read. (Test output printed some stack traces; not used to shape tests.)
BRIEF-CONTAMINATION: none.

## Coverage
BR-PO-01..09, 11..23 (all), BR-PR-25, 28, 30, 31, 33, 36. Per-BR test names start with the BR id.
BR-PO-10 skipped as briefed. Status/received-qty fixtures for later states (partial/fully_received, closed, invoiced) are set straight on the PO row; a "GRN exists" case is a raw `grns` draft row; past dates are written straight to the row.

## FAIL-BUG (code exists, rule violated; the split with FAIL-EXPECTED is my reading of contract A/B notes)
| id | test(s) | got | spec |
|---|---|---|---|
| TEST-1 | BR-PO-01 inactive supplier | 404 | 400 |
| TEST-2 | BR-PO-05/09/12 edit on pending/approved/dispatched/cancelled/closed PO (5 tests) | 400 | 409 `PO_NOT_EDITABLE` |
| TEST-3 | BR-PO-05 remove the only line | 200 | 400 |
| TEST-4 | BR-PO-11 cancel of partial_received | 200 | 409 |
| TEST-5 | BR-PO-11 cancel of fully_received / invoiced / closed | 400 | 409 |
| TEST-6 | BR-PO-11 cancel of an already cancelled PO | 200 | 409 |
| TEST-7 | BR-PO-14 close on closed PO | 200 | 400 |
| TEST-8 | BR-PO-15 invoice on an invoiced PO | 200 | 400 |
| TEST-9 | BR-PO-15 same invoice number + supplier twice | 200 | 409 |
| TEST-10 | BR-PO-16 delay on draft/approved/fully_received/closed/cancelled (5 tests) | 200 | 400 |
| TEST-11 | BR-PO-17 reminder/escalate/confirm on draft/approved/fully_received/closed/cancelled (5 tests) | 201 | 400 |
| TEST-12 | BR-PO-18 send with no expected date; create/edit with date before PO date; date re-check on send | 200/201 | 400 |

## FAIL-EXPECTED (contract says not built yet)
- 501 stubs: `POST /:id/short-close` (8 BR-PO-13 tests), `GET /:id/communications` (BR-PO-08 sent row, BR-PO-17 log order, BR-PO-21 log rows, BR-PO-22 send race).
- GST %: line `gstPercent/lineValuePaise/lineTaxPaise`, GST default from price list, totals with tax (6 BR-PO-04 tests, BR-PO-06 total-incl-GST band).
- Optional `unitPricePaise` on create (price-list default, BR-PO-03).
- Supplier default payment terms copied (BR-PO-23, 4 tests).
- PO row `cancelReason/cancelledBy/closedBy/invoicedBy` not returned (BR-PO-11 draft cancel, BR-PO-14, BR-PO-15, BR-PO-21 cancel).
- PR line effects: approve → `ordered`; PO cancel/reject → PR line `cancelled` + issuedQty drop; PR header recompute (BR-PO-07, BR-PO-11, BR-PR-30, 31, 33, 36; ~14 tests).
- Overdue uses revised date (BR-PO-19, 1 test: revised-in-future still listed).
- BR-PO-22 cancel/cancel race: fails because second cancel is 200 (see TEST-6).

## Passing already (behaviour correct)
Create/number/atomicity, duplicate + already-drafted line (incl. 409 `PO_LINE_ALREADY_DRAFTED` race), rate ≥ 1, qty ignored, submit by creator only, approval outcomes on the PO status, send rules (draft/email/channel), PO-20 auth matrix (401/403/super-admin for 14 endpoints), delete keeps row, overdue basics.

## Gaps / assumptions
- BR-PO-10, "new GRN after cancel/short-close → 400", "cancel vs GRN create at once": need GRN branch.
- BR-PR-33 "cancel an ordered line → 409 `PR_LINE_ON_LIVE_PO`": no line-cancel endpoint in the contract.
- BR-PR-32 (line closed by full receipt): GRN branch; short-close path covered.
- BR-PO-03 fallbacks after price list (last PO rate, avg cost, standard rate) belong to suppliers BR-SUP-16.
- Assumed: send-twice race loser is 409 (BR-PO-22) though a sequential second send is 400 (BR-PO-08); explicit `paymentTermsDays: 0` counts as typed; short-close stores who on `closedBy`; response fields `items[].qty/unitPricePaise/uom/gstPercent/lineValuePaise/lineTaxPaise`, `po.dueDate/shortClosed/cancelReason/cancelledBy/closedBy/invoicedBy` as in contract.
- `updatepo` tests send all four header fields (contract says optional; current schema requires them) so they test the rule, not validation. If the build keeps them required, the contract is wrong.
- Approval service auto-creates a "Fallback owner chain" policy owned by the acting user when nothing matches; cleanup removes policies by `createdBy` too.
- Worktree had uncommitted production edits by another agent (approval-fallback etc.) during the runs; one run failed on a missing module until they landed. Re-run after the backend slice is in.
- Test file comments list the fixture shortcuts.
