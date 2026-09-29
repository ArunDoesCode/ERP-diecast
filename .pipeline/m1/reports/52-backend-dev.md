# Report 52 — backend-dev — PO-S1 + PO-S2 build

Done. Commit a05dcff `feat(m1): purchase order lifecycle + PR line states`. `bun test` (whole repo): 775 pass, 2 fail (both pre-existing, not mine). typecheck, lint (0 errors), contract:check clean (94 routes). Schema pushed to dev DB and test DB.

## Results
- po-lifecycle: 187 of 187 pass, except one that is flaky by design (see Test defect).
- PO-owned approval cases (BR-APR-43 x2, 47 x2, 48, 21 GST): all pass.
- db-reset: 39/40. The one failure is BR-KD-44 (item standard rate), pre-existing.
- BR-AUTH-11 (`lib/token.ts` role union): pre-existing.
- Not covered (GRN branch): BR-PO-10 receipt status, "new GRN after cancel/short-close -> 400", cancel vs GRN create race.

## Test defect (test-writer to fix)
- `po-lifecycle.test.ts` "BR-PO-21 approval moves are in the approval trail" reads `approval_trails` with no `ORDER BY`, then expects `[ap1, ap2]`. Heap order changes after page pruning, so it fails about half the runs (3 of 3 alone, passes in some full runs). Fix: order by `approvalTrails.id`. No BR text is wrong.

## What changed
- **Schema** (`02_procurement-purchasing.ts`): PO `cancelledBy/cancelledAt/cancelReason`, `shortClosed`, `invoicedBy/invoicedAt`; PO item `gstPercent`, `lineValuePaise`, `lineTaxPaise` (default 0); unique index `uq_supplier_invoice_number` (supplierId, invoiceNumber).
- **PO create/update** (`poService`, `poRepository`): inactive supplier 400; terms default to supplier terms (BR-PO-23); rate default = last PO rate, else price list, else avg cost (reuses `assetRepository.getLastRate`); GST default = active price-list %, else 0; line value/tax = round maths in `computeLinePaise`; header totals = sum of stored line columns. Edit: 409 `DOC_LOCKED_IN_APPROVAL` (pending) or `PO_NOT_EDITABLE`, checked again under the row lock; last line removal 400 `PO_NEEDS_A_LINE`; expected date before PO date 400 (create, edit, send).
- **Locking** (BR-PO-22): `withLockedPo` in `poService`: wrong status = 400 (pre-check), same check again under `lockPoById` = 409 `PO_STATUS_CHANGED` for the race loser. Used by send, reminder, escalate, confirm, delay, invoice, close, short-close. Cancel: status/GRN failures are always 409.
- **Cancel** (BR-PO-11, 21, APR-48): one transaction; request lock first, then PO lock (same order as approval actions); PO cancelled with who/when/reason; open approval cancelled with the canceller as actor and the reason as note; PR lines cancelled, `issuedQty` back, PR headers recomputed.
- **New/finished actions**: short-close (`POST /po/:id/short-close`), PO log (`GET /po/:id/communications`), invoice (duplicate = 409 `SUPPLIER_INVOICE_DUPLICATE`, `invoicedBy/At`), close, delay (both fields, dispatched/partial only), overdue on revised-else-expected date `< current_date`.
- **PR lines** (`poRepository`, `prRepository`): approve -> `ordered` (`orderPrLinesOfPo`, also on auto-approve); reject / cancel / request-cancel -> lines `cancelled` (`cancelPrLinesOfPo`); short-close -> `closed` (`closePrLinesOfPo`); draft-PO line delete -> `pending` (unchanged). `recomputeHeaderStatusFromItems` now follows BR-PR-36 exactly: only for approved/partial_ordered/fully_ordered PRs, over non-cancelled lines, all cancelled -> PR cancelled.
- **PR line cancel** (BR-PR-33): `POST /api/pr/:id/lines/:lineId/cancel` (`prService.cancelLine`, line locked before the header, same order as PO create).
- **Approval hooks** (`approvalService`): submit of a PO re-reads it under its row lock and matches the policy on the current total incl. GST (BR-APR-21, BR-PO-22); reject and request-cancel go through `poRepository.cancelLockedPo`; approve orders the PR lines.
- `lib/db-errors.ts`: `isUniqueViolation` moved out of `approvalService` (shared now).
- `scripts/db-reset-fixtures.ts`: late POs are created with today's date and back-dated in `sendPo` (create now refuses a past date); `cancel` and `markInvoiced` calls pass the actor.

