---
feature: rfq
brief: docs/briefs/rfq.md
date: 2026-11-20
products: [ERPNext, Odoo, SAP Business One, MRPeasy]
---

# Research — Request for quotation (RFQ, quotes, award, rate contracts)

> All pages read 2026-11-20. Odoo 18 docs and SAP help read through a fetch tool that summarises; wording is ours.
> Not reachable as full pages: Odoo agreements page (empty on fetch; used search result + the two sub-pages), SAP B1 Web-client help (empty; used SAP 9.2 help page).

## Copy these
1. One RFQ -> one quote row per supplier, quote linked back to the RFQ; status "pending" until a quote exists (ERPNext).
2. Award per item line, not per whole RFQ: pick the best supplier for each product (Odoo "Choose").
3. PO is created from the chosen quote so rates carry over, with a source link; no retyping (ERPNext).
4. Contract has from/to dates, agreed rate, agreed qty, and a running "ordered" qty (ERPNext, SAP).
5. PO auto-fills the contract rate when vendor, item and date match; a flag lets the buyer ignore it (SAP).
6. Over-contract orders: allow a small set % (ERPNext allowance); otherwise stop. Stricter default: stop.
7. Cancelling a PO gives its quantity back to the contract (ERPNext, SAP).

## Findings

### Q1 — How does an RFQ start, and what does it carry?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | RFQ made from submitted purchase request or by hand; supplier rows added; submit = invitation, no stock/money effect | https://docs.frappe.io/erpnext/user/manual/en/request-for-quotation | 2026-11-20 |
| Odoo | RFQ is a draft PO to one vendor; "alternatives" copy the products for other vendors | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/purchase/manage_deals/calls_for_tenders.html | 2026-11-20 |
| MRPeasy | RFQ is a PO with status "RFQ"; duplicated per vendor; PDF or pre-filled email | https://www.mrpeasy.com/demo-videos/purchasing-management/ | 2026-11-20 |

**For us:** adapt — RFQ header + item lines pulled from approved PR lines + supplier rows; submit locks it; no email, print/PDF only — because email is out tonight. RFQ stays optional (ERPNext says skip it when supplier is known).

### Q2 — How are quotes entered and when do they expire?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Quote entered internally or by portal as draft; submit freezes it; has "valid till"; expired quotes kept as records, reconfirm before use | https://docs.frappe.io/erpnext/user/manual/en/supplier-quotation | 2026-11-20 |
| Odoo | Vendor prices typed into that vendor's RfQ copy | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/purchase/manage_deals/calls_for_tenders.html | 2026-11-20 |
| ERPNext (manual quote) | A quote with no RFQ reference does not count toward RFQ status | https://docs.frappe.io/erpnext/user/manual/en/request-for-quotation | 2026-11-20 |

**For us:** adopt — quote is draft then submitted (frozen), has valid-till; award refuses an expired quote — because stricter. Quote must always point to its RFQ.

### Q3 — How do you compare quotes?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Comparison report: same item and qty across suppliers; advice to weigh tax, freight, lead time, validity, payment terms, not just rate | https://docs.frappe.io/erpnext/user/manual/en/supplier-quotation | 2026-11-20 |
| Odoo | "Compare Product Lines" groups by product; Clear removes a product as an option | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/purchase/manage_deals/calls_for_tenders.html | 2026-11-20 |
| MRPeasy | No comparison layout found in docs | https://www.mrpeasy.com/demo-videos/purchasing-management/ | 2026-11-20 |

**For us:** adapt — grid: item rows x supplier columns showing landed rate (rate + GST + freight), lead days, valid-till, payment terms; lowest landed rate highlighted — because GST and freight change the winner.

### Q4 — How is the award done, and what happens to the losers?
| Product | What it does | Link | Read on |
|---|---|---|---|
| Odoo | Choose per product; Confirm Order then asks: cancel alternatives, keep them, or discard | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/purchase/manage_deals/calls_for_tenders.html | 2026-11-20 |
| ERPNext | PO created from selected quote; may order less than quoted | https://docs.frappe.io/erpnext/user/manual/en/supplier-quotation | 2026-11-20 |
| ERPNext | Cancelled or closed quote cannot create a PO | same | 2026-11-20 |

**For us:** adapt — award per line, one draft PO per winning supplier; cheaper-than-chosen needs a reason note; losing quotes marked "not awarded" (kept, not deleted) — because audit trail.

### Q5 — Can an RFQ or quote be changed after sending?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Submitted RFQ changes need cancel + amend; tell suppliers about the change | https://docs.frappe.io/erpnext/user/manual/en/request-for-quotation | 2026-11-20 |
| Odoo | Confirmed agreement can still be edited (looser) | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/purchase/manage_deals/blanket_orders.html | 2026-11-20 |

**For us:** adopt (ERPNext, stricter) — locked after submit; cancel and re-issue; cancel blocked once a PO came from it — because the rate must stay traceable.

### Q6 — Rate contract: what does it hold and what are its states?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Blanket order per supplier: from/to date, item, rate, total qty; draft / submitted / cancelled; no auto-close at expiry | https://docs.frappe.io/erpnext/user/manual/en/blanket-order | 2026-11-20 |
| Odoo | Draft then Confirmed; unit price typed by hand; blank validity = never expires | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/purchase/manage_deals/blanket_orders.html | 2026-11-20 |
| SAP B1 | Must be approved first; by items or by money; can be terminated early; fulfilment % report | https://help.sap.com/saphelp_sbo92/helpdata/en/b6/1e853cc4b14d758ee9f6f0e2ebee54/content.htm and search result of 2026-11-20 | 2026-11-20 |

