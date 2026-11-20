# Factory flows — assumptions

> Every choice an agent made without the owner, during spec **and** build. Append-only, never renumber.
> Rule for choosing: do what ERPNext / Odoo / SAP do; if they disagree, the stricter one. No option surveys.
> Tag `confirm` = touches money, stock, tax, permissions or what a factory user sees → the owner answers
> yes / no. Rows from the spec phase are listed by name in `OWNER.md` → "Decided for you — please confirm";
> rows from the build are listed in the hand-over. Tag `info` = technical, no answer needed.
> A "no" becomes a card (before freeze) or a normal change request (after).
> Phase = `spec` or `build`. Question names the rule id or area it belongs to.
> Pass 1 rows (spec-analyst). Designers' "Choices made" rows are added in pass 2.

| Id | Date | Phase | Question | Choice | Source | Tag | Owner answer |
|---|---|---|---|---|---|---|---|
| A-01 | 2026-11-20 | spec | Home tiles: which queues (BR-FF-20..30)? | 11 tiles, one per existing queue, each gated by the key that lets the user act on it | benchmark: Odoo activity counts per user (research Q1); brief "own pending work" | confirm | |
| A-02 | 2026-11-20 | spec | Dated tiles split Late / Today / Later (BR-FF-14)? | Yes, red / orange / neutral, by IST day | benchmark: Odoo Late / Today / Future colours (research Q1) | confirm | |
| A-03 | 2026-11-20 | spec | How fresh are Home counts (BR-FF-32)? | Re-read on open / focus, at most 60 s old; no push | standard (no notifications this round, brief) | info | — |
| A-04 | 2026-11-20 | spec | Money on Home tiles (BR-FF-33)? | Counts only, no ₹ totals | stricter: keeps prices off shared screens (BR-FF-06) | info | — |
| A-05 | 2026-11-20 | spec | Page URLs (BR-FF-40, 41)? | `/purchase-requisitions/<id>`, `/purchase-orders/<id>`, `/grn/<id>`; PR-keyed `/purchase-orders/<prId>` removed (no redirect: UAT not started, no saved links); `/purchase-orders/tracking` redirects | standard (one URL per document, ERPNext / Odoo) | info | — |
| A-06 | 2026-11-20 | spec | Which next step per status (BR-FF-44)? | One primary button per status from the table; others secondary; hidden when not allowed | benchmark: ERPNext "Create" menu on submitted docs, buttons only for allowed actions (research Q2, Q6) | confirm | |
| A-07 | 2026-11-20 | spec | "Save and submit" keeps a separate "Save draft" (BR-FF-46)? | Yes, both buttons; failed submit keeps the saved draft (BR-FF-57) | benchmark: ERPNext Save then Submit, SAP draft that waits | confirm | |
| A-08 | 2026-11-20 | spec | Several POs from one Create PO, one fails (BR-FF-58)? | The others stay made; message names the failed supplier | standard: each PO is its own transaction under frozen BR-PO rules | info | — |
| A-09 | 2026-11-20 | spec | Where does History come from (BR-FF-54)? | Existing records only (approval trail, PO log, GRN QA / correction rows, cancel / close fields); no new history table | benchmark: ERPNext / Odoo show the doc's own log; scope rule (no new data) | info | — |
| A-10 | 2026-11-20 | spec | Can an approver without `pr.manage` / `po.manage` open the document, with amounts (BR-FF-53)? | Yes, read-only, while they may read the approval request (BR-APR-51) | benchmark: SAP B1 approver opens the draft; ERPNext approver needs read on the doc (research Q6) | confirm | |
| A-11 | 2026-11-20 | spec | Can the store keeper (`grn.edit_draft`, no `po.manage`) see orders to receive (BR-FF-62)? | Yes: receivable POs with item, qty, dates; never rates or amounts; PO endpoints still need `po.manage` | benchmark: ERPNext Stock User reads Purchase Order, SAP GRPO copies from PO; prices hidden = stricter | confirm | |
| A-12 | 2026-11-20 | spec | Over-receipt in the receive form (BR-FF-66)? | Warning counting earlier receipts, not a block; server rules unchanged (fixes BL-042 on the new form) | frozen GRN rules are the gate | info | — |
| A-13 | 2026-11-20 | spec | Picker order and search (BR-FF-61, 63)? | Oldest due date first; filter by PO number or supplier inside the picker only (not global search) | standard | info | — |
| A-14 | 2026-11-20 | spec | Approve from a preview beside the inbox, without opening the page (BR-FF-81, 82)? | Yes; "Open full page" still available; next row opens after acting | benchmark: SAP decision report opens the draft from the list | confirm | |
| A-15 | 2026-11-20 | spec | Menu badge cap (BR-FF-85)? | Hidden at 0, "99+" above 99 | standard | info | — |
| A-16 | 2026-11-20 | spec | Default menu order and labels (BR-FF-100)? | Home, Approvals, Requisitions, Purchase orders, Goods receipts, Subcontracting, Inventory, Suppliers, Employee directory, Setup | brief: "the build sets the menu order"; follows the document flow | confirm | |
| A-17 | 2026-11-20 | spec | Apply the new menu default to existing installs (BR-FF-101)? | Once, by migration; later Setup → Screens edits win | standard: sync never overwrites UI-owned fields | info | — |
| A-18 | 2026-11-20 | spec | Home route (BR-FF-102)? | `/home`; `/landing` redirects | standard | info | — |
| A-19 | 2026-11-20 | spec | Rows per page (BR-FF-105)? | 50 default; 25 / 50 / 100; remembered per list per browser | brief "more rows"; ERPNext list default 20 with 100/500 choices, raised for a small plant | confirm | |
| A-20 | 2026-11-20 | spec | List columns (BR-FF-106..108)? | As listed in the rules; GRN list never shows money | brief "more columns"; BR-FF-06 | info | — |
| A-21 | 2026-11-20 | spec | Which actions stay dialogs (BR-FF-111)? | One-decision actions (cancel with reason, one QA decision, delay, send, confirm, approve); create / edit / receive are pages | brief "full-page forms instead of pop-ups"; standard | info | — |
| A-22 | 2026-11-20 | spec | Leave a form with unsaved changes (BR-FF-112)? | Ask "Leave without saving?" | standard (ERPNext "Not saved" indicator) | info | — |
