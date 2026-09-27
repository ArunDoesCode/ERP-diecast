---
module: purchase-requisition
status: draft            # draft | frozen | changed-after-freeze
version: 0
frozen_on:
owner: Arun
depends_on: [approval, purchase-order, grn, inventory]
---

# Purchase Requisition (PR) — functional spec

## 1. Purpose
A PR is the internal request to buy: a floor supervisor or back-office clerk says what is needed
(alloy ingot, die spares, tool-room steel, PPE), how much, and why. It gets approved against an estimated
value, then purchase turns its lines into POs. "Done" on the floor means every PR line ends up either
ordered and received (`closed`) or cancelled, and anyone can trace a line to its PO and GRN.
The PR never moves stock and never creates a PO itself.

Benchmark (adapted, not copied):
- ERPNext Material Request: Draft → Submitted → Ordered / Partially Ordered / Received / Stopped / Cancelled.
  Per-line `ordered_qty` and `received_qty`, status worked out from them. Once submitted it can't be edited, only cancelled or amended.
- Odoo Purchase Agreement/Requisition: draft → confirmed → done/cancel; lines turn into RFQs; cancelling
  the PO does not cancel the requisition.
- SAP B1 Purchase Request: Open/Closed per line, copy-to-PO takes all or part of the qty, a line closes when
  fully copied or closed by hand; can't cancel if copied to a PO.
- Common pattern: edit only in draft, header status worked out from line status, cancel blocked while
  lines sit on live POs, withdraw/send-back goes back to draft.
- Adapted for a small plant: one approval chain (approval spec), no RFQ step, full remaining qty per
  PO line (as-built), a PR is internal so no GST on it. The estimate uses the item's average cost.

## 2. Actors & permissions
| Role (from `roles` table) | Can view | Can create | Can edit (draft) | Can submit / cancel |
|---|---|---|---|---|
| super-admin | all | yes | any PR | any PR |
| owner | all | yes | any PR | any PR |
| back_office | all | yes | any PR (pending Q-5) | any PR (pending Q-5) |
| floor_supervisor | all (pending Q-5) | yes | own PR only (pending Q-5) | own PR only (pending Q-5) |
| qa_inspector, die_designer, operator | no (403) | no | no | no |

Approve / reject / send back is decided by the approval chain (`docs/specs/approval.md`), not by this table.

## 3. Documents & key fields
**Header `purchase_requests`**
| Field | Rule |
|---|---|
| `prNumber` | `PR-{periodKey}-{seq}`, allocated in the create transaction, unique, never reused (BR-PR-01) |
| `type` | `sale_order, stock_reorder, maintenance, tooling, subcontracting, misc` (BR-PR-02) |
| `assetId` | required for `maintenance`, optional otherwise; must exist in `machines` (BR-PR-02/03) |
| `saleOrderId` | optional, not validated until Sale Order module (BR-PR-04) |
| `notes` | purpose / justification, mandatory (BR-PR-05) |
| `status` | `prStatusEnum` — §4 |
| `requestedBy` | actor from JWT, never from client |
| `approvedBy`, `currentApprovalLevel`, `totalApprovalLevels` | mirrored from approval module only |
| `estimatedAmountPaise` | integer paise, derived (BR-PR-11..14) |
| audit | `createdAt`, `updatedAt`; **to add**: `updatedBy`, `cancelledBy`, `cancelledAt`, `cancelReason` (BR-PR-41, BR-PR-46) |

**Lines `purchase_request_items`**
| Field | Rule |
|---|---|
| `itemId` | active `itemMaster` row, one line per item per PR (BR-PR-06, BR-PR-09) |
| `uom` | copied from `itemMaster.uom` on the server (BR-PR-07) |
| `requestedQty` | > 0; decimals per Q-1 (BR-PR-08) |
| `issuedQty` | qty currently on live PO lines; 0 ≤ issuedQty ≤ requestedQty (BR-PR-27) |
| `expectedDate` | "required by" date, optional (BR-PR-10, pending Q-2) |
| `status` | `prItemStatusEnum` — §4.2 |

**Link `pr_po_item_links`** (`prItemId`, `poItemId`, `linkedQty`): one row per time a line is put on a PO.
A link is **live** when its PO is not `cancelled` and the PO item still exists. Rows for cancelled POs stay
for history.

## 4. State machine

