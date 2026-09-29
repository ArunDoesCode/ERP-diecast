---
module: purchase-requisition
status: frozen           # draft | frozen | changed-after-freeze
version: 2
frozen_on: 2026-09-29
owner: Arun
depends_on: [auth-setup, approval, purchase-order, grn, inventory]
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
| view, create | holders of `pr.manage` (others 403) |
| edit, cancel a PR or a line | its requester, or super-admin (BR-PR-17) |
| submit, withdraw from approval | the requester only (approval BR-APR-24, 39) |
| set the Machine field | holders of `pr.link_machine` (auth-setup BR-AUTH-26) |
| approve, reject, send back | the approval chain (`docs/specs/approval.md`) |
| put a line on a PO | PO module only, `po.manage` (`docs/specs/purchase-order.md`) |

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
| draft, pending_approval, approved | cancel (reason always) | cancelled (final) | BR-PR-39, 41, 42 |
| partial_ordered, fully_ordered, rejected, cancelled | cancel | refused 409 | BR-PR-39 |

Line:

| From | Action | To | Rule |
|---|---|---|---|
| — | line added (header draft) | pending | BR-PR-06 |
| pending | put on a PO | po_draft | BR-PR-25 |
| po_draft | linked PO approved | ordered | BR-PR-30 |
| po_draft | PO line deleted from the draft PO | pending | BR-PR-31 |
| po_draft, ordered | PO cancelled or rejected | cancelled (final) | BR-PR-31 |
| ordered | PO line fully received, or PO short-closed | closed (final) | BR-PR-32 |
| pending | PR cancelled, or line cancelled on its own | cancelled (final) | BR-PR-33, BR-PR-39 |

A link (`pr_po_item_links`) is **live** while its PO is not cancelled and the PO line still exists.
Links to cancelled POs stay for history.

## Rules

