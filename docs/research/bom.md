---
feature: bom
brief: docs/briefs/bom.md
date: 2026-11-20
products: [ERPNext, Odoo, SAP Business One, Deskera (foundry MRP guide), aPriori (die-cast cost model)]
---

# Research — Bill of materials (BOM)

> Every finding has a link and the date it was read (all 2026-11-20). Odoo's main BOM page was cut off in the fetch; multi-level, kit and by-product detail came from a search summary only.

## Copy these
1. Freeze a BOM once released; change = new revision (ERPNext submit/cancel, Odoo ECO). Old orders keep their revision.
2. One "default/active" BOM per part (ERPNext Is Default). We go stricter: exactly one active revision, enforced.
3. Multi-level: a sub-assembly has its own BOM; a flag says "explode" or "treat as bought" (ERPNext Do Not Explode).
4. Subcontract step = a service item linked to the finished item, with the supplied materials listed (ERPNext Subcontracting BOM, Odoo subcontract BOM type).
5. Process loss is a line on the BOM that reduces good output (ERPNext Process Loss), so yield is data, not tribal memory.
6. Show a change summary (added / removed / changed) before a revision goes live (Odoo ECO review).
7. Phantom (no-stock) grouping is optional; skip it for v1 (SAP B1, ERPNext both have it, die casting rarely needs it).

## Findings

### Q1 — How are levels (sub-assemblies) represented, and how are loops stopped?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Each sub-assembly item has its own BOM; exploded list shows raw materials. "Do Not Explode" keeps a sub-assembly as a stock item. Loop rule not stated on the page. | https://docs.frappe.io/erpnext/user/manual/en/bill-of-materials | 2026-11-20 |
| SAP Business One | A component can have its own BOM. Phantom sub-assemblies are not stocked; their parts go straight to the order. | https://learning.sap.com/courses/managing-logistics-in-sap-business-one/utilizing-bill-of-materials-bom-in-sap-business-one | 2026-11-20 |
| Odoo | Multi-level in a separate article (not opened). Search summary only. | https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/manufacturing/basic_setup/bill_configuration.html | 2026-11-20 |

**For us:** adopt — one BOM per part, a component can itself have a BOM; explode flag per line; refuse a BOM that contains itself at any depth — because a loop would hang the later explosion. Loop refusal is our own safety rule; no product page states it.

### Q2 — What happens to a BOM that is already in use when it must change?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Submitted BOM cannot be edited; cancel or copy and submit a new one. | https://docs.frappe.io/erpnext/user/manual/en/bill-of-materials | 2026-11-20 |
| Odoo | Engineering change order: a draft revision is a copy; review shows diffs; approvers accept; "Apply" makes it live and old one is archived. | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/plm/manage_changes/engineering_change_orders.html | 2026-11-20 |
| SAP Business One | Versions not covered in the lesson; not reachable as a finding. | https://learning.sap.com/courses/managing-logistics-in-sap-business-one/utilizing-bill-of-materials-bom-in-sap-business-one | 2026-11-20 |

**For us:** adapt — revision A, B, C… Draft is editable; released is frozen; new revision = copy of the released one, with a reason and date. No separate approval flow, only a permission to release — because a one-person back office does not need an ECO board.

### Q3 — How many BOMs can be live for one part, and which one is used?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Many BOMs per item; "Is Active" and "Is Default" choose which is pre-selected. | https://docs.frappe.io/erpnext/user/manual/en/bill-of-materials | 2026-11-20 |
| Odoo | Old version archived when the new one is applied, so one live. | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/plm/manage_changes/engineering_change_orders.html | 2026-11-20 |

**For us:** adopt Odoo's way (products disagree; stricter = one live revision) — releasing a revision retires the previous one in the same step; the brief's gate is "every running part has one active revision".

