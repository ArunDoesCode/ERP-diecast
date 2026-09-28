---
module: purchase-requisition
status: draft            # draft | frozen | changed-after-freeze
version: 0
frozen_on:
owner: Arun
depends_on: [approval, purchase-order, grn, inventory]
---

# Purchase Requisition (PR)

## Summary
A PR is the internal request to buy: a supervisor or clerk says what is needed (ingot, die spares, steel,
PPE), how much and why. It is approved on an estimated value, then purchase puts its lines on POs.
Done on the floor = every line ends `closed` (ordered and received) or `cancelled`, and each line can be
traced to its PO and GRN. A PR never moves stock, never has GST, and never creates a PO itself.

## Who can do what
| Action | Allowed |
|---|---|
| view, create | super-admin, owner, back_office, floor_supervisor (others 403) |
| edit, submit, cancel | owner, super-admin, back_office: any PR. floor_supervisor: own PRs only (Q3) |
| withdraw from approval | requester |
| approve, reject, send back | the approval chain (`docs/specs/approval.md`) |
| put a line on a PO | PO module only (`docs/specs/purchase-order.md`) |

## Flow
Header:
| From | Action | To | Rule |
|---|---|---|---|
| — | create | draft | BR-PR-01 |
| draft | edit | draft | BR-PR-15 |
| draft | submit | pending_approval, or approved if policy auto-approves | BR-PR-19 |
| pending_approval | approve (not last level) | pending_approval | BR-PR-21 |
| pending_approval | approve (last level) | approved | BR-PR-21 |
| pending_approval | reject | rejected (final) | BR-PR-21 |
| pending_approval | send back, or requester withdraws | draft | BR-PR-21 |
| approved, partial_ordered, fully_ordered | a line changes status | worked out from lines | BR-PR-36 |
| draft, pending_approval, approved, partial_ordered | cancel | cancelled (final) | BR-PR-39 |

Line:
| From | Action | To | Rule |
|---|---|---|---|
| — | line added (header draft) | pending | BR-PR-06 |
| pending | put on a PO | po_draft | BR-PR-25 |
| po_draft | linked PO approved | ordered | BR-PR-30 |
| po_draft, ordered | PO line deleted, PO cancelled or rejected | pending | BR-PR-31 |
| ordered | PO line fully received, or PO short-closed | closed (final) | BR-PR-32 |
| pending | PR cancelled, or line cancelled on its own | cancelled (final) | BR-PR-33, BR-PR-39 |

A link (`pr_po_item_links`) is **live** while its PO is not cancelled and the PO line still exists.
Links to cancelled POs stay for history.

