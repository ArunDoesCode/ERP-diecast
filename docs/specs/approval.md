---
module: approval
status: draft            # draft | frozen | changed-after-freeze
version: 0
frozen_on:
owner: Arun
depends_on: [auth-setup, purchase-requisition, purchase-order, subcontracting]
---

# Approval policy engine — functional spec

> Written retroactively from as-built code (map: `docs/modules/approval.md`, reference:
> `backend/docs/approval_policy_engine.md`). Rules marked **(pending Q-n)** assume the recommendation in
> section 11 and change if the answer differs. Backlog pulled in: BL-002, BL-022, BL-023.

## 1. Purpose
Decides **who must sign off** a Purchase Request (PR), Purchase Order (PO) or Subcontracting Order (SCO)
before it can move on, and records every sign-off. The owner configures a few rules once ("tooling →
owner", "PO ≥ ₹1L → back office then owner"); after that, clerks submit documents, approvers clear their
inbox, and the document's status follows the approval automatically. Done on the floor = no PR/PO/SCO
reaches a supplier without the right signature, and anyone can see who approved what, when, and why it
was rejected.

## 2. Actors & permissions
| Role | View policies | Create/edit policies | Submit document | Act (approve/reject/send back) | Withdraw |
|---|---|---|---|---|---|
| super-admin | yes | yes | own docs | if current step matches | own requests |
| owner | yes | no | own docs | if current step matches | own requests |
| back_office | yes | no | own docs | if current step matches | own requests |
| floor_supervisor, qa_inspector, die_designer | no | no | own docs | if current step matches | own requests |
| operator | no | no | no (no desk login) | no | no |

"Current step matches" = BR-APR-31. Reading a request = BR-APR-51.

## 3. Documents & key fields
**Policy** (`approval_policies`): `name`, `description`, `isActive`, `priority` (int ≥ 1, lower = stronger),
`docType` (pr|po|sco), `subDocType` (any|sale_order|stock_reorder|maintenance|tooling|subcontracting|misc,
default `any`), `isSaleOrderLinked` (to be retired, Q-1), `minAmountPaise`/`maxAmountPaise` (bigint paise,
null = unbounded), `autoApprove`, `approvalChain` (ordered steps), `approvalLevels` (derived).

**Chain step**: `{ level (1..n), approverType: role|specific, role? , employeeId? }`.

**Request** (`approval_requests`): one per submission. `docType`, `docId`, `policyId`, `status`,
`currentLevel`, `totalLevels`, `chainSnapshot` (frozen copy), `currentApproverRole` /
`currentApproverEmployeeId` (who can act now), `requestedBy`, `requestedAt`, `completedAt`.

**Trail** (`approval_trails`): append-only, one row per action: `level`, `action`
(submitted|approved|rejected|require_more_info|auto_approved|cancelled), `actionBy`, `actionAt`, `notes`.

**Document mirror** (on PR/PO/SCO): `status`, `currentApprovalLevel`, `totalApprovalLevels`, `approvedBy`
(PR/PO only). The request is the source of truth; the mirror is what list screens read.

Money: integer paise everywhere. UI shows/enters rupees (BR-APR-61).

## 4. State machine
Request (`approval_status`; only these five values are used — BR-APR-50):

| From | Action | To | Who | Preconditions (BR) | Side effects |
|---|---|---|---|---|---|
| — | submit (policy not auto) | pending_approval | document creator | 24–27 | trail `submitted` L0; doc → pending_approval |
| — | submit (policy auto) | approved | document creator | 24–26, 28 | trails `submitted` + `auto_approved`; doc → approved |
| pending_approval | approve, level < total | pending_approval (level+1) | current-step approver | 30–35 | trail `approved`; doc level +1 |
| pending_approval | approve, last level | approved | current-step approver | 30–34, 36 | trail `approved`; doc → approved |
| pending_approval | reject | rejected | current-step approver | 30–31, 37 | trail `rejected`; doc per 42–44 |
| pending_approval | send back | require_more_info | current-step approver | 30–31, 38 | trail `require_more_info`; doc → draft |
| pending_approval | withdraw (`cancel`) | cancelled | requester | 30, 39 | trail `cancelled`; doc → draft (pending Q-7) |
| pending_approval | document cancelled | cancelled | doc's cancel permission | 48 | trail `cancelled`; doc → cancelled |

Terminal: approved, rejected, require_more_info, cancelled. A terminal request is never reopened;
resubmitting creates a new request (BR-APR-29).

## 5. Business rules

### Policy configuration
- **BR-APR-01** — Only super-admin may create or update a policy; super-admin, owner, back_office may list and view policies. Anyone else gets 403.
- **BR-APR-02** — A policy must have a non-empty `name`, an integer `priority` ≥ 1, a `docType`, and a `subDocType` from the category enum; on create, omitted `subDocType` = `any`. Otherwise 400.
- **BR-APR-03** — Chain steps must have levels 1..n with no gaps or duplicates; a `role` step must have `role` and no `employeeId`; a `specific` step must have `employeeId` and no `role`. Otherwise 400.
- **BR-APR-04** — `approvalLevels` is always derived from the chain length by the server; a client-sent value is ignored.
- **BR-APR-05** — When `autoApprove = true` the chain may be empty and `approvalLevels = 0`; when `autoApprove = false` the chain must have ≥ 1 step (400 otherwise).
- **BR-APR-06** — Amount bounds are optional non-negative integer paise; when both are set, `max > min` (400 otherwise). On PATCH the check uses the merged result (stored values + patch).
- **BR-APR-07** — At most one **active** policy per `(priority, docType, subDocType)`. Creating, re-prioritising or re-activating into an occupied slot returns 409 `POLICY_PRIORITY_TAKEN`. Inactive duplicates are allowed.
- **BR-APR-08** — PATCH is partial: any field omitted from the body keeps its stored value. In particular an omitted `subDocType` must **not** reset to `any` (BL-022).
- **BR-APR-09** — On PATCH, explicit `null` clears a nullable field (`description`, `minAmountPaise`, `maxAmountPaise`); explicit `null` on a non-nullable field is 400.
- **BR-APR-10** — A PATCH with no updatable field is 400; `minAmountPaise` and `maxAmountPaise` count as updatable fields.
- **BR-APR-11** — `docType` cannot be changed after creation (create a new policy instead).
- **BR-APR-12** — Policies are never deleted; they are retired with `isActive = false`.
- **BR-APR-13** — Editing, re-prioritising or deactivating a policy never changes an in-flight request; acting always reads the request's `chainSnapshot`, never the live policy.
- **BR-APR-14** — Every create/update stamps `createdBy` (create), `lastUpdatedBy` and `lastUpdatedAt`.
- **BR-APR-15** — `isSaleOrderLinked` is not a matching criterion and is not accepted by create/update; a "sale-order fast track" is configured as `subDocType = sale_order` (BL-002) **(pending Q-1)**.

### Policy matching
- **BR-APR-16** — Candidates are active policies with the document's `docType`.
- **BR-APR-17** — A candidate matches on category when its `subDocType` is `any` or equals the document's category (BR-APR-21).
- **BR-APR-18** — A candidate matches on amount when `min ≤ amount` (inclusive) and `amount < max` (exclusive); a null bound is unbounded.
- **BR-APR-19** — Among matches, the most specific tier wins: 1 exact category + amount bound; 2 exact category, no bound; 3 `any` + amount bound; 4 `any`, no bound.
- **BR-APR-20** — Within a tier, lower `priority` wins; on a tie, the lower policy id wins (deterministic).
- **BR-APR-21** — Document context: PR category = PR `type`, amount = `estimatedAmountPaise`; PO category = the common `type` of its source PRs, or `any` when mixed, amount = PO `totalAmountPaise`; SCO category = `subcontracting`, amount = sum of SCO line values **(pending Q-5, Q-6)**.
- **BR-APR-22** — When no active policy matches, the system fallback applies: one level, role `owner`. The fallback record is inactive so it never competes in BR-APR-16 **(pending Q-4)**.
- **BR-APR-23** — At submit, every role step must have ≥ 1 active employee holding that role and every specific step must point to an active employee; otherwise 400 `APPROVAL_NO_ELIGIBLE_APPROVER` naming the step, and the document stays draft. Not checked for auto-approve policies.

### Submit
- **BR-APR-24** — Only the document's creator (PR `requestedBy`, PO/SCO `createdBy`) may submit it; others get 403 **(pending Q-10)**.
- **BR-APR-25** — A document can be submitted only from `draft`; otherwise 409 `APPROVAL_INVALID_SOURCE_STATUS`.
- **BR-APR-26** — A document has at most one `pending_approval` request; a second submit (including a concurrent double-click) returns 409 `APPROVAL_ALREADY_OPEN` and creates nothing.
- **BR-APR-27** — Submit, in one transaction: creates the request with `chainSnapshot` = policy chain, `currentLevel = 1`, `totalLevels = approvalLevels`, current approver fields from step 1; writes trail `submitted` at level 0; sets the document to `pending_approval` with level 1 of N. If any step fails, nothing is written.
- **BR-APR-28** — Auto-approve: the request is created as `approved` with `completedAt`; trails `submitted` and `auto_approved` (actor = requester, note "Auto-approved by policy <name>"); document → `approved`; `approvedBy` stays null (the trail is the evidence).
- **BR-APR-29** — Resubmitting after send-back, withdraw or (PR only) edit-and-retry creates a new request, re-runs matching on the document's current values, and keeps all earlier requests and trails.

### Acting on a request
- **BR-APR-30** — Any action requires the request to be `pending_approval`; otherwise 409 `APPROVAL_NOT_PENDING`.
- **BR-APR-31** — Approve / reject / send back require an active actor who matches the current step: role step → actor's role at action time equals the step role; specific step → actor is that employee. Otherwise 403.
- **BR-APR-32** — Role steps resolve to whoever holds the role when acting; a role change moves the right to act with it.
- **BR-APR-33** — The requester cannot approve their own request at any level (403 `APPROVAL_SELF_APPROVAL`), except the `owner` role **(pending Q-2)**.
- **BR-APR-34** — The same employee cannot approve two levels of one request (403 `APPROVAL_ALREADY_ACTED`) **(pending Q-2)**.
- **BR-APR-35** — Approve below the last level: `currentLevel` +1, status stays `pending_approval`, current approver fields move to the next step, document level mirror updates, document status unchanged.
- **BR-APR-36** — Approve at the last level: request `approved`, `completedAt` set, document `approved`, `approvedBy` = this approver.
- **BR-APR-37** — Reject requires non-empty `notes` (400 `APPROVAL_NOTES_REQUIRED`); request → `rejected` **(pending Q-3)**.
- **BR-APR-38** — Send back requires non-empty `notes` (400 `APPROVAL_NOTES_REQUIRED`); request → `require_more_info`; document → `draft`, editable by its creator **(pending Q-3)**.
- **BR-APR-39** — Withdraw (action `cancel`) only by the requester (403 otherwise); request → `cancelled`; document → `draft`, not cancelled; notes optional **(pending Q-7)**.
- **BR-APR-40** — Every action writes exactly one trail row (level acted at, action, actor, notes, time) in the same transaction as the request update and the document mirror.
- **BR-APR-41** — Actions on one request are serialised (row lock); an action that loses the race is evaluated against the updated request and fails per BR-APR-30/31/34 without writing a trail row.

### Mirror onto the document
- **BR-APR-42** — PR mirror: pending → `pending_approval`; approved → `approved`; rejected → `rejected`; sent back → `draft`; withdrawn → `draft`; doc-cancel → `cancelled`.
- **BR-APR-43** — PO mirror: pending → `pending_approval`; approved → `approved`; rejected → `cancelled` via the PO cancel path, so linked PR lines return to `pending` and PR header status is recomputed; sent back / withdrawn → `draft` **(pending Q-8)**.
- **BR-APR-44** — SCO mirror: pending → `pending_approval`; approved → `approved`; rejected → `rejected`; sent back / withdrawn → `draft` (never left at `require_more_info`).
- **BR-APR-45** — `currentApprovalLevel`/`totalApprovalLevels` always equal the latest request's values; `approvedBy` is set only by BR-APR-36 and cleared by any other outcome.
- **BR-APR-46** — Approval-owned document statuses (`pending_approval`, `approved`, `rejected`) are written only by this engine; the owning module's generic update endpoints reject them (400).

### Document change / cancel
- **BR-APR-47** — While a request is `pending_approval`, the document's header and lines cannot be edited (409 `DOC_LOCKED_IN_APPROVAL`); to change it the requester withdraws (BR-APR-39) **(pending Q-7)**.
- **BR-APR-48** — Cancelling a document with an open request cancels that request in the **same** transaction; trail `cancelled` with actor = the user who cancelled the document and the cancel reason in notes.
- **BR-APR-49** — An approved request is never reopened by this module. If the owning module allows an approved document to change amount, category or lines, it must first return the document to `draft` so it is resubmitted (the owning spec decides which edits are allowed).
- **BR-APR-50** — Request statuses written are only `pending_approval`, `approved`, `rejected`, `require_more_info`, `cancelled`; the enum values `partial_ordered`, `fully_ordered`, `auto_approved` are never written.

### Read & audit
- **BR-APR-51** — A request (details, trail, current-by-doc) is readable by super-admin, owner, back_office, the requester, and any active employee who is an approver anywhere in its `chainSnapshot`; others get 403.
- **BR-APR-52** — "My pending approvals" lists `pending_approval` requests whose current step is my role or me; super-admin may view another employee's list, others get 403 for that; an inactive target is 404.
- **BR-APR-53** — "My pending approvals" excludes requests I raised when self-approval is blocked for me (BR-APR-33) **(pending Q-2)**.
- **BR-APR-54** — A document's approval history (all its requests, newest first, each with its trail oldest first) is readable by the readers of BR-APR-51.
- **BR-APR-55** — Trail rows are never updated or deleted; there is no endpoint for it.

### Frontend
- **BR-APR-56** — Policy screen: owner/back_office see list and details read-only; create/edit controls are shown only to super-admin.
- **BR-APR-57** — Clicking Edit opens the form only after the policy's details are loaded, pre-filled with every stored value (subDocType, amounts, auto-approve, chain incl. specific employees) (BL-023).
- **BR-APR-58** — Cancel closes the form and discards unsaved changes; opening the same policy again shows the stored values (BL-023).
- **BR-APR-59** — While the edit form is open, a background refetch of the policy does not overwrite the user's unsaved edits (BL-023).
- **BR-APR-60** — After a successful save the form closes and the policy list and details are refreshed; on error the form stays open with the user's values and the server message.
- **BR-APR-61** — Amount fields are entered and shown in rupees (up to 2 decimals) and converted ×100 to paise for the API; blank = unbounded.
- **BR-APR-62** — Turning on auto-approve hides the chain and sends no chain; turning it off requires ≥ 1 step before save.
- **BR-APR-63** — The edit form sends `subDocType` as currently selected (stored value unless the user changed it); it never substitutes `any` for an untouched field.
- **BR-APR-64** — In the approvals inbox, Reject and Send back ask for a reason (required, pending Q-3) before calling the API; Approve allows an optional note.
- **BR-APR-65** — PR/PO/SCO detail shows the live approval state (level x of N, who can act now) and the approval history (BR-APR-54).

## 6. Cross-module effects
- **PR / PO / SCO status**: mirrored per BR-APR-42..46; owning modules must not write approval-owned statuses.
- **PO reject → PR lines**: reuses the PO cancel path (release PR lines, recompute PR header) — BR-APR-43.
- **Document cancel**: PR/PO/SCO cancel calls into this module inside its own transaction — BR-APR-48.
- **Edit locks**: PR/PO/SCO update endpoints check "no open request" — BR-APR-47.
- **Employees/roles (auth-setup)**: eligibility and inbox depend on role + `isActive`; deactivating the last holder of a role can strand requests (Q-9). BL-018: token refresh keeps the old role, so the role check must read the DB (it does).
- **Costing**: PR amount comes from `averageCostPaise`, which is stale (BL-014) → PRs may route to a lower band.
- **Numbering**: none (requests use ids; the document number is shown from the source doc).
- **Notifications**: none in M1.

## 7. Acceptance criteria
- **AC-01** (BR-APR-01) — Given a back_office user, When they POST createPolicy, Then 403; When they GET getPolicies, Then 200.
- **AC-02** (BR-APR-02) — Given a create body with empty name or priority 0, Then 400; Given a body without subDocType, Then the stored policy has `any`.
- **AC-03** (BR-APR-03) — Given a chain with levels [1,3], Then 400; Given a role step carrying employeeId, Then 400.
- **AC-04** (BR-APR-04) — Given a 2-step chain and client `approvalLevels: 5`, When created, Then stored approvalLevels = 2.
- **AC-05** (BR-APR-05) — Given autoApprove true and chain [], When created, Then 201 with approvalLevels 0; Given autoApprove false and chain [], Then 400.
- **AC-06** (BR-APR-06) — Given a stored policy min ₹50,000, When PATCH max = ₹10,000 only, Then 400.
- **AC-07** (BR-APR-07) — Given an active PR/tooling policy at priority 1, When another active PR/tooling priority-1 policy is created or an inactive one is re-activated, Then 409 `POLICY_PRIORITY_TAKEN`; creating it inactive succeeds.
- **AC-08** (BR-APR-08) — Given a policy with subDocType `tooling`, When PATCH `{ name: "X" }`, Then subDocType is still `tooling` and all other fields unchanged.
- **AC-09** (BR-APR-09) — Given a policy with max ₹1L, When PATCH `{ maxAmountPaise: null }`, Then max is unbounded; When PATCH `{ priority: null }`, Then 400.
- **AC-10** (BR-APR-10) — When PATCH `{}`, Then 400; When PATCH `{ minAmountPaise: 100 }`, Then 200.
- **AC-11** (BR-APR-11) — When PATCH `{ docType: "po" }` on a PR policy, Then docType unchanged (400 or ignored — contract picks one, documented).
- **AC-12** (BR-APR-12) — There is no delete endpoint; When PATCH isActive false, Then the policy no longer matches new submissions.
- **AC-13** (BR-APR-13) — Given a pending request on a 2-step chain, When the policy chain is edited to 1 step, Then the request still needs 2 approvals.
- **AC-14** (BR-APR-14) — When super-admin S updates a policy, Then lastUpdatedBy = S and lastUpdatedAt moves.
- **AC-15** (BR-APR-15) — Given a create body with isSaleOrderLinked true, Then it is rejected (400) or stripped and stored null; Given PR type `sale_order` ₹30,000 and a `sale_order` <₹50k policy, Then that policy matches.
- **AC-16** (BR-APR-16, 17) — Given an active PO/any policy and an active PR/maintenance policy, When a PR of type tooling is submitted, Then neither matches (wrong docType / wrong category).
- **AC-17** (BR-APR-18) — Given policies "<₹10k" and "₹10k–₹50k", When a PR is exactly ₹10,000.00, Then the "₹10k–₹50k" policy matches.
- **AC-18** (BR-APR-19) — Given "any <₹10k, priority 10" and "maintenance, no bound, priority 2", When a ₹5,000 maintenance PR is submitted, Then the maintenance policy wins (tier 2 beats tier 3).
- **AC-19** (BR-APR-20) — Given two tier-3 PR policies at priorities 10 and 11 both covering ₹5,000, Then priority 10 wins.
- **AC-20** (BR-APR-21) — Given a PO whose lines all come from tooling PRs, Then category = tooling; Given lines from tooling and misc PRs, Then category = any.
- **AC-21** (BR-APR-22) — Given no active PR policy matches, When submitted, Then the request uses a 1-level owner chain and the fallback policy is inactive.
- **AC-22** (BR-APR-23) — Given a chain step role floor_supervisor and no active floor_supervisor, When submitted, Then 400 `APPROVAL_NO_ELIGIBLE_APPROVER`, no request, doc still draft.
- **AC-23** (BR-APR-24) — Given PR created by A, When B submits it, Then 403.
- **AC-24** (BR-APR-25) — Given a PR in `approved`, When submitted, Then 409 `APPROVAL_INVALID_SOURCE_STATUS`.
- **AC-25** (BR-APR-26) — Given two simultaneous submits of one draft PR, Then exactly one request exists and the other call gets 409 `APPROVAL_ALREADY_OPEN`.
- **AC-26** (BR-APR-27) — Given a 2-step policy, When submitted, Then request level 1/2, one `submitted` trail at L0, PR `pending_approval` 1/2; Given the mirror update fails, Then no request or trail exists.
- **AC-27** (BR-APR-28) — Given an auto-approve policy, When submitted, Then request `approved`, trails [submitted, auto_approved], PR `approved`, approvedBy null.
- **AC-28** (BR-APR-29) — Given a PR sent back and edited to ₹60,000, When resubmitted, Then a new request id is created with the ≥₹50k policy, and the old request + trail are still readable.
- **AC-29** (BR-APR-30) — Given an approved request, When anyone acts on it, Then 409 `APPROVAL_NOT_PENDING`.
- **AC-30** (BR-APR-31) — Given level 1 = floor_supervisor, When a back_office user approves, Then 403; Given a specific step for employee 5, When employee 6 (same role) approves, Then 403.
- **AC-31** (BR-APR-32) — Given a pending request at role back_office, When employee X is moved from back_office to floor_supervisor, Then X can no longer act and X's inbox no longer shows it.
- **AC-32** (BR-APR-33, 53) — Given back_office B raised a PR whose level 1 = back_office, When B approves, Then 403 `APPROVAL_SELF_APPROVAL` and B's inbox does not list it; Given the owner raised a PR routed to owner, When the owner approves, Then 200.
- **AC-33** (BR-APR-34) — Given chain [back_office, back_office], When B approves L1 and then B approves L2, Then the second call is 403 `APPROVAL_ALREADY_ACTED`.
- **AC-34** (BR-APR-35) — Given a 2-step request, When L1 approves, Then request pending at L2, current approver = step 2, PR still `pending_approval` with level 2/2.
- **AC-35** (BR-APR-36) — When the last level approves, Then request `approved`, completedAt set, PR `approved`, approvedBy = last approver.
- **AC-36** (BR-APR-37) — When reject is sent without notes, Then 400 `APPROVAL_NOTES_REQUIRED` and nothing changes; with notes, Then request `rejected`.
- **AC-37** (BR-APR-38) — When send back with notes, Then request `require_more_info`, PR `draft`, and the creator can edit and resubmit.
- **AC-38** (BR-APR-39) — Given requester R, When R withdraws, Then request `cancelled` and PR `draft`; When an approver tries `cancel`, Then 403.
- **AC-39** (BR-APR-40) — After any action, Then exactly one new trail row exists with level, action, actor, notes; if the mirror write fails, Then neither request nor trail changed.
- **AC-40** (BR-APR-41) — Given two back_office users approve L1 of a 1-level request at the same time, Then one succeeds and the other gets 409 `APPROVAL_NOT_PENDING`, with one `approved` trail row.
- **AC-41** (BR-APR-42) — For each PR outcome (approve, reject, send back, withdraw, doc-cancel), Then PR status = approved / rejected / draft / draft / cancelled.
- **AC-42** (BR-APR-43) — Given a PO built from PR lines, When the PO request is rejected, Then PO `cancelled`, its PR lines back to `pending`, PR header recomputed; When sent back, Then PO `draft`.
- **AC-43** (BR-APR-44) — When an SCO request is sent back, Then SCO status = `draft`.
- **AC-44** (BR-APR-45) — Given a PR approved earlier, then sent back on a later request, Then approvedBy is null and levels show the latest request.
- **AC-45** (BR-APR-46) — When `PATCH /pr/updatepr` sends status `pending_approval` or `approved`, Then 400.
- **AC-46** (BR-APR-47) — Given a pending PR, When its lines or amount are updated, Then 409 `DOC_LOCKED_IN_APPROVAL`.
- **AC-47** (BR-APR-48) — Given a pending PO cancelled by user U with reason "wrong supplier", Then request `cancelled`, trail actor = U, note contains the reason; Given the PO cancel fails, Then the request is still pending.
- **AC-48** (BR-APR-49) — Given an approved PR, When submit is called, Then 409 (BR-APR-25); no endpoint reopens an approved request.
- **AC-49** (BR-APR-50) — After any sequence of actions, Then no request has status partial_ordered, fully_ordered or auto_approved.
- **AC-50** (BR-APR-51) — Given a request whose chain is [floor_supervisor, owner], When a qa_inspector reads it, Then 403; When a floor_supervisor reads it, Then 200.
- **AC-51** (BR-APR-52) — When a back_office user passes another employeeId to getMyPendingApprovals, Then 403; super-admin gets 200.
- **AC-52** (BR-APR-54) — Given a PR with one sent-back and one approved request, When its history is read, Then both requests with their trails are returned.
- **AC-53** (BR-APR-55) — There is no API that updates or deletes a trail row.
- **AC-54** (BR-APR-56) — Given an owner opens Setup → Approval Policies, Then no Create/Edit buttons are shown.
- **AC-55** (BR-APR-57) — Given a stored policy tooling, ₹25,000–₹1,00,000, 2 steps, When Edit is clicked, Then the form shows exactly those values once loaded (no empty flash submitted).
- **AC-56** (BR-APR-58) — Given the user changes the name and clicks Cancel, When they open the same policy again, Then the stored name is shown.
- **AC-57** (BR-APR-59) — Given the edit form is open with unsaved changes, When the window regains focus and the query refetches, Then the unsaved changes remain.
- **AC-58** (BR-APR-60) — Given a save that returns 409, Then the form stays open with the user's values and shows the message.
- **AC-59** (BR-APR-61) — When the user enters min 50000 (₹), Then the API receives 5000000 paise; a stored 5000000 displays as 50,000.
- **AC-60** (BR-APR-62) — Given auto-approve on, When saved, Then the request body has no chain steps and save succeeds.
- **AC-61** (BR-APR-63) — Given a stored tooling policy, When only the name is edited and saved, Then subDocType remains tooling.
- **AC-62** (BR-APR-64) — When the approver clicks Reject in the inbox, Then a reason dialog appears and Confirm is disabled until a reason is typed.
- **AC-63** (BR-APR-65) — Given a PR pending at level 2 of 2, When its detail page opens, Then it shows "Level 2 of 2 — owner" and the history list.

## 8. Screens (frontend)
- **Setup → Approval Policies** (`/setup/approval`): table (name, docType, category, amount band in ₹, priority, active, levels). Filters: docType, active, search. Create/Edit form = BR-APR-56..63.
- **Approvals inbox** (`ApprovalView`): my pending requests with doc number, amount, requester, level x/N; actions Approve / Reject (reason) / Send back (reason). Withdraw is on the document, not the inbox.
- **PR/PO/SCO detail**: Submit for approval (draft, creator only); approval card (level, current approver); Withdraw (requester, while pending); history (BR-APR-54). Edit buttons hidden while pending (BR-APR-47).

## 9. Reports / queries needed
- My pending approvals (exists).
- Approval history per document (BR-APR-54 — new query).
- Pending approvals ageing by approver role (later; see section 10).

## 10. Out of scope / later
- Delegation / out-of-office substitute approvers; escalation after N hours; notifications (WhatsApp/email).
- Parallel approvals ("any 2 of 3"), department-based or supplier-based rules.
- Policy change history table (who changed which threshold) beyond `lastUpdatedBy`.
- Overlap warnings when two policies cover the same band.
- Owner override on any step (Q-9 decides if needed now).
- Approval of GRN, invoices, debit notes, sale orders.

## 11. Open questions (answer inline)

**Q-1 — BL-002: keep `isSaleOrderLinked` as a policy filter?**
PR already has `type = sale_order` and a `saleOrderId`; the policy has both `subDocType` and the flag.
- A) Keep both — flexible ("any SO-linked PR, whatever its type, goes fast"), but two ways to say the same thing; UI dropdown must come back; tier ranking ignores the flag, so results are hard to predict. (ERPNext workflow conditions can test any field.)
- B) Drop the flag; use `subDocType = sale_order` — one way to say it; seed policies 3/4 become `sale_order` with amount bands. (Odoo/SAP B1 approval templates key on doc type + amount/terms, not a separate flag.)
- C) Defer to M4 (Sale Order) — nothing to decide now, but the column stays half-alive.
Recommendation: **B** (sale orders don't exist until M4; revisit then if a tooling PR for a customer order must be fast-tracked).
Answer:

**Q-2 — Can someone approve their own document?** (e.g. back office raises a PR routed to back office)
- A) Never, for anyone — strict; in a plant with one owner, an owner-raised PR routed to owner would be stuck.
- B) Always allowed (current code) — fastest, but one person can raise and approve the same PO. (ERPNext: "Allow Self Approval" per transition, default off.)
- C) Not allowed, except the owner; also one person cannot approve two levels of the same request.
Recommendation: **C**.
Answer:

**Q-3 — Must the approver type a reason when rejecting or sending back?**
- A) Yes, both — requester knows what to fix; audit shows why. (SAP B1 asks for remarks on reject.)
- B) Only for reject.
- C) Optional (current code; inbox sends none).
Recommendation: **A**.
Answer:

**Q-4 — If no policy matches a document, what happens?**
- A) Goes to the owner for approval (current) — nothing slips through.
- B) Blocked with "no approval rule" until super-admin adds one — forces clean config, stops work.
- C) Approved automatically (SAP B1 default when no template applies) — risky.
Recommendation: **A**.
Answer:

**Q-5 — Which amount is compared with policy thresholds?**
- A) PO: total incl. GST; PR: estimated value from item average cost — matches what the owner "signs for".
- B) PO: taxable value excl. GST — thresholds don't move when GST rates change; PR same as A.
Note: PR estimates use a stale average cost today (BL-014), so a PR can route to a lower band.
Recommendation: **A**.
Answer:

**Q-6 — Which category does a PO or SCO use for matching?** (today PO/SCO always use `any`, so the seeded tooling/maintenance PO policies and all SCO policies never match — every SCO goes to the fallback)
- A) PO: the type of its source PRs (mixed → any); SCO: always `subcontracting`, amount = line total.
- B) Add a category field on PO/SCO header, chosen by the buyer.
- C) Drop category-based PO policies; PO by amount only.
Recommendation: **A** (no new field, follows the PR).
Answer:

**Q-7 — Changing a document that is waiting for approval**
- A) Locked while pending; requester can **Withdraw** → document back to draft → edit → resubmit (Odoo "reset to draft"; SAP B1 draft stays editable only before approval).
- B) Editable while pending; any edit auto-cancels the approval and returns it to draft — convenient, but approvers see requests vanish.
- C) Current code: withdraw cancels the whole document; PR edits are not locked at all.
Recommendation: **A**.
Answer:

**Q-8 — What happens to a PO when the approver rejects it?**
- A) PO cancelled, its PR lines go back to "pending" so another PO can be raised (recommended; code today cancels the PO but leaves PR lines stuck).
- B) PO goes back to draft (same as send back) — then reject and send back mean the same.
- C) New PO status `rejected` (terminal) — clearer reports, needs a schema change.
Recommendation: **A**.
Answer:

**Q-9 — A request is stuck because nobody holds the approver role any more (left / deactivated). Who unblocks it?**
- A) Requester withdraws, super-admin fixes the policy or assigns the role, requester resubmits (M1, no new feature).
- B) Owner may approve at any step "on behalf", recorded in the trail (ERPNext System Manager can act on any workflow).
Recommendation: **A** for M1; B to backlog if it happens at UAT.
Answer:

**Q-10 — Who may submit a document for approval?**
- A) Only the person who created it (current code).
- B) Creator or any back_office user (clerk submits for a supervisor who created the PR on the floor).
Recommendation: **A**.
Answer:

