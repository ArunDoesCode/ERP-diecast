# RFQ, quotes, award and rate contracts — edge cases

> Written by spec-analyst from `docs/research/rfq.md` → "Edge cases seen in the products", the coordinator's
> answers to the designers (2026-11-20) and the designers' files. Checked by spec-reviewer: every row names a rule.
> Tests are named by rule id, so the rule id is also the test id. The owner sees only the count.
> Owner delegated every decision (D-028); "owner" rows follow a card answered A.

Source: **benchmark** (what ERPNext / Odoo / SAP do) · **owner** (an answered card or interview answer) ·
**invariant** (money in paise, stock only through the ledger, permission + audit on state changes).

| # | Case | What the system does | Source | Rule |
|---|---|---|---|---|
| E-01 | PR not approved, or PR line already on a PO / cancelled | Not in the pick list; API → 400 `RFQ_LINE_NOT_PENDING` | benchmark (ERPNext RFQ from submitted MR only) | BR-RFQ-01 |
| E-02 | Quote typed with no RFQ | Impossible: a quote is entered only on a sent RFQ for one of its suppliers | benchmark (ERPNext: quote without RFQ does not count) | BR-RFQ-12 |
| E-03 | Quote valid-till passed before award | Shown greyed "Expired", award refused 409 `QUOTE_EXPIRED`; reconfirm = cancel + new quote | benchmark (ERPNext reconfirm, stricter) | BR-RFQ-22, 26 |
| E-04 | Buyer wants to order less than quoted | Not possible: RFQ and PO qty = PR line remaining qty (moved to "Not now") | benchmark (ERPNext allows; frozen BR-PO-02 wins) | BR-RFQ-03, 28 |
| E-05 | Contract quantity used up | Next PO line past agreed × (1 + allowance) → 409 `CONTRACT_QTY_EXCEEDED` | owner (card 5) | BR-RFQ-52 |
| E-06 | Contract past valid-to | Counted expired the next day with no action; never used for a PO | benchmark (SAP posting-date check) | BR-RFQ-47 |
| E-07 | Approved PO on a contract is cancelled | Its qty leaves the contract's ordered qty | benchmark (ERPNext, SAP) | BR-RFQ-53 |
| E-08 | PO made by an award is cancelled or rejected | RFQ line stays "awarded" showing the PO cancelled; PR line cancelled; new PR needed | benchmark (frozen BR-PO-11) | BR-RFQ-33 |
| E-09 | Contract terminated early | Used through the termination date, never after; earlier POs keep their rate | benchmark (SAP start..termination) | BR-RFQ-48 |
| E-10 | Termination date before today or after valid-to | 400 | benchmark (SAP) | BR-RFQ-48 |
| E-11 | Contract rate 0 or blank | 400 (rate ≥ 1 paise) | benchmark (stricter than Odoo, which keeps 0) | BR-RFQ-41 |
| E-12 | Second contract for the same supplier + item on overlapping dates | Activation refused 409 `CONTRACT_OVERLAP` naming the other contract | benchmark (none documents it; stricter) | BR-RFQ-46 |
| E-13 | RFQ ends with quotes that won nothing | Quotes become `not_awarded`, kept, never deleted | benchmark (Odoo asks cancel / keep; ERPNext keeps) | BR-RFQ-34 |
| E-14 | Buyer drafts a PO straight from a PR line that is on an open RFQ | 409 `PR_LINE_ON_OPEN_RFQ` | owner (card 1) | BR-RFQ-02 |
| E-15 | Same PR line added to a second open RFQ | 409 `PR_LINE_ON_OPEN_RFQ` | owner (card 1) | BR-RFQ-02 |
| E-16 | PR line cancelled after send, buyer tries to award it | 409 `RFQ_LINE_STALE` | benchmark (ERPNext: cancelled source cannot make a PO) | BR-RFQ-11 |
| E-17 | PR line cancelled after send, other lines awarded | Cancelled line marked `dropped` in the same award, RFQ can finish | benchmark (Odoo clears alternatives at confirm) | BR-RFQ-11, 34 |
| E-18 | Quote typed as draft before the due date, submitted after it | Accepted, marked late (judged at submit) | benchmark (ERPNext no deadline block) | BR-RFQ-17 |
| E-19 | Supplier revises its price | Old quote cancelled with reason, new quote entered; 409 `QUOTE_EXISTS` while old is live | benchmark (ERPNext cancel + amend) | BR-RFQ-13 |
| E-20 | Quote with every line "not quoted" submitted | 400 `QUOTE_EMPTY` | benchmark (ERPNext needs one item row) | BR-RFQ-18 |
| E-21 | Cancel a quote that already has an awarded line | 409 `QUOTE_AWARDED` | benchmark (ERPNext: linked document blocks cancel) | BR-RFQ-19 |
| E-22 | Lowest rate is not lowest once freight is added | Landed rate (rate + freight per unit) decides; GST shown, not added | owner (card 2) | BR-RFQ-21 |
| E-23 | Two suppliers tie on landed rate | Fewer lead days wins, then earlier submit | benchmark (ERPNext: weigh lead time) | BR-RFQ-23 |
| E-24 | Award to a supplier that is not lowest, no reason | 400 `AWARD_REASON_REQUIRED` | owner (card 3) | BR-RFQ-27 |
| E-25 | Supplier deactivated after quoting | Not eligible for lowest; award → 409 `SUPPLIER_INACTIVE_STALE` | benchmark (ERPNext disabled supplier blocks PO) | BR-RFQ-22, 26 |
| E-26 | Winning supplier has an active contract for the item | PO line takes the contract rate, linked to the contract, even when the contract rate is higher than the quote | benchmark (SAP B1 auto-fill) | BR-RFQ-29 |
| E-27 | Award to a contract supplier would pass the contract cap | Whole award fails 409 `CONTRACT_QTY_EXCEEDED`, nothing saved | owner (card 5) | BR-RFQ-32, 52 |
| E-28 | Quote has freight for the lot | Written into the draft PO notes, not added to the PO amount | benchmark (ERPNext / Odoo: freight is a separate charge, not the item rate) | BR-RFQ-30 |
| E-29 | Award of two lines, second fails | 409 (e.g. `RFQ_LINE_STALE`), no PO, first line not awarded | invariant | BR-RFQ-32 |
| E-30 | Award PO has no expected delivery date | Saved empty; the PO module asks for it before sending | benchmark (frozen BR-PO-18) | BR-RFQ-28 |
| E-31 | Cancel an RFQ that has an awarded line | 409 `RFQ_HAS_AWARD`; use close | benchmark (ERPNext: no cancel once a PO came from it) | BR-RFQ-36 |
| E-32 | Close an RFQ with open lines | Open lines dropped, PR lines free for a PO or a new RFQ | benchmark (Odoo cancel alternatives) | BR-RFQ-35 |
| E-33 | Print a draft or cancelled RFQ; reprint after award | Draft / cancelled → 409; sent onward (incl. awarded, closed) → prints | benchmark (ERPNext prints submitted RFQ) | BR-RFQ-08 |
| E-34 | Supplier sheet could reveal a rival | Each sheet carries only its own supplier, no rates, no contract | benchmark (ERPNext per-supplier RFQ print) | BR-RFQ-08 |
| E-35 | 10 suppliers on a 1024 px tablet | Each line shows every supplier as a row, no sideways scroll | benchmark (Odoo compare grouped by product) | BR-RFQ-20 |
| E-36 | Change the rate of an active contract | 409 `CONTRACT_NOT_EDITABLE` | benchmark (ERPNext submitted blanket order locked; stricter than Odoo) | BR-RFQ-44 |
| E-37 | Activate a contract whose valid-to is past | 400 | benchmark (SAP validity) | BR-RFQ-45 |
| E-38 | Draft PO tied to a contract that ended | Submit → 409 `CONTRACT_NOT_ACTIVE` until the line is re-priced | benchmark (SAP posting date inside validity) | BR-RFQ-54 |
| E-39 | Short-closed PO on a contract | Full PO qty stays counted as ordered | benchmark (ERPNext ordered qty from submitted PO) | BR-RFQ-53 |
| E-40 | Contract with no agreed qty | Rate-only; no cap | benchmark (ERPNext zero-qty blanket order) | BR-RFQ-52 |
| E-41 | Alloy price changes mid-month | Terminate the contract, activate a new one | owner (card 7) | BR-RFQ-42 |
| E-42 | Back office types a rate different from the contract | 403 | owner (card 4) | BR-RFQ-51 |
| E-43 | Owner overrides the contract rate with no reason | 400 `OVERRIDE_REASON_REQUIRED` | owner (card 4) | BR-RFQ-55 |
| E-44 | Stores user asks the PO rate suggestion for a contract item | Gets the next source, never the contract rate | benchmark (ERPNext / SAP: contract readable only with its permission) | BR-RFQ-56 |
| E-45 | Back office tries to create or activate a contract | 403 | owner (card 6) | BR-RFQ-70 |
| E-46 | User with award right but no PO right awards | 403, nothing saved | invariant | BR-RFQ-70 |
| E-47 | Two users award the same line at once | One PO made, the other gets 409 | invariant | BR-RFQ-72 |
| E-48 | Two POs approved at once past the contract cap | One approves, the other 409 | invariant | BR-RFQ-72 |
| E-49 | Rate "245.5" sent to the API | 400, integer paise expected | invariant | BR-RFQ-73 |
| E-50 | Any state change (send, award, close, override, terminate…) | Stores who, when and the reason | invariant | BR-RFQ-71 |
| E-51 | Edit or submit a draft quote after the RFQ was closed or awarded | 409 `RFQ_INVALID_STATUS` (RFQ re-read under lock) | benchmark (ERPNext: quotation on a closed RFQ cannot proceed) | BR-RFQ-12 |
| E-52 | Quote PATCH carries a line of another RFQ | 400 `QUOTE_LINE_INVALID` | benchmark (ERPNext quotation rows map to its RFQ) | BR-RFQ-12 |
| E-53 | Draft quote still open when the RFQ ends | Set `cancelled` "RFQ ended" in the same save | benchmark (Odoo cancels alternatives at confirm) | BR-RFQ-38 |
| E-54 | Buyer cancels the lowest submitted quote so a favoured one wins | Needs `rfq.award` (403 otherwise); the cancelled quote stays listed with who, when, reason | benchmark (ERPNext separate cancel right; stricter) | BR-RFQ-19, 24 |
| E-55 | Contract-linked PO line sent with a different GST % or uom | 400 `CONTRACT_LINE_LOCKED_FIELD`, even for the owner | benchmark (SAP B1 agreement fills the line) | BR-RFQ-57 |
| E-56 | Draft PO made by an award | Normal submit and approval, no shortcut | benchmark (ERPNext / Odoo normal PO) | BR-RFQ-39 |
| E-57 | Freight or line value above the limit | 400 `AMOUNT_TOO_LARGE`, nothing saved | invariant (money limit) | BR-RFQ-74 |
| E-58 | Internal RFQ notes on a supplier sheet | Never printed | benchmark (ERPNext print format chooses fields) | BR-RFQ-08 |
| E-59 | User with only `rfq.view` opens the comparison | Sees quotes, not the last PO rate or contract rate | benchmark (ERPNext doctype read permission) | BR-RFQ-20 |
| E-60 | Inactive item on a contract line | 400 `CONTRACT_LINE_INVALID` | benchmark (ERPNext disabled item blocks) | BR-RFQ-41 |
| E-61 | Inactive supplier on a new contract | 400 `SUPPLIER_INACTIVE` | benchmark (ERPNext disabled supplier blocks) | BR-RFQ-40 |
| E-62 | Contract activated with a future valid-from | Allowed; used for POs only from valid-from | benchmark (SAP validity check) | BR-RFQ-45 |
| E-63 | Cancel / close / terminate reason under 3 characters | 400 schema, nothing changes | invariant (reason 3–500) | BR-RFQ-19, 35, 36, 44, 48 |
| E-64 | Supplier deactivated between draft and send | Send → 409 `SUPPLIER_INACTIVE_STALE` naming the supplier | benchmark (ERPNext disabled supplier) | BR-RFQ-09 |

Counts: benchmark 46 · owner 10 · invariant 8 · total 64.
