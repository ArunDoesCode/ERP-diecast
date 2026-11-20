---
module: stock-transfer
status: frozen            # draft | frozen (set only by /freeze; change requests keep it frozen)
version: 1
frozen_on: 2026-11-20
owner: Arun
depends_on: [inventory, grn-stock]
brief: docs/briefs/stock-transfer.md
research: docs/research/stock-transfer.md
---

# Stock transfer

> Agent layer. The owner reads `OWNER.md`, not this file. ≤ 400 lines (above that: split by sub-module).
> Plain words, one sentence per rule. Tables and columns: `design/data.md`. Endpoints: `design/api.md`.
> Screens: `design/screens.md`. Code locations and history: `docs/modules/inventory.md`.
> Owner was away and delegated every decision (brief quote). Every owner-type point below is taken at
> the recommended option and listed under "Pending cards" for pass 2 to put in `OWNER.md`.

## Summary
A stock transfer is a document that moves one or more items from one of our own locations to another,
inside one site and one GSTIN. Back office (stores) makes it as a draft, then posts it; posting writes
two ledger rows per line (out of the source, into the destination) in one save. Plant stock and value
never change; only the per-location balance does. A wrong transfer is reversed, never edited.
Example data: item **ADC12 ingot** (kg), plant average cost **21333 paise/kg**, **Main Store** balance
**1500 kg**; transfer **ST-2026-0001** moves **200 kg** Main Store → **Shop Floor** (a `store` location),
value **4,266,600 paise** (₹42,666.00). Pieces example: **HSG-101 housing** (pcs), 50 pcs Finished Goods →
Scrap Yard.

## Who can do what
| Action | Key | Seed roles |
|---|---|---|
| list and open transfers | `inventory.view` (existing) | ow, bo, fs |
| create, edit, cancel a draft; post it | `stock_transfer.manage` (new) | ow, bo (Card 4) |
| reverse a posted transfer | `stock_transfer.reverse` (new) | ow, bo (Card 5) |

## Flow
| From | Action | To | Rule |
|---|---|---|---|
| — | create | draft | BR-STR-01..08 |
| draft | edit | draft | BR-STR-09 |
| draft | cancel | cancelled (no stock effect) | BR-STR-10 |
| draft | post | posted (two ledger rows per line) | BR-STR-11..18 |
| posted | reverse | reversed (mirror ledger rows) | BR-STR-19..23 |
| cancelled / reversed | any change | — (409) | BR-STR-09, 24 |

## Rules
IDs are permanent (strike out, never renumber). Tests are named by rule id.

### Document and lines
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-STR-01 | A transfer has one source location and one destination location for all its lines; both are required and must be different. | Main Store → Main Store → 400 "Source and destination must differ" |
| BR-STR-02 | Source and destination must exist (else 404) and be active (else 400), checked on save and again on post. | Shop Floor deactivated after the draft was saved, post → 400, nothing posted |
| BR-STR-03 | Neither location may be a `vendor_premise`; stock to or from a job worker moves only on a job work challan (Card 6); checked on save and again on post. | Main Store → "Vendor: Sharma Plating" → 400 "Use a job work challan" |
| BR-STR-04 | A transfer has 1 to 50 lines; each line has an item and a qty > 0; the same item may appear only once. | 0 lines → 400; ADC12 on two lines → 400 "Item already on this transfer" |
| BR-STR-05 | Line qty follows the item unit: up to 3 decimals, whole numbers for `pcs` and `set`, ≤ 1,000,000,000 (BR-INV-08, BR-GRN-48). | HSG-101 2.5 pcs → 400; ADC12 200.125 kg → ok |
| BR-STR-06 | A line item must be an active stock item; services and inactive items are refused (BR-INV-05, 10); checked on save and again on post. | line with an inactive item → 400; a service id → 400; ADC12 deactivated after the draft was saved, post → 400, nothing posted |
| BR-STR-07 | The client never sends cost or value; any cost field in the body → 400 (strict body). | line with `unitCostPaise: 1` → 400 |
| BR-STR-08 | On create the transfer gets the next number in the form `ST-<year>-<4 digits>`, status `draft`, and saves who and when; a draft has no stock effect. | first transfer of 2026 → ST-2026-0001, Main Store balance still 1500 kg |
| BR-STR-09 | Only a `draft` may be edited (locations, lines, note), saving who and when; editing a posted, cancelled or reversed transfer → 409 and nothing changes. | edit ST-2026-0001 after post → 409 |
| BR-STR-10 | A draft may be cancelled with no reason required; it becomes `cancelled`, keeps its number, saves who and when, and posts nothing. A cancelled transfer can't be posted; cancelling anything but a draft → 409. | cancel draft ST-2026-0002 → cancelled; post it → 409; cancel posted ST-2026-0001 → 409 |

