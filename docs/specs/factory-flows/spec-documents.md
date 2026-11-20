---
module: factory-flows
part: documents
status: draft
index: spec.md
---

# Factory flows — Document pages, links, next steps

> Part of `spec.md` (example data and shared rules BR-FF-01..09 are there). Rules BR-FF-40..59, 90..94.
> Benchmark: ERPNext "Create" menu on the submitted document carrying the source link, Connections
> block with linked documents; Odoo chatter (history) beside the form; SAP approver opens the draft
> (research Q2, Q6, Q9). Frozen PR / PO / GRN / approval rules apply unchanged (BR-FF-05).

## Pages and links
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-FF-40 | Each requisition, order and goods receipt has its own page and URL: `/purchase-requisitions/<prId>`, `/purchase-orders/<poId>`, `/grn/<grnId>`; opening, refreshing or sharing the URL shows that document. | Paste `/purchase-requisitions/3` in a new tab → PR-2026-11-3 page |
| BR-FF-41 | The old PR-keyed page `/purchase-orders/<prId>` is replaced by the PR page; the PO list moves from `/purchase-orders/tracking` to `/purchase-orders`, and `/purchase-orders/tracking` redirects there. | Open `/purchase-orders/tracking` → lands on `/purchase-orders` list |
| BR-FF-42 | Every page lists its linked documents both ways: PR → its POs; PO → its PRs and its GRNs; GRN → its PO and that PO's PRs (BR-GRN-45). Cancelled or closed links stay listed with their status. | PO-2026-11-1 page → "From PR-2026-11-3"; "Receipts: GRN-2026-11-4 · QA pending" |
| BR-FF-43 | Lines show their progress: a PR line shows ordered qty and the PO number it is on; a PO line shows accepted (received) qty, qty awaiting QA and open qty (BR-FF-09). | PR line 1: "1000 kg · on PO-2026-11-1"; PO line: ordered 1000, received 0, awaiting QA 600, open 400 kg |

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
| GRN · any line QA pending | Inspect (each pending line also has its own Inspect) | `grn.qa_decide` | first pending line's QA decision |
| any · pending approval, viewer is the current approver | Approve / Reject / Send back | current approver (BR-APR-33) | approval act (frozen) |

## Save and submit, Create PO
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-FF-46 | The new / draft requisition form and the draft order form have "Save and submit" beside "Save draft"; it saves, then submits for approval, then opens the document page. | S fills PR, clicks "Save and submit" → PR-2026-11-3 page, status Pending approval, level 1 of 1 |
| BR-FF-47 | "Save and submit" shows only to the document's creator (only the creator may submit, frozen approval rule); anyone else editing a draft sees "Save draft" only. | Super-admin edits S's draft → no "Save and submit" |
| BR-FF-48 | "Create PO" on an approved requisition makes one draft PO per default supplier, holding all that supplier's pending lines, through the existing create rules, then opens the PO (one made) or the PR page listing the new POs (several made); the drafts are never submitted or sent by themselves (owner card 1 = A). | PR-2026-11-3: ADC12 → Sri Balaji, die lube → Lube Co → two drafts, both status Draft; PR page shows both links; nothing reaches either supplier |
| BR-FF-49 | Pending lines with no default supplier (BR-FF-91) are not drafted until the user picks a supplier for them in one Create PO dialog; no PO is made before the dialog is confirmed, and closing it makes none. | Line 2 has no default supplier → dialog "Supplier for die lube"; user picks Lube Co → two drafts; user closes the dialog → no PO made |
| BR-FF-91 | A PR line's default supplier is the supplier of the newest PO (by created time; same time → higher PO id) that holds the same item, is not cancelled and whose supplier is still active; no such PO → no default. | ADC12 on PO-2026-10-4 (Sri Balaji) and PO-2026-11-1 (Sri Balaji, newer) → Sri Balaji; die lube only on a cancelled PO → no default, goes to the dialog |
| BR-FF-92 | A line whose suggested rate (frozen BR-PO-03 / BR-PO-25) is missing or 0 goes to the same Create PO dialog, which asks its rate (whole rupees and paise, ≥ ₹0.01) before any PO is created; confirming with an empty rate is refused at the field. | Die lube has no past PO, no price list, standard rate 0 → dialog "Rate for die lube (per L)"; empty → "Enter a rate"; ₹300 → draft line rate 30,000 paise |
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
| BR-FF-53 | Approval read rule: a caller without the document key (`pr.manage` / `po.manage` / `sco.view`) may read a PR / PO page or a PR / PO / SCO preview read-only, with amounts, only when the latest approval request of that document is `pending_approval`, the caller is an active employee, and the caller is on the current step (by role or as the named employee) or has a trail row on this same request; `approval.view_all` holders are not limited by the pending check (frozen BR-APR-51). Otherwise BR-FF-04's access message. They see only Approve / Reject / Send back, and only on their step. | PO-2026-11-1 pending at level 1 (back_office), approver role without `po.manage` → page read-only, no Edit, Cancel or Send. Level-2 approver (owner step, not yet current) → access message. Level-1 approver after approving (trail row on this request, level 2 now current) → still reads. After final approval → access message. Earlier sent-back request's approver, not on the new request → access message. Deactivated approver → access message |
| BR-FF-93 | A requester who lacks the document key may read their own PR / PO / SCO through the approval read path only while its latest request is pending; once decided, sent back or withdrawn, the access message. | Requester with `pr.manage` → always reads PR-2026-11-3 (key). Requester of an SCO without `sco.view` → reads its preview while pending; after rejection → access message |
| BR-FF-94 | A caller reading through the approval read rule gets the side-panel blocks Totals, Approvals, Linked documents (number and status only, BR-FF-03) and History; in PO History supplier-communication events (sent, reminder, escalation, confirmation) show by name, who and when, never their note text. | Approver without `po.manage` → History "Reminder by B · 21-11 11:00", no message text; B (`po.manage`) → same row with its note |
| BR-FF-54 | History lists, newest first, events read from existing records — created, approval trail rows, PO log rows (sent, reminder, escalation, confirmation), GRN QA / bypass / correction rows, cancel and close with reason — each with who and when. At most the newest 200 events show; when more exist, a line "Older events hidden" closes the list. The PO's current delay (only revised date and reason are stored) is shown pinned above the dated events, with no name or time. | PO-2026-11-1 → "Delayed to 28-11 — furnace breakdown at supplier", then "Sent by B · 20-11 10:05", "Approved by O · 19-11 17:40", "Created by B · 19-11 16:00"; a PO with 230 events → 200 shown + "Older events hidden" |
| BR-FF-55 | Money in the side panel follows BR-FF-06: a GRN viewer never sees PO amounts in Linked documents. | Q on GRN-2026-11-4 → linked PO shows number and status only |
| BR-FF-90 | A draft whose last approval request was sent back shows the approver's note in a warning strip above the lines, until it is submitted again. | S opens sent-back PR-2026-11-3 → "Sent back by B: split die lube to next month"; S resubmits → strip gone |

## Choices made in this part (moved to `assumptions.md`)
Route shape, button table, partial success on multi-supplier Create PO, history from existing
records, approver read access: A-05..A-10. Delay history A-24, sent-back strip A-31, per-line Inspect A-32.
Default supplier A-55, rate dialog A-56, read check A-59, `approval.view_all` A-61, panel limits A-63,
history cap A-67.
