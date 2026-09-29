---
module: approval
status: frozen           # draft | frozen | changed-after-freeze
version: 2
frozen_on: 2026-09-29
owner: Arun
depends_on: [auth-setup, purchase-requisition, purchase-order, subcontracting, approval-policies]
---
# Approval — requests, sign-off and document status

> Policy setup and matching live in `approval-policies.md`. Code, gaps and history: `docs/modules/approval.md`.

## Summary

Decides who must sign off a Purchase Request (PR), Purchase Order (PO) or Subcontracting Order (SCO)
and records every sign-off. A clerk submits a draft; the matching policy gives an ordered chain of
approvers; each approver clears their inbox; the document status follows automatically.
Done on the floor = no PR/PO/SCO reaches a supplier without the right signature, and anyone allowed
can see who approved what, when, and why it was rejected. Money is integer paise.

## Who can do what

| Action | Allowed |
|---|---|
| submit a document | its creator only (BR-APR-24) |
| approve / reject / send back | the active employee who matches the current step, requester included (BR-APR-31, 33) |
| withdraw | the requester (BR-APR-39) |
| read a request and its history | `approval.view_all`, the requester, anyone in its chain (BR-APR-51) |
| see another employee's pending list | `approval.view_others_pending` (BR-APR-52) |
| skip the chain on own requests | `approval.auto_approve_own` (seed: owner) (BR-APR-61) |
| operator | nothing (no desk login) |

## Flow

| From | Action | To | Rule |
|---|---|---|---|
| — (doc draft) | submit | pending_approval, level 1 of N | BR-APR-23, 24, 26, 27 |
| — (doc draft) | submit, policy is auto-approve or requester holds `approval.auto_approve_own` | approved | BR-APR-28, 61 |
| pending_approval | approve, not last level | pending_approval, next level | BR-APR-35 |
| pending_approval | approve, last level | approved | BR-APR-35 |
| pending_approval | reject | rejected | BR-APR-37 |
| pending_approval | send back | require_more_info (doc → draft) | BR-APR-37 |
| pending_approval | withdraw | cancelled (doc → draft) | BR-APR-39 |
| pending_approval | document cancelled | cancelled | BR-APR-48 |

approved, rejected, require_more_info and cancelled are final. Resubmitting makes a new request (BR-APR-29).
`partial_ordered`, `fully_ordered`, `auto_approved` exist in the status enum but are never used (BR-APR-50).

Document status after each outcome (BR-APR-42, 43):

| Outcome | PR | PO | SCO |
|---|---|---|---|
| pending | pending_approval | pending_approval | pending_approval |
| approved | approved | approved | approved |
| rejected | rejected | cancelled (via PO cancel) | rejected |
| sent back / withdrawn | draft | draft | draft |
| document cancelled | cancelled | cancelled | cancelled |

## Rules

