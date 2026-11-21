# Reorder — assumptions

> Every choice an agent made without the owner, during spec **and** build. Append-only, never renumber.
> Rule for choosing: do what ERPNext / Odoo / SAP do; if they disagree, the stricter one. No option surveys.
> Tag `confirm` = touches money, stock, tax, permissions or what a factory user sees → the owner answers
> yes / no. Rows from the spec phase are listed by name in `OWNER.md` → "Decided for you — please confirm";
> rows from the build are listed in the hand-over. Tag `info` = technical, no answer needed.
> A "no" becomes a card (before freeze) or a normal change request (after).
> Owner delegated every decision in chat, 2026-11-20 ("take ur own decision and record them…").
> Links (all read 2026-11-20, from `docs/research/reorder.md`): [ERPN-MR] ERPNext auto material request ·
> [ERPN-PQ] ERPNext projected qty · [ODOO] Odoo reordering rules · [SAP-H] SAP B1 MRP wizard help ·
> [SAP-L] SAP B1 MRP process. "Benchmark silent" = none of the three documents it; project convention used.

| Id | Date | Phase | Question | Choice | Source | Tag | Owner answer |
|---|---|---|---|---|---|---|---|
| A-01 | 2026-11-20 | spec | Who-can-do: who changes settings and presses Check now? | New key `reorder.manage`, seed ow, bo; list and runs need `inventory.view`; the item's reorder qty / min order qty / order multiple are edited with `asset.manage` and seen with `inventory.view` (amended in pre-freeze review, SPEC-04) | ERPNext switch sits in Stock Settings (stock manager) [ERPN-MR]; SAP B1 planner runs the wizard [SAP-H]; project rule: keys, not roles | confirm | delegated (chat 2026-11-20) |
| A-02 | 2026-11-20 | spec | BR-RO-25: may a run order, approve or move stock? | Never; only a draft PR that goes through normal approval | SAP B1 wizard only recommends [SAP-H]; Odoo Manual mode [ODOO]; ERPNext creates only a Material Request [ERPN-MR] | confirm | delegated (chat 2026-11-20) |
| A-03 | 2026-11-20 | spec | BR-RO-01: which items take part? | Active, non-service, reorder level > 0; no supplier needed | ERPNext reorder level per item, no supplier at request stage [ERPN-MR]; SAP B1 item planning fields [SAP-H] | confirm | delegated (chat 2026-11-20) |
| A-04 | 2026-11-20 | spec | BR-RO-07/08: rounding of the raised qty | Up to min order qty, up to the next order multiple, whole for pcs/set, 3 decimals otherwise, always up | SAP B1 order multiple + min order qty [SAP-L]; Odoo multiple qty [ODOO]; unit rules BR-INV-07/08 | confirm | delegated (chat 2026-11-20) |
| A-05 | 2026-11-20 | spec | BR-RO-15/20: switch on with no valid draft owner? | Refused 400 `REORDER_OWNER_INVALID`; switch stays off | Benchmark silent (ERPNext emails a role, Odoo names no recipient [ERPN-MR], [ODOO]); stricter: no orphan drafts | confirm | delegated (chat 2026-11-20) |
| A-06 | 2026-11-20 | spec | BR-RO-10: switch turned on (or hour moved) after today's run hour | Waits for next day, no catch-up (`schedule_changed_at < due`) | Odoo scheduler runs once a day [ODOO]; catch-up benchmark silent; project convention | confirm | delegated (chat 2026-11-20) |
| A-07 | 2026-11-20 | spec | BR-RO-10: retry after a failed scheduled run | Day is used up; "Check now" is the retry | ERPNext emails the error, no auto retry documented [ERPN-MR]; project convention | confirm | delegated (chat 2026-11-20) |
| A-08 | 2026-11-20 | spec | BR-RO-20: owner changed after a PR was raised | Existing drafts keep their requester; new owner gets later drafts | Benchmark silent; PR requester never changes (BR-PR-17) | confirm | delegated (chat 2026-11-20) |
| A-09 | 2026-11-20 | spec | BR-RO-28: person creates a PR for the item while a run reads | Allowed; two drafts possible, owner cancels one | Benchmark silent; project convention (both are drafts a person checks) | info | — |
| A-10 | 2026-11-20 | spec | BR-RO-11: HTTP result of a failed Check now | 201 with run `state: failed` + reason; only busy = 409 | ERPNext reports errors instead of stopping the user [ERPN-MR]; every run is kept (BR-RO-22) | info | — |
| A-11 | 2026-11-20 | spec | BR-RO-21: meaning of "Covered" | Usable stock alone ≤ level but projected > level; shows newest open PR, else PO | ERPNext projected qty [ERPN-PQ] | info | — |
| A-12 | 2026-11-20 | spec | BR-RO-22: which item rows are stored per run | Only raised and needs-a-reorder-qty; OK and covered only counted | Benchmark silent; project convention (table stays small, < 12 000 rows/yr) | info | — |
| A-13 | 2026-11-20 | spec | BR-RO-09: upper bound of the new qty fields | ≤ 1,000,000,000, ≤ 3 decimals | Benchmark silent; project convention (`numeric(14,3)`) | info | — |
| A-14 | 2026-11-20 | spec | BR-RO-27: run stuck in `running` | After 15 min the next start marks it failed "Interrupted – server stopped" | Benchmark silent; project convention | info | — |
| A-15 | 2026-11-20 | spec | Scheduler without a job runner (data.md) | In-process 60 s `setInterval` started in `index.ts`; the DB decides who runs (unique indexes) | Odoo daily scheduler [ODOO]; mechanism benchmark silent; project convention (one Bun process) | info | — |
| A-16 | 2026-11-20 | spec | BR-RO-12: one run at a time | Partial unique index on `state='running'` + stale sweep, not an advisory lock | Benchmark silent; project convention: a visible `running` row (BR-RO-22) | info | — |
| A-17 | 2026-11-20 | spec | BR-RO-10: once per IST day across processes | Unique `scheduled_day` for scheduled runs, `ON CONFLICT DO NOTHING` | Odoo once a day [ODOO]; project convention | info | — |
| A-18 | 2026-11-20 | spec | BR-RO-26: consistent read | One set-based SQL statement, no item locks | Benchmark silent; project convention (no lock cycle with `postStock`) | info | — |
| A-19 | 2026-11-20 | spec | Type of new quantity columns | `numeric(14,3)`, maths in integer thousandths; `reorder_level` stays double | Project convention (`postStock` thousandths, no float) | info | — |
| A-20 | 2026-11-20 | spec | BR-RO-06/07: where the order-qty maths lives | One pure `computeOrderQty`, used by the run and the live list | SAP B1 order multiple + min order qty [SAP-L] | info | — |
| A-21 | 2026-11-20 | spec | BR-RO-17: PR ↔ run link | Only `purchase_requests.reorder_run_id`, unique when set | Project convention (one source, no circular FK) | info | — |
| A-22 | 2026-11-20 | spec | BR-RO-20: settings storage and audit | One-row `reorder_settings` + `reorder_settings_history` | Project convention (`company_settings_history`, BR-SCO-29) | info | — |
| A-23 | 2026-11-20 | spec | Reuse of PR create inside the run | Split `prRepository.createWithItems` into `createWithItemsTx(tx, …)` + old wrapper | Project convention (one transaction per run, BR-RO-16) | info | — |
| A-24 | 2026-11-20 | spec | Path for Check now | `POST /api/reorder/check-now` | Project convention (`end-points.ts`, like `/po/:id/send`) | info | — |
| A-25 | 2026-11-20 | spec | Run in the request or in the background | In the request, one transaction | Benchmark silent; project convention (no job runner, < 100 low items) | info | — |
| A-26 | 2026-11-20 | spec | Live list state filter | Server-side, `stateCounts` in `meta` | Project convention (pagination-contract, PR `statusCounts`) | info | — |
| A-27 | 2026-11-20 | spec | Run detail paging | Not paged; embedded `items` (≤ 500) | Project convention (volume) | info | — |
| A-28 | 2026-11-20 | spec | Source of the owner select | New `GET /api/reorder/owner-candidates` under `reorder.manage` (id, name only) | Project convention (`/setup/employees/search` needs another key) | info | — |
| A-29 | 2026-11-20 | spec | Dry-run view | The live list is the dry run; it saves nothing | SAP B1 simulation saves nothing [SAP-H] | info | — |
| A-30 | 2026-11-20 | spec | Where run history lives | Separate list `/inventory/reorder/runs`, linked from the last-run strip | Project convention (design-system list rule) | info | — |
| A-31 | 2026-11-20 | spec | Default quick filter on Reorder | "Will be ordered" | Project convention (action items first) | info | — |
| A-32 | 2026-11-20 | spec | After Check now | Goes to the new run's detail | Project convention (BR-RO-23 next step) | info | — |
| A-33 | 2026-11-20 | spec | Settings form shape | Dialog, 3 fields | Project convention (design-system: ≤ 6 fields = dialog) | info | — |
| A-34 | 2026-11-20 | spec | Badge colours | New `reorderItem` and `reorderRun` status docs, existing tones only | Project convention (BR-DS-03) | info | — |
| A-35 | 2026-11-20 | spec | Item form layout of new fields | 2 × 2 grid next to reorder level, unit suffix, helper text for 0 | Project convention (item form) | info | — |
| A-36 | 2026-11-20 | spec | PR shows its origin | Neutral "Reorder" tag + "Raised by Run n" link; PR list filter "Raised by reorder" | Project convention | info | — |
| A-37 | 2026-11-20 | spec | Owner becomes invalid while the switch is on | Danger note on the Reorder strip "Draft owner can't receive drafts – the next check will fail" | Project convention; ERPNext alerts purchase on errors [ERPN-MR] | info | — |
| A-38 | 2026-11-20 | spec | BR-RO-16: what failure text is stored and shown | Closed list: `OWNER_MISSING`, `OWNER_INACTIVE`, `OWNER_NO_PR_RIGHT`, `RUN_ERROR`, `INTERRUPTED`, each with one fixed plain text; raw error only in the server log | ERPNext sends error details to the purchase manager [ERPN-MR]; stricter project convention: no internals to the client (api-standards) | info | — |
| A-39 | 2026-11-20 | spec | BR-RO-29: one computed line fails the PR checks | Item skipped "invalid line", run continues with the rest | ERPNext reports auto-request errors and still raises the rest [ERPN-MR] (per-item behaviour not on the page); project convention | confirm | delegated (chat 2026-11-20) |
| A-40 | 2026-11-20 | spec | BR-RO-13: more than 500 low items | PR takes the 500 largest shortfalls (item id tiebreak); rest stored `deferred`, raised by the next run | Benchmark silent; project convention (PR line cap 500) | confirm | delegated (chat 2026-11-20) |
| A-41 | 2026-11-20 | spec | Security: PR/PO numbers on the list and run | `inventory.view` holders see number + status only (no estimate, no lines); link only with the PR / PO view right, else plain text | Benchmark silent; project convention (BR-DS-27 hide what the key does not allow) | confirm | delegated (chat 2026-11-20) |
| A-42 | 2026-11-20 | spec | BR-RO-30: approval of a reorder PR | Same approval rules as any PR, no reorder exception; draft owner = requester; the system never approves. Note: approval BR-APR-33 has no self-approval block today, so "maker ≠ approver" means only what BR-APR-33/61 already say | SAP B1 MRP only recommends, documents then follow normal approval [SAP-H]; project rules BR-APR-24/33/39/61 | confirm | delegated (chat 2026-11-20) |
| A-43 | 2026-11-20 | spec | BR-RO-31: stock list `belowReorder` vs reorder state | Stock flag (stock alone) stays information only; reorder state (stock + on the way) decides | ERPNext shows actual and projected qty, reorder uses projected [ERPN-PQ] | info | — |
| A-44 | 2026-11-20 | spec | BR-RO-15/20: can the owner be cleared? | Yes while the switch is off; clearing while on → 400 `REORDER_OWNER_INVALID` | Benchmark silent; project convention (same guard as A-05) | info | — |
| A-45 | 2026-11-20 | spec | BR-RO-02: when is "needs a reorder qty" listed? | Only when projected ≤ level; otherwise OK / Covered | ERPNext acts only at or below the level [ERPN-MR] | info | — |
| A-46 | 2026-11-20 | spec | BR-RO-10: scheduled start meets a busy run | Not recorded, day not used, retried next tick (60 s) the same IST day | Benchmark silent; project convention | info | — |
| A-47 | 2026-11-20 | spec | BR-RO-17: client sends `reorderRunId` on a PR body | 400 "Validation failed" from the `.strict()` schema (the project's zod error has no code field) | Project convention (`app.ts` ZodError handler) | info | — |
| A-48 | 2026-11-20 | spec | BR-RO-04: invoiced POs | Excluded from on the way, like `fully_received` and `closed` | Project rule: invoiced only after full receipt (purchase-order BR-PO-15) | info | — |
| A-49 | 2026-11-20 | spec | Screens review round (DES-002/004/005/006) | Last-run strip in muted text; list empty state "Nothing is low right now"; "Needs a reorder qty" badge = warning (replaces danger in A-34); tablet keeps SKU, Usable, Projected, State | Project convention (design-system review) | info | — |
| A-50 | 2026-11-20 | spec | How the screen knows the owner went invalid (A-37) | Read-only `draftOwnerValid: boolean` on `GET /api/reorder/settings`, same check as owner-candidates | Project convention (one owner check) | info | — |
| A-51 | 2026-11-20 | spec | Run payload for DocumentFlow | Run carries `po: {id, poNumber, status}` (newest PO linked to its PR lines) and `itemsDeferred` | Project convention (DocumentFlow run → PR → PO) | info | — |
| A-52 | 2026-11-20 | spec | Mapping of unique-index clashes | 23505 on the one-running index → 409 `REORDER_RUN_BUSY`; 23505 on `scheduled_day` → silent in the timer | Project convention (`isUniqueViolation`) | info | — |
| A-53 | 2026-11-20 | spec | Query shapes (PERF-01/02/04) | Partial index `idx_item_master_reorder` where level > 0; open POs filtered before joining lines; PR lines and run items inserted in batches | Project convention (performance review) | info | — |
| A-54 | 2026-11-21 | build | Run total above the money limit (BR-RO-29) | The line that would push the PR estimate over the max money limit becomes `invalid_line`; the run goes on with the rest | SAP B1 MRP flags lines it cannot convert and still creates the rest [SAP-L]; ERPNext auto material request skips failing items [ERPN-MR] | confirm | — |
| A-55 | 2026-11-21 | build | 500-line cap order (BR-RO-13) | Invalid lines are set aside first; valid lines fill up to 500; the smallest valid shortfalls are deferred | ERPNext auto material request raises every valid item; cap is ours, so valid lines get the slots (benchmark silent on caps) | info | — |
| A-56 | 2026-11-21 | build | Cleared draft owner in history (BR-RO-20) | Saved as "none" in the before → after audit text | Project convention (audit text) | info | — |
| A-57 | 2026-11-21 | build | Scheduled run failed on a bad owner (BR-RO-10/12/15) | Uses that day's scheduled slot; no retry until the next day; "Check now" still works after the owner is fixed | ERPNext scheduler daily jobs don't retry a failed day [ERPN-MR]; Odoo scheduler runs once per interval [ODOO] | confirm | — |

[ERPN-MR]: https://docs.frappe.io/erpnext/user/manual/en/auto-creation-of-material-request
[ERPN-PQ]: https://docs.frappe.io/erpnext/user/manual/en/projected-quantity
[ODOO]: https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/warehouses_storage/replenishment/reordering_rules.html
[SAP-H]: https://help.sap.com/saphelp_sbo92/helpdata/en/5a/6957d864b3458ea5b48aa0b8249e54/content.htm
[SAP-L]: https://learning.sap.com/courses/managing-logistics-in-sap-business-one/exploring-the-materials-requirements-planning-mrp-process
