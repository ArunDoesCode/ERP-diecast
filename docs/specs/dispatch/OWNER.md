---
module: dispatch
approved_on: 2026-11-20   # owner pre-approved recommended options in chat, 2026-11-20: "take ur own decision and record them and run whatever parallel subagents u want to complete a complete scm module according to my plan, ill do a complete merge in moring once completed"
---

# Dispatch (delivery note) — for your approval

## 1. What you asked for
Goods leave against a sale order with no delivery note in the system: you want one, with the e-way bill fields — no invoice, no portal upload.

## 2. What the user will be able to do
- See what is still to ship, make a note for this truck (pieces, lot no., boxes, vehicle, e-way bill no.), post it so stock drops and the order shows what is open (a fully shipped order closes itself), and print it; a big load without an e-way bill no. is refused.

> Example: order SO-2611-0001, 1,000 housings HSG-MC at ₹185 + 18 % GST; 700 in Finished Goods. Truck 1 takes 600 → ₹1,30,980 with GST, above ₹50,000, so the e-way bill no. is required. Stock drops to 100, 400 stay open.

## 3. Screens
```
Pending dispatch   SO-2611-0001  Rane Brakes  HSG-MC  1,000  600  400  stock 100 [Short stock] [Dispatch]
```
Stores sees what is still to ship and clicks Dispatch.
```
Delivery notes  [All][Draft][Posted][Cancelled]   DN/26-27/1  Posted  Rane Brakes  1,30,980  E-way 1234 5678 9012
```
Everyone finds any note; drafts missing an e-way no. are flagged.
```
New delivery note   [x] HSG-MC  open 1,000  stock 700  Qty [600]  Lot [H-231]
Boxes  1 · 300 pcs · 41 / 44 kg      [! E-way bill needed]  Vehicle [MH12AB1234]  E-way no. [...]
                                     [Cancel] [Save draft] [Post note]
```
Stores picks pieces, boxes and truck, then posts.
```
DN/26-27/1 [Posted]          [Print] [More: Cancel note]   Lines | Boxes | Transport [Update transport]
```
Read a note, print it, change the vehicle, or (you only) cancel it.
```
DELIVERY NOTE - NOT A TAX INVOICE   DN/26-27/1 · SO-2611-0001 · Rane Brakes · 600 pcs · E-way 1234 5678 9012
```
The paper that rides with the truck.
```
SO-2611-0001 [Confirmed]   [Explode BOM] [Dispatch]     Delivery notes: DN/26-27/1 · 600 [Posted]
```
The sale order shows a Dispatch button and its notes.

## 4. Decisions for you
### Card 1 — Can a truck carry more pieces than are still open on the order?
- **A (recommended):** No. 400 open → a note for 401 is refused.
- **B:** Yes, up to a set margin over (for example 5 %).
- **For the factory user:** With A, stores asks the office to raise the order qty first. ERPNext and Odoo allow a margin, SAP does not; we took the stricter. **Cost:** A none; B about one day.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)

### Card 2 — E-way bill limit for customers in your own state?
- **A (recommended):** ₹50,000, the same as other states; you can change it later in company settings.
- **B:** ₹1 lakh.
- **For the factory user:** With A, more same-state trucks need an e-way bill no. before posting. Most states use ₹50,000, a few ₹1 lakh; Zoho and India Compliance keep it as a setting. **Cost:** none either way.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)

### Card 3 — Only part of an order ships. What happens to the rest?
- **A (recommended):** It stays open for the next truck; the order closes itself when all has shipped; to drop the rest, the office closes the order with a reason.
- **B:** Stores decides at every truck: keep the rest open or drop it.
- **For the factory user:** With A, stores can never drop an order by mistake. Sale orders: a fully shipped order closes itself and frees the stock it held. ERPNext works like A, Odoo asks like B, SAP sometimes closes by surprise. **Cost:** none either way.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)

### Card 4 — Can a posted delivery note be cancelled?
- **A (recommended):** Yes, with a reason: stock comes back at the cost it left, the order's open qty comes back.
- **B:** No; only a customer-return document fixes it (not built yet).
- **For the factory user:** With A, a wrong truck entry is fixed the same day; goods a customer sends back still need a return document later. Sale orders: an order closed as fully shipped opens again. ERPNext and SAP work like A, Odoo like B. **Cost:** A none; B no fix until returns are built.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)

### Card 5 — Packing list (boxes) on the note?
- **A (recommended):** Optional; when filled, each box has pieces, net and gross kg and lot no., and the boxes must add up to the note qty.
- **B:** No boxes, only the total pieces.
- **For the factory user:** With A, stores types the boxes when a customer wants a packing list; a wrong count stops posting. ERPNext and Odoo have it. **Cost:** A about one day; B none.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)

### Card 6 — Who may cancel a posted note (puts stock back)?
- **A (recommended):** Only you (owner).
- **B:** You and back office.
- **For the factory user:** With A, stores and office ask you; nobody can quietly put stock back. ERPNext gives "cancel" as its own right. **Cost:** none either way.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)

## 5. Decided for you — please confirm
- Stock leaves at the item's average cost; the average does not change.
- Stores picks the store the truck loads from (Finished Goods by default), never a job worker's place.
- Back office and floor supervisors make and post notes (stock leaves on their click, no second person); only you cancel.
- Floor supervisors see pieces, never sale prices, but do see "e-way bill needed" (hints the load is over ₹50,000).
- The e-way bill check uses the value with GST; the other-state limit stays ₹50,000 (law).
- Same state or other state is judged by the order's ship-to address, else the customer's.
- A draft does not hold stock; the check is at posting, so the second of two drafts may be refused.
- Price and GST come from the order at the moment of posting, then never change on the note.
- A note may be dated back to the order date, never in the future.
- A posted note can be cancelled while its order is on hold.
- Cancelling a note brings the stock back, but not the order's earlier stock claims; re-run the explosion.
- An item made inactive can't be shipped until it is active again.

Everything else: 79 edge cases (39 by ERP benchmark, 8 from the cards, 32 fixed system rules), 50 technical choices logged. No reading needed.

## 6. Not included
- Tax invoice, payment, e-way portal upload, transporter list, customer returns, over-delivery margin, several orders or trucks on one note, job-work challans.
