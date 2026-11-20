---
module: supplier-invoice
approved_on: 2026-11-20   # owner pre-approved recommended options in chat, 2026-11-20: "take ur own decision and record them and run whatever parallel subagents u want to complete a complete scm module according to my plan, ill do a complete merge in moring once completed"
---
# Supplier invoice and 3-way match — for your approval
> The only file you read. No links, no rule ids. You delegated every choice; each card shows the one we took.
## 1. What you asked for
Supplier bills are checked by hand against the PO and the GRN. You want: invoice against PO + GRN, 3-way match with tolerance, GST, payable status. No payments, no accounting entries.
## 2. What the user will be able to do
- Accounts opens a received GRN, clicks "Enter supplier invoice" (lines come filled with received kg, PO rate, GST) and types the bill number, date, rates, and the tax and total printed on the paper bill.
- On submit the system checks qty against our GRN, rate against the PO, and GST against its own sum.
- A clean bill becomes "Payable" at once; a failing one is saved as "Blocked" with the reason per line, then fixed (back to draft) or released by you with a reason. Bills past due show "Overdue".
> Example: PO for ADC12 ingot, 1,000 kg at ₹240/kg, GST 18%. GRN accepted 980 kg. Bill: 980 kg × ₹240 = ₹2,35,200 + CGST ₹21,168 + SGST ₹21,168 = ₹2,77,536 → Payable. Same bill at ₹241/kg → Blocked "Price: PO ₹240, bill ₹241".
## 3. Screens (sketches only; pictures come once the backend exists)
- List: bills by Draft, Blocked, Payable, Overdue, Cancelled, with counts and search. Entry: one page, our figures and the printed figures side by side, with the expected result before submit.
- Detail: why it is blocked, the lines, totals, debit notes, history; Release, Back to draft, Cancel. Settings: two tolerance boxes.
## 4. Decisions for you
### Card 1 — How much above the PO rate may a bill be before it is blocked?
- **A (recommended):** 0%: any rate above the PO blocks; a lower rate passes. **B:** 1%. **C:** 2%. **Effect:** with A every ingot price rise waits for your release; B/C let small rises through unseen. SAP blocks above a set limit, ERPNext checks the PO rate, Odoo has no limit. Changeable later in settings. Same build time.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 2 — How much more weight than our GRN may a metal bill show?
- **A (recommended):** 0.5% (980 kg received → up to 984.9 kg passes). **B:** 1%. **C:** 2%. Pieces always match exactly. **Effect:** small weighbridge gaps pass; bigger ones wait for release. ERPNext and SAP use one limit for all items, Odoo none. Changeable in settings. Same build time.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 3 — Who may release a blocked bill?
- **A (recommended):** you only, and never anyone who entered, changed, submitted or sent back that bill. **B:** you and back office. **Effect:** with A, a bill you typed yourself needs someone else with the right, or goes back to draft. ERPNext, Odoo and SAP leave this to roles; none forbid self-release. Same build time.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 4 — Same bill number from the same supplier twice in one financial year?
- **A (recommended):** refused; another supplier, a cancelled bill or the next year is fine. **B:** warn and allow. **Effect:** stops paying one bill twice. ERPNext refuses, Odoo and SAP warn; GST law says one number per year. Old bills recorded on the PO also count. Same build time.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 5 — Freight, packing or tooling charges on a bill?
- **A (recommended):** allowed as separate charge lines (max 10), but the bill then waits for release. **B:** allowed and passes. **C:** not allowed. **Effect:** charges are not on our PO, so with A you see each one before it is payable. ERPNext, Odoo and SAP accept charge lines without a check. Same build time.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 6 — A payable bill turns out to be wrong?
- **A (recommended):** cancel it with a reason and enter it again; its kg become billable again. **B:** send it back to draft and edit. **Effect:** the wrong bill stays on record. ERPNext and SAP cancel, Odoo resets to draft. Same build time.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 7 — The old "Record invoice" button on the PO?
- **A (recommended):** removed; the PO turns "Invoiced" by itself when every received kg (less returns) is on a payable bill, and back if that bill is cancelled; bills recorded the old way stay readable and those POs can't be billed again. **B:** keep both. **Effect:** purchase loses a button; the PO status can no longer be set without a match. No ERP has such a button. Same build time.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
## 5. Decided for you — please confirm
Cases that change money, stock, tax or who may do what, where ERPNext, Odoo and SAP agree. Say "no" to a line and it becomes a card.
- A bill that passes every check is payable at once; one that fails is saved as blocked, never refused.
- Only kg that passed QA can be billed, minus kg sent back to the supplier; a draft bill holds its kg.
- A rate below the PO rate passes, marked "below PO rate".
- A GST % different from the PO line blocks the bill.
- Printed tax and total may differ from our figures by up to ₹1 (rounding).
- Tax split (CGST + SGST or IGST) follows the supplier's state vs ours, fixed at submit.
- A supplier without GSTIN who charges GST: the bill is blocked.
- No input-tax postings and no 180-day unpaid warning in this version.
- The match uses the figures typed from the paper bill; no bill photo yet. Cancelling a payable bill needs a reason of 10+ characters.
- Due date = bill date + the PO's payment terms.
- A short-closed or closed PO can still be billed for what was received.
- A GRN line already billed can't be corrected down until its bill is cancelled.
- A deactivated supplier can still be billed for goods already received.
- Goods sent back: the debit note is attached to the bill that charged those kg and lowers what is payable on it, never twice.
- Not even an admin may release a bill they entered, changed, submitted or sent back.
- Accounts can read the two tolerances, and see PO and GRN numbers and statuses on a bill, without other PO or GRN rights.
Everything else: 84 edge cases decided by ERP benchmark, 30 technical choices logged. No reading needed.
## 6. Not included
- Payments, accounting entries, GST return matching; bills before goods arrive; job-work bills; one bill across several POs; photo of the paper bill; a wider price limit for metal only.