## Rules
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-PR-01 | Create saves header and all lines in one transaction as `draft`, `requestedBy` = logged-in user, number `PR-{periodKey}-{seq}` from the shared sequence. Numbers are unique and never reused. | Two creates at once → different numbers. Line 2 has a bad item → 400, no rows saved |
| BR-PR-02 | Header checks: `type` is required. `maintenance` needs an `assetId` (on create, and when edited to maintenance). Any `assetId` must exist in machines. `notes` (purpose) can't be empty. `saleOrderId` is stored as sent, unchecked, until M4. | maintenance, no asset → 400. assetId 999999 → 400 `Invalid assetId`. notes "" → 400. saleOrderId 42 → saved |
| BR-PR-06 | Each line item must exist and be active. `uom` is always copied from the item master (client value ignored). One line per item per PR, on create and after edit. | Inactive item → 400 `PR_INVALID_ITEM`. Client sends pcs for a kg item → saved kg. Item A twice → 400 `PR_DUPLICATE_ITEM` |
| BR-PR-08 | `requestedQty` must be > 0 with at most 3 decimals (Q1). Optional required-by date per line; if given it can't be before today when saved (assumed). | Qty 0, −5 or 1.2345 → 400. 12.5 kg → ok. Date yesterday → 400 |
| BR-PR-11 | Estimate = round(Σ qty × item average cost), integer paise. Recomputed on every line change and again at submit, before the approval policy is picked (assumed). After submit it never changes. How average cost is kept is owned by the GRN spec. | Costs 25000 and 1050 paise, qty 10 and 3 → 253150. Qty 3 → 4 → 254200. Cost rises after approval → estimate unchanged |
| BR-PR-14 | A line whose item has average cost 0 is flagged `noCostHistory` and the screen warns. Submit is still allowed (Q2). | Avg cost 0 → flag true, submit ok |
| BR-PR-15 | Header and lines can change only in `draft` (else 409 `PR_NOT_EDITABLE`). Edit can't set `status` (400 `PR_STATUS_VIA_ACTION`) and can't leave zero lines (400 `PR_MIN_ONE_LINE`). | Pending PR, change notes → 409. PATCH `status: cancelled` → 400. Delete the only line → 400 |
| BR-PR-17 | floor_supervisor may edit, submit or cancel only own PRs. owner, super-admin, back_office may act on any PR (Q3). Otherwise 403. | Supervisor B edits A's draft → 403. back_office edits it → 200 |
| BR-PR-19 | Submit only from `draft` with at least 1 line. Policy is matched on type + estimate (approval spec). Result `pending_approval`, or `approved` with `approvedBy` = submitter if the policy auto-approves. Second submit while a request is open → 409 `APPROVAL_ALREADY_OPEN`. | 2-level policy → pending, 2 levels. Approved PR submitted → 409 |
| BR-PR-21 | Approval outcomes: approve at a middle level → stays pending, level copied. Last level approves → `approved`, `approvedBy` = that approver. Reject → `rejected`, final; raise a new PR (assumed). Send back, or requester withdraws → `draft`; resubmit starts at level 1 (withdraw → draft assumed). | Level 1 approves → pending at level 2. Rejected, then edit or submit → 409. Withdraw → draft, request cancelled |
| BR-PR-25 | A line goes on a PO only if the line is `pending` and the header is `approved` or `partial_ordered` (any type, subcontracting too (assumed)). The whole remaining qty goes to one PO line, no split or part qty (Q4). Same transaction: line → `po_draft`, `issuedQty` += qty (stays between 0 and requested qty), link saved. Line is row-locked; a second attempt at the same time → 409 `PO_LINE_ALREADY_DRAFTED`. | Line 100 → PO line 100, issuedQty 100. PR pending_approval → 400. Two POs at once → one gets 409 |
| BR-PR-28 | The PR module never creates, edits or cancels PO rows. All PR↔PO writes happen inside the PO module's transaction. | PR cancelled → no PO row touched |
| BR-PR-30 | When the linked PO becomes `approved` (auto-approve too), its `po_draft` PR lines become `ordered` in the same transaction (Q5). | PO-1 approved → line ordered |
| BR-PR-31 | When the linked PO line is deleted, or the PO is cancelled, or its approval is rejected or cancelled, the PR line goes back to `pending` and `issuedQty` drops by the linked qty, same transaction. | PO-3 rejected → line pending, can go on a new PO |
| BR-PR-32 | A line becomes `closed` when its PO line is fully received (accepted ≥ PO qty) or its PO is short-closed. Short qty is not put back on the PR (Q6). A part receipt leaves it `ordered`. | 60 of 100 kg → ordered. +40 → closed. PO closed at 60 → closed, issuedQty stays 100 |
| BR-PR-33 | A `pending` line can be cancelled on its own while the header is `approved` or `partial_ordered` (Q7). `closed` and `cancelled` lines never change again. A `po_draft`/`ordered` line can't be cancelled from the PR (409 `PR_LINE_ON_LIVE_PO`). A line that isn't `pending` can't be edited or deleted. | Pending L2 cancelled → cancelled. Ordered line cancel → 409. Closed line put on a PO → 400 |
| BR-PR-36 | After any line change on an `approved`/`partial_ordered`/`fully_ordered` PR, the header is worked out over non-cancelled lines: all `pending` → approved; all `po_draft`/`ordered`/`closed` → fully_ordered; else partial_ordered; every line cancelled → cancelled. Never runs on draft, pending_approval, rejected or cancelled. `fully_ordered` can move back only through this rule. | 1 of 3 on a PO → partial. All 3 → fully. One PO cancelled → partial. Cancelled PR, its PO cancelled → stays cancelled |
| BR-PR-39 | Cancel allowed from draft, pending_approval, approved, partial_ordered; else 400 `PR_INVALID_TRANSITION`. Refused with 409 `PR_HAS_ORDERED_LINES` if any line is `po_draft`, `ordered` or `closed` (Q7). On success the header and all pending lines → cancelled, one transaction. | fully_ordered → 400. One po_draft line → 409. All lines pending → all cancelled |
| BR-PR-41 | Cancel needs a non-empty reason unless the PR is `draft` (400 `PR_CANCEL_REASON_REQUIRED`). Reason, who and when are saved. | Approved, no reason → 400. Draft, no reason → 200, cancelledBy set |
| BR-PR-42 | Cancelling a `pending_approval` PR also cancels its open approval request and writes a trail row, in the same transaction. | Trail insert fails → PR stays pending_approval |
| BR-PR-43 | PRs are never hard-deleted (assumed). `DELETE /api/pr/deletepr/:id` means cancel. A cancelled PR keeps its number and shows under the `cancelled` filter. | Delete a draft → row still there, status cancelled |
| BR-PR-45 | Every PR endpoint needs a login and a role in {super-admin, owner, floor_supervisor, back_office}. | No token → 401. qa_inspector → 403 |
| BR-PR-46 | Every header and line status change records who and when: approval moves in the approval trail, the rest on the PR row. | After cancel, submit or a PO-driven change → actor and time readable |
| BR-PR-47 | Edit, submit and cancel re-read the PR under a row lock and check status inside the transaction. The loser of a race gets 409; nothing is half-written. | Edit and submit race → one gets 409; approval never uses a stale estimate |

