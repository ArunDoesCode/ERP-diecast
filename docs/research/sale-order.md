---
feature: sale-order
brief: docs/briefs/sale-order.md
date: 2026-11-20
products: [ERPNext, Odoo, SAP Business One, MRPeasy, foundry-ERP articles]
---

# Research — Sale order and BOM explosion

> All pages read 2026-11-20. Owner away: SME questions are listed at the bottom, not asked.
> Not reachable / not answered by docs: Odoo official page on SO lock and edit-after-confirm (cut off; only community and blog text); Odoo draft-vs-confirmed state of resupply orders; SAP "Creating Order Recommendations" detail page (not opened); ERPNext over-delivery tolerance on SO (page silent).

## Copy these
1. Explosion is a separate, re-runnable step that writes a saved result; it is not a side effect of saving the SO (SAP MRP wizard saves recommendations; ERPNext Production Plan).
2. Recommendations become documents only after a person picks lines and can edit qty, vendor, type; deleted lines return on next run (SAP Order Recommendation).
3. Net need = gross need minus usable stock minus open supply, shown as separate columns so planners see why (ERPNext Projected Qty; SAP supply/demand sources; MRPeasy available vs booked vs expected).
4. Shortage docs are drafts marked "auto-generated, review before buying" (ERPNext reorder Material Requests).
5. Group shortages by preferred vendor into one draft per vendor (SAP Order Recommendation).
6. Subcontract step: components to send come from the BOM; the service order carries qty of the finished item (ERPNext Subcontracting Order, Odoo resupply).
7. Close/stop a request without cancelling its linked documents (ERPNext Stopped/Closed).

## Findings

### Q1 — Sale order states, and what may change after confirm?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Draft, To Deliver and Bill, Completed, On Hold, Closed, Cancelled. After submit only "Update Items", blocked where qty already picked, delivered, billed or sent to production. Amend = new draft from a cancelled order. | https://docs.frappe.io/erpnext/user/manual/en/sales-order | 2026-11-20 |
| Odoo | Quotation to Sales Order on confirm; "Lock Confirmed Sales" setting stops edits; admin can unlock. Community advice for big change: cancel, duplicate, re-confirm. Official lock text not read. | https://www.odoo.com/documentation/18.0/applications/sales/sales/sales_quotations/create_quotations.html | 2026-11-20 |
| SAP B1 | Open sales order counts as demand in MRP; open quotations do not. | https://help.sap.com/saphelp_sbo92/helpdata/en/79/c73ffa97294571b5c4991e5f219f5a/content.htm | 2026-11-20 |
| MRPeasy | Customer Order is the base record from quote to delivery. | https://www.mrpeasy.com/documentation | 2026-11-20 |

**For us:** adapt — states Draft, Confirmed, On Hold, Closed, Cancelled (no delivery/billing states; out of scope). Confirmed lines can change only qty up, price-free fields, or date; qty cannot drop below what is already exploded into issued PR/SCO without cancelling those. Stricter ERPNext rule wins. Products disagree (ERPNext allows controlled edit, Odoo locks whole order).

### Q2 — How is the BOM exploded (levels, what is fetched)?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Production Plan takes SO lines that have a BOM only; options: include exploded items, get sub-assemblies, include subcontracted items' raw materials; consolidate same item/BOM. | https://docs.frappe.io/erpnext/user/manual/en/production-plan | 2026-11-20 |
| Odoo | Buy route makes an RFQ, Manufacture route makes an MO; subcontract BOM lists components sent to the vendor. | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/warehouses_storage/replenishment/reordering_rules.html | 2026-11-20 |
| SAP B1 | Items marked Make get production-order recommendations; Buy items get PO recommendations; only MRP-planned items are selectable. | https://help.sap.com/saphelp_sbo92/helpdata/en/79/c73ffa97294571b5c4991e5f219f5a/content.htm | 2026-11-20 |

**For us:** adopt — walk the active BOM revision level by level; a line with no active BOM is shown as "no BOM", never skipped silently (ERPNext skips it quietly; refuse is stricter). Record the BOM revision used on the explosion.

