---
module: purchase-order
status: frozen           # draft | frozen | changed-after-freeze
version: 1
frozen_on: 2026-09-29
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

| Action | Allowed |
|---|---|
| view, create, edit, send, remind, escalate, delay, confirm, invoice, close, cancel | `po.manage` (seed: owner, back_office); others 403. One key in M1. |
| pick a supplier (supplier list) | `supplier.view` (seed: owner, back_office, floor_supervisor) |
| submit for approval | the PO's creator only (BR-APR-24) |
| approve, reject, send back / withdraw | approval chain / creator (`approval.md`) |
| receive goods | GRN module only (`grn.md`) |

## Flow

| From | Action | To | Rule |
|---|---|---|---|
| — | create from PR lines | draft | BR-PO-01, 02, 03 |
| draft | edit | draft | BR-PO-05 |
| draft | submit | pending_approval, or approved if auto-approved | BR-PO-06 |
| pending_approval | approve (last level) | approved | BR-PO-07 |
| pending_approval | reject | cancelled | BR-PO-07 |
| pending_approval | send back / withdraw | draft | BR-PO-07 |
| approved | send to supplier | dispatched | BR-PO-08, 18 |
| dispatched, partial_received | GRN accept / bypass | partial_received or fully_received | BR-PO-10 |
| partial_received, fully_received | GRN correction | partial_received or dispatched | BR-PO-10 |
| fully_received | record supplier invoice | invoiced | BR-PO-15 |
| fully_received, invoiced | close | closed (final) | BR-PO-14 |
| partial_received | short-close | closed (final) | BR-PO-13 |
| draft, pending_approval, approved, dispatched (no GRN) | cancel | cancelled (final) | BR-PO-11, 12 |

## Rules

| ID | Rule | Example (given → then) |
|---|---|---|
| BR-PO-01 | A PO is made only from PR lines, never from scratch: one supplier that is active at create time (BR-SUP-07), at least 1 line, each line a `pending` PR line of an `approved`/`partial_ordered` PR, each PR line once (BR-PR-25, 28). Saved as `draft`, `createdBy` = user, number `PO-{periodKey}-{seq}`, never reused. A supplier deactivated later does not stop its open POs. | Inactive supplier → 400. Same PR line twice → 400. PR line already on PO-1 → 400, or 409 `PO_LINE_ALREADY_DRAFTED` if at the same time. S1 deactivated while PO-1 dispatched → PO-1 still receivable |
| BR-PO-02 | Line qty = the PR line's whole remaining qty, and uom = the item's uom. The user can't type or change qty on any screen or API. | PR line 1000 kg ADC12 → PO line 1000 kg; PATCH with qty 900 → ignored or 400 |
| BR-PO-03 | Rate is per unit in integer paise and must be ≥ 1; no zero-rate lines (free samples, replacements). A new line's rate is filled with the supplier price suggestion (BR-SUP-16: last PO rate, else active price-list price, else average cost, else standard rate) and stays editable in draft. | No past PO, price list ₹245/kg → line rate 24,500, user changes to 24,000 → saved. Rate 0 → 400 |
| BR-PO-04 | Each line has a GST %, filled from the supplier's active price-list row for that item (0 if none), editable in draft, one of the BR-SUP-13 values. Line value = round(qty × rate); line tax = round(line value × GST % / 100); subtotal = sum of line values; tax = sum of line taxes; total = subtotal + tax, all in paise, recomputed on every line change. | Price list ADC12 at 18%: 12.5 kg × 21,001 → value 262,513, tax 47,252. Subtotal ₹1,00,000 at 18% → total ₹1,18,000. GST 17 → 400 |
| BR-PO-05 | Only a `draft` PO can be edited: terms, expected date, notes, rates, GST %, add `pending` PR lines, remove lines; otherwise 409 `PO_NOT_EDITABLE` (same as BR-PO-06 / BR-APR-47 for pending). Supplier can't change. Removing a line puts its PR line back to `pending` (BR-PR-31). A PO can't be left with zero lines. | Pending or approved PO, change rate → 409. Remove the only line → 400. Remove 1 of 2 → that PR line pending |
| BR-PO-06 | Submit goes through the approval module, by the creator, from `draft` (BR-APR-24, 26, 27). Policy is matched on the PRs' common type and the PO total incl. GST (BR-APR-21). While pending the PO is locked (BR-APR-47). | Tooling PRs only, ₹1,00,000 + 18% → PO/tooling policy on ₹1,18,000. Pending PO, edit → 409 |
| BR-PO-07 | Last-level approve → `approved`, `approvedBy` set, its PR lines `po_draft` → `ordered` (BR-PR-30). Send back / withdraw → `draft`. Reject → cancelled through the normal cancel (BR-PO-11), so its PR lines are cancelled too (BR-APR-43, approval Q4 = B). | PO-1 approved → PR line ordered. PO-2 rejected → PO cancelled, PR line cancelled; a new PR is needed |
| BR-PO-08 | Send: only `approved` → `dispatched`, with a channel (email, whatsapp, phone, in person); email needs an address. It records a "PO sent" row (who, when, channel, note) in the same save. Nothing is actually emailed yet. | Draft PO send → 400. Email with no address → 400. Approved + whatsapp → dispatched, one sent row |
| BR-PO-09 | After send, header and lines never change except by the actions in this spec. No amendments: a price or qty change means cancel (if no GRN) and a new PR and PO. | Supplier raises rate after send → cancel PO-1, raise a new PR, then PO-2 |
| BR-PO-10 | Receipt status is worked out only from GRN postings (BR-GRN-27, 34): every line received ≥ ordered → `fully_received`; some received → `partial_received`; nothing received after corrections → `dispatched`. It moves both ways until invoiced or closed. | 980/1000 → partial. +20 → fully. Correct 30 → partial. Correct all → dispatched |
| BR-PO-11 | Cancel only from draft, pending_approval, approved or dispatched, and only if no GRN (draft or posted) exists; else 409. Reason required, draft included: trimmed 3–500 chars, else 400. One save: PO `cancelled`; open approval cancelled with trail (BR-APR-48); its PR lines → `cancelled` (approval Q4 = B); PR header recomputed (BR-PR-36). Who, when, reason stored on the PO. | Dispatched, GRN draft exists → 409. Draft, reason "ab" → 400. Approved, "wrong supplier" → PO cancelled, PR line cancelled |
| BR-PO-12 | Cancelled and closed are final: no edit, send, GRN, invoice or reopen. `DELETE /po/deletepo/:id` means cancel; POs are never hard-deleted and keep their number. | Cancelled PO, send → 400. Delete → row still there, cancelled |
| BR-PO-13 | Short-close: a `partial_received` PO can be closed as a whole with a reason (3–500 chars) when the supplier won't send the rest. Open qty is dropped, its PR lines → `closed` (BR-PR-32); no more GRN. | 600 of 1000 kg, "supplier stopped" → closed, PR line closed, new GRN → 400 |
| BR-PO-14 | Close: from `fully_received` or `invoiced` → `closed`, with who, when and an optional note. | Fully received, close → closed. Dispatched, close → 400 |
| BR-PO-15 | Record invoice: only on `fully_received`; needs invoice number, date and billed amount in paise; the same invoice number from the same supplier twice → 409. Moves PO to `invoiced`. No matching or payment in M1. | Partial PO, invoice → 400. Invoice "INV-44" twice for S → 409 |
| BR-PO-16 | Delay: on `dispatched`/`partial_received` only, needs a revised date and a reason. The original expected date never changes. | Revised 15-10, "furnace breakdown" → saved, expected still 05-10. Closed PO → 400 |
| BR-PO-17 | Supplier confirmation, reminders and escalations are log rows (who, when, channel, note); they never change status and are allowed only on `dispatched`/`partial_received`. | Reminder on dispatched → logged. Reminder on cancelled → 400 |
| BR-PO-18 | Expected delivery date is required before send and can't be before the PO date; checked on save and on send. | Approved PO with no date, send → 400. PO dated 01-10, expected 28-09 → 400 |
| BR-PO-19 | Overdue list = `dispatched`/`partial_received` POs with open qty on any line whose due date is before today; due date = revised date if set, else expected date. | Expected 01-10, revised 15-10, today 10-10 → not overdue; today 16-10 → overdue |
| BR-PO-20 | Every PO endpoint needs a login (401) and `po.manage` (403 `PERMISSION_DENIED`); super-admin passes (BR-AUTH-09, 18). | fs calls PO list → 403 |
| BR-PO-21 | Every status change and log action stores who and when: approval moves in the approval trail, send/remind/escalate/confirm in the PO log, cancel/short-close/close/invoice on the PO row. | After cancel → cancelledBy, time, reason readable |
| BR-PO-22 | Every status change re-reads the PO under a row lock and checks status inside the same save; the loser of a race gets 409 and nothing is half-saved. | Cancel and GRN create at once → one wins. Send twice → one sent row |
| BR-PO-23 | Payment terms are whole days 0–365; a new PO with no terms typed copies the supplier's default terms (BR-SUP-06, suppliers Q6 = A), editable in draft. Later changes to the supplier's terms don't touch existing POs. | S1 terms 30, new PO blank → 30 days. Terms 400 → 400. S1 changed to 45 → PO-1 stays 30 |

