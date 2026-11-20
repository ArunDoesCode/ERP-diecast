---
module: factory-flows
part: home
status: draft
index: spec.md
---

# Factory flows — Home (work queues)

> Part of `spec.md` (example data and shared rules BR-FF-01..08 are there). Rules BR-FF-10..33.
> Benchmark: Odoo activity counts Late / Today / Future per user (research Q1); ERPNext workspace
> shortcuts open lists. Adapted: count tiles per key, each opening its list already filtered.

## Page rules
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-FF-10 | Home is the page every signed-in user lands on after login and the first menu entry; it needs no key. | S logs in → Home, not the old empty Landing page |
| BR-FF-11 | Home shows only the tiles whose key (table below) the user holds, and the counts endpoint returns only those tiles' counts. | Q (grn.view, grn.qa_decide, sco.view, sco.qa_decide) → tiles 20, 28, 29 only; response has no PO or PR counts |
| BR-FF-12 | Clicking a tile opens its target list (or picker) already filtered to exactly the counted rows, in one click. | Click "Orders late 2" → PO list with filter "Late", 2 rows, filter chip visible and removable |
| BR-FF-13 | Tiles appear in this order for everyone, skipping tiles the user lacks: 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30; the plant head's first tile is "Waiting for my approval" (owner card 3 = A). | O (all keys) → "Waiting for my approval" first; S → 20, 21, 22, 27, 29, 30 |
| BR-FF-14 | A tile whose rows have a due date splits its count into Late (red), Today (orange) and Later (neutral); late = due before today, today = due today (BR-FF-08). | Goods expected: PO due 18-11, PO due 20-11, PO due 25-11 → "1 late · 1 today · 1 later", total 3 |
| BR-FF-15 | Clicking the Late part of a split tile opens the list filtered to the late rows only; clicking the tile body opens all its rows. | Click "1 late" → 1 row; click tile → 3 rows |
| BR-FF-16 | A tile with count 0 shows "Nothing waiting" in muted style and still opens its list. | No GRN pending QA → tile "Receipts to inspect — Nothing waiting"; click → empty list with its empty-state text |
| BR-FF-17 | A user who holds no tile key except tile 20 and has nothing pending sees "Nothing is waiting for you" and a link to each screen they can open. | Die designer (grn.view only), no approvals → message + link "Goods receipts" |
| BR-FF-18 | "My" tiles count only documents the user raised (`requestedBy` / `createdBy` = me). | S raised 2 drafts, B raised 1 → S's tile 21 = 2 |
| BR-FF-19 | If one count fails to load, that tile shows "—" with a retry; the other tiles still show. | Approval count errors → tile 20 "—  Retry", tiles 21–30 normal |
| BR-FF-31 | The plant head has no separate screen: their Home is the same page and shows every tile their keys allow. | O (owner seed keys) → tiles 20–30 all shown |
| BR-FF-32 | Counts are re-read when Home is opened or regains focus, and are at most 60 seconds old while it stays open. | Home open; B creates a PO in another tab; within 60 s tile 25 goes 0 → 1 |
| BR-FF-33 | Home has no money totals in tiles; it shows counts only. | Tile "Orders to send 2" shows no ₹ value |

## Tiles
Each tile row is one rule: key, what it counts, where it opens. Counts use only existing data.
| ID | Tile | Key | Counts | Split by | Opens |
|---|---|---|---|---|---|
| BR-FF-20 | Waiting for my approval | any signed-in | pending approval requests whose current step is me or my role, minus ones I already approved a level of (BR-APR-52, BR-APR-33); shows "oldest waiting since <date>" | — | Approvals inbox |
| BR-FF-21 | My requisitions to finish | `pr.manage` | my PRs in `draft`; those whose last approval request was sent back are marked "Sent back" | — | PR list, filter "Mine · Draft" |
| BR-FF-22 | My requisitions in approval | `pr.manage` | my PRs in `pending_approval` | — | PR list, filter "Mine · Pending approval" |
| BR-FF-23 | Requisitions to order | `po.manage` | PRs `approved` / `partial_ordered` with at least one `pending` line | earliest required-by date of pending lines (no date = Later) | PR list, filter "To order" |
| BR-FF-24 | Orders to send | `po.manage` | POs in `approved` (not yet sent) | expected delivery date | PO list, filter "Approved" |
| BR-FF-25 | My draft orders | `po.manage` | POs in `draft` created by me (incl. sent back) | — | PO list, filter "Mine · Draft" |
| BR-FF-26 | Orders late | `po.manage` | overdue POs as BR-PO-19, with open qty per BR-FF-09 (goods pending QA are not open) and today per BR-FF-08; the PO list "Late" filter uses the same predicate | — (all late) | PO list, filter "Late" |
| BR-FF-27 | Goods expected | `grn.edit_draft` | POs `dispatched` / `partial_received` with open qty (BR-FF-09) on any line | due date (revised, else expected) | Receive goods picker (BR-FF-61) |
| BR-FF-28 | Receipts to inspect | `grn.qa_decide` | GRNs with at least one line whose QA status is `pending` | received date (before today = Late) | GRN list, filter "QA pending" |
| BR-FF-29 | Job-work due back | `sco.view` | open job-work challans not fully settled, by the existing due status | existing due status (overdue = Late) | Challan list, filter "Open" |
| BR-FF-30 | Stock below reorder | `inventory.view` | active items whose reorder level is above 0 and stock is at or below it — the existing stock-list "Below reorder" flag | — | Stock list, filter "Below reorder" |

Examples (given → then), one per tile:
| ID | Example |
|---|---|
| BR-FF-20 | PR-2026-11-3 pending at level 1 = back_office → B's tile 1; O (not in step) → not counted |
| BR-FF-21 | S's PR-2026-11-3 sent back by B → status draft → S's tile 1, marked "Sent back" |
| BR-FF-22 | S submits PR-2026-11-3 → tile 21 goes 1 → 0, tile 22 goes 0 → 1 |
| BR-FF-23 | PR-2026-11-3 approved, line 1 on PO-2026-11-1, line 2 pending → counted; when line 2 is on a PO too → not counted |
| BR-FF-24 | PO-2026-11-1 approved → 1; after "Send to supplier" → 0 |
| BR-FF-25 | B's PO sent back by O → B's tile 1; O's tile 25 → 0 |
| BR-FF-26 | PO-2026-11-1 dispatched, due 2026-11-19, 400 kg open → 1; remaining 400 kg arrive (pending QA) → 0 |
| BR-FF-27 | PO-2026-11-1 dispatched, due 25-11, 1000 kg open → "1 later"; after GRN-2026-11-4 (600 kg, QA pending) still 1 (400 kg open) |
| BR-FF-28 | GRN-2026-11-4 line pending QA, received 19-11 → "1 late"; Q accepts → 0 |
| BR-FF-29 | Challan JWC/26-27/5 overdue, 50 pcs unsettled → "1 late" |
| BR-FF-30 | Die lube reorder 50 L, stock 20 L → 1; stock exactly 50 L → 1; reorder level 0 → not counted; inactive item → not counted |

## Choices made in this part (moved to `assumptions.md`)
Tile set and order, Late/Today/Later split, 60 s refresh, no money on Home: A-01..A-04. Open quantity
A-23, below reorder A-25, split tile component A-28.
