---
module: inventory
status: draft            # draft | frozen | changed-after-freeze
version: 0
frozen_on:
owner: Arun
depends_on: [auth-setup, grn-stock, suppliers]
---
# Inventory (items, services, machines, locations, stock view, manual movements)

> Retroactive: code exists (`/api/asset`). Ledger postings, item stock and average cost are owned by
> `grn-stock.md` (BR-GRN-21..44) and only referenced here. Code, gaps, benchmark: `docs/modules/inventory.md`.

## Summary

The master lists everything else hangs off: items (ingot, flux, spares), job-work services, machines and
stock locations. Plus a read-only stock view and ledger list, and one manual screen for stock-take and
opening stock. Done = the store clerk can set up an item once, see its stock per location, and correct a
stock-take difference with a reason, and nothing can quietly change a unit or a posted movement.

## Who can do what

| Action | Allowed |
|---|---|
| create / edit / deactivate items, services, locations, machines | `asset.manage` (seed bo) |
| see items, stock view, movement list | `inventory.view` (seed ow, bo, fs; auth-setup) |
| manual adjustment (stock-take, opening stock) | `inventory.adjust` (seed ow, bo; auth-setup) |
| read active machine list (name, code) for the PR form | `pr.link_machine` (BR-AUTH-26) |
| edit or delete a ledger row | nobody |
| super-admin | everything (BR-AUTH-18) |

## Flow

| From | Action | To | Rule |
|---|---|---|---|
| — | create item / service / location / machine | active | BR-INV-01, 02, 09, 11, 12, 16 |
| active | deactivate | inactive (kept, not pickable) | BR-INV-05, 06, 10, 15 |
| inactive | reactivate | active | BR-INV-05, 15 |
| item + location | stock-take / opening stock | ledger ±qty (grn-stock BR-GRN-43) | BR-INV-21..23 |

## Rules

