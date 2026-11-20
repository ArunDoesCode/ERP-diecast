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
| Home | `spec-home.md` | Role home, work-queue tiles, counts | BR-FF-10..33 |
| Documents | `spec-documents.md` | PR / PO / GRN pages, links both ways, next-step buttons, side panel, Save and submit, Create PO | BR-FF-40..59 |
| Receiving | `spec-receiving.md` | "Receive goods" from the goods-receipt screen, PO picker, receive form | BR-FF-60..73 |
| Approvals | `spec-approvals.md` | Inbox columns, preview, act from preview, menu count | BR-FF-80..89 |
| Layout | `spec-layout.md` | Menu order, page layout, lists, summary strip, full-page forms | BR-FF-100..112 |

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
| read a PR / PO page while in its approval chain (read-only, with amounts) | approval read rule (BR-APR-51) | any approver in the chain, `approval.view_all` |
| Job-work due tile | `sco.view` | ow, bo, fs, qa |
| Stock below reorder tile | `inventory.view` | ow, bo, fs |
| set menu labels / order later | `setup.roles.manage` (Setup → Screens) | super-admin |

## Flow
Document flow with the next step each page offers (full table: `spec-documents.md` BR-FF-44).
| From | Action (button on the page) | To | Rule |
|---|---|---|---|
| — | New requisition → Save and submit | PR pending approval (or approved if auto) | BR-FF-46 |
| PR pending approval | approver acts from inbox preview | PR approved / draft (sent back) / rejected | BR-FF-82 |
| PR approved / partly ordered | Create PO | draft PO(s) per supplier | BR-FF-48 |
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
| BR-FF-06 | Rates, amounts and totals are shown only to holders of `pr.manage` (PR), `po.manage` (PO), or an approver who may read the request (BR-FF-53); receive-only and QA-only users never get them from any endpoint. | S (fs) opens the PO picker → item, qty, dates; response has no rate or total fields |
| BR-FF-07 | After any action, the document on screen, the list behind it, the Home counts and the menu badge show the new state without a manual reload. | B approves PR-2026-11-3 from the inbox → badge 3 → 2, Home tile "Waiting for my approval" 3 → 2 |
| BR-FF-08 | "Today", "late" and due dates use the plant's calendar day in IST. | Due 2026-11-20, time 23:50 IST → "Today", not late |

## Security
Sensitive data:
| Data | Who may see it | Who may change it |
|---|---|---|
| PR estimate, PO rates / GST / totals | `pr.manage` / `po.manage` holders, approvers in the chain (read-only) | unchanged (frozen PR / PO rules) |
| PO lines for receiving (item, ordered / received / open qty, due date) | `grn.edit_draft` holders | — (read-only) |
| Other people's pending approvals | `approval.view_others_pending` only (BR-APR-52) | — |

Abuse cases:
| Who | Tries to | Stopped by |
|---|---|---|
| store keeper (fs) | read PO prices through the receive picker or its endpoint | BR-FF-06, BR-FF-62 |
| QA inspector | open a PO page by typing its URL | BR-FF-04 |
| approver after deciding | keep editing the PR through the preview | BR-FF-53 (read-only), frozen PR edit rules |
| any user | get counts for queues they have no key for by calling the counts endpoint | BR-FF-11 |
| requester | Save and submit someone else's draft | BR-FF-47 |

Audit: no new audit rows. Every action that writes already writes its trail under the frozen specs
(approval trail, PO log, GRN QA rows, cancel fields).

## Edge cases
Full list: `design/edge-cases.md` (written in pass 2). Every row there names a rule in a part file.
| Source | Count |
|---|---|
| benchmark | pass 2 |
| owner | pass 2 |
| invariant | pass 2 |

## Not now
- Notifications, global search by document number (brief: later round).
- BOM, sale order, production; die shot counts; ingot chemistry / heat checks at receipt.
- Over-receipt tolerance changes, close / short-close / return rules, "keep open or close balance"
  question at a short receipt (frozen PO / GRN rules stay as they are).
- "Will go to: <role>" preview of the approval route before submitting.
- Substitute / deputy approvers when an approver is away.
- Per-user custom Home layout, saved list views, column chooser.
- A new document history table (history is read from existing records, BR-FF-50).

## Open questions
Must be empty at freeze. Owner questions are returned to the coordinator; the draft uses the
recommended option.
| # | Question | Goes to |
|---|---|---|
| 1 | Requisition with lines for two suppliers: what does "Create PO" make? (draft: one draft PO per supplier, BR-FF-48) | owner card |
| 2 | Receive form: arrived quantity box empty or pre-filled with the open quantity? (draft: empty + "Fill open quantity" button, BR-FF-64) | owner card |
| 3 | What does the plant head see first on Home? (draft: Waiting for my approval, BR-FF-13) | owner card |

## Changelog
- 2026-11-20 v0 — draft (pass 1): index + five parts.
