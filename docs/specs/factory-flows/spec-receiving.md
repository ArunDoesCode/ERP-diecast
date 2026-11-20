---
module: factory-flows
part: receiving
status: draft
index: spec.md
---

# Factory flows — Receive goods from the goods-receipt screen

> Part of `spec.md` (example data and shared rules BR-FF-01..08 are there). Rules BR-FF-60..73.
> Benchmark: SAP "Copy To" from the PO into the goods receipt, ERPNext Create → Receipt from the PO
> with the source link, many receipts per PO (research Q2, Q4). All frozen GRN rules stay: challan
> required and unique per supplier (BR-GRN-05), server date (BR-GRN-08), whole numbers for pieces
> (BR-GRN-02), over-receipt cap at QA (frozen GRN rules). Today a GRN can only start from the PO page,
> which needs `po.manage`; the store keeper role does not hold it.

## Picker
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-FF-60 | The goods-receipt list has a "Receive goods" button for holders of `grn.edit_draft`; others do not see it. | S → button shown; Q (no `grn.edit_draft`) → no button |
| BR-FF-61 | "Receive goods" opens a picker of POs in `dispatched` / `partial_received` with open qty on at least one line, oldest due date first, each row showing PO number, supplier, due date (late marked), item count and open qty per item. | PO-2026-11-1 → "PO-2026-11-1 · Sri Balaji Metals · due 25-11 · ADC12 400 kg open" |
| BR-FF-62 | The picker and its endpoint need only `grn.edit_draft` and never return rates, GST or amounts; the PO endpoints keep needing `po.manage` (BR-PO-20 unchanged). | S calls the picker endpoint → 200 without price fields; S calls `getpos` → 403 |
| BR-FF-63 | The picker can be narrowed by typing part of a PO number or supplier name. | Type "Balaji" → only Sri Balaji Metals orders |
| BR-FF-70 | With no receivable PO the picker says "No orders are waiting for goods"; holders of `po.manage` also get a link to "Orders to send". | All POs fully received → empty message; B sees the link, S does not |
| BR-FF-71 | The "Goods expected" Home tile opens this picker; its Late part opens it filtered to late POs. | Tile "1 late" → picker with 1 row |

## Receive form
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-FF-64 | Picking a PO opens a full-page receive form listing each PO line with ordered, received so far and open qty; the arrived box starts empty and a "Fill open quantity" button fills every empty box with that line's open qty. | PO-2026-11-1 → ADC12 ordered 1000, received 0, open 1000, arrived [ ]; click Fill → 1000 |
| BR-FF-65 | Lines left empty or 0 are not put on the GRN; saving needs at least one arrived qty above 0. | All boxes empty → Save refused "Enter at least one arrived quantity" |
| BR-FF-66 | The form warns, without blocking, when received so far + arrived is above ordered, counting every earlier receipt; the server's over-receipt rules stay the gate. | Earlier GRN 600 kg, arrived 500 kg → warning "100 kg above the order"; save allowed |
| BR-FF-67 | Saving creates the GRN through the existing create rules and then opens the new GRN page. | Arrived 600 kg, challan CH-11 → GRN-2026-11-4 page, status Draft, line QA pending |
| BR-FF-68 | "Receive goods" on a PO page opens the same form with that PO already picked. | PO-2026-11-1 page → Receive goods → form for PO-2026-11-1 |
| BR-FF-69 | If the save is refused (challan used before, bad quantity), the form stays with everything typed and shows the reason. | Challan CH-11 already on another Sri Balaji GRN → "Challan CH-11 is already recorded for this supplier"; entries kept |
| BR-FF-72 | If the PO stopped being receivable after it was picked (cancelled, closed, fully received), saving shows "This order can no longer be received" and returns to the picker. | B short-closes PO-2026-11-1 while S fills the form → S saves → message, back to picker |
| BR-FF-73 | Decimal arrived qty is refused at the field for whole-number units (pieces), before saving. | Bracket 10.5 pcs → field error "Whole numbers only" |

## Choices made in this part (moved to `assumptions.md`)
Picker without prices, warning-only over-receipt in the form, picker sort: A-11..A-13.
Arrived box empty vs pre-filled is owner question 2 (draft = empty + Fill button).
