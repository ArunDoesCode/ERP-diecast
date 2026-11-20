---
module: stock-transfer
approved_on: 2026-11-20   # owner pre-approved recommended options in chat, 2026-11-20: "take ur own decision and record them and run whatever parallel subagents u want to complete a complete scm module according to my plan, ill do a complete merge in moring once completed"
---

# Stock transfer — for your approval
> You were away and said "take ur own decision and record them": every card is set to A.

## 1. What you asked for
Stock moves between stores and places in the plant without a document. Move it with a transfer document,
through the stock ledger, so every move is on record.

## 2. What the user will be able to do
- Stores saves a draft: a "from" place, a "to" place, up to 50 items; posting moves them in one go.
- A move needs enough stock at the "from" place at that moment, else nothing moves.
- Plant stock and value never change, only where the stock sits. A wrong move is reversed with a reason.
- "Move stock" on a stock-screen row opens a new transfer already filled in.

> Example: Main Store holds 1,500 kg ADC12 ingot at ₹213.33/kg. ST-2026-0001 moves 200 kg to Shop Floor.
> After posting: Main Store 1,300 kg, Shop Floor 200 kg, value moved ₹42,666.00, plant total still 1,500 kg.

## 3. Screens
```
Stock transfers   (All 12)(Draft 2)(Posted 9)          [ New transfer ]
ST-2026-0003  Draft   Main Store -> Shop Floor   2 lines  20 Nov
```
List: find a transfer; see which drafts still wait to be posted.
```
From [Main Store v]  To [Shop Floor v]
Item [ADC12 ingot v]  1,500 kg at Main Store  Qty [200] kg   [ Save draft ]
```
Form: build the draft; available stock shows beside each line.
```
ST-2026-0001 [Posted]  Main Store -> Shop Floor   [ New transfer ] [More: Reverse]
ADC12 ingot  200 kg  213.33  42,666.00   | Posted by Asha, 18 Nov
```
Detail: check the transfer and post it, reverse it, or start a new one.

## 4. Decisions for you
### Card 1 — Move stock in one go, or in two steps (sent, then received)?
- **A (recommended):** One go, out and in together (as SAP B1). **B:** Two steps with "in transit" (as ERPNext, Odoo).
- **For the factory user:** A: one click; places are walking distance apart. B: someone also confirms receipt.
- **Cost:** A none; B a larger build. **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 2 — Save as a draft first, then post — or move stock on save?
- **A (recommended):** Draft, then post (as ERPNext, Odoo). **B:** Moves on save (as SAP B1).
- **For the factory user:** A: lines are checked before stock moves, one extra click. B: faster, mistakes need a reversal.
- **Cost:** none either way. **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 3 — Add a general "Store" place type for Shop Floor, Quarantine, Re-melt bin?
- **A (recommended):** Yes, as many as needed (all three ERPs allow it). **B:** No; only Main Store, Finished Goods, Scrap Yard.
- **For the factory user:** B leaves nowhere to move raw stock to. **Other parts:** the location screen gets type "Store".
- **Cost:** A small; B none. **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 4 — Who may create and post transfers?
- **A (recommended):** Owner and back office; floor supervisor only views. **B:** Floor supervisor too (as ERPNext's default roles).
- **For the factory user:** A: stores keeps control of the count. B: the floor moves its own stock.
- **Cost:** none either way. **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 5 — Who may reverse a posted transfer?
- **A (recommended):** Owner and back office, with a written reason (as ERPNext: who posts may cancel). **B:** Owner only.
- **For the factory user:** A: stores fixes its own mistake the same day. B: it waits for you.
- **Cost:** none either way. **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 6 — Block transfers to or from a job worker's premises?
- **A (recommended):** Block; material goes out only on a job work challan (as all three ERPs). **B:** Allow plain transfers too.
- **For the factory user:** A: one way to send material out. **Other parts:** job work challan counts stay right.
- **Cost:** none either way. **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 7 — Can a transfer be dated in the past?
- **A (recommended):** No; dated when posted (as Odoo). **B:** Allow a past date (as ERPNext, SAP B1).
- **For the factory user:** A: stock history never changes later; yesterday's move is entered today with today's date.
- **Cost:** A none; B extra work to re-check older balances. **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)

## 5. Decided for you — please confirm
- Stock moves at the item's average cost; plant value never changes; an undo uses the original cost.
- An item with no cost can't be moved until a stock count fixes it.
- A move is refused if the "from" place lacks the stock at posting; an undo is refused if the stock was used.
- A posted transfer is never edited (reverse and redo); if one line fails, nothing moves.
- Inactive items, services, inactive or job-worker places are refused, on save and again at posting.
- An undo still works if the item was made inactive after the move.
- Moving to scrap yard or quarantine is not a write-off; no GST or price on any transfer.

Everything else: 53 edge cases decided by ERP benchmark, 41 technical choices logged. No reading needed.

## 6. Not included
- "In transit" moves, transfer requests, moves between companies or GST numbers, e-way bills.
- Racks, bins and batch numbers; issue to production and scrap sale (own documents later).
