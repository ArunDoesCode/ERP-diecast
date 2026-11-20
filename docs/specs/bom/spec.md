---
module: bom
status: frozen            # draft | frozen (set only by /freeze; change requests keep it frozen)
version: 1
frozen_on: 2026-11-20
owner: Arun
depends_on: [inventory, suppliers, subcontracting, auth-setup]
brief: docs/briefs/bom.md
research: docs/research/bom.md
---

# Bill of materials (BOM)

> Agent layer. The owner reads `OWNER.md`, not this file. ≤ 400 lines (above that: split by sub-module).
> Plain words, one sentence per rule. Tables and columns: `design/data.md`. Endpoints: `design/api.md`.
> Screens: `design/screens.md`. Code locations and history: `docs/modules/bom.md` (none yet; no code).
> Owner delegated every decision for this run (brief quote, 2026-11-20): the 7 cards in `OWNER.md` carry
> option A, pre-approved; the rules below apply option A. Agent choices: `assumptions.md`.

## Summary
A BOM says what one piece of a part is made of. Three kinds: **casting** (alloy + casting data + inserts,
cast in-house), **job work** (one item sent to a job worker, one service, one item back), **assembly**
(in-house, component lines only). Levels come from items: a component that has its own active BOM is
walked further. Each part has revisions A, B, C…; a draft is editable, a released revision is frozen, and
exactly one revision per part is active. Back office records BOMs; purchase reads them and sees what N
pieces need. Done on the floor = every running part has one active revision, and "what do 1000 pieces
need" is answered by the system, not by the supervisor.

Example data used by the rules (kg with 3 decimals, % with up to 2 decimals):
- **HSG-RC** (raw housing casting, pcs), casting BOM rev A: alloy **ADC12** (kg); net weight 0.850 kg;
  shot weight 2.000 kg; 2 cavities; melt loss 3 %; casting reject 5 %; insert **BUSH-M6** 2 pcs per piece.
- **HSG-MC** (machined housing, pcs), job-work BOM rev A: send 1 HSG-RC → get 1 HSG-MC; service
  "CNC machining" at **Sai CNC**; job-work loss 2 %.
- Order of **1000 pcs HSG-MC** → send 1021 HSG-RC → pour 1075 → alloy 900.100 kg, BUSH-M6 2150 pcs.

## Who can do what
Keys go into `backend/src/lib/permissions.ts` and the auth-setup seed. Super-admin passes every check.
| Action | Key | Seed roles |
|---|---|---|
| see BOM list, any revision, tree, needs preview, where-used, history | `bom.view` | ow, bo, fs |
| create draft, edit draft, start new revision, delete draft | `bom.manage` | ow, bo |
| release a draft (makes it active), retire the active revision | `bom.release` | ow (card 3) |
| edit a released (active or retired) revision | nobody | |

## Flow
| From | Action | To | Rule |
|---|---|---|---|
| — | create first BOM for a part | draft (rev A) | BR-BOM-01, 02 |
| active / retired | start new revision | draft (next letter, copy) | BR-BOM-14 |
| draft | edit header / lines | draft | BR-BOM-03..09, 11, 28 |
| draft | delete | gone (audit row stays) | BR-BOM-15 |
| draft | release | active; the part's previous active → retired | BR-BOM-12, 13, 17, 28 |
| active | retire (no replacement) | retired | BR-BOM-16 |

`retired` is final; to use an old design again, start a new revision from it (BR-BOM-14).