### Q3 — How is net requirement worked out (stock, reserved, on order)?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Required minus Projected Qty (stock plus open POs and work orders minus demand); docs do not name reserved as its own step. Reserve Stock on SO is a separate button, no ledger movement. | https://docs.frappe.io/erpnext/user/manual/en/production-plan | 2026-11-20 |
| Odoo | Forecast = on hand minus future demand; reserved only in "Replenish on Order" mode. | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/warehouses_storage/replenishment/reordering_rules.html | 2026-11-20 |
| SAP B1 | Supply = open purchase requests, quotations, POs, planned production child items; demand = open SOs, reserve invoices, forecast; user ticks which to include; past-due rolled into today. | same SAP page | 2026-11-20 |
| MRPeasy | Separates in stock vs expected, available vs booked; demand created only after a booking attempt. | https://www.mrpeasy.com/documentation | 2026-11-20 |

**For us:** adapt — show per raw item: need, on hand, reserved for other SOs, open PR qty, open PO/SCO qty, net. Default usable stock = on hand minus reserved by other orders (stricter); open PR/PO count as supply only if due before the SO date. Products disagree on counting open supply; flagged.

### Q4 — Reserve stock for an order?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Optional manual reserve; no ledger entry. | https://docs.frappe.io/erpnext/user/manual/en/sales-order | 2026-11-20 |
| Odoo | Reserved only on MTO ("replenish on order"); 0/0/1 rule does not link. | reordering-rules page above | 2026-11-20 |
| MRPeasy | Booking from stock or from planned PO/MO; must book before production use. | https://www.mrpeasy.com/documentation | 2026-11-20 |

**For us:** adapt — reservation is a soft claim row on the explosion, never an inventory_ledger posting (ledger invariant). Released on SO cancel/close. First-come by confirm date.

### Q5 — How do shortages become draft purchase documents?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | SO or Production Plan makes a Material Request (purchase type); reorder-made ones are flagged for review; request stays Partially Ordered until POs cover it. | https://docs.frappe.io/erpnext/user/manual/en/material-request | 2026-11-20 |
| Odoo | Rule makes an RFQ for the top vendor on the product. | reordering-rules page | 2026-11-20 |
| SAP B1 | Recommendations first (informative), then a picked set becomes POs, grouped per vendor; release date cannot be before today; "Past Due" flag if lead time cannot be met. | https://help.sap.com/saphelp_sbo91/helpdata/en/44/e9d8df694103fce10000000a1553f6/content.htm | 2026-11-20 |

**For us:** adopt (SAP + ERPNext) — explosion result screen first, then "Create draft PRs" for selected lines; PR keeps link to SO line and explosion; PR stays draft and uses the existing PR approval. Never auto-submit. Per-SO lines may merge into one PR per vendor only if each keeps its source link.

### Q6 — How do subcontract steps become subcontract orders?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Service item on PO plus finished good; Subcontracting Order built from PO; supplied items from BOM; supplier-sourced material kept at zero value; many SCOs per PO. | https://docs.frappe.io/erpnext/user/manual/en/subcontracting-order | 2026-11-20 |
| Odoo | Subcontracting-type BOM lists vendor and components; confirming the PO makes both a receipt and a resupply order; vendor lead time must cover send, work, return. | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/manufacturing/subcontracting/subcontracting_resupply.html | 2026-11-20 |
| SAP B1 | A production recommendation can be switched to a PO when a production BOM exists. | SAP Order Recommendation page above | 2026-11-20 |

**For us:** adapt — a BOM subcontract operation yields a draft SCO line (service, qty of the part, components to send, vendor from BOM). Created from the explosion by the same pick step as PRs. Existing SCO module owns challan and send/receive.

