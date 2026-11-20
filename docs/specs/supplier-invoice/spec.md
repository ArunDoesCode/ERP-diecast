---
module: supplier-invoice
status: frozen            # draft | frozen (set only by /freeze; change requests keep it frozen)
version: 1
frozen_on: 2026-11-20
owner: Arun
depends_on: [purchase-order, grn, suppliers, subcontracting, purchase-returns]   # subcontracting = company_settings (D-017)
brief: docs/briefs/supplier-invoice.md
research: docs/research/supplier-invoice.md
---

# Supplier invoice and 3-way match

> Agent layer. The owner reads `OWNER.md`, not this file. ≤ 400 lines (above that: split by sub-module).
> Plain words, one sentence per rule. Tables and columns: `design/data.md`. Endpoints: `design/api.md`.
> Screens: `design/screens.md`. Code locations and history: `docs/modules/supplier-invoice.md` (not yet written).
> Owner away and delegated every decision (D-028, chat 2026-11-20): the 7 cards in `OWNER.md` carry option A,
> pre-approved; benchmark links per card are under "Open questions".

## Summary
Accounts types in the supplier's paper bill against one PO and the GRN lines it covers. On submit the
system checks quantity (bill vs accepted qty), price (bill vs PO rate) and GST (bill vs computed) within two
tolerances. A clean bill becomes payable at once; a bill outside tolerance is saved as "blocked" until it
is fixed or released with a reason by someone else. No payments, no accounting entries.
Example data used below: PO-2026-11-7 to Bharat Alloys (GSTIN 29…, Karnataka) for ADC12 ingot,
1,000 kg at ₹240.00/kg (24,000 paise), GST 18%; GRN-2026-11-12 accepted 980 kg; our plant is in Karnataka
(state 29). Clean bill: 980 kg × ₹240 = ₹2,35,200.00 + CGST 9% ₹21,168.00 + SGST 9% ₹21,168.00 = ₹2,77,536.00.
Price tolerance 0%, weight tolerance 0.5% (recommended card answers).

## Who can do what
| Action | Key | Seed roles |
|---|---|---|
| list, open, see match result | `invoice.view` (new) | ow, bo |
| create, edit draft, delete draft, submit, back to draft, cancel | `invoice.manage` (new) | ow, bo |
| release a blocked invoice (never by anyone who created, edited, submitted or sent it back) | `invoice.release` (new) | ow (card 3) |
| set the two tolerances | `company.manage` (existing) | ow |
Super-admin passes every key (BR-AUTH-18) except the self-release ban (BR-SINV-25). No role-name checks in code.

## Flow
| From | Action | To | Rule |
|---|---|---|---|
| — | create | draft | BR-SINV-01..12 |
| draft | edit / delete | draft / gone | BR-SINV-11 |
| draft | submit, all checks pass | approved (payable) | BR-SINV-23 |
| draft | submit, any check fails | blocked | BR-SINV-23 |
| blocked | back to draft | draft | BR-SINV-24 |
| blocked | release with reason | approved (payable) | BR-SINV-25 |
| blocked, approved | cancel with reason | cancelled (final) | BR-SINV-26, 27 |
| approved | (none: no payment in scope) | approved | BR-SINV-28 |
| old "Record invoice" row (migration) | none: read-only | legacy | BR-SINV-04, 06, 37 |

## Rules
One sentence per rule, plus one example. IDs are permanent (strike out, never renumber).
Tests are named by rule id, so every rule must be checkable from its example alone.