| ID | Rule | Example (given → then) |
|---|---|---|
| BR-PR-01 | Create saves header and all lines in one transaction as `draft`, `requestedBy` = logged-in user, number `PR-{periodKey}-{seq}` from the shared sequence. Numbers are unique and never reused. | Two creates at once → different numbers. Line 2 has a bad item → 400, no rows saved |
| BR-PR-02 | Header checks: `type` is required. `maintenance` needs an `assetId` (on create, and when edited to maintenance). Any `assetId` must exist in machines. `notes` (purpose) can't be empty. `saleOrderId` is stored as sent, unchecked, until M4. | maintenance, no asset → 400. assetId 999999 → 400 `Invalid assetId`. notes "" → 400. saleOrderId 42 → saved |
| BR-PR-06 | A line can only use an item that already exists in the item master and is active; there is no free-text or "new item" line. `uom` is always copied from the item master (client value ignored). One line per item per PR, on create and after edit. | Item not in master or inactive → 400 `PR_INVALID_ITEM`. Client sends pcs for a kg item → saved kg. Item A twice → 400 `PR_DUPLICATE_ITEM` |
| BR-PR-08 | `requestedQty` must be > 0 with at most 3 decimals, any unit. Optional required-by date per line; if given it can't be before today when saved. | Qty 0, −5 or 1.2345 → 400. 12.5 kg ingot, 2.5 L die lube → ok. Date yesterday → 400 |
| BR-PR-11 | Estimate = round(Σ qty × line rate), integer paise; line rate = item average cost, or the item's standard rate while average cost is 0 (BR-PR-14). Recomputed on every line change and again at submit, before the approval policy is picked. After submit it never changes. How average cost is kept is owned by the GRN spec. | Costs 25000 and 1050 paise, qty 10 and 3 → 253150. Qty 3 → 4 → 254200. Cost rises after approval → estimate unchanged |
| BR-PR-14 | Every item has a required standard rate (item master). A line whose item has average cost 0 uses that standard rate, is flagged `noCostHistory`, and the screen says "estimate uses standard rate"; submit is still allowed. | Avg cost 0, standard rate 24000 paise, qty 10 → line estimate 240000, flag true, submit ok |
| BR-PR-15 | Header and lines can change only in `draft` (else 409 `PR_NOT_EDITABLE`). Edit can't set `status` (400 `PR_STATUS_VIA_ACTION`) and can't leave zero lines (400 `PR_MIN_ONE_LINE`). | Pending PR, change notes → 409. PATCH `status: cancelled` → 400. Delete the only line → 400 |
| BR-PR-17 | Any `pr.manage` holder can view every PR. Only its requester, or super-admin, may edit it, cancel it or cancel one of its lines; anyone else → 403 `PR_NOT_REQUESTER`. Submit and withdraw stay the requester's only (BR-APR-24, 39). | Supervisor B opens A's PR → 200. B edits or cancels A's draft → 403. Super-admin cancels A's draft → 200. B submits A's draft → 403 |
| BR-PR-19 | Submit only from `draft` with at least 1 line. Policy is matched on type + estimate (approval spec). Result `pending_approval`, or `approved` if auto-approved; then `approvedBy` stays empty (BR-APR-28). Second submit while a request is open → 409 `APPROVAL_ALREADY_OPEN`. | 2-level policy → pending, 2 levels. Auto-approved → approved, approvedBy null. Approved PR submitted → 409 |
| BR-PR-21 | Approval outcomes: approve at a middle level → stays pending, level copied. Last level approves → `approved`, `approvedBy` = that approver. Reject → `rejected`, final; raise a new PR. Send back, or requester withdraws → `draft`; resubmit starts at level 1. | Level 1 approves → pending at level 2. Rejected, then edit or submit → 409. Withdraw → draft, request cancelled |
| BR-PR-25 | A line goes on a PO only if the line is `pending` and the header is `approved` or `partial_ordered` (any type; subcontracting PRs also go to a PO, SCOs are made directly — subcontracting Q1). The whole remaining qty goes to one PO line; no split across POs, no part qty. Same transaction: line → `po_draft`, `issuedQty` += qty (stays between 0 and requested qty), link saved. Line is row-locked; a second attempt at the same time → 409 `PO_LINE_ALREADY_DRAFTED`. | Line 1000 kg ADC12 → one PO line 1000; 600 + 400 → 400. PR pending_approval → 400. Two POs at once → one gets 409 |
| BR-PR-28 | The PR module never creates, edits or cancels PO rows. All PR↔PO writes happen inside the PO module's transaction. | PR cancelled → no PO row touched |
| BR-PR-30 | A line counts as ordered only when its PO is `approved` (auto-approve too): its `po_draft` PR lines become `ordered` in the same transaction. Drafting, sending or withdrawing the PO does not change them. | PO-1 drafted → line po_draft. PO-1 approved → line ordered. PO-1 withdrawn to draft → line stays po_draft |
| BR-PR-31 | Deleting a line from a draft PO puts its PR line back to `pending`. Cancelling a PO, or rejecting its approval, cancels its linked PR lines (final); the requester raises and gets approval for a new PR if still needed (approval Q4=B). Either way `issuedQty` drops by the linked qty, same transaction as the PO change. | PO-3 line deleted → PR line pending, can go on PO-4. PO-3 rejected → PR line cancelled, can't go on any PO |
| BR-PR-32 | A line becomes `closed` when its PO line is fully received (accepted ≥ PO qty) or its PO is short-closed. Short qty is not put back on the PR; raise a new PR if still needed. A part receipt leaves it `ordered`. | 60 of 100 kg → ordered. +40 → closed. PO short-closed at 60 → closed, issuedQty stays 100 |
| BR-PR-33 | A `pending` line can be cancelled on its own while the header is `approved` or `partial_ordered`. `closed` and `cancelled` lines never change again. A `po_draft`/`ordered` line can't be cancelled from the PR (409 `PR_LINE_ON_LIVE_PO`). A line that isn't `pending` can't be edited or deleted. | Pending L2 cancelled → cancelled. Ordered line cancel → 409. Closed line put on a PO → 400 |
| BR-PR-36 | After any line change on an `approved`/`partial_ordered`/`fully_ordered` PR, the header is worked out over non-cancelled lines: all `pending` → approved; all `po_draft`/`ordered`/`closed` → fully_ordered; else partial_ordered; every line cancelled → cancelled. Never runs on draft, pending_approval, rejected or cancelled. `fully_ordered` can move back only through this rule. | 1 of 3 on a PO → partial. All 3 → fully. PO with 1 of 3 cancelled → that line cancelled, header from the other 2 → fully. Only line's PO cancelled → PR cancelled |
| BR-PR-39 | A whole PR can be cancelled only while no line is `po_draft`, `ordered` or `closed`, i.e. from draft, pending_approval or approved. Any line on a live PO → 409 `PR_HAS_ORDERED_LINES` naming the PO numbers, "cancel the PO first" or cancel the pending lines one by one (BR-PR-33). rejected or cancelled → 409 `PR_INVALID_TRANSITION`, never a silent 200. On success the header and all pending lines → cancelled, one transaction. Screen: "Cancel PR" enabled only for draft/pending_approval/approved, disabled otherwise; asks for the reason first; on success PR list, detail and approval queue refresh; on error the dialog stays open with the message. | Approved, all pending → all cancelled. 1 of 3 lines on PO-2609-0002 → 409 naming it. Cancelled PR cancelled again → 409 |
| BR-PR-41 | Every cancel needs a reason, draft included: trimmed length 3–500, else 400 `PR_CANCEL_REASON_REQUIRED`. Reason, who and when are saved. | Draft, empty → 400. Approved, "  " → 400. Draft, "duplicate" → 200, cancelledBy set |
| BR-PR-42 | Cancelling a `pending_approval` PR also cancels its open approval request and writes one trail row `cancelled`, actor = the person cancelling, notes = the reason, in the same transaction (BR-APR-48). Later approve/reject on it → 409 `APPROVAL_NOT_PENDING` (BR-APR-30). | A raised it, super-admin S cancels → one trail row, actor S. Trail insert fails → PR stays pending_approval |
| BR-PR-43 | PRs are never hard-deleted. Cancel has one path: `DELETE /api/pr/deletepr/:id` (bad id → 400 `INVALID_PR_ID`, unknown → 404 `PR_NOT_FOUND`, success → 200 with the PR). A cancelled PR keeps its number (never reused), is read-only (BR-PR-15) and shows under the `cancelled` filter. | Delete a draft → row still there, status cancelled; `DELETE /deletepr/abc` → 400 |
| BR-PR-45 | Every PR endpoint needs a login (401) and the `pr.manage` key (403 `PERMISSION_DENIED`); super-admin passes (auth-setup BR-AUTH-09, 18). | No token → 401. Role without `pr.manage` (qa_inspector seed) → 403 |
| BR-PR-46 | Every header and line status change records who and when: approval moves in the approval trail, the rest on the PR row. | After cancel, submit or a PO-driven change → actor and time readable |
| BR-PR-47 | Edit, submit and cancel re-read the PR under a row lock and check status inside the transaction. The loser of a race gets 409; nothing is half-written. | Edit and submit race → one gets 409; approval never uses a stale estimate |

