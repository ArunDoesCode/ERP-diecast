---
module: sale-order
approved_on: 2026-11-20   # owner pre-approved recommended options in chat, 2026-11-20: "take ur own decision and record them and run whatever parallel subagents u want to complete a complete scm module according to my plan, ill do a complete merge in moring once completed"
---

# Sale order and BOM explosion — for your approval
> You were away and pre-approved the recommended options (chat, 2026-11-20). Say "no" to anything below to change it.
## 1. What you asked for
When an order comes in, see the same day what metal, inserts and job work it needs and what is missing, and get drafts to buy it.
## 2. What the user will be able to do
- Back office keeps a customer list and enters orders: lines, price, GST rate, delivery date per line.
- Planning presses "Explode BOM": every BOM level worked out, stock and open orders netted; purchase ticks the
  short lines and gets draft requests and job-work orders for normal approval. A fully shipped order closes itself.
> Example: Rane Brakes orders 1,000 machined housings HSG-MC at ₹185 for 15 Jan (₹1,85,000 before GST).
> No HSG-MC in stock → draft job-work order to Sai CNC: send 1,021 rough castings (2 % loss), get 1,000.
> 200 rough castings on the shelf → cast 821, pour 865 (5 % rejects) → ADC12 need 723.8 kg.
> 50 kg free (another order holds 50) + PO 120 kg due 10 Jan → draft request 553.8 kg ADC12 + 1,230 bushes.
## 3. Screens
Customers (list, form) · Sale orders (list, form, detail with the next step) · Explosion (tick short lines, "Create drafts").
## 4. Decisions for you
### Card 1 — After an order is confirmed, may the office change it?
- **A (recommended):** More qty, price, GST, dates, new lines: yes. A cut or removal on any line waits until all open drafts raised from this order are cancelled.
- **B:** Lock the order; any change means cancel and enter it again.
- **For the factory user:** A follows customer revisions without purchase buying for a cut order. B means re-typing orders. Other ERPs: ERPNext limited edits, Odoo can lock, SAP edits until shipped. Cost: none.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 2 — Count castings already on the shelf before buying alloy?
- **A (recommended):** Yes. The 200 rough castings cut the alloy need from 900.1 kg to 723.8 kg.
- **B:** No; work alloy out from the full order.
- **For the factory user:** A buys less metal but needs correct casting stock counts. Other ERPs: ERPNext and SAP net every level; Odoo per route. Cost: none.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 3 — A PO arriving after the customer's date: count it as cover?
- **A (recommended):** No. If the 120 kg PO came on 20 Jan, the request would be 673.8 kg, not 553.8 kg.
- **B:** Yes, every open PO counts.
- **For the factory user:** A shows late supply as a gap to chase. Other ERPs: SAP and Odoo go by date; ERPNext counts all. Cost: none.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 4 — Two orders need the same short stock: who gets it?
- **A (recommended):** The order exploded first keeps it; the later order shows the gap (the other order's 50 kg above).
- **B:** The earlier delivery date takes it, even from an order already exploded.
- **For the factory user:** A never makes an order short after its requests are raised. Other ERPs: ERPNext and MRPeasy first-come; SAP re-plans by date. Cost: none.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 5 — One part with several delivery dates: how entered?
- **A (recommended):** One order, the same part on several lines, one date each (500 on 15 Jan, 500 on 15 Feb).
- **B:** One order per date.
- **For the factory user:** A keeps one order per customer PO. Other ERPs: ERPNext, Odoo and SAP all allow a date per line. Cost: none.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 6 — How many draft purchase requests per explosion?
- **A (recommended):** One per "Create" click with all ticked items (ADC12 + bushes = one request, 2 lines).
- **B:** One per supplier.
- **For the factory user:** A gives one document to approve; purchase splits by supplier when making POs. Other ERPs: ERPNext one request; SAP and Odoo per supplier. Cost: none.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
## 5. Decided for you — please confirm
- Sale orders need no approval; whoever may enter orders confirms them. Requests made from an explosion follow the sale-order approval policy.
- Rights are split: office enters orders, planning explodes, raising drafts also needs purchase or job-work rights.
- Floor supervisors don't see sale orders or prices; order readers see linked request numbers, only planners see job-worker names.
- Only requests made from the explosion tie to an order; a request typed by hand naming an order is a note only, and only for confirmed orders.
- Ticked qty can't exceed the shortage; free stock = plant stores minus scrap yard, job workers' premises and other orders' holds.
- An order with open drafts can't be cancelled, and a cut or removal on any line waits until all open drafts raised from this order are cancelled.
- Draft requests and draft POs count as stock on the way, so a re-run doesn't ask twice.
- New customer list (name, state, address, GSTIN), kept by owner and back office.
- Each line stores its GST rate; the order shows value before tax; GST is worked out on the delivery note.
- A fully shipped order closes itself; cancelling that delivery reopens it. Closed by hand stays closed.
- Optional ship-to address and state on the order. Shipping goods frees the order's hold on that stock.
Everything else: 73 edge cases decided by ERP benchmark, 59 technical choices logged. No reading needed.
## 6. Not included
- Invoice, payment, quotation, order approval, production planning, auto re-run, customer price lists, credit limits.
