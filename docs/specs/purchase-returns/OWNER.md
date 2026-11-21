---
module: purchase-returns
approved_on: 2026-11-20   # owner pre-approved recommended options in chat, 2026-11-20: "take ur own decision and record them and run whatever parallel subagents u want to complete a complete scm module according to my plan, ill do a complete merge in moring once completed"
---
# Purchase returns — for your approval
## 1. What you asked for
QA-rejected or extra GRN qty goes back to the supplier with a debit note; stock goes out through the stock book.
## 2. What the user will be able to do
- Stores press "Return to supplier" on a GRN; rejected qty is filled in. Owner or back office posts it.
- On post: good stock leaves at the GRN rate, a debit note with GST and a numbered truck challan are made.
- GRN, PO and supplier bill show what went back; a posted return is only cancelled with a reason.
> Example: GRN-1 brought 1,000 kg ADC12 at ₹210/kg; 20 kg rejected (porosity, heat H-881). Return 20 kg →
> stock unchanged (rejects never entered it); debit note ₹4,200 + CGST ₹378 + SGST ₹378 = ₹4,956.
## 3. Screens
Returns list + "Awaiting return" tab · return form from the GRN · return detail · debit note and challan prints.
## 4. Decisions for you
### Card 1 — Rejected goods: keep them off the stock books, or in a "Rejected" store?
- **A (recommended):** Off the books, as today; the return records them leaving, stock does not change.
- **B:** A "Rejected" store; rejects enter it at GRN and leave on return (ERPNext). **Cost:** A none, B ~2 days.
- **For the factory user:** A: stock shows good metal only; the Awaiting tab lists rejects. Odoo and SAP keep no reject store.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 2 — Can stock that passed QA (wrong grade found later, extra delivered) go back?
- **A (recommended):** Yes, with a reason; only owner or back office posts it; stock leaves at the GRN rate.
- **B:** No, only rejected qty can go back. **Cost:** none either way.
- **For the factory user:** A covers excess and late finds; metal already used can't go back. ERPNext, Odoo, SAP allow it.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 3 — After good stock goes back, does the PO wait for a replacement?
- **A (recommended):** Credit only; tick "replacement expected" to reopen the PO for a new GRN.
- **B:** Always reopen the PO. **Cost:** none either way.
- **For the factory user:** A: PO stays received unless stores tick the box. ERPNext and Odoo don't reopen; SAP by a setting. Supplier bills: goods sent back can't be billed.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 4 — Can goods go back after the supplier's bill is entered?
- **A (recommended):** Yes; the debit note names that bill and the bill's payable drops by the good-stock value.
- **B:** No; block the return once billed (SAP, which wants a supplier credit note). **Cost:** none either way.
- **For the factory user:** A: bills usually arrive with the truck, so B would block most returns. ERPNext allows it.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 5 — Who can post a return (goods leave, debit note made)?
- **A (recommended):** Owner and back office post; stores and floor supervisor prepare the draft.
- **B:** Stores post their own returns. **Cost:** none either way.
- **For the factory user:** A adds one office click before the truck leaves. ERPNext and SAP give "submit" its own right.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 6 — Print a return challan for the truck as well as the debit note?
- **A (recommended):** Yes, with its own number series per financial year (GST wants consecutive numbers).
- **B:** Debit note only. **Cost:** A half a day, B none.
- **For the factory user:** A: the driver carries a challan, accounts keep the debit note. ERPNext, Odoo, SAP print the return document. Your CA should confirm.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
## 5. Decided for you — please confirm
- Stock goes back out at the original GRN rate; stock already used in production can't be returned.
- Many returns per GRN, never more than received in total (unposted drafts count too); one return covers one GRN.
- The debit note never moves stock; a posted return is never edited, only cancelled with a reason (stock comes back).
- GST: CGST + SGST inside the state, IGST across states, rounded per line; a supplier with no GSTIN counts as same-state.
- The return challan gets its own number series per financial year.
- Goods sent back can't be billed by the supplier, even when a replacement is coming.
- A debit note is set against one approved bill for those goods; rejected qty never lowers that bill.
- Stores and floor supervisor prepare returns, QA can view, owner and back office post and cancel.
- The person who prepared a return may also post it; both names are kept.
- Returns still work when the supplier or item has since been made inactive.
Everything else: 46 edge cases decided by ERP benchmark, 35 technical choices logged. No reading needed.
## 6. Not included
- Debit note without sending goods back; job-work returns; several GRNs on one return; e-way bill, accounts, payments.
