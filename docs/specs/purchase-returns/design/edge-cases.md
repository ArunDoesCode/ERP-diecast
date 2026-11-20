# Purchase returns — edge cases

> Written by spec-analyst from `docs/research/purchase-returns.md` → "Edge cases seen in the products", the
> designers' files and the coordinator's answers (owner delegated, no interview). Every row names a rule.
> Tests are named by rule id. The owner sees only the count.

Source: **benchmark** (what ERPNext / Odoo / SAP do) · **owner** (an answered card; here: delegated, card A
pre-approved 2026-11-20) · **invariant** (money in paise, stock only through the ledger, permission + audit on
state changes) · **designer** (raised by solution-/ui-ux-designer, answered by coordinator or benchmark).

| # | Case | What the system does | Source | Rule |
|---|---|---|---|---|
| E-01 | Return more than received, counting earlier returns | Refused 400 with cap and reserved qty | benchmark (ERPNext, all) | BR-PRT-05, 06 |
| E-02 | Return after the supplier's bill is recorded | Allowed; debit note quotes the linked bill, or none | benchmark (ERPNext; SAP differs) → card 4 | BR-PRT-24, 33 |
| E-03 | Stock already consumed before the return | 409 "Insufficient stock", nothing posted | benchmark (ERPNext) | BR-PRT-16 |
| E-04 | GRN fully returned | GRN status and QA unchanged; lines show returned qty | benchmark (ERPNext "Return Issued" differs) | BR-PRT-19, 38 |
| E-05 | Return of a return | Not possible: returns start only from a GRN; a posted return is cancelled instead | benchmark (Odoo add-on, first level only) | BR-PRT-01, 25 |
| E-06 | Lines from two GRNs on one return | 400 `PRT_GRN_MISMATCH` | benchmark (SAP one GRPO) | BR-PRT-01 |
| E-07 | GRN correction after part of the line went back | Correction below accepted returned qty → 400 | benchmark silent → stricter | BR-PRT-42 |
| E-08 | GRN without a PO (e.g. subcontract receipt), on create or prefill | 400 `PRT_GRN_MISMATCH` | designer | BR-PRT-01 |
| E-09 | GRN line with QA pending | 400 `PRT_QA_PENDING` | benchmark (ERPNext returns only submitted receipts) | BR-PRT-02 |
| E-10 | Same GRN line + source twice on one return | 400 `PRT_DUPLICATE_LINE` | designer | BR-PRT-03 |
| E-11 | 2.5 pcs on a whole-number unit; 4 decimals on kg | 400 | invariant (GRN qty rules) | BR-PRT-04 |
| E-12 | Two creates at once that together pass the rejected qty | GRN line lock: one 201, one 400; a draft over the cap at post → 409 | designer | BR-PRT-05, 07 |
| E-13 | Client sends a lower rate or GST % | 400 (strict body), nothing saved | invariant | BR-PRT-09 |
| E-14 | Edit or delete the only line of a draft; edit a posted return | 400 / 409 `PRT_NOT_EDITABLE` | benchmark (ERPNext submitted docs read-only) | BR-PRT-10 |
| E-15 | Debit note numbering fails mid-post | Whole post rolled back, return still draft | invariant | BR-PRT-12 |
| E-16 | Two users post the same return at once | One 200, one 409; one set of ledger rows | invariant | BR-PRT-13 |
| E-17 | Rejected line posted | No ledger row; stock and average unchanged | owner (card 1 A) | BR-PRT-15 |
| E-18 | Accepted return brings stock to exactly 0 | Average stays as it was | benchmark (GRN correction rule) | BR-PRT-17 |
| E-19 | Line value above the money limit | 400 `AMOUNT_TOO_LARGE`, nothing posted | invariant | BR-PRT-18 |
| E-20 | Rejected return on a PO | PO received qty and status unchanged | benchmark (ERPNext) | BR-PRT-20 |
| E-21 | Accepted return, credit only | PO received qty and status unchanged | owner (card 3 A) | BR-PRT-21 |
| E-22 | Replacement expected on an invoiced or closed PO | 409 `PRT_REPLACEMENT_PO_CLOSED`, nothing posted | designer | BR-PRT-22 |
| E-23 | Draft created 23:50 IST on the last day of a month, posted next day | Return no. in the create month; posted at = server time | invariant (IST periods) | BR-PRT-23 |
| E-24 | Cancel a posted return without a reason | 400 | benchmark (ERPNext cancel trail) | BR-PRT-25 |
| E-25 | Cancel a posted return whose stock was issued since | Allowed: the counter row is a stock-in | benchmark (ERPNext reverse entry) | BR-PRT-26 |
| E-26 | Cancel a replacement return after the PO was closed | 409, nothing changes | designer | BR-PRT-27 |
| E-27 | Cancelled return's qty | Freed under the caps; debit note marked CANCELLED, number kept | benchmark (numbers never reused) | BR-PRT-28 |
| E-28 | Return posted 31 Mar vs 1 Apr | Debit note and challan in the FY of the post day; new FY starts at 1 | invariant (GST Rule 46/55) | BR-PRT-30, 35 |
| E-29 | Odd GST paise on a same-state line (GST 75,601) | CGST 37,801, SGST 37,800, per line; header = sum of lines | designer (coordinator answer 1) | BR-PRT-31, 32 |
| E-30 | Supplier in another state; supplier without GSTIN | IGST; no GSTIN → CGST + SGST | benchmark (ERPNext India, SAP B1 India) | BR-PRT-32 |
| E-31 | PO with several supplier bills | Debit note links one approved bill covering the returned GRN line; prints only that bill no. and date | designer (coordinator cross-spec answer) | BR-PRT-33, 44 |
| E-32 | Item without HSN, or plant GSTIN missing | 400 at post, nothing posted | invariant (D-017) | BR-PRT-34 |
| E-33 | Return challan numbering | Own consecutive series per FY, allocated at post | designer (coordinator answer 3, Rule 55) | BR-PRT-35 |
| E-34 | User without the post key on a draft | No Post button; API 403 | invariant | BR-PRT-37 |
| E-35 | Draft holds rejected qty | Awaiting view shows only the rest | designer | BR-PRT-39 |
| E-36 | Accepted goods returned with replacement, then bill entered | Original GRN line billable minus all accepted returned; replacement billed on its own GRN | benchmark (ERPNext billed vs returned) | BR-PRT-43 |
| E-37 | Inactive supplier or item on the GRN | Still returnable (return refers to an existing GRN line) | benchmark (ERPNext allows returns on disabled masters' past docs) | BR-PRT-01 |
| E-38 | Returned lines sit on two approved bills; or no bill approved yet | Link the oldest only; no bill → linked when a covering bill that includes the returned qty is approved | designer (coordinator pre-freeze decision 1) | BR-PRT-44 |
| E-39 | Debit note for rejected qty linked to a bill | Bill payable unchanged (rejected qty was never billable); accepted lines' value comes off | designer | BR-PRT-45 |
| E-40 | Cancel a replacement return after the replacement GRN arrived, pushing received above ordered × 1.05 | 409 `PRT_OVER_RECEIPT`, nothing changes, no override | designer (coordinator decision 3, stricter) | BR-PRT-27 |
| E-41 | Draft edited or cancelled while it is being posted | Header lock; the loser gets 409 `PRT_NOT_EDITABLE` | invariant | BR-PRT-46 |
| E-42 | The same user creates and posts a return | Allowed; audit shows created by and posted by | benchmark (ERPNext, SAP B1: no maker-checker on returns by default) | BR-PRT-47 |
| E-43 | Bills approved for 980 of 1,000, then 20 kg returned credit only | PO becomes `invoiced` | designer (coordinator decision 2) | BR-PRT-12, 21 |
| E-44 | Credit-only return cancelled on an `invoiced` PO whose bills now fall short | PO back to `fully_received` | designer (coordinator decision 2) | BR-PRT-27 |
| E-45 | Return posted before any bill; bill approved later | Bill includes the returned qty → linked, offset = accepted-lines value; bill net of the return → never linked, no offset | designer (coordinator, BR-SINV-31) | BR-PRT-44, 45 |
| E-46 | User without the post / cancel key calls the endpoint | 403, nothing changes | invariant | BR-PRT-12, 25 |
