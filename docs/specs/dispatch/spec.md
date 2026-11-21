---
module: dispatch
status: frozen            # draft | frozen (set only by /freeze; change requests keep it frozen)
version: 1
frozen_on: 2026-11-20
owner: Arun
depends_on: [sale-order, inventory, grn-stock, subcontracting]   # SO lines + BR-SO-09, 11, 13, 38, 49, 54..58; ledger posting; company settings + item HSN
brief: docs/briefs/dispatch.md
research: docs/research/dispatch.md
---

# Dispatch (delivery note against a sale order)

> Agent layer. The owner reads `OWNER.md`, not this file. ≤ 400 lines (above that: split by sub-module).
> Plain words, one sentence per rule. Tables and columns: `design/data.md`. Endpoints: `design/api.md`.
> Screens: `design/screens.md`. Code locations and history: `docs/modules/dispatch.md` (after build).
> Owner away, all decisions delegated (chat 2026-11-20). Every owner-type point took the recommended
> option; the cards are in `OWNER.md`, benchmark links under "Owner cards" below.

## Summary
Stores makes a delivery note from a confirmed sale order, picks which lines and how many pieces go on this
truck, fills the e-way bill fields, and posts it. Posting takes the pieces out of stock through the ledger
and raises the SO line's delivered qty; the rest stays open for the next truck. No invoice, no portal call.
Done on the floor = every truck that leaves has a numbered note, stock drops by what left, and the SO shows
what is still to send.