## Not now
- Header `closed`/`received` status; header stays `fully_ordered`, line `closed` shows receipt.
- Splitting one line across suppliers or part-qty PO lines (unless Q4 = B).
- "Copy rejected PR to new draft".
- Guard against two users editing the same draft (last write wins inside BR-PR-47's lock).
- Auto-PR from reorder level, and from BOM explosion (M4).
- Sale order existence check (M4). Service (non-stock) lines.
- Sending subcontracting PRs to a subcontract order instead of a PO (M2 spec decides).

## Questions for you
| # | Question | Options | Answer |
|---|---|---|---|
| Q1 | Can a PR ask for 12.5 kg ingot or 2.5 L die lube? | **A** up to 3 decimals, any unit (recommended) / B whole numbers only (today) / C decimals only for kg and L | |
| Q2 | New item with no cost history makes the estimate ₹0 (lowest approval band). What then? | **A** allow, show warning (recommended) / B block until requester types a rate / C send to top approval level | |
| Q3 | Who can edit or cancel someone else's PR? | **A** supervisor own only; back_office, owner, admin any (recommended) / B anyone with PR access (today) / C owner edits, requester cancels | |
| Q4 | Can one PR line be split across POs, e.g. 1000 kg ADC12 as 600 + 400 from two suppliers? | **A** no, whole qty to one PO in M1 (recommended) / B yes, part qty per PO | |
| Q5 | When does a PR line count as "ordered"? | **A** when the PO is approved (recommended) / B when the PO is sent to the supplier / C as soon as the PO is drafted | |
| Q6 | Supplier sent 60 of 100 kg and the PO is short-closed. The other 40 kg? | **A** PR line closed, raise a new PR if still needed (recommended) / B 40 kg goes back to pending on the same PR | |
| Q7 | Cancel a PR that is partly on POs? | **A** block; cancel single pending lines instead (recommended) / B cancel pending lines, keep ordered ones / C header cancelled, lines untouched (today) | |

## Changelog
- 2026-09-27 v0 — draft created (retroactive from code at 0a406f4 + map; settles BL-019 line states)
- 2026-09-28 — rewritten in slim format. Merged: 02 ← 03, 04, 05; 06 ← 07, 09; 08 ← 10; 11 ← 12, 13; 15 ← 16, 18; 17 ← 44; 19 ← 20; 21 ← 22, 23, 24; 25 ← 26, 27, 29; 33 ← 34, 35; 36 ← 37, 38; 39 ← 40. Old Q-2, Q-3, Q-6, Q-7, Q-12, Q-13 taken as assumed.
