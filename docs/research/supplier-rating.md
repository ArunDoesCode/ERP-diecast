---
feature: supplier-rating
brief: docs/briefs/supplier-rating.md
date: 2026-11-20
products: [ERPNext, Odoo, SAP Business One (SAP ERP vendor evaluation used), Infor CSI, Infor FactoryTrack-style IFS/SyteLine vendor performance]
---

# Research — Supplier rating

> Every finding has a link and the date it was read (all 2026-11-20). SAP Business One has no vendor-rating docs I could find; SAP ERP (MM) vendor evaluation is used as the SAP reference and labelled so. Odoo core has no on-time score in its docs; a marketplace add-on and a forum post fill the gap (community, not official).

## Copy these
1. Score = weighted criteria, weights add to 100, shown per period (ERPNext) — simple and explainable to purchase.
2. Compute from receipts, count each PO line once, not quantity — Infor/ERPNext; avoids the Odoo "200% on time" bug.
3. On time = last receipt date on/before due date + a tolerance in days (JD Edwards "allowed late" idea, SAP variance days).
4. Rejection % = rejected qty / received qty; empty period = "no data", not 100 (ERPNext warns you must choose).
5. Price variance vs the last paid rate and the item standard rate, shown as %, not blended into one hidden score (SAP price level).
6. Rolling 12 months, with monthly buckets for the trend (Infor 12-month, ERPNext periods).
7. Show standing bands (Good / Watch / Poor) as a label only; no auto-block of POs in v1 (ERPNext block action is optional).

## Findings

### Q1 — What counts as "on time", and against which date?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | On-time = on-time deliveries / total deliveries; variables pulled from receipts vs PO schedule date | https://docs.frappe.io/erpnext/user/manual/en/supplier-scorecard | 2026-11-20 |
| Odoo | Core docs only give a purchase analysis (days to receive). Add-on compares planned vs actual receipt date, OTD % per vendor (community) | https://apps.odoo.com/apps/modules/19.0/mfx_vendor_performance | 2026-11-20 |
| SAP (ERP vendor evaluation) | Receipt vs the statistics-relevant delivery date (not the MRP-changed date); service level = POs closed on/before required date | https://learning.sap.com/courses/purchasing-in-sap-s-4hana/setting-up-vendor-evaluation-using-logistics-information-system | 2026-11-20 |
| Infor SyteLine/IFS | Line is on time if received on/before early date; for partial receipts the latest receipt date decides | https://docs.infor.com/ifsm/2026.x/en-us/ifsmolh/valuecontent_user/qdm1743104016620.html | 2026-11-20 |

**For us:** adapt — on time = the PO line's last GRN date <= the original expected date (revised date shown beside, not used) + tolerance — because SAP uses the original date so a supplier cannot be "fixed" by re-dating. Our PO has revised and expected dates; revised-date use is an SME question.

### Q2 — Is there a grace / tolerance, and what about early deliveries?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | No built-in tolerance; you write the criteria formula | https://docs.frappe.io/erpnext/user/manual/en/supplier-scorecard | 2026-11-20 |
| SAP | Standard delivery-date variance in days (set per purchasing org, overridable per material) maps days to a percentage; punctual only counts if minimum delivery % met | https://learning.sap.com/courses/purchasing-in-sap-s-4hana/setting-up-vendor-evaluation-using-logistics-information-system | 2026-11-20 |
| Infor CSI | Day bands, early and late, each with points deducted; early can lose points too | https://docs.infor.com/csi/9.01.x/en-us/csbiolh/kqs1464806250650.html | 2026-11-20 |
| Infor IFS | No tolerance; strict | https://docs.infor.com/ifsm/2026.x/en-us/ifsmolh/valuecontent_user/qdm1743104016620.html | 2026-11-20 |

**For us:** adapt — one setting "grace days" (default 0, strict = stricter choice); early counts as on time — because small plant, simple. Products disagree (strict vs banded).

### Q3 — Partial deliveries and short/over supply
| Product | What it does | Link | Read on |
|---|---|---|---|
| Odoo (forum) | Over-delivery inflated on-time to 200% when counting quantity | https://www.odoo.com/forum/help-1/100-on-time-rate-on-vendor-v16-sh-244611 | 2026-11-20 |
| SAP | Punctual delivery scores only if delivered % >= minimum; reversed receipt cancels the last score update | https://learning.sap.com/courses/purchasing-in-sap-s-4hana/setting-up-vendor-evaluation-using-logistics-information-system | 2026-11-20 |
| Infor IFS | Counts lines, partial receipt uses latest date | https://docs.infor.com/ifsm/2026.x/en-us/ifsmolh/valuecontent_user/qdm1743104016620.html | 2026-11-20 |
| Infor CSI | Each receipt counts equally regardless of qty; only completed receipts count | https://docs.infor.com/csi/9.01.x/en-us/csbiolh/kqs1464806250650.html | 2026-11-20 |