### Entry
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-SINV-01 | An invoice belongs to one supplier and one PO (supplier copied from the PO); each item line points to exactly one GRN line of that PO, at most once per invoice; the PO cannot change after create (400). | Line pointing to a GRN line of PO-2026-11-9 on an invoice for PO-2026-11-7 → 400. Same GRN line twice → 400. Draft edit sending PO-2026-11-9 → 400 |
| BR-SINV-02 | Only received goods can be billed: a GRN line is billable only when its QA status is passed or waived; billable qty = net accepted (accepted − corrections) − qty on other live invoices (draft, blocked, approved) − accepted qty on posted, not-cancelled returns of that line (credit only or replacement, BR-PRT-43); rejected returns never change it; below 0 counts as 0. | GRN-2026-11-12 line pending QA → 400. Net 980 kg, 980 kg on an approved invoice → new line 400 "nothing left to bill". 20 kg accepted returned → 960 kg; 20 kg rejected returned → still 980 kg |
| BR-SINV-03 | A draft counts as live, so it reserves its qty; two drafts can't both take the same kg. | Draft A holds 980 kg → draft B on the same line → 400 "nothing left to bill" |
| BR-SINV-04 | Billing is allowed while the PO is `partial_received`, `fully_received` or `closed` (incl. short-closed); never on `cancelled`, `draft`, `pending_approval`, `approved`, `dispatched`, and `invoiced` has nothing left to bill; a PO that already has an old-style (legacy) invoice row is never billed again (400). | Short-closed PO with 600 kg received → bill for 600 kg accepted. Dispatched PO with no GRN → 400. PO-2026-09-3 with a legacy "Record invoice" row → 400 |
| BR-SINV-05 | The supplier's invoice number is trimmed and upper-cased, then must be 1–16 characters of A–Z, 0–9, "-" and "/" (GST Rule 46); otherwise 400. | " inv-44 " → stored "INV-44". "INV 44" → 400. 17 characters → 400 |
| BR-SINV-06 | The same invoice number from the same supplier in the same financial year (April–March of the invoice date) on a live or legacy invoice is refused with 409 (card 4); another supplier, a cancelled invoice or another financial year does not clash. | Bharat Alloys "INV-44" dated 10-11-2026 approved; again dated 12-11-2026 → 409. Same number from Sri Metals → saved. Same number dated 05-04-2027 → saved |
| BR-SINV-07 | The invoice date is required, may not be after today (IST) and may not be before the PO date. | PO dated 02-11-2026, invoice 01-11-2026 → 400. Invoice dated tomorrow → 400 |
| BR-SINV-08 | Each item line needs billed qty > 0 with at most 3 decimals (whole number for whole-number units, same list as GRN), a rate ≥ 1 paise in whole paise, and a GST % from the supplier GST slab list (0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 28, 40). | 980.5 kg at 24,000 paise, 18% → ok. 12.5 pcs → 400. GST 15% → 400. Rate 0 → 400 |
| BR-SINV-09 | A charge line (freight, packing, tooling, other) has a type, a description up to 200 chars, a taxable amount ≥ 1 paise and a GST % from the slab list, and no GRN line; at most 10 charge lines per invoice (card 5). | Freight ₹2,000.00 at 18% → saved as a charge line. Freight ₹0 → 400 |
| BR-SINV-10 | The user also types the bill's printed figures in paise: taxable total, CGST, SGST, IGST and bill total (each ≥ 0); the stored line values come from the system (BR-SINV-13), the printed figures are kept for the check (BR-SINV-19, 20). | Printed: taxable 2,35,200.00, CGST 21,168.00, SGST 21,168.00, IGST 0, total 2,77,536.00 → stored as typed |
| BR-SINV-11 | Create gives our own number `SINV-<YYYY-MM>-<seq>`, month = plant IST day of creation (D-022), never reused; a draft can be edited or deleted by `invoice.manage`; any other status → 409 "not a draft". | Delete draft SINV-2026-11-3 → gone, number 3 not reused. Edit blocked SINV-2026-11-2 → 409. Created 01-12-2026 03:00 IST (still 30-11 in UTC) → SINV-2026-12-… |
| BR-SINV-12 | A bill from an inactive supplier can still be entered, because the goods are already received. | Bharat Alloys deactivated after GRN → invoice saved |