Example data used below (SO data is the sale-order spec's Summary example):
- Plant in Maharashtra (GSTIN `27AAACD1234E1Z5`), e-way limit setting ₹50,000.
- Customer Rane Brakes (active, state Maharashtra, GSTIN `27ABCDE1234F1Z5`, same state); customer Kaveri
  Motors (state Tamil Nadu, GSTIN `33…`, other state).
- SO-2611-0001 `confirmed`, line L1: HSG-MC (machined housing, HSN 8708, pcs) 1000 pcs @ 18,500 paise,
  delivered 0; GST 18 % on the line (BR-SO-57).
- Finished Goods store holds 700 pcs of HSG-MC, average cost 9,800 paise.
- Note 1: 600 pcs → taxable ₹1,11,000 (11,100,000 paise) + GST ₹19,980 = ₹1,30,980 → e-way bill needed.
  Afterwards: delivered 600, open 400, Finished Goods 100.
- Note 2 (after 300 more pcs reach Finished Goods): 200 pcs → ₹37,000 + ₹6,660 = ₹43,660 → e-way bill
  optional. Afterwards: open 200, SO stays confirmed.

## Who can do what
| Action | Key | Seed roles |
|---|---|---|
| see notes, pending-dispatch list, note print | `dispatch.view` | ow, bo, fs |
| create / edit draft, post, cancel a draft, update transport after posting | `dispatch.manage` | ow, bo, fs |
| cancel a posted note (puts stock back) | `dispatch.cancel` | ow |
| edit the e-way limit setting | `company.manage` (exists) | ow |
| see sale price and value on a note (screen, list, print) | `dispatch.view` + `so.view` (exists, BR-SO-51) | ow, bo (fs has no `so.view`: works from the pending-dispatch list, qty only, A-03) |
| close the rest of an order (whole SO, reason) | `so.manage` (exists, BR-SO-17) | ow, bo |

Super-admin passes every key (BR-AUTH-18). Seed: ow owner, bo back_office, fs floor_supervisor.
The creator and the poster of a note may be the same person (A-55).

## Flow
| From | Action | To | Rule |
|---|---|---|---|
| — (SO `confirmed`) | create from SO | draft | BR-DSP-01..07 |
| draft | edit lines, packages, transport | draft | BR-DSP-03..09, 20, 22, 25 |
| draft | post | posted | BR-DSP-10..19, 21, 23, 24, 26, 44 |
| draft | cancel (reason) | cancelled, nothing posted | BR-DSP-29 |
| posted | update vehicle / transporter / add missing e-way no | posted | BR-DSP-27, 28 |
| posted | cancel (reason, `dispatch.cancel`) | cancelled, stock back | BR-DSP-30..33 |

`posted` and `cancelled` never go back to `draft`. `cancelled` is final.

## Rules
Dates: every "today", date check and number period is the plant's calendar day in IST (Asia/Kolkata), on
server and in every date picker (same as D-022). Money is integer paise; rounding is half up per line.

### Making the note
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-DSP-01 | A note is made from one sale order, and only while that SO is `confirmed` (BR-SO-12); `draft`, `on_hold`, `closed` or `cancelled` → 409. An inactive customer's confirmed SO can still be dispatched (BR-SO-02). | SO-2611-0001 on hold → "Dispatch" 409; confirmed → draft note made; Rane Brakes deactivated, SO still confirmed → draft note made |
| BR-DSP-02 | The note copies from the SO and its customer, read-only, at create and again at posting: customer name, address, state, GSTIN (or "unregistered") (BR-SO-01), ship-to address and state (the SO's, else the customer's, BR-SO-56), SO number and customer PO number; per line the item, unit and delivery date. | edit the note's customer address → 400; customer address changed after the draft → posted note shows the new one |
| BR-DSP-03 | The user picks which SO lines go on this note and the qty for each; at least one line with qty > 0, otherwise 400. Every line must be a line of the note's SO that is not removed (BR-SO-60), checked on save and at posting, else 400 without naming the other SO; the same SO line twice on one note → 400. Two lines of the same item with different delivery dates (BR-SO-08) stay two note lines. | all lines qty 0 → 400; a line id of SO-2611-0002 on a note of SO-2611-0001 → 400; L2 removed after the draft → post 400; HSG-MC 15 Jan and 15 Feb lines → two note lines |
| BR-DSP-04 | Qty per line must be > 0 and ≤ the line's open qty (SO line qty − `deliveredQty`, BR-SO-09); more → 400. No over-delivery tolerance (card 1). | open 1000, note 1001 → 400; note 600 → ok |
| BR-DSP-05 | Qty follows the item unit: whole numbers for pcs and set, up to 3 decimals otherwise (BR-INV-08). | 600.5 pcs → 400 |
| BR-DSP-06 | Drafts do not hold qty: two drafts may each ask for the full open qty; the check that counts is the one at posting (BR-DSP-10). | open 1,000, draft A 1,000 and draft B 1,000 → both saved; post A → ok; post B → 400 |
| BR-DSP-07 | Note date defaults to today, can't be in the future (400) and can't be before the SO order date (BR-SO-06) (400); back-dating otherwise stays open (as BR-SCO-09). | order date 18 Nov; at 02:00 IST on 20 Nov: date 21 Nov → 400; 17 Nov → 400; 19 Nov → ok |
| BR-DSP-08 | The note has one source location for all its lines, picked from active non-virtual stock locations; it defaults to the active `finished_goods` location (lowest id if several), else the main store. A `vendor_premise` or inactive location → 400, checked on save and again at posting. | no location sent, Finished Goods exists → Finished Goods; Sai CNC (job work) → 400; location deactivated after the draft → post 400 |
| BR-DSP-09 | Each note line may carry a lot / heat number (free text, optional), copied to its ledger row so a customer rejection traces back to the casting batch. | lot "H-231" → ledger row shows H-231 |

### Posting (stock out, SO delivered qty)
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-DSP-10 | Posting re-checks every line against the SO's open qty as it is when the SO is locked; over → 400 if already over when the request arrives, 409 if it lost a race (as D-018). | open 400, two notes of 400 posted at once → one posted, one 409 |
| BR-DSP-11 | Posting is refused (409) if the SO is no longer `confirmed` (`on_hold`, `closed`, `cancelled`) at that moment; a draft note of a closed or cancelled SO can only be cancelled. | draft made, SO put on hold (BR-SO-16), post → 409, nothing posts; resume, post → ok |
| BR-DSP-12 | Each note line posts one ledger row: type `out`, −qty, at the source location, reference `delivery_note` with note id and line id, cost = the item's current average cost; the average does not change (BR-GRN-39, 44). | 600 pcs @ average 9,800 → row −600, value −5,880,000, average stays 9,800 |
| BR-DSP-13 | Posting may not take the item's balance at the source location below zero → 409 "Insufficient stock", nothing posts (BR-GRN-33). | Finished Goods 700, post 800 → 409 |
| BR-DSP-14 | Posting adds each line's qty to the SO line's `deliveredQty` (the only writer, BR-SO-09); open qty drops by the same, the SO's stock reservations of that item drop by the shipped qty (BR-SO-58), and its current explosion snapshot becomes "out of date" (BR-SO-38). | delivered 0 → 600, open 400; E1 claimed 300 HSG-MC → claim 0; E1 → out of date |
| BR-DSP-15 | When every non-removed SO line has open qty 0 after a posting (soft-removed lines, BR-SO-60, are ignored), the SO moves to `closed` as "fully delivered" and its reservations are released (BR-SO-54); a partial delivery never closes the SO, and only a posting closes it (an SO whose lines were cut to their delivered qty stays confirmed until the office closes it, BR-SO-17). The rest of a partly shipped order is dropped only by the SO's own close with a reason (BR-SO-17, card 3). | 600 then 400 posted → SO closed "fully delivered"; only 600 posted → SO stays confirmed; L1 fully shipped, L2 soft-removed with 0 delivered → SO closed "fully delivered" |
| BR-DSP-16 | Post saves everything in one go — ledger rows, item stock, SO lines, SO status, note status, number — locking the SO first, then items; if any step fails nothing is saved; a second post of the same note → 409. | stock short on line 2 of 2 → line 1 not posted either, note stays draft; double click "Post" → one 200, one 409 |
| BR-DSP-17 | Number `DN/<FY>/<seq>` is given at posting, consecutive per financial year of the note date, max 16 characters, never reused, also after cancel; a draft shows "Draft". | first post dated 1 Apr 2027 → DN/27-28/1; DN/26-27/5 cancelled → next is DN/26-27/6 |
| BR-DSP-18 | Posting needs our name, address, GSTIN and state in company settings and an HSN code on every item on the note; missing → 400, nothing posts (as BR-SCO-09). | HSG-MC has no HSN → 400 "add HSN to item" |
| BR-DSP-19 | Price and GST % come from the SO line as it is at posting (a confirmed SO's price and GST % may change, BR-SO-13; GST % list per BR-SO-57) and are frozen on the note then; a draft shows the current ones. Line taxable value = qty × price; GST = taxable × GST %; note value = Σ taxable + Σ GST; each rounded half up per line, in paise. | 600 × 18,500 = 11,100,000; GST 1,998,000; note value 13,098,000; SO price changed to 18,000 before posting → note uses 18,000 |

### Packing list (card 5)
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-DSP-20 | Packages are optional; each package has a number unique on the note, one line of this note, qty > 0 in the line's unit (BR-DSP-05), net kg > 0 and gross kg ≥ net, and an optional lot no.; anything else → 400. | gross 40 kg, net 42 kg → 400; box "1" twice → 400; box for a line removed from the draft → 400 |
| BR-DSP-21 | If a note line has any package, the packed qty of that line must equal its note qty at posting; otherwise 400. | line 600, packed 550 → post 400; packed 600 → ok |
| BR-DSP-22 | Packages change only while the note is draft; after posting → 409. | add a box to DN/26-27/1 → 409 |

### E-way bill fields (stored only, no portal)
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-DSP-23 | An e-way bill is needed when the note value incl. GST is ≥ ₹50,000 for an other-state customer, or ≥ the plant's intra-state limit (company setting, default ₹50,000 = 5,000,000 paise, card 2) for a same-state customer; "same state" compares the plant's state with the SO's ship-to state (BR-SO-56), else the customer's `state` (BR-SO-01). Posting decides with the value and the setting at that moment; a posted note keeps its answer, and a draft shows the answer stored at its last save. | Rane Brakes ₹1,30,980 → needed; Rane Brakes (Maharashtra) with ship-to Hosur (Tamil Nadu, 33), ₹43,660 → other state, optional; ₹60,000 to that ship-to → needed; Rane Brakes ₹43,660 → optional; Kaveri ₹43,660 → optional; exactly ₹50,000 → needed; limit set to ₹1 lakh, Rane Brakes ₹60,000 → optional; price-0 sample → optional |
| BR-DSP-24 | When an e-way bill is needed, posting requires: mode (road, rail, air, ship); for road a vehicle no or a transporter ID; for rail, air, ship a transport doc no and date; distance 1–4,000 km; e-way bill no and date. Missing → 400, nothing posts. | Note 1, road, vehicle MH12AB1234, 350 km, no e-way no → 400 |
| BR-DSP-25 | Any transport or e-way field that is filled is checked even when not needed: vehicle no = state code + 1–2 digits + 0–3 letters + 4 digits (or BH series), spaces and dashes removed, upper case; transporter ID = 15-char GSTIN pattern; e-way no = 12 digits; e-way date not before the note date and not in the future. | "mh 12 ab 1234" → saved MH12AB1234; "MH12" → 400; e-way no 11 digits → 400 |
| BR-DSP-26 | An e-way bill no can sit on one non-cancelled note only; reuse → 409. One vehicle per note. | 1234 5678 9012 already on DN/26-27/1, typed on DN/26-27/2 → 409 |
| BR-DSP-27 | After posting, only vehicle no, transporter ID / name and transport doc no / date may change; the e-way no and date (and the distance, if empty) may be added once, together in one change, only if the e-way no was empty; every other field, transport mode included, → 409; e-way no without its date → 400; on a road note that needs an e-way bill, clearing both vehicle no and transporter ID → 400. Each change keeps the old and new value with who and when. | change vehicle MH12AB1234 → MH14CD5678 → saved, history row; DN/26-27/2 adds e-way no, date and 120 km → saved; change qty → 409; change an existing e-way no or distance → 409; change mode road → rail → 409; DN/26-27/1 (needed, road) clears vehicle with no transporter ID → 400 |
| BR-DSP-28 | Valid-until is shown, never enforced: end of day (23:59 IST) of e-way date + ceil(km ÷ 200) days (Rule 138(10) since 2021, normal cargo). Expired notes are tagged in the list. | e-way 20 Nov, 350 km → valid until 22 Nov 23:59 |

### Cancel and corrections
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-DSP-29 | A draft can be cancelled by `dispatch.manage` with a reason of 3–500 characters; nothing posts and no number is used. | cancel draft, reason "truck did not come" → cancelled; reason "x" → 400 |
| BR-DSP-30 | A posted note can be cancelled only by `dispatch.cancel` with a reason of 3–500 characters (card 4, card 6). | bo cancels DN/26-27/1 → 403; ow, reason "wrong part loaded" → cancelled |
| BR-DSP-31 | Cancelling a posted note posts one ledger row per line: type `in`, +qty, at the same location, reference `delivery_note_cancel`, at the cost the line went out at (average recomputed by BR-GRN-38; net value 0 by BR-GRN-24), and lowers the SO line's delivered qty by the same; reservations are not restored (BR-SO-58; a re-run does). | DN 600 @ 9,800 cancelled → +600 @ 9,800, delivered 600 → 0 |
| BR-DSP-32 | A posted note can be cancelled while its SO is `confirmed` or `on_hold` (the SO keeps its status); if the SO is `closed` with the system reason "fully delivered", cancelling moves it back to `confirmed` (BR-SO-55) and its snapshot is out of date (BR-SO-38); if it was closed by hand (BR-SO-17, final) → 409 and the note stays posted. An SO with a posted note can't be cancelled (BR-SO-18), so that case can't arise. | SO on hold, cancel DN → cancelled, SO still on hold, open 600; SO closed "fully delivered", cancel DN → SO confirmed, open 600; SO closed by hand → 409 |
| BR-DSP-33 | Cancel saves ledger rows, item stock, SO lines, SO status and note status in one go, locking the SO first; a second cancel of the same note → 409. | two cancels at once → one 200, one 409 |
| BR-DSP-34 | Notes are never deleted and a posted note's lines never change; a wrong note is cancelled and made again. No delete route exists. | DELETE a note → 404, nothing changes |

### Access, audit, screens
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-DSP-35 | Every action needs its key from "Who can do what"; otherwise 403 and nothing changes. | qa (no key) opens notes → 403; fs posts → ok; fs cancels posted → 403 |
| BR-DSP-36 | Create, edit, post, transport update and cancel (draft or posted) each write an audit row with action `dispatch.create`, `dispatch.edit`, `dispatch.post`, `dispatch.transport` or `dispatch.cancel`: who, when, before → after (reason included). | ow cancels → row "Arun, dispatch.cancel, posted → cancelled, reason …" |
| BR-DSP-37 | The confirmed SO screen offers "Dispatch" when the user holds `dispatch.manage` and any non-removed line (BR-SO-60) has open qty > 0, as a second action beside the SO's own next step (BR-SO-49); each pending-dispatch row offers "Dispatch" to `dispatch.manage`; a draft note offers "Post"; a posted note offers "Print". No permission → the button is not shown (BR-DS-27). | SO fully delivered → no "Dispatch"; only open line is soft-removed L2 → no "Dispatch"; bo on SO-2611-0001 → "Dispatch" shown; fs (no `so.view`) → starts from the pending-dispatch row |
| BR-DSP-38 | The SO screen shows per non-removed line ordered, delivered and open qty (soft-removed lines, BR-SO-60, are hidden), and the list of its notes with status. | after Note 1 → 1000 / 600 / 400, DN/26-27/1 posted; L2 removed → not shown |
| BR-DSP-39 | The pending-dispatch list shows every confirmed SO line with open qty > 0 that is not removed (BR-SO-60): customer, SO, item, ordered, delivered, open, SO date, stock at the default source location (or a chosen one that passes BR-DSP-08, else 400) with a "Short stock" tag when stock < open (information only); filter by customer and item; no price. | after Note 1 → one row HSG-MC open 400, stock 100, "Short stock"; L2 removed → no row; stock at Sai CNC → 400 |
| BR-DSP-40 | The note register lists notes by date, customer, status, value, e-way no and valid-until, filterable by date range, customer, status and "e-way needed but missing" (drafts only); a draft's e-way flag and value are those stored at its last save. | filter Rane Brakes, November → Note 1 and Note 2; draft saved at ₹43,660, SO price raised later → register still shows "optional" until the next save |
| BR-DSP-41 | The printed note carries: "Delivery note — not a tax invoice", our name, address, GSTIN; customer address, ship-to, GSTIN or "unregistered"; note no and date, SO no, customer PO no; per line item, HSN, qty, unit, price, taxable value, GST %, GST; totals; packages with weights and lots; transport and e-way fields. A draft prints "DRAFT" and no number; a cancelled note prints "CANCELLED" and the reason. Our name, address, GSTIN and state are copied onto the note at posting, so a later company-settings change never alters a posted print. | print DN/26-27/1 → all fields above; print a draft → watermark DRAFT; company address changed after posting → DN/26-27/1 prints the old one |
| BR-DSP-42 | Every save of the e-way limit setting adds a company-settings history row (old, new, who, when), as BR-SCO-29. | ow changes ₹50,000 → ₹1,00,000 → history row |
| BR-DSP-43 | Without `so.view`, note screens, register, print and API leave out price, taxable, GST and value (absent, not zero) and refuse sorting by value (400); the "e-way needed" flag and the limit are still returned, computed by the server. | fs opens DN/26-27/1 → qty 600, "E-way bill needed", no ₹; fs sorts register by value → 400 |
| BR-DSP-44 | Posting is refused (400, naming the item) when an item on the note is inactive; the user reactivates the item or the office closes the SO's rest. | HSG-MC deactivated after the draft, post → 400 "HSG-MC is inactive" |

## Security
Sensitive data — what must never leave the server or be shown to which role:
| Data | Who may see it | Who may change it |
|---|---|---|
| Sale price, note value on screen, API and print | `dispatch.view` + `so.view` (BR-SO-51); without `so.view` the note shows qty only, while the server still runs the e-way check (BR-DSP-43) | nobody on the note (copied from SO) |
| Item average cost on the ledger row | `inventory.view` only; never on the note or its print | nobody |
| Customer GSTIN, address | `dispatch.view` | `customer.manage` only (BR-SO-03) |
| E-way limit setting | `dispatch.view` (read) | `company.manage` |

Abuse cases — each one ends in a rule above:
| Who | Tries to | Stopped by |
|---|---|---|
| stores | ship more than ordered by splitting into two notes posted at once | BR-DSP-10, 16 |
| stores | change the price on the note to lower the e-way value | BR-DSP-02, 19 |
| sales | cut SO qty below what was shipped, or cancel a shipped SO | BR-SO-14, 18 |
| stores | post a big load without an e-way bill | BR-DSP-23, 24 |
| stores | reuse one e-way bill for two trucks | BR-DSP-26 |
| stores | cancel a posted note to hide stock that left | BR-DSP-30, 36 |
| anyone | edit or delete a posted note or its ledger rows | BR-DSP-27, 34, BR-INV-20 |
| fs | lower the e-way limit setting | BR-DSP-35 (`company.manage`) |
| fs | read sale prices through the note API or print | BR-DSP-43 (the "e-way needed" flag can hint that a note is ≥ ₹50,000; accepted for usability, A-58) |
| stores | ship another SO's line, or one SO line twice, on a note | BR-DSP-03 (400, no detail about the other SO) |
| stores | box a line that is not on the note | BR-DSP-20 |
| anyone | read stock at a job worker's location through the pending list | BR-DSP-39 |
| stores | switch a posted note from road to rail to dodge the vehicle check | BR-DSP-27 |
| anyone | ship from a vendor's location (job-work stock) | BR-DSP-08 |

Audit: create, edit draft, post, transport update, cancel (draft and posted), e-way limit change — BR-DSP-36, 42.

## Edge cases
Full list: `design/edge-cases.md` (79 rows). Every row there names a rule in this file.
| Source | Count |
|---|---|
| benchmark | 39 |
| owner | 8 |
| invariant | 32 |

## Owner cards (in `OWNER.md`; all answered A — owner pre-approved recommended options in chat, 2026-11-20)
Benchmark links for each card (the card itself carries no links). Stricter wins where products disagree.
| Card | Question → answer A | Benchmark | Rules |
|---|---|---|---|
| 1 | More than ordered on a truck? → never above SO open qty | ERPNext tolerance setting ([DN](https://docs.frappe.io/erpnext/user/manual/en/delivery-note)); Odoo allows over-done qty ([forum](https://www.odoo.com/forum/help-1/can-we-validate-deliver-lower-than-demand-in-odoo-delivery-ordersales-235352)); SAP B1 caps at open qty ([KBA 3658609](https://userapps.support.sap.com/sap/support/knowledge/en/3658609)) | BR-DSP-04 |
| 2 | Same-state e-way limit? → ₹50,000, editable setting | Zoho ([e-way FAQ](https://www.zoho.com/in/books/gst/faq/e-way-bill.html)) ₹50,000, some states ₹1 lakh; India Compliance threshold in settings ([e-waybill](https://docs.frappe.io/erpnext/v14/user/manual/en/regional/india/generating_e_waybill)) | BR-DSP-23, 42 |
| 3 | Rest of a partly shipped order? → stays open; SO closes itself when all shipped; office closes the rest by hand | ERPNext auto-complete + manual "Closed" ([DN](https://docs.frappe.io/erpnext/user/manual/en/delivery-note)); Odoo backorder question ([multipack](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/shipping_receiving/setup_configuration/multipack.html)); SAP B1 surprise close ([KBA 3658609](https://userapps.support.sap.com/sap/support/knowledge/en/3658609)) | BR-DSP-14, 15 |
| 4 | Cancel a posted note? → yes with reason; stock back at its out cost; SO qty reopens | ERPNext cancel ([DN](https://docs.frappe.io/erpnext/user/manual/en/delivery-note)); SAP B1 cancel ([help](https://help.sap.com/saphelp_sbo92/helpdata/en/44/fd948693202463e10000000a1553f7/content.htm)); Odoo return picking only (stricter, not taken: no customer-return doc yet) | BR-DSP-30..33 |
| 5 | Packing list? → optional; boxes with kg and lot must add up to note qty | ERPNext [packing slip](https://docs.frappe.io/erpnext/user/manual/en/packing-slip) (≤ note qty, draft only); Odoo packages optional ([multipack](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/shipping_receiving/setup_configuration/multipack.html)); SAP B1 not found | BR-DSP-20..22 |
| 6 | Who cancels a posted note? → owner only | ERPNext separate Cancel right per role ([roles](https://docs.frappe.io/erpnext/user/manual/en/role-based-permissions)); SAP B1 / Odoo per-user authorisation; narrowest seed taken | BR-DSP-30, 35 |

Confirm lines: `assumptions.md` A-01..A-04, A-06..A-10, A-55..A-58 (tag `confirm`), listed by name in `OWNER.md`.

## Not now
- Tax invoice, payment, credit-limit hold (brief: not included).
- E-way bill portal upload/API, transporter master, over-dimensional cargo validity (brief: not included).
- Customer returns of delivered goods (separate document, new issue).
- Several SOs on one note; several vehicles on one note.
- Over-delivery tolerance % (only if card 1 is answered B).
- Job-work return challans (subcontracting owns challans).
- Pick list, stock reservation for a note, barcode / QR labels on boxes.
- Closing one SO line while the rest ships (sale-order closes the whole SO only, BR-SO-17); reopening an SO closed by hand (sale-order "Not now").

## Changes to other modules
This spec does not edit other specs. CR-INV-1 and CR-SCO-1 touch frozen specs: they stay logged change
requests here, applied at build as small additive changes (an enum value, a settings column), with no
re-freeze of those specs (A-59, A-60).
| ID | Module | Change | Why (dispatch rule) |
|---|---|---|---|
| — | sale-order (adopted, now `depends_on`) | CR-SO-1..6 accepted in the sale-order spec: fully delivered close BR-SO-54, reopen on note cancel BR-SO-55, ship-to BR-SO-56, GST % per line BR-SO-11, 57, snapshot out of date BR-SO-38, "Dispatch" button BR-SO-49; plus BR-SO-58 (posting lowers reservations). Used as is: `deliveredQty` (BR-SO-09), qty ≥ delivered (BR-SO-14), no cancel once delivered (BR-SO-18), hold (BR-SO-16), fs without `so.view` (sale-order seed). | BR-DSP-02, 04, 11, 14, 15, 19, 23, 32, 37, 43 |
| CR-INV-1 | inventory / grn-stock | New ledger reference types `delivery_note` and `delivery_note_cancel`; add both to the "post from its source document" list of BR-GRN-43. | BR-DSP-12, 31 |
| CR-SCO-1 | subcontracting (company settings) | New setting "intra-state e-way limit" (paise, default 5,000,000), edited by `company.manage`, history as BR-SCO-29. | BR-DSP-23, 42 |

## Open questions
Must be empty at freeze. Each one ends as an owner card in `OWNER.md` or a row in `assumptions.md`.
| # | Question | Goes to |
|---|---|---|

## Changelog
- 2026-11-20 v0 — draft (pass 1, owner delegated; 6 pending cards).
- 2026-11-20 v0 — aligned with sale-order draft (BR-SO-01..52): SO states, `deliveredQty`, customer master, hold/close/cancel rules, price right; example data now SO-2611-0001 / Rane Brakes; missing pieces as CR-SO-1..6, CR-INV-1, CR-SCO-1.
- 2026-11-20 v0 — pass 2: CR-SO-1..6 adopted by sale-order (BR-SO-54..58 referenced); fs without `so.view`;
  BR-DSP-27 distance added once with the e-way no; BR-DSP-32 cancel while SO on hold; BR-DSP-36 action names;
  new BR-DSP-43 (no price without `so.view`), BR-DSP-44 (inactive item); BR-DSP-02, 08, 16, 20, 23, 39, 41
  sharpened from edge cases; 63 edge cases, 54 assumptions (9 confirm, 45 info), OWNER.md written.
- 2026-11-20 v0 — pre-freeze fixes: open questions cleared (GST % list and reservations settled in data.md);
  BR-DSP-03 line ownership / removed / duplicate lines; BR-DSP-15 only a posting closes; BR-DSP-23 ship-to
  state; BR-DSP-27 mode locked; BR-DSP-39 removed lines, location check; BR-DSP-40 draft flag as of last
  save; BR-DSP-41 company copy at post; CR-INV-1 / CR-SCO-1 applied at build; 75 edge cases; A-55..A-63 (13 confirm, 50 info).
- 2026-11-20 v0 — soft-removed SO lines ignored in BR-DSP-15, 37, 38; BR-DSP-27 road note keeps vehicle or
  transporter ID; maker = poster stated; 79 edge cases.
- 2026-11-20 v1 — frozen; OWNER.md approved on the owner's delegation (D-028): owner pre-approved recommended options in chat, 2026-11-20: "take ur own decision and record them and run whatever parallel subagents u want to complete a complete scm module according to my plan, ill do a complete merge in moring once completed"
