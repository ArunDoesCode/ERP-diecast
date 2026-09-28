---
module: approval-policies
status: draft            # draft | frozen | changed-after-freeze
version: 0
frozen_on:
owner: Arun
depends_on: [auth-setup, purchase-requisition, purchase-order, subcontracting]
---

# Approval policies — setup, matching and policy screen

> Part of the approval module; requests and sign-off are in `approval.md`. Code, gaps and history:
> `docs/modules/approval.md`.

## Summary
The owner decides a few rules once ("tooling → owner", "PO ≥ ₹1L → back office then owner"); the
super-admin enters them as policies. Each policy says which documents it covers (PR/PO/SCO, category,
amount band) and who signs, in order. At submit the system picks the one best-matching policy.
Screen: Setup → Approval Policies — table of name, doc type, category, amount band in ₹, priority,
active, levels; filters doc type, active, search.

## Who can do what
| Action | Allowed |
|---|---|
| list and view policies | super-admin, owner, back_office |
| create / edit / retire policies | super-admin |
| anyone else | 403 |

## Flow
| From | Action | To | Rule |
|---|---|---|---|
| — | create | active (or inactive) | BR-APR-02, 03, 05, 06, 07 |
| active | edit | active | BR-APR-08, 09, 10, 13 |
| active | retire (`isActive = false`) | inactive | BR-APR-11 |
| inactive | re-activate | active | BR-APR-07 |