### GST
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-SINV-13 | Line taxable value = round(qty × rate) in paise; totals are sums of lines (item + charge). | 980 kg × 24,000 → 23,520,000 paise. 980.5 kg → 23,532,000 |
| BR-SINV-14 | Tax type comes from the first two digits of the supplier's GSTIN vs our plant state code (company settings): same state → CGST + SGST at half the rate each; different → IGST at the full rate; never both; the GSTINs and state codes used are stored at submit, so a later master change does not alter a submitted bill. | Supplier 29, plant 29, 18% → CGST 9% + SGST 9%. Supplier 27 → IGST 18%. Supplier GSTIN edited after approval → bill keeps CGST + SGST |
| BR-SINV-15 | Each tax head is rounded half-up per line, then summed; CGST and SGST are computed separately and are equal per line. | 23,520,000 × 9% → CGST 2,116,800, SGST 2,116,800; total 27,753,600 |
| BR-SINV-16 | A supplier with no GSTIN is unregistered: expected GST is 0 on every line, and any GST on the paper bill is a "tax" mismatch. | Unregistered supplier, printed CGST ₹500 → blocked "tax" |
| BR-SINV-17 | Two flags are stored as typed, with no posting and no effect on the match: reverse charge (yes/no) and ITC not eligible (yes/no); no ITC posting or warning is made (incl. the 180-day unpaid reversal). | Reverse charge = yes → saved, shown on the invoice |
| BR-SINV-18 | Submit needs company settings with GSTIN and state code; missing → 400 naming the missing field (same as challans, D-017). | Company state code empty → 400 "Set the plant state code in company settings" |

### Match (run on every submit; result stored with the tolerances used)
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-SINV-19 | Tax check: the printed CGST, SGST and IGST each may differ from the computed head by at most ₹1.00 (100 paise); more, or a head used for the wrong tax type, is a "tax" mismatch. | Computed CGST 2,116,800, printed 2,116,850 → passes. Printed IGST on a same-state bill → "tax" |
| BR-SINV-20 | Total check: the printed bill total may differ from computed taxable + tax by at most ₹1.00 (covers round-off); more is a "total" mismatch. | Computed 27,753,600, printed 27,753,600 or 27,753,650 → passes. Printed 27,800,000 → "total" |
| BR-SINV-21 | Price check: a line rate above the PO line rate by more than the price tolerance is a "price" mismatch; a rate below the PO rate always passes and is marked "below PO rate". Compared in whole numbers: rate × 10,000 > PO rate × (10,000 + tolerance in basis points). | Tolerance 0%: ₹241.00 → "price". ₹238.00 → passes, "below PO rate" |
| BR-SINV-22 | Qty check: billed qty above the line's billable qty (BR-SINV-02) by more than the qty tolerance is a "qty" mismatch; the qty tolerance is the weight tolerance for weight units (kg, g, tonne) and 0 for every other unit; billing less is fine and the rest stays billable. | Weight tol 0.5%, billable 980 kg: 984 kg → passes; 990 kg → "qty". 100 pcs billable, 101 billed → "qty". 600 of 980 kg → passes, 380 kg still billable |
| BR-SINV-23 | Submit runs BR-SINV-19..22, 40 and 41, stores each failed check with expected vs billed, and moves the invoice to `approved` (payable) when nothing fails, else to `blocked`; a blocked invoice is saved, never refused. | Clean example bill → approved. Rate ₹241 → blocked, "price: PO ₹240.00, bill ₹241.00" |
| BR-SINV-40 | GST rate check: a line GST % different from its PO line GST % is a "tax rate" mismatch. | PO line 18%, bill line 12% → "tax rate" |
| BR-SINV-41 | Charge check: any charge line is a "charge not on PO" mismatch, so the bill needs a release (card 5). | Bill with freight ₹2,000 → blocked "charge not on PO" |