### Posting
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-STR-11 | Posting a draft writes, per line, one `out` row at the source (−qty) and one `in` row at the destination (+qty), both referencing the transfer and its line, in one step (Card 1). | post ST-2026-0001 → Main Store −200 kg, Shop Floor +200 kg, status `posted` |
| BR-STR-12 | The whole transfer posts or nothing does: if any line fails, no ledger row is written, the draft stays a draft, and the error names the failing line. | line 2 short of stock → 409 "Line 2: insufficient stock at Main Store", line 1 not posted |
| BR-STR-13 | Each line needs source balance ≥ qty at that location at the moment of posting (per location, not plant total; BR-GRN-33). | Main Store 150 kg, plant total 900 kg, transfer 200 kg → 409 |
| BR-STR-14 | Both rows of a line carry the item's current plant average cost; row values are equal and opposite (BR-GRN-24), so the line nets to 0 paise. | 200 kg @ 21333 → −4,266,600 and +4,266,600 |
| BR-STR-15 | Posting never changes the item's current stock or average cost (one plant-wide average, BR-GRN-38). | before 1500 kg @ 21333 → after 1500 kg @ 21333 |
| BR-STR-16 | An item whose average cost is 0 can't be transferred; 400 "Item has no cost — fix by stock-take first"; checked on save and again on post. | legacy item average 0 → post → 400, nothing posted |
| BR-STR-17 | Only a `draft` can be posted; a second post (double click, two users) → 409 and no extra rows. | two posts at once → one 200, one 409; 2 ledger rows total |
| BR-STR-18 | Posting saves who and when; the posting time is the server time (no back-dating, Card 7). | posted by back office user at 10:42 → shown on the transfer |

### Reversal
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-STR-19 | Only a `posted` transfer can be reversed, as a whole (no line-by-line reversal); it needs a reason (1–500 characters). | reverse with no reason → 400; reverse posted ST-2026-0001 with "wrong store" → `reversed` |
| BR-STR-20 | Reversing writes, per line, an `in` row at the source and an `out` row at the destination for the same qty and the same cost as posted; ledger rows are never edited or deleted (BR-INV-20). | reverse ST-2026-0001 → Shop Floor −200 @ 21333, Main Store +200 @ 21333 |
| BR-STR-21 | Reversal is refused if the destination no longer holds the qty of any line; 409 naming the line, nothing reversed. | 120 kg already used from Shop Floor (80 left) → reverse → 409 "Line 1: only 80 kg left at Shop Floor" |
| BR-STR-22 | Reversal is refused if either location is now inactive (400); reactivate it first. An item made inactive after posting does not block reversal (the undo stays possible). | Shop Floor deactivated, reverse → 400; ADC12 deactivated, reverse → `reversed` |
| BR-STR-23 | Reversal never changes item current stock or average cost, even if the average moved since posting. | average now 21800, reverse → rows at 21333, average stays 21800 |
| BR-STR-24 | A reversed transfer is final: it can't be posted, edited or reversed again (409); to redo the move, create a new transfer. | reverse ST-2026-0001 twice → second 409 |

