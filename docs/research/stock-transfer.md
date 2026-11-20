---
feature: stock-transfer
brief: docs/briefs/stock-transfer.md
date: 2026-11-20
products: [ERPNext, Odoo, SAP Business One, Computec WMS for SAP B1 (add-on)]
---

# Research — Stock transfer

> Max 150 lines. Every finding has a link and the date it was read. No link = not a finding.
> Official docs are thin on partial receipt, cancel and negative stock. Where silent, it says so.
> No foundry-specific MRP tool docs were found; the niche row is an SAP B1 warehouse add-on.

## What exists today (our code, from `docs/modules/inventory.md`)
`locations` table exists (types incl. one `main_store`, `vendor_premise` per supplier; active flag; type locks
once it has ledger rows). `postStock` already refuses unknown/inactive location and can block negative.
Stock view already shows per-location balances. So the minimum location model is there: no bins needed.

## Copy these
1. Two-leg posting (out of source, into destination) with one document, value moves at the source cost. SAP B1 / ERPNext.
2. Optional "in transit" step: a transit location between the legs. ERPNext (Add to Transit) / Odoo (transit location).
3. Source and destination must differ and both must be active. SAP B1 rejects same-warehouse rows.
4. Posted document is never edited: cancel = reverse postings, then re-create. ERPNext.
5. Partial receipt leaves the rest open (backorder). Odoo; ERPNext/SAP docs are silent, so Odoo is the model.
6. Request (no stock effect) separate from the transfer (moves stock). SAP B1 Transfer Request. Keep as later, not v1.
7. Receipt quantity may differ from sent; the difference needs a reason. ERPNext says "unless a difference is documented".

## Findings

### Q1 — Does the transfer document move stock in one step or two (in transit)?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Material Transfer; tick "Add to Transit", target is a Transit-type warehouse; second entry (or "End Transit") moves it to the real target | https://docs.frappe.io/erpnext/stock-entry | 2026-11-20 |
| ERPNext | Receiving entry links to the outward entry; receive only after goods physically arrive | https://docs.frappe.io/erpnext/how-to-manage-material-transfers-and-goods-in-transit | 2026-11-20 |
| Odoo | Transit location: source -> transit on ship, transit -> destination on receive (community answer) | https://www.odoo.com/forum/help-1/inter-warehouse-transfer-using-transit-location-in-odoo-17-246404 | 2026-11-20 |
| SAP B1 | Inventory Transfer moves stock in one posting; Transfer Request only commits quantity, no stock effect | https://learning.sap.com/courses/discovering-sap-business-one-web-client-logistics/issuing-inventory-transfers-and-inventory-transfer-requests_e827be8b-5e5c-44af-bd17-afedcfa11990 | 2026-11-20 |
| Computec WMS | Transfer posts on save; can be created from a request | https://learn.computec.one/docs/wms/user-guide/transactions/stock-transfer/overview | 2026-11-20 |

**For us:** adapt — one-step by default (both legs posted together); transit is a later option using a `transit` location type — because stores in one plant are walking distance apart. Products disagree (one-step vs two-step); stricter = two-step. Default taken: one-step, because transit adds a receiver step the plant does not have inside one site. Flagged.

### Q2 — Is a partial transfer / partial receipt allowed?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Docs silent; says quantities should match unless a difference is documented | https://docs.frappe.io/erpnext/how-to-manage-material-transfers-and-goods-in-transit | 2026-11-20 |
| Odoo | Validate part; system asks to create a backorder for the rest or drop it | https://www.odoo.com/documentation/saas-15.3/applications/inventory_and_mrp/inventory/routes/concepts/inter_warehouse.html | 2026-11-20 |
| SAP B1 | Docs show only full copy of a request; partial not described | https://learning.sap.com/courses/discovering-sap-business-one-web-client-logistics/issuing-inventory-transfers-and-inventory-transfer-requests_e827be8b-5e5c-44af-bd17-afedcfa11990 | 2026-11-20 |
| Computec WMS | Row turns green when picked qty reaches request qty, so short picks are allowed | https://learn.computec.one/docs/wms/user-guide/transactions/stock-transfer/overview | 2026-11-20 |

**For us:** adapt — with one-step posting there is no partial: you post what you moved. Partial only matters with transit (receive less, rest stays in transit until received or returned). Products disagree on docs depth; stricter = never receive more than sent.

### Q3 — How is a posted transfer cancelled or reversed?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Submitted entry cannot be edited; cancel then amend. Docs do not say what happens to a linked receipt | https://docs.frappe.io/erpnext/stock-entry.md | 2026-11-20 |
| Odoo | Docs silent on cancelling a done transfer; usual way is a return transfer (not read in docs) | https://www.odoo.com/documentation/saas-15.3/applications/inventory_and_mrp/inventory/routes/concepts/inter_warehouse.html | 2026-11-20 |
| SAP B1 | Docs silent; KBA on errors only | https://userapps.support.sap.com/sap/support/knowledge/en/3672130 | 2026-11-20 |

**For us:** adapt — reverse by posting opposite ledger rows (never edit or delete ledger rows, matches BR-INV-14/20); refuse reverse if the destination no longer has the stock (stricter: refuse over allow negative). Needs permission + reason + audit.