### Status after submit
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-SINV-24 | `invoice.manage` can send a blocked invoice back to draft to fix a typing error; the current mismatch list is cleared (the submit result stays in history, BR-SINV-35) and the next submit runs the checks again; any other status → 409. | Blocked for typed rate ₹241 (paper says ₹240); back to draft, fix, submit → approved. Back to draft on an approved invoice → 409 |
| BR-SINV-25 | Release: `invoice.release` moves a blocked invoice to approved with a reason of 3–500 chars; nobody who created, edited, submitted or sent the invoice back to draft (any history row of theirs on it) may release it: 403 `SINV_SELF_RELEASE`, super-admin included (an exception to BR-AUTH-18); who, when, reason and the mismatch list at that moment are stored; any other status → 409. | Ravi creates, Meena submits → blocked; Meena releases → 403; Ravi releases → 403. Back to draft by Ravi, re-submit by Kumar → blocked; Kumar → 403; owner (no history row) releases "metal price rose, agreed by phone" → approved. Release an approved invoice → 409. Reason "ok" → 400 |
| BR-SINV-26 | An approved invoice is never edited; to correct it, `invoice.manage` cancels it with a reason of 10–500 chars and enters a new one (card 6). A blocked invoice can be cancelled with a reason of 3–500; a draft is deleted, not cancelled (409), and a cancelled or legacy invoice → 409. | Approved SINV-2026-11-1, edit → 409. Cancel "wrong qty" (9 chars) → 400; "wrong qty billed" → cancelled; enter SINV-2026-11-4. Cancel a draft → 409 |
| BR-SINV-27 | Cancelled is final: the invoice keeps its number, its qty becomes billable again and its supplier number no longer clashes (BR-SINV-06). | Cancel SINV-2026-11-1 (980 kg) → GRN line billable 980 kg; "INV-44" can be entered again |
| BR-SINV-28 | Due date = invoice date + the PO's payment terms days; an approved invoice whose due date is before today (IST) shows as overdue; payment status stays "unpaid" (no payments in scope). | Invoice 10-11-2026, terms 30 → due 10-12-2026; on 11-12-2026 → overdue |

### Effects on other modules
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-SINV-29 | The PO moves to `invoiced` when it is `fully_received` and every GRN line of the PO has approved invoice qty ≥ its net accepted − accepted returned qty (BR-SINV-02); checked on submit, release and cancel of an invoice and on post and cancel of a purchase return; when the test stops holding an `invoiced` PO goes back to `fully_received`; `partial_received` and `closed` POs keep their status. Replaces the old "Record invoice" action on the PO (BR-PO-15, card 7). | PO 1,000 kg received, approved 600 + 400 → invoiced. Cancel the 400 → fully_received. Approved 980 of 1,000, then 20 kg returned credit only → invoiced. That return cancelled → fully_received |
| BR-SINV-30 | A GRN correction that would bring a line's net accepted qty below the qty on live invoices is refused with 409 (extends BR-GRN-34). | 980 kg billed, correct 30 kg → 409 "cancel the invoice first" |
| BR-SINV-31 | Net payable = bill total − sum of `bill_offset_paise` of its linked (`purchase_debit_notes.supplier_invoice_id`), not-cancelled debit notes, where the offset is the value (taxable + GST) of the note's accepted lines and a rejected-only note links with offset 0 (BR-PRT-44, 45); purchase-returns links a note at post to the oldest approved bill with a line on its GRN lines, with no qty test because a bill approved before the return already billed those kg; if none exists, approving (submit or release) the first such bill links the unlinked notes of its GRN lines only when its billed qty includes the returned qty (billed > net accepted − accepted returned − other live bills), with the same offset; a bill net of the return links nothing; cancelling a bill unlinks its notes, and a later-approved covering bill re-links them under the same "billed qty includes returned qty" test. | Bill for 980 kg approved, then 20 kg accepted returned (₹4,800 + GST ₹864) → offset ₹5,664, net ₹2,71,872.00. 20 kg returned first, supplier bills 980 kg, released → linked later, offset ₹5,664, net ₹2,71,872.00. Supplier bills 960 kg → no link, net ₹2,71,872.00. 20 kg rejected returned → note linked, offset ₹0, net ₹2,77,536.00 |

