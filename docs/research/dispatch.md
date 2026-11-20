---
feature: dispatch
brief: docs/briefs/dispatch.md
date: 2026-11-20
products: [ERPNext, Odoo, SAP Business One, India Compliance (ERPNext GST app), Zoho Books]
---

# Research — Dispatch (delivery note against a sale order, e-way bill fields)

> Every finding has a link and the date it was read (all 2026-11-20). Niche foundry tools: only vendor pages found, nothing on dispatch rules.

## Copy these
1. Delivery note is made from a sale order with editable quantities; each submit posts stock out and updates the SO pending qty (ERPNext).
2. Packing slip only while the note is draft; total packed cannot exceed note qty; package from/to numbers and net/gross weight (ERPNext).
3. Short close is explicit: the user closes the SO with a reason; leftover is neither shipped nor billed (ERPNext "Closed").
4. Partial ship asks one question: keep the rest open or close it (Odoo backorder / no backorder). Our SO stays open by default.
5. E-way bill fields are stored on the note, Part B (vehicle) can be updated later; no portal call (India Compliance).
6. Cancel a posted note by reversing the stock posting, and returns are a separate document (ERPNext).
7. Refuse to mark "ready for movement" when value is above the threshold and the e-way bill number is empty.

## Findings

### Q1 — Can one sale order be delivered in several notes, and how is the rest tracked?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Quantity editable when created from SO; ship 5 now, 5 later in two notes; SO pending qty updates on submit | https://docs.frappe.io/erpnext/user/manual/en/delivery-note | 2026-11-20 |
| Odoo | Set done qty, Validate, pop-up: Create Backorder (new open delivery for the rest) or No Backorder | https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/shipping_receiving/setup_configuration/multipack.html | 2026-11-20 |
| SAP B1 | Open document can be drawn fully or partly; the rest is drawn later | https://help.sap.com/saphelp_sbo92/helpdata/en/44/fd948693202463e10000000a1553f7/content.htm | 2026-11-20 |

**For us:** adopt (ERPNext style) — many notes per SO line, qty per note capped at SO open qty — because castings ship in lots.

### Q2 — When is the sale order closed?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Auto-complete when fully delivered/billed; manual "Closed" for short-close | https://docs.frappe.io/erpnext/user/manual/en/delivery-note | 2026-11-20 |
| Odoo | "No Backorder" treats the order as done with the remainder dropped | https://www.odoo.com/forum/help-1/can-you-explain-backorder-201603 (community; docs silent) | 2026-11-20 |
| SAP B1 | Base doc closes when drawn fully, or by hand; SAP KBAs report partial draws closing the base order unexpectedly (a known pain) | https://userapps.support.sap.com/sap/support/knowledge/en/3658609 | 2026-11-20 |

**For us:** adopt — SO closes itself only when every line is delivered; short-close is a separate permissioned action with a reason. Never auto-close on a partial. SAP's surprise-close is the thing to avoid.

### Q3 — Over-delivery (ship more than ordered)?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Delivery note page is silent; tolerance is a setting elsewhere | https://docs.frappe.io/erpnext/user/manual/en/delivery-note | 2026-11-20 |
| Odoo | Done qty can exceed demand in the UI; no hard stop by default (community) | https://www.odoo.com/forum/help-1/can-we-validate-deliver-lower-than-demand-in-odoo-delivery-ordersales-235352 | 2026-11-20 |
| SAP B1 | Copy From/To lets you pick rows and qty; not above open qty | https://userapps.support.sap.com/sap/support/knowledge/en/3658609 | 2026-11-20 |

**For us:** adapt — products disagree; stricter wins: refuse above SO open qty. A tolerance % can be added later if the SME says so (see SME Q1).

### Q4 — Cancel or reverse a delivery note
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Cancel allowed (status Cancelled); after delivery, a Sales Return document | https://docs.frappe.io/erpnext/user/manual/en/delivery-note | 2026-11-20 |
| SAP B1 | Delivery can be cancelled by hand; closed when drawn on | https://help.sap.com/saphelp_sbo92/helpdata/en/44/fd948693202463e10000000a1553f7/content.htm | 2026-11-20 |
| Odoo | Done delivery is reversed by a Return picture, not edited | https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/shipping_receiving/setup_configuration/multipack.html (backorder only; returns page not read) | 2026-11-20 |

**For us:** adapt — cancel posts a reversing ledger entry, restores SO open qty, and is blocked once an invoice or returned goods reference the note; customer returns are out of scope here (separate issue). Cancel needs its own permission and a reason.

### Q5 — Packing list basics
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Several packing slips per note; only while note is draft; total cannot exceed note qty; package From/To numbers; net and gross weight; batch needed for batched items | https://docs.frappe.io/erpnext/user/manual/en/packing-slip | 2026-11-20 |
| Odoo | Optional Packages setting; assign qty per line to a destination package; Validate last | https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/shipping_receiving/setup_configuration/multipack.html | 2026-11-20 |
| SAP B1 | Not found in the pages read | | |

**For us:** adopt (ERPNext) — packages inside the note: package no, qty per line, net and gross weight; locked after posting; sum of packed must equal note qty before posting (stricter than ERPNext cap).

