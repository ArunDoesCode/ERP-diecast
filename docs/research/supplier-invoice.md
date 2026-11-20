---
feature: supplier-invoice
brief: docs/briefs/supplier-invoice.md
date: 2026-11-20
products: [ERPNext, Odoo, SAP Business One, Zoho Books, Busy]
---

# Research — Supplier invoice and 3-way match

> Max 150 lines. Every finding has a link and the date it was read. No link = not a finding.
> Owner away; no questions asked. Weak spots are marked "docs silent" or "community".

## Copy these
1. Odoo: bill only what was received (control policy), partial bills allowed. Fits GRN-by-GRN billing.
2. Odoo: a bill that is edited or off-match gets "Exception"; payable flag is separate from the bill itself.
3. SAP (tolerance model): small price gap passes, larger gap blocks payment but the invoice is still saved.
4. ERPNext: supplier bill no. is the key for duplicate checks; keep the check per supplier, live bills only.
5. ERPNext: "On Hold" keeps a bill out of the payable list until released.
6. ERPNext: invoice made from PO/GRN validates rate against the source document.
7. India: invoice no. max 16 chars (letters, digits, "-", "/"), unique per supplier per financial year.

## Findings

### Q1 — Which documents can an invoice be raised against, and for what quantity?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Create from submitted PO or Purchase Receipt; can pull several of one supplier into one invoice. | https://docs.frappe.io/erpnext/user/manual/en/purchase-invoice | 2026-11-20 |
| Odoo | Policy per product: bill on ordered qty (after PO confirm) or on received qty (needs some receipt, partial ok). | https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/purchase/manage_deals/control_bills.html | 2026-11-20 |
| SAP B1 | A/P invoice copied from goods receipt PO; invoice then posts no stock change. | https://help.sap.com/saphelp_sbo900/helpdata/EN/44/fc22561d3c6c30e10000000a114a6b/content.htm | 2026-11-20 |
| Zoho Books | Bill from PO; docs on PO matching not found (silent). | https://www.zoho.com/books/api/v3/bills/ | 2026-11-20 |

**For us:** adopt — invoice lines point to GRN lines (received qty is the base); one invoice may span several GRNs of one PO and supplier — because Odoo's received-qty policy is stricter than ordered-qty and matches a stores-first plant.

### Q2 — How is qty and price matched, and what tolerance?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Rate checked against the PO/receipt on creation. Over-billing allowance % exists in Accounts Settings plus a role that may exceed it; docs frame it for sales, purchase use unconfirmed. | https://docs.frappe.io/erpnext/accounts-settings | 2026-11-20 |
| Odoo | 3-way match only works with received-qty policy; edits allowed, status turns to Exception. No % tolerance in docs. | https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/purchase/manage_deals/control_bills.html | 2026-11-20 |
| SAP (ERP tolerance keys; B1 exact setting not confirmed) | Gap inside tolerance posts clean; over tolerance posts with payment block. Community, not B1 docs. | https://blogs.sap.com/?p=105339 | 2026-11-20 |

**For us:** adapt — two tolerances in settings: price % (paise-based compare per unit) and qty % over GRN qty; inside = "matched", outside = "mismatch" and the invoice is blocked from payable — because SAP's model is the clearest; keep it to two numbers. Default 0% (strict) until the owner sets it. Products disagree on whether an out-of-tolerance bill may be saved: SAP saves with block, Odoo saves with Exception; stricter default = save as draft, cannot be approved.

### Q3 — Hold / block and who may release?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | "On Hold" keeps invoice out of payment selection until released. | https://docs.frappe.io/erpnext/user/manual/en/purchase-invoice | 2026-11-20 |
| Odoo | "Should Be Paid": Yes / No / Exception; set automatically, can be changed by hand. | https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/purchase/manage_deals/control_bills.html | 2026-11-20 |
| SAP | Payment block set automatically on tolerance breach (ERP model). | https://blogs.sap.com/?p=105339 | 2026-11-20 |

**For us:** adopt — a mismatch sets "blocked"; purchase can fix the source (GRN/PO rate) or approve an override with a reason; the override has its own permission and an audit row — because docs show a manual override exists everywhere but give no role rules; we add them. Override by the person who entered the invoice: refuse (docs silent; stricter default).

### Q4 — Duplicate supplier invoice number
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Supplier Invoice No. is the duplicate key; warns/blocks per supplier, ignoring cancelled. Community says early versions checked across suppliers (a bug). | https://discuss.frappe.io/t/cheking-provider-invoice-number-uniqueness/14944 | 2026-11-20 |
| Odoo | Warning banner on same ref (v16+, community source); exact match only; OCA/paid apps block. Docs say several bills may share a reference (partial bills). | https://www.github.com/OCA/account-invoicing/issues/1484 | 2026-11-20 |
| Zoho Books | Same number refused per vendor; same number from different vendors ok; reuse across financial years allowed. | https://www.zoho.com/books/kb/bills/repeat-bill-number.html | 2026-11-20 |
| Busy / CBIC | Rule 46: max 16 chars, letters/digits/"-"/"/", unique in a financial year. | https://taxinformation.cbic.gov.in/content/html/tax_repository/gst/rules/cgst_rules/active/chapter6/rule46_v1.00.html | 2026-11-20 |

**For us:** adopt (Zoho/ERPNext) — hard refuse on same supplier + same invoice number + same financial year, cancelled/voided ones excluded; compare after trim and upper-case — because it stops double payment. Products disagree (Odoo warns, others block): stricter = block.