### Settings, lists, screens, control
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-SINV-32 | Two tolerances live in company settings: price % and weight %, each 0–10 with up to 2 decimals (default price 0%, weight 0.5%: cards 1 and 2 = A), changed only with `company.manage` and logged; a change applies to the next submit only. | Weight 0.5 → saved. 12 → 400. Changing to 1% does not re-check blocked invoices |
| BR-SINV-33 | Every endpoint needs a login (401) and its key (403 `PERMISSION_DENIED`); the screen does not render actions the user lacks. | Floor supervisor opens the invoice list → 403; no menu entry |
| BR-SINV-34 | Every state change locks in one order, the same as GRN correction and purchase returns: invoice row (actions on an existing bill) → GRN header(s) by id → PO → GRN lines by id → debit-note rows → number counter, and checks status in the same save; the loser of a race gets 409 and nothing is half-saved. | Two users submit at once → one result, other 409. Release and cancel at once → one wins |
| BR-SINV-35 | Every create, edit, submit, back to draft, release, cancel and delete writes an append-only history row: who, when, from → to status, reason; an edit row stores the changed fields (old → new); a submit row stores its match result, kept after back to draft; submit, release and cancel rows store the ids of debit notes linked or unlinked. | Edit rate 24,100 → 24,000 → row "rate: 24,100 → 24,000". Back to draft → the earlier "price" result still in history. Release linking DN/26-27/12 → row lists it |
| BR-SINV-36 | All amounts are integer paise; a line or total above `Number.MAX_SAFE_INTEGER` → 400. | Qty 1e9 × rate 1e9 → 400 |
| BR-SINV-37 | The invoice list filters by draft, blocked, payable, overdue and cancelled with a count per filter from one call, and searches our number, supplier number, supplier name and PO number; legacy rows (old "Record invoice") show only under "All", read-only, in no chip. | Search "INV-44" → the Bharat Alloys invoice; blocked chip shows 2. Legacy LEGACY-12 → under All only, no actions |
| BR-SINV-38 | Next step: a GRN in `accepted` or `partial_accepted` with billable qty, and a PO with billable qty, offer "Enter supplier invoice" to `invoice.manage`, prefilled with the billable lines at PO rate and GST %. | GRN-2026-11-12 accepted → button; form shows 980 kg, ₹240.00, 18%. Fully billed GRN → no button |
| BR-SINV-39 | The invoice detail shows the document flow PR → PO → GRN(s) → invoice with each document's number and status to any `invoice.view` holder (even without PO or GRN keys), and each mismatch with expected vs billed per line; the match uses only the figures typed from the paper bill (no bill image in v1). | Blocked bill → "Qty: billable 980 kg, billed 990 kg" on the line. Accounts user without `po.manage` → sees "PO-2026-11-7 · Fully received" |

## Security
Sensitive data — what must never leave the server or be shown to which role:
| Data | Who may see it | Who may change it |
|---|---|---|
| invoice amounts, rates, match result | `invoice.view` | `invoice.manage` (draft only) |
| release reason, history | `invoice.view` | nobody (append-only) |
| tolerances | `invoice.view`, `company.manage` | `company.manage` |

Abuse cases — each one ends in a rule above:
| Who | Tries to | Stopped by |
|---|---|---|
| accounts user, admin | release a blocked bill they created, edited, submitted or sent back to draft (`SINV_SELF_RELEASE`) | BR-SINV-25 |
| accounts user | move a draft to another PO to bill its kg | BR-SINV-01 |
| anyone | hide what was changed before a re-submit | BR-SINV-35 (field diff, earlier result kept) |
| accounts user | bill the same kg twice (two drafts, two bills) | BR-SINV-02, 03 |
| accounts user | enter the same paper bill twice | BR-SINV-06 |
| anyone | edit an approved bill to change the amount | BR-SINV-26 |
| stores | correct a GRN down after it was billed | BR-SINV-30 |
| anyone | widen tolerance to push a bill through | BR-SINV-32 (owner key, logged, not retroactive) |
| user without key | call an endpoint directly | BR-SINV-33 |

Audit: create, edit, submit, back to draft, release, cancel, delete (BR-SINV-35); tolerance changes in the
company settings history.

## Edge cases
Full list: `design/edge-cases.md` (84 rows). Every row there names a rule in this file.
| Source | Count |
|---|---|
| benchmark | 57 |
| owner | 12 |
| invariant | 15 |