### Q6 — When is an e-way bill needed and what must be on the note?
| Product | What it does | Link | Read on |
|---|---|---|---|
| Zoho Books | Needed above Rs 50,000 consignment value, inter- and intra-state; Delhi, West Bengal, Tamil Nadu quoted at Rs 1 lakh (dated, verify) | https://www.zoho.com/in/books/gst/faq/e-way-bill.html | 2026-11-20 |
| Zoho (fields) | Part A: recipient GSTIN, place of delivery, doc no, value, HSN, transport doc no, reason. Part B: transporter, vehicle no | same | 2026-11-20 |
| India Compliance | Delivery note e-waybill is opt-in; recommended for job work or warehouse moves; distance 0 makes portal suggest it from PIN codes | https://docs.frappe.io/erpnext/v14/user/manual/en/regional/india/generating_e_waybill (via search summary, page itself lacked fields) | 2026-11-20 |
| ClearTax | Part B can be skipped under 50 km same-state transport (secondary source) | https://cleartax.in/s/eway-bill-gst-rules-compliance (page 410 on fetch; from search snippet only) | 2026-11-20 |

**For us:** adapt — store the fields, no portal call. Required on the note: mode, vehicle no (road) or transporter ID (15-char GSTIN/TRANSIN) plus transport doc no/date (other modes), distance km, e-way bill no and date once the user pastes it. Value threshold is a setting (default Rs 50,000, paise 5,000,000), compared to note value; above it, posting needs the e-way bill no. Vehicle format check: state code + 2 digits + letters + 4 digits.

### Q7 — E-way bill lifecycle on the note
| Product | What it does | Link | Read on |
|---|---|---|---|
| Zoho Books | Validity starts at first Part B entry; 1 day per 100 km or part; cancel within 24 h only; cancelled, never deleted; expired bill: do not move goods, make a new one | https://www.zoho.com/in/books/gst/faq/e-way-bill.html | 2026-11-20 |
| India Compliance | Vehicle and transporter can be updated after generation; one note per vehicle for multi-vehicle loads | https://docs.frappe.io/erpnext/e-waybill-problems (search summary) | 2026-11-20 |
| Tally | If no vehicle no, transporter ID is acceptable for road mode | https://help.tallysolutions.com/article/Tally.ERP9/Tax_India/gst/eway_bill_faq.htm (search summary) | 2026-11-20 |

**For us:** adopt — compute and show valid-until = Part B date + ceil(km/100) days (we store only; user keeps the portal truth). Vehicle can be edited after posting, other e-way fields locked. One vehicle per note.

### Q8 — Who may do what, and reports
No product page read gave a permission model for delivery. ERPNext lists Draft/To Bill/Completed/Return Issued/Cancelled/Closed statuses (link in Q1).
**For us:** adapt — separate permissions: create, post, cancel, short-close SO, edit e-way fields. Reports: open SO lines pending dispatch, notes by date/customer, notes above threshold without e-way no.

## Die-casting specifics
| Topic | What generic ERPs assume | What a die-casting plant needs | Link | Read on |
|---|---|---|---|---|
| Stock out unit | Pieces | Finished goods in pieces; weight on packing list for freight and e-way value check | https://oursyserp.com/ (vendor page: packing lists, QR labels for die casting) | 2026-11-20 |
| Job work return | Normal sale | Goods sent back to a principal or out to a job worker move on a delivery challan, and India Compliance treats note-based e-waybill as meant for job work | https://docs.frappe.io/erpnext/v14/user/manual/en/regional/india/generating_e_waybill | 2026-11-20 |
| Batch / lot trace | Optional | Lot number per package so a customer rejection traces to a shift (ERPNext needs batch on packed batched items) | https://docs.frappe.io/erpnext/user/manual/en/packing-slip | 2026-11-20 |

## Edge cases seen in the products
| Case | What most products do | Products that differ | Link |
|---|---|---|---|
| Partial draw closes the base order | Should stay open | SAP B1 KBAs report closing at line or document level | https://userapps.support.sap.com/sap/support/knowledge/en/3658609 |
| Packing slip after posting | Not allowed | none seen | https://docs.frappe.io/erpnext/user/manual/en/packing-slip |
| Vehicle changed in transit | Update Part B only | Other Part B fields locked after first entry (Zoho/Karnataka FAQ, search) | https://www.zoho.com/in/books/gst/faq/e-way-bill.html |
| E-way bill expired before arrival | Do not move; make new bill | none seen | https://www.zoho.com/in/books/gst/faq/e-way-bill.html |
| Wrong e-way data after 24 h | Cancel not possible; fix by new Part B / new bill | none seen | same |
| Multi-vehicle load | One note and one e-way bill per vehicle | none seen | India Compliance FAQ (search summary) |
| Zero distance entered | Portal suggests from PIN codes | none seen | India Compliance v14 manual |
| Backdated delivery | ERPNext immutable ledger limits backdating | Odoo allows done date edit | https://docs.frappe.io/erpnext/user/manual/en/delivery-note |

## Questions for the factory SME
| # | Question | Options | Why it matters |
|---|---|---|---|
| 1 | Do customers accept +/- on lot qty (over-delivery)? | A none / B up to a % (say how much) | Sets tolerance, default none |
| 2 | Is your state threshold Rs 50,000 or Rs 1 lakh? | A 50,000 / B 1 lakh | Default of the setting |
| 3 | Do you move goods on your own vehicle or always a transporter? | A own / B transporter / C both | Whether transporter ID is mandatory |
| 4 | Does the customer need a packing list copy with each note? | A yes / B no | Print format priority |
| 5 | Is lot number required per package? | A yes / B no | Lot field on package line |
| 6 | Do you send job work goods back on the same note type? | A yes / B separate challan | Scope vs job-work challan |

## Follow-ups
- E-way bill validity is 1 day per **200 km** (not 100 km) since 1 Jan 2021, Notification 94/2020-CT; spec uses 200 km. Sources: [Rule 138(10), Indian Kanoon](https://future.indiankanoon.org/doc/61402723/) · [ClearTax](https://cleartax.in/s/gst-eway-bill-validity-distance) (retrieved 2026-11-20).
