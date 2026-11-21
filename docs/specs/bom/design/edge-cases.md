# BOM — edge cases

> Written by spec-analyst from `docs/research/bom.md` → "Edge cases seen in the products", the owner's
> delegation (cards pre-approved, option A, chat 2026-11-20), the coordinator's answers to the designers'
> questions, and the designers' files. Every row names a rule in `../spec.md`; the rule id is the test id.
> The owner sees only the count.

Source: **benchmark** (what ERPNext / Odoo / SAP do) · **owner** (an answered card or interview answer) ·
**invariant** (money in paise, stock only through the ledger, permission + audit on state changes).

Example data: the spec's Summary (HSG-RC casting rev A, HSG-MC job work rev A, ADC12, BUSH-M6, Sai CNC).

| # | Case | What the system does | Source | Rule |
|---|---|---|---|---|
| E-01 | Someone edits a released (active or retired) revision | 409, nothing changes; the change goes into a new revision copied from it | benchmark (ERPNext submit, Odoo ECO) | BR-BOM-11 |
| E-02 | Two people want to change the same part at once | One open draft per part; the second "start revision" → 409 naming draft B; no merging | benchmark (ERPNext has no merge; stricter than Odoo 17 rebase) | BR-BOM-14 |
| E-03 | A component or sub-part has no active BOM | Treated as bought and tagged "No BOM" in tree and needs preview; never skipped | benchmark (ERPNext, Odoo, SAP B1) | BR-BOM-09 |
| E-04 | A part we normally make should be bought this time (HSG-RC from outside) | Line marked "buy as is" → shown as buy, not walked | benchmark (ERPNext Do Not Explode) | BR-BOM-09 |
| E-05 | Job worker brings his own nuts / consumables | Not on the BOM (part of his service price); any line on a job-work BOM → 400 | benchmark (ERPNext supplier-supplied items) | BR-BOM-07 |
| E-06 | HSG-RC's BOM is retired with no replacement while HSG-MC uses it | Confirm lists HSG-MC first; from then on HSG-MC treats HSG-RC as bought ("No BOM") | benchmark (ERPNext / Odoo: inactive BOM not exploded) | BR-BOM-16 |
| E-07 | BUSH-M6 is deactivated while on active HSG-RC rev A | Rev A keeps it, tagged "inactive"; saving or releasing a draft with it → 400 | benchmark (SAP case gives no error; we flag, stricter) | BR-BOM-21 |
| E-08 | Sai CNC deactivated, or "CNC machining" removed from its list, after HSG-MC rev A was released | Rev A keeps them, tagged "inactive"; releasing a draft with them → 400 | benchmark | BR-BOM-21, 12 |
| E-09 | Someone asks for a phantom / kit / any other BOM kind | 400; only casting, job work, assembly | benchmark (SAP B1, ERPNext phantom = not now) | BR-BOM-01 |
| E-10 | The product itself is lost (casting rejects, job-work loss) | Loss % sits on the BOM and planning makes extra (pour 1075 for 1021, send 1021 for 1000) | benchmark (ERPNext Process Loss) | BR-BOM-06, 07, 18 |
| E-11 | Runners, overflow and rejected castings | Go back to the furnace: only net weight and melt loss are used up (900.100 kg, not ~1,075 kg) | owner (card 1) | BR-BOM-05, 18 |
| E-12 | Rejected castings already carry inserts | Inserts counted per poured piece: 1075 × 2 = 2150 BUSH-M6 | owner (card 2) | BR-BOM-06 |
| E-13 | Back office presses Release | Button not shown, label "Waiting for release"; direct call → 403 | owner (card 3) | BR-BOM-22, 24 |
| E-14 | Purchase wants LM24 instead of ADC12 for one order | Not possible; a grade change is a new revision released by the owner | owner (card 4) | BR-BOM-04 |
| E-15 | A part is cast, machined, then plated | One item and one job-work BOM per step (HSG-RC → HSG-MC → HSG-PL), walked level by level | owner (card 5) | BR-BOM-07, 09 |
| E-16 | A two-cavity die | Shot weight and cavities sit on the part's own BOM; poured weight = shot ÷ cavities | owner (card 6) | BR-BOM-04, 05 |
| E-17 | The same bought item is needed through two paths (20.42 and 10.30 pcs) | Each path rounded up (21, 11), then summed in "to buy" (32) | owner (card 7) | BR-BOM-18 |
| E-18 | Packing at 0.020 per piece for 1021 pieces = 20.42 pcs | Rounded up to 21 pcs; kg/ltr/m to 3 decimals, up | owner (card 7) | BR-BOM-18 |
| E-19 | Shot weight below net × cavities (1.600 for 2 × 0.850) | 400 "needs ≥ 1.700" | benchmark (aPriori: shot = part + runner + overflow) | BR-BOM-04 |
| E-20 | Alloy item not in kg; casting BOM on a `set` item; a kg item as a part | 400 | benchmark | BR-BOM-01, 04 |
| E-21 | ADC12 entered as the alloy and again as a component line | 400 (would count the alloy twice) | benchmark (ERPNext allows repeats; we refuse, stricter) | BR-BOM-03 |
| E-22 | Same item twice, the part on its own BOM, 51 lines, qty 0, a service as a line | 400 | benchmark | BR-BOM-03 |
| E-23 | A draft would loop through another part's active revision (HSG-RC → HSG-MC → HSG-RC) | Save or release → 400 naming the path | benchmark (no product states it; own safety rule) | BR-BOM-10 |
| E-24 | Two releases of different parts, each fine alone, would form a loop together | Releases run one at a time; the second sees the loop → 400 | invariant | BR-BOM-10 |
| E-25 | More than 10 levels | 400 | benchmark (own limit) | BR-BOM-10 |
| E-26 | Two people release two drafts of one part at the same moment | One wins; the other gets 409 and stays draft | invariant | BR-BOM-17 |
| E-27 | A draft is edited while the owner releases it | The edit that lands after release → 409, nothing changes | invariant | BR-BOM-11 |
| E-28 | An item was deactivated after the draft was saved | Release → 400 listing every problem; nothing changes | benchmark | BR-BOM-12 |
| E-29 | Release of rev B replacing A with no reason | 400; the part's first release needs no reason | benchmark (Odoo ECO reason) | BR-BOM-12 |
| E-30 | Release of a draft identical to the active revision | Summary "No changes against rev A"; release allowed with a reason | benchmark | BR-BOM-13 |
| E-31 | Draft B deleted | Letter B never reused (next is C); audit row stays | benchmark (ERPNext naming series) | BR-BOM-02, 15 |
| E-32 | A part reaches revision Z | Next is AA, then AB | benchmark | BR-BOM-02 |
| E-33 | "Create BOM" on a part that has only retired revisions | 409 `BOM_ALREADY_EXISTS` pointing to "Start revision" | benchmark | BR-BOM-14 |
| E-34 | Start revision on a part with no active revision | Copies the latest retired revision | benchmark (Odoo ECO copies the BOM) | BR-BOM-14 |
| E-35 | Active rev A retired while draft B is open | Allowed; B later releases with nothing to retire | benchmark | BR-BOM-16, 17 |
| E-36 | Retire with no reason | 400 | invariant (audit) | BR-BOM-16 |
| E-37 | Unit or SKU change of an item on any BOM (part, line, sent item, alloy; draft included) | 409 `ITEM_IN_USE` | benchmark | BR-BOM-20 |
| E-38 | Needs preview for a part with no active revision | 409 `NO_ACTIVE_BOM` | benchmark | BR-BOM-18 |
| E-39 | Needs preview with qty 0, a decimal, or above 1,000,000 | 400 | benchmark (own limit) | BR-BOM-18 |
| E-40 | Needs preview tree above 1,000 rows | 400 `BOM_TOO_LARGE` | benchmark (own limit) | BR-BOM-18 |
| E-41 | Any BOM action or preview | Posts nothing to the stock ledger, reads no stock, creates no document | invariant | BR-BOM-18 |
| E-42 | Job work with send : return not 1 : 1 (2 : 1) | send = ⌈⌈Q ÷ (1 − loss)⌉ × 2 ÷ 1⌉ | benchmark | BR-BOM-18 |
| E-43 | Back office saves a casting draft before the shot weight is known | Saved; completeness is checked at release | benchmark (ERPNext draft save) | BR-BOM-26 |
| E-44 | Someone looks for a price or service rate on a BOM | None is returned or shown | invariant | BR-BOM-27 |
| E-45 | A user without the key opens, edits, releases or retires | 403; the button is not shown | invariant | BR-BOM-22 |
| E-46 | Create, edit, delete, release, retire | Each writes who, when, before → after | invariant | BR-BOM-23 |
| E-47 | The alloy (kg) and other kg/ltr/m items | Can never have a BOM, so always bought | benchmark | BR-BOM-01, 09 |
| E-48 | The part itself is deactivated | New BOM → 400; release of its draft → 400; its active revision still works, tagged | benchmark | BR-BOM-01, 12, 21 |
| E-49 | Kind changed on a draft but the old kind's fields are still sent | 400 | benchmark | BR-BOM-08 |
| E-50 | Where-used for ADC12 | Lists active revisions using it, role "alloy"; drafts and retired not listed | benchmark (ERPNext Item Where Used, Odoo Used In) | BR-BOM-19 |
| E-51 | Sale order has its own scrap or alloy formula | The BOM calculation wins; sale order calls it per level | benchmark (one function, ERPNext exploded items) | BR-BOM-18 |
| E-52 | The same sub-part is reached through two parents | Walked once per path, one row per path | benchmark (ERPNext / Odoo exploded view per path) | BR-BOM-18 |
| E-53 | Back office saves draft B after the owner opened its release summary | Release with the old token → 409 `BOM_CHANGED_SINCE_REVIEW`, nothing changes; owner reloads the new summary | invariant (permission: owner releases only what he saw) | BR-BOM-28 |
| E-54 | Two back-office users edit draft B from the same version | First save wins; second → 409 `BOM_CHANGED_SINCE_REVIEW`, no silent overwrite | invariant | BR-BOM-28 |
| E-55 | A very wide tree (above 1,000 nodes) in tree view, change summary, or the loop check on save / release | 400 `BOM_TOO_LARGE`, nothing saved | benchmark (own limit) | BR-BOM-10 |
| E-56 | A user with only a write key (`bom.manage` or `bom.release`) edits or releases | Write response is `{ id, status, version }` only, no BOM content; reads allowed with any of the three keys | invariant | BR-BOM-22 |
| E-57 | A release reason (when required) or retire reason is blank, spaces only, or under 3 characters after trimming | 400 | invariant (audit) | BR-BOM-12, 16 |
| E-58 | BOM for an item that is not in category "Manufactured part" (e.g. BUSH-M6, Raw Material) | 400; back office re-categorises made parts first | benchmark (Odoo "Manufacture" route / ERPNext "Default BOM" only on made items) | BR-BOM-01 |
| E-59 | Sale order explodes a line whose item has no active revision | Service returns `no_bom` for that line; other lines still run (web preview route: 409) | benchmark (ERPNext production plan skips items without BOM) | BR-BOM-18 |
| E-60 | Active A has open draft B; floor supervisor views A | Owner / back office see "Open draft B"; fs (no `bom.manage`) sees no button | invariant (permission) | BR-BOM-24 |
| E-61 | Draft A deleted, so rev B is the part's first release | No reason needed; summary "First revision, nothing to compare" | benchmark | BR-BOM-12, 13 |
