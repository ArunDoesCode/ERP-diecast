---
module: rfq
approved_on: 2026-11-20   # owner pre-approved recommended options in chat, 2026-11-20: "take ur own decision and record them and run whatever parallel subagents u want to complete a complete scm module according to my plan, ill do a complete merge in moring once completed"
---
# Asking suppliers for prices, and rate contracts — for your approval
## 1. What you asked for
Prices come by phone and paper, no comparison kept. You asked for: RFQ to several suppliers, quote comparison, award → PO, rate contracts. You were away and told us to decide, follow other ERPs and record it.
## 2. What the user will be able to do
- Purchase picks approved request lines and up to 10 suppliers, prints one sheet per supplier (no e-mail), and types each quote: rate, GST, freight, lead days, valid till, payment terms.
- The cheapest per line is marked; purchase picks a winner per line and one click makes one draft PO per winning supplier, which then goes through normal approval. You set rate contracts (supplier, item, rate, dates, optional quantity); every PO for that item uses that rate.
> Example: 1000 kg ADC12. Bharat ₹245/kg + ₹2,000 freight = ₹247/kg; Sri Metals ₹243 + ₹5,000 = ₹248/kg; Om ₹250.
> Bharat is marked cheapest. Bharat also has a contract at ₹244/kg from 1 Nov to 31 Dec, so the PO is made at ₹244/kg.
## 3. Screens
No pictures yet (sketches in the design folder): RFQ list, new RFQ, RFQ detail with print, quote entry, comparison and award, rate contract list / detail / form, and the PO line showing the "Contract" rate with an owner-only override.
## 4. Decisions for you
### Card 1 — Once a request line is out for quotes, can someone still make a PO from it directly?
- **A (recommended):** No. The PO comes only from the award, or after the RFQ is closed or cancelled. **B:** Yes, any time.
- **For the factory user:** With A the buyer cannot skip the quotes he asked for; the PO screen shows "On RFQ" on that line. ERPNext and Odoo do not lock (B); we chose the stricter. Cost: same.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 2 — What decides "cheapest"?
- **A (recommended):** Rate + freight per kg; GST shown but not added, since you claim it back. **B:** Rate + GST + freight.
- **For the factory user:** A ranks by what the metal really costs you. ERPNext only advises weighing tax and freight; Odoo and SAP rank on price alone. Cost: same.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 3 — Must the buyer write why when not picking the cheapest?
- **A (recommended):** Yes, always, one line. **B:** No.
- **For the factory user:** One extra line now and then; you can always see why a dearer supplier won. ERPNext, Odoo and SAP do not ask; we chose the stricter. Cost: same.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 4 — Can a PO carry a rate different from the contract?
- **A (recommended):** Only you, with a written reason. **B:** Anyone, with a warning.
- **For the factory user:** Back office cannot raise a contract price; you see who changed what and why. Purchase orders: rate, GST and unit are locked on contract lines. ERPNext can stop with an override role (A); SAP lets the buyer ignore the contract (B). Cost: same.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 5 — Ordering more than the contract quantity?
- **A (recommended):** Blocked; each contract can allow a set extra % (default 0 %). **B:** Warn only. **C:** Always 5 % extra.
- **For the factory user:** A stops over-buying; for more, you raise the extra % or make a new contract. PO approval also checks it. ERPNext caps with an allowance (A); SAP only warns (B). Cost: same.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 6 — Who does what?
- **A (recommended):** Back office sends RFQs, types quotes and awards (the PO still needs approval); only you make contracts and override contract rates. **B:** Back office also makes contracts.
- **For the factory user:** With A back office sees contracts but cannot create one. ERPNext and SAP split these by role; we chose the tighter split. Cost: same.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 7 — Alloy rates that change every month?
- **A (recommended):** A contract is one fixed rate with a required end date; a new price = end it and make a new one. **B:** Contracts with no end date.
- **For the factory user:** A means a few minutes a month to renew metal contracts, but no stale rate is ever used. Odoo allows no end date; ERPNext and SAP ask for one. Cost: same.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
## 5. Decided for you — please confirm
- A quote past its valid-till date cannot be awarded; the supplier must give a fresh quote.
- If a PO made from an award is cancelled or rejected, the line does not go back to the RFQ; a new request is needed.
- A PO counts against the contract quantity once approved, comes back if cancelled, and stays counted if short-closed.
- When the winning supplier has a contract for the item, the PO takes the contract rate, even if it is higher than the quote.
- Late quotes are accepted and marked "late" (judged on the day the quote is saved as final).
- Quoted freight goes into the PO notes; it is not added to the PO amount.
- Two contracts for the same supplier and item on overlapping dates are refused.
- Ending a contract early: dated today up to its end date; a draft PO tied to an ended contract must be re-priced.
- Contract rates and last PO rates show (in PO suggestions and the comparison) only to people who may make POs or see contracts.
- Awarding needs both the award right and the right to make POs.
- Cancelling a quote the supplier already gave needs the award right; the cancelled quote stays visible with who, when and why.
- On a PO line under a contract, GST and unit always come from the contract; nobody can change them.
Everything else: 64 edge cases decided (46 by ERP benchmark, 10 by the cards above, 8 fixed rules), 28 technical choices logged. No reading needed.
## 6. Not included
- E-mail / WhatsApp to suppliers, supplier portal; RFQs for job work or items not on a request; a minimum of three quotes.
- Quotes in another unit, splitting a line between suppliers, ordering less than requested; index-linked alloy rates (LME + premium), contract approval chain, auto-renewal, expiry alerts, freight as a PO cost line.
