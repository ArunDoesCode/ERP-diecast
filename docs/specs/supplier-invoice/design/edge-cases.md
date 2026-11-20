# Supplier invoice — edge cases

> Written by spec-analyst from `docs/research/supplier-invoice.md` → "Edge cases seen in the products", the
> owner's delegation (D-028, cards answered A), the coordinator's answers and the designers' files. Checked by
> spec-reviewer: every row names a rule. Tests are named by rule id, so the rule id is also the test id.
> The owner sees only the count. Rows E-77 … E-84 were added in the cross-spec and pre-freeze rounds (2026-11-20).

Source: **benchmark** (what ERPNext / Odoo / SAP do, or the stricter one; agent and coordinator choices made on
that basis) · **owner** (a card, answered A under D-028) · **invariant** (money in paise, stock only through the
ledger, permission + audit on state changes, one winner in a race).

Example data as in the spec Summary: PO-2026-11-7, Bharat Alloys, ADC12 1,000 kg at ₹240.00, GST 18%,
GRN-2026-11-12 accepted 980 kg, plant and supplier in state 29.

## What can be billed
| # | Case | What the system does | Source | Rule |
|---|---|---|---|---|
| E-01 | Bill arrives before the goods (PO dispatched, no GRN) | Refused 400; enter it after the GRN | benchmark (Odoo received-qty policy; SAP B1 copies from goods receipt) | BR-SINV-04 |
| E-02 | GRN line still waiting for QA | Not billable, 400 | benchmark (Odoo bills received qty only) | BR-SINV-02 |
| E-03 | One bill covers two GRNs of the same PO | Allowed; each line points to its own GRN line | benchmark (ERPNext pulls several receipts) | BR-SINV-01 |
| E-04 | Line taken from a GRN of another PO | 400 | benchmark (one bill = one PO here; several POs is "Not now") | BR-SINV-01 |
| E-05 | Same GRN line twice on one bill | 400 | invariant | BR-SINV-01 |
| E-06 | Two drafts try to bill the same 980 kg | First holds it; second 400 "nothing left to bill" | benchmark (stricter: drafts reserve) | BR-SINV-03 |
| E-07 | Partial bill: 600 of 980 kg | Passes; 380 kg stays billable for the next bill | benchmark (Odoo partial bills) | BR-SINV-22 |
| E-08 | Short-closed PO with 600 kg received | 600 kg billable | benchmark (ERPNext/Odoo bill receipts of closed orders) | BR-SINV-04 |
| E-09 | PO already has an old "Record invoice" row | Not billable again, 400 | benchmark (ERPNext/Odoo submitted bills are immutable) | BR-SINV-04 |
| E-10 | Supplier deactivated after the GRN | Bill still entered | benchmark (ERPNext hold is per document type; received goods are owed) | BR-SINV-12 |
| E-11 | 20 kg returned (accepted, credit only) before billing | Billable 960 kg | benchmark (purchase-returns BR-PRT-43; Odoo received qty net of returns) | BR-SINV-02 |
| E-12 | 20 kg of rejected stock returned | Billable stays 980 kg; rejected kg were never billable | benchmark (purchase-returns BR-PRT-43) | BR-SINV-02 |
| E-13 | Accepted return with replacement expected | Original GRN line billable drops; the replacement GRN is billed on its own | benchmark (ERPNext/Odoo bill each receipt) | BR-SINV-02 |

## Entry checks
| # | Case | What the system does | Source | Rule |
|---|---|---|---|---|
| E-14 | Bill number " inv-44 " | Stored "INV-44" | benchmark (CBIC Rule 46, ERPNext key) | BR-SINV-05 |
| E-15 | Bill number with a space or 17 characters | 400 | benchmark (CBIC Rule 46) | BR-SINV-05 |
| E-16 | Same number, same supplier, same financial year | 409 | owner (card 4) | BR-SINV-06 |
| E-17 | Same number from another supplier | Saved | benchmark (Zoho, ERPNext) | BR-SINV-06 |
| E-18 | Same number dated 31-03-2027 and 01-04-2027 | Saved: different financial years | benchmark (Rule 46 per FY, Zoho) | BR-SINV-06 |
| E-19 | Same number as a cancelled bill | Saved | benchmark (ERPNext ignores cancelled) | BR-SINV-06, 27 |
| E-20 | Same number as an old "Record invoice" row | 409 | benchmark (coordinator: legacy rows count) | BR-SINV-06 |
| E-21 | Invoice date tomorrow, or before the PO date | 400 | benchmark | BR-SINV-07 |
| E-22 | 12.5 pcs billed | 400 (whole-number unit) | invariant | BR-SINV-08 |
| E-23 | GST 15% typed | 400, not a GST slab | benchmark (GST slabs) | BR-SINV-08 |
| E-24 | Rate 0 or freight ₹0 | 400 | benchmark | BR-SINV-08, 09 |
| E-25 | 11th charge line | 400 | benchmark (agent limit) | BR-SINV-09 |
| E-26 | Qty × rate beyond the safe integer | 400 | invariant | BR-SINV-36 |
| E-27 | Created 01-12-2026 03:00 IST (still 30-11 in UTC) | Number SINV-2026-12-… | benchmark (D-022 plant day) | BR-SINV-11 |
| E-28 | Edit or delete a non-draft | 409 "not a draft" | benchmark (ERPNext submitted = locked) | BR-SINV-11 |

