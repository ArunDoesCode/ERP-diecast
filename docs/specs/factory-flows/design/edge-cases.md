# Factory flows — edge cases

> Written by spec-analyst (pass 2) from `docs/research/factory-flows.md` → "Edge cases seen in the products"
> and "Decision benchmarks", the owner's card answers (pre-approved 2026-11-20) and the designers' files /
> questions. Every row names a rule. Tests are named by rule id, so the rule id is also the test id.
> The owner sees only the count.

Source: **benchmark** (what ERPNext / Odoo / SAP do) · **owner** (an answered card) ·
**invariant** (money in paise, stock only through the ledger, permission + audit on state changes) ·
**designer** (question from solution- / ui-ux-designer or a pre-freeze reviewer, decided by benchmark or an existing rule).

| # | Case | What the system does | Source | Rule |
|---|---|---|---|---|
| E-01 | Receive more than ordered | Receive form warns, counting earlier receipts incl. pending QA; save allowed; frozen 5 % cap at QA decides | benchmark (ERPNext caps, SAP allows; stricter cap kept in frozen GRN) | BR-FF-66 |
| E-02 | Short delivery, rest never comes | PO stays open with its open qty in "Goods expected"; balance closed only by the existing PO close | benchmark (ERPNext / SAP close on purpose) | BR-FF-27 |
| E-03 | Requisition partly ordered, rest no longer needed | Lines cancelled under frozen PR rules leave "Requisitions to order"; Create PO drafts only pending lines | benchmark (ERPNext Stop) | BR-FF-23, BR-FF-48 |
| E-04 | Posted receipt is wrong | No edit; correction rows (frozen) show in the GRN History | benchmark (ERPNext / SAP return or cancel) | BR-FF-54 |
| E-05 | PO with receipts cancelled | Cancel hidden when frozen PO rules forbid it; server refuses a direct call; links stay listed with status | benchmark (ERPNext blocks with linked docs) | BR-FF-45, BR-FF-42 |
| E-06 | Sender approves own document | Allowed on a step they match (frozen BR-APR-33); one person cannot approve two levels, the inbox hides those | benchmark (docs silent; frozen rule kept) | BR-FF-20 |
| E-07 | Approver is away | Request waits; tile shows "oldest waiting since"; deputies are Not now | benchmark (SAP substitutes; ERPNext / Odoo silent) | BR-FF-20 |
| E-08 | Requisition has lines for two suppliers | One draft PO per supplier; drafts never submitted or sent by themselves | owner (card 1 = A) | BR-FF-48 |
| E-09 | Store keeper taps save without counting | Arrived boxes start empty; "Fill open quantity" fills only empty boxes on purpose | owner (card 2 = A) | BR-FF-64 |
| E-10 | What the plant head sees first | "Waiting for my approval" is the first tile | owner (card 3 = A) | BR-FF-13 |
| E-11 | Approver reopens the document after deciding | Access message unless they hold the document key | benchmark (ERPNext Share / SAP draft, decision benchmark 8) | BR-FF-53 |
| E-12 | Approver acts before seeing all lines | Act buttons appear only after every line, tax and total load; load failure → no buttons | benchmark (decision benchmark 10, stricter) | BR-FF-81 |
| E-13 | Approve from preview with empty note | Error at the box; nothing sent | invariant (frozen BR-APR-37) | BR-FF-82 |
| E-14 | Request withdrawn or decided by someone else while previewed | "This request was already handled"; row leaves | invariant | BR-FF-84 |
| E-15 | Reject from preview | Confirm names the document effect decided by frozen rules | invariant (frozen BR-APR-43) | BR-FF-87 |
| E-16 | 600 kg arrived, QA pending: what is open? | Open = ordered − accepted − pending-QA arrivals = 400 | designer (data.md point 1; frozen BR-GRN-27) | BR-FF-09 |
| E-17 | QA rejects a receipt | Rejected qty counts as open again; PO back in "Goods expected" | designer | BR-FF-09 |
| E-18 | Goods at the gate, due date passed | Order stays "Late" (frozen BR-PO-19 counts only accepted qty) until QA accepts; the receive screens show 400 kg open | designer (pre-freeze r1 SPEC-01) | BR-FF-26, BR-FF-09 |
| E-19 | Delay has no who / when stored | Delay shown pinned above History with date and reason, no name or time | designer (data.md point 2) | BR-FF-54 |
| E-20 | Stock exactly at reorder level, or reorder level 0 | At level → counted; level 0 → not counted; tile equals stock list flag | designer (data.md point 3) | BR-FF-30 |
| E-21 | Menu order across groups | Eight work screens in one "General" group so the order holds; Employee directory, Setup in "Admin" | designer (decided by ERPNext sidebar categories) | BR-FF-100 |
| E-22 | Preview beside list and two-pane pages break v2 pattern text | Owner-requested exception; one column below 1100 px; not a review finding | designer | BR-FF-113 |
| E-23 | Narrow screen (≤ 1100 px) | Side panel under lines; approvals preview as its own page | designer | BR-FF-103, BR-FF-81 |
| E-24 | Several GRN lines pending QA | Primary Inspect = first pending line; each pending line has its own Inspect | designer | BR-FF-44 |
| E-25 | Sent-back draft | Reviewer's note in a strip above the lines until resubmitted | designer (BR-APR-54) | BR-FF-90 |
| E-26 | List with fewer rows than one page | Paging controls hidden when total ≤ the chosen page size; sizes 25 / 50 / 100 everywhere | designer | BR-FF-105 |
| E-27 | Two people click Create PO on the same requisition | Second gets "Already on another order"; page reloads | invariant | BR-FF-59 |
| E-28 | One supplier's PO refused in a multi-supplier Create PO | Others stay made; message names the failed supplier | invariant | BR-FF-58 |
| E-29 | Pending line has no default supplier | Create PO asks for a supplier for that line first, in one dialog, before any PO is made | benchmark (ERPNext supplier per PO) | BR-FF-49, BR-FF-91 |
| E-30 | Save works, submit refused (no eligible approver) | Draft stays saved; page opens with the reason | benchmark (ERPNext save then submit) | BR-FF-57 |
| E-31 | Save fails | Nothing submitted; form keeps what was typed, error at the field | invariant | BR-FF-56 |
| E-32 | Someone else edits a draft | No "Save and submit"; only the creator submits | invariant (frozen approval rule) | BR-FF-47 |
| E-33 | PO closed / cancelled / fully received while receiving | "This order can no longer be received"; back to picker | invariant | BR-FF-72 |
| E-34 | Challan already used for that supplier | Refused, entries kept, reason shown | invariant (frozen BR-GRN-05) | BR-FF-69 |
| E-35 | Decimal quantity for pieces | Field error "Whole numbers only" before saving | invariant (frozen BR-GRN-02) | BR-FF-73 |
| E-36 | All arrived boxes empty or 0 | Save refused "Enter at least one arrived quantity" | invariant | BR-FF-65 |
| E-37 | No receivable order | Picker empty message; link to "Orders to send" only for `po.manage` | benchmark (permission-gated links) | BR-FF-70 |
| E-38 | Store keeper asks the picker endpoint for prices | No price fields in any response; PO endpoints still 403 | benchmark (decision benchmark 9, stricter) | BR-FF-62, BR-FF-06 |
| E-39 | QA inspector sees PO amounts via a GRN | Linked PO shows number and status only | invariant (permission) | BR-FF-55 |
| E-40 | Link to a document the viewer cannot open | Plain text, number + status | invariant (permission) | BR-FF-03 |
| E-41 | URL typed without access / for a missing id | Access message, no data / "Document not found" + link to list | invariant (permission) | BR-FF-04 |
| E-42 | Counts endpoint called for tiles without the key | Those tiles absent, not zero | invariant (permission) | BR-FF-11 |
| E-43 | Tile count differs from the list it opens | Not allowed: same predicate and IST day for both | invariant | BR-FF-02 |
| E-44 | Due today at 23:50 IST, server in another zone | "Today", not late | invariant | BR-FF-08 |
| E-45 | One tile's count fails | That tile shows "—" + retry; others load | benchmark (standard) | BR-FF-19 |
| E-46 | User with no queues and nothing waiting | "Nothing is waiting for you" + links to screens they can open | benchmark (ERPNext workspace shortcuts) | BR-FF-17 |
| E-47 | More than 99 approvals waiting | Menu badge "99+"; hidden at 0 | benchmark (standard) | BR-FF-85 |
| E-48 | Admin views another employee's inbox | Allowed with the key; acting only on own step | invariant (frozen BR-APR-52, 33) | BR-FF-89 |
| E-49 | Job-work order waiting for approval | Previewed the same way with its lines and total | invariant | BR-FF-88 |
| E-50 | Inactive item below reorder | Not counted | invariant | BR-FF-30 |
| E-51 | Leaving a form with unsaved changes | "Leave without saving?" | benchmark (ERPNext "Not saved") | BR-FF-112 |
| E-52 | Document with 35 lines / long history | All lines shown (max 500 per document, frozen BR-STD-33); history newest 200 events + "Older events hidden" | benchmark (standard) | BR-FF-104, BR-FF-54 |
| E-53 | Menu edited in Setup → Screens, then app update | Admin's edits kept; default written once | invariant | BR-FF-101 |
| E-54 | Old bookmarks `/landing`, `/purchase-orders/tracking` | Redirect to `/home`, `/purchase-orders` | benchmark (standard) | BR-FF-102, BR-FF-41 |
| E-55 | Any action from a new page | Only frozen endpoints write; no new stock, money or status path; audit as frozen | invariant | BR-FF-05 |
| E-56 | Line with 0 or missing suggested rate at Create PO | Dialog asks its rate before any PO; empty refused | invariant (frozen BR-PO-03, 25) | BR-FF-92 |
| E-57 | Item last ordered on a cancelled PO, or from a now-inactive supplier, or two POs at the same time | Cancelled / inactive skipped; same time → higher PO id; none left → dialog | benchmark (ERPNext Item Defaults supplier, blank = user picks) | BR-FF-91 |
| E-58 | Level-2 approver opens the document before level 1 decides | Access message (not on the current step, no trail row) | invariant (permission) | BR-FF-53 |
| E-59 | Approver of an earlier, sent-back request opens the resubmitted one | Access message unless on the current step of the new request | invariant (permission) | BR-FF-53 |
| E-60 | Requester without the document key opens it after the decision | Access message; while pending → read-only | invariant (permission) | BR-FF-93 |
| E-61 | Approval-path reader looks at PO History | Supplier messages by name, who, when; no note text | invariant (permission) | BR-FF-94 |
| E-62 | Admin views another employee's inbox | Rows shown, amount "–" (not sent) | invariant (permission) | BR-FF-77 |
| E-63 | Preview of a row the viewer cannot read | Access message in the pane, no data, no buttons | designer (pre-freeze r1 SEC-06) | BR-FF-78 |
| E-64 | Draft GRN deleted | Its arrived qty counts as open again | designer (pre-freeze r1 SPEC-10) | BR-FF-09 |
| E-65 | Receipt with one line failed and one passed | QA status "Partly accepted"; waived counts as passed | designer (pre-freeze r1 DES-002) | BR-FF-115 |
| E-66 | Custom role holds a tile key but not its list's key | Tile hidden | designer (pre-freeze r1 SPEC-05) | BR-FF-34 |
| E-67 | Admin renamed a menu entry before the update | Rename and its place kept; only untouched rows move | designer (pre-freeze r1 SPEC-07) | BR-FF-101 |
| E-68 | Reject a job-work order from the preview | Confirm says it is rejected for good; a new one must be raised | invariant (frozen BR-SCO-06) | BR-FF-87 |
| E-69 | Approver without `sco.view` previews a pending SCO | Lines and total shown read-only; after the decision → access message | invariant (permission) | BR-FF-83, BR-FF-53 |
| E-70 | User closes the Create PO supplier / rate dialog | No PO made | invariant | BR-FF-49 |

Counts: benchmark 20 · owner 3 · invariant 31 · designer 16 = 70.
