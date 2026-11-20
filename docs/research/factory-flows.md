---
feature: factory-flows
brief: docs/briefs/factory-flows.md
date: 2026-11-20
products: [ERPNext, Odoo, SAP Business One, Plex (foundry case studies), Odyssey ERP (B&L, foundry)]
---

# Research — Factory flows

> Every finding has a link and the date it was read (all 2026-11-20). Official docs only unless said.
> Not reachable: ERPNext number-card page (404), Odoo 18 reception page (404), SAP "navigating approvals" page (404).
> Odoo 18 has no built-in purchase requisition document; its closest flow is RFQ → PO.

## Copy these
1. Odoo's "Late / Today / Future" counts per user, red / orange / green: best "what is waiting for me" pattern.
2. ERPNext "Create" menu on the submitted document, carrying the source link: next step starts from the page you are on.
3. ERPNext requisition statuses Pending / Partially Ordered / Ordered, per line: shows what is still open.
4. ERPNext and SAP: one order, many receipts; order stays open until the balance is closed on purpose.
5. ERPNext: over-receipt blocked above a percentage; a named role may exceed it.
6. SAP: approval is a draft that waits; the sender can see its status, the approver can open the draft.
7. ERPNext: Close ends the balance but never reverses stock; fix posted stock with a return.

## Findings

### Q1 — What does a person see first, and does it filter to them?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Workspace has shortcuts to lists/reports and an optional dashboard on top; "default" workspace per module; user edits apply to that user only. Number-card page unreachable. | https://docs.frappe.io/erpnext/user/manual/en/workspace | 2026-11-20 |
| Odoo | Header clock menu: counts of Late / Today / Future grouped by app; colours red/orange/green. | https://www.odoo.com/documentation/18.0/applications/essentials/activities.html | 2026-11-20 |
| SAP Business One | Pending approvals and alerts arrive in a Messages/Alerts window; click opens the draft. | https://help.sap.com/saphelp_sbo92/helpdata/en/45/06da03d8696c30e10000000a114a6b/content.htm | 2026-11-20 |
| Plex | Case studies talk about visibility into purchasing, no queue detail in the docs found. | https://plex.rockwellautomation.com/en-us/blog/what-can-manufacturers-learn-brass-aluminums-quest-visibility-and-automation.html | 2026-11-20 |

**For us:** adapt — home shows count tiles per role (Late / Today / Later), each opens the list already filtered — because the brief wants "one click"; ERPNext shortcuts alone only open unfiltered lists.

### Q2 — How is the next step offered from the document you are on?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | "Create" menu on a submitted requisition offers PO; on a PO offers Receipt. Source link kept, so ordered/received % update. Retyping lines in an unrelated PO breaks the link. | https://docs.frappe.io/erpnext/user/manual/en/material-request | 2026-11-20 |
| Odoo | "Confirm Order" turns RFQ into PO; with Inventory, a receipt is created automatically with expected dates. | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/purchase/manage_deals/rfq.html | 2026-11-20 |
| SAP Business One | Copy To / draw document from a PO into a goods receipt; pick rows and quantities. | https://learning.sap.com/courses/managing-logistics-in-sap-business-one/solving-issues-in-purchasing | 2026-11-20 |

**For us:** adopt — show only the next-step button the user may use, in the document header; the new document is pre-filled and linked — because all three do it and it halves clicks.

### Q3 — Requisition to order: partial, split, several suppliers?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | One request can be split over several POs and suppliers; status Partially Ordered until covered. Stop blocks further ordering without cancelling linked POs. | https://docs.frappe.io/erpnext/user/manual/en/material-request | 2026-11-20 |
| ERPNext Buying Settings | "Over Order Allowance %" limits PO quantity above the request. | https://docs.frappe.io/erpnext/buying-settings | 2026-11-20 |
| SAP Business One | Same pattern: copy some rows, adjust quantity; row stays open for the rest. | https://learning.sap.com/courses/managing-logistics-in-sap-business-one/solving-issues-in-purchasing | 2026-11-20 |