## Changes to other modules
Rules this module needs in specs it does not own. Not edited here: each owner spec takes the change as a
change request before or with this build.
| Module (spec) | Change | Why (rule here) |
|---|---|---|
| purchase-order (`docs/specs/purchase-order.md`) | BR-PO-12: a `closed` PO (incl. short-closed) can still be billed for its received qty through the supplier invoice; still no edit, send, GRN or reopen. | BR-SINV-04 |
| purchase-order | BR-PO-15 replaced: no "Record invoice" action, endpoint `POST /po/:id/invoice` and `MarkPoInvoicedDialog` removed; `invoiced` is set and cleared only by the invoice service; new edge `invoiced → fully_received`; Flow row "fully_received → record supplier invoice" rewritten. `invoiced_by/at` = who approved or released the covering bill. | BR-SINV-29 |
| purchase-order | PO detail: "Enter supplier invoice" next step and an "Invoices" card. | BR-SINV-38 |
| grn (`docs/specs/grn.md`) | BR-GRN-34 extended: a correction may not take a line's net accepted qty below the qty on live supplier invoices (409). | BR-SINV-30 |
| grn | `WEIGHT_UNITS = kg, g, tonne` next to `WHOLE_NUMBER_UNITS` (backend type + frontend copy + contract test). | BR-SINV-22 |
| grn | GRN detail (`accepted`, `partial_accepted`): "Enter supplier invoice" next step and an "Invoices" card. | BR-SINV-38 |
| subcontracting (company settings, D-017) | Settings page gets an "Invoice matching" card: price % and weight % tolerances, `company.manage`, logged in the settings history (extend BR-SCO-09/29); seeded price 0%, weight 0.5%. | BR-SINV-32 |
| purchase-returns | Billable qty reads the accepted returned qty of posted returns (BR-PRT-43); post and cancel of a return re-run the PO "Invoiced" test; post links the debit note to the oldest approved covering bill (`purchase_debit_notes.supplier_invoice_id`, nullable FK + index, `bill_offset_paise`); the debit note print reads "supplier bill no. and date" only from its linked bill (`supplier_invoice_id`), not from all bills of the PO. Shared lock order GRN header(s) → PO → GRN lines → debit-note rows → counter; returns never lock an invoice row, so the invoice-first prefix cannot cycle. | BR-SINV-02, 29, 31, 34 |
| this module's `design/` (designer follow-ups) | `data.md:113` names `debit_notes`: the table is `purchase_debit_notes` (link `supplier_invoice_id`, `bill_offset_paise` owned by purchase-returns; invoice approval writes both for late links); tolerance seed weight 50 bp (A-42); keep `idx_sinv_lines_grn_item`; history `detail` holds field diff, match result, debit-note ids; lock order per BR-SINV-34. `api.md`: wrong-status errors are 409 (not 400); cancel reason 10–500 on approved; `poId` not patchable. `screens.md:92`: net payable = total − sum of `bill_offset_paise`, not note totals. | BR-SINV-01, 11, 24–26, 31, 32, 34, 35 |
| auth | New keys `invoice.view`, `invoice.manage` (seed ow, bo), `invoice.release` (seed ow). | Who can do what |

## Not now
- Payments, partly paid / paid status, payment schedule, 180-day ITC reversal warning (Rule 37).
- Accounting ledger / journal entries, ITC ledger, GSTR-2B reconciliation.
- One invoice across several POs (ERPNext allows it).
- Manual "on hold" of an approved invoice (ERPNext).
- Supplier credit notes entered by us (supplier side); debit notes belong to purchase-returns.
- Job-work (subcontracting) bills against SCOs.
- Bills before goods arrive (ordered-qty billing), advance invoices.
- Photo / PDF upload of the paper bill.
- Wider price tolerance per item group (metal vs others).

## Open questions
Must be empty at freeze. Each one ends as an owner card in `OWNER.md` or a row in `assumptions.md`.