### 4.1 Header
| From | Action | To | Who | Preconditions (BR ids) | Side effects |
|---|---|---|---|---|---|
| — | create | draft | §2 creators | BR-PR-01..10 | number assigned, estimate computed |
| draft | edit | draft | §2 editors | BR-PR-15, 17, 18 | estimate recomputed |
| draft | submit | pending_approval | §2 submitters | BR-PR-19, 12 | approval request opened |
| draft | submit (auto-approve policy) | approved | §2 submitters | BR-PR-19 | `approvedBy` = submitter |
| pending_approval | approve (not last level) | pending_approval | approver | approval spec | level mirrored |
| pending_approval | approve (last level) | approved | approver | BR-PR-21 | `approvedBy` set |
| pending_approval | reject | rejected | approver | BR-PR-22 | — |
| pending_approval | send back | draft | approver | BR-PR-23 | editable again |
| pending_approval | withdraw | draft | requester | BR-PR-24 (pending Q-7) | approval request cancelled |
| approved / partial_ordered / fully_ordered | line status change (PO side) | worked out | system | BR-PR-36, 37 | — |
| draft, pending_approval, approved, partial_ordered | cancel | cancelled | §2 cancellers | BR-PR-39..44 | pending lines → cancelled; open approval cancelled |

Terminal states: `rejected`, `cancelled`. `fully_ordered` is **not** terminal: it can drop back to
`partial_ordered`/`approved` when a PO line is reversed (BR-PR-38).

### 4.2 Line (settles BL-019)
| From | Trigger | To | Preconditions | Side effects |
|---|---|---|---|---|
| — | line created | pending | header draft | — |
| pending | line added to a PO (PO create/update) | po_draft | BR-PR-25 | issuedQty += linkedQty; link row |
| po_draft | linked PO → `approved` | ordered | BR-PR-30 (pending Q-9) | — |
| po_draft / ordered | PO line deleted, PO cancelled, PO approval rejected or cancelled | pending | BR-PR-31 | issuedQty −= linkedQty |
| ordered | linked PO line fully received (GRN accepted qty ≥ PO line qty) | closed | BR-PR-32 | — |
| ordered | linked PO → `closed` (short-close) | closed | BR-PR-32 (pending Q-10) | — |
| pending | PR cancelled, or line cancelled on its own | cancelled | BR-PR-33, 40 (pending Q-11) | — |

Partial GRN receipt leaves the line `ordered`. Terminal line states: `closed`, `cancelled` (BR-PR-34).

## 5. Business rules

### Create / draft
- **BR-PR-01** — On create, the system must save the header and all lines in one transaction with status
  `draft`, `requestedBy` = actor, and a `prNumber` `PR-{periodKey}-{seq}` from `allocateDocumentSequence`.
  A failed create uses no number that is visible to users, and two creates at the same time never get the same number.
- **BR-PR-02** — `type` is required and must be a `prTypeEnum` value. When `type = maintenance`, `assetId`
  is required (otherwise 400 `assetId is required when PR type is maintenance`). This also applies on edit when `type` is changed to maintenance.
- **BR-PR-03** — When `assetId` is given, it must exist in `machines` (otherwise 400 `Invalid assetId`).
- **BR-PR-04** — `saleOrderId` is optional and is stored as sent, with no validation, until the Sale Order module exists (M4).
- **BR-PR-05** — `notes` (purpose) must be a non-empty string on create. Edit can't blank it.
- **BR-PR-06** — Every line `itemId` must exist in `itemMaster` and have `isActive = true`
  (otherwise 400 `PR_INVALID_ITEM` listing the bad ids).
- **BR-PR-07** — Line `uom` is always copied from `itemMaster.uom`. Any `uom` the client sends is ignored.
- **BR-PR-08** — `requestedQty` must be > 0 with at most 3 decimal places (pending Q-1). Otherwise 400.
- **BR-PR-09** — A PR may not have two lines with the same `itemId`, on create or after an edit
  (otherwise 400 `PR_DUPLICATE_ITEM`).
- **BR-PR-10** — A line may carry an optional `expectedDate` (required-by). If given, it must not be before
  today when the line is saved (pending Q-2).

### Cost estimate
- **BR-PR-11** — `estimatedAmountPaise = round(Σ requestedQty × itemMaster.averageCostPaise)`, stored as integer
  paise. The system recomputes it on create and on every line insert/update/delete. How
  `averageCostPaise` is kept current is decided in `docs/specs/grn.md` (BL-014) and is not redefined here.
- **BR-PR-12** — On submit for approval, the system must recompute `estimatedAmountPaise` before choosing the
  approval policy, so the value band uses the latest average cost (pending Q-3).