### Q4 — How is casting yield / loss shown?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Scrap section lists leftovers; if the scrap item is the product itself it is a Process Loss item and cuts output. | https://docs.frappe.io/erpnext/user/manual/en/bill-of-materials | 2026-11-20 |
| SAP Business One | No scrap field in the one source found (2007 thread, old); add-ons or user fields used. | https://archive.sap.com/discussions/thread/632073 | 2026-11-20 |
| aPriori | Models utilization: metal lost to gating volume, chips, spillage, oxidation, non-remelt scrap, with a remelt allowance. Page not opened (403), taken from search summary. | https://www.apriori.com/Collateral/Documents/English-US/online_help/2019_R2/COST_MODEL_GUIDE/AP_CMG0175Material_Cost_and_Utilization_for_Die_Casting.html | 2026-11-20 |

**For us:** adapt — each casting BOM holds: finished (net) weight, shot weight (casting + runner + overflow), and a melt-loss %. Alloy need per piece = shot weight plus loss; the runner/overflow share is "returned to melt", not scrap. Weight in grams or kg (SME to confirm units).

### Q5 — How are raw material (alloy) and inserts held?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Raw materials are plain item lines with quantity and UoM on the BOM. | https://docs.frappe.io/erpnext/user/manual/en/bill-of-materials | 2026-11-20 |
| Odoo | Component lines with optional "apply on variants" (a line used only for some variants). | https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/manufacturing/basic_setup/bill_configuration.html | 2026-11-20 |
| Deskera | Foundry BOM lists alloys and non-metal materials plus sub-components; yield not covered. | https://www.deskera.com/blog/mrp-for-foundries/ | 2026-11-20 |

**For us:** adapt — alloy is a component line measured by weight (kg), inserts are component lines counted in pieces; one casting can take an alloy grade (e.g. ADC12 vs LM24) as an allowed alternative, one chosen per revision. No variants in v1.

### Q6 — How is a subcontract (job work) step on a BOM?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Subcontracting BOM links a non-stock service item to the finished item (one per finished item); service rate covers only the job, materials are added on receipt. | https://docs.frappe.io/erpnext/user/manual/en/subcontracting-order | 2026-11-20 (via search summary of docs.frappe.io pages; direct page 404) |
| Odoo | Separate BOM type "Subcontracting"; supplied components go from the company to the vendor; needs a vendor price. | https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/manufacturing/subcontracting/subcontracting_resupply.html | 2026-11-20 (search summary) |

**For us:** adapt — an operation line on the BOM: step order, name (e.g. machining, anodising), supplier-type, service item, expected return loss %. Reuses the existing subcontracting module (SCO). Sent material is the casting from the previous step, not the alloy.

### Q7 — Who may do what?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Submit/cancel are separate document rights. | https://docs.frappe.io/erpnext/user/manual/en/bill-of-materials | 2026-11-20 |
| Odoo | ECO approvers decide before a change is applied. | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/plm/manage_changes/engineering_change_orders.html | 2026-11-20 |

**For us:** adapt — separate permissions: edit draft, release revision, view. Purchase can view only. Every release is audit-trailed (our domain invariant).

### Q8 — Cost roll-up
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Cost from item valuation rates plus operation cost; "Update Cost" refreshes it. | https://docs.frappe.io/erpnext/user/manual/en/bill-of-materials | 2026-11-20 |
| Odoo | ECO summary lists the cost effect of a change. | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/plm/manage_changes/engineering_change_orders.html | 2026-11-20 |

**For us:** reject for v1 — costing is not in the brief; keep quantities only so a later costing feature can add rates.

### Q9 — Feeding sale-order explosion (M4, not researched in depth)
ERPNext lists raw materials of sub-assemblies in an exploded table and lets a line stop explosion (same link as Q1). Our BOM must therefore give: one active revision per part, quantities per one piece, loss %, explode flag, and which lines are buy / make / subcontract. **For us:** adopt — keep these fields on the BOM so explosion needs no new BOM data.