## GST and match
| # | Case | What the system does | Source | Rule |
|---|---|---|---|---|
| E-29 | Clean bill (980 kg × ₹240, CGST + SGST 9% each) | Payable at once | benchmark (ERPNext submit, Odoo "should be paid", SAP auto-release) | BR-SINV-23 |
| E-30 | Any check fails | Saved as blocked, never refused | benchmark (SAP payment block, Odoo Exception, ERPNext On Hold) | BR-SINV-23 |
| E-31 | Rate ₹241 against PO ₹240 | Blocked "price" | owner (card 1) | BR-SINV-21 |
| E-32 | Rate ₹238 against PO ₹240 | Passes, marked "below PO rate" | benchmark (SAP: lower = warning) | BR-SINV-21 |
| E-33 | Metal bill 984 kg against 980 kg billable (0.4%) | Passes | owner (card 2) | BR-SINV-22 |
| E-34 | Metal bill 990 kg against 980 kg | Blocked "qty" | owner (card 2) | BR-SINV-22 |
| E-35 | 101 pcs billed against 100 pcs | Blocked "qty" (pieces exact) | owner (card 2) | BR-SINV-22 |
| E-36 | Unknown unit ("set", "litre") | 0 tolerance | benchmark (stricter) | BR-SINV-22 |
| E-37 | Bill GST 12% on a PO line at 18% | Blocked "tax rate" | benchmark (ERPNext validates against PO) | BR-SINV-40 |
| E-38 | Printed CGST 50 paise off | Passes (≤ ₹1) | benchmark (ERPNext round-off) | BR-SINV-19 |
| E-39 | Printed total ₹2 off | Blocked "total" | benchmark | BR-SINV-20 |
| E-40 | IGST printed by a same-state supplier | Blocked "tax" | benchmark (GST place of supply, ERPNext India) | BR-SINV-19 |
| E-41 | Unregistered supplier shows ₹500 CGST | Blocked "tax" | benchmark (GST law) | BR-SINV-16 |
| E-42 | GST 0% line (exempt) | No tax heads; passes | benchmark | BR-SINV-14, 15 |
| E-43 | Freight ₹2,000 on the bill | Charge line; bill blocked "charge not on PO" until released | owner (card 5) | BR-SINV-41 |
| E-44 | Plant state code missing at submit | 400 naming the field | invariant (D-017) | BR-SINV-18 |
| E-45 | Supplier GSTIN edited after approval | Bill keeps the tax split it was submitted with | benchmark (submitted docs immutable) | BR-SINV-14 |
| E-46 | Reverse charge ticked | Stored and shown; no posting | benchmark (ERPNext flag) | BR-SINV-17 |
| E-47 | Bill unpaid for 180 days | No warning (payments not in scope) | benchmark (no ERP read warns) | BR-SINV-17 |

## After submit
| # | Case | What the system does | Source | Rule |
|---|---|---|---|---|
| E-48 | Typing error found on a blocked bill | Back to draft, fix, submit again | benchmark (Odoo reset to draft) | BR-SINV-24 |
| E-49 | Back to draft on a payable bill | 409 | owner (card 6) | BR-SINV-24 |
| E-50 | Person who created, edited, submitted or sent the bill back tries to release it | 403 `SINV_SELF_RELEASE`, also for a super-admin | owner (card 3) | BR-SINV-25 |
| E-51 | Owner entered the bill himself | Another key holder releases, or it goes back to draft | owner (card 3) | BR-SINV-25 |
| E-52 | Release reason "ok" (2 chars) | 400 | invariant | BR-SINV-25 |
| E-53 | Release a payable or cancelled bill | 409 | invariant | BR-SINV-25 |
| E-54 | Payable bill found wrong | Cancel with a reason of 10+ chars, enter a new one | owner (card 6) | BR-SINV-26 |
| E-55 | Cancel a draft | 409: delete it instead | benchmark (ERPNext: drafts deleted, submitted cancelled) | BR-SINV-26 |
| E-56 | Cancel a payable bill of 980 kg | 980 kg billable again; its number free again | benchmark (ERPNext cancel) | BR-SINV-27 |
| E-57 | Due date passes | "Overdue" badge beside "Payable"; status unchanged | benchmark (ERPNext Overdue) | BR-SINV-28 |
| E-58 | PO payment terms 0 days | Due on the invoice date | benchmark | BR-SINV-28 |
| E-59 | Tolerance widened after a bill was blocked | Bill stays blocked until submitted again or released | benchmark (SAP checks at posting) | BR-SINV-32 |
| E-60 | Tolerance 12% | 400 | benchmark (agent limit 0–10%) | BR-SINV-32 |