- **BR-PR-13** — After submit, `estimatedAmountPaise` is frozen: later changes to `averageCostPaise` do not change it.
- **BR-PR-14** — A line whose item has `averageCostPaise = 0` is flagged `noCostHistory = true` in the
  detail response. Submit is still allowed. The UI shows a warning (pending Q-4).

### Edit
- **BR-PR-15** — Header fields and lines may be changed only while the PR is `draft`. Any other status → 409
  `PR_NOT_EDITABLE`.
- **BR-PR-16** — `PATCH /pr/updatepr` must refuse any `status` field (400 `PR_STATUS_VIA_ACTION`). Status
  changes only through submit, approval actions, cancel, or the PO-driven recompute.
- **BR-PR-17** — A `floor_supervisor` may edit, submit or cancel only PRs where `requestedBy` = self.
  owner, super-admin and back_office may act on any PR (pending Q-5). Otherwise 403.
- **BR-PR-18** — An edit that would leave a PR with zero lines is rejected (400 `PR_MIN_ONE_LINE`).

### Submit & approval
- **BR-PR-19** — Submit (`POST /approval/submitRequest`, docType `pr`) is allowed only from `draft` and only
  with ≥ 1 line. Result is `pending_approval`, or `approved` with `approvedBy` = submitter when the policy
  auto-approves. A second submit while a request is open → 409 `APPROVAL_ALREADY_OPEN`.
- **BR-PR-20** — The approval policy is matched on `subDocType = type` and `amountPaise = estimatedAmountPaise`.
  Matching and chain rules are owned by `docs/specs/approval.md`.
- **BR-PR-21** — When the last approval level approves, the PR becomes `approved`, `approvedBy` = last approver
  and `currentApprovalLevel = totalApprovalLevels`. After an approval that is not the last level, the PR stays
  `pending_approval` and the level is mirrored.
- **BR-PR-22** — Reject → `rejected`, terminal. A rejected PR cannot be edited or resubmitted. The requester
  raises a new PR (pending Q-6).
- **BR-PR-23** — Send back (`require_more_info`) → `draft`. The PR can be edited and resubmitted. Resubmit opens a new
  approval request, starting from level 1.
- **BR-PR-24** — If the requester withdraws a pending approval (approval action `cancel`), the PR goes back to `draft`, not
  `cancelled` (pending Q-7). Cancelling the PR itself is a separate action (BR-PR-39).

### Conversion to PO
- **BR-PR-25** — A PR line can be added to a PO only when the line is `pending` and the header is `approved` or
  `partial_ordered`. The whole remaining qty (`requestedQty − issuedQty`) goes to the PO line. The line row
  is locked `FOR UPDATE`. A second concurrent attempt gets 409 `PO_LINE_ALREADY_DRAFTED`.
- **BR-PR-26** — One PR line cannot be split across several POs or put on a PO for part of its qty in M1
  (pending Q-8). The PO line qty cannot be edited (PO spec).
- **BR-PR-27** — `issuedQty` rises by `linkedQty` when a line goes onto a PO and falls by the same amount when it comes
  off (BR-PR-31). It never goes below 0 or above `requestedQty`.
- **BR-PR-28** — The PR module never creates, changes or cancels PO rows. All PR→PO writes come from the PO module
  inside the PO transaction.

### Line state machine (BL-019)
- **BR-PR-29** — When a line is added to a PO, its status becomes `po_draft` in the same transaction.
- **BR-PR-30** — When the linked PO moves to `approved` (including auto-approve), every PR line with a live link to
  that PO moves `po_draft → ordered` in the same transaction (pending Q-9).
- **BR-PR-31** — When the linked PO item is deleted, the PO is cancelled, or the PO approval is rejected or
  cancelled (PO → `cancelled` through the approval mirror), the PR line goes `po_draft|ordered → pending` and
  `issuedQty −= linkedQty` in the same transaction.
- **BR-PR-32** — When the linked PO item's `receivedQty ≥ qty` after a GRN posts, the PR line becomes `closed`.
  When the linked PO moves to `closed` while the line is still `ordered` (short-close), the line also becomes
  `closed`. The short qty is not put back on the PR (pending Q-10).
- **BR-PR-33** — A `pending` line becomes `cancelled` when its PR is cancelled (BR-PR-40) or when the line is
  cancelled on its own while the header is `approved`/`partial_ordered` (pending Q-11).