## Die-casting specifics
| Topic | What generic ERPs assume | What a die-casting plant needs | Link | Read on |
|---|---|---|---|---|
| Shot weight vs part weight | Output = input minus small scrap | Metal per shot is part + runner + overflow; the extra goes back to the furnace | https://www.apriori.com/Collateral/Documents/English-US/online_help/2019_R2/COST_MODEL_GUIDE/AP_CMG0175Material_Cost_and_Utilization_for_Die_Casting.html | 2026-11-20 |
| Cavities per die | One part per cycle | One shot makes N parts; BOM per part, shot weight per die (SME to confirm) | https://www.euroguss.de/en/euroguss-365/2023/expertenwissen/driving-the-digital-transformation-in-high-pressure-die-casting | 2026-11-20 |
| Alloy by weight | Items counted in pieces | Alloy in kg, inserts in pieces | https://www.deskera.com/blog/mrp-for-foundries/ | 2026-11-20 |
| Heat/alloy traceability | Lot optional | Alloy properties kept per heat in one die-caster ERP | https://www.foundrymag.com/simulationit/diecaster-opts-industry-standard-erp | 2026-11-20 |
| Cost needs operations too | BOM = materials | BOM alone is not enough for cost-to-cast | https://www.euroguss.de/en/euroguss-365/2023/expertenwissen/driving-the-digital-transformation-in-high-pressure-die-casting | 2026-11-20 |
| Job work (GST Sec 143) | n/a | Material goes out on a challan and comes back as a different item; the return-loss % belongs on the operation line | not a product source; legal rule, check with SME | |

Not found: any product that writes remelt credit into material requirements. Our remelt handling is our own call.

## Edge cases seen in the products
| Case | What most products do | Products that differ | Link |
|---|---|---|---|
| Edit a BOM already used | Block, make a new version | Odoo lets draft copy while old stays live | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/plm/manage_changes/engineering_change_orders.html |
| Two ECOs change the same BOM | Odoo 17 has a "rebase" to merge | ERPNext has no such concept | https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/plm/manage_changes/engineering_change_orders.html |
| Sub-assembly with no BOM | Treated as a bought item | ERPNext: Do Not Explode flag | https://docs.frappe.io/erpnext/user/manual/en/bill-of-materials |
| Supplier-bought minor items (nuts) | Listed at zero value, not sent | ERPNext only | https://docs.frappe.io/erpnext/user/manual/en/subcontracting-order |
| Inactive BOM still referenced | SAP B1 source found: no error for inactive phantom (S/4 thread, different product) | n/a | https://community.sap.com/t5/enterprise-resource-planning-q-a/system-is-not-giving-error-if-phantom-bom-status-is-2-inactive/qaq-p/13935530 |
| Phantom BOM blocks routing | SAP B1: route stages cannot be added to a BOM with a phantom | none | https://learning.sap.com/courses/managing-logistics-in-sap-business-one/utilizing-bill-of-materials-bom-in-sap-business-one |
| Scrap that is the product itself | ERPNext reduces output (process loss) | v16 renames Scrap Items to Secondary Items | https://docs.frappe.io/erpnext/user/manual/en/bill-of-materials |

## Questions for the factory SME
| # | Question | Options | Why it matters |
|---|---|---|---|
| 1 | Is one BOM per part number, or per die (cavities)? | A part / B die | Decides where shot weight lives |
| 2 | Weight unit for alloy | A kg / B gram | Rounding and stock units |
| 3 | Are runners and overflow remelted in-house? | A yes / B sold / C both | Whether they count as return or loss |
| 4 | Is the alloy grade fixed per part or can purchase swap it? | A fixed / B swap allowed | Alternate alloy lines |
| 5 | Does a part go through more than one job-work step? | A one / B many | One vs ordered operation lines |
| 6 | Who may release a new revision? | A owner / B planning / C either | Permission design |
| 7 | Are loose items (screws, packing) on the BOM? | A yes / B no | Size of BOM lists |

## Follow-ups
(none yet)