| ID | Rule | Example (given → then) |
|---|---|---|
| BR-APR-23 | At submit, every role step needs at least one active employee with that role and every specific step an active employee; otherwise 400 `APPROVAL_NO_ELIGIBLE_APPROVER` naming the step and the doc stays draft. Not checked when the request is auto-approved. | step = floor_supervisor, none active → 400, no request, PR still draft |
| BR-APR-24 | Only the document's creator (PR `requestedBy`, PO/SCO `createdBy`) may submit it (403 otherwise), and only from `draft` (409 `APPROVAL_INVALID_SOURCE_STATUS`). | PR made by A, B submits → 403; approved PR submitted → 409 |
| BR-APR-26 | A document has at most one `pending_approval` request; a second submit, including a double-click, gets 409 `APPROVAL_ALREADY_OPEN` and creates nothing. | two submits at once → one request, other call 409 |
| BR-APR-27 | Submit happens in one transaction: request with a copy of the chain, level 1 of N, current approver = step 1; trail `submitted` at level 0; doc → `pending_approval`, level 1 of N. If any step fails, nothing is saved. | 2-step policy → request 1/2, one `submitted` trail, PR 1/2; mirror fails → no request, no trail |
| BR-APR-28 | Auto-approve (policy or BR-APR-61): request is created `approved` with `completedAt`; trails `submitted` + `auto_approved` (actor = requester, note "Auto-approved by policy <name>" or "Auto-approved: own request"); doc → `approved`; `approvedBy` stays empty. | auto policy → trails [submitted, auto_approved], PR approved, approvedBy null |
| BR-APR-29 | Resubmitting after send-back, withdraw or edit creates a new request, matches the policy again on current values, and keeps all old requests and trails. An approved request is never reopened: if the owning module lets an approved doc change amount, category or lines, it must first return the doc to draft. | PR sent back, edited to ₹60,000, resubmitted → new request on the ≥ ₹50k policy; old one still readable |
| BR-APR-30 | Any action needs the request to be `pending_approval`, else 409 `APPROVAL_NOT_PENDING`. Actions on one request run one at a time (row lock); the loser is checked again against the updated request and fails without a trail row. | two users approve a 1-level request at once → one 200, other 409, one `approved` trail |
| BR-APR-31 | Approve, reject and send back need an active actor matching the current step: role step → the actor's role at action time; specific step → that exact employee. Otherwise 403. A role change moves the right to act with it. | step = floor_supervisor, back_office approves → 403; step = employee 5, employee 6 approves → 403 |
| BR-APR-33 | Every request follows its chain. The requester may act on a step they match like any other approver; there is no self-approval block. One employee cannot approve two levels of one request (403 `APPROVAL_ALREADY_ACTED`), and the inbox hides such requests. | back_office B raised PR routed to back_office → B approves → 200; chain [back_office, back_office], B approved L1 → B on L2 → 403 |
| BR-APR-35 | Approve below the last level: level +1, current approver moves to the next step, doc level updates, doc status unchanged. Approve at the last level: request `approved`, `completedAt` set, doc `approved`, `approvedBy` = this approver. | 2-step: L1 approves → PR still pending, 2/2; L2 approves → PR approved, approvedBy = L2 |
| BR-APR-37 | Approve, reject and send back all need a typed comment (400 `APPROVAL_NOTES_REQUIRED`; the inbox asks for it before calling). Reject → request `rejected`. Send back → `require_more_info`, doc → `draft`, editable by its creator. | approve or reject without comment → 400, nothing changes; approve "rate ok" → 200; send back with reason → PR draft |
| BR-APR-39 | Withdraw only by the requester (403 otherwise), reason optional: request → `cancelled`, doc → `draft`, not cancelled. Withdraw is on the document screen, not the inbox. | requester withdraws → PR draft; approver tries withdraw → 403 |
| BR-APR-40 | Every action writes exactly one trail row (level, action, actor, notes, time) in the same transaction as the request and doc update. Trail rows are never edited or deleted; no API does it. | doc update fails → request and trail unchanged |
| BR-APR-42 | PR and SCO status follow the table above; an SCO is never left at `require_more_info`. | SCO sent back → SCO draft |
| BR-APR-43 | A rejected PO is cancelled through the normal PO cancel path (purchase-order BR-PO-07, 11); rejecting or cancelling a PO cancels its linked PR lines, never sends them back to `pending` (purchase-requisition BR-PR-31); the PR header is then recomputed (BR-PR-36: all lines cancelled → PR cancelled). To buy again the requester raises a new PR and gets it approved. | PO-2 rejected → PO cancelled, PR-1 line L1 cancelled; PR-1 had only L1 → PR-1 cancelled |
| BR-APR-45 | Doc level fields always show the latest request; `approvedBy` is set only by the last-level approve and cleared by any other outcome. | PR approved, later sent back on a new request → approvedBy empty |
| BR-APR-46 | Only this module writes `pending_approval`, `approved`, `rejected` on PR/PO/SCO; the owning module's update endpoints reject those values (400). | `PATCH /pr/updatepr` with status approved → 400 |
| BR-APR-47 | While a request is pending, the doc's header and lines cannot be edited and edit buttons are hidden: a PR answers 409 `PR_NOT_EDITABLE` (purchase-requisition BR-PR-15), a PO or SCO 409 `DOC_LOCKED_IN_APPROVAL`; to change it the requester withdraws, edits the draft and resubmits. | pending PR, amount changed → 409 `PR_NOT_EDITABLE`; pending PO, rate changed → 409 `DOC_LOCKED_IN_APPROVAL` |
| BR-APR-48 | Cancelling a doc with an open request cancels the request in the same transaction; trail `cancelled`, actor = who cancelled the doc, cancel reason in notes. If the doc cancel fails, the request stays pending. | U cancels pending PO "wrong supplier" → request cancelled, trail actor U with that note |
| BR-APR-50 | Requests only ever get `pending_approval`, `approved`, `rejected`, `require_more_info`, `cancelled`; `partial_ordered`, `fully_ordered`, `auto_approved` are never written. | any sequence → none of the three unused values |
| BR-APR-51 | A request (details, trail, current request of a doc) is readable by holders of `approval.view_all`, the requester, and any active employee who is an approver anywhere in its chain; others 403. | chain [floor_supervisor, owner]: qa_inspector → 403, floor_supervisor → 200 |
| BR-APR-52 | "My pending approvals" lists pending requests whose current step is my role or me (doc number, amount, requester, level x of N). Only holders of `approval.view_others_pending` may view another employee's list (others 403); an inactive target is 404. | back_office passes another employeeId → 403; super-admin → 200 |
| BR-APR-54 | A doc's approval history is all its requests newest first, each with its trail oldest first, readable per BR-APR-51. PR/PO/SCO detail shows the live state (level x of N, who can act now) and this history. | PR pending 2 of 2 → "Level 2 of 2 — owner" plus history; sent-back + approved requests both listed |
| BR-APR-61 | A request raised by a holder of `approval.auto_approve_own` (seed: owner) is auto-approved at submit, whatever policy matches (BR-APR-28). Anyone else's request skips the chain only when its matched policy is auto-approve (approval-policies BR-APR-05). | owner submits ₹5L PO → approved at once; back_office submits same PO → owner step pending |

