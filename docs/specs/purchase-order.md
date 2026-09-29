---
module: purchase-order
status: draft            # draft | frozen | changed-after-freeze
version: 0
frozen_on:
owner: Arun
depends_on: [auth-setup, purchase-requisition, approval, approval-policies, grn, suppliers]
---
# Purchase Order (PO)

> Code, gaps, benchmark and history: `docs/modules/purchase-order.md`. Receipt rules: `grn.md`.
> PR line effects: `purchase-requisition.md`. Sign-off: `approval.md`.

## Summary

Purchase turns approved PR lines into an order to one supplier (ADC12 ingot, die spares, release agent),
gets it signed off, sends it, and chases delivery. Stores receive against it by GRN. Done on the floor =
every PO ends `closed` or `cancelled`, its rate and total match what the supplier bills, and each PO
line traces back to its PR line and forward to its GRNs. A PO never moves stock itself.

## Who can do what

| Action                                                                             | Allowed                                                        |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| view, create, edit, send, remind, escalate, delay, confirm, invoice, close, cancel | `po.manage` (seed: owner, back_office); others 403           |
| pick a supplier (supplier list)                                                    | `supplier.view` (seed: owner, back_office, floor_supervisor) |
| submit for approval                                                                | the PO's creator only (BR-APR-24)                              |
| approve, reject, send back / withdraw                                              | approval chain / creator (`approval.md`)                     |
| receive goods                                                                      | GRN module only (`grn.md`)                                   |

## Flow

| From                             | Action                  | To                                             | Rule             |
| -------------------------------- | ----------------------- | ---------------------------------------------- | ---------------- |
| —                               | create from PR lines    | draft                                          | BR-PO-01, 02, 03 |
| draft                            | edit                    | draft                                          | BR-PO-05         |
| draft                            | submit                  | pending_approval, or approved if auto-approved | BR-PO-06         |
| pending_approval                 | approve (last level)    | approved                                       | BR-PO-07         |
| pending_approval                 | reject                  | cancelled                                      | BR-PO-07         |
| pending_approval                 | send back / withdraw    | draft                                          | BR-PO-07         |
| approved                         | send to supplier        | dispatched                                     | BR-PO-08         |
| dispatched, partial_received     | GRN accept / bypass     | partial_received or fully_received             | BR-PO-10         |
| partial_received, fully_received | GRN correction          | worked out again                               | BR-PO-10         |
| fully_received                   | record supplier invoice | invoiced                                       | BR-PO-15         |
| fully_received, invoiced         | close                   | closed (final)                                 | BR-PO-14         |
| partial_received                 | short-close (Q1)        | closed (final)                                 | BR-PO-13         |
| draft … dispatched, no GRN      | cancel                  | cancelled (final)                              | BR-PO-11, 12     |

## Rules