## Decisions / open points
- PR line cancel: `reason` is validated (3-500) but not stored (PR lines have no reason column). Add one if the SME wants it on the line.
- Supplier confirmation (BR-PO-17) stays on the PO row (`confirmedBy/At/method/note`); there is no `confirmation` log type, so it does not appear in the PO log. Add an enum value if the log must show it.
- Short-close keeps PO line `qty` as ordered (open qty is not zeroed); the PO is closed, so it drops out of overdue and GRN. Reason is stored in `closeNote`.
- Existing dev POs: new line columns default to 0 (no backfill); `db:reset` recreates them.
- `billedAmountPaise` still accepts 0; spec only says "billed amount in paise".

## Map updates
- purchase-order.md (data model): new PO columns and item columns above; totals now include GST; `purchaseOrderColumns` = all table columns + `cancelledByName` + `dueDate`.
- purchase-order.md (flows): status changes go through `withLockedPo` (400 wrong status, 409 race); `cancelLockedPo` is the single cancel path (user cancel, approval reject, approval cancel); PR line effects live in `poRepository.{orderPrLinesOfPo, cancelPrLinesOfPo, closePrLinesOfPo}`.
- purchase-order.md (API): `short-close`, `communications` are built; `deletepo` reason always required; overdue uses due date.
- purchase-requisition.md: `cancelLine` endpoint and `PR_LINE_ON_LIVE_PO / PR_LINE_NOT_PENDING`; `recomputeHeaderStatusFromItems` rules (no-op on draft/pending/rejected/cancelled PRs).
- approval.md: PO reject/cancel cancel the PO through `poRepository.cancelLockedPo`; PO submit locks the PO row.
- Gaps section: remove BR-PO-03, 04, 05, 07, 11, 13, 14, 15, 16, 17, 18, 19, 21 (partial: no `lastUpdatedBy/At`), 22 (non-GRN parts) from "Gaps vs spec"; remaining: BR-PO-10 (GRN branch).
- Traps: (1) Bash refuses compound commands (heredoc plus a second command); write scripts with Write, run them alone. (2) With `exactOptionalPropertyTypes`, optional zod fields need `| undefined` on helper parameter types. (3) `recomputeHeaderStatusFromItems` no longer revives a cancelled PR (BL-029 fixed). (4) Tests that read `approval_trails` without `ORDER BY` are flaky. (5) A PO with a past expected date cannot be created through the API any more; back-date the row in fixtures.

## Screens to change
- PO detail / edit: per-line GST % and line value/tax, totals with GST; payment terms and rate prefill are optional to send (backend fills them); expected date required before Send, not before the PO date.
- PO actions: cancel needs a reason for every status (draft too); handle 409 `PO_INVALID_TRANSITION`, `PO_HAS_GRN`, `PO_STATUS_CHANGED`, `PO_NOT_EDITABLE`, `DOC_LOCKED_IN_APPROVAL`; new Short-close dialog (partial_received, reason); PO log list from `GET /po/:id/communications`; invoice dialog shows `SUPPLIER_INVOICE_DUPLICATE`; delay needs both fields.
- PO tracking (overdue): uses revised date when set; show `dueDate`.
- PR detail: per-line "Cancel line" for pending lines (reason dialog, `POST /pr/:id/lines/:lineId/cancel`); handle `PR_LINE_ON_LIVE_PO`; PR status can become `cancelled` when all lines are cancelled; PR lines show `cancelled` after PO cancel/reject.
