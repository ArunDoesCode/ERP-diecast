---
module: supplier-rating
approved_on: 2026-11-20   # owner pre-approved recommended options in chat, 2026-11-20: "take ur own decision and record them and run whatever parallel subagents u want to complete a complete scm module according to my plan, ill do a complete merge in moring once completed"
---
# Supplier rating — for your approval (you asked us to decide: every card is answered A, our recommendation)
## 1. What you asked for
Nobody can say which supplier delivers on time and good quality. Show on-time delivery, rejection rate and price variance per supplier, from the PO, GRN and QA data we already have. No scores typed in by people.
## 2. What the user will be able to do
- Purchase opens any supplier and sees a 0–100 score for the last 12 months with a Good / Watch / Poor label, plus on-time %, rejection % and price vs standard rate. Click any number to see the PO and GRN lines behind it.
- You compare all suppliers on one list, sorted by score or any measure; a 12-month table shows the trend. It updates by itself when a GRN or QA result is posted and never blocks a PO.
> Example: Sri Balaji Alloys, ADC12 ingot, 1,000 kg at ₹210/kg (standard ₹200), due 10 Nov. GRN 12 Nov: 980 kg accepted, 20 kg rejected → late by 2 days, price +5.0 %. Over 12 months 8 of 10 lines on time (80 %), 2 % rejected → 0.5 × 80 + 0.5 × 98 = 89 → Good.
## 3. Screens
Sketches only (not built yet): a Supplier rating list in the Procurement menu · a rating card with a 12-month table on the supplier page · a lines page per measure.
## 4. Decisions for you
### Card 1 — Is a delivery late against the first promised date or the revised date?
- **A (recommended, as SAP does):** First date. Due 10 Nov, revised to 20 Nov, arrives 15 Nov → late by 5 days. The revised date still shows beside it.
- **B:** Revised date. Same case → on time. (ERPNext uses whatever date is on the PO; Odoo has no on-time score.)
- **For the factory user:** With A, re-dating a PO cannot clean up a supplier's record. The overdue-PO list in purchase keeps using the revised date; only the rating uses the first one. **Cost:** none either way.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 2 — How many days late still count as on time?
- **A (recommended):** 0 days. Due 10 Nov, arrives 11 Nov → late. Early is always on time.
- **B:** 2 days grace. Arrives 12 Nov → on time. (SAP lets each plant set a tolerance; ERPNext has none built in.)
- **For the factory user:** A is strict: a supplier one day late every time shows it. **Cost:** none either way.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 3 — Should a line that is past due and not yet delivered already lower the score?
- **A (recommended):** Yes, from the day after it is due. Due 10 Nov, nothing by 20 Nov → counted late, "10 days and counting".
- **B:** Only once it arrives. (SAP and ERPNext count deliveries only; A is stricter.)
- **For the factory user:** With A, a supplier sitting on an order shows up now, not after it finally comes. **Cost:** none.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 4 — Should paying above the standard rate lower the score?
- **A (recommended):** No, price shows beside the score. Paid ₹210 vs ₹200 → "+5.0 %", score stays 89.
- **B:** Yes, price is a third part of the score. (SAP scores price; ERPNext only if you set it up; Odoo has no price measure.)
- **For the factory user:** Ingot prices follow the metal market; with B a supplier loses points for a market rise. **Cost:** none.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 5 — How much does delivery count against quality?
- **A (recommended):** 50 / 50. On-time 80 %, rejection 2 % → 89.
- **B:** 40 delivery / 60 quality → 90.8, shown as 91. (ERPNext and SAP let you set weights; Infor splits equally.)
- **For the factory user:** A treats a late lot and a bad lot as equally painful. Weights are fixed in this version. **Cost:** none.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 6 — Fewest delivered lines before a score is shown?
- **A (recommended):** 5. A supplier with 3 lines shows "Not enough data (3 of 5 lines)"; its measures still show.
- **B:** 3, so new suppliers get a score sooner. (ERPNext, Odoo and SAP have no minimum; one delivery can swing 0 to 100.)
- **For the factory user:** With A, one bad first lot does not brand a new supplier Poor. **Cost:** none.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 7 — Where do Good / Watch / Poor start?
- **A (recommended):** Good 80–100, Watch 60–79, Poor below 60. 89 → Good, 72 → Watch, 55 → Poor.
- **B:** Thirds: Good above 67, Poor below 33. (ERPNext lets you define bands; Infor uses thirds; A is stricter.)
- **For the factory user:** The label only informs; no PO is ever blocked. **Cost:** none.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
## 5. Decided for you — please confirm
- Only you and back office see ratings (they show PO prices and supplier names); floor supervisor, QA and stores do not.
- Rejection % is by value (qty × PO rate), so kg of ingot and pieces of castings are never added together.
- Delivery counts on the GRN date as soon as the goods are received, even while the GRN is in draft or QA: gate 9 Nov, QA 12 Nov, due 10 Nov → on time.
- A short-closed line is judged on the day it was short-closed: closed after the due date → late.
- QA "waived" is treated like QA bypassed: left out of rejection % and shown as "not inspected" with its rejected qty.
- An item with no standard rate is compared with this supplier's previous PO rate for it.
- If you remove the rating right from back office, it comes back on the next server restart (same as every right today).
Everything else: 48 edge cases decided by ERP benchmark, 34 technical choices logged. No reading needed.
## 6. Not included
- Settings screen for weights, grace or bands · leaving tooling / die POs out · job-work delays and rejects · returns after acceptance · rejects by heat number · warning or blocking POs to Poor suppliers · export or e-mail.
