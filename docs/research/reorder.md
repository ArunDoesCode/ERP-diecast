---
feature: reorder
brief: docs/briefs/reorder.md
date: 2026-11-20
products: [ERPNext, Odoo, SAP Business One, MRPeasy]
---

# Research — Reorder (low stock raises a draft requisition)

> Max 150 lines. Every finding has a link and the date it was read. No link = not a finding.
> Niche tool: only MRPeasy was reached. A second foundry tool was not researched (time).

## Copy these
1. Count open requests and open POs as incoming stock before deciding stock is low (ERPNext "projected qty") — stops duplicate drafts.
2. Run on a schedule (daily), not on every stock change (Odoo, ERPNext) — one predictable batch, easy to explain.
3. Order quantity = fixed reorder qty from the item (ERPNext); round up to the supplier multiple and not below the minimum order qty (SAP B1).
4. One request line per item; group items of the same supplier into one draft (MRPeasy).
5. Output is only a draft for a person to check (SAP B1 wizard "only recommends"; Odoo Manual mode) — matches our "no auto PO".
6. Notify the purchase role by in-app alert and on failure (ERPNext emails Purchase Manager).

## Findings

### Q1 — When does the check run: on schedule or on every stock change?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Switch in Stock Settings; request raised when stock reaches the reorder level (page does not name the scheduler) | https://docs.frappe.io/erpnext/user/manual/en/auto-creation-of-material-request | 2026-11-20 |
| Odoo | Scheduler once a day by default; Auto rules also fire when a confirmed sales order drops forecast below Min | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/warehouses_storage/replenishment/reordering_rules.html | 2026-11-20 |
| SAP B1 | Not automatic; someone runs the MRP wizard | https://help.sap.com/saphelp_sbo92/helpdata/en/5a/6957d864b3458ea5b48aa0b8249e54/content.htm | 2026-11-20 |
| MRPeasy | Report of items below reorder point; PO is created by a click | https://www.mrpeasy.com/resources/user-manual/stock/critical-on-hand/ | 2026-11-20 |

**For us:** adapt — one daily run plus a "check now" button for purchase; no trigger inside each stock posting — because the ledger stays simple and results are the same by morning.

### Q2 — How much is requested?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Reorder Qty from item (per warehouse optional); page does not give the formula | https://docs.frappe.io/erpnext/user/manual/en/auto-creation-of-material-request | 2026-11-20 |
| Odoo | Up to Max from forecast; rounded by Multiple Quantity, kept at or below Max | (Odoo reordering rules page above) | 2026-11-20 |
| SAP B1 | Wizard can fill up to Minimum, or up to Maximum when below Minimum; order multiple and minimum order qty applied | https://learning.sap.com/courses/managing-logistics-in-sap-business-one/exploring-the-materials-requirements-planning-mrp-process | 2026-11-20 |
| MRPeasy | Manufacturing order tops up to reorder point; PO quantity rule not documented | MRPeasy page above | 2026-11-20 |

**For us:** adopt — requested qty = item's reorder qty if set, else (max − projected); round up to the supplier multiple; never below minimum order qty — because it is the common ground. Products differ on reorder-qty vs up-to-max; both are supported.

### Q3 — Duplicate suppression when something is already open
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Projected qty adds submitted Material Request qty and open PO qty until received; compared with reorder level. Draft requests are not counted | https://docs.frappe.io/erpnext/user/manual/en/projected-quantity | 2026-11-20 |
| Odoo | Docs silent on whether open RFQs count; only merges repeated demand into one RFQ when no procurement group | (Odoo page above) | 2026-11-20 |
| SAP B1 | Each source is a checkbox: open purchase requests, open POs, open quotations count as supply | https://learning.sap.com/courses/managing-logistics-in-sap-business-one/exploring-the-materials-requirements-planning-mrp-process | 2026-11-20 |
| MRPeasy | Not documented | | |

**For us:** adopt, stricter default — count open PRs (draft, submitted, approved) and open PO remaining qty as incoming; if on-hand + incoming is above the reorder level, raise nothing. Products disagree (ERPNext ignores drafts; SAP lets you choose) — we skip if a draft already exists for the item, to avoid a pile of drafts.

### Q4 — Who gets it and what state is it in?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Request per item; Purchase Manager role emailed, also on errors; item says purchase or transfer | https://docs.frappe.io/erpnext/user/manual/en/auto-creation-of-material-request | 2026-11-20 |
| Odoo | Auto creates RFQ at top vendor; Manual puts item on a dashboard; docs name no recipient | (Odoo page above) | 2026-11-20 |
| SAP B1 | Only recommendations; user then creates the documents | https://help.sap.com/saphelp_sbo92/helpdata/en/5a/6957d864b3458ea5b48aa0b8249e54/content.htm | 2026-11-20 |
| MRPeasy | Person clicks create PO from the report; same-supplier items grouped | https://www.mrpeasy.com/resources/user-manual/stock/critical-on-hand/ | 2026-11-20 |

**For us:** adapt — draft PR owned by "system", alert to purchase role; a person submits. Same as "draft for checking" in the brief.

### Q5 — Who may change the rules or run it? Reports?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | On/off in Stock Settings; reorder level and qty on the item | docs.frappe.io page above | 2026-11-20 |
| Odoo | Rules are records per product and location; Auto/Manual per rule | (Odoo page above) | 2026-11-20 |
| SAP B1 | Min/max/multiple/min order qty are item planning fields; simulation run saves nothing | SAP help page above | 2026-11-20 |

**For us:** adopt — settings need their own permission key; add a dry-run view ("what would be raised") — because it lets purchase trust the run before switching on. Not found in docs: audit of rule changes; we do it anyway (our invariant).

## Die-casting specifics
| Topic | What generic ERPs assume | What a die-casting plant needs | Link | Read on |
|---|---|---|---|---|
| Alloy ingot / bought items | Pieces | Weight (kg) and supplier lot multiples (e.g. 1 tonne) — SAP order multiple covers it | SAP link above | 2026-11-20 |
| Job-work material | Stock is own | Material at a job worker must count as incoming/not-lost; check, our own thought, not in docs | n/a | n/a |
| Consumables (die spray, oil, inserts) | Reorder level works well | This is the best fit for the feature; castings use BOM planning, out of scope | n/a | n/a |

## Edge cases seen in the products
| Case | What most products do | Products that differ | Link |
|---|---|---|---|
| Item has no supplier | Odoo needs a vendor on the pricelist for the RFQ | ERPNext does not need one at request stage | Odoo/ERPNext pages above |
| Item has no reorder qty | Odoo uses Max; SAP uses min/max option | ERPNext needs reorder qty | pages above |
| Run twice the same day | Odoo merges repeated demand into one RFQ | ERPNext one request per item | Odoo page above |
| Auto-creation fails | ERPNext emails the Purchase Manager about errors | | ERPNext page above |
| Request raised then later stock arrives | Open request still counts as incoming; person cancels by hand | | projected-quantity page |
| Odoo "visibility days" | Adds near-future demand to the quantity only when already below Min | | Odoo page above |

## Questions for the factory SME
| # | Question | Options | Why it matters |
|---|---|---|---|
| 1 | Is reorder qty usually a fixed number, or "fill up to a max"? | A fixed / B up to max / C both | Decides which field is required |
| 2 | Should one draft PR hold all low items, or one PR per supplier? | A one total / B per supplier | Grouping of drafts |
| 3 | Run time of the daily check | Hour of day | When purchase sees the draft |
| 4 | Do items sent to a job worker count as stock for reorder? | Y / N | Avoids false alarms |

## Follow-ups
None yet.