### Q4 — Is value changed by a transfer?
| Product | What it does | Link | Read on |
|---|---|---|---|
| SAP B1 | Journal entry debits receiving warehouse stock account, credits issuing one; same value | https://learning.sap.com/courses/discovering-sap-business-one-web-client-logistics/issuing-inventory-transfers-and-inventory-transfer-requests_e827be8b-5e5c-44af-bd17-afedcfa11990 | 2026-11-20 |
| ERPNext | Basic rate auto-fetched from source valuation; zero-rate items need an explicit allow | https://docs.frappe.io/erpnext/stock-entry.md | 2026-11-20 |
| Odoo | Docs silent on transit valuation | https://www.odoo.com/documentation/saas-15.3/applications/inventory_and_mrp/inventory/routes/concepts/inter_warehouse.html | 2026-11-20 |

**For us:** adopt — each leg carries the item's current average cost in paise; total value of the company unchanged; no GL effect (we have no per-store accounts). Zero-cost item: refuse, stricter.

### Q5 — What blocks a transfer?
| Product | What it does | Link | Read on |
|---|---|---|---|
| SAP B1 | Rejects same From and To warehouse; empty To warehouse; branch mismatch | https://userapps.support.sap.com/sap/support/knowledge/en/3672130 | 2026-11-20 |
| ERPNext | Source and target both needed; negative stock not described in docs | https://docs.frappe.io/erpnext/stock-entry.md | 2026-11-20 |
| Computec WMS | Serial/batch items force picking exact serials/batches | https://learn.computec.one/docs/wms/user-guide/transactions/stock-transfer/overview | 2026-11-20 |

**For us:** adopt — refuse same location, inactive location, qty above source balance, qty <= 0, unit decimals not allowed by the item unit. Source balance check is per location, not total.

### Q6 — Who may do what?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Custom Stock Entry Type lets you limit users to specific stock actions; roles not detailed | https://docs.frappe.io/erpnext/user/manual/en/stock-entry | 2026-11-20 |
| SAP B1 | Request step lets one person ask, another post (separation) | https://learning.sap.com/courses/discovering-sap-business-one-web-client-logistics/issuing-inventory-transfers-and-inventory-transfer-requests_e827be8b-5e5c-44af-bd17-afedcfa11990 | 2026-11-20 |

**For us:** adapt — stores user creates and posts; reverse needs a higher permission. Request step is out of v1.

### Q7 — GST: is moving stock between our own locations taxable?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Plain Material Transfer carries no tax. Taxed transfers use internal sales/purchase invoices with an In-Transit warehouse (for different GSTIN) | https://docs.frappe.io/erpnext/stock-transfer-with-gst | 2026-11-20 |

**For us:** reject (for v1) — transfers are inside one GSTIN and one site; brief excludes branch transfers. Docs do not state the same-GSTIN rule; official GST guidance not read.

## Die-casting specifics
| Topic | What generic ERPs assume | What a die-casting plant needs | Link | Read on |
|---|---|---|---|---|
| Vendor premise as location | Warehouses are own sites | Our `vendor_premise` type holds stock at job workers; moves there are job work challans (SCO), not plain transfers. Block transfer to/from vendor_premise | docs/modules/inventory.md | 2026-11-20 |
| Typical moves | Warehouse to warehouse | Main store to shop floor / machine-side, to scrap or re-melt bin, to quarantine / rework | none (no source found) | 2026-11-20 |
| Weight vs pieces | Item unit as is | Castings in pieces, ingot / runner scrap in kg; decimals follow item unit | docs/modules/inventory.md | 2026-11-20 |

## Edge cases seen in the products
| Case | What most products do | Products that differ | Link |
|---|---|---|---|
| Same source and destination | Refuse | none | https://userapps.support.sap.com/sap/support/knowledge/en/3672130 |
| Cancel after receipt | Not documented; reverse by return | Odoo: return transfer | https://www.odoo.com/documentation/saas-15.3/applications/inventory_and_mrp/inventory/routes/concepts/inter_warehouse.html |
| Short receipt | Ask: backorder or drop | ERPNext: quantities should match | https://docs.frappe.io/erpnext/how-to-manage-material-transfers-and-goods-in-transit |
| Zero-valued item | ERPNext refuses unless allowed | others silent | https://docs.frappe.io/erpnext/stock-entry.md |
| Location with ledger rows | Cannot be deleted (ERPNext) | none | docs/modules/inventory.md |
| Request open, stock moves less | Commit released on close (SAP) | none | https://learning.sap.com/courses/discovering-sap-business-one-web-client-logistics/issuing-inventory-transfers-and-inventory-transfer-requests_e827be8b-5e5c-44af-bd17-afedcfa11990 |

## Questions for the factory SME
| # | Question | Options | Why it matters |
|---|---|---|---|
| 1 | Which separate stores / places hold stock today? | list | Seeds the location list |
| 2 | Does a move ever take hours or days (e.g. to a far godown)? | A yes / B no | Decides if transit is needed in v1 |
| 3 | Who may reverse a wrong transfer? | A stores / B manager only | Permission key |
| 4 | Are scrap / rework / quarantine separate locations? | A yes / B no | Whether transfer feeds scrap flow |

## Follow-ups
None yet.