None open. Owner cards are in `OWNER.md` (answered A, pre-approved under D-028); benchmark-decided money /
stock / tax / permission lines are `confirm` rows A-01 … A-10, A-12, A-24, A-43 … A-47 in `assumptions.md`; designer questions D1–D8
are answered in `design/` and logged as A-13 … A-36.

Card sources (links kept here because `OWNER.md` carries none; all read 2026-11-20):
| Card | Answer | ERPNext | Odoo | SAP B1 / SAP | Stricter / why A | Rules |
|---|---|---|---|---|---|---|
| 1 Price above PO | A 0% | checks rate against PO; over-billing % in [accounts settings](https://docs.frappe.io/erpnext/accounts-settings) | no % tolerance ([control bills](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/purchase/manage_deals/control_bills.html)) | tolerance limit, payment block above ([SAP](https://blogs.sap.com/?p=105339)) | 0% is strictest; metal swings → owner sees each | BR-SINV-21, 32 |
| 2 Weight above GRN | A 0.5% | one % for all items (accounts settings) | none | per tolerance key (SAP link) | small weighbridge gap only for weight units | BR-SINV-22, 32 |
| 3 Who releases | A owner, not the entrant | "On Hold" release by role ([PI](https://docs.frappe.io/erpnext/user/manual/en/purchase-invoice)) | "Should be paid" changed by hand (control bills) | payment block released by authorised user (SAP link) | none forbid self-release → stricter adds it | BR-SINV-25 |
| 4 Duplicate number | A refuse | refuses per supplier, cancelled ignored ([forum](https://discuss.frappe.io/t/cheking-provider-invoice-number-uniqueness/14944)) | warns ([OCA](https://www.github.com/OCA/account-invoicing/issues/1484)) | warns or blocks by setting ([forum](https://archive.sap.com/discussions/thread/3756725)) | refuse; GST Rule 46 unique per FY | BR-SINV-06 |
| 5 Charges on a bill | A charge lines + release | taxes and charges rows on the bill (PI) | bill lines without PO (control bills) | freight on A/P invoice ([B1 A/P](https://help.sap.com/saphelp_sbo900/helpdata/EN/44/fc22561d3c6c30e10000000a114a6b/content.htm)) | none match charges to the PO → stricter: release | BR-SINV-09, 41 |
| 6 Wrong payable bill | A cancel and re-enter | cancel and amend (PI) | reset to draft ([vendor bills](https://www.odoo.com/documentation/18.0/applications/finance/accounting/vendor_bills.html)) | cancel / credit memo (B1 A/P) | cancel keeps the audit trail | BR-SINV-26 |
| 7 Old "Record invoice" | A replace | billed % from bills (PI) | billing status from bill qty (control bills) | invoice copied from receipt (B1 A/P) | no ERP has a status button | BR-SINV-29 |

## Changelog
- 2026-11-20 v0 — draft (pass 1; owner delegated, recommended options applied)
- 2026-11-20 v0 — pass 2: coordinator answers folded in (legacy rows BR-04/06/37, debit-note link BR-31,
  coverage with returns BR-29, IST month BR-11); defaults price 0% / weight 0.5% (BR-32); snapshot (BR-14);
  negative paths on BR-24/25/26; Changes to other modules; edge cases, assumptions, OWNER.md written.
  Cross-spec alignment: debit notes deduct only through `supplier_invoice_id` (BR-31); return post also
  re-runs the PO test (BR-29).
- 2026-11-20 v0 — pre-freeze security + spec-review fixes: self-release ban widened to every history actor,
  super-admin included (BR-25); wrong status = 409 (BR-11, 24–26); approved cancel reason ≥ 10 (BR-26); PO fixed
  after create (BR-01); history diff, kept result, debit-note ids (BR-35); flow visible to `invoice.view`, typed
  figures only (BR-39); offset definition aligned with BR-PRT-44/45 (BR-31); one lock order (BR-34).
- 2026-11-20 v1 — frozen; OWNER.md approved on the owner's delegation (D-028): owner pre-approved recommended options in chat, 2026-11-20: "take ur own decision and record them and run whatever parallel subagents u want to complete a complete scm module according to my plan, ill do a complete merge in moring once completed"
