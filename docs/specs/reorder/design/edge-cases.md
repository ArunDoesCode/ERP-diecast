# Reorder — edge cases

> Written by spec-analyst from `docs/research/reorder.md` → "Edge cases seen in the products", the
> delegated owner cards (chat 2026-11-20, no interview) and the designers' files. Checked by spec-reviewer:
> every row names a rule. Tests are named by rule id, so the rule id is also the test id. The owner sees only the count.

Source: **benchmark** (what ERPNext / Odoo / SAP do) · **owner** (an answered card — here the recommended
option, pre-approved in chat 2026-11-20) · **invariant** (money in paise, stock only through the ledger,
permission + audit on state changes). Links: `docs/research/reorder.md`.

| # | Case | What the system does | Source | Rule |
|---|---|---|---|---|
| E-01 | Item has a reorder level but reorder qty 0 | Never raised; listed "Needs a reorder qty" on the screen and in the run | benchmark (ERPNext needs reorder qty) | BR-RO-02 |
| E-02 | Item inactive, a service, or reorder level 0 | Not checked | benchmark (ERPNext, SAP B1: planning fields per item) | BR-RO-01 |
| E-03 | Item has no supplier | Still raised; a PR has no supplier | benchmark (ERPNext: no supplier at request stage) | BR-RO-01 |
| E-04 | Metal sitting at a job worker or in the scrap yard | Does not count as usable stock | owner (card 2) | BR-RO-03 |
| E-05 | Item has no ledger rows at all | Usable stock 0 → low if level > 0 | invariant (stock = ledger) | BR-RO-03 |
| E-06 | Stock exactly at the reorder level | Low ("at or below") | benchmark (ERPNext: reaches the reorder level) | BR-RO-05 |
| E-07 | Draft PR for the item already open | Counted as on the way, nothing new raised | owner (card 3) | BR-RO-04, 18 |
| E-08 | PO partly received | Only PO qty − accepted qty counts | benchmark (ERPNext projected qty: open PO qty until received) | BR-RO-04 |
| E-09 | PO received more than ordered | Remaining counts as 0, never negative | invariant | BR-RO-04 |
| E-10 | PO short-closed or cancelled | Its remaining qty stops counting | benchmark (ERPNext projected qty) | BR-RO-04 |
| E-11 | PR line already turned into a PO line | Counted once, through the PO | invariant (no double count) | BR-RO-04 |
| E-12 | Request raised, then stock arrives before it is ordered | Draft still counts; owner cancels it by hand | benchmark (ERPNext projected qty) | BR-RO-18 |
| E-13 | Raised PR cancelled or rejected, item still low | Next run raises the item again | invariant (only open documents count) | BR-RO-19 |
| E-14 | Run twice the same day (Check now after the daily run) | Second run raises nothing new for covered items | benchmark (Odoo merges repeated demand) | BR-RO-18 |
| E-15 | Stock negative after an adjustment | Order qty grows to cover the gap to the level | owner (card 4) | BR-RO-06 |
| E-16 | Min order qty above the reorder qty | Raised at the min order qty | benchmark (SAP B1 min order qty) | BR-RO-07 |
| E-17 | Qty not a whole order multiple | Rounded up to the next multiple | benchmark (SAP B1 order multiple; Odoo multiple qty) | BR-RO-07 |
| E-18 | Computed qty 12.5 on a pcs item, or 4 decimals on kg | Rounded up to 13 / to 3 decimals | invariant (unit rules BR-INV-07/08) | BR-RO-08 |
| E-19 | Order multiple 2.5 on a pcs item, negative qty, or above 1,000,000,000 | 400, item not saved | invariant | BR-RO-09 |
| E-20 | Server down at the run time | One run when it comes back, same IST day | owner (card 5) | BR-RO-10 |
| E-21 | Switch turned on, or hour moved, after today's run time | First run next day, no catch-up | benchmark silent; project convention | BR-RO-10 |
| E-22 | Scheduled run fails | Day used up; Check now is the retry | benchmark silent (ERPNext only emails the error); project convention | BR-RO-10 |
| E-23 | Two server processes reach the run time together | Only one run for the day | invariant | BR-RO-10, 12 |
| E-24 | Double click on Check now, or Check now during the daily run | Second start 409 "A check is already running", nothing saved | invariant | BR-RO-12 |
| E-25 | Check now run fails (owner inactive, DB error) | 201 with the run in state failed and a plain reason | benchmark (ERPNext reports auto-request errors to purchase instead of stopping) | BR-RO-11, 16 |
| E-26 | Nothing is low | Run done "Nothing to order", no PR | benchmark (SAP B1 wizard: no recommendation) | BR-RO-13 |
| E-27 | Several items low at once | One draft PR, one line per item | owner (card 6) | BR-RO-13 |
| E-28 | Turn switch on with no draft owner | 400, switch stays off | benchmark silent; project convention (no orphan drafts) | BR-RO-15 |
| E-29 | Draft owner made inactive or loses PR rights after setup | Run fails with reason, no PR | owner (card 1) | BR-RO-15 |
| E-30 | Owner chosen who cannot use requisitions | 400 under the owner field | invariant (permission) | BR-RO-20 |
| E-31 | Draft owner changed after a PR was raised | Old PR keeps its requester; new owner gets later drafts | invariant (PR requester never changes, BR-PR-17) | BR-RO-20 |
| E-32 | Database error on line 3 of the PR | Whole PR rolled back, run failed, next run raises all | invariant | BR-RO-16 |
| E-33 | Server stopped mid-run (run stuck "running") | Marked failed "Interrupted" at the next start after 15 min | invariant | BR-RO-27 |
| E-34 | Stock posted while the run reads | Either fully seen or not; PR matches the run | invariant | BR-RO-26 |
| E-35 | Person creates a PR for the same item while the run reads | Two drafts possible; owner cancels one | benchmark silent; project convention | BR-RO-28 |
| E-36 | Another `pr.manage` user edits or submits the reorder PR | 403 (requester only) | invariant | BR-RO-17 |
| E-37 | Client sends a run link on a PR create or edit | 400 "Validation failed" (unknown key, strict body) | invariant | BR-RO-17 |
| E-38 | Floor supervisor presses Check now / opens settings | 403; button not shown | invariant | BR-RO-23, 24 |
| E-39 | User without stock view opens the list | 403 | invariant | BR-RO-24 |
| E-40 | Run tries to order, approve or move stock | Never: only a draft PR | benchmark (SAP B1 wizard only recommends; Odoo Manual) | BR-RO-25 |
| E-41 | Item covered only because of open documents | Shown "Covered by <PR/PO no.>" | benchmark (ERPNext projected qty) | BR-RO-21 |
| E-42 | Future demand (sales orders) would push stock low | Not considered; only stock + open PR/PO | benchmark (Odoo visibility days — not copied, brief excludes forecasting) | BR-RO-05 |
| E-43 | More than 500 items low in one run | 500 largest shortfalls on the PR, rest listed "deferred to next run" | benchmark silent; project convention (PR line cap) | BR-RO-13 |
| E-44 | A computed line fails the PR checks (qty or estimate out of range) | Item skipped "invalid line", run goes on | benchmark silent; project convention | BR-RO-29 |
| E-45 | Run hits a database error | Fixed text "Something went wrong, nothing was saved"; raw error only in the server log | invariant (no internals to the client) | BR-RO-16 |
| E-46 | Owner cleared while the switch is on | 400, nothing saved | invariant (no orphan drafts) | BR-RO-15 |
| E-47 | Daily start meets a Check now still running | Not recorded, day not used; retried next minute | benchmark silent; project convention | BR-RO-10 |
| E-48 | Item with no reorder qty but stock above level | "OK", not listed in the run | benchmark (ERPNext acts only below the level) | BR-RO-02 |
| E-49 | PO already invoiced | Its remaining qty no longer counts | invariant (invoiced comes after full receipt) | BR-RO-04 |
| E-50 | Floor supervisor sees "Covered by PR-…" | Number and status as plain text, no link, no estimate | invariant (permission) | BR-RO-21, Security |
| E-51 | Draft owner is also an approver on the chain | Same approval rules as any PR, no exception | invariant | BR-RO-30 |
| E-52 | Stock list says "below reorder" but Reorder says "Covered" | Stock flag is information only; reorder state decides | benchmark (ERPNext shows actual and projected qty side by side) | BR-RO-31 |