| ID       | Rule                                                                                                                                                                                                                                                                                                                                                                       | Example (given → then)                                                                                                                    |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| BR-PO-01 | A PO is made only from PR lines, never from scratch: one active supplier, at least 1 line, each line a`pending` PR line of an `approved`/`partial_ordered` PR, each PR line once (PR rules BR-PR-25, 28). Saved as `draft`, `createdBy` = user, number `PO-{periodKey}-{seq}`, never reused.                                                                   | Inactive supplier → 404. Same PR line twice → 400. PR line already on PO-1 → 400, or 409`PO_LINE_ALREADY_DRAFTED` if at the same time |
| BR-PO-02 | Line qty = the PR line's whole remaining qty, and uom = the item's uom. The user can't type or change qty on any screen or API.                                                                                                                                                                                                                                            | PR line 1000 kg ADC12 → PO line 1000 kg; PATCH with qty 900 → ignored or 400                                                             |
| BR-PO-03 | Rate is per unit in integer paise and must be ≥ 1 (Q4).                                                                                                                                                                                                                                                                                                                   | Rate 0 → 400; 21,000 paise/kg → saved                                                                                                    |
| BR-PO-04 | Line value = round(qty × rate) paise; subtotal = sum of line values; tax = GST per line (Q2); total = subtotal + tax. Recomputed on every line change.                                                                                                                                                                                                                    | 12.5 kg × 21,001 → 262,513; subtotal ₹1,00,000 at 18% → total ₹1,18,000                                                               |
| BR-PO-05 | Only a`draft` PO can be edited: terms, expected date, notes, rates, add `pending` PR lines, remove lines. Supplier can't change; cancel the draft and make a new PO. Removing a line puts its PR line back to `pending` (BR-PR-31). A PO can't be left with zero lines (assumed). Otherwise 400.                                                                     | Pending or approved PO, change rate → 400. Remove the only line → 400                                                                    |
| BR-PO-06 | Submit goes through the approval module, by the creator, from`draft` (BR-APR-24, 26, 27). Policy is matched on the PRs' common type and the PO total incl. GST (BR-APR-21, pending approval-policies Q1). While pending the PO is locked (BR-APR-47).                                                                                                                    | Tooling PRs only, ₹1,18,000 → PO/tooling policy. Pending PO, edit → 409                                                                 |
| BR-PO-07 | Last-level approve →`approved`, `approvedBy` set, its PR lines `po_draft` → `ordered` (BR-PR-30). Send back / withdraw → `draft`. Reject → cancelled through the normal cancel (BR-PO-11) so PR lines go back to `pending` (BR-PR-31, BR-APR-43; pending approval Q4).                                                                                     | PO-1 approved → PR line ordered. PO-2 rejected → cancelled, PR line pending, can go on PO-3                                              |
| BR-PO-08 | Send: only`approved` → `dispatched`, with a channel (email, whatsapp, phone, in person); email needs an address. It records a "PO sent" row (who, when, channel, note) in the same save. Nothing is actually emailed yet.                                                                                                                                             | Draft PO send → 400. Email with no address → 400. Approved + whatsapp → dispatched, one sent row                                        |
| BR-PO-09 | After send, header and lines never change except by the actions in this spec. A price or qty change means cancel (if no GRN) and a new PO. No amendments in M1 (assumed).                                                                                                                                                                                                  | Supplier raises rate after send → cancel PO-1, raise PO-2                                                                                 |
| BR-PO-10 | Receipt status is worked out only from GRN postings (BR-GRN-27, 34): every line received ≥ ordered →`fully_received`; some received → `partial_received`; nothing received after corrections → `dispatched` (assumed). It moves both ways until invoiced or closed.                                                                                              | 980/1000 → partial. +20 → fully. Correct 30 → partial. Correct all → dispatched                                                        |
| BR-PO-11 | Cancel only from draft, pending_approval, approved or dispatched, and only if no GRN (draft or posted) exists; else 409. Reason required (Q3). One save: PO`cancelled`, open approval cancelled with trail (BR-APR-48), PR lines back to `pending` (BR-PR-31), PR header recomputed but a cancelled PR stays cancelled (BR-PR-36). Who, when, reason stored on the PO. | Dispatched, GRN draft exists → 409. Approved, "wrong supplier" → cancelled, PR line pending                                              |
| BR-PO-12 | Cancelled and closed are final: no edit, send, GRN, invoice or reopen.`DELETE /po/deletepo/:id` means cancel; POs are never hard-deleted and keep their number.                                                                                                                                                                                                          | Cancelled PO, send → 400. Delete → row still there, cancelled                                                                            |
| BR-PO-13 | (Q1) Short-close: a`partial_received` PO can be closed with a reason when the supplier won't send the rest. Open qty is dropped, PR lines → `closed` (BR-PR-32); no more GRN.                                                                                                                                                                                         | 600 of 1000 kg, "supplier stopped" → closed, PR line closed, GRN → 400                                                                   |
| BR-PO-14 | Close: from`fully_received` or `invoiced` → `closed`, with who, when and an optional note.                                                                                                                                                                                                                                                                          | Fully received, close → closed. Dispatched, close → 400                                                                                  |
| BR-PO-15 | Record invoice: only on`fully_received`; needs invoice number, date and billed amount in paise; the same invoice number from the same supplier twice → 409 (assumed). Moves PO to `invoiced`. No matching or payment in M1.                                                                                                                                           | Partial PO, invoice → 400. Invoice "INV-44" twice for S → 409                                                                            |
| BR-PO-16 | Delay: on`dispatched`/`partial_received` only, needs a revised date and a reason (assumed). The original expected date never changes.                                                                                                                                                                                                                                  | Revised 15-10, "furnace breakdown" → saved, expected still 05-10. Closed PO → 400                                                        |
| BR-PO-17 | Supplier confirmation, reminders and escalations are log rows (who, when, channel, note); they never change status and are allowed only on`dispatched`/`partial_received` (assumed).                                                                                                                                                                                   | Reminder on dispatched → logged. Reminder on cancelled → 400                                                                             |
| BR-PO-18 | Expected delivery date is required before send and can't be before the PO date (Q7).                                                                                                                                                                                                                                                                                       | Approved PO with no date, send → 400                                                                                                      |
| BR-PO-19 | Overdue list =`dispatched`/`partial_received` POs with open qty on any line whose due date is before today; due date = revised date if set, else expected date (Q5).                                                                                                                                                                                                   | Expected 01-10, revised 15-10, today 10-10 → not overdue                                                                                  |
| BR-PO-20 | Every PO endpoint needs a login (401) and`po.manage` (403 `PERMISSION_DENIED`); super-admin passes (BR-AUTH-09, 18).                                                                                                                                                                                                                                                   | fs calls PO list → 403                                                                                                                    |
| BR-PO-21 | Every status change and log action stores who and when: approval moves in the approval trail, send/remind/escalate/confirm in the PO log, cancel/close/invoice on the PO row.                                                                                                                                                                                              | After cancel → cancelledBy, time, reason readable                                                                                         |
| BR-PO-22 | Every status change re-reads the PO under a row lock and checks status inside the same save; the loser of a race gets 409 and nothing is half-saved.                                                                                                                                                                                                                       | Cancel and GRN create at once → one wins. Send twice → one sent row                                                                      |