**For us:** adapt — per PO line; line is on time only when fully received (accepted+rejected >= ordered qty within the over-receipt cap) by the date; still-open past-due lines count as late — because it refuses rather than flatters. GRN corrections that roll PO status back must recompute. Products disagree on counting unit; stricter = lines.

### Q4 — How is rejection rate computed from QA?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Quality = accepted / received x 100 (100 if nothing received); rejected qty is a variable | https://docs.frappe.io/erpnext/user/manual/en/supplier-scorecard | 2026-11-20 |
| Infor IFS | Line passes only if rejected qty is zero (line-based) | https://docs.infor.com/ifsm/2026.x/en-us/ifsmolh/valuecontent_user/qdm1743104016620.html | 2026-11-20 |
| Infor CSI | Points by disposition code and qty dispositioned | https://docs.infor.com/csi/9.01.x/en-us/csbiolh/kqs1464806250650.html | 2026-11-20 |
| Odoo add-on | Manual 1-5 star rating per PO (community) | https://apps.odoo.com/apps/modules/19.0/mfx_vendor_performance | 2026-11-20 |

**For us:** adopt (ERPNext quantity form) — rejection % = sum rejected / sum arrived over posted GRN lines in the period; show line-fail count too; QA-bypassed lines excluded and counted separately — because bypass means no QA data; manual stars are out of scope per brief.

### Q5 — Price variance
| Product | What it does | Link | Read on |
|---|---|---|---|
| SAP | Effective price vs stored market price, or vs average of other suppliers' info-record prices; mapped to score, averaged per material | https://learning.sap.com/courses/purchasing-in-sap-s-4hana/setting-up-vendor-evaluation-using-logistics-information-system | 2026-11-20 |
| ERPNext | Docs give no price formula; only a vague "expected vs actual amount" idea | https://docs.frappe.io/erpnext/user/manual/en/supplier-scorecard | 2026-11-20 |
| Odoo | Not in core docs or add-on page | https://apps.odoo.com/apps/modules/19.0/mfx_vendor_performance | 2026-11-20 |
| Infor IFS / CSI | No price measure | https://docs.infor.com/ifsm/2026.x/en-us/ifsmolh/valuecontent_user/qdm1743104016620.html | 2026-11-20 |

**For us:** adapt — per line, (PO rate - reference rate) / reference rate, reference = item standard rate, else previous PO rate with that supplier; value-weighted average in paise terms; report only, not in the weighted score by default — because only SAP scores price, and a rise can be a market move. Compare only same UOM.

### Q6 — Weights and the overall score
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Criteria each have a max score and weight; weights total 100 | https://docs.frappe.io/erpnext/user/manual/en/supplier-scorecard | 2026-11-20 |
| Infor IFS | Three indexes ~33/33/34; High >66.66, Medium 33-66, Low <33 | https://docs.infor.com/ifsm/2026.x/en-us/ifsmolh/valuecontent_user/qdm1743104016620.html | 2026-11-20 |
| SAP | Weighting key per subcriterion, per purchasing org | https://learning.sap.com/courses/purchasing-in-sap-s-4hana/setting-up-vendor-evaluation-using-logistics-information-system | 2026-11-20 |
| Infor CSI | Max 25 points for delivery, deductions by band | https://docs.infor.com/csi/9.01.x/en-us/csbiolh/kqs1464806250650.html | 2026-11-20 |

**For us:** adapt — score 0-100 = 50% on-time + 50% (100 - rejection %), weights editable by owner; price shown beside it — because quality and delivery are what hurts a die-caster; a plant with 10-30 suppliers needs no more.

