---
module: known-defects
status: draft            # draft | frozen | changed-after-freeze
version: 0
frozen_on:
owner: Arun
depends_on: [purchase-requisition, approval, purchase-order, grn, inventory, auth-setup]
backlog: [BL-001, BL-004, BL-005]
---

# Known defects (M1 blockers)

## Summary
Three P1 fixes that block M1:
- **BL-001 PR cancel**: the "Cancel PR" button works end to end, leaves an audit trail, closes any open
  approval, and never leaves a PO pointing at a dead PR.
- **BL-004 bootstrap-admin**: an empty DB (dev, CI, first factory install) gets its first super-admin login.
- **BL-005 db:reset**: one command gives a local DB with users per role and PR/PO/GRN in every state. It
  cannot wipe a non-local DB by accident.

Done = Cancel works in the UI; `bun run db:reset` gives a DB where every role can log in and every
PR/PO/GRN status shows up; `bun run bootstrap-admin` on an empty prod DB creates exactly one admin.

## Who can do what
| Action | Allowed |
|---|---|
| Cancel a PR | super-admin, owner, floor_supervisor, back_office (others → 403) |
| Run bootstrap-admin | anyone with shell + `DATABASE_URL`, only while no active super-admin exists |
| Run db:reset | anyone with shell, local DB only |

Scripts are not HTTP routes. Their guard is shell access plus the rules below.

## Flow (PR cancel)
| From | Action | To | Rule |
|---|---|---|---|
| draft | cancel (reason optional) | cancelled | BR-KD-03, 06 |
| pending_approval | cancel (reason required) | cancelled; open approval closed | BR-KD-03, 06, 09 |
| approved, no live PO link | cancel (reason required) | cancelled | BR-KD-03, 04, 06 |
| partial_ordered / fully_ordered | cancel | refused 409; cancel the PO first | BR-KD-04 |
| rejected / cancelled | cancel | refused 409 | BR-KD-03 |
| any | PATCH `status=cancelled` | refused 400 | BR-KD-01 |

## Rules

### PR cancel (BL-001)
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-KD-01 | Cancel has one path only: `DELETE /api/pr/deletepr/:id` with the id in the path. Bad id → 400 `INVALID_PR_ID`; unknown id → 404 `PR_NOT_FOUND`; `PATCH /updatepr` with `status: cancelled` → 400 `USE_CANCEL_ENDPOINT`. Success → 200 with the cancelled PR. | `DELETE /deletepr/abc` → 400; PATCH `{status:"cancelled"}` on a draft → 400, stays draft |
| BR-KD-02 | Cancel is always soft: the PR, its lines and its number stay; the number is never reused. A cancelled PR is read-only (edit → 409 `PR_NOT_EDITABLE`) but still listed and filterable by `status=cancelled`. No hard delete in M1 (assumed). | Cancel PR-2609-0003 → row stays `cancelled`; next PR is not 0003; PATCH notes → 409 |
| BR-KD-03 | A PR can be cancelled only from `draft`, `pending_approval` or `approved`. `rejected`/`fully_ordered` → 409 `PR_NOT_CANCELLABLE`; already `cancelled` → 409 `PR_ALREADY_CANCELLED` (not a silent 200). | Cancel a rejected PR → 409 `PR_NOT_CANCELLABLE` |
| BR-KD-04 | If any PR line is linked to a PO that is not `cancelled`, cancel is refused with 409 `PR_HAS_PO_LINES`, naming the PO numbers and saying "cancel the PO first". This applies whatever the PR status is. | Approved PR, one line on draft PO-2609-0002 → 409 naming it; cancel that PO, PR goes back to `approved` → cancel works |
| BR-KD-06 | A reason is optional from `draft` and required from any other status: trimmed length 3–500, else 400 `CANCEL_REASON_REQUIRED`. | Approved PR, reason "  " → 400; draft, empty body → 200, reason null |
| BR-KD-07 | Only the roles in "Who can do what" can cancel. Anyone with that access can cancel any PR, not only their own (assumed). | qa_inspector cancels → 403, PR unchanged |
| BR-KD-08 | A successful cancel records who cancelled, when, and the reason (or null). | back_office cancels with "duplicate" → cancelledBy = that user, reason "duplicate", time set |
| BR-KD-09 | If the PR has an open approval request, cancel closes it and writes exactly one approval trail row with action `cancelled`, actor = the person cancelling (not the requester), notes = the reason. | A raised it, B cancels → one trail row, actor B |
| BR-KD-10 | Status change, audit fields, approval close and trail row happen all together or not at all. Checks run on the locked PR, so of two racing requests only one wins and the other gets the matching 409. | Two cancels at once → one 200, one 409 `PR_ALREADY_CANCELLED`; PO draft vs cancel → only one succeeds |
| BR-KD-13 | Approve/reject/more-info on a request whose PR is cancelled is refused with 409; the PR stays cancelled. (Moves to the approval spec later.) | Approver approves a cancelled PR's request → 409 |
| BR-KD-16 | Screen: "Cancel PR" shows only for draft/pending_approval/approved. Non-draft asks for a reason (3–500) first. On success the PR list, detail and approval queue refresh; on error the message shows and the dialog stays open. | fully_ordered PR → no button; approved PR → reason required before sending |

