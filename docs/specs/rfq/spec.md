---
module: rfq
status: frozen            # draft | frozen (set only by /freeze; change requests keep it frozen)
version: 1
frozen_on: 2026-11-20
owner: Arun
depends_on: [purchase-requisition, purchase-order, suppliers, approval, auth-setup, inventory, grn]
brief: docs/briefs/rfq.md
research: docs/research/rfq.md
---

# Request for quotation (RFQ), quotes, award and rate contracts

> Agent layer. The owner reads `OWNER.md`, not this file. ≤ 400 lines (above that: split by sub-module).
> Plain words, one sentence per rule. Tables and columns: `design/data.md`. Endpoints: `design/api.md`.
> Screens: `design/screens.md`. Code locations and history: `docs/modules/<module>.md` (not written yet).
> Owner delegated every decision on 2026-11-20 (brief, D-028). Every owner-type point is decided with the
> recommended option (cards in `OWNER.md`); agent choices are in `assumptions.md`.

## Summary
Purchase picks pending lines of approved PRs, asks several suppliers for a price (RFQ, printed — no email),
types each supplier's quote, compares them side by side, and awards each line to one supplier; the award
makes one draft PO per winning supplier with the quoted rate. A rate contract fixes a supplier's rate (and
optionally a quantity) for an item over dates, and every PO to that supplier for that item uses it.
Done on the floor = no PO rate is typed from a phone call: it comes from a quote, a contract, or a logged override.
Example data used below: PR-2026-11-4 line 1000 kg ADC12 ingot, GST 18 %. Quotes:
S1 Bharat Alloys ₹245.00/kg (24,500 paise), freight ₹2,000 for the lot, lead 7 days;
S2 Sri Metals ₹243.00/kg, freight ₹5,000, lead 10 days; S3 Om Castings ₹250.00/kg, no freight.
Landed per kg (rate + freight ÷ qty): S1 24,700 · S2 24,800 · S3 25,000 → S1 is lowest.
Contract RC-2026-12-1: S1, ADC12 ₹244.00/kg, agreed 5000 kg, 01-11-2026 to 31-12-2026, allowance 0 %
(so it is active when RFQ-2026-11-1 is awarded on 26-11-2026).

## Who can do what
| Action | Key | Seed roles |
|---|---|---|
| view RFQs, quotes, comparison; print RFQ sheets | `rfq.view` | owner, back_office |
| create / edit / send / cancel RFQ; enter, edit, submit quotes; cancel a draft quote; close RFQ | `rfq.manage` | owner, back_office |
| cancel a submitted quote | `rfq.manage` **and** `rfq.award` | owner, back_office |
| award lines → draft POs | `rfq.award` **and** `po.manage` (two guards, both required) | owner, back_office |
| view rate contracts and fulfilment | `contract.view` | owner, back_office |
| see contract rates and last PO rate in the PO rate suggestion, RFQ detail and comparison | `po.manage` **or** `contract.view` | owner, back_office |
| create / edit draft / activate / terminate rate contract | `contract.manage` | owner |
| put a PO rate different from the active contract rate | `contract.override_rate` | owner |
Super-admin passes every key (BR-AUTH-09). Award checks `rfq.award` first, then `po.manage`; missing either → 403
and nothing is saved (BR-RFQ-70). Seed split follows card C6 (answered A).

## Flow
RFQ:
| From | Action | To | Rule |
|---|---|---|---|
| — | create from PR lines | draft | BR-RFQ-01..05 |
| draft | edit lines / suppliers | draft | BR-RFQ-06 |
| draft | send (lock + print) | sent | BR-RFQ-07, 08 |
| sent, partially_awarded | award some lines | partially_awarded | BR-RFQ-25..33 |
| sent, partially_awarded | award last open line | awarded (final) | BR-RFQ-34 |
| sent, partially_awarded | close (drop open lines) | closed (final) | BR-RFQ-35 |
| draft, sent (nothing awarded) | cancel | cancelled (final) | BR-RFQ-36 |

Quote (one per supplier per RFQ):
| From | Action | To | Rule |
|---|---|---|---|
| — | enter | draft | BR-RFQ-12..17 |
| draft | submit | submitted (frozen) | BR-RFQ-18 |
| draft (`rfq.manage`), submitted with no line awarded (`rfq.award` too) | cancel with reason | cancelled (final) | BR-RFQ-19 |
| submitted | RFQ line awarded to it | awarded on that line | BR-RFQ-31 |
| submitted | RFQ ends, nothing of it awarded | not_awarded (final) | BR-RFQ-34, 38 |
| draft | RFQ becomes awarded, closed or cancelled | cancelled (final, system reason) | BR-RFQ-38 |