### Q7 — Period, history and thin data
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Weekly/monthly/yearly periods; weighting function favours recent; standings map score to named bands | https://docs.frappe.io/erpnext/user/manual/en/supplier-scorecard | 2026-11-20 |
| Infor IFS | Rolling 12 months to month before run | https://docs.infor.com/ifsm/2026.x/en-us/ifsmolh/valuecontent_user/qdm1743104016620.html | 2026-11-20 |
| SAP | Smoothing factor blends new score with old | https://learning.sap.com/courses/purchasing-in-sap-s-4hana/setting-up-vendor-evaluation-using-logistics-information-system | 2026-11-20 |
| Odoo (community) | On-time stat capped to the past 365 days | https://apps.odoo.com/apps/modules/19.0/no_vendor_sla | 2026-11-20 |

**For us:** adopt — rolling 12 months, computed live on read (no stored score), with monthly buckets for the trend; show "not enough data" under N lines (N = SME question) — because no snapshots means no stale numbers and no extra writes.

### Q8 — Who sees it, and does it block anything?
| Product | What it does | Link | Read on |
|---|---|---|---|
| ERPNext | Standing can warn or block new RFQ/PO | https://docs.frappe.io/erpnext/user/manual/en/supplier-scorecard | 2026-11-20 |
| Infor CSI | Reporting only; points use rating values in effect at report time | https://docs.infor.com/csi/9.01.x/en-us/csbiolh/kqs1464806250650.html | 2026-11-20 |
| SAP | Report/menu only; scores per purchasing org | https://learning.sap.com/courses/purchasing-in-sap-s-4hana/setting-up-vendor-evaluation-using-logistics-information-system | 2026-11-20 |

**For us:** adapt — read-only view for purchase and owner behind a view permission; no blocking, no auto-action — because the brief asks only for visibility. Products disagree (ERPNext blocks); reporting-only is stricter on scope, less risk of stopping a PO.

## Die-casting specifics
| Topic | What generic ERPs assume | What a die-casting plant needs | Link | Read on |
|---|---|---|---|---|
| Quality unit | Pieces accepted/received | Weight-based items (ingot, alloy) rejected in kg; pieces for castings; never add kg and nos | internal (items use mixed UOM) | 2026-11-20 |
| Heat / batch | Not tracked | Reject rate by heat number would show bad alloy lots; GRN already stores heat no. (later) | n/a | 2026-11-20 |
| Job-work vendors | Same as suppliers | Subcontractor (SCO) return delays and rejects are a separate source; leave out of v1 | n/a | 2026-11-20 |
| Tool/die suppliers | Same lead time | Die and tooling POs are one-off, long lead; skew on-time | n/a | 2026-11-20 |

## Edge cases seen in the products
| Case | What most products do | Products that differ | Link |
|---|---|---|---|
| Over-delivery inflates rate | Count lines, not qty | Odoo counted qty (200% bug) | https://www.odoo.com/forum/help-1/100-on-time-rate-on-vendor-v16-sh-244611 |
| No receipts in period | Choose neutral / 100 / skip | ERPNext tells you to pick | https://docs.frappe.io/erpnext/user/manual/en/supplier-scorecard |
| Reversed receipt | Undo last score effect | SAP does; others recompute | https://learning.sap.com/courses/purchasing-in-sap-s-4hana/setting-up-vendor-evaluation-using-logistics-information-system |
| Open late PO not yet received | Not counted until receipt | SAP service level counts closed POs only | https://help.sap.com/saphelp_snc70/helpdata/EN/9c/dad83705c0c931e10000009b38f842/content.htm |
| Re-dated PO | Uses statistics date, not changed date | SAP | https://learning.sap.com/courses/purchasing-in-sap-s-4hana/setting-up-vendor-evaluation-using-logistics-information-system |
| Rating values changed later | Report uses today's settings, history shifts | Infor CSI | https://docs.infor.com/csi/9.01.x/en-us/csbiolh/kqs1464806250650.html |
| Supplier with 1 receipt | Score swings 0/100 | none handle; add a minimum-data flag | n/a |

## Questions for the factory SME
| # | Question | Options | Why it matters |
|---|---|---|---|
| 1 | Is a delivery late against the first promised date or the revised date? | A first / B revised | Re-dating can hide lateness |
| 2 | How many days late is still "on time"? | 0 / 1 / 2 / 3 | Sets grace days default |
| 3 | Weight of delivery vs quality? | A 50/50 / B 40/60 / C 60/40 | Overall score |
| 4 | Fewest receipts before a score is shown? | 3 / 5 / 10 | Avoids 1-receipt scores |
| 5 | Should a rise vs last price show as bad when the item has no standard rate? | yes / no | Price reference fallback |
| 6 | Should tooling and one-off POs be left out? | yes / no | Skews on-time |

## Follow-ups
(none yet)