## Not now

- PO amendments/revisions after send; line-level short-close; hold/unhold.
- Splitting one PR line across POs or suppliers; part qty; PO without a PR.
- Splitting `po.manage` into create/send/close/cancel keys.
- CGST/SGST vs IGST split; HSN on the PO line; tax-inclusive rates.
- Real email/WhatsApp sending and printable PO PDF; supplier portal.
- Showing "rejected" apart from "cancelled" on the PO (the approval history shows it).
- 3-way match, supplier payments, debit notes, landed cost; advance payments.
- Last-rate warnings and rate-contract checks.
- Subcontracting orders (M2).

## Questions for you

None open.

## Changelog

- 2026-09-29 v0 — draft created retroactively from code at 0a406f4 + map.
- 2026-09-29 — consistency pass: supplier picker via `supplier.view`; BR-PO-07 tagged approval Q4; Q1 names short-close owner; Q2 only asks GST on PO (approval basis → approval-policies Q1); Q3 now covers PO and SCO cancel reason.
- 2026-09-29 — final answers folded. Q1–Q7 = A: short-close whole PO (BR-PO-13), GST % per line from price list (BR-PO-04), cancel reason always 3–500 (BR-PO-11), rate ≥ 1 (BR-PO-03), overdue on revised date (BR-PO-19), one `po.manage` key, expected date required before send (BR-PO-18). Approval Q4 = B folded: PO reject/cancel cancels its PR lines (BR-PO-07, 09, 11). approval-policies Q1 = C: PO matched incl. GST (BR-PO-06). Assumed rules made firm. Tables un-padded. Suppliers alignment: inactive supplier → 400 (BR-PO-01), rate and GST % default from BR-SUP-16 / price list (BR-PO-03, 04), new BR-PO-23 payment terms copied (suppliers Q6 = A).
- 2026-09-29 — pre-freeze touch-up: checked BR-PO-07, 09, 11 agree with approval Q4=B. BR-PO-03 suggestion falls back to the item standard rate (inventory BR-INV-24).
- 2026-09-29 — frozen v1 (all questions answered by Arun)