- **BR-PR-34** — `closed` and `cancelled` lines never change status again and can't be added to a PO.
  A `po_draft`/`ordered` line can't be cancelled from the PR side (409 `PR_LINE_ON_LIVE_PO`).
  It has to be taken off or cancelled on the PO first.
- **BR-PR-35** — A line that is not `pending` can't be edited or deleted, even by admins. (While the header is
  `draft`, all lines are `pending`.)

### Header status worked out from lines
- **BR-PR-36** — After any line status change on a PR in `approved|partial_ordered|fully_ordered`, the header is
  recomputed over lines that are **not** `cancelled`: all `pending` → `approved`; all in
  `{po_draft, ordered, closed}` → `fully_ordered`; otherwise → `partial_ordered`. If every line is `cancelled`,
  the header becomes `cancelled`.
- **BR-PR-37** — The recompute does nothing when the header is `draft`, `pending_approval`, `rejected` or
  `cancelled`. A PO-side reversal must never bring a cancelled PR back.
- **BR-PR-38** — `fully_ordered` may go back to `partial_ordered` or `approved` only through BR-PR-36.
  The status-transition table in code must allow these moves explicitly rather than listing `fully_ordered` as terminal.

### Cancel / delete
- **BR-PR-39** — Cancel is allowed from `draft`, `pending_approval`, `approved`, `partial_ordered`. From
  `fully_ordered`, `rejected`, `cancelled` → 400 `PR_INVALID_TRANSITION`.
- **BR-PR-40** — Cancel is refused (409 `PR_HAS_ORDERED_LINES`) if any line is `po_draft`, `ordered` or `closed`
  (pending Q-11). If cancel succeeds, every `pending` line becomes `cancelled` and the header becomes `cancelled`,
  in one transaction.
- **BR-PR-41** — A cancel reason (non-empty) is required unless the PR is `draft`. The system records `cancelReason`,
  `cancelledBy` and `cancelledAt` (otherwise 400 `PR_CANCEL_REASON_REQUIRED`).
- **BR-PR-42** — Cancelling a `pending_approval` PR also cancels the open approval request and writes an approval
  trail row, **in the same transaction** as the PR status change.
- **BR-PR-43** — PRs are never hard-deleted. `DELETE /api/pr/deletepr/:id` (id in path) is the cancel action
  and follows BR-PR-39..42. A cancelled PR keeps its number and stays in lists under the `cancelled` filter
  (pending Q-12). (Frontend path bug = BL-001, fixed separately.)
- **BR-PR-44** — Cancel permission follows BR-PR-17.

### Security, audit, concurrency
- **BR-PR-45** — Every `/api/pr/*` endpoint requires a valid JWT and a role in
  {super-admin, owner, floor_supervisor, back_office}. Otherwise 401/403.
- **BR-PR-46** — Every header status change and every line status change records actor and timestamp:
  approval-driven changes in the approval trail, other changes in `updatedBy/updatedAt` (and
  `cancelledBy/cancelledAt` for cancel).
- **BR-PR-47** — Edit, submit and cancel re-read the PR under a row lock inside their transaction and check
  status there. When two of them race, the one that finds the status already changed gets 409, and nothing is half-written.

## 6. Cross-module effects
| Module | Effect |
|---|---|
| Numbering | `allocateDocumentSequence(tx, "pr", …)` on create (BR-PR-01) |
| Approval | submit opens request; approve/reject/send-back/withdraw mirror onto PR (BR-PR-19..24); PR cancel cancels open request (BR-PR-42). Status mapping lives in `approvalService` — must match §4 |
| Purchase order | PO create/update/cancel/approve/reject/close drives line status + `issuedQty` + header recompute (BR-PR-25..38). PO spec must cite BR-PR-30/31/32 |
| GRN | GRN posting that makes a PO line fully received triggers BR-PR-32 in the GRN transaction. GRN spec owns receipt maths |
| Inventory / costing | PR only **reads** `itemMaster.averageCostPaise` (BR-PR-11). No ledger postings, no stock reservation |
| Sale order (M4) | `saleOrderId` placeholder; BOM explosion will create PRs through the same create API |
| Subcontracting (M2) | `type = subcontracting` PRs convert to PO in M1. The M2 spec decides whether they go to SCO instead (Q-13) |

## 7. Acceptance criteria
- **AC-01** (BR-PR-01) — Given back_office user, When they create a PR with 2 valid lines, Then status is `draft`,
  `requestedBy` = actor, `prNumber` matches `PR-{periodKey}-{seq}`. When two creates run in parallel, the numbers differ.