## Not now

- PO amendments/revisions after send; line-level short-close; hold/unhold.
- Splitting one PR line across POs or suppliers; part qty; PO without a PR.
- Real email/WhatsApp sending and printable PO PDF; supplier portal.
- Showing "rejected" apart from "cancelled" on the PO (the approval history shows it).
- 3-way match, supplier payments, debit notes, landed cost; advance payments.
- Rate defaults from supplier price list, last-rate warnings, rate-contract checks.
- Subcontracting orders (M2).

## Questions for you

| #  | Question                                                                                                                                                                | Options                                                                                                                                                              | Answer |
| -- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Q1 | Supplier sends 600 of 1000 kg and stops. How do you finish the PO? Short-close is owned here (grn.md leaves it to PO; PR BR-PR-32 closes the PR line on it). (BR-PO-13) | **A** short-close the whole PO with a reason (recommended) / B no short-close, PO stays `partial_received`, PR line stays `ordered` / C close line by line | A      |
| Q2 | GST on PO: tax is always 0 today. Show GST on the PO in M1? (BR-PO-04; which amount approval uses is approval-policies Q1)                                              | **A** GST % per line, default from the supplier price list, total incl. GST (recommended) / B no GST on PO in M1, total = subtotal                             | A      |
| Q3 | You said a PR cancel always needs a reason. Same for cancelling a PO and an SCO? (BR-PO-11, BR-SCO-20)                                                                  | **A** always, 3–500 chars, draft included (recommended) / B not for draft                                                                                     | A      |
| Q4 | Can a PO line have rate 0 (free sample, replacement)?                                                                                                                   | **A** no, ≥ 1 paise (recommended) / B yes, with a warning                                                                                                     | A      |
| Q5 | Overdue uses which date?                                                                                                                                                | **A** revised date if given, else expected (recommended) / B always the original expected date                                                                 | A      |
| Q6 | Split`po.manage` into smaller keys? (auth-setup "Not now")                                                                                                            | **A** keep one key in M1 (recommended) / B split create/send/close/cancel                                                                                      | A      |
| Q7 | Expected delivery date required?                                                                                                                                        | **A** required before send, not before PO date (recommended) / B optional                                                                                      | A      |

## Changelog

- 2026-09-29 v0 — draft created retroactively from code at 0a406f4 + map.
- 2026-09-29 — consistency pass: supplier picker via `supplier.view`; BR-PO-07 tagged approval Q4; Q1 names short-close owner; Q2 only asks GST on PO (approval basis → approval-policies Q1); Q3 now covers PO and SCO cancel reason.
