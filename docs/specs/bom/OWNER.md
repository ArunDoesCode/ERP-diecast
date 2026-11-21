---
module: bom
approved_on: 2026-11-20   # owner pre-approved recommended options in chat, 2026-11-20: "take ur own decision and record them and run whatever parallel subagents u want to complete a complete scm module according to my plan, ill do a complete merge in moring once completed"
---

# Bill of materials (BOM) — for your approval

## 1. What you asked for
What a casting is made of (alloy, inserts, job work) lives in people's heads, so nobody can work out what to buy.
One BOM per part, with levels, casting yield, alloy, inserts, job-work steps and revisions. Done = every running part has one live BOM.

## 2. What the user will be able to do
- Back office writes a BOM per part: casting (alloy, weights, cavities, losses, inserts), job work, or assembly.
- Revisions A, B, C: a live revision is locked; a change is a new revision you release after seeing what changed.
- Anyone with access types a quantity and sees what to cast, send and buy, level by level (nothing is created), and which parts use an item.
> Example: 1,000 machined housings HSG-MC. Sai CNC loses 2 % → send 1,021 raw castings. Rejects 5 % → pour 1,075.
> Alloy ADC12: 1,021 × 0.850 kg + 3 % melt loss on 1,075 kg poured = 900.1 kg. Inserts: 2 per poured piece = 2,150.

## 3. Screens
![BOM list](design/screens/bom-list.html) Find a BOM by part, status or kind, or start a new one.
![Part page](design/screens/part-page.html) One revision, its levels, what N pieces need, where it is used; one next-step button.
![BOM form](design/screens/bom-form.html) Fill casting data or the job-work step and inserts; yield shows as you type.
![Release dialog](design/screens/release-dialog.html) You see what changed against the live revision, give a reason, release.

## 4. Decisions for you
### Card 1 — How much alloy does one good casting use up?
- **A (recommended):** Net weight plus melt loss; runners, overflow and rejects go back to the furnace. 1,000 HSG-MC → 900.1 kg.
- **B:** The full poured weight is used up → about 1,075 kg for the same order.
- **For the factory user:** A buys what is really lost; B buys ~175 kg extra per such order. Sale orders buy alloy from this figure. Foundry costing tools do A; the big ERPs have no rule. No extra build time.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 2 — Should each casting BOM carry a casting reject %?
- **A (recommended):** Yes. Planning pours extra (1,075 instead of 1,021) and counts inserts for rejects too.
- **B:** No. Rejects are made up later with a second order by hand.
- **For the factory user:** A gives the floor the right pour count up front; the % must be kept realistic. ERPNext has this; Odoo and SAP don't. No extra build time.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 3 — Who makes a new BOM revision live or retires one?
- **A (recommended):** You only. Back office prepares the draft and sees "Waiting for release"; only you retire a live BOM.
- **B:** Back office too.
- **For the factory user:** A costs you one click per change, but a wrong BOM can't start buying wrong metal unseen. ERPNext and Odoo keep release as a separate right. No extra build time.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 4 — Can purchase swap the alloy grade on one order?
- **A (recommended):** No. The grade is fixed per revision (ADC12); another grade needs a new revision.
- **B:** Purchase may pick an allowed alternate (e.g. LM24) per order.
- **For the factory user:** A keeps the grade locked unless you release a change. ERPNext allows alternates; Odoo doesn't. B: about 2 days more build.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 5 — A part is machined, then plated: how is it set up?
- **A (recommended):** Each step makes its own item with its own BOM (raw casting → machined → plated), like today's subcontract orders.
- **B:** One BOM lists all steps in order.
- **For the factory user:** A means one item per stage and stock counted per stage; subcontract orders stay as they are. ERPNext and Odoo do A. B: several days more and subcontract rework.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 6 — Does a BOM belong to the part or to the die?
- **A (recommended):** The part. Shot weight and cavities sit on the part's BOM.
- **B:** The die, shared by every part it casts (family dies).
- **For the factory user:** With A a family die is entered once per part, its shot weight split by hand. ERPNext, Odoo and SAP all hang the BOM on the item. B: about a week more.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)
### Card 7 — When "what N pieces need" has fractions, where does it round up?
- **A (recommended):** Each step and path rounds up on its own, then adds up — never short. 20.42 + 10.30 pcs → 21 + 11 = 32.
- **B:** Add first, round once: 30.72 → 31.
- **For the factory user:** A may buy one extra small item per path; B can leave you one short. Sale orders use the same rounding. ERPNext adds first; Odoo rounds each line. No extra build time.
- **Your answer:** A (owner pre-approved recommended options in chat, 2026-11-20)

## 5. Decided for you — please confirm
- Only one live revision per part; releasing a new one retires the old one at the same moment.
- A released revision can't be edited; a change is a new revision; old documents keep the one they used.
- An item used on any BOM (alloy included) can't change its code or unit.
- A job-work step sends exactly one item; what the job worker adds himself is in his price.
- An item with no live BOM is bought; a line can say "buy as is"; retiring a part's BOM makes it bought where used.
- Job worker and service come from the BOM; purchase may switch to another job worker with the same service.
- A switched-off item, job worker or service stays visible on live BOMs, marked inactive; it blocks a new release.
- Owner, back office and floor supervisor see BOMs; owner and back office write drafts; saving or releasing shows no BOM details by itself.
- Only items in a new category "Manufactured part" can have a BOM; back office re-files made parts once.

Everything else: 40 edge cases decided by ERP benchmark, 38 technical choices logged. No reading needed.

## 6. Not included
- Costing, in-house operations, machines, dies as items, family dies, variants, Excel import; stock and purchase requests (sale order, next).