- **AC-02** (BR-PR-01) — Given a create whose second line has an invalid item, When submitted, Then 400 and
  no header or line rows exist.
- **AC-03** (BR-PR-02) — Given `type = maintenance` and no `assetId`, When creating, Then 400. And given a draft
  `misc` PR without asset, When edited to `type = maintenance` without `assetId`, Then 400.
- **AC-04** (BR-PR-03) — Given `assetId = 999999` (not in machines), When creating, Then 400 `Invalid assetId`.
- **AC-05** (BR-PR-04) — Given `saleOrderId = 42` with no sale order table, When creating, Then 201 and 42 is stored.
- **AC-06** (BR-PR-05) — Given `notes = ""`, When creating, Then 400.
- **AC-07** (BR-PR-06) — Given an item with `isActive = false`, When creating a PR with it, Then 400 `PR_INVALID_ITEM`.
- **AC-08** (BR-PR-07) — Given item uom `kg` and client sends `uom: "pcs"`, When creating, Then the saved line uom = `kg`.
- **AC-09** (BR-PR-08) — Given `requestedQty` 0, −5 or 1.2345, When creating, Then 400. Given 12.5 (kg), Then 201 (pending Q-1).
- **AC-10** (BR-PR-09) — Given two lines with the same item on create, Then 400 `PR_DUPLICATE_ITEM`. Given a draft
  with item A, When an update inserts item A again, Then 400.
- **AC-11** (BR-PR-10) — Given `expectedDate` = yesterday, When saving a line, Then 400.
- **AC-12** (BR-PR-11) — Given items avg cost 25000 and 1050 paise, qty 10 and 3, When created, Then
  `estimatedAmountPaise = 253150`. When line 2 qty is changed to 4, Then 254200.
- **AC-13** (BR-PR-12, BR-PR-13) — Given a draft with estimate 100000 whose item avg cost has since risen so the
  new value is 600000, When submitted, Then estimate = 600000 and the policy for the ≥ band is used. When avg cost
  changes after approval, Then the estimate stays 600000.
- **AC-14** (BR-PR-14) — Given a line whose item has avg cost 0, When details are fetched, Then that line has
  `noCostHistory = true`, and submit succeeds.
- **AC-15** (BR-PR-15) — Given a PR in `pending_approval` (and separately `approved`, `cancelled`), When
  PATCH changes notes or adds a line, Then 409 `PR_NOT_EDITABLE` and nothing changes.
- **AC-16** (BR-PR-16) — Given a draft, When PATCH sends `status: "pending_approval"` or `"cancelled"`, Then 400
  `PR_STATUS_VIA_ACTION` and no approval request is created.
- **AC-17** (BR-PR-17, BR-PR-44) — Given a draft by supervisor A, When supervisor B edits or cancels it, Then 403.
  When back_office edits it, Then 200.
- **AC-18** (BR-PR-18) — Given a draft with one line, When PATCH deletes that line with no insert, Then 400 `PR_MIN_ONE_LINE`.
- **AC-19** (BR-PR-19) — Given a draft, When submitted under a 2-level policy, Then status `pending_approval`,
  `totalApprovalLevels = 2`. When submitted again, Then 409 `APPROVAL_ALREADY_OPEN`. Given an `approved` PR, When
  submitted, Then 409 `APPROVAL_INVALID_SOURCE_STATUS`.
- **AC-20** (BR-PR-19) — Given an auto-approve policy, When submitted, Then status `approved` and `approvedBy` = submitter.
- **AC-21** (BR-PR-20) — Given policies for `tooling` and `any`, When a `tooling` PR is submitted, Then the tooling policy is used.
- **AC-22** (BR-PR-21) — Given a 2-level request, When level 1 approves, Then PR stays `pending_approval` with
  level 2. When level 2 approves, Then `approved` with `approvedBy` = level-2 approver.
- **AC-23** (BR-PR-22) — Given `pending_approval`, When rejected, Then `rejected`. After that, PATCH → 409 and submit → 409.
- **AC-24** (BR-PR-23) — Given `pending_approval`, When sent back, Then `draft`, editable. On resubmit, a new request starts at level 1.
- **AC-25** (BR-PR-24) — Given `pending_approval`, When the requester withdraws, Then PR is `draft` and the request is `cancelled`.
- **AC-26** (BR-PR-25) — Given an approved PR line qty 100, When a PO is drafted from it, Then PO line qty = 100.
  Given the PR in `pending_approval`, When a PO is drafted, Then 400.