## Rules
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-APR-01 | Only super-admin creates or edits policies; super-admin, owner and back_office can list and view them; others get 403. The screen shows Create/Edit only to super-admin. | back_office POST createPolicy → 403, GET list → 200; owner sees no Edit button |
| BR-APR-02 | A policy needs a non-empty name, a whole-number priority ≥ 1 (lower = stronger), a doc type (pr/po/sco) and a category from: any, sale_order, stock_reorder, maintenance, tooling, subcontracting, misc. On create a missing category = any. Otherwise 400. | empty name or priority 0 → 400; no category → stored as any |
| BR-APR-03 | Chain steps are numbered 1..n with no gaps or repeats; a role step has a role and no employee; a specific step has an employee and no role. Otherwise 400. The server sets `approvalLevels` = number of steps and ignores any value sent. | levels [1,3] → 400; 2 steps with `approvalLevels: 5` → stored 2 |
| BR-APR-05 | Auto-approve on: the chain may be empty and levels = 0; the form hides the chain and sends none. Auto-approve off: at least one step, else 400. | auto on + no steps → 201, levels 0; auto off + no steps → 400 |
| BR-APR-06 | Amount limits are optional whole paise ≥ 0; if both are set, max > min, else 400. On edit the check uses stored values plus the change. The form takes rupees (up to 2 decimals) and sends ×100; blank = no limit. | stored min ₹50,000, edit max to ₹10,000 → 400; user types 50000 → API gets 5000000 |
| BR-APR-07 | Only one active policy per (priority, doc type, category). Creating, re-prioritising or re-activating into a taken slot → 409 `POLICY_PRIORITY_TAKEN`. Inactive duplicates are fine. | active PR/tooling at priority 1, second one at priority 1 → 409; created inactive → 201 |
| BR-APR-08 | Edit (PATCH) is partial: any field left out keeps its stored value. A left-out category must not reset to any (BL-022). | tooling policy, PATCH `{ name: "X" }` → still tooling, all else unchanged |
| BR-APR-09 | On edit, sending `null` clears a field that may be empty (description, min, max); `null` on any other field → 400. | PATCH `{ maxAmountPaise: null }` → no upper limit; PATCH `{ priority: null }` → 400 |
| BR-APR-10 | An edit with no updatable field → 400; min and max amount count as updatable fields. | PATCH `{}` → 400; PATCH `{ minAmountPaise: 100 }` → 200 |
| BR-APR-11 | Doc type cannot change after create (400) (assumed). Policies are never deleted; they are retired with `isActive = false` and then stop matching new submissions. | PATCH docType po on a PR policy → 400; no delete endpoint |
| BR-APR-13 | Editing, re-prioritising or retiring a policy never changes a request already in progress; acting always uses the request's own copy of the chain. | pending 2-step request, policy cut to 1 step → still needs 2 approvals |
| BR-APR-14 | Every create stamps `createdBy`; every create and edit stamps `lastUpdatedBy` and `lastUpdatedAt`. | super-admin S edits → lastUpdatedBy = S, time moves |
| BR-APR-15 | `isSaleOrderLinked` is not used for matching and not accepted on create or edit; a sale-order fast track is a policy with category sale_order (BL-002) (Q5). | body with isSaleOrderLinked true → not accepted; PR sale_order ₹30,000 + sale_order < ₹50k policy → matches |
| BR-APR-16 | Candidates are active policies with the document's doc type whose category is any or equals the document's category (BR-APR-21). | PR tooling: active PO/any and PR/maintenance policies → neither matches |
| BR-APR-18 | A policy matches on amount when min ≤ amount < max (min included, max excluded); an empty limit means no limit. | PR exactly ₹10,000.00 → "₹10k–₹50k" matches, "< ₹10k" does not |
| BR-APR-19 | The most specific match wins: 1 exact category + amount limit; 2 exact category, no limit; 3 any + amount limit; 4 any, no limit. Within a level, lower priority wins; on a tie, lower policy id wins. | ₹5,000 maintenance PR: "maintenance, no limit, p2" beats "any < ₹10k, p10"; two level-3 policies p10/p11 → p10 |
| BR-APR-21 | What is matched: PR → category = PR type, amount = estimated value; PO → category = the common type of its source PRs (mixed → any), amount = PO total incl. GST; SCO → category = subcontracting, amount = sum of line values (Q6, Q7). | PO from tooling PRs only → tooling; tooling + misc → any |
| BR-APR-22 | If no active policy matches, a built-in fallback applies: one level, role owner. The fallback record is inactive so it never competes as a candidate (assumed). | no PR policy matches → request has 1 owner step; fallback isActive false |
| BR-APR-57 | Edit opens the form only after the policy's details load, filled with every stored value (category, amounts, auto-approve, chain incl. specific employees). Save sends the category as currently shown and never swaps in any for an untouched field (BL-023). | tooling ₹25,000–₹1,00,000, 2 steps → form shows exactly that; rename only → still tooling |
| BR-APR-58 | Cancel closes the form and throws away unsaved changes; reopening the policy shows stored values (BL-023). | name changed, Cancel, reopen → stored name |
| BR-APR-59 | While the edit form is open, a background refresh of the policy does not overwrite unsaved edits (BL-023). | window regains focus and data refetches → edits kept |
| BR-APR-60 | After a good save the form closes and the list and details refresh; on error the form stays open with the user's values and the server message. | save returns 409 → form open, values kept, message shown |

## Not now
- History of policy changes (who changed which limit, when) beyond `lastUpdatedBy`.
- Warning when two policies cover the same amount band.
- Rules by department or supplier.

## Questions for you
| # | Question | Options | Answer |
|---|---|---|---|
| Q5 | Keep the "sale-order linked" flag on policies? (BR-APR-15, BL-002) | **A** Drop it; use category sale_order (recommended) / B Keep both / C Decide in M4 | |
| Q6 | Which amount is compared with policy limits? (BR-APR-21) | **A** PO total incl. GST; PR estimated value (recommended) / B PO value before GST | |
| Q7 | Which category does a PO or SCO use for matching? (BR-APR-21) | **A** PO = type of its PRs (mixed → any); SCO = subcontracting (recommended) / B Buyer picks a category on the PO/SCO / C PO policies by amount only | |

## Changelog
- 2026-09-27 v0 — draft (as part of `approval.md`).
- 2026-09-28 — rewritten in slim format; split out of `approval.md`; merged 56→01, 04→03, 62→05, 61→06, 12→11, 17→16, 20→19, 63→57; old Q-4 now assumed.
