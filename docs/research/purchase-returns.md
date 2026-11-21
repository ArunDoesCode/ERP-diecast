---
feature: purchase-returns
brief: docs/briefs/purchase-returns.md
date: 2026-11-20
products: [ERPNext, Odoo, SAP Business One, Dynamics 365 SCM, Infor M3]
---

# Research — Purchase returns

> All pages read 2026-11-20. Owner away; no questions asked. Odoo has no current official page for this (the 18.0 URL gave 404); Odoo rows use old official docs plus community add-ons and are marked so.

## Copy these
1. Return is made from the submitted GRN, quantity capped by what was received minus earlier returns (ERPNext).
2. Stock goes out at the original receipt rate, not today's price (ERPNext).
3. Return can come out of a rejected/quarantine bucket; create it only when goods physically leave (ERPNext).
4. Debit note is a separate document from the stock return; never let both move stock (ERPNext, SAP).
5. Return updates "returned qty" on GRN and PO line; SAP can reopen the PO open qty by a setting (SAP).
6. Many returns per GRN allowed, cumulative cap enforced (ERPNext).
7. Replacement = a new receipt against the reopened PO, not a special return type (SAP, Odoo add-ons).

## Findings

### Q1 — Where does a return start, and how much can come back?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Create from submitted receipt; remove lines not returned; cumulative returns cannot exceed eligible qty | https://docs.frappe.io/erpnext/purchase-return | 2026-11-20 |
| SAP Business One | Return copies from one goods receipt PO (only one per return), or stands alone | https://help.sap.com/saphelp_sbo92/helpdata/en/44/fc227a1d3c6c30e10000000a114a6b/content.htm | 2026-11-20 |
| Odoo (old docs) | "Reverse"/Return button on a done receipt, enter qty | https://www.odoo.com/documentation/user/13.0/purchase/purchases/rfq/cancel.html | 2026-11-20 |

**For us:** adopt — return is created from one posted GRN line set; cap = accepted-or-rejected qty still on hand minus earlier returns — because it blocks phantom returns.

### Q2 — Which stock can be returned: rejected, excess, or accepted?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Rejected qty sits in a rejected warehouse; pick it as source. Accepted stock returnable from its warehouse too | https://docs.frappe.io/erpnext/purchase-return | 2026-11-20 |
| SAP Business One | Any received qty, for faulty, unwanted or wrong goods | (SAP page above) | 2026-11-20 |
| Infor M3 | Claim created when goods fail inspection | https://docs.infor.com/m3udi/16.x/en-us/m3beud/prochs/dyd1567543109100.html | 2026-11-20 |

**For us:** adapt — allow return of rejected qty and of over-receipt excess only; accepted good stock needs a reason and a higher permission — because the brief names only rejected/excess.

### Q3 — Stock effect and value
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Ledger entry out at original receipt rate; serial/batch must be picked | https://docs.frappe.io/erpnext/purchase-return | 2026-11-20 |
| SAP Business One | Issues stock, lowers qty; with perpetual valuation posts value; independent returns must match original price | (SAP page above) | 2026-11-20 |
| Dynamics 365 | Return posted against the PO; vendor credit note follows | https://learn.microsoft.com/en-us/training/modules/process-purchase-orders-dyn365-supply-chain-mgmt/7-create-vendor-returns | 2026-11-20 |

**For us:** adopt — one `inventory_ledger` out-posting per line at the GRN rate (paise), heat/batch no. carried over, in the same transaction as the return post — because it is our invariant.

### Q4 — Draft, approve, dispatch: states and reversal
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Save then submit; goods held in rejected warehouse "while supplier decides"; create return when goods leave | https://docs.frappe.io/erpnext/purchase-return | 2026-11-20 |
| SAP Business One | Optional Goods Return Request first, then Goods Return | https://learning.sap.com/courses/managing-logistics-in-sap-business-one/solving-issues-in-purchasing | 2026-11-20 |
| Dynamics 365 | Many vendors need an RMA number before goods ship | (Dynamics link above) | 2026-11-20 |

**For us:** adapt — states draft, posted, cancelled; stock moves only on post; an RMA/vendor ref field is optional text; a posted return is reversed only by a counter-entry, never edited — because stock must stay traceable. Needs SME check.

### Q5 — Debit note and invoice interplay
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Return reverses stock only; debit note is created from the Purchase Invoice; stock-updating debit note plus a return double-counts, so one or the other | https://docs.frappe.io/erpnext/purchase-return | 2026-11-20 |
| SAP Business One | Not yet invoiced: Goods Return. Already invoiced: A/P Credit Memo instead | https://learning.sap.com/courses/managing-logistics-in-sap-business-one/solving-issues-in-purchasing | 2026-11-20 |
| Infor M3 | Common fix is replacement or supplier credit note | (Infor link above) | 2026-11-20 |

**For us:** adapt — the return posts stock and produces a debit note document (number series, value = qty x GRN rate + tax) in the same flow; the debit note never moves stock; no accounting ledger entries (out of scope per brief) — because the brief wants both in one step. Products split into two steps: we merge them. Products agree on the one-stock-movement rule.