**For us:** adapt — contract: supplier, dates, lines (item, rate in paise, agreed qty); states draft / active / terminated / expired (expiry computed from date, not by hand); no blank end date — because ERPNext leaves expiry to people, which is a known gap.

### Q7 — How does a PO pick the contract rate?
| Product | What it does | Link | Read on |
|---|---|---|---|
| SAP B1 | Matches vendor + items + posting date inside validity, fills contract number and price on each line; checkbox on contract to ignore its prices | https://help.sap.com/saphelp_sbo92/helpdata/en/b6/1e853cc4b14d758ee9f6f0e2ebee54/content.htm | 2026-11-20 |
| ERPNext | Rate mapped only when PO is created from the blanket order; interaction with price list not documented | https://docs.frappe.io/erpnext/user/manual/en/blanket-order | 2026-11-20 |
| ERPNext | "Maintain same rate" setting: Stop or Warn when a later document's rate differs; override role | https://docs.frappe.io/erpnext/user/manual/en/buying-settings | 2026-11-20 |
| Odoo | Confirming an agreement adds a vendor price line on the product, used by auto-replenishment | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/purchase/manage_deals/blanket_orders.html | 2026-11-20 |

**For us:** adapt — order of precedence: active contract rate, then awarded quote rate, then manual; a PO rate different from the contract needs a permission and a reason (Stop with override, as ERPNext) — because rate drift is the thing this feature exists to stop. Products disagree on whether the buyer may silently override: SAP lets them tick ignore, ERPNext can Stop. Default: stop.

### Q8 — What if orders go past the contract quantity?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | "Blanket order allowance %" caps overshoot (5% of 1000 = 1050); zero-qty contracts allowed for rate-only deals | https://docs.frappe.io/erpnext/user/manual/en/buying-settings | 2026-11-20 |
| SAP B1 | Shows a message when qty exceeds open qty; counts on goods receipt | https://help.sap.com/saphelp_sbo92/helpdata/en/b6/1e853cc4b14d758ee9f6f0e2ebee54/content.htm | 2026-11-20 |
| Odoo | Docs silent on any cap | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/purchase/manage_deals/blanket_orders.html | 2026-11-20 |

**For us:** adapt — products disagree (SAP warns, ERPNext caps). Default stricter: block above contract qty + a small allowance %, default 0. Rate-only contract (no qty) allowed — because many foundry rates (metal, tooling, services) have no fixed volume. Count on PO confirm (ERPNext submitted-order count), give back on PO cancel.

### Q9 — Who may do what, and how is it reported?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Rate override restricted to a named role; comparison report; contract expiry tracked by hand | https://docs.frappe.io/erpnext/user/manual/en/buying-settings | 2026-11-20 |
| SAP B1 | Fulfilment % report per supplier and date range | search result, help.sap.com (SAP B1 blanket agreement, 2026-11-20) | 2026-11-20 |

**For us:** adopt — separate permissions: create/submit RFQ, enter quote, award, manage contracts, override contract rate; reports: quote comparison, contract fulfilment % and expiring in 30 days — because RFQ/award/contract are different trust levels.

## Die-casting specifics
No product page covers foundry buying; the rows below are general trade practice, not sourced. Treat as SME questions.
| Topic | What generic ERPs assume | What a die-casting plant needs | Link | Read on |
|---|---|---|---|---|
| Alloy / ingot rate | Fixed price per unit | Price tied to LME/alloy index, changes monthly; contract may be "rate + surcharge" | not sourced | - |
| Job work (GST Sec 143) | Not modelled | Machining/plating job-work quotes, rates per piece, may be quoted by weight | not sourced | - |
| Unit | One UoM | Quote in kg, order in pieces (shot weight) | not sourced | - |

## Edge cases seen in the products
| Case | What most products do | Products that differ | Link |
|---|---|---|---|
| Source PR not eligible (not approved, wrong company, nothing left) | Excluded from RFQ pick list | - | https://docs.frappe.io/erpnext/user/manual/en/request-for-quotation |
| Quote typed by hand, no RFQ link | Not counted as a response | ERPNext only documented | same |
| Quote expired before award | Kept as record; reconfirm | - | https://docs.frappe.io/erpnext/user/manual/en/supplier-quotation |
| Order less than quoted | Allowed | - | same |
| Contract expired / quantity used up | Not auto-closed; buyer must watch | SAP checks posting date in validity | https://docs.frappe.io/erpnext/user/manual/en/blanket-order |
| PO cancelled | Contract used-qty reverts | - | https://help.sap.com/saphelp_sbo92/helpdata/en/b6/1e853cc4b14d758ee9f6f0e2ebee54/content.htm |
| Contract terminated early | Only documents dated inside start..termination still allowed | - | SAP search result 2026-11-20 |
| Contract price 0 / not entered | Stays 0 on the line | Odoo | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/purchase/manage_deals/blanket_orders.html |
| Two contracts cover same item and supplier | Not documented in any product | - | - |
| Award leaves other RFQs open | Odoo asks cancel / keep | ERPNext does not ask | Odoo calls-for-tenders page |

## Questions for the factory SME
| # | Question | Options | Why it matters |
|---|---|---|---|
| 1 | Is alloy bought on a monthly index-linked rate? | Y / N | decides if contract rate can be a fixed number |
| 2 | Usual number of suppliers per RFQ? | 2 / 3 / 4+ | comparison grid width |
| 3 | Quote machining/job work by piece or by kg? | piece / kg / both | unit on quote line |
| 4 | Allowed overshoot on contract qty? | 0% / 5% / 10% | allowance default |
| 5 | Must a non-lowest award carry a reason? | Y / N | award rule |
| 6 | Who may override a contract rate? | owner / purchase head / nobody | permission key |

## Follow-ups
(none yet)