### Ledger, lists and next steps
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-STR-25 | Transfer rows appear in the movement list and per-location stock view like any posting, each naming "Stock transfer ST-…" as its source; reconciliation stays at zero rows (BR-GRN-41). | after post → movement list shows 2 rows linked to ST-2026-0001 |
| BR-STR-26 | The manual movement screen can't post the transfer reference types `stock_transfer` or `stock_transfer_reversal`: 400 "post from its source document" (extends BR-GRN-43's list). | POST manual movement with `stock_transfer` → 400 |
| BR-STR-27 | The transfer list is filterable by status, source, destination, item and created date (IST day), newest first, paged; from-date after to-date → 400. | filter status `draft` → only drafts; from 20 Nov, to 18 Nov → 400 |
| BR-STR-28 | Each transfer page offers its next step as the one primary action: draft → "Post transfer" (only with `stock_transfer.manage`); posted → "New transfer", with "Reverse" in the "More" menu as a destructive action (only with `stock_transfer.reverse`); cancelled / reversed → "New transfer". Without the key the action is not shown. | open a draft → primary button "Post transfer"; floor supervisor opens it → no post button |
| BR-STR-29 | The stock view offers "Move stock" (only with `stock_transfer.manage`) on an item's location balance, opening a new draft with that item and source filled in; not offered on a zero balance or a job worker location. | ADC12 row, Main Store 1500 kg → Move stock → draft, source Main Store, line ADC12; Shop Floor 0 kg → no button |
| BR-STR-30 | The draft shows each line's current source balance as a hint; the binding check is at posting (BR-STR-13). | draft line ADC12 → "1500 kg at Main Store" |
| BR-STR-31 | Screens follow design-system v2 (`docs/specs/design-system/spec.md`): status badges, list and detail page shape, confirm dialog on post and reverse. | post → confirm dialog "Move 1 line from Main Store to Shop Floor?" |

### Locations (change to the inventory spec)
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-STR-32 | A new location type `store` (not virtual, any number allowed, no supplier, name unique ignoring case as BR-INV-11) holds stock for sub-stores, shop floor, quarantine and re-melt bins (Card 3); it changes inventory BR-INV-11 and BR-INV-27. | create "Shop Floor" type `store` → saved, `isVirtual` false; "Quarantine" type `store` → saved |
| BR-STR-33 | Any pair of active non-vendor locations may be source and destination (`main_store`, `store`, `finished_goods`, `scrap_yard`); a move to the scrap yard or quarantine is not a write-off: item and value stay as they are. | Finished Goods → Scrap Yard 50 pcs HSG-101 → posted, plant stock of HSG-101 unchanged |

### Permissions
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-STR-34 | List and detail need `inventory.view`; create, edit, cancel and post need `stock_transfer.manage`; reverse needs `stock_transfer.reverse`; without the key → 403 and nothing changes. | floor supervisor posts a draft → 403, still draft; back office reverses with a reason → `reversed` |
| BR-STR-35 | A transfer carries no price, no tax and no accounting entry: it stays inside one site and one GSTIN. | post ST-2026-0001 → only the 2 ledger rows; no GST line, no journal |

## Security
Sensitive data:
| Data | Who may see it | Who may change it |
|---|---|---|
| Transfer and its lines (qty) | `inventory.view` | `stock_transfer.manage` (draft only) |
| Cost and value on transfer rows | `inventory.view` (same as stock view, BR-INV-19) | nobody (server sets it) |
| Status posted → reversed | `inventory.view` | `stock_transfer.reverse` |

Abuse cases:
| Who | Tries to | Stopped by |
|---|---|---|
| floor supervisor (view only) | create or post a transfer | key check → 403 (BR-STR-34) |
| back office | send a low cost to shift value between locations | BR-STR-07, BR-STR-14 |
| any user | move stock to a job worker without a challan | BR-STR-03 |
| any user | post the same draft twice to double the move | BR-STR-17 |
| any user | edit a posted transfer to hide a move | BR-STR-09, BR-STR-24 |
| any user | reverse after the stock was used, pushing a location negative | BR-STR-21 |
| any user | move stock the source does not hold | BR-STR-13 |

Audit: create, edit, cancel, post and reverse each save actor and time; reverse also saves the reason.
Ledger rows save `createdBy` (existing). A refused action writes nothing.

## Edge cases
Full list: `design/edge-cases.md` (pass 2). Every row there names a rule in this file.
| Source | Count |
|---|---|
| benchmark | 20 |
| owner | 8 |
| invariant | 25 |