## Rules
One sentence per rule, plus one example. IDs are permanent (strike out, never renumber).
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-BOM-01 | A BOM is created for one part = an active item of category "Manufactured part" with unit `pcs` or `set`, as a `draft` with a kind (`casting`, `job_work`, `assembly`); `createdBy` = me. A casting BOM needs a part in `pcs`. An inactive part, a part of any other category, a part in kg/ltr/m, or any other kind → 400. | create casting BOM for HSG-RC (Manufactured part, pcs) → draft rev A; for ADC12 (kg) → 400; for BUSH-M6 (Raw Material) → 400; casting BOM for a `set` item → 400; kind `phantom` → 400 |
| BR-BOM-02 | Revisions are letters per part in order A…Z, then AA, AB…; a letter is given when the draft is created and never reused, even if that draft is deleted. The BOM number shown is `BOM-<part SKU>-<rev>`. | HSG-RC has A (retired), B (draft deleted) → next draft is C, shown BOM-HSG-RC-C |
| BR-BOM-03 | A component line has an active item, qty per **one** piece of the part > 0 with up to 3 decimals (any unit), an optional note, and a "buy as is" flag (BR-BOM-09). The same item twice on one BOM, the part itself as a line, the casting BOM's alloy as a line, or more than 50 lines → 400. A service can never be a line (BR-INV-10): a service id sent as a line → 400. | BUSH-M6 2; carton 0.020 per piece → ok; BUSH-M6 twice → 400; HSG-RC on its own BOM → 400; ADC12 as a line on HSG-RC → 400; qty 0 → 400; "CNC machining" id as a line → 400 |
| BR-BOM-04 | A casting BOM holds: one alloy item (active, unit kg), net weight per piece, shot weight per shot (part + runner + overflow, all cavities), cavities (whole, 1–64), melt loss % and casting reject % (each 0 ≤ x < 50). Weights are kg > 0 with 3 decimals; shot weight must be ≥ net weight × cavities. | net 0.850, 2 cavities, shot 1.600 → 400 (needs ≥ 1.700); alloy BUSH-M6 (pcs) → 400; reject 50 → 400 |
| BR-BOM-05 | The casting BOM shows, computed and never typed: poured weight per piece = shot ÷ cavities; casting yield % = net × cavities ÷ shot; alloy used per good piece = net + poured × melt loss ÷ (1 − reject). Runner, overflow and rejected castings go back to the furnace, so only net weight and melt loss are used up (card 1). Display rounds to 3 decimals / 1 decimal %. | HSG-RC → poured 1.000 kg, yield 85.0 %, alloy per good piece 0.882 kg |
| BR-BOM-06 | On a casting BOM, component lines (inserts) are per **poured** piece: every poured piece takes them, rejects included. Casting reject % is a field of the casting BOM (card 2). | 1000 good HSG-RC, reject 5 % → pour 1053 → BUSH-M6 2106 |
| BR-BOM-07 | A job-work BOM has exactly one sent item (active, unit `pcs`, ≠ part) with whole send and return numbers (send : return, default 1 : 1), a job worker (active supplier of type `service_provider` or `both`), one service from that job worker's active service list (as BR-SCO-02), and a job-work loss % (0 ≤ x < 50). Any other component line, missing job worker or service, or a service not on that job worker's list → 400. | HSG-MC: send 1 HSG-RC → 1 HSG-MC, Sai CNC, CNC machining, loss 2 % → ok; add BUSH-M6 line → 400; service not on Sai CNC's list → 400 |
| BR-BOM-08 | An assembly BOM has at least one component line and no casting or job-work fields; a casting BOM needs its casting data (BR-BOM-04) and may have component lines; sending fields of the other kind → 400. The kind can be changed only while draft. | assembly with no lines → release 400; assembly with shot weight → 400 |
| BR-BOM-09 | A line (or the sent item of a job-work BOM) whose item has an active BOM is walked into that BOM, unless the line is marked "buy as is"; an item with no active BOM is always treated as bought and tagged "no BOM" in the tree and in the needs preview — never skipped. | HSG-RC line, HSG-RC has active rev A → walked; marked buy as is → shown as buy 1021 HSG-RC; BUSH-M6 (no BOM) → buy |
| BR-BOM-10 | A BOM may not contain its own part at any depth, through this draft plus the active revisions of every level; such a save or release → 400 naming the path. More than 10 levels → 400. Every walk of the levels (save and release loop check, tree, change summary, needs preview) stops at 1,000 nodes → 400 `BOM_TOO_LARGE`. | HSG-MC draft sends HSG-RC, and an HSG-RC draft adds HSG-MC as a line → that save 400 "HSG-RC → HSG-MC → HSG-RC" |
| BR-BOM-11 | Only a `draft` can be changed (header, kind, casting data, job-work fields, lines); any change to an `active` or `retired` revision → 409 and nothing changes. | change net weight on active rev A → 409 |
| BR-BOM-12 | Release turns a draft into `active` only if every rule above holds again at that moment (items, job worker and service still active, casting data complete, no loop); it saves released by, released at and a change reason (trimmed, 3–500 characters; required unless this is the part's first release, i.e. the part has no active and no retired revision; same limits if given). Any failure → 400 listing every problem, nothing changes. | rev B replacing A with no reason or "  ab " → 400; rev A with no reason → ok; draft A deleted, rev B is the first release, no reason → ok; BUSH-M6 deactivated since the draft was saved → 400 |
| BR-BOM-13 | Before release the screen shows the change summary against the part's active revision: lines added, removed and changed (qty, buy-as-is), and every changed header field with old → new. A part with no active and no retired revision shows "First revision, nothing to compare"; a draft equal to the active revision shows "No changes against rev <letter>" and may still be released. | rev B changes BUSH-M6 2 → 3 and melt loss 3 → 4 % → summary lists both with old → new; first draft of HSG-RC → "First revision"; B identical to A → "No changes against rev A" |
| BR-BOM-14 | "Start new revision" copies the part's active revision (else its latest retired one) into a new draft with the next letter; a part can have only one draft at a time, a second → 409 naming the open draft. "Create BOM" on a part that already has any revision (even only retired ones) → 409 pointing to "Start revision". | HSG-RC active A → start → draft B with A's data; start again → 409 "draft B is open"; create on a part with only retired A → 409 "use Start revision" |
| BR-BOM-15 | Only a draft can be deleted (`bom.manage`); deleting writes an audit row and frees the part for a new draft; active or retired → 409. | delete draft B → gone, audit row kept; delete active A → 409 |
| BR-BOM-16 | Retire without replacement needs `bom.release` and a reason (trimmed, 3–500 characters, else 400); the confirm shows every active BOM that uses the part, which from then on treats it as bought (BR-BOM-09). | retire HSG-RC A with reason "die scrapped" → retired; HSG-MC rev A now shows HSG-RC "no BOM" |
| BR-BOM-17 | A part has at most one `active` revision at any time (enforced in the database): release retires the previous active one in the same transaction; two releases at once → one wins, the other 409 and stays draft. Old documents keep the revision they used. | A active, release B → B active, A retired, one step |
| BR-BOM-18 | Needs preview: for a part with an active revision and a whole qty Q > 0 (≤ 1,000,000), the system walks every level (BR-BOM-09) and lists per level what to cast, send and buy: casting → pour = ⌈Q ÷ (1 − reject)⌉, alloy kg = Q × net + pour × poured weight × melt loss, inserts = pour × line qty; job work → send = ⌈⌈Q ÷ (1 − loss)⌉ × send ÷ return⌉ of the sent item; assembly → Q × line qty. Each node on each path is rounded up on its own (whole for pcs/set, 3 decimals up for kg/ltr/m), and the "to buy" list sums those rounded values per item, so it never under-orders (card 7). A part with no active revision → 409 on the web route; called as a service (sale order), it returns a `no_bom` result for that line instead of failing, so the other lines still run. A tree above 1,000 rows → 400. It reads no stock and creates nothing. This is the one calculation sale-order explosion uses, per level; it wins over any formula elsewhere. | 1000 HSG-MC → send 1021 HSG-RC → pour 1075 → ADC12 900.100 kg (867.850 + 32.250), BUSH-M6 2150 pcs; one item 20.42 + 10.30 on two paths → 21 + 11 = 32 |
| BR-BOM-19 | Where-used: for any item, list the parts whose **active** revision uses it as a direct line, the job-work sent item or the casting alloy, with revision, role and qty per piece; drafts and retired revisions are not listed. | BUSH-M6 → HSG-RC rev A, line, 2 per piece; ADC12 → HSG-RC rev A, alloy |
| BR-BOM-20 | An item that is the part of any BOM revision (any status), or its line, sent item or alloy, counts as "in use" for inventory BR-INV-04: its SKU and unit can't change (409 `ITEM_IN_USE`). | BUSH-M6 on draft HSG-RC B, unit pcs → kg → 409; ADC12 kg → pcs → 409 |
| BR-BOM-21 | Deactivating an item, job worker or service stays allowed (BR-INV-05); an active BOM that uses it keeps it and shows it tagged "inactive"; a new draft save or release with it → 400. | deactivate BUSH-M6 → HSG-RC A shows "BUSH-M6 inactive"; release HSG-RC B with it → 400; Sai CNC deactivated → HSG-MC A tagged, its draft B release → 400 |
| BR-BOM-22 | Without the needed key the action is refused (403) and the screen does not show it: view without `bom.view`, create/edit/delete/start without `bom.manage`, release/retire without `bom.release`. Each write route checks exactly one key and returns only `{ id, status, version }`, so no write call ever returns BOM content; read routes accept `bom.view`, `bom.manage` or `bom.release`; every seed role holding a write key also holds `bom.view`. | fs edits a draft → 403; bo releases → 403 (seed); release → 200 `{ id, status, version }`, no lines or header |
| BR-BOM-23 | Create, edit, delete, release and retire each write an audit row (who, when, before → after); a released revision shows created by/at, released by/at and the change reason. | release B → audit row; B shows "released by Arun, 20 Nov 2026, reason: 3 bushes" |
| BR-BOM-24 | Each BOM screen offers its one next step: part without a BOM → "Create BOM"; draft → "Release" (`bom.release`) or, without it, the label "Waiting for release"; active → "Start revision <next>", or "Open draft <rev>" when the part already has an open draft; retired → "Open active revision" (or "Start revision <next>" if none is active). Without `bom.manage`, an active or retired revision shows no Start / Create button (links to open a revision stay). | draft B seen by bo → "Waiting for release", by ow → "Release"; active A with draft B open → "Open draft B"; fs on active A → no button |
| BR-BOM-25 | The BOM list shows one row per revision (number, part, kind, status, released on), filterable by status, kind and part search, default status = active + draft, 10 per page (1–100); a part's page lists all its revisions newest first. | filter "retired" → only retired revisions |
| BR-BOM-26 | A draft may be saved with its casting or job-work data incomplete (values given are still checked, e.g. shot ≥ net × cavities); completeness is checked only at release (BR-BOM-12). | casting draft with no shot weight → saved; release it → 400 "shot weight missing" |
| BR-BOM-27 | No BOM screen or API returns a price, rate or cost (no costing in v1; job-work service prices stay on the job worker's service list). | GET HSG-MC rev A → no price field |
| BR-BOM-28 | A draft carries a version token that changes on every save; the BOM detail and the change summary return it, and every edit (PATCH) and release must send the token it was based on; a different token → 409 `BOM_CHANGED_SINCE_REVIEW`, nothing changes. So the owner releases exactly what the summary showed, and one back-office user never silently overwrites another. | owner opens summary of B (token 4); bo saves B (token 5); owner releases with 4 → 409, reloads, sees the new summary; two bo users edit B from token 5 → first saves (6), second → 409 |

## Security
No money is held on a BOM (no costing in v1); no service price is shown on BOM screens.
| Data | Who may see it | Who may change it |
|---|---|---|
| BOM revisions, tree, needs preview, where-used, history | `bom.view` | draft: `bom.manage`; status: `bom.release` |
| Audit rows | `bom.view` (as history) | nobody |

Abuse cases — each one ends in a rule above:
| Who | Tries to | Stopped by |
|---|---|---|
| back office | quietly change a live BOM (edit active revision) | BR-BOM-11 |
| back office | make own draft live without the owner | BR-BOM-12, 22 |
| anyone | build a loop that hangs the explosion | BR-BOM-10 |
| anyone | ask the needs preview for a huge qty to load the server | BR-BOM-18 (≤ 1,000,000), BR-BOM-10 (≤ 10 levels) |
| two users | release two revisions of one part at once | BR-BOM-17 |
| back office | change a draft after the owner opened the release summary, so the owner releases something unseen | BR-BOM-28 |
| two back-office users | overwrite each other's draft edits | BR-BOM-28 |
| anyone | build a very wide BOM tree to load the server through tree, summary or save | BR-BOM-10 (1,000 nodes) |
| anyone with a write key | read BOM content through a write route's response | BR-BOM-22 (write routes return `{ id, status, version }` only) |
| store / back office | change an item's unit under a BOM, breaking its quantities | BR-BOM-20 |

Audit: create draft, edit draft, delete draft, release, retire (BR-BOM-23).

## Edge cases
Full list: `design/edge-cases.md` (61 rows). Every row there names a rule in this file.
| Source | Count |
|---|---|
| benchmark | 40 |
| owner | 8 |
| invariant | 13 |

## Cards (in `OWNER.md`; option A pre-approved by the owner in chat, 2026-11-20, applied in the rules)
| # | Card | A (applied) | B | What the benchmarks do (stricter wins) | Rule |
|---|---|---|---|---|---|
| 1 | How much alloy one good casting uses | net weight + melt loss; runners, overflow, rejects remelted → 900.100 kg ADC12 for 1000 HSG-MC | full poured weight used up → ~1,075 kg | ERPNext scrap / process loss items only ([BOM](https://docs.frappe.io/erpnext/user/manual/en/bill-of-materials)); Odoo, SAP B1 silent on remelt ([B1 thread](https://archive.sap.com/discussions/thread/632073)); foundry cost model aPriori counts runners as remelt allowance ([aPriori](https://www.apriori.com/Collateral/Documents/English-US/online_help/2019_R2/COST_MODEL_GUIDE/AP_CMG0175Material_Cost_and_Utilization_for_Die_Casting.html)) → die-casting differs, A | BR-BOM-05, 18 |
| 2 | Casting reject % on the BOM | yes: pour 1075 for 1021; inserts per poured piece | no: rejects made up by hand | ERPNext Process Loss % on the BOM ([BOM](https://docs.frappe.io/erpnext/user/manual/en/bill-of-materials)); Odoo none on the BoM ([BoM](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/manufacturing/basic_setup/bill_configuration.html)); SAP B1 none ([B1 thread](https://archive.sap.com/discussions/thread/632073)) → stricter (plans the loss), A | BR-BOM-06, 18 |
| 3 | Who makes a revision live or retires it | owner only (`bom.release` ow) | back office too | ERPNext submit is a separate right ([BOM](https://docs.frappe.io/erpnext/user/manual/en/bill-of-materials)); Odoo ECO approvers ([ECO](https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/plm/manage_changes/engineering_change_orders.html)); SAP B1 silent → stricter, A | who-table, BR-BOM-12, 22 |
| 4 | Alloy grade per part | fixed per revision; other grade = new revision | purchase swaps to an allowed alternate per order | ERPNext Item Alternative on work orders ([alt](https://docs.frappe.io/erpnext/user/manual/en/item-alternative), not re-read); Odoo one component per line ([BoM](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/manufacturing/basic_setup/bill_configuration.html)); SAP B1 silent → stricter, A | BR-BOM-04 |
| 5 | Several job-work steps | one item + one job-work BOM per step | one BOM lists all steps | ERPNext subcontracting BOM per finished item ([sub](https://docs.frappe.io/erpnext/user/manual/en/subcontracting-order)); Odoo subcontract BoM per product ([sub](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/manufacturing/subcontracting/subcontracting_resupply.html)); SAP B1 silent → A | BR-BOM-07, 09 |
| 6 | BOM per part or per die | per part; shot weight and cavities on it | per die (family dies) | ERPNext, Odoo, SAP B1 hang the BOM on the item ([B1](https://learning.sap.com/courses/managing-logistics-in-sap-business-one/utilizing-bill-of-materials-bom-in-sap-business-one)); die-casting shot is per die ([Euroguss](https://www.euroguss.de/en/euroguss-365/2023/expertenwissen/driving-the-digital-transformation-in-high-pressure-die-casting)) → A | BR-BOM-04 |
| 7 | Where the needs figure rounds up | per node and per path, then summed (never short) | sum per item first, round once | ERPNext production plan totals per item ([plan](https://docs.frappe.io/erpnext/user/manual/en/production-plan), not re-read); Odoo rounds each move by its unit ([UoM](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/product_management/configure/uom.html), not re-read); SAP B1 silent → stricter (never under-orders), A | BR-BOM-18 |

7 cards — at the limit, no split.

## Decided by agent
All in `assumptions.md`: A-01..A-08, A-45, A-48 `confirm` (listed by name in `OWNER.md`), A-09..A-44, A-46, A-47 `info`.

## Changes to other modules (change requests; those specs are not edited here)
| Module | Change | Why |
|---|---|---|
| inventory (`docs/specs/inventory.md`) | BR-INV-04 "in use" adds: part of any BOM revision, any BOM line item, job-work sent item, casting alloy (any status, drafts included) | BR-BOM-20 |
| inventory | BR-INV-05 "inactive item can't go on a new …" adds BOM drafts and releases | BR-BOM-21 |
| inventory | BR-INV-02 category list adds "Manufactured part" (parts the plant makes: castings, machined, assembled); existing made parts get re-categorised by back office before their first BOM | BR-BOM-01 |
| auth-setup | New keys `bom.view` (ow, bo, fs), `bom.manage` (ow, bo), `bom.release` (ow); module `bom`, screen `/bom` (`bom.view`) | who-table, BR-BOM-22 |
| subcontracting | No rule change; the BR-SCO-02 job-worker / service check is shared, not copied | BR-BOM-07 |
| sale-order (checked, consistent) | Calls BR-BOM-18 per level with the net qty and never re-rounds (BR-SO-23, 24): matches card 7 option A. If card 7 turns to B, BR-SO-24 must change too. No leftover per-line scrap / alloy formula found. Wording: its Summary says "released BOM" = our `active` revision. BR-SO-26 relies on BR-BOM-18's `no_bom` service result for a top-level line (now in BR-BOM-18). BR-SO-38 needs release / retire times, kept by BR-BOM-23. | BR-BOM-18, 23 |

## Not now
- Costing / cost roll-up, rates on BOM lines (research Q8).
- In-house routing and operations (trimming, fettling, shot blasting), machines, cycle times, dies as items.
- Family dies (several part numbers from one die); phantom BOMs; variants; alternate component lines.
- Date-effective revisions (future go-live), approval chain / ECO board, merging parallel drafts.
- More than one sent item, or material we supply extra, on a job-work step; outsourced casting.
- Remelt credit or runner stock as an item; heat / lot traceability.
- Copy a BOM from another part; import from Excel.
- A "manufactured parts without an active BOM" report (the new category makes it possible later).
- Stock, reservations, PR/SCO creation — sale order / explosion (M4).

## Open questions
Must be empty at freeze. Each one ends as an owner card in `OWNER.md` or a row in `assumptions.md`.
| # | Question | Goes to |
|---|---|---|

(none — pass 1 questions 1–4 answered in `design/` and `assumptions.md`; question 5 is under "Changes to other modules")

## Changelog
- 2026-11-20 v0 — draft (pass 1). Owner delegated all decisions; 6 pending cards with recommended option applied.
- 2026-11-20 v0 — pass 2: card 7 (needs rounding) added; BR-BOM-03 (alloy not a line), 14 (create on a part with
  only retired revisions → 409), 18 (per-node/per-path rounding, 409 no active, row cap, BOM wins), 19/20 (alloy),
  21 (job worker, service) completed; BR-BOM-26 (incomplete draft), 27 (no prices) added; edge cases, assumptions,
  OWNER.md written; "Changes to other modules" added.
- 2026-11-20 v0 — pre-freeze security fixes: BR-BOM-28 (version token on edit and release, 409
  `BOM_CHANGED_SINCE_REVIEW`); BR-BOM-10 1,000-node cap on every walk; BR-BOM-22 manage/release need view;
  BR-BOM-12/16 reasons trimmed 3–500.
- 2026-11-20 v0 — spec-review fixes: BR-BOM-01 part category "Manufactured part" (BR-INV-02 change) and
  unknown kind → 400; BR-BOM-03 service id → 400; BR-BOM-12 first release needs no reason; BR-BOM-13
  "first revision" / "no changes" wording; BR-BOM-18 service returns `no_bom`; BR-BOM-24 "Open draft", no
  button without `bom.manage`.
- 2026-11-20 v1 — frozen; OWNER.md approved on the owner's delegation (D-028): owner pre-approved recommended options in chat, 2026-11-20: "take ur own decision and record them and run whatever parallel subagents u want to complete a complete scm module according to my plan, ill do a complete merge in moring once completed"
- 2026-11-20 v1 — doc fix after freeze: validation 400s carry no `VALIDATION_ERROR` code (Zod 400 has none; service uses `BAD_REQUEST`). No rule change.