## 12. Implementation status
| BR | Status | Test / gap |
|---|---|---|
| 01–04, 07, 11–14, 16–20, 23, 25–27, 30–32, 35–36, 40, 51–52, 55 | done | 19 + submit scenario 1 in `approvalRepository.test.ts`; rest untested |
| 05 | todo | chain `.min(1)` rejects autoApprove + [] (UI sends []) |
| 06 | todo | PATCH checks only the patch, not merged values |
| 08 | todo | BL-022: `updateApprovalPolicySchema` `subDocType .default("any")` |
| 09 | partial | null accepted for amounts; non-nullable nulls unverified |
| 10 | todo | `hasAnyField` ignores min/max (and is always true because of the default) |
| 15 | todo | Q-1; flag still in schema/contract/matching |
| 21 | todo | PO/SCO use `any`; SCO amount = 0 |
| 22 | partial | fallback exists (inactive, priority 9999 — ref doc says 99) |
| 24 | done | Q-10 |
| 28 | partial | approvedBy set to requester today |
| 29 | done | untested |
| 33, 34, 53 | todo | Q-2 |
| 37, 38, 64 | todo | notes optional; inbox sends none |
| 39 | todo | withdraw sets PR/PO `cancelled` instead of `draft` |
| 41 | partial | row lock exists; 400 instead of 409 |
| 42 | partial | withdraw mapping (see 39) |
| 43 | todo | reject bypasses `poRepository.setStatusCancelled` → PR lines stuck |
| 44 | todo | SCO send back stays `require_more_info` |
| 45 | done | untested |
| 46 | todo | PR update allows `pending_approval`/`cancelled` via status field |
| 47 | todo | `prService.update` has no status check (PO is draft-only — ok) |
| 48 | todo | separate transactions; trail actor = requester, not canceller |
| 49, 50 | done | untested |
| 54, 65 | todo | only open-request lookup exists |
| 56 | done | untested |
| 57, 58 | done | untested |
| 59 | todo | effect depends on `policy` object → refetch resets form |
| 60 | done | untested |
| 61 | todo | label says ₹ but raw number is sent as paise |
| 62 | partial | UI sends [] (blocked by 05) |
| 63 | done | fixed with prType→subDocType rename |

## Changelog
- 2026-09-27 v0 — draft created retroactively from as-built code; pulls in BL-002, BL-022, BL-023.