## Owner cards (in `OWNER.md`; owner delegated, option A pre-approved in chat 2026-11-20)
| # | Card | Taken |
|---|---|---|
| 1 | Does a transfer move stock in one go, or in two steps (sent, then received at the other end)? | **A one go** — both sides post together; stores are walking distance apart. B: two steps with "in transit". (ERPNext/Odoo two-step, SAP B1 one-step.) BR-STR-11 |
| 2 | Save as draft first, then post — or post on save? | **A draft, then post** — lets the clerk check lines before stock moves (ERPNext/Odoo); SAP B1 posts on save. BR-STR-08, 11 |
| 3 | Add a general "store" location type so you can create Shop Floor, Quarantine, Re-melt bin? | **A yes** — today only one main store exists, so there is nowhere else to move raw stock. Also changes the location master screen (new type in the list). BR-STR-32 |
| 4 | Who may create and post transfers? | **A owner and back office** (stores keeps control). B: also floor supervisor. Who-table |
| 5 | Who may reverse a posted transfer? | **A owner and back office**, with a reason. B: owner only. Who-table, BR-STR-19 |
| 6 | Block transfers to or from a job worker's premises? | **A block** — stock goes out to job workers only on a job work challan, so the challan count stays right. BR-STR-03 |
| 7 | Can a transfer be dated in the past? | **A no** — dated when posted (Odoo); B: past date allowed (ERPNext, SAP B1). BR-STR-18 |

Confirm lines: `assumptions.md` rows tagged `confirm` (A-17, A-18, A-30..A-37), listed by name in `OWNER.md`.

## Not now
- Two-step transfer with "in transit" location and partial receipt / backorder (Card 1 = B later).
- Transfer request step (one person asks, another posts) — SAP B1 Transfer Request.
- Transfers between companies or GSTINs, delivery challan / e-way bill for branch moves.
- Bins and racks inside a location; batch-wise balances (batch number is not carried on transfer lines).
- Line-level source/destination different per line; printing a transfer slip.
- Feeding production (issue to job order) and scrap sale — they get their own documents.

## Open questions
Must be empty at freeze. Each one ends as an owner card in `OWNER.md` or a row in `assumptions.md`.
| # | Question | Goes to |
|---|---|---|
| — | none (pass 1 questions 1–6 answered in `design/` and logged as A-01..A-29) | |

## Changes to other modules
Change requests to frozen specs, raised by the coordinator after freeze. Not edited here.
| Spec | Rule | Change |
|---|---|---|
| inventory | BR-INV-11 | Location type list adds `store` (BR-STR-32). |
| inventory | BR-INV-27 | `store` → `isVirtual` false (BR-STR-32). |
| grn-stock | BR-GRN-43 | Document types refused on the manual movement screen add `stock_transfer`, `stock_transfer_reversal` (BR-STR-26). |
| auth-setup | permission list | New keys `stock_transfer.manage`, `stock_transfer.reverse`, seed roles ow, bo (BR-STR-34). |

## Changelog
- 2026-11-20 v0 — draft (pass 1; owner delegated, cards taken at recommended option).
- 2026-11-20 v0 — pass 2: designer questions folded in (BR-STR-03, 06, 16 re-checked on post; BR-STR-22
  reversal allowed with an inactive item; BR-STR-26 ref type names; BR-STR-27 created-date filter); new
  BR-STR-34 (permissions), BR-STR-35 (no tax); Card 7 (no back-dating); edge cases, assumptions, OWNER.md.
- 2026-11-20 v0 — pre-freeze review: BR-STR-28/29 actions shown only with their key, Reverse in "More",
  "New transfer" primary on posted; BR-STR-32 name unique as BR-INV-11; A-43..A-51 added (designer notes: batch balance, ledger query,
  migration, sort, date format, DB checks, `STR_RETRY`); A-24, A-26 updated (Reverse in More, reversed tone closed).
- 2026-11-20 v1 — frozen; OWNER.md approved on the owner's delegation (D-028): owner pre-approved recommended options in chat, 2026-11-20: "take ur own decision and record them and run whatever parallel subagents u want to complete a complete scm module according to my plan, ill do a complete merge in moring once completed"