**For us:** adopt — per-line ordered quantity, "Partially Ordered" status, an explicit Stop; order quantity above request refused unless a tolerance says otherwise (stricter default: refuse) — because it keeps the queue honest.

### Q4 — Receiving against an order: partial deliveries and over-delivery?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Many receipts per PO; order stays open. Over-receipt allowed up to a % (global or per item); a named role may exceed. Docs disagree whether the % sits in Stock or Buying Settings. | https://docs.frappe.io/erpnext/v13/user/manual/en/stock/articles/allow-over-delivery-billing-against-sales-order-upto-certain-limit | 2026-11-20 |
| Odoo | Receipt for less than ordered asks: create backorder, or no backorder (treat as done). Odoo 18 code has Not / Partially / Fully Received. | https://www.odoo.com/documentation/user/12.0/purchase/purchases/rfq/reception.html | 2026-11-20 |
| SAP Business One | Reference PO many times while Open; copied quantity can be raised to match what arrived (no built-in refusal found in sources). | https://learning.sap.com/courses/managing-logistics-in-sap-business-one/solving-issues-in-purchasing | 2026-11-20 |

**For us:** adapt — receive from the order page with open quantity pre-filled; over-receipt refused above a tolerance, higher only with a permission; short receipt asks "keep open" or "close balance" — because Odoo's backorder question is the clearest for a store keeper. **Products disagree** on over-receipt (SAP allows, ERPNext caps); stricter = cap.

### Q5 — Inspection at receipt and rejected goods
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Items flagged for inspection cannot submit a receipt without an inspection; accepted and rejected quantities are separate; rejected goes to a separate warehouse; return from there. | https://docs.frappe.io/erpnext/user/manual/en/purchase-receipt | 2026-11-20 |
| Odoo | Quality checks come from the separate Quality app (not read; docs unreachable in this pass). | not reachable | |

**For us:** adopt — accepted and rejected quantities on the receipt; only accepted adds usable stock; QA sees "to inspect" as a queue — because the brief names QA as a role.

### Q6 — Approvals: who sees what, before and after?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Workflow states with roles per step; condition on amount (e.g. total under a limit); buttons shown only for allowed actions. Self-approval not covered in docs. | https://docs.frappe.io/erpnext/user/manual/en/workflows | 2026-11-20 |
| Odoo | Built-in double validation above an amount; more levels need add-ons (third-party). | https://www.odoo.com/documentation/user/9.0/purchase/purchases/rfq/approvals.html | 2026-11-20 |
| SAP Business One | Template picks stages by user, document, conditions; doc waits as a draft; sender has a status report, approver a decision report. | https://help.sap.com/saphelp_sbo92/helpdata/en/45/06da03d8696c30e10000000a114a6b/content.htm | 2026-11-20 |

**For us:** adapt — before sending, show "will go to: <stage / role>" (preview); after, show status on the page; approver queue on home — because SAP's status report is what a sender actually wants. Self-approval: refuse (stricter; products silent).

### Q7 — Chasing late orders
| Product | What it does | Link | Read on |
|---|---|---|---|
| Odoo | "Late" flag when the order deadline passed; expected arrival = deadline + vendor lead time; "Ask confirmation" emails vendor for a ship date. | https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/purchase/manage_deals/rfq.html | 2026-11-20 |
| ERPNext | PO has per-line received %; a "to receive" status; no late flag found in the docs read. | https://docs.frappe.io/erpnext/user/manual/en/purchase-order | 2026-11-20 |
| SAP Business One | Open-quantity column on PO line shows what is not received (forum, not docs). | https://learning.sap.com/courses/managing-logistics-in-sap-business-one/solving-issues-in-purchasing | 2026-11-20 |

**For us:** adopt (Odoo) — expected date on each order, "late" = past date with open quantity, a Late tile on the purchase officer's home — because it is the office's main chase list.