### bootstrap-admin (BL-004)
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-KD-17 | Run as `bun run bootstrap-admin`. Name, email, password (and optional phone) come from `BOOTSTRAP_ADMIN_*` env, never a command-line argument (assumed). No password env + a terminal → ask twice without echo, must match; no terminal → exit 4. Inputs follow the normal register rules (email valid, password ≥ 8); the error names the field, never its value. Exit 4. | Password "short" → exit 4, message says `password`, "short" not printed |
| BR-KD-20 | Writes nothing and exits if: roles not seeded (exit 3, "run db:reset"); an **active** super-admin exists (exit 2, "already bootstrapped"); the email already belongs to someone (exit 5, never upgrades them). Only inactive super-admins → it proceeds, for lock-out recovery (assumed). | Active super-admin exists → exit 2, employee count unchanged |
| BR-KD-23 | Creates one active super-admin (never an owner), password hashed the same way as normal register, so they can log in right away. Created-by/updated-by = their own id (assumed). | Run on seeded empty DB → exit 0, login with those details → 200 |
| BR-KD-25 | The password, plain or hashed, never appears in any output or log. Success prints only id, name, email, role. | Capture stdout/stderr of a good run → no password, no hash |
| BR-KD-27 | Two runs at the same time create exactly one admin; the other exits 2. | Parallel runs → one exit 0, one exit 2, 1 super-admin |
| BR-KD-28 | Exit codes: 0 created, 1 unexpected error, 2 already bootstrapped, 3 roles missing, 4 bad input, 5 email taken. | DB unreachable → exit 1 |
| BR-KD-29 | No localhost guard: it must work on the first factory DB; BR-KD-20 makes re-runs safe (assumed). | Remote DB, no super-admin → runs |