### Q7 — What if the SO changes or is cancelled after explosion, or explosion is re-run?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Close/Stop block new downstream docs, existing ones stay; Production Plan can be Closed and re-opened. | material-request and production-plan pages | 2026-11-20 |
| SAP B1 | Re-run replaces recommendations; saved set kept per scenario; deleted lines return next run. | https://help.sap.com/saphelp_sbo91/helpdata/en/69/47ea51b5b14320a5db9c17499ff7bc/content.htm | 2026-11-20 |
| Odoo | Cancel or duplicate the SO; downstream RFQs are not auto-cancelled (community advice, docs silent). | https://www.odoo.com/documentation/18.0/applications/sales/sales/sales_quotations/create_quotations.html | 2026-11-20 |

**For us:** adopt — each run is a new numbered snapshot; older snapshot marked superseded. Already-created drafts are not deleted; cancel of SO lists linked PR/SCO for the user to cancel by hand (refuse rather than cascade).

### Q8 — Who may do what?
ERPNext ties create/cancel to stock and purchase roles and does not name who may Stop (material-request page). SAP keeps explosion and document creation as separate windows. **For us:** adapt — separate keys: enter/confirm SO (sales), run explosion (planning), create PRs/SCOs from it (purchase). Keys in `backend/src/lib/permissions.ts` style; every state change audit-trailed.

## Die-casting specifics
| Topic | What generic ERPs assume | What a die-casting plant needs | Link | Read on |
|---|---|---|---|---|
| Melt loss and yield | BOM qty is exact; scrap is a separate item | Alloy need = shot weight (casting + runner + overflow) per cavity, plus melt loss %; real loss often differs from BOM (6% set vs 4-5% seen) so keep % editable | https://community.oracle.com/mosc/discussion/2827000/hhttps:/us.v-cdn.net | 2026-11-20 |
| Runner/gating return | Not modelled | Runner is remelted: net alloy to buy = gross less returned runner. No product found models it; treat as a BOM yield figure | https://www.deskera.com/blog/mrp-for-foundries/ | 2026-11-20 |
| Alloy grouping | Any item mixes | A heat is one alloy; need is summed per grade, not per part | https://www.moderncasting.com/node/336 | 2026-11-20 |
| Job work (GST Sec 143) | Subcontract = purchase of service | Inputs sent on challan must return in 1 year (3 for capital goods) or become deemed supply; dies/moulds exempt from that clock; ITC-04 reports it | https://www.gstcouncil.gov.in/sites/default/files/e-version-gst-flyers/Job_Work.pdf | 2026-11-20 |
| Units | Pieces | Alloy in kg; castings in pieces; show both in explosion | n/a | |

## Edge cases seen in the products
| Case | What most products do | Products that differ | Link |
|---|---|---|---|
| Item with no BOM on SO line | Skipped in plan | SAP only lists MRP-planned items | production-plan page |
| Lead time makes due date impossible | Flag "Past Due", release date not before today | ERPNext docs silent | SAP Order Recommendation |
| Same item needed by two SOs | Consolidate in one plan | Odoo MTO keeps per-SO link | production-plan page |
| Open PR counted as supply | Optional tick | ERPNext always via projected qty | SAP sources page |
| Partial cover by PO | Request stays Partially Ordered | none | material-request page |
| Stop a request, linked docs live on | Yes | none | material-request page |
| Quotation as demand | Not counted | none | SAP sources page |
| Auto-made request from rule | Flagged for review | none | material-request page |
| Edit after confirm | Locked (Odoo) or limited (ERPNext) | split | sales-order page |

## Questions for the factory SME
| # | Question | Options | Why it matters |
|---|---|---|---|
| 1 | Do customers send firm orders with one date, or schedules with several dates per part? | A one date / B several dates | One date vs per-line dates on the SO |
| 2 | Is reserved stock first-come by order date, or by delivery date? | A order / B delivery | Who loses when stock is short |
| 3 | Does runner/overflow get remelted in-house? | A yes / B sold as scrap | Alloy net need |
| 4 | Real melt loss percent for main alloy? | number | Default BOM yield |
| 5 | May sales change qty after purchase has bought material? | A yes warn / B no | Edit-after-confirm rule |
| 6 | Is one PR per SO or one per vendor per run preferred? | A per SO / B per vendor | PR grouping |
| 7 | Count open POs due after the SO date as cover? | A yes / B no | Net requirement default |

## Follow-ups
