---
module: sale-order
status: frozen            # draft | frozen (set only by /freeze; change requests keep it frozen)
version: 1
frozen_on: 2026-11-20
owner: Arun
depends_on: [bom, purchase-requisition, subcontracting, inventory, approval, auth-setup, dispatch]
brief: docs/briefs/sale-order.md
research: docs/research/sale-order.md
---

# Sale order and BOM explosion

> Agent layer. The owner reads `OWNER.md`, not this file. ≤ 400 lines (above that: split by sub-module).
> Plain words, one sentence per rule. Tables and columns: `design/data.md`. Endpoints: `design/api.md`.
> Screens: `design/screens.md`. Code locations and history: `docs/modules/sale-order.md` (not written yet).
> Owner delegated every decision (brief, 2026-11-20): cards are answered A (pre-approved), agent choices
> are in `assumptions.md`.

## Summary
Back office enters a customer's sale order (SO) and confirms it. Planning then runs "Explode BOM": the
system walks the released BOM of every line, level by level, and shows per item the need, free stock,
open supply and the net shortage. Purchase picks shortage lines and gets draft PRs (bought items) and
draft SCOs (job-work steps) that go through the normal PR / SCO approval. Done on the floor = an order
comes in and purchase sees, the same day, exactly what alloy, inserts and job work are missing.

Example data used by every rule (unless the rule says otherwise):
- Customer "Rane Brakes" (active, Tamil Nadu 33). SO-2611-0001, line L1: HSG-MC (machined housing, pcs)
  1000 pcs at 18,500 paise, GST 18 %, delivery 15 Jan 2027. SO value 18,500,000 paise (before tax).
- BOMs are the BOM spec's example (`docs/specs/bom/spec.md` Summary): HSG-MC job-work BOM rev A (send 1
  HSG-RC → get 1 HSG-MC, Sai CNC, "CNC machining", loss 2 %); HSG-RC casting BOM rev A (ADC12, net 0.850
  kg, shot 2.000 kg, 2 cavities, melt loss 3 %, reject 5 %, insert BUSH-M6 2 per piece).
- Stock and supply: HSG-MC 0; HSG-RC 200 free; ADC12 100 kg on hand of which 50 kg reserved for
  SO-2611-0002, open PO 120 kg due 10 Jan 2027; BUSH-M6 500 pcs free.
- Result: HSG-MC net 1000 → send 1021 HSG-RC → SCO to Sai CNC; HSG-RC need 1021, net 821 → pour 865
  (cast in-house); ADC12 need 723.800 kg (697.850 + 25.950), net 553.800 kg → PR; BUSH-M6 need 1730,
  net 1230 pcs → PR.

## Who can do what
Super-admin passes every check. Keys are new in `backend/src/lib/permissions.ts` unless marked.
| Action | Key | Seed roles |
|---|---|---|
| view customers, SOs, explosions | `so.view` | ow, bo (not fs: sale prices stay off the floor, A-03) |
| create / edit customers | `customer.manage` | ow, bo |
| create / edit / confirm / hold / resume / close / cancel SO | `so.manage` | ow, bo |
| run explosion | `so.explode` | ow, bo |
| create draft PRs from an explosion | `so.explode` + `pr.manage` (existing) | ow, bo |
| create draft SCOs from an explosion | `so.explode` + `sco.manage` (existing) | ow, bo |
| approve the drafts | existing PR / SCO approval chain | |
| close as "fully delivered" / reopen (only as a side effect of posting / cancelling a delivery note) | `dispatch.manage` (dispatch spec) | per dispatch spec |

## Flow
| From | Action | To | Rule |
|---|---|---|---|
| — | create | draft | BR-SO-05 |
| draft | edit | draft | BR-SO-10 |
| draft | confirm | confirmed | BR-SO-12 |
| confirmed | edit (limited) | confirmed | BR-SO-13, 14 |
| confirmed | hold | on_hold | BR-SO-16 |
| on_hold | resume | confirmed | BR-SO-16 |
| confirmed / on_hold | close by hand | closed (by hand) | BR-SO-17 |
| confirmed | delivery note posted, every line open qty 0 | closed (fully delivered) | BR-SO-54 |
| closed (fully delivered) | a delivery note of it cancelled | confirmed | BR-SO-55 |
| draft | cancel | cancelled | BR-SO-18 |
| confirmed / on_hold | cancel (nothing delivered, nothing live linked) | cancelled | BR-SO-18, 19 |
| confirmed SO | explode | new current snapshot; older one superseded | BR-SO-21, 36 |
| current snapshot | create drafts | draft PR / draft SCO | BR-SO-40, 42, 46 |