## Effects on PO, GRN and returns
| # | Case | What the system does | Source | Rule |
|---|---|---|---|---|
| E-61 | Last bill of a fully received PO becomes payable | PO → Invoiced | owner (card 7) | BR-SINV-29 |
| E-62 | Covering bill cancelled | PO → Fully received | owner (card 7) | BR-SINV-29 |
| E-63 | All received qty billed on a partly received PO | PO stays Partly received | benchmark (Odoo billing status follows receipts) | BR-SINV-29 |
| E-64 | Closed PO fully billed | Stays Closed | benchmark | BR-SINV-29 |
| E-65 | 20 kg accepted returned (credit only) after the PO is Invoiced | PO stays Invoiced; note linked at post to the oldest approved bill (no qty test: that bill already billed the kg), offset ₹5,664, net payable ₹2,71,872.00 | benchmark (coordinator; ERPNext debit note against the bill) | BR-SINV-29, 31 |
| E-66 | That return cancelled again | Debit note cancelled, offset drops out; PO back to Fully received if the bills no longer cover it | invariant | BR-SINV-29, 31 |
| E-67 | 20 kg accepted returned first, supplier still bills 980 kg | Blocked "qty" (billable 960); once released, the note is linked late with offset = accepted-lines value ₹5,664: net ₹2,71,872.00 | benchmark (purchase-returns BR-PRT-44, 45) | BR-SINV-22, 31 |
| E-68 | 20 kg returned first, supplier bills 960 kg net | Payable; note not linked, so not deducted twice; net ₹2,71,872.00 | benchmark (stricter: no double deduction) | BR-SINV-31 |
| E-77 | One debit note covers GRN lines on two bills | Linked whole to the oldest approved bill; offset = its accepted-lines value | benchmark (coordinator; SAP B1 credit memo based on one invoice) | BR-SINV-31 |
| E-78 | Bill with a linked debit note is cancelled | Note unlinked; a later-approved covering bill re-links it only if its billed qty includes the returned qty | benchmark (ERPNext cancel unlinks returns) | BR-SINV-31 |
| E-80 | Debit note for 20 kg rejected only, after the bill | Linked with offset ₹0; net payable unchanged ₹2,77,536.00 | benchmark (purchase-returns BR-PRT-45) | BR-SINV-31 |
| E-81 | Draft edit tries to switch the PO | 400 | invariant | BR-SINV-01 |
| E-82 | Bill edited, sent back and re-submitted by different people | Each of them is barred from releasing; the earlier result and field changes stay in history | invariant | BR-SINV-25, 35 |
| E-83 | Accounts user without PO or GRN keys opens a bill | Sees PO and GRN numbers and statuses in the flow | benchmark (ERPNext shows linked docs on the bill) | BR-SINV-39 |
| E-84 | Cancel a payable bill with reason "wrong qty" (9 chars) | 400; at least 10 characters | invariant | BR-SINV-26 |
| E-79 | Return posted on a fully received PO whose bills then cover the rest | PO → Invoiced at the return post | benchmark (coordinator: post re-runs the test) | BR-SINV-29 |
| E-69 | Replacement return on an Invoiced PO | Refused by purchase-returns (409); PO stays Invoiced | benchmark (purchase-returns BR-PRT-22) | BR-SINV-29 |
| E-70 | GRN correction of 30 kg after 980 kg billed | 409 "cancel the invoice first" | benchmark (SAP: invoiced receipt needs credit memo) | BR-SINV-30 |
| E-71 | Billing and a GRN correction at the same moment | One wins, the other 409; nothing half-saved | invariant | BR-SINV-34 |
| E-72 | Two users submit, or release and cancel, at once | One result, the other 409 | invariant | BR-SINV-34 |

## Access and audit
| # | Case | What the system does | Source | Rule |
|---|---|---|---|---|
| E-73 | Floor supervisor opens the invoice list or calls the API | 403; no menu entry | invariant | BR-SINV-33 |
| E-74 | Draft deleted | History row kept with our number | invariant | BR-SINV-35 |
| E-75 | Release | Who, when, reason and the mismatch list at that moment stored | invariant | BR-SINV-25, 35 |
| E-76 | Old "Record invoice" rows | Under "All" only, read-only, no chip | benchmark (coordinator) | BR-SINV-37 |