Rate contract:
| From | Action | To | Rule |
|---|---|---|---|
| — | create | draft | BR-RFQ-40..43 |
| draft | edit / cancel | draft / cancelled | BR-RFQ-44 |
| draft | activate | active | BR-RFQ-45, 46 |
| active | today > valid to (computed, not stored by hand) | expired | BR-RFQ-47 |
| active | terminate with reason | terminated (final) | BR-RFQ-48 |

## Rules
| ID | Rule | Example (given → then) |
|---|---|---|
| **RFQ** | | |
| BR-RFQ-01 | An RFQ is made only from PR lines: each line a `pending` line of an `approved` / `partial_ordered` PR, at least 1 line, each PR line once. | PR line on a draft PO → 400 `RFQ_LINE_NOT_PENDING`. Same PR line twice → 400 `RFQ_DUPLICATE_ID` |
| BR-RFQ-02 | A PR line can sit on only one RFQ that is `draft`, `sent` or `partially_awarded` (open), and while it does, no PO can be drafted from it except by the award in BR-RFQ-28; otherwise the RFQ must close or cancel first (card C1). | PR line on RFQ-1 (sent), create PO from it → 409 `PR_LINE_ON_OPEN_RFQ`. Add it to RFQ-2 → 409 |
| BR-RFQ-03 | RFQ line qty and uom are the PR line's remaining qty and the item's uom; nobody can type or change them (same as BR-PO-02). | PR line 1000 kg → RFQ line 1000 kg; PATCH qty 900 → 400 |
| BR-RFQ-04 | An RFQ has 1–10 suppliers, each active at the time added, each once. | Inactive S4 → 400 `SUPPLIER_INACTIVE`. S1 twice → 400 `RFQ_DUPLICATE_ID`. 0 or 11 suppliers → 400 `RFQ_SUPPLIER_LIMIT` |
| BR-RFQ-05 | Saved as `draft` with number `RFQ-{periodKey}-{seq}` (never reused), `createdBy`, a quote due date not before today, and notes 0–2000 chars. | Due date yesterday → 400 `RFQ_DUE_DATE_PAST`. Two RFQs same day → RFQ-2026-11-1, RFQ-2026-11-2 |
| BR-RFQ-06 | Only a `draft` RFQ can be edited (due date, notes, add / remove PR lines, add / remove suppliers); it can't be left with zero lines or zero suppliers. | Sent RFQ, add supplier → 409 `RFQ_NOT_EDITABLE`. Remove only line → 400 `RFQ_EMPTY` |
| BR-RFQ-07 | Send moves `draft` → `sent`, stores who and when, and locks lines and suppliers; nothing is e-mailed. | Send draft → sent, `sentBy`, `sentAt` set. Send again → 409 `RFQ_INVALID_STATUS` |
| BR-RFQ-08 | An RFQ prints from `sent` onward (`sent`, `partially_awarded`, `awarded`, `closed`; reprint allowed) one sheet per supplier listing item, qty, uom, due date and RFQ number, with no other supplier's name, no rates and no RFQ notes (notes are internal); `draft` and `cancelled` RFQs do not print. | Print for S2 → sheet shows ADC12 1000 kg, no S1 / S3, no notes. Awarded RFQ, reprint → ok. Draft RFQ, print → 409 `RFQ_INVALID_STATUS` |
| BR-RFQ-09 | Send re-checks every line is still `pending` and every supplier still active; any failure → 409 naming the line or supplier (stale-state codes, separate from the create-time 400s). | PR line cancelled between draft and send → 409 `RFQ_LINE_STALE`. S2 deactivated → 409 `SUPPLIER_INACTIVE_STALE` |
| BR-RFQ-10 | An item already under an active contract for one of the RFQ's suppliers shows that contract's rate on the RFQ and the comparison (information only). | S1 has RC-2026-12-1 for ADC12 → RFQ line shows "Contract S1 ₹244.00" |
| BR-RFQ-11 | A PR line cancelled after the RFQ was sent stays on the RFQ marked "PR line cancelled" and cannot be awarded; the next award or close of that RFQ marks the line `dropped`, so the RFQ can finish. | Requester cancels PR line 2 → award line 2 → 409 `RFQ_LINE_STALE`. Award line 1 only → line 1 awarded, line 2 dropped, RFQ `awarded` |
| **Quotes** | | |
| BR-RFQ-12 | Every quote change (enter, edit, submit, cancel) needs its RFQ in `sent` or `partially_awarded`, re-read under the RFQ lock; a quote is only for a supplier on that RFQ, its lines only that RFQ's lines, and it never exists without its RFQ. | Draft RFQ, enter quote → 409 `RFQ_INVALID_STATUS`. Closed RFQ, submit a draft quote → 409 `RFQ_INVALID_STATUS`. S4 not on RFQ → 400 `SUPPLIER_NOT_ON_RFQ`. PATCH with a line of RFQ-2 → 400 `QUOTE_LINE_INVALID` |
| BR-RFQ-13 | One live (draft or submitted) quote per supplier per RFQ; a revised price means cancel the old quote and enter a new one. | S1 has submitted SQ-1, enter another → 409 `QUOTE_EXISTS` |
| BR-RFQ-14 | A quote carries the supplier's quote reference (1–100 chars), quote date (not in the future), valid-till date (≥ quote date, required), and payment terms 0–365 days defaulting to the supplier's default terms. | Valid till before quote date, or quote date tomorrow → 400 `QUOTE_DATES_INVALID`. Terms blank, S1 default 30 → 30 |
| BR-RFQ-15 | Each RFQ line on a quote is either priced or marked "not quoted"; a priced line has rate in paise ≥ 1 per item uom, GST % from the BR-SUP-13 list (default from the supplier's price list, else 0), lead days 0–365, and freight for the whole line in paise ≥ 0 (default 0). | S1 ADC12: 24,500, 18 %, 7 days, freight 2,00,000 → saved. Rate 0, GST 17, or priced with no rate → 400 `QUOTE_LINE_INVALID` |
| BR-RFQ-16 | Quote line values are computed, never typed: value = round(qty × rate), tax = round(value × GST % / 100), landed rate per unit = rate + round(freight ÷ qty), all in paise. | 1000 kg × 24,500 → value 2,45,00,000, tax 44,10,000, landed 24,700 |
| BR-RFQ-17 | Late is judged at quote submit: a quote submitted on a day (India date) after the RFQ due date is accepted and marked "late"; the day the draft was typed does not count. | Due 25-11, draft typed 24-11, submitted 27-11 → submitted, late = yes. Submitted 25-11 → late = no |
| BR-RFQ-18 | Submit moves a quote `draft` → `submitted` and freezes it; it needs at least one priced line. | All lines "not quoted", submit → 400 `QUOTE_EMPTY`. Submitted quote, change rate → 409 `QUOTE_NOT_EDITABLE` |
| BR-RFQ-19 | A quote can be cancelled with a reason (3–500 chars) only while it is `draft` or `submitted` and none of its lines is awarded; cancelling a submitted quote also needs `rfq.award`; who, when, reason are stored. | SQ-1 awarded on ADC12, cancel → 409 `QUOTE_AWARDED`. Already cancelled → 409 `QUOTE_INVALID_STATUS`. Back office without `rfq.award` cancels submitted SQ-1 → 403. Reason "ab" → 400 (schema) |
| **Comparison** | | |
| BR-RFQ-20 | The comparison shows, for every RFQ line, every supplier on the RFQ with rate, GST %, freight, landed rate, lead days, valid till, payment terms and late flag, plus the item's last PO rate and active contract rate — these two only to users holding `po.manage` or `contract.view` (as BR-RFQ-56). | RFQ-1 ADC12 → S1, S2, S3 each shown with their values; last PO ₹243.00, contract S1 ₹244.00. User with `rfq.view` only → no last PO rate, no contract rate |
| BR-RFQ-21 | The lowest landed rate per line is marked "lowest"; GST is shown but not added because it is claimed back as input credit (card C2). | S2 rate 24,300 is cheapest but landed 24,800 → S1 (24,700) marked lowest |
| BR-RFQ-22 | Only eligible quote lines compete for "lowest": quote submitted, line priced, valid till ≥ today, supplier active. | S1 valid till 20-11, today 21-11 → S1 greyed "expired"; S2 marked lowest |
| BR-RFQ-23 | A tie on landed rate is broken by fewer lead days, then by earlier quote submit time. | S1 and S2 both 24,700, lead 7 vs 10 → S1 lowest |
| BR-RFQ-24 | Draft quotes are not shown in the comparison; cancelled quotes never compete but are listed as headers with who cancelled, when and the reason. | S3 quote still draft → "no quote yet". S1's SQ-1 cancelled "revised price" → listed "SQ-1 cancelled by A. on 26-11: revised price", no rates in the grid |
| **Award** | | |
| BR-RFQ-25 | Award picks, per RFQ line, one eligible quote line (BR-RFQ-22) and is done for one or more lines in one save; a line is awarded only once. | Award ADC12 to S1 → ok. Award ADC12 again → 409 `RFQ_LINE_AWARDED` |
| BR-RFQ-26 | Award of a quote line not on that RFQ line, a "not quoted" line or a draft / cancelled quote is refused (400); a quote that expired or a supplier deactivated since quoting is stale state (409). | S1 valid till yesterday → 409 `QUOTE_EXPIRED`. S3 deactivated → 409 `SUPPLIER_INACTIVE_STALE`. "Not quoted" line → 400 `QUOTE_LINE_INVALID` |
| BR-RFQ-27 | Awarding a line to a supplier other than the "lowest" needs a reason of 3–500 chars, stored on the award (card C3). | Award to S2 without reason → 400 `AWARD_REASON_REQUIRED`; with "S1 failed last 2 lots" → ok |
| BR-RFQ-28 | Award makes, in the same save, one draft PO per winning supplier through the normal PO create rules (BR-PO-01..04), with each line's rate, GST % and payment terms copied from the quote and expected delivery left empty (the PO send rule BR-PO-18 asks for it). | Award 2 lines to S1, 1 to S2 → PO for S1 with 2 lines, PO for S2 with 1 line, both `draft`, no expected delivery |
| BR-RFQ-29 | When the winning supplier has an active contract for the item, the PO line takes the contract rate and its rules (BR-RFQ-50..53) instead of the quote rate. | S1 quote 24,500, RC-2026-12-1 at 24,400 → PO line 24,400, linked. S1 quote 24,300 (below contract) → PO line still 24,400 |
| BR-RFQ-30 | Quote freight is not a PO line amount; the draft PO notes get one line per freight "Freight ₹<amount> on <item> as per <quote ref>". | S1 freight ₹2,000 → PO notes "Freight ₹2,000.00 on ADC12 as per BA/Q/118" |
| BR-RFQ-31 | Each PO line keeps a link to the quote line it came from, and the RFQ line keeps the PO number. | RFQ-1 ADC12 → "Awarded to S1 → PO-2026-11-7"; PO line → SQ-2026-11-3 line 1 |
| BR-RFQ-32 | Award fails as a whole if any part fails (PR line no longer pending, supplier inactive, quote expired, PO rule broken); nothing is half-made. | 2 lines, second PR line cancelled → 409 `RFQ_LINE_STALE`, no PO made, first line not awarded |
| BR-RFQ-33 | After award the PO follows the PO module only; cancelling or rejecting that PO cancels its PR line (BR-PO-11) and the RFQ line stays "awarded" with the PO shown cancelled. | PO-2026-11-7 cancelled → RFQ line "Awarded to S1 → PO-2026-11-7 (cancelled)"; a new PR is needed |
| BR-RFQ-34 | When every RFQ line is awarded or dropped, the RFQ becomes `awarded`; every submitted quote with no awarded line becomes `not_awarded`; quotes are never deleted. | Last line awarded → RFQ awarded, S3 quote not_awarded |
| BR-RFQ-35 | Close ends a `sent` / `partially_awarded` RFQ with a reason (3–500 chars): open lines are dropped, their PR lines become free for a PO or a new RFQ, and BR-RFQ-34's quote rule applies. | 1 of 2 lines awarded, close "no acceptable quote" → closed, other PR line free, PO from it → ok |
| BR-RFQ-36 | Cancel ends a `draft` or `sent` RFQ with no awarded line, with a reason (3–500 chars); its PR lines become free and its quotes become `cancelled`. | Partially awarded RFQ, cancel → 409 `RFQ_HAS_AWARD` (use close) |
| BR-RFQ-37 | Awarded, closed and cancelled RFQs are final: no edit, quote, award or reopen, and they keep their number. | Closed RFQ, enter quote → 409 `RFQ_INVALID_STATUS` |
| BR-RFQ-38 | When an RFQ becomes `awarded`, `closed` or `cancelled`, its draft quotes become `cancelled` with the system reason "RFQ ended" in the same save (submitted ones follow BR-RFQ-34 / 36). | S3 quote still draft, last line awarded → SQ-3 cancelled "RFQ ended" |
| BR-RFQ-39 | A draft PO made by an award goes through the normal PO submit and approval with no exception. | PO-2026-11-7 from award → submit → approval chain as any PO |
| **Rate contracts** | | |
| BR-RFQ-40 | A contract has one supplier (active at create), valid-from and valid-to dates (both required, to ≥ from), allowance % 0–20 (default 0), notes, number `RC-{periodKey}-{seq}`. | No valid-to, or to before from → 400 `CONTRACT_DATES_INVALID`. Inactive supplier → 400 `SUPPLIER_INACTIVE` |
| BR-RFQ-41 | Each contract line has an active item (once per contract), rate in paise ≥ 1 per item uom, GST % from the BR-SUP-13 list, and an agreed qty > 0 with at most 3 decimals, or blank for a rate-only contract. | ADC12 24,400, 18 %, 5000 kg → ok. Rate 0, ADC12 twice, inactive item, qty 1.2345 → 400 `CONTRACT_LINE_INVALID` |
| BR-RFQ-42 | A contract rate is a fixed number for its whole period; a monthly alloy price change means terminating it and making a new contract (card C7). | Alloy price rises 15-12 → terminate RC-2026-12-1 "price revised", activate RC-2026-12-2 at 25,100 from 16-12 |
| BR-RFQ-43 | A contract is made by hand by `contract.manage`; it needs no RFQ. | Owner types RC with S1 after a phone negotiation → draft |
| BR-RFQ-44 | Only a `draft` contract can be edited or cancelled (reason 3–500 chars); an active contract never changes. | Active RC, change rate → 409 `CONTRACT_NOT_EDITABLE`. Cancel draft with reason "no" → 400 (schema) |
| BR-RFQ-45 | Activate moves `draft` → `active` and stores who and when; valid-to must be today or later; valid-from may be in the future, and then the contract applies only from valid-from. | Valid-to 30-11, today 01-12, activate → 400 `CONTRACT_DATES_INVALID`. Activated 20-11 with valid-from 01-12 → PO on 25-11 gets no contract rate, PO on 01-12 does |
| BR-RFQ-46 | Two active contracts can't cover the same supplier and item on overlapping dates (a terminated contract covers only up to its termination date); activation of the second is refused. | RC-2026-12-1 S1 ADC12 01-11..31-12 active; activate RC-2 S1 ADC12 15-12..15-01 → 409 `CONTRACT_OVERLAP` |
| BR-RFQ-47 | An active contract counts as expired from the day after valid-to without anyone acting; expired contracts are never used for a PO. | Valid-to 31-12, PO on 01-01 → no contract rate |
| BR-RFQ-48 | Terminate ends an active, not expired contract with a reason (3–500 chars) and a termination date from today up to valid-to (default today); the contract is used through that date and never after; POs already made keep their rate. | Terminate on 15-12 dated 15-12 → PO on 16-12 gets no contract rate; PO of 10-12 unchanged. Date 14-12 or 05-01 → 400 `CONTRACT_DATES_INVALID`. Already terminated → 409 `CONTRACT_INVALID_STATUS` |
| BR-RFQ-49 | The contract shows per line: agreed qty, ordered qty, received qty (from GRNs of its PO lines), % ordered; the contract list filters "ends within 30 days". | 5000 agreed, 3000 ordered, 2500 received → 60 % ordered |
| **Contract on the PO (change to the frozen PO module)** | | |
| BR-RFQ-50 | When a PO line is drafted (from award or by hand) and the PO's supplier has an active contract for that item on the PO date, the line rate, GST % and uom come from the contract, the line is linked to the contract line, and the rate source label is "Contract". This comes before the BR-PO-03 suggestion. | PO to S1 for ADC12 on 05-12 → rate 24,400, label "Contract" |
| BR-RFQ-51 | A PO line linked to a contract can carry a different rate only when the user has `contract.override_rate` and gives a reason (3–500 chars), stored on the PO line with who and when (card C4). | Back office sets 24,600 → 403. Owner sets 24,600 "urgent lot, premium" → saved |
| BR-RFQ-52 | A contract line's ordered qty plus a new PO line's qty may not pass agreed qty × (1 + allowance %); checked at PO create, PO submit and PO last-level approve; rate-only lines have no cap (card C5). | 3000 ordered, PO for 2500 at 0 % → 409 `CONTRACT_QTY_EXCEEDED`. Allowance 10 % (cap 5500) → ok |
| BR-RFQ-53 | Ordered qty goes up when the PO is approved (last level) and down when an approved PO is cancelled; draft, pending and rejected POs never count; a short-closed PO keeps its full qty counted. | PO 1000 kg approved → ordered 1000; that PO cancelled → 0; short-closed at 600 received → still 1000 |
| BR-RFQ-54 | A draft PO whose linked contract has expired or been terminated cannot be submitted until the line is re-priced (link dropped, normal suggestion applies). | RC terminated, submit PO → 409 `CONTRACT_NOT_ACTIVE`; edit line → link dropped → submit ok |
| BR-RFQ-55 | A PO line rate different from its linked contract rate without an override reason is refused, even for a user who holds `contract.override_rate`; a user without the key gets 403 first. | Owner sets 24,600 with no reason → 400 `OVERRIDE_REASON_REQUIRED`. Back office, same → 403 |
| BR-RFQ-56 | The PO rate suggestion returns the contract rate (source "Contract") only to a user holding `po.manage` or `contract.view`; anyone else gets the next source, as if no contract existed. | User with only `inventory.view` asks the ADC12 rate for S1 → "Last PO" 24,300, no contract rate |
| BR-RFQ-57 | On a contract-linked PO line only the rate can be overridden (BR-RFQ-51); GST % and uom always equal the contract's and are never overridable, not even with `contract.override_rate`. | Owner sends GST 12 % on the RC-2026-12-1 line → 400 `CONTRACT_LINE_LOCKED_FIELD` |
| **Screens and next steps** | | |
| BR-RFQ-60 | Screens follow design-system v2 and every document offers its next step: approved PR with pending lines → "Request quotes"; draft RFQ → "Send"; sent RFQ → "Enter quote" and "Compare"; comparison → "Award → PO"; awarded line → link to its PO. | Approved PR-2026-11-4 detail shows "Request quotes" → opens a new RFQ with its pending lines ticked |
| BR-RFQ-61 | A next-step button shows only to users who hold the key for that step. | User without `rfq.award` → no "Award → PO" button; API call → 403 |
| **Security, audit, races** | | |
| BR-RFQ-70 | Every endpoint needs a login (401) and its key from "Who can do what" (403 `PERMISSION_DENIED`); award needs both `rfq.award` and `po.manage`. | fs opens comparison → 403. User with `rfq.award` only, award → 403 |
| BR-RFQ-71 | Every state change stores who and when (send, quote submit / cancel, award, close, cancel, contract activate / terminate / cancel, rate override) with the reason where one is required. | After award to S2 → awardedBy, awardedAt, reason readable |
| BR-RFQ-72 | Every state change re-reads its row under a lock and re-checks status in the same save; lock order RFQ → quotes → PR header → PR lines → contract line; the loser of a race gets 409 and nothing is half-saved. | Two users award ADC12 at once → one PO, other 409. Two POs approve past contract cap → one 409 |
| BR-RFQ-73 | All money is integer paise; rates are per item uom; quantities are the PR line's (3 decimals). | Rate "245.5" in API → 400 (schema, paise integer expected) |
| BR-RFQ-74 | On quote, contract and PO lines, freight is at most 1,000,000,000,000 paise and a line value (qty × rate; agreed qty × rate on a contract) at most 1,000,000,000,000,000 paise; above → 400, nothing saved. | Freight 1,000,000,000,001 → 400 `AMOUNT_TOO_LARGE`. 1,000,000,000 kg × 10,000,000 paise on a contract → 400 `AMOUNT_TOO_LARGE` |

## Security
Sensitive data — what must never leave the server or be shown to which role:
| Data | Who may see it | Who may change it |
|---|---|---|
| Quote rates of all suppliers, comparison | `rfq.view` | `rfq.manage` (draft quote only) |
| Award reason (why not lowest) | `rfq.view` | nobody after award |
| Contract rates and fulfilment | `contract.view` | `contract.manage` (draft only) |
| Contract rate inside the PO rate suggestion | `po.manage` or `contract.view` (BR-RFQ-56) | — |
| Last PO rate and contract rate on RFQ detail and comparison | `po.manage` or `contract.view` (BR-RFQ-20) | — |
| Cancelled quote: who, when, reason | `rfq.view` (BR-RFQ-24) | nobody after cancel |
| RFQ internal notes | `rfq.view`; never on the supplier sheet (BR-RFQ-08) | `rfq.manage` (draft only) |
| PO rate override reason | `po.manage` | nobody after save |
| Other suppliers' names and rates on a printed RFQ sheet | nobody (BR-RFQ-08) | — |

Abuse cases — each one ends in a rule above:
| Who | Tries to | Stopped by |
|---|---|---|
| buyer | award to a favoured supplier above the lowest without saying why | BR-RFQ-27 |
| buyer | edit a submitted quote to make the favoured supplier lowest | BR-RFQ-18, 13 |
| buyer | skip the RFQ and draft a PO straight from a PR line under quotation | BR-RFQ-02 |
| buyer | type a higher PO rate than the contract | BR-RFQ-51 |
| buyer | keep ordering past the contract quantity | BR-RFQ-52 |
| buyer | award an expired quote at an old low price the supplier won't honour | BR-RFQ-26 |
| back_office | change an active contract's rate | BR-RFQ-44, contract.manage seed |
| any user | award without PO rights | BR-RFQ-70 |
| buyer | override the contract rate with no reason | BR-RFQ-55 |
| stores / inventory user | read contract rates through the PO rate suggestion | BR-RFQ-56 |
| buyer | cancel the lowest submitted quote so a favoured supplier becomes lowest | BR-RFQ-19 (needs `rfq.award`), BR-RFQ-24 (cancel shown with who and why) |
| buyer | keep a contract rate but change GST % on the PO line | BR-RFQ-57 |
| buyer | edit or submit a quote after the RFQ was closed | BR-RFQ-12 |

Audit: send, quote submit / cancel, award (incl. reason), RFQ close / cancel, contract activate / cancel /
terminate, PO rate override — each stores actor, time, reason; awards and overrides also store before → after
rate (lowest landed vs chosen; contract rate vs PO rate).

## Error codes
One HTTP status per code. Request-shape failures (missing field, text length, reason under 3 chars, non-integer
paise) are the standard schema 400 "Validation failed" (no code). Stale state found at send or award is 409 with
its own code, never the create-time 400.
| Code | HTTP | Rule |
|---|---|---|
| `RFQ_LINE_NOT_PENDING` | 400 | 01 |
| `RFQ_DUPLICATE_ID` | 400 | 01, 04 |
| `SUPPLIER_INACTIVE` | 400 | 04, 40 |
| `RFQ_SUPPLIER_LIMIT` | 400 | 04 |
| `RFQ_DUE_DATE_PAST` | 400 | 05 |
| `RFQ_EMPTY` | 400 | 06 |
| `PR_LINE_ON_OPEN_RFQ` | 409 | 02 |
| `RFQ_NOT_EDITABLE` | 409 | 06 |
| `RFQ_INVALID_STATUS` | 409 | 07, 08, 12, 35, 37 |
| `RFQ_LINE_STALE` | 409 | 09, 11, 32 |
| `SUPPLIER_INACTIVE_STALE` | 409 | 09, 26 |
| `RFQ_HAS_AWARD` | 409 | 36 |
| `SUPPLIER_NOT_ON_RFQ` | 400 | 12 |
| `QUOTE_LINE_INVALID` | 400 | 12, 15, 26 |
| `QUOTE_DATES_INVALID` | 400 | 14 |
| `QUOTE_EXISTS` | 409 | 13 |
| `QUOTE_EMPTY` | 400 | 18 |
| `QUOTE_NOT_EDITABLE` | 409 | 18 |
| `QUOTE_INVALID_STATUS` | 409 | 19 |
| `QUOTE_AWARDED` | 409 | 19 |
| `QUOTE_EXPIRED` | 409 | 26 |
| `RFQ_LINE_AWARDED` | 409 | 25 |
| `AWARD_REASON_REQUIRED` | 400 | 27 |
| `CONTRACT_DATES_INVALID` | 400 | 40, 45, 48 |
| `CONTRACT_LINE_INVALID` | 400 | 41 |
| `CONTRACT_NOT_EDITABLE` | 409 | 44 |
| `CONTRACT_INVALID_STATUS` | 409 | 45, 48 |
| `CONTRACT_OVERLAP` | 409 | 46 |
| `CONTRACT_QTY_EXCEEDED` | 409 | 29, 52 |
| `CONTRACT_NOT_ACTIVE` | 409 | 54 |
| `OVERRIDE_REASON_REQUIRED` | 400 | 55 |
| `CONTRACT_LINE_LOCKED_FIELD` | 400 | 57 |
| `AMOUNT_TOO_LARGE` | 400 | 74 |
| `PERMISSION_DENIED` | 403 | 19, 51, 70 |
| `NOT_FOUND` | 404 | any id that does not exist |

## Edge cases
Full list: `design/edge-cases.md`. Every row there names a rule in this file.
| Source | Count |
|---|---|
| benchmark | 46 |
| owner | 10 (cards 1–7, answered A by delegation) |
| invariant | 8 |

## Changes to other modules
Raised at freeze as change requests; the owner approves them with this module's `OWNER.md`. Those specs are not
edited here.
- **Purchase order (frozen):** a PR line on an open RFQ cannot be drafted into a PO, 409 `PR_LINE_ON_OPEN_RFQ`
  (BR-RFQ-02). A PO can be drafted by an award, with quote rate, GST %, payment terms, freight in notes and a link
  to the quote line (BR-RFQ-28..31). A PO line for a supplier + item under an active contract takes the contract
  rate, GST % and uom and the link; a different rate needs `contract.override_rate` and a reason, GST % and uom
  never change (BR-RFQ-50, 51, 55, 57); the contract qty cap is checked at create, submit and last-level approve
  (BR-RFQ-52, 53); a draft tied to an ended contract cannot be submitted until re-priced (BR-RFQ-54); PO line
  freight / value limits (BR-RFQ-74). BR-PO-25 gains the label "Contract". The PO "Not now" line
  "Last-rate warnings and rate-contract checks" drops "rate-contract checks".
- **Approval:** PO submit and last-level approve run the contract checks above (BR-RFQ-52, 54); an award PO gets
  no exception (BR-RFQ-39); no approval rule changes.
- **GRN:** no rule change; contract received qty is read from GRNs of its PO lines (BR-RFQ-49).
- **Inventory:** the rate suggestion (BR-INV-30, `getLastRate`) gains the source `contract` first, with a date, shown
  only to `po.manage` / `contract.view` holders (BR-RFQ-50, 56).
- **Purchase requisition:** no rule change; the PR modal and the approved-PR queue get a "Request quotes" button and
  show "On RFQ-…" for a line under quotation (BR-RFQ-02, 60).
- **Auth setup:** new keys `rfq.view`, `rfq.manage`, `rfq.award`, `contract.view`, `contract.manage`,
  `contract.override_rate` with the seed roles in "Who can do what".
- **Design system:** status docs `rfq`, `quote`, `contract` on existing tones.

## Not now
- E-mail / WhatsApp sending of RFQs, supplier portal, suppliers typing their own quotes.
- RFQ for items not on a PR, or for services / job work (machining, plating); RFQ lines from a subcontract order.
- Quote in a unit other than the item's uom (kg quote vs piece order), qty breaks, alternate items.
- Splitting one RFQ line between two suppliers (PO rule: one PR line → one PO line).
- Ordering less than the PR line qty from a quote.
- Index-linked contract rates (LME + premium), money-value contracts, contract approval chain, contract amendments.
- Making a contract from a quote in one click; auto-renewal; expiry notifications.
- Freight / landed cost on the PO itself; GST-not-claimable suppliers (composition dealers) in the landed rate.
- Minimum number of quotes before award (three-quote rule).
- Supplier rating from quotes (see supplier-rating module).

## Open questions
Must be empty at freeze. Each one ends as an owner card in `OWNER.md` or a row in `assumptions.md`.
None. Cards 1–7 are in `OWNER.md` (answered A by delegation, D-028); confirm points Q1–Q5 and the coordinator's
answers are `assumptions.md` A-22..A-40; designer questions D1–D6 are answered in `design/` (A-01..A-21).
| # | Question | Goes to |
|---|---|---|

## Changelog
- 2026-11-20 v0 — draft (pass 1, owner delegated; 7 pending cards)
- 2026-11-20 v0 — pass 2: BR-RFQ-08 (print from sent onward), 11 (dropped at award), 17 (late at submit), 20 (every
  supplier per line), 28 (expected delivery empty), 48 (termination date) reworded; BR-RFQ-55 (override reason),
  56 (contract rate visibility) added; "Changes to other modules" added; edge cases 50, assumptions 31.
- 2026-11-20 v0 — pre-freeze fixes: quote changes need a live RFQ under lock (12); submitted-quote cancel needs
  `rfq.award` and cancelled quotes listed (19, 24); draft quotes cancelled at RFQ end (38); award PO normal approval
  (39); contract GST % / uom locked (50, 57); amount limits (74); notes not printed (08); last PO / contract rate
  visibility (20); BR-RFQ-02 award exception; future valid-from (45); "Error codes" table, one status per code;
  example contract from 01-11-2026; depends_on + inventory, grn. Edge cases 64, assumptions 40.
- 2026-11-20 v1 — frozen; OWNER.md approved on the owner's delegation (D-028): owner pre-approved recommended options in chat, 2026-11-20: "take ur own decision and record them and run whatever parallel subagents u want to complete a complete scm module according to my plan, ill do a complete merge in moring once completed"
