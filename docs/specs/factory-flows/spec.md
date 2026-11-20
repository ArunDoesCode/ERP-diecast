---
module: factory-flows
status: draft            # draft | frozen (set only by /freeze; change requests keep it frozen)
version: 0
frozen_on:
owner: Arun
depends_on: [design-system (v2, PR #111), purchase-requisition, purchase-order, grn, approval, auth-setup, subcontracting, inventory]
brief: docs/briefs/factory-flows.md
research: docs/research/factory-flows.md
parts: [spec-home.md, spec-documents.md, spec-receiving.md, spec-approvals.md, spec-layout.md]
---

# Factory flows — index

> Agent layer. The owner reads `OWNER.md`, not this file. Split by sub-module (whole spec > 400 lines).
> This file = summary, roles, flow, shared rules, security, scope. Sub-module rules live in the part files;
> BR ids `BR-FF-NN` are unique across all parts. Tables / endpoints / screens: `design/`.
> Visual standard is design-system v2 (graphite + indigo, 14 px, 36 px controls, 44/36 px rows,
> label-above fields, incl. BR-DS-28, BR-DS-29). This spec never restates or reopens those rules.

## Summary
Each person opens the app on a Home page that counts the work waiting for them; one click opens that
work already filtered. Requisitions (PR), orders (PO) and goods receipts (GRN) get their own pages with a
side panel (totals, approvals, linked documents, history) and offer the next step from the header.
Store keepers receive goods from the goods-receipt screen; approvers preview a document before deciding.
Lists show more rows and a summary strip; create / edit forms are full pages.
No stock, money or status rule changes: every action reuses the frozen procurement endpoints.
Example data used in every part:
- **PR-2026-11-3** raised by store keeper **S** (`floor_supervisor`): line 1 ADC12 ingot 1000 kg,
  line 2 die lube 20 L. Estimate ₹2,45,000 + ₹6,000 = ₹2,51,000.
- **PO-2026-11-1** by purchase officer **B** (`back_office`) to Sri Balaji Metals: ADC12 1000 kg at
  ₹245/kg (24,500 paise), GST 18 %, total ₹2,89,100; expected 2026-11-25.
- **GRN-2026-11-4**: 600 kg ADC12 arrived on PO-2026-11-1, challan CH-11. QA inspector **Q**
  (`qa_inspector`). Plant head **O** (`owner`). Today in examples = 2026-11-20 (IST).

## Parts
| Part | File | Covers | BR range |
|---|---|---|---|
| Home | `spec-home.md` | Role home, work-queue tiles, counts | BR-FF-10..34 |
| Documents | `spec-documents.md` | PR / PO / GRN pages, links both ways, next-step buttons, side panel, Save and submit, Create PO | BR-FF-40..59, 90..94 |
| Receiving | `spec-receiving.md` | "Receive goods" from the goods-receipt screen, PO picker, receive form | BR-FF-60..73 |
| Approvals | `spec-approvals.md` | Inbox columns, preview, act from preview, menu count | BR-FF-77..89 |
| Layout | `spec-layout.md` | Menu order, page layout, lists, summary strip, full-page forms | BR-FF-100..115 |

## Who can do what
No new permission keys. Every tile, button and page is gated by an existing key (`backend/src/lib/permissions.ts`).
| Action | Key | Seed roles |
|---|---|---|
| open Home, Approvals inbox | any signed-in | all |
| see PR tiles, PR pages, Save and submit a PR | `pr.manage` | ow, bo, fs |
| see PO tiles, PO pages, Create PO, send | `po.manage` | ow, bo |
| Receive goods, PO picker (no prices), Goods expected tile | `grn.edit_draft` | ow, bo, fs |
| Receipts to inspect tile, Inspect button | `grn.qa_decide` | ow, bo, qa |
| open GRN pages and list | `grn.view` | ow, bo, fs, qa, dd |
| read a PR / PO page or a PR / PO / SCO preview while its approval is pending (read-only, with amounts) | approval read rule BR-FF-53 (current step, own trail row on this request, or requester BR-FF-93); `approval.view_all` any time | per document, no seed role by itself |
| Job-work due tile; SCO amounts (frozen `getscodetails`) | `sco.view` | ow, bo, fs, qa |
| Stock below reorder tile | `inventory.view` | ow, bo, fs |
| set menu labels / order later | `setup.roles.manage` (Setup → Screens) | super-admin |

## Flow
Document flow with the next step each page offers (full table: `spec-documents.md` BR-FF-44).
| From | Action (button on the page) | To | Rule |
|---|---|---|---|
| — | New requisition → Save and submit | PR pending approval (or approved if auto) | BR-FF-46 |
| PR pending approval | approver acts from inbox preview | PR approved / draft (sent back) / rejected | BR-FF-82 |
| PR approved / partly ordered | Create PO | one draft PO per supplier, never submitted or sent by itself | BR-FF-48 |
| PO draft | Submit for approval | PO pending approval / approved | BR-FF-44 |
| PO approved | Send to supplier | PO dispatched | BR-FF-44 |
| PO dispatched / partly received | Receive goods (GRN screen or PO page) | new GRN page | BR-FF-60, 68 |
| GRN with pending lines | Inspect | QA decision (existing GRN rules) | BR-FF-44 |

## Shared rules (apply to every part)
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-FF-01 | Every tile, count, menu entry, link and button is shown only when the user holds its key from "Who can do what"; role names are never checked. | QA inspector Q (no `po.manage`) → no PO tiles, no "Create PO" button, `GET` of a PO endpoint → 403 |
| BR-FF-02 | Any number shown (tile count, menu badge, summary-strip count) equals the number of rows the list shows when that number is clicked. | Tile "Requisitions to order 4" → click → list shows exactly 4 rows |
| BR-FF-03 | A link to a document the viewer may not open is shown as plain text (number + status), not as a link. | Q opens GRN-2026-11-4; side panel shows "PO-2026-11-1 · Partly received" as text, no link |
| BR-FF-04 | Opening a document URL without access shows "You do not have access to this document" and none of its data; an id that does not exist shows "Document not found" with a link back to its list. | Q opens `/purchase-orders/1` → access message, no supplier or amount in the response; `/purchase-orders/999999` → not found |
| BR-FF-05 | Nothing in this feature posts stock, changes money or moves a status except through the existing frozen endpoints with their rules; every new endpoint is read-only. | "Save and submit" = existing create + existing submit; no new write route in `design/api.md` |
| BR-FF-06 | Rates, amounts and totals are shown only to holders of `pr.manage` (PR), `po.manage` (PO), `sco.view` (SCO, as the frozen `getscodetails` already returns them), or a caller who passes the approval read rule (BR-FF-53, BR-FF-93); everyone else never gets them from any endpoint. | S (fs) opens the PO picker → item, qty, dates; response has no rate or total fields; die designer (no `sco.view`) previews nothing of an SCO unless BR-FF-53 lets them |
| BR-FF-07 | After any action, the document on screen, the list behind it, the Home counts and the menu badge show the new state without a manual reload. | B approves PR-2026-11-3 from the inbox → badge 3 → 2, Home tile "Waiting for my approval" 3 → 2 |
| BR-FF-08 | "Today", "late" and due dates use the plant's calendar day in IST. | Due 2026-11-20, time 23:50 IST → "Today", not late |
| BR-FF-09 | Open quantity of a PO line = ordered − accepted (the line's received qty, frozen BR-GRN-27) − arrived on GRN lines that still exist and are pending QA; rejected goods and lines of a deleted draft GRN count as open again. It is used for display and receiving only (open-qty columns, Goods expected tile, receive picker, receive form, over-receipt warning); "Late" is never computed from it (BR-FF-26). | PO-2026-11-1 1000 kg, GRN-2026-11-4 600 kg pending QA → open 400; Q rejects the 600 → open 1000; Q accepts → open 400; GRN-2026-11-4 still draft and deleted → open 1000 |

## Security
Sensitive data:
| Data | Who may see it | Who may change it |
|---|---|---|
| PR estimate, PO rates / GST / totals | `pr.manage` / `po.manage` holders; callers passing BR-FF-53 / 93 (read-only, only while pending) | unchanged (frozen PR / PO rules) |
| SCO rates / GST / totals | `sco.view` holders (frozen `getscodetails`, unchanged); in the new document view only callers passing BR-FF-53 / 93 or holding `sco.view`; otherwise hidden | unchanged (frozen SCO rules) |
| Amount on an inbox row | the caller, on their own list only; never on another employee's list (BR-FF-77, BR-FF-89) | — |
| PO supplier-communication notes | `po.manage` holders; approval-path readers see the event name only (BR-FF-94) | unchanged |
| PO lines for receiving (item, ordered / received / open qty, due date) | `grn.edit_draft` holders | — (read-only) |
| Other people's pending approvals | `approval.view_others_pending` only (BR-APR-52) | — |

Abuse cases:
| Who | Tries to | Stopped by |
|---|---|---|
| store keeper (fs) | read PO prices through the receive picker or its endpoint | BR-FF-06, BR-FF-62 |
| QA inspector | open a PO page by typing its URL | BR-FF-04 |
| approver after deciding | keep editing the PR through the preview | BR-FF-53 (read-only), frozen PR edit rules |
| approver without `pr.manage` / `po.manage` | keep reading prices of a PR / PO after its approval is decided, by URL or the read endpoints | BR-FF-53 (only while pending), BR-FF-04 |
| level-2 approver, or anyone else in the chain | read a document before it reaches their step | BR-FF-53 (current step or own trail row on this request only) |
| requester without the document key | read their own PR / PO / SCO after it is decided | BR-FF-93 (only while pending) |
| approval-path reader | read supplier messages on the PO or other docs' amounts in the panel | BR-FF-94 |
| admin viewing another employee's inbox | read amounts through that list | BR-FF-77 (no amount on another employee's list) |
| any user | preview a row they may not read | BR-FF-78 |
| approver | approve a document without the lines or totals on screen | BR-FF-81 (act buttons only after every line and the total are shown) |
| approver | approve without a note from the preview | BR-FF-82, frozen BR-APR-37 |
| QA inspector / store keeper | read PO amounts through a GRN side panel or linked-document block | BR-FF-55, BR-FF-06 |
| any user | get counts for queues they have no key for by calling the counts endpoint | BR-FF-11 |
| any user | call a hidden action (Create PO, Inspect, Receive) directly | BR-FF-45 (server refuses under frozen rules) |
| requester | Save and submit someone else's draft | BR-FF-47 |
| purchase officer | have Create PO send orders to suppliers without review | BR-FF-48 (drafts only, each sent by hand) |

Audit: no new audit rows. Every action that writes already writes its trail under the frozen specs
(approval trail, PO log, GRN QA rows, cancel fields).

## Edge cases
Full list: `design/edge-cases.md`. Every row there names a rule in this file or a part file.
| Source | Count |
|---|---|
| benchmark | 20 |
| owner | 3 |
| invariant | 31 |
| designer | 16 |
| total | 70 |

## Not now
- Notifications, global search by document number (brief: later round).
- A full SCO page (SCO is only previewed in the inbox, BR-FF-88).
- BOM, sale order, production; die shot counts; ingot chemistry / heat checks at receipt.
- Over-receipt tolerance changes, close / short-close / return rules, "keep open or close balance"
  question at a short receipt (frozen PO / GRN rules stay as they are).
- "Will go to: <role>" preview of the approval route before submitting.
- Substitute / deputy approvers when an approver is away.
- Per-user custom Home layout, saved list views, column chooser.
- A new document history table (history is read from existing records, BR-FF-50).

## Open questions
Must be empty at freeze.
| # | Question | Goes to |
|---|---|---|

## Owner answers (pre-approved)
The owner pre-approved the recommended option of every card in chat on 2026-11-20: "automate that sessions
take ur own decision and record them and run whatever parallel subagents u want ... ill do a complete merge
in moring once completed" and "make sure u reasearch other erp's and take decision and build".
| Card | Answer | Folded into | Benchmark |
|---|---|---|---|
| 1 Create PO with two suppliers | A — one draft PO per supplier, drafts only, never auto-sent | BR-FF-48 | ERPNext splits one request over several POs (https://docs.frappe.io/erpnext/user/manual/en/material-request); Odoo one RFQ per vendor (https://www.odoo.com/documentation/master/applications/inventory_and_mrp/purchase/manage_deals/calls_for_tenders.html) |
| 2 Arrived box at receipt | A — empty + "Fill open quantity" | BR-FF-64 | stricter than SAP Copy To / ERPNext Create Receipt pre-fill (https://learning.sap.com/courses/managing-logistics-in-sap-business-one/solving-issues-in-purchasing) |
| 3 Plant head's first tile | A — Waiting for my approval | BR-FF-13 | SAP puts pending approvals first (https://help.sap.com/saphelp_sbo92/helpdata/en/45/06da03d8696c30e10000000a114a6b/content.htm) |

## Changelog
- 2026-11-20 v0 — draft (pass 1): index + five parts.
- 2026-11-20 v0 — pass 2: cards 1–3 = A (pre-approved); BR-FF-09 open quantity (designer Q1); approver
  read only while pending (BR-FF-53); preview shows every line before acting (BR-FF-81); delay history
  (BR-FF-54); below reorder = existing flag (BR-FF-30); menu groups (BR-FF-100); v2 exceptions
  (BR-FF-113); sent-back note (BR-FF-90); edge cases and assumptions written.
- 2026-11-20 v0 — pre-freeze round 1: "Late" stays frozen BR-PO-19, BR-FF-09 display only (BR-FF-26, 09);
  default supplier BR-FF-91; rate dialog BR-FF-92; one approval read rule BR-FF-53 + requester BR-FF-93 +
  panel limits BR-FF-94; inbox amounts BR-FF-77, unreadable preview BR-FF-78, inbox strip BR-FF-79; SCO in
  BR-FF-06, 83, 87; tile needs both keys BR-FF-34; menu migration guard BR-FF-101; lines max 500 and history
  cap BR-FF-104, 54; strip-group table BR-FF-109; QA status BR-FF-115; 40 px shop-floor size BR-FF-114;
  BR-FF-113 cites the v2 text. Edge cases E-56..E-70; assumptions A-54..A-82.