### Q6 — Effect on PO open qty and replacement
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Returned qty is updated on the receipt and linked PO; no replacement flow described | https://docs.frappe.io/erpnext/purchase-return | 2026-11-20 |
| SAP Business One | Returns based on a PO can reopen it: status Open, open qty up, delivered qty down (needs a setting) | (SAP page above) | 2026-11-20 |
| Odoo (community add-ons, docs silent) | Without an add-on the PO stays fully received after a return; add-ons re-open receiving | https://apps.odoo.com/apps/modules/19.0/po_receipt_recreate | 2026-11-20 |

**For us:** adapt — PO line shows returned qty; received qty drops by returned qty; PO reopens (back to partial_received) so the supplier can send a replacement on a new GRN; default is "credit only" unless the user picks "expect replacement" — because it keeps the PO truthful. Products disagree (ERPNext no reopen, SAP optional, Odoo no): stricter default = do not reopen unless chosen.

### Q7 — Who may do what
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Role permissions on the document type; submit is a separate right | https://docs.frappe.io/erpnext/purchase-return | 2026-11-20 |
| SAP Business One | Authorisation per document type | (SAP page above) | 2026-11-20 |

**For us:** adopt — separate keys: create (stores), post (stores lead / purchase), cancel (owner/back office) — because every state change is permission-checked and audited.

### Q8 — GST on returns (India)
| Product | What it does | Link | Read on |
|---|---|---|---|
| CBIC Sec 34 text | The supplier issues the GST credit note; buyer's own note is a commercial debit note; credit note declaration deadline 30 Nov after the financial year; ITC reversal link from 1 Oct 2025 (secondary sources) | https://taxinformation.cbic.gov.in/content/html/tax_repository/gst/acts/2017_CGST_act/active/chapter7/section34_v1.00.html | 2026-11-20 |
| Practitioner blogs | Buyer debit note should cite the original tax invoice; goods return movement usually with a delivery challan (not confirmed from statute) | https://www.aiaccountant.com/blog/purchase-return-debit-note | 2026-11-20 |

**For us:** adapt — debit note carries original supplier invoice no./date, GRN no., HSN, taxable value, CGST+SGST or IGST split copied from the GRN/PO rate, number series per FY; also print a return challan; no e-way or tax filing, no ITC ledger — because only the paper trail is in scope. Verify challan and ITC points with the SME/CA.

## Die-casting specifics
| Topic | What generic ERPs assume | What a die-casting plant needs | Link | Read on |
|---|---|---|---|---|
| Rejected material type | Finished goods in pieces | Mostly ingot/alloy, inserts, consumables by kg; rejection by heat/lot (chemistry, porosity) | https://vcportal.endurancegroup.com/data/policies/Rejection-Handling-of-Vendor-Parts.pdf | 2026-11-20 |
| Return vs scrap-and-debit | Always physical return | Small lots or melted ingot often kept/scrapped and supplier debited, no truck back | https://archive.sap.com/discussions/thread/1055325 | 2026-11-20 |
| Job work (Sec 143) | Not modelled | Subcontract GRN rejects go back to the job worker; our own challan governs, not a purchase debit note — out of scope here | not found in a product doc | 2026-11-20 |

## Edge cases seen in the products
| Case | What most products do | Products that differ | Link |
|---|---|---|---|
| Return more than received less earlier returns | Block | none | https://docs.frappe.io/erpnext/purchase-return |
| GRN already invoiced | ERPNext: separate debit note from invoice | SAP forces A/P credit memo, blocks Goods Return | SAP learning link (Q5) |
| Stock already consumed before return | Return source warehouse must hold qty; block if short | none found | https://docs.frappe.io/erpnext/purchase-return |
| Fully returned receipt status | Shows "Return Issued"; billed receipt may still show Completed | ERPNext only | https://docs.frappe.io/erpnext/purchase-return |
| Second-level returns (return of a return) | Not supported / not reflected | Odoo add-on states first-level only | https://apps.odoo.com/apps/modules/18.0/purchase_stock_picking_return_invoicing |
| Several GRNs on one return | Not allowed | SAP: only one GRPO per return | SAP help link (Q1) |
| GRN QA correction after a return | Not described | all | not found |

## Questions for the factory SME
| # | Question | Options | Why it matters |
|---|---|---|---|
| 1 | When rejected material is small or already melted, do you send it back or scrap and debit? | A back / B scrap+debit / C both | Decides whether a "debit only, no stock" return type is needed |
| 2 | Do suppliers usually replace rejected lots or give credit? | A replace / B credit / C mixed | Decides PO reopen default |
| 3 | Does your CA want a delivery challan printed for goods going back? | yes / no | Print format and numbering |
| 4 | Does the supplier ask for a return authorisation number first? | yes / no | RMA field required or optional |
| 5 | Who signs off a return? | A stores / B purchase / C owner | Permission keys |

## Follow-ups
(none yet)