### Q8 — Closing, cancelling, reversing
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Hold = temporary stop. Close = balance never comes; posted stock untouched; undo stock via return. | https://docs.frappe.io/erpnext/user/manual/en/purchase-order | 2026-11-20 |
| SAP Business One | Receipt cannot be edited after posting; cancel and re-enter, or return. Close a PO or one row. | https://learning.sap.com/courses/managing-logistics-in-sap-business-one/solving-issues-in-purchasing | 2026-11-20 |
| Odoo | After a partial receipt and return, backorder quantity did not reset on its own (forum, not docs). | https://www.odoo.com/forum/help-1/purchase-updating-backorders-after-a-partial-shipment-return-228214 | 2026-11-20 |

**For us:** adopt — Close ends the balance, posted stock is only reversed by a return/reversal posting; no edit of a posted receipt — fits the "stock only through ledger" rule.

### Q9 — Detail page side panel, lists, full-page forms
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Connections block lists linked receipts/invoices; line rows show received/billed qty; linked documents can block cancel. | https://docs.frappe.io/erpnext/user/manual/en/purchase-order | 2026-11-20 |
| Odoo | Record page has chatter with history and activities beside the form. | https://www.odoo.com/documentation/18.0/applications/essentials/activities.html | 2026-11-20 |
| SAP Business One | Approver drills from alert to the draft document. | https://help.sap.com/saphelp_sbo92/helpdata/en/45/06da03d8696c30e10000000a114a6b/content.htm | 2026-11-20 |

Docs found say nothing on list summary strips or pop-up vs full-page forms (design choice, not a documented rule).
**For us:** adopt — side panel = totals, approvals, linked documents with quantities, history; forms are full pages — because brief already asks and all three keep these on the document page.

## Die-casting specifics
| Topic | What generic ERPs assume | What a die-casting plant needs | Link | Read on |
|---|---|---|---|---|
| Incoming metal | Count of pieces; inspection optional | Ingot by weight, grade and heat/lot; chemistry check before use. Public foundry-ERP articles do not describe this flow (gap). | https://www.deskera.com/blog/mrp-for-foundries/ | 2026-11-20 |
| Die shots | Not tracked | Shots counted per die; dies past a limit flagged for inspection (production, later round). | https://www.foundrymag.com/simulationit/diecaster-opts-industry-standard-erp | 2026-11-20 |
| Failed parts | Scrap only | Failed inspection goes to rework route with rework/scrap %. | https://www.moderncasting.com/node/336 | 2026-11-20 |

## Edge cases seen in the products
| Case | What most products do | Products that differ | Link |
|---|---|---|---|
| Receive more than ordered | Cap by % tolerance | SAP lets quantity be raised freely | links in Q4 |
| Short delivery, rest never comes | Close the balance on purpose | Odoo asks at receipt (backorder or not) | Q4 |
| Request partly ordered, then no longer needed | Stop it; linked POs untouched | none | Q3 |
| Posted receipt is wrong | Cancel or return; no edit | none | Q8 |
| PO with receipts is cancelled | Blocked while linked documents exist | none | Q9 |
| Sender approves own document | Docs silent | none found | Q6 |
| Approver gone | SAP has substitute authorizers (community post) | ERPNext, Odoo silent | https://blogs.sap.com/t5/enterprise-resource-planning-q-a/substitute-authorizers-for-approval-templates/qaq-p/13649434 |

## Questions for the factory SME
| # | Question | Options | Why it matters |
|---|---|---|---|
| 1 | What does the store keeper receive most often? | A bought parts, B ingot/metal, C consumables, D mixed | Sets the default receive screen |
| 2 | Is incoming inspection done on every receipt? | A all, B some items, C never | Whether QA queue is a gate or optional |
| 3 | How much over the ordered quantity is accepted? | A none, B up to 5%, C up to 10%, D by item | Over-receipt tolerance default |
| 4 | When an approver is away, who covers? | A nobody waits, B named deputy, C plant head | Stuck approvals |
| 5 | What does the plant head check first each morning? | A stock, B late orders, C pending approvals, D rejects | First tile on plant head home |

## Follow-ups