| ID | Rule | Example (given → then) |
|---|---|---|
| BR-INV-01 | Item SKU is required and unique, ignoring case and outer spaces; a clash → 409 "Item SKU already exists". | "ADC12" exists, create " adc12 " → 409 |
| BR-INV-02 | Item name, category and unit are required. Category is one of Raw Material, Consumable, Spare Part, Tooling, Packing; unit one of kg, pcs, ltr, m, set (fixed lists in code). | unit "kgs" → 400 |
| BR-INV-03 | Current stock and average cost are shown read-only on the item and can't be sent on create or edit (BR-GRN-40). | edit item with `currentStock: 50` → 400, stock unchanged |
| BR-INV-04 | Once an item has any ledger row or any PR, PO or supplier-item line, its SKU and unit can't change → 409 `ITEM_IN_USE`. Name, description, category, reorder level can. | ingot with GRN posted, unit kg → pcs → 409 |
| BR-INV-05 | Items are never deleted, only deactivated or reactivated. An inactive item can't go on a new PR, PO or supplier-item link; open POs with it can still be received. | deactivate LM24, new PR line LM24 → 400; GRN on its open PO → ok |
| BR-INV-06 | An item that still has stock can be deactivated: it stays in the stock view marked "inactive" and can still be adjusted to zero. | deactivate flux with 12 kg → saved, shows 12 kg "inactive" |
| BR-INV-07 | Reorder level is ≥ 0 in the item's unit. The stock view flags active items whose stock is at or below a reorder level > 0. | reorder 500 kg, stock 480 → flagged; reorder 0 → never flagged |
| BR-INV-08 | Quantities have up to 3 decimals; items in `pcs` or `set` take whole numbers only (same as BR-GRN-02). | adjust 2.5 pcs → 400; 2.345 kg → ok |
| BR-INV-09 | Service code is required and unique ignoring case; name and default unit required. SAC code optional, but if given it is 6 digits starting with 99. (assumed) | SAC "998898" → ok; "1234" → 400 |
| BR-INV-10 | Services never hold stock: no ledger row, stock view or adjustment ever uses a service. Inactive services can't go on a new PO or SCO. | adjust a service id → 400 |
| BR-INV-11 | Location name is required and unique ignoring case; type is one of `main_store`, `vendor_premise`, `finished_goods`, `scrap_yard`. | second "Main Store" → 409 |
| BR-INV-12 | A `vendor_premise` location must link one active supplier, is always virtual, and each supplier has at most one. Other types must not link a supplier. | vendor_premise, no supplier → 400; main_store with supplier → 400 |
| BR-INV-13 | There is exactly one `main_store` (GRN posts there, BR-GRN-21). Creating a second or changing the only one to another type → 409. (assumed) | create 2nd main_store → 409 |
| BR-INV-14 | Once a location has a ledger row, its type and linked supplier can't change (409 `LOCATION_IN_USE`); name can. Locations are never deleted. | Scrap Yard with rows, type → finished_goods → 409 |
| BR-INV-15 | Locations and machines have an Active flag; inactive ones are hidden from pickers but keep their history. An inactive location can't take new postings. | deactivate old store, adjust into it → 400 |
| BR-INV-16 | Machine name is required and unique ignoring case; machine code (like "DC-01") is required and unique ignoring case. Type is free text for now. | second "DC-01" → 409 |
| BR-INV-17 | Machine status is one of idle, running, maintenance, breakdown; any change is allowed and saves who and when. Last maintenance date can't be in the future. | status → breakdown → saved with user and time; maintenance date tomorrow → 400 |
| BR-INV-18 | Machines are never deleted; a PR that points to a machine keeps it (PR BR-PR-02 checks it exists). | — |
| BR-INV-19 | Stock view per item: unit, current stock (item row, BR-GRN-37), average cost, value = stock × average rounded to paise, and the balance at each location from the ledger. | 1500 kg @ 21333 paise → value 31999500 |
| BR-INV-20 | The movement list is read-only, filterable by item, location, source, type and date, and each row names its source document. No route edits or deletes a ledger row. | PATCH/DELETE a movement → 404/405 |
| BR-INV-21 | The manual screen posts only stock-take or opening stock (BR-GRN-43/44/33 decide type, reason, cost, negative stock). It never defaults to a document type. | form opens → type "Stock-take", not "GRN" |
| BR-INV-22 | Stock-take: the clerk enters the counted qty; the system posts counted − current balance at that location. Difference 0 → nothing posted, 400 "no difference". | balance 480, counted 470 → −10 posted; counted 480 → 400 |
| BR-INV-23 | Opening stock is allowed only for an item+location with no ledger rows yet; otherwise 409 "use stock-take". (assumed) | item with a GRN posted, opening stock → 409 |
| BR-INV-24 | "Last rate" for a supplier+item = newest line price on a PO for that supplier that is approved or later (not draft, pending or cancelled); else the supplier's catalog price; else the item average if > 0; else 404. The PO price suggestion (BR-SUP-16) uses this. | only a cancelled PO @ 250 and catalog @ 240 → 240, source catalog |
| BR-INV-25 | Every create, edit, deactivate and reactivate of an item, service, location or machine saves who and when. | back_office edits item name → last updated by them, now |

## Not now

- Bins/racks inside a location, several stores, transfers between locations (come with SCO in M2).
- Batch/heat stock balances and expiry; item variants; alternate units and unit conversion.
- Reorder alerts that raise a PR by themselves; ABC analysis; stock ageing report.
- Machine maintenance plans, downtime log, shot counter, die-to-machine link.
- Finished goods and scrap items (BOM, M3/M4); scrap sale.
- Stock-take document with approval and freeze (grn-stock "Not now").

## Questions for you

None open.

## Changelog

- 2026-09-29 v0 — draft, retroactive from code at map commit 0a406f4.
- 2026-09-29 — consistency pass: answers folded in, Q1–Q6 all A (BR-INV-02, 06, 15, 16, 22, who-table). `inventory.view` and `inventory.adjust` now in auth-setup. Machine code added (Q3=A), so BR-AUTH-26 shows name and code. BR-INV-24 is the one "last rate" rule; BR-SUP-16 points here.