### Q5 — GST on a purchase bill (CGST/SGST vs IGST, ITC)
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext (India Compliance) | Tax type follows place of supply; ineligible ITC goes to an expense account; reverse charge flag; ITC claim period locked after GSTR-3B month filed. | https://docs.frappe.io/erpnext/india-gst-help | 2026-11-20 |
| Zoho Books | Financial-year suffix in bill no. broke GSTR-2A/2B reconciliation (community). | https://help.zoho.com/portal/ar/community/topic/duplicate-bill-numbers-for-purchases-in-different-financial-years | 2026-11-20 |
| Odoo / SAP B1 | Core docs silent on India GST; localisations only. | | 2026-11-20 |

**For us:** adapt — store supplier GSTIN and state, place of supply; same state = CGST+SGST, else IGST (never both); amounts in integer paise, rounding per line then sum; the invoice carries the tax split shown on the paper bill and is compared to what we compute — a difference beyond 1 rupee is a mismatch — because the bill is the legal document and ITC depends on it. Reverse charge and ITC-ineligible flag: store the flags only, no postings (no ledger in scope).

### Q6 — Payable status without payments
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Unpaid / Partly Paid / Paid / Overdue from outstanding amount and due date. | https://docs.frappe.io/erpnext/user/manual/en/purchase-invoice | 2026-11-20 |
| Odoo | Not paid / In payment / Paid banners; reset to draft to edit a posted bill. | https://www.odoo.com/documentation/18.0/applications/finance/accounting/vendor_bills.html | 2026-11-20 |

**For us:** adapt — statuses: draft, matched, blocked, approved (payable), cancelled; plus due date and "overdue" shown from date. No paid/partly paid until a payment feature exists — because payments are out of scope. Keep room for those two later.

### Q7 — Cancel / edit after approval, credit notes
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Submitted invoice is cancelled and amended, not edited. | https://docs.frappe.io/erpnext/user/manual/en/purchase-invoice | 2026-11-20 |
| Odoo | Confirmed bill: reset to draft, then edit. | https://www.odoo.com/documentation/18.0/applications/finance/accounting/vendor_bills.html | 2026-11-20 |

**For us:** adopt (ERPNext) — approved invoice is never edited; cancel with a reason, then enter a new one. Supplier credit notes and purchase returns: out of this build (separate purchase-returns feature) — because edit-in-place breaks the audit trail. Products disagree: stricter = cancel.

## Die-casting specifics
| Topic | What generic ERPs assume | What a die-casting plant needs | Link | Read on |
|---|---|---|---|---|
| Alloy/metal bought by weight | Qty in pieces | Ingot and alloy bills in kg; supplier weighbridge vs our GRN weight differs; qty tolerance matters most here | https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/purchase/manage_deals/control_bills.html (silent) | 2026-11-20 |
| Job work (machining, plating) bills | Normal purchase | Job-worker bills against a subcontract order/challan, GST on service only (docs silent; module is subcontracting, not PO) | https://docs.frappe.io/erpnext/india-gst-help (silent) | 2026-11-20 |
| Freight, packing, tooling charges | Extra lines | Charges on the bill with no GRN line; need a "charge" line type outside qty match | https://docs.frappe.io/erpnext/user/manual/en/purchase-invoice | 2026-11-20 |
| Metal price moves | Fixed PO price | Ingot rates change weekly; price tolerance may need to be wider for metal | not found in docs | 2026-11-20 |

## Edge cases seen in the products
| Case | What most products do | Products that differ | Link |
|---|---|---|---|
| Bill before goods arrive | Refused under received-qty policy | Odoo allows it under ordered-qty; SAP B1 can copy from PO | Odoo control bills link |
| Bill for more than received | Mismatch / error | ERPNext allows within an allowance % | accounts-settings link |
| Partial bills on one PO | Allowed; remaining qty stays billable | | Odoo vendor bills link |
| Same invoice no., different supplier | Allowed | ERPNext v7 blocked it (community) | discuss.frappe.io thread 14944 |
| Same no., next financial year | Allowed by Zoho; GST says unique in year | | Zoho repeat-bill link |
| Edit after approval | Odoo: reset to draft | ERPNext: cancel and amend | purchase-invoice link |
| Rate below PO | SAP ERP: warning only; above: block | | blogs.sap.com/?p=105339 |
| GST late payment | ITC reversed if unpaid 180 days from invoice date (Rule 37) | not in any ERP docs read | https://taxinformation.cbic.gov.in/content/html/tax_repository/gst/rules/cgst_rules/active/chapter5/rule37_v1.00.html |
| Cancelled GRN after invoicing | Not covered in docs read | | |

## Questions for the factory SME
| # | Question | Options | Why it matters |
|---|---|---|---|
| 1 | Price gap allowed on a bill, normal items? | A 0% / B 1% / C 2% / D other | Sets default tolerance |
| 2 | Weight gap allowed on metal bills? | A 0.5% / B 1% / C 2% / D other | Weighbridge difference |
| 3 | Who approves a blocked bill? | A purchase head / B owner / C any purchase user | Override permission |
| 4 | Do you bill freight/packing separately? | yes / no | Charge lines needed |
| 5 | Any supplier on reverse charge (unregistered)? | yes / no | RCM flag needed |
| 6 | Supplier credit notes needed in v1? | yes / no | Scope |

## Follow-ups