`cancelled` and `closed (by hand)` are final. `closed (fully delivered)` reopens only through BR-SO-55.

## Rules
One sentence per rule, plus one example. IDs are permanent (strike out, never renumber).
"Today" is the plant's calendar day in IST (Asia/Kolkata), on server and in date pickers (D-022).

### Customers
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-SO-01 | A customer has a name (unique, ignoring case and outer spaces), a state, an address and an optional GSTIN; a GSTIN must be 15 characters in the GST format and its first two digits must match the state code. | "rane brakes " when "Rane Brakes" exists → 409; GSTIN 33… with state Karnataka (29) → 400 |
| BR-SO-02 | Customers are never deleted, only deactivated; an inactive customer can't get a new SO or be picked on a draft, but its open SOs carry on. | deactivate Rane Brakes, create SO → 400; its confirmed SO-2611-0001 → still explodes |
| BR-SO-03 | Creating or editing a customer needs `customer.manage`; reading needs `so.view`. | user holding only `so.view` edits a customer → 403 |

### Sale order header and lines
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-SO-04 | Every SO endpoint needs a login (401) and its key from "Who can do what" (403 `PERMISSION_DENIED`). | fs (floor supervisor) seed user opens the SO list → 403 |
| BR-SO-05 | Create saves header and all lines in one transaction as `draft`, `createdBy` = me, number `SO-<period>-<seq>` from the shared counter (D-019), never reused. | two creates at once → different numbers; line 2 has a bad item → 400, nothing saved |
| BR-SO-06 | Header needs an active customer, an order date (not in the future) and at least one line; customer PO number (≤ 50 chars) and its date are optional, but the same customer PO number twice for one customer (cancelled SOs excluded) → 409 naming the other SO. | customer PO "RB/4471" already on SO-2611-0001 → 409 "already on SO-2611-0001" |
| BR-SO-07 | Each line has an active item, a quantity > 0, a unit price ≥ 0 in integer paise and a delivery date not before today (checked on create and when that line's date is changed, never on untouched lines); the unit is copied from the item master, and quantity must be whole when the unit is pcs or set (else up to 3 decimals). | 10.5 pcs → 400; price 185.5 paise → 400; delivery set to yesterday → 400; price 0 (sample) → ok; L1 already overdue, change only its price → ok |
| BR-SO-08 | The same item may appear on several lines only with different delivery dates (a customer schedule); same item and same date twice → 400. | HSG-MC 500 on 15 Jan + 500 on 15 Feb → ok; HSG-MC twice on 15 Jan → 400 |
| BR-SO-09 | Each line carries `deliveredQty`, starting at 0 and written only by the dispatch module (BR-DSP-14 up on note post, BR-DSP-31 down on note cancel); open qty = qty − delivered qty, and the explosion uses open qty. | L1 1000, delivered 600 → explosion uses 400; any SO edit sending `deliveredQty` → 400 |
| BR-SO-10 | A draft SO can be fully edited (header, add, change, delete lines) by any `so.manage` holder; edit can't set `status` (400) and can't leave zero lines (400). | PATCH `status: confirmed` → 400; delete the only line → 400 |
| BR-SO-11 | SO value = Σ round(line qty × unit price) in integer paise, before tax, recomputed on every line change; the SO calculates no GST amount (the delivery note does, from each line's GST %, BR-SO-57). | 1000 × 18,500 at 18 % → SO value 18,500,000 paise, no tax total on the SO |
| BR-SO-12 | Confirm moves `draft` → `confirmed` only if the customer and every line item are still active and every delivery date is not before today; it records who and when. | item deactivated after draft saved, confirm → 400 naming the item |
| BR-SO-13 | On a confirmed SO only these may change: line qty, unit price, GST %, delivery date, notes, ship-to, new lines, and deleting a line (a soft removal, BR-SO-60); customer and an existing line's item never change (409). | change L1 item to HSG-MD → 409; L1 price 18,500 → 18,000 → ok, logged |
| BR-SO-14 | On a confirmed SO a line qty can't drop below its delivered qty, a line with delivered qty > 0 can't be deleted (409 `SO_LINE_DELIVERED`), and no line's qty can drop nor any line be deleted while a live PR or SCO line raised from this SO exists — SO-wide, not only for the line it came from (stricter) (BR-SO-53); the 409 names those documents. | PR-2611-0007 (draft) raised from SO-2611-0001 for L1, cut L2 → 409 naming PR-2611-0007; delete L1 with 100 delivered → 409 `SO_LINE_DELIVERED`; L1 1000 → 1200 → ok |
| BR-SO-15 | "Live" means: a PR line in `pending` or `po_draft` on a PR that is not rejected or cancelled, or an SCO in `draft`, `pending_approval` or `approved` with nothing issued. | PR line `ordered` → not live; SCO `material_issued` → not live |
| BR-SO-53 | A PR or SCO line is "raised from this SO" only when it is linked to a row of any snapshot of this SO (BR-SO-46); a PR whose `saleOrderId` was set by hand is information only — it locks nothing and counts as ordinary open supply; BR-SO-14, 19 and 33 use this test. | PR-2611-0009 typed by hand with saleOrderId SO-2611-0001 → L1 cut allowed, PR counted under open PR like any PR; SCO-2611-0003 made from E1, E1 now superseded → still counts |
| BR-SO-59 | Every line id and `removeLineIds` entry in an SO edit must belong to that SO (checked after the SO row lock), else 404 and nothing is saved. | PATCH SO-2611-0001 with line id of SO-2611-0002 → 404 |
| BR-SO-60 | Removing a line from a confirmed SO is a soft removal (kept, marked removed, left out of value, explosion and dispatch); a line with delivered qty > 0 can't be removed (409 `SO_LINE_DELIVERED`); line numbers come from a per-SO counter and are never reused. | remove L2 (delivered 0) → L2 hidden, next new line is L3; remove L1 (delivered 100) → 409 |
| BR-SO-61 | Reason, notes and customer PO number are trimmed before their length checks; every date (order, customer PO, delivery, return) must lie between 2000-01-01 and today + 5 years (400). | reason "   ab  " → 400 (2 chars); delivery 15 Jan 2099 → 400 |
| BR-SO-16 | Hold (`confirmed` → `on_hold`) needs a reason of 3–500 chars; resume returns it to `confirmed`; while on hold the SO can't be edited, exploded or used to create drafts (409), and its reservations stay. | on_hold SO, explode → 409 |
| BR-SO-17 | Close by hand (`confirmed` / `on_hold` → `closed`) needs a reason of 3–500 chars, is recorded as "closed by hand" and is final, releases all its reservations, and leaves every linked PR / SCO untouched. | close SO-2611-0001 with PR-2611-0007 approved → SO closed, PR stays approved |
| BR-SO-18 | Cancel needs a reason of 3–500 chars; a draft can always be cancelled; a confirmed or on-hold SO only if no line has delivered qty > 0 (else 409 "close instead"). | delivered 100 of L1, cancel → 409 |
| BR-SO-19 | A confirmed or on-hold SO can't be cancelled while any live PR or SCO line raised from it exists (BR-SO-15, 53); the 409 lists their numbers so the user cancels them first — nothing is cancelled for them. | SCO-2611-0003 draft from this SO, cancel SO → 409 naming SCO-2611-0003 |
| BR-SO-20 | SOs are never hard-deleted; an edit of an on-hold, closed or cancelled SO → 409; a cancelled SO keeps its number and its reservations are released. | cancel → row stays, status cancelled, edit → 409; closed SO, change notes → 409 |
| BR-SO-56 | An SO may carry a ship-to address (≤ 300 chars) and a ship-to state (GST state code); the state is required when the address is set (400); empty = the customer's address and state. | address "Plant 2, Hosur" with no state → 400; both empty → delivery note uses Rane Brakes' address |
| BR-SO-57 | Each line needs a GST % from the BR-SUP-13 list (0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 28, 40), set by `so.manage`; the SO only stores it for the delivery note. | 18 → ok; 17 → 400; missing → 400 |

### Dispatch hooks (written by the dispatch module only)
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-SO-54 | When a delivery note posting leaves every non-removed line of a confirmed SO with open qty 0, the SO moves to `closed` as "fully delivered" (closed by the posting user, no typed reason) and its reservations are released, in the posting transaction; a partial delivery never closes it (BR-DSP-15). | 600 then 400 of L1 posted → SO closed "fully delivered"; only 600 posted → SO stays confirmed; L1 1000/1000 delivered and L2 removed → closes |
| BR-SO-55 | Cancelling a delivery note of an SO closed "fully delivered" moves it back to `confirmed` once any non-removed line has open qty > 0 again (close fields cleared, history in the audit log, released reservations not restored); an SO closed by hand is never reopened (the note cancel is refused, BR-DSP-32), and no SO screen or API reopens anything. | SO closed fully delivered, cancel the 400-pc note → SO confirmed, L1 open 400; SO closed by hand → note cancel 409 |
| BR-SO-58 | Posting a delivery note lowers this SO's stock reservations of the shipped item by the shipped qty (never below 0) in the posting transaction; cancelling the note does not restore them (a re-run does). | E1 claimed 300 HSG-MC from stock, a note ships 300 → claim 0; other SOs no longer lose those 300 |

### Explosion — running it
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-SO-21 | Explosion runs only on a `confirmed` SO, needs `so.explode`, and saves a numbered snapshot (`SO-2611-0001/E1`, E2 …) with who, when and the BOM revision used per item. | draft SO → 409; second run → E2 |
| BR-SO-22 | The explosion walks each line item's active BOM revision level by level exactly as BR-BOM-09 does (an item with an active BOM is walked unless the parent BOM's component line marks it "buy as is" — SO lines carry no such flag; below the top level, no active BOM = bought, tagged "no BOM"; at the top level see BR-SO-26); each row gets a type: cast (casting BOM), job work (job-work BOM), assemble (assembly BOM) or buy. | HSG-MC (job work) → HSG-RC (cast) → ADC12, BUSH-M6 (buy) |
| BR-SO-23 | The quantities one level needs (send qty, pour qty, alloy kg, insert and component qty) come only from the BOM module's one-level needs calculation (BR-BOM-18, the same function its preview uses), called per item with its net need; the explosion adds no formula of its own and keeps its own loop and 10-level guard (BR-BOM-10). | HSG-MC net 1000 → BR-BOM-18 → send 1021 HSG-RC; HSG-RC net 821 → pour 865, ADC12 723.800 kg, BUSH-M6 1730 |
| BR-SO-24 | The rounded level result of BR-BOM-18 is what is netted and passed down; the explosion never re-rounds. | HSG-RC net 821 → pour 865 used as given, not 864.21 |
| BR-SO-25 | An item needed by several lines or levels of one SO is one row at the deepest level it occurs, its gross need summed from every source before it is netted once, and each source line is kept for the trace. | HSG-RC sold as a spare on L2 (400) and needed under HSG-MC on L1 (1021) → one row at the level under HSG-MC, gross 1421, free 200 → net 1221, two sources |
| BR-SO-26 | An SO line item with no active BOM is shown as "No active BOM — fix BOM and re-run", gets no draft document, and the rest of the SO still explodes; below the top level, no BOM means bought (BR-BOM-09). | SO line HSG-XX with no BOM → row flagged, other lines normal; BUSH-M6 (no BOM) → buy row |
| BR-SO-27 | A row whose item is inactive (BR-BOM-21 "inactive" tag) is flagged and can't be raised. | BUSH-M6 deactivated → row flagged "inactive item", not selectable |
| BR-SO-28 | Loops and more than 10 levels are refused by the BOM module (BR-BOM-10); if the walk still meets one, that line stops with "BOM loop" and no rows below it. | A → B → A → line flagged "BOM loop" |

### Explosion — netting and reservations
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-SO-29 | Netting happens at every level, finished item included: net = gross − free stock used − open supply used, never below 0, and only the net of a cast, job-work or assembled item is passed to BR-BOM-18 for the level below. | HSG-RC gross 1021, free 200 → net 821 → ADC12 from 821, not 1021 |
| BR-SO-30 | Free stock = item stock in the plant's active non-virtual locations except the scrap yard, minus what other SOs' current snapshots have reserved; below 0 counts as 0. | ADC12 100 kg, 50 reserved by SO-2611-0002 → free 50 kg; HSG-RC at a job worker's premises → not free |
| BR-SO-31 | Open supply = PR lines not yet on a PO (requested − issued, where issued counts qty already put on any PO, draft PO included; PR not rejected / cancelled, draft PRs included) + open PO qty (ordered − accepted, PO not cancelled / closed, draft POs included) + SCO finished-item qty still to come (return qty − accepted − rejected − written off, SCO not rejected / cancelled / closed); each kind is shown in its own column. | PR line ADC12 200 kg, 150 of it on a draft PO → open PR 50, open PO 150; ADC12 PO 120 kg, 0 received → open PO 120 |
| BR-SO-32 | Supply due after the earliest delivery date of the SO lines needing that item is not counted (shown as late supply); supply with no date is counted. | PO 120 kg due 20 Jan, delivery 15 Jan → not counted, ADC12 net 673.800 kg |
| BR-SO-33 | Supply reserved by another SO's current snapshot is not counted; supply raised from this SO (BR-SO-53) is counted, so a re-run after creating drafts shows net 0. | after PR-2611-0007 (ADC12 553.800 kg) is raised, re-run → ADC12 net 0 |
| BR-SO-34 | A run reserves the free stock and open supply it used, against this SO; the order exploded first keeps what it reserved, and a later run of another SO sees only what is left. | SO-2611-0002 reserved 50 kg first; SO-2611-0001 sees 50 free |
| BR-SO-35 | A reservation is a soft claim on the snapshot, never an inventory ledger posting; it ends when the snapshot is superseded by a re-run, or the SO is closed or cancelled, and shrinks on delivery (BR-SO-58). | E2 replaces E1 → E1's claims gone, E2's claims in force; item stock unchanged |
| BR-SO-36 | A re-run marks the previous current snapshot `superseded` (read-only) in the same transaction; documents already raised from it stay. | E1 → superseded, PR-2611-0007 untouched |
| BR-SO-37 | Explosion runs are serialised: one run at a time across all SOs, and a second run of the same SO while one is in progress → 409. | two users explode SO-2611-0001 together → one 409 |
| BR-SO-38 | A snapshot becomes "out of date" when, after its run, a change alters the need — a line qty or delivery date, a line added or removed, hold or resume, a delivery note posted or cancelled (BR-DSP-14, 32), or a BOM revision of any item in it released or retired (BR-BOM-16, 17); notes, price, GST %, ship-to and customer PO changes do not; an out-of-date snapshot can be read but not used to create drafts (409 "re-run first"). | L1 1000 → 1200 after E1, create PR from E1 → 409; L1 price changed after E1 → E1 still current |

### Explosion — creating draft PRs and SCOs
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-SO-39 | From the current, up-to-date snapshot the user picks rows with net > 0 and may change each picked qty (> 0, ≤ the row's net, unit rules of BR-SO-07); more than net → 400; a qty below net shows "still short by N" but is allowed. | ADC12 net 553.800, pick 500 → ok, "still short by 53.800 kg"; pick 600 → 400 |
| BR-SO-62 | The snapshot in a create-drafts call must belong to the SO in the path and every picked row to that snapshot, else 404 and nothing is created; the superseded / out-of-date checks (BR-SO-36, 38) run on that snapshot. | rowId from SO-2611-0002/E1 sent to SO-2611-0001/E1 → 404, no PR made |
| BR-SO-40 | Bought rows become lines of one new draft PR per action: type `sale_order`, `saleOrderId` = this SO, `requestedBy` = me, notes "Auto-generated from SO-2611-0001/E1 — review before buying", and the PR rules (BR-PR-01, 06, 08) apply; because its type is `sale_order`, approval policies with category `sale_order` match it (BR-APR-02, 15); a PR with a hand-typed `saleOrderId` keeps its own type. | pick ADC12 553.800 kg + BUSH-M6 1230 → PR-2611-0007 draft with 2 lines, routed by the `sale_order` approval policy |
| BR-SO-41 | A PR line's required-by date = the earliest delivery date of the SO lines needing it; if that is before today the date is left empty and the row shows "Past due". | delivery 15 Jan, today 20 Nov → required-by 15 Jan |
| BR-SO-42 | Each job-work row (an item with a job-work BOM, BR-BOM-07) becomes a line of one new draft SCO per job worker: raw item = the BOM's sent item, finished item = the job-work part, return qty = picked net qty, send qty = BR-BOM-18's send qty for that return qty (send : return and loss % inside it), service from the BOM, price and GST from the job worker's active service list, and the SCO rules (BR-SCO-01, 02, 03) apply. | HSG-MC net 1000 → SCO to Sai CNC: send 1021 HSG-RC, return 1000 HSG-MC, CNC machining |
| BR-SO-43 | A job-work row needs a job worker and an expected return date: the job worker defaults from the BOM and may be changed before create to another active vendor whose service list has the same service (else 400 for that row); return date defaults to the delivery date and must pass BR-SCO-03. | change to "Ravi CNC" without CNC machining on its list → 400; delivery date in the past → user must enter a date |
| BR-SO-44 | Cast and assemble rows never become documents; they show the qty to make (and for castings the pour qty) for planning only. | HSG-RC net 821 → shown "cast 821, pour 865", not selectable |
| BR-SO-45 | Create needs `pr.manage` for any bought row and `sco.manage` for any job-work row, on top of `so.explode`; missing one → 403 and nothing is created. | bo without `sco.manage` picks an SCO row → 403 |
| BR-SO-46 | One create action is one transaction: every picked row is checked under a row lock, all PRs and SCOs are made or none; each row records the PR / SCO line it became and can't be raised again from this snapshot (409). | double click "Create drafts" → second call 409, one PR only |
| BR-SO-47 | Created PRs and SCOs are ordinary drafts: never auto-submitted, edited and approved through their own module, and their later cancel does not touch the SO. | PR-2611-0007 cancelled → SO still confirmed; re-run → ADC12 net 553.800 again |
| BR-SO-48 | A PR's `saleOrderId` must now name an existing SO that is `confirmed` when it is set (closes the M4 gap in BR-PR-02); existing PR rows naming no real SO are cleared by the migration, the old number kept in the PR notes (A-16). | create PR with saleOrderId 999999 → 400; with a draft or cancelled SO → 400 |

### Screens and trail
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-SO-49 | Screens follow design-system v2, and each document offers its next step as the main button: draft SO → "Confirm", confirmed SO → "Explode BOM", current snapshot → "Create draft PRs / SCOs", created rows → links to the PR / SCO; a confirmed SO with open qty also shows "Dispatch" to `dispatch.manage` holders as a second action, never the main button (BR-DSP-37). | confirmed SO with no snapshot → main button "Explode BOM", "Dispatch" beside it; fully delivered → no "Dispatch" |
| BR-SO-50 | The explosion screen shows per row: item, level (the deepest, BR-SO-25), type (cast / job work / assemble / buy, with "no BOM" or "buy as is" tag), BOM revision, unit, gross, free stock, reserved for other orders, open PR, open PO, open SCO, net, and the document raised; alloy rows in kg, parts in pcs. | ADC12 row: gross 723.800 kg, free 50, reserved 50, open PR 0, open PO 120, open SCO 0, net 553.800 |
| BR-SO-51 | The sale price is shown only on SO screens and APIs (`so.view`); the explosion API and screen never return it. | explosion response has no price fields |
| BR-SO-52 | Every create, edit, confirm, hold, resume, close, cancel, explosion run and draft creation writes who, when and before → after; the dispatch hooks (delivered qty, fully-delivered close, reopen, claim lowering) write the same row in the caller's transaction with the posting user and the delivery note id; status changes are row-locked and checked inside the transaction, the race loser gets 409. | edit and confirm race → one 409; posting DN-2611-0004 → audit row "delivered 0 → 600, note DN-2611-0004" |

## Security
Sensitive data — what must never leave the server or be shown to which role:
| Data | Who may see it | Who may change it |
|---|---|---|
| SO unit price, SO value | `so.view` (ow, bo; not the floor) | `so.manage` |
| Customer GSTIN, address, SO ship-to | `so.view` | `customer.manage` / `so.manage` |
| Explosion rows, reservations | `so.view` | `so.explode` (by running); delivery lowers claims (BR-SO-58) |
| Linked PR / SCO numbers and statuses on SO screens | `so.view` | their own modules |
| Job-worker candidate names on explosion rows | `so.explode` only (never supplier prices) | — |

Abuse cases — each one ends in a rule above:
| Who | Tries to | Stopped by |
|---|---|---|
| planner without `pr.manage` | raise PRs through the explosion | BR-SO-45 |
| sales | cut qty after purchase raised PRs, hiding a surplus | BR-SO-14 |
| any user | raise PRs from an old snapshot after the SO changed | BR-SO-38 |
| any user | double-click create to get two PRs | BR-SO-46 |
| sales | cancel an SO and leave orphan draft PRs / SCOs | BR-SO-19 |
| any user | claim another order's stock by re-running | BR-SO-34 |
| any user | set `status` or `deliveredQty` through edit | BR-SO-09, 10 |
| floor user | read sale prices | BR-SO-04 (no `so.view`) |
| any user | reopen a hand-closed SO by cancelling a delivery note | BR-SO-55 |
| any user | link a PR to a made-up, draft or cancelled SO | BR-SO-48 |
| any user | type an SO number on a PR to block that SO's qty cut or cancel | BR-SO-53 |
| any user | edit or remove another SO's line by sending its id | BR-SO-59 |
| any user | raise drafts from another SO's snapshot or rows | BR-SO-62 |
| purchase | raise more than the shortage through the explosion | BR-SO-39 |

Audit: BR-SO-52 actions, plus customer create / edit / (de)activate.

## Edge cases
Full list: `design/edge-cases.md`. Every row there names a rule in this file.
| Source | Count |
|---|---|
| benchmark | 48 |
| owner | 7 |
| invariant | 18 |

## Changes to other modules
Change requests; this spec does not edit the other specs. Each must be accepted there before build.
| ID | Module | Change | Why |
|---|---|---|---|
| CR-SO/PR-1 | purchase-requisition | BR-PR-02: `saleOrderId` becomes a foreign key to `sale_orders`, checked when set (exists, `confirmed`); a hand-set value is information only (BR-SO-53) and keeps the PR's own type (only explosion PRs have type `sale_order`, BR-SO-40); migration sets unknown ids to null and keeps "(old SO ref N)" in the notes; hand-over lists the count. | BR-SO-48, A-16 |
| CR-SO/PR-2 | purchase-requisition | PR create service accepts an outer transaction (`tx`), type `sale_order`, and the system note, so the explosion's drafts are all-or-nothing. | BR-SO-40, 46 |
| CR-SO/PR-3 | purchase-requisition | Issued qty of a PR line counts qty already on any PO, draft PO included (to be confirmed by a test; if not, the explosion would count it twice). | BR-SO-31, A-15 |
| CR-SO/SCO-1 | subcontracting | SCO create service accepts an outer transaction (`tx`); `project_ref` = SO number. | BR-SO-42, 46 |
| CR-SO/INV-1 | inventory | Read function: free stock per item = latest balance per active, non-virtual location, scrap yard excluded (no `currentStock`, which includes vendor premises). Read-only. | BR-SO-30 |
| CR-SO/BOM-1 | bom | `expandBomLevel` (one level, BOM design) also returns: an "inactive" flag per child item; for a job-work node the job worker, service, send / return qty and loss %; the node's part item and kind; and accepts several parts per call (one query per level). Loop / depth guard reused as exported. **Covered** by the frozen BOM design (batch call, inactive flag, job-work fields). | BR-SO-22, 23, 27, 28, 42, 43 |
| CR-SO/DSP-1 | dispatch | The floor supervisor gets no `so.view`: dispatch's price row (seed "ow, bo, fs") and BR-DSP-37's example must not assume fs opens the SO screen; fs sees qty only on notes. **Covered** by the dispatch spec. | A-03 |
| CR-SO/DSP-2 | dispatch | Posting a note also lowers the SO's stock reservations of the shipped item (BR-SO-58); GST % list is BR-SUP-13's, not 0 / 5 / 12 / 18 / 28. **Covered** by the dispatch spec. | BR-SO-57, 58 |

Accepted from dispatch: CR-SO-1 → BR-SO-54 · CR-SO-2 → BR-SO-55 · CR-SO-3 → BR-SO-56 · CR-SO-4 → BR-SO-11, 57 ·
CR-SO-5 → BR-SO-38 (+ BR-SO-58) · CR-SO-6 → BR-SO-49.

## Not now
- Invoice, payment (vision 15–16); a GST amount on the SO (the delivery note computes it, BR-SO-11).
- Quotation, SO approval chain, re-open of a hand-closed SO, amend (copy cancelled SO), closing one line.
- Production planning, machine loading, lead-time scheduling; in-house cast / assemble rows are information only.
- Vendor lead times and "release by" dates on drafts; per-vendor PR grouping (PO already groups by vendor).
- Reservation priority by delivery date or manual re-allocation between orders.
- Auto re-run of the explosion when stock, BOM or supply changes.
- Customer item codes, customer price lists, credit limits.

## Open questions
None for the owner. Six cards answered A (owner pre-approved recommended options in chat, 2026-11-20):
| Card | Answer | Rules | Benchmark |
|---|---|---|---|
| 1 Edit after confirm | limited; qty down only after drafts cancelled | BR-SO-13, 14 | ERPNext limited "Update Items" ([SO](https://docs.frappe.io/erpnext/user/manual/en/sales-order)); Odoo lock setting ([quotations](https://www.odoo.com/documentation/18.0/applications/sales/sales/sales_quotations/create_quotations.html)); SAP B1 edit until copied ([update / cancel SO](https://help.sap.com/saphelp_sbo92/helpdata/en/44/fd93f693202463e10000000a1553f7/content.htm)) |
| 2 Net castings on the shelf | net every level | BR-SO-29 | ERPNext sub-assembly netting ([production plan](https://docs.frappe.io/erpnext/user/manual/en/production-plan)); SAP B1 MRP per level ([MRP](https://help.sap.com/saphelp_sbo92/helpdata/en/79/c73ffa97294571b5c4991e5f219f5a/content.htm)); Odoo per-route ([reordering](https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/warehouses_storage/replenishment/reordering_rules.html)) |
| 3 Late PO as cover | not counted | BR-SO-32 | SAP B1 by date (MRP); ERPNext projected qty ignores date (production plan); Odoo forecast by date (reordering) — stricter |
| 4 Shared short stock | first exploded keeps | BR-SO-34 | ERPNext reserve stock first-come (SO); MRPeasy booking ([docs](https://www.mrpeasy.com/documentation)); SAP B1 re-plans each run ([re-run](https://help.sap.com/saphelp_sbo91/helpdata/en/69/47ea51b5b14320a5db9c17499ff7bc/content.htm)) |
| 5 Several delivery dates | one SO, line per date | BR-SO-08 | ERPNext, Odoo, SAP B1 delivery date per row (SO pages above) |
| 6 PRs per explosion | one PR per create | BR-SO-40 | ERPNext one MR per action ([MR](https://docs.frappe.io/erpnext/user/manual/en/material-request)); SAP B1 per vendor ([order recommendation](https://help.sap.com/saphelp_sbo91/helpdata/en/44/e9d8df694103fce10000000a1553f6/content.htm)); Odoo RFQ per vendor (reordering) |

No open designer questions.

## Changelog
- 2026-11-20 v0 — draft (pass 1, owner delegated; 6 pending cards, 5 confirm lines)
- 2026-11-20 v0 — aligned with BOM spec draft (BR-BOM-01..25): BR-SO-22..24, 26..29, 38, 42..44, 50 now
  reference BR-BOM-09/10/18/21; examples recomputed on the BOM spec's HSG-MC / HSG-RC data.
- 2026-11-20 v0 — pass 2: dispatch CR-SO-1..6 adopted (BR-SO-54..57, BR-SO-09, 11, 13, 38, 49 reworded);
  BR-SO-53 "raised from this SO", BR-SO-58 delivery lowers claims; BR-SO-25 deepest level, net once;
  BR-SO-31 draft POs count; fs loses `so.view`; changes to other modules listed; cards answered A.
- 2026-11-20 v0 — pre-freeze fixes: BR-SO-59..62 (line / snapshot ownership 404, soft remove, trims and date
  range, rows belong to snapshot); BR-SO-53 explosion links only; BR-SO-39 qty ≤ net; BR-SO-48 confirmed SO;
  BR-SO-07, 13, 14, 20, 22, 25, 40, 52 reworded; CR-SO/BOM-1 covered by the frozen BOM design.
  6 cards, 17 confirm lines, 59 info rows, 73 edge cases (after final fixes: approval by PR type
  `sale_order`, SO-wide cut block and approval policy as confirm lines, close on non-removed lines).
- 2026-11-20 v1 — frozen; OWNER.md approved on the owner's delegation (D-028): owner pre-approved recommended options in chat, 2026-11-20: "take ur own decision and record them and run whatever parallel subagents u want to complete a complete scm module according to my plan, ill do a complete merge in moring once completed"
