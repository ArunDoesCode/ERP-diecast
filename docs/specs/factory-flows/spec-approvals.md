---
module: factory-flows
part: approvals
status: draft
index: spec.md
---

# Factory flows — Approvals inbox with preview

> Part of `spec.md` (example data and shared rules BR-FF-01..08 are there). Rules BR-FF-80..89.
> Benchmark: SAP B1 approver drills from the alert into the draft document; sender has a status report
> (research Q6). Frozen approval rules stay: notes required (BR-APR-37), no self-approval block but one
> person cannot approve two levels (BR-APR-33), read rule (BR-APR-51), inbox content (BR-APR-52).

| ID | Rule | Example (given → then) |
|---|---|---|
| BR-FF-80 | The inbox lists my pending requests (BR-APR-52) with columns: document number, type (Requisition / Order / Job work), requester, amount, level x of N, waiting since; oldest first. | B's inbox → "PR-2026-11-3 · Requisition · S · ₹2,51,000 · 1 of 1 · since 20-11 09:12" |
| BR-FF-81 | Clicking a row opens a preview beside the list (below 1100 px: as its own page with Back) with the document header, every line (item, qty, unit, rate, amount — never cut short), tax, total, requester's notes and the approval trail, plus "Open full page"; Approve / Reject / Send back appear only once all of it has loaded. | Click PR-2026-11-3 → preview shows ADC12 1000 kg ₹2,45,000 and die lube 20 L ₹6,000, total ₹2,51,000; lines fail to load → error in the pane, no act buttons |
| BR-FF-82 | Approve, Reject and Send back can be done from the preview; each needs the typed note (frozen BR-APR-37) — an empty note shows the error at the box and nothing is sent; after acting, the next row's preview opens. | B approves PR-2026-11-3 with note "ok" → row leaves the list, next row previewed; Approve with empty note → "Note is required", still pending |
| BR-FF-83 | The preview and "Open full page" follow the approver read access (BR-FF-53): read-only, amounts shown, no edit or cancel, only while the request is pending. | Approver without `pr.manage` opens full page → read-only PR page |
| BR-FF-84 | If the request is no longer pending when acting (withdrawn, decided by someone else), the user sees "This request was already handled" and the row leaves the list. | S withdraws PR-2026-11-3 while B reads it → B clicks Approve → message, row gone |
| BR-FF-85 | The Approvals menu entry shows the same count as the Home tile "Waiting for my approval"; hidden at 0, "99+" above 99. | 3 pending on B → menu "Approvals 3"; 0 → no badge; 120 → "99+" |
| BR-FF-86 | An empty inbox says "Nothing is waiting for your approval". | B has no pending → that text, no table |
| BR-FF-87 | Rejecting from the preview states the document effect in the confirm step, as the frozen rules decide it. | Reject a PO → confirm says "The order will be cancelled and its requisition lines cancelled" (BR-APR-43) |
| BR-FF-88 | Job-work orders in the inbox preview the same way, with their own lines and total. | SCO pending on O → preview shows its lines and amount incl. GST |
| BR-FF-89 | A user holding `approval.view_others_pending` keeps the existing "other employee" view; preview and acting stay limited to the frozen rules (only the current approver acts). | Super-admin views B's list → sees rows; Approve on B's step only if super-admin's own step matches |

## Choices made in this part (moved to `assumptions.md`)
Preview beside the list, act from preview, badge cap 99+: A-14..A-15. Pattern exception A-27, note
from the preview A-30, narrow screens A-38.