## Not now

- Stand-in approvers when someone is away, auto-escalation after N hours, WhatsApp/email alerts.
- Parallel approval ("any 2 of 3"); rules by department or supplier.
- Owner approving any step on someone's behalf. Until then a stuck request (no one holds the role) is
  handled by: requester withdraws, super-admin fixes the policy or role, requester resubmits.
- Pending-approvals ageing report by approver role.
- Approval of GRN, invoices, debit notes, sale orders.

## Questions for you

None open.

## Changelog

- 2026-09-27 v0 — draft created retroactively from as-built code; pulls in BL-002, BL-022, BL-023.
- 2026-09-28 — rewritten in slim format; split out `approval-policies.md`; merged 25→24, 49→29, 41→30, 32→31, 34+53→33, 36→35, 38+64→37, 55→40, 44→42, 65→54; old Q-4, Q-9, Q-10 now assumed.
- 2026-09-29 — answers folded in. Q2=A, Q3=A firm (BR-APR-37, 39, 47). Q1 → new BR-APR-61 (owner's own request auto-approved), owner self-approve exception dropped from BR-APR-33; Q1a/Q1b ask what was unclear. Q4 conflicts with PR spec, kept open. New Q8, Q9. Read and inbox rights now use `approval.view_all` / `approval.view_others_pending`.
- 2026-09-29 — consistency pass: BR-APR-37 comment required on approve too (known-defects Q3; Q8 removed). BR-APR-61 uses `approval.auto_approve_own` (Q9 removed). BR-APR-43 default until Q4. Q4 reworded with the consequence.
- 2026-09-29 — final answers folded. Q1a=B: no self-approval block, requester may act on a step they match (BR-APR-33). Q1b: owner's own requests auto-approved and auto-approve policies kept (BR-APR-61, policies BR-APR-05). Q4=B: rejected PO cancels its PR lines (BR-APR-43). Tables compacted.
- 2026-09-29 — pre-freeze touch-up: BR-APR-43 cites BR-PO-07/11 and BR-PR-31/36 (Q4=B, reject or cancel). BR-APR-47 uses `PR_NOT_EDITABLE` for PRs. "(assumed)" dropped from BR-APR-24 and the stuck-request line.
- 2026-09-29 — frozen v1 (all questions answered by Arun)
- 2026-09-29 — v2 clarified during build (review): actions are only approve, reject, send back and withdraw — there is no approval `cancel` action; a document is cancelled only through its own module's cancel (BR-APR-48). Submit (BR-APR-24) also needs the document type's key (`pr.manage` for PRs, `po.manage` for POs). Error codes used: `APPROVAL_ALREADY_OPEN` (BR-APR-26), `APPROVAL_NOTES_REQUIRED` (BR-APR-37), `APPROVAL_NOT_REQUESTER` (BR-APR-39), `APPROVAL_ALREADY_ACTED` (BR-APR-33), `APPROVAL_NO_ELIGIBLE_APPROVER` (BR-APR-23). `isSaleOrderLinked` is not returned by the policy API (BR-APR-15).