### db:reset (BL-005)
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-KD-30 | Run as `bun run db:reset [--no-fixtures] [--allow-remote]`. A host other than localhost/127.0.0.1/::1 → exit 2 before connecting, unless `--allow-remote` **and** `DB_RESET_CONFIRM` = the DB name (assumed). `NODE_ENV=production` → always exit 2, no override. | `db.example.com` → exit 2, untouched; production on localhost → exit 2 |
| BR-KD-33 | Before any write: print the target as `host:port/db` with the password masked, and the steps. Check all inputs before dropping: bad `DATABASE_URL` → exit 2; `SEED_USER_PASSWORD` missing or < 8 → exit 4. No dev password in the code (assumed). | No seed password → exit 4, old data still there, target shows `***` |
| BR-KD-35 | Steps in order: guard → drop `public` (and `drizzle`) schema only, never the DB → push schema (same as CI) → page-access seed → admin via BR-KD-17..27 (`admin@diecast.local`) → approval policies → fixtures → summary. `--no-fixtures` stops after policies. Any step fails → stop, print the step name, exit 1. Two runs give the same row counts and document numbers. | Fixtures throw → exit 1, "fixtures" printed, no summary; `--no-fixtures` → 1 employee, 0 PRs |
| BR-KD-40 | The page-access seed fails loudly on an unknown role or page name, never drops rows silently. It marks super-admin, owner and back_office as system roles. | Unknown role in mapping → fails naming it; back_office gets its PR page |
| BR-KD-44 | Fixtures hold at least: Main Store + Scrap Yard; 2 HPDC machines; 8 items (ADC12 and LM24 ingot kg, release agent ltr, cover flux kg, plunger tip, shot sleeve, H13 block kg, gloves); 4 suppliers with valid-format GSTIN/PAN and priced items; one login per desk role (`<role>@diecast.local`) plus one QR-only operator. At least one of each PR, PO and GRN status, one QA-bypassed line, and one overdue PO; dates relative to the run date. | After reset each desk role logs in; `status=<s>` returns ≥ 1 PR for all 7 PR statuses |
| BR-KD-46 | Fixture documents go through the real services as named fixture users, so numbers, trails and stock postings are real. Each approval is done by someone holding that step's role who is not the requester. Stock arrives only via GRN; fixtures never set stock or average cost (so `currentStock` reads 0 until BL-014, which is expected). All money is integer paise. The summary prints row counts, login emails (no passwords) and ledger balance per item. | Every ledger row points to a GRN; `24_500` not `245.00` |

## Not now
- Role checks will move to configurable permissions (rbac spec, not yet written).
- Full approval spec (BL-002); BR-KD-13 moves there.
- Stock and average cost from the ledger (BL-014); atomic GRN posting (BL-016).
- Hard delete of drafts; line-level cancel or short-close of a partly ordered PR; setting line status on header cancel (BL-019).
- Admin password reset beyond BR-KD-20; operator QR login (BL-017).
- Separate test DB (BL-006); migrations instead of push (BL-011).
- Stopping `owner` from registering a `super-admin` (needs its own BL item).

## Questions for you
| # | Question | Options | Answer |
|---|---|---|---|
| Q1 | Who can cancel a PR someone else raised, including after approval? | **A** anyone with PR access, reason required after draft (recommended) / B only the raiser or owner / C only owner | |
| Q2 | Half a PR is on a PO. What happens to the rest? | **A** PR stays blocked until the PO is cancelled (recommended) / B cancel only the leftover lines | |
| Q3 | Need a written reason to cancel a PR never sent for approval? | **A** no (recommended) / B yes | |
| Q4 | Who holds the first super-admin login at the plant? | **A** owner (recommended) / B accounts/IT person | |
| Q5 | Test data items: use the list in BR-KD-44? | **A** yes (recommended) / B I'll send my top 5 items with unit and rate | |
| Q6 | Should fixtures set an opening average cost? Without it every PR estimate is ₹0 and hits the lowest approval tier. | **A** no, wait for BL-014 (recommended) / B yes, standard cost per item | |
| Q7 | Cancelling an already-cancelled PR returns? | **A** 409 error (recommended) / B 200, no change | |

## Changelog
- 2026-09-27 v0 — draft created (BL-001, BL-004, BL-005)
- 2026-09-28 — rewritten in slim format. Merged: 12, 14 → 01; 15 → 02; 05 → 03; 11 → 10; 18, 19 → 17; 21, 22 → 20; 24, 26 → 23; 31, 32 → 30; 34 → 33; 36–39, 41–43 → 35; 45, 49 → 44; 47, 48, 50, 51 → 46.