- **AC-27** (BR-PR-25, BR-PR-47) — Given one pending line, When two PO creates for it run concurrently, Then
  exactly one succeeds and the other gets 409 `PO_LINE_ALREADY_DRAFTED`.
- **AC-28** (BR-PR-26) — Given a pending line qty 100, When a PO create asks for qty 40, Then qty is ignored or
  refused and never 40 (PO contract has no qty field).
- **AC-29** (BR-PR-27, BR-PR-29) — Given a pending line qty 100, When put on a PO, Then `issuedQty = 100`, status `po_draft`.
- **AC-30** (BR-PR-30) — Given a line `po_draft` on PO-1, When PO-1 is finally approved (or auto-approved), Then the line is `ordered`.
- **AC-31** (BR-PR-31) — Given a line on draft PO-1, When that PO line is deleted, Then line `pending`, `issuedQty = 0`.
  Given the line `ordered` on approved PO-2, When PO-2 is cancelled with reason, Then line `pending`, `issuedQty = 0`.
- **AC-32** (BR-PR-31) — Given a line `po_draft` on PO-3 in `pending_approval`, When the PO approver rejects,
  Then PO-3 is `cancelled` and the PR line is `pending` and can go on a new PO.
- **AC-33** (BR-PR-32) — Given a line `ordered` for 100 kg, When a GRN accepts 60 kg, Then the line stays `ordered`.
  When a second GRN accepts 40 kg, Then the line is `closed`.
- **AC-34** (BR-PR-32) — Given a line `ordered`, 60 of 100 received, When the PO is closed, Then the line is `closed`
  and `issuedQty` stays 100.
- **AC-35** (BR-PR-33, BR-PR-36) — Given an approved PR with lines L1 `po_draft`, L2 `pending`, When L2 is
  cancelled on its own, Then L2 `cancelled` and header `fully_ordered`.
- **AC-36** (BR-PR-34) — Given a line `ordered`, When a line-cancel is requested, Then 409 `PR_LINE_ON_LIVE_PO`.
  Given a line `closed` or `cancelled`, When added to a PO, Then 400.
- **AC-37** (BR-PR-35) — Given a line `po_draft`, When PATCH updates its qty (bypassing the header check via crafted request), Then 409.
- **AC-38** (BR-PR-36) — Given 3 active lines, When 1 goes onto a PO, Then header `partial_ordered`. When all 3 are on
  POs, Then `fully_ordered`. When all 3 later reach `closed`, Then it stays `fully_ordered`.
- **AC-39** (BR-PR-36, BR-PR-38) — Given `fully_ordered` with 2 lines, When one PO is cancelled, Then header `partial_ordered`.
  When the other PO is cancelled too, Then `approved`.
- **AC-40** (BR-PR-37) — Given a cancelled PR (reached via legacy data) with a line on live PO-9, When PO-9 is
  cancelled, Then the PR stays `cancelled`.
- **AC-41** (BR-PR-39) — Given `fully_ordered`, `rejected` or `cancelled`, When cancel is requested, Then 400 `PR_INVALID_TRANSITION`.
- **AC-42** (BR-PR-40) — Given `partial_ordered` with one line `po_draft`, When cancel is requested, Then 409
  `PR_HAS_ORDERED_LINES`. Given `approved` with all lines `pending`, When cancelled with reason, Then header
  `cancelled` and every line `cancelled`.
- **AC-43** (BR-PR-41) — Given `approved`, When cancel is sent without reason, Then 400 `PR_CANCEL_REASON_REQUIRED`.
  Given `draft`, When cancelled without reason, Then 200, and `cancelledBy`/`cancelledAt` are set.
- **AC-44** (BR-PR-42) — Given `pending_approval`, When cancelled, Then the approval request is `cancelled` with a
  trail row. If the trail insert fails, the PR is still `pending_approval` (rollback).
- **AC-45** (BR-PR-43) — Given a draft PR, When `DELETE /api/pr/deletepr/:id` is called, Then the row still exists
  with status `cancelled` and appears under the `status=cancelled` list filter.
- **AC-46** (BR-PR-45) — Given a `qa_inspector` token, When calling `GET /api/pr/getprs`, Then 403. Given no token, Then 401.
- **AC-47** (BR-PR-46) — Given any cancel, submit or PO-driven line change, When it completes, Then the actor and
  timestamp can be read from the PR row or the approval trail.