## Not now

- Header `closed`/`received` status; header stays `fully_ordered`, line `closed` shows receipt.
- Splitting one line across suppliers or part-qty PO lines.
- "Copy rejected PR to new draft".
- Hiding other people's PRs from view (needs per-record rules, auth-setup "Not now").
- Guard against two users editing the same draft (last write wins inside BR-PR-47's lock).
- Auto-PR from reorder level, and from BOM explosion (M4).
- Sale order existence check (M4). Service (non-stock) lines.
- Sending subcontracting PRs to a subcontract order instead of a PO (subcontracting Q1=A).

## Questions for you

None open.

## Changelog

- 2026-09-27 v0 — draft created (retroactive from code at 0a406f4 + map; settles BL-019 line states)
- 2026-09-28 — rewritten in slim format. Merged: 02 ← 03, 04, 05; 06 ← 07, 09; 08 ← 10; 11 ← 12, 13; 15 ← 16, 18; 17 ← 44; 19 ← 20; 21 ← 22, 23, 24; 25 ← 26, 27, 29; 33 ← 34, 35; 36 ← 37, 38; 39 ← 40. Old Q-2, Q-3, Q-6, Q-7, Q-12, Q-13 taken as assumed.
- 2026-09-29 — answers folded in. Q1=A (BR-PR-08), Q4=A (BR-PR-25), Q5=A (BR-PR-30), Q6=A (BR-PR-32), Q7=A (BR-PR-39: whole-PR cancel only before any line is on a PO). Q2 first half made firm in BR-PR-06; rest re-asked. Q3 re-asked; BR-PR-17 held at today's behaviour. Roles replaced by `pr.manage` / `pr.link_machine` keys (BR-PR-45, who-can-do-what).
- 2026-09-29 — consistency pass: this spec owns PR cancel; known-defects BR-KD-01..16 now point here. BR-PR-41 reason always (3–500, known-defects Q3). BR-PR-39 409 for rejected/cancelled, names POs, screen rule. BR-PR-42, 43 took BR-KD-09, 01. BR-PR-19 `approvedBy` per BR-APR-28. Submit = requester only. Subcontracting PRs → PO (subcontracting Q1 settled: SCOs are created directly). BR-PR-31 set by approval Q4=B. Q3 merged with known-defects Q1.
- 2026-09-29 — final answers folded. Q2=A: item standard rate used while average cost is 0 (BR-PR-11, 14). Q3=A: only requester or super-admin edits/cancels, all `pr.manage` holders view (BR-PR-17, 42, who-table). Approval Q4=B: PO cancel/reject cancels its PR lines; draft-PO line delete still → pending (BR-PR-31, 30, 36, line flow). Subcontracting Q1=A settled (BR-PR-25). "(assumed)" tags dropped (BR-PR-08, 11, 21, 43). Tables re-padded.
- 2026-09-29 — pre-freeze touch-up: checked BR-PR-30, 31, 36 agree with approval Q4=B; last "pending subcontracting Q1" text replaced (subcontracting PRs → PO, SCOs created directly). `PR_NOT_EDITABLE` is also the code approval BR-APR-47 uses for PRs.
- 2026-09-29 — frozen v1 (all questions answered by Arun)
- 2026-09-29 — v2 clarified during build (review): status is never set through edit (400 `PR_STATUS_VIA_ACTION`); the `pr.link_machine` check (auth BR-AUTH-26) applies only when the machine is added or changed, not when an edit resends the same one; notes are at most 2000 characters (the sale order link is not checked until the sale-order module exists, M4). PO-driven line changes (ordered / closed / cancelled by a PO action) are recorded on the PO's own record (who, when, reason) — BR-PR-46 is met through it. Error codes used: `PR_NOT_EDITABLE`, `PR_NOT_REQUESTER`, `PR_MIN_ONE_LINE`, `PR_INVALID_ITEM`, `PR_DUPLICATE_ITEM`, `PR_LINE_NOT_PENDING`, `PR_DATE_IN_PAST`, `PR_CANCEL_REASON_REQUIRED`, `PR_HAS_ORDERED_LINES`, `PR_INVALID_TRANSITION`.
