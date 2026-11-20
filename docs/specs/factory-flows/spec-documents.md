---
module: factory-flows
part: documents
status: draft
index: spec.md
---

# Factory flows — Document pages, links, next steps

> Part of `spec.md` (example data and shared rules BR-FF-01..08 are there). Rules BR-FF-40..59.
> Benchmark: ERPNext "Create" menu on the submitted document carrying the source link, Connections
> block with linked documents; Odoo chatter (history) beside the form; SAP approver opens the draft
> (research Q2, Q6, Q9). Frozen PR / PO / GRN / approval rules apply unchanged (BR-FF-05).

## Pages and links
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-FF-40 | Each requisition, order and goods receipt has its own page and URL: `/purchase-requisitions/<prId>`, `/purchase-orders/<poId>`, `/grn/<grnId>`; opening, refreshing or sharing the URL shows that document. | Paste `/purchase-requisitions/3` in a new tab → PR-2026-11-3 page |
| BR-FF-41 | The old PR-keyed page `/purchase-orders/<prId>` is replaced by the PR page; the PO list moves from `/purchase-orders/tracking` to `/purchase-orders`, and `/purchase-orders/tracking` redirects there. | Open `/purchase-orders/tracking` → lands on `/purchase-orders` list |
| BR-FF-42 | Every page lists its linked documents both ways: PR → its POs; PO → its PRs and its GRNs; GRN → its PO and that PO's PRs (BR-GRN-45). Cancelled or closed links stay listed with their status. | PO-2026-11-1 page → "From PR-2026-11-3"; "Receipts: GRN-2026-11-4 · QA pending" |
| BR-FF-43 | Lines show their progress: a PR line shows ordered qty and the PO number it is on; a PO line shows received qty and open qty (ordered − received). | PR line 1: "1000 kg · on PO-2026-11-1"; PO line: ordered 1000, received 600, open 400 kg |

## Next-step buttons
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-FF-44 | The page header offers the next step from this table, only when status and key allow it, as the one primary button; other allowed actions sit beside it as secondary. | PO-2026-11-1 `dispatched`, viewer S (grn.edit_draft) → primary "Receive goods"; viewer Q → no button |
| BR-FF-45 | A button is hidden, not disabled, when the user lacks the key or the status does not allow it; the server still refuses a direct call (frozen rules). | PR `pending_approval` → no "Create PO"; direct `createpo` on its lines → 400 (BR-PO frozen) |

Next step by document and status:
| Document · status | Primary button | Who (key / condition) | Goes to |
|---|---|---|---|
| PR · draft | Submit for approval | requester with `pr.manage` | approval submit (frozen) |
| PR · approved / partial_ordered, ≥ 1 pending line | Create PO | `po.manage` | BR-FF-48 |
| PO · draft | Submit for approval | PO creator with `po.manage` | approval submit (frozen) |
| PO · approved | Send to supplier | `po.manage` | existing send dialog |
| PO · dispatched / partial_received, open qty > 0 | Receive goods | `grn.edit_draft` | receive form (BR-FF-68) |
| GRN · any line QA pending | Inspect | `grn.qa_decide` | first pending line's QA decision |
| any · pending approval, viewer is the current approver | Approve / Reject / Send back | current approver (BR-APR-33) | approval act (frozen) |

## Save and submit, Create PO
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-FF-46 | The new / draft requisition form and the draft order form have "Save and submit" beside "Save draft"; it saves, then submits for approval, then opens the document page. | S fills PR, clicks "Save and submit" → PR-2026-11-3 page, status Pending approval, level 1 of 1 |
| BR-FF-47 | "Save and submit" shows only to the document's creator (only the creator may submit, frozen approval rule); anyone else editing a draft sees "Save draft" only. | Super-admin edits S's draft → no "Save and submit" |
| BR-FF-48 | "Create PO" on an approved requisition makes one draft PO per default supplier, holding all that supplier's pending lines, through the existing create rules, then opens the PO (one made) or the PR page listing the new POs (several made). | PR-2026-11-3: ADC12 → Sri Balaji, die lube → Lube Co → two drafts; PR page shows both links |
| BR-FF-49 | Pending lines with no default supplier are not drafted until the user picks a supplier for them in the Create PO step. | Line 2 has no default supplier → Create PO asks "Supplier for die lube" before saving |
| BR-FF-56 | If saving fails, nothing is submitted and the form stays open with what was typed and the error at the field. | Required-by date yesterday → error on that line, nothing saved |
| BR-FF-57 | If the save works but the submit is refused, the draft stays saved and its page opens with the refusal reason. | No eligible approver → PR-2026-11-3 saved as Draft, message "No one can approve this right now" |
| BR-FF-58 | When several POs are made and one is refused, the others stay made and the message names the supplier that failed and why. | Lube Co inactive → Sri Balaji draft made; message "Lube Co: supplier is inactive" |
| BR-FF-59 | If a line was put on another PO between opening and saving, that supplier's PO is refused with "Already on another order" and the page reloads. | B and O both click Create PO on PR-2026-11-3 → second gets 409 for the same lines |

## Side panel
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-FF-50 | Every PR, PO and GRN page has a side panel with four blocks: Totals, Approvals, Linked documents, History. | PO-2026-11-1 → Totals ₹2,45,000 + GST ₹44,100 = ₹2,89,100 |
| BR-FF-51 | Totals: PR = line count + estimate; PO = subtotal, GST, total, received % by qty; GRN = arrived, accepted, rejected qty per unit (no money). | GRN-2026-11-4 → "Arrived 600 kg · Accepted — · Rejected —" |
| BR-FF-52 | Approvals: the live state (level x of N, who can act now) and the full trail with notes (BR-APR-54); GRN pages have no Approvals block. | PR-2026-11-3 pending → "Level 1 of 1 — back_office" |
| BR-FF-53 | An employee who may read a document's approval request (BR-APR-51) may open that PR / PO page read-only with amounts even without `pr.manage` / `po.manage`; they see only Approve / Reject / Send back when it is their step. | Approver role without `po.manage` opens PO-2026-11-1 from the inbox → page shows; no Edit, Cancel or Send |
| BR-FF-54 | History lists, newest first, events read from existing records — created, approval trail rows, PO log rows (sent, reminder, escalation, confirmation, delay), GRN QA / bypass / correction rows, cancel and close with reason — each with who and when. | PO-2026-11-1 → "Sent by B · 20-11 10:05", "Approved by O · 19-11 17:40", "Created by B · 19-11 16:00" |
| BR-FF-55 | Money in the side panel follows BR-FF-06: a GRN viewer never sees PO amounts in Linked documents. | Q on GRN-2026-11-4 → linked PO shows number and status only |

## Choices made in this part (moved to `assumptions.md`)
Route shape, button table, partial success on multi-supplier Create PO, history from existing
records, approver read access: A-05..A-10.