- **AC-48** (BR-PR-47) — Given a draft, When an edit and a submit race, Then either the edit lands and then submit
  succeeds, or submit lands and the edit gets 409. Never both a changed line and an approval request built from the old estimate.

## 8. Screens (frontend)
- **List** (`/purchase-requisitions`): filters status (multi), type, text search; sort by number/type/status/date.
  Columns: number, type, requester, status, estimated ₹, created. Cancelled/rejected hidden by default (UI filter).
- **Detail** (needs a route `purchase-requisitions/[id]`; today it exists only inside the edit modal): header, lines with
  status badge, issued qty, linked PO number/status, `noCostHistory` warning, approval trail.
- **Create/edit form**: type, asset (shown for maintenance/tooling, required for maintenance), sale order, notes,
  lines (item, qty, auto uom, required-by date, est. rate read-only). Editable only in `draft` (BR-PR-15).
- **Actions per status**:
  | Status | Actions |
  |---|---|
  | draft | Edit, Submit, Cancel (no reason) |
  | pending_approval | Withdraw (requester), Cancel (reason), approve/reject/send back (approver, via approval) |
  | approved / partial_ordered | Create PO (PO screen), Cancel line (pending lines), Cancel PR (reason, only if BR-PR-40 passes) |
  | fully_ordered, rejected, cancelled | view only |

## 9. Reports / queries needed
- PR list with status/type filters (exists).
- Open PR lines queue: lines `pending` on headers `approved|partial_ordered`, grouped by default supplier. This feeds
  the PO screen (exists as `/purchase-orders` queue).
- PR line trace: PR line → PO → GRN received qty (on detail page).

## 10. Out of scope / later
- Header `closed`/`received` status. Header stays `fully_ordered`; line `closed` shows receipt.
- Splitting a PR line across suppliers / part-qty PO lines (Q-8 may pull it in).
- "Copy rejected PR to new draft" convenience.
- Optimistic locking for two users editing the same draft (last write wins inside BR-PR-47's lock).
- Auto-PR from reorder level (`itemMaster.reorderLevel`) and from BOM explosion (M4).
- Sale order existence validation (M4). Service (non-stock) lines on PR.

## 11. Open questions (answer inline)
1. **Q-1 Quantity decimals.** Can a PR ask for 12.5 kg of ingot or 2.5 L of die lube?
   a) Up to 3 decimals for any uom (ERPNext uses a float qty with uom-level "must be whole number") — flexible, needs rounding in PO/GRN.
   b) Whole numbers only (today's API) — simple, but makes you round kg/L.
   c) Decimals only for kg/ltr, whole for pcs — most correct, needs a uom setting.
   Recommendation: a (3 decimals); c later if pcs fractions cause errors. Answer:
2. **Q-2 Required-by date per line.** Should each line carry a "needed by" date?
   a) Optional per line, not in the past (SAP B1 "Required Date", ERPNext "Required By") — helps PO expected date.
   b) Mandatory per line — better planning, more typing.
   c) Not now (column stays unused).
   Recommendation: a. Answer:
3. **Q-3 Refresh estimate on submit.** Average cost may have changed since the draft was typed.
   a) Recompute at submit (policy band uses the latest cost).
   b) Keep last-edit value (today) — can route a PR to a lower approval band.
   Recommendation: a. Answer:
4. **Q-4 Items with no cost history (avg cost ₹0).** A new item makes the estimate ₹0, so it lands in the lowest approval band.
   a) Allow and warn on screen.
   b) Block submit until the requester types an estimated rate (Odoo/ERPNext let you type a rate on the line) — needs a new field.
   c) Send any PR with a ₹0 line to the top approval level.
   Recommendation: a for M1; b if owner worries about approval bypass. Answer:
5. **Q-5 Who can edit/cancel someone else's PR?**
   a) Supervisor: own PRs only. back_office/owner/admin: any PR. Everyone sees all PRs.
   b) Anyone with PR access can do anything (today).
   c) Owner-only edits, requester-only cancels.
   Recommendation: a. Answer:
6. **Q-6 Rejected PR.** After an approver rejects, what happens?
   a) Final. Raise a new PR (ERPNext cancel + amend makes a new doc).
   b) Requester can reopen it to draft and resubmit.
   Recommendation: a (use "send back" when a fix is wanted). Answer:
7. **Q-7 Requester withdraws a pending PR.** Where does it go?
   a) Back to draft, can be edited and resubmitted (ERPNext/Odoo style).
   b) Cancelled (today's code).
   Recommendation: a. Answer:
8. **Q-8 One PR line to more than one supplier/PO.** E.g. 1000 kg ADC12 split 600/400 between two suppliers.
   a) Not in M1: the whole remaining qty goes to one PO (today).
   b) Allow part qty per PO line (SAP B1 copy-to with partial qty, ERPNext ordered_qty) — line stays `pending` until fully issued. Bigger change to the PO module.
   Recommendation: a for M1, revisit at UAT-1. Answer:
9. **Q-9 When does a PR line count as "ordered"?**
   a) When the PO is approved.
   b) When the PO is sent to the supplier (`dispatched`).
   c) When the PO is drafted (no separate `ordered` step).
   Recommendation: a. Answer:
10. **Q-10 PO short-closed with qty still owed.** Supplier sent 60 of 100 kg and the PO is closed.
    a) PR line closed. Raise a new PR if still needed (SAP B1 closes the line).
    b) The 40 kg goes back to `pending` on the same PR for a fresh PO.
    Recommendation: a (keeps qty maths simple, avoids silent re-orders). Answer:
11. **Q-11 Cancelling a PR that is partly on POs.**
    a) Block while any line is on a PO or received. Allow cancelling single pending lines instead (SAP B1/ERPNext block).
    b) "Short-close": cancel remaining pending lines, keep ordered ones.
    c) Today: header cancelled, lines untouched (a cancelled PR can still have open PO lines).
    Recommendation: a. Answer:
12. **Q-12 Hard-delete of a draft never submitted.**
    a) Never delete. Cancel only, number kept (audit-friendly, today's backend).
    b) Hard-delete drafts never submitted (ERPNext allows deleting drafts). Leaves number gaps.
    Recommendation: a. Answer:
13. **Q-13 PR type "subcontracting".** Should these convert to a normal PO in M1?
    a) Yes, as any other PR. M2 decides if they go to a subcontract order.
    b) Block PO conversion for this type until M2.
    Recommendation: a. Answer:

## 12. Implementation status
| BR | Status (todo / done) | Test |
|---|---|---|
| BR-PR-01 | done (`prRepository.createWithItems`, `allocateDocumentSequence`) | — |
| BR-PR-02, 03 | done (`prService.create/update`) | — |
| BR-PR-04, 05, 07 | done | — |
| BR-PR-06 | todo — `isActive` not checked | — |
| BR-PR-08 | todo — Zod `requestedQty` is `.int()` (`pr.types.ts`) | — |
| BR-PR-09 | todo — checked on update only, not create | — |
| BR-PR-10 | todo — `expectedDate` not in create/update schema | — |
| BR-PR-11 | done (`recalculateEstimatedAmountByPrId`); cost source per grn spec / BL-014 | — |
| BR-PR-12, 14 | todo | — |
| BR-PR-13 | done (implicitly: no recompute after approval since edits blocked — needs BR-PR-15) | — |
| BR-PR-15, 16, 17, 18 | todo — `prService.update` has no status guard; PATCH accepts `pending_approval`/`cancelled` | — |
| BR-PR-19, 20, 21, 23 | done (`approvalService.submitRequest/actOnRequest`) | approval tests partial |
| BR-PR-22 | done (`rejected` terminal) | — |
| BR-PR-24 | todo — approval `cancel` maps PR to `cancelled` | — |
| BR-PR-25, 26, 27, 28, 29 | done (`poRepository.createWithItems/updateWithItems`) | — |
| BR-PR-30, 32, 33 | todo (BL-019) | — |
| BR-PR-31 | partial — delete/cancel done; PO approval reject/cancel via mirror does not revert | — |
| BR-PR-34, 35 | todo | — |
| BR-PR-36 | partial — `recomputeHeaderStatusFromItems` ignores `cancelled` lines | — |
| BR-PR-37, 38 | todo | — |
| BR-PR-39 | partial — `fully_ordered` blocked; transitions table needs BR-PR-38 moves | — |
| BR-PR-40, 41, 42 | todo | — |
| BR-PR-43 | done backend (DELETE = cancel); frontend BL-001 | — |
| BR-PR-44 | todo | — |
| BR-PR-45 | done (`routes/pr.ts`) | — |
| BR-PR-46, 47 | todo | — |

## Changelog
- 2026-09-27 v0 — draft created (retroactive from code at 0a406f4 + map; settles BL-019 line states pending Q-9/10/11)
