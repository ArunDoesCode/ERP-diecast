---
module: reorder
approved_on: 2026-11-20   # owner pre-approved recommended options in chat, 2026-11-20: "take ur own decision and record them and run whatever parallel subagents u want to complete a complete scm module according to my plan, ill do a complete merge in moring once completed"
---
# Reorder: low stock raises a draft requisition — for your approval
> The only file you read. You delegated every decision (chat, 20-11-2026); each card shows the option taken. Say a letter to change one.

## 1. What you asked for
Stock already shows items below their reorder level, but nothing happens until someone notices.
An item below its reorder level should raise a draft requisition. No forecasting, no automatic orders.

## 2. What the user will be able to do
- Every morning (and on "Check now") the system finds items at or below their reorder level, counting own-store stock plus what is already requested or ordered.
- All low items go on one draft requisition owned by a named purchase person, who checks and submits it through normal approval.
- Stores and purchase see the same live list: will be ordered, already covered, needs a reorder qty, OK. Items get reorder qty, min order qty and order multiple.

> Example: ADC12 ingot, reorder level 500 kg, reorder qty 1,000 kg, order multiple 250 kg, rate ₹240/kg.
> Store has 480 kg, nothing on the way → one draft line ADC12 1,000 kg, estimate ₹2,40,000.

## 3. Screens (wireframes; pictures come with the build)
- Reorder list with "Check now" and a settings dialog (switch, run hour, draft owner); run history and run detail with "Open requisition".
- Item form gets the three new fields next to reorder level; a requisition raised by the check carries a "Reorder" tag.

## 4. Decisions for you
### Card 1 — Who owns the draft the system raises?
- **A (recommended):** One named purchase person, set in Reorder settings; it is their draft to edit, submit or cancel.
- **B:** Whoever opens it first takes it over.
- **For the factory user:** A: one person is always responsible; the check stops with a reason if that person leaves. Requisitions get a "raised by reorder" link. Other ERPs: ERPNext emails the purchase manager; Odoo names nobody; SAP leaves it to whoever runs its planning wizard.
- **Cost:** A: none. B: a change to who may edit a requisition. **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 2 — What counts as stock when deciding "low"?
- **A (recommended):** Only our own store and finished goods; metal at a job worker or in the scrap yard does not count.
- **B:** All stock everywhere, the same number as the stock list.
- **For the factory user:** A: no false "enough stock" when ingot sits at a plater or in scrap. B: fewer requests, risk of running short. Other ERPs: Odoo and ERPNext set levels per store; none say how job-work stock is treated.
- **Cost:** none either way. **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 3 — If a request or order for the item is already open, raise another?
- **A (recommended):** No. Open requests, drafts included, and undelivered order qty count as on the way.
- **B:** Count only approved requests and orders; more drafts pile up.
- **For the factory user:** A: one draft per need, even if "Check now" is pressed twice; cancel a draft and the item comes back next check. Other ERPs: ERPNext ignores drafts; SAP lets you tick which documents count. We took the stricter.
- **Cost:** none either way. **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 4 — How much to request?
- **A (recommended):** The item's reorder qty (more if stock fell further), raised to the min order qty, rounded up to the order multiple.
- **B:** Fill up to a maximum stock level (new field).
- **For the factory user:** A: ingot comes in full supplier lots; an item with no reorder qty is listed "needs a reorder qty", never ordered. Other ERPs: ERPNext uses the reorder qty; Odoo fills up to a maximum; SAP offers both, with multiples and minimum order.
- **Cost:** A: none. B: one more field per item. **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 5 — When does the check run?
- **A (recommended):** Once a day at 07:00 plant time, before first shift, plus "Check now"; off until purchase turns it on.
- **B:** On every stock movement.
- **For the factory user:** A: one predictable draft each morning; stock posting stays fast. Other ERPs: Odoo runs once a day; ERPNext checks automatically; SAP only when a person runs it.
- **Cost:** A: none. B: slower stock posting. **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 6 — One draft for all low items, or one per item?
- **A (recommended):** One draft per check, one line per low item.
- **B:** One draft per item.
- **For the factory user:** A: purchase checks and submits once a day; lines can still go to different suppliers on the order. Other ERPs: ERPNext makes one request per item; Odoo and MRPeasy group per supplier (our requisitions have no supplier).
- **Cost:** none either way. **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)

## 5. Decided for you — please confirm
- New right "manage reorder" (settings, Check now) for owner and back office; anyone who sees stock sees the list and the item's reorder fields; only item editors (back office) change those fields.
- The check never orders, approves or moves stock; its draft goes through the same approval as any requisition, no shortcut.
- Stores staff see the requisition / order number and status of a covered item, but not its value; no link unless they may open requisitions.
- More than 500 low items in one check: the 500 furthest below their level go on the draft, the rest wait for the next check.
- An item whose line would be invalid (e.g. a value too large) is skipped and listed; the rest of the draft is still raised.
- Inactive items, services and items with reorder level 0 are never raised.
- Quantities are always rounded up: whole pieces for pcs/set, 3 decimals for kg and litres.
- The daily check cannot be switched on until a draft owner who can use requisitions is chosen.
- Switching on, or moving the hour, after today's run time starts tomorrow; there is no catch-up run.
- A daily check that fails is not retried that day; "Check now" is the retry.
- Changing the draft owner does not move drafts already raised.

Everything else: 52 edge cases decided by ERP benchmark, 41 technical choices logged. No reading needed.

## 6. Not included
- Alerts by app or e-mail (no notification module yet); levels per store or per supplier; one draft per supplier.
- Max-stock ordering, forecasting from sales or casting plans; automatic orders or auto-submit.
