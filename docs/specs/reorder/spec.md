---
module: reorder
status: frozen            # draft | frozen (set only by /freeze; change requests keep it frozen)
version: 1
frozen_on: 2026-11-20
owner: Arun
depends_on: [inventory, purchase-requisition, purchase-order, approval, auth-setup, design-system]
brief: docs/briefs/reorder.md
research: docs/research/reorder.md
---

# Reorder (low stock raises a draft requisition)

> Agent layer. The owner reads `OWNER.md`, not this file. ≤ 400 lines (above that: split by sub-module).
> Plain words, one sentence per rule. Tables and columns: `design/data.md`. Endpoints: `design/api.md`.
> Screens: `design/screens.md`. Code locations and history: `docs/modules/inventory.md`,
> `docs/modules/purchase-requisition.md` (no `reorder` map yet).
> Owner was away and delegated every decision (brief, 2026-11-20). Owner-type points were decided with the
> recommended option and are listed as pending cards under "Open questions" for `OWNER.md`.

## Summary
Once a day (and on a "Check now" click) the system looks at every active item with a reorder level, works
out stock that is really usable plus what is already on the way, and puts every item that is at or below its
level on **one draft purchase requisition** (type `stock_reorder`). A named purchase person owns that draft,
checks it and submits it through normal approval; nothing is ordered by itself. Stores sees the same list
live on the Reorder screen. Done on the floor = no one has to spot low stock by eye.
Example data used below: item **ADC12 ingot**, unit kg, reorder level **500 kg**, reorder qty **1000 kg**,
order multiple **250 kg**, min order qty 0, standard rate **24000 paise/kg** (₹240), main-store stock
**480 kg**, nothing on the way → one draft PR line **ADC12, 1000 kg**, estimate **24000000 paise** (₹2,40,000).

## Who can do what
| Action | Key | Seed roles |
|---|---|---|
| see the Reorder screen (live low-stock list, run history) | `inventory.view` (exists) | ow, bo, fs |
| change reorder settings (on/off, run time, draft owner) | `reorder.manage` (new) | ow, bo |
| "Check now" (raises a draft PR) | `reorder.manage` (new) | ow, bo |
| set reorder qty, min order qty, order multiple on an item | `asset.manage` (exists, item edit) | bo |
| see those item fields | `inventory.view` (read-only) | ow, bo, fs |
| edit / submit / cancel the raised draft PR | its requester = the draft owner, or super-admin (PR BR-PR-17) | — |
| approve the PR | approval chain, policy category `stock_reorder` | — |
| super-admin | everything (BR-AUTH-18) | — |

## Flow
Run:
| From | Action | To | Rule |
|---|---|---|---|
| — | daily time reached, switch on | running | BR-RO-10 |
| — | "Check now" | running | BR-RO-11 |
| running | another run already running | refused 409, nothing saved | BR-RO-12 |
| running | finished, ≥ 1 item raised | done, one draft PR | BR-RO-13 |
| running | finished, nothing to raise | done, no PR | BR-RO-13 |
| running | owner missing / not allowed, or any error | failed, no PR | BR-RO-15, 16 |
| running | still running after 15 min (server stopped) | failed "Interrupted" at the next start | BR-RO-27 |
| — | daily time reached, switch off | nothing (no run row) | BR-RO-10 |

The raised PR then follows the PR flow unchanged (`docs/specs/purchase-requisition.md`): draft → submit →
approval → PO.

## Rules
One sentence per rule, plus one example. IDs are permanent (strike out, never renumber).
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-RO-01 | An item takes part only if it is active and its reorder level is > 0 (reorder qty 0 → BR-RO-02); services never take part; no supplier is needed (a PR has none). | ADC12 level 500, qty 1000 → checked. Level 0 → ignored. Inactive → ignored. No supplier → still raised |
| BR-RO-02 | An item with reorder level > 0 but reorder qty 0 is never raised; when its projected qty ≤ level it is listed as "needs a reorder qty" on the screen and in the run result, otherwise it is "OK" / "Covered" like any item. | Flux level 20 kg, reorder qty 0, stock 5 → no PR line, run lists "Flux – needs a reorder qty". Same item, stock 50 → "OK", not listed in the run |
| BR-RO-03 | Usable stock = the item's ledger balance in locations of type `main_store` and `finished_goods`; stock at a job worker (`vendor_premise`) and in `scrap_yard` does not count. (Card 2) | 480 kg main store + 300 kg at a job worker + 50 kg scrap yard → usable 480 |
| BR-RO-04 | On the way = (a) requested qty of `pending` lines of PRs in `draft`, `pending_approval`, `approved` or `partial_ordered`, plus (b) for PO lines of POs not `cancelled`, `closed`, `fully_received` or `invoiced`: PO qty − accepted qty (never below 0). Rejected and cancelled PRs and cancelled PR lines never count; a PR line already on a PO is no longer pending, so it counts once, through the PO. (Card 3) | Draft PR line 1000 kg → on the way 1000. PO 1000, accepted 600 → 400. PO short-closed → 0. PO 1000, accepted 1050 → 0 |
| BR-RO-05 | Projected = usable stock + on the way; an item is low when projected ≤ reorder level (same "at or below" as stock view BR-INV-07). | 480 + 0 = 480 ≤ 500 → low. 480 + 400 = 880 → not low |
| BR-RO-06 | Order qty = the larger of reorder qty and (reorder level − projected). (Card 4) | Level 500, projected 480, reorder qty 1000 → 1000. Level 500, projected −700 (negative after an adjustment), reorder qty 1000 → 1200 |
| BR-RO-07 | The order qty is then raised to the item's min order qty if below it, and rounded **up** to a whole number of the item's order multiple when the multiple is > 0. | 1200, multiple 250 → 1250. 1000, min order 2000 → 2000. 1000, multiple 0 → 1000 |
| BR-RO-08 | The final qty keeps the item's unit rules: whole numbers for `pcs`/`set` (rounded up), at most 3 decimals otherwise (rounded up at the 3rd decimal); it is always > 0. | 12.5 on a pcs item → 13. 100.0004 kg → 100.001 |
| BR-RO-09 | Reorder qty, min order qty and order multiple are item fields, each ≥ 0 and ≤ 1,000,000,000 in the item's unit with the same decimal rules as reorder level (BR-INV-07/08), edited with the item by `asset.manage` and audited like any item edit (BR-INV-25). | Multiple 2.5 on a pcs item → 400. Reorder qty −1 → 400. Reorder qty 1,000,000,001 → 400. bo sets reorder qty 1000 → saved, last updated by bo |
| BR-RO-10 | When the switch is on, the check runs at most once per IST day (D-022) at the set hour, default 07:00; when it is off the timer does nothing. If the server was down at that time, the run happens once when it comes back the same IST day. Turning the switch on, or moving the hour, after today's run time takes effect from the next day (no catch-up). A scheduled run that fails uses up its day; "Check now" is the retry. A scheduled start refused because another run is busy saves nothing, does not use the day and tries again at the next timer tick (each minute) the same IST day. (Card 5) | On, 07:00 → one run at 07:00 IST. Server down 06:00–09:00 → one run at 09:00. Switched on at 10:00 → first run tomorrow 07:00. 07:00 run failed → no second scheduled run today. Check now busy at 07:00 → scheduled run starts 07:01. Off → no run, no row |
| BR-RO-11 | "Check now" runs the same check at once for a `reorder.manage` holder, whether the switch is on or off; the run records who started it; the call returns the finished run (201), also when the run failed (state `failed` + reason). | bo clicks Check now at 15:10 → run by bo, PR raised if anything is low. Owner inactive → 201, state failed, reason shown |
| BR-RO-12 | Only one run at a time across the whole system; a second start while one runs → 409 `REORDER_RUN_BUSY`, nothing saved. | Daily run and Check now at the same second → one runs, the other 409 |
| BR-RO-13 | A run that finds low items creates exactly **one** draft PR of type `stock_reorder` holding one line per low item, in one transaction; a run with no low items creates no PR and ends `done` with "Nothing to order". More than 500 low items: the PR takes the 500 with the largest shortfall (level − projected, lower item id first on a tie) and the rest are listed "deferred to next run". (Card 6) | ADC12 and die spray low → PR-2611-0042 with 2 lines. Nothing low → no PR. 520 low → PR with 500 lines, 20 listed deferred, raised by the next run |
| BR-RO-14 | The PR is created as if by the draft owner: `requestedBy` = the owner set in settings, number from the shared PR sequence (BR-PR-01), lines checked as PR BR-PR-06/08, notes "Raised by reorder check <date> (run <n>)", estimate as BR-PR-11/14. (Card 1) | Owner = Ravi (bo) → PR requester Ravi, notes "Raised by reorder check 20-11-2026 (run 12)", estimate 24000000 paise |
| BR-RO-15 | The switch cannot be on without a valid draft owner: turning it on with none, or clearing or invalidating the owner while it is on → 400 `REORDER_OWNER_INVALID`, nothing saved; a run still fails, with no PR and the reason saved, when at run time no owner is set, or the owner is inactive or no longer holds `pr.manage`. | Switch on, no owner → 400, switch stays off. Switch on, owner cleared → 400. Switch off, owner cleared → saved. Owner left the company (inactive) → run failed "Draft owner is inactive – choose a new owner" |
| BR-RO-16 | Any error during a run rolls back the whole PR (no half PR) and leaves the run `failed`; the saved and shown reason is one fixed plain text from a closed list (no owner set · owner inactive · owner cannot use requisitions · interrupted – server stopped · "Something went wrong, nothing was saved"), the raw error goes only to the server log; the next run starts fresh. | DB error on line 3 → no PR, run failed "Something went wrong, nothing was saved", SQL text only in the log; next day's run raises all items |
| BR-RO-17 | The raised PR carries the run it came from (read-only) and is otherwise an ordinary PR: the owner may edit qty, delete lines, cancel or submit it; approval matches policy category `stock_reorder`. A client that sends the run link on any PR create or edit body gets 400 "Validation failed" (unknown key, `.strict()` body; the project's standard validation error, no separate code). | Ravi changes 1000 → 750 kg and submits → normal approval, 750 kg goes to PO. POST PR with `reorderRunId: 12` → 400 |
| BR-RO-18 | Because a pending PR line counts as on the way (BR-RO-04), an item already on any open PR or open PO is not raised again, so repeated runs do not pile up drafts. | Run 1 raises ADC12 1000; Check now 10 min later → ADC12 not raised, run "Nothing to order" |
| BR-RO-19 | Once that PR is cancelled or rejected, or its line is cancelled, the qty stops counting and the next run raises the item again if it is still low. | PR-0042 cancelled, ADC12 still 480 → next run raises ADC12 1000 again |
| BR-RO-20 | Settings: switch (default **off**), daily run time (whole hour 00–23, default 07), draft owner (an active employee holding `pr.manage`, super-admin counts, else 400 `REORDER_OWNER_INVALID`; may be cleared only while the switch is off, BR-RO-15); only `reorder.manage` holders change them and every change saves who, when, before → after. A new owner gets only later drafts; drafts already raised keep their requester. | Owner set to a QA inspector without `pr.manage` → 400. bo turns switch on → audit row off → on. Owner Ravi → Meena → PR-0042 stays Ravi's |
| BR-RO-21 | The Reorder screen lists live, without saving anything, every item that would be checked: SKU, name, unit, usable stock, on the way, projected, reorder level, order qty it would get, and a state: "Will be ordered" (projected ≤ level, reorder qty > 0), "Covered by <PR/PO no.>" (usable stock alone ≤ level but projected > level; newest open PR, else PO), "Needs a reorder qty" (BR-RO-02, projected ≤ level) or "OK" (usable > level). | ADC12 480 / 0 / 480 / 500 → "Will be ordered 1000 kg". After run → 480 / 1000 / 1480 → "Covered by PR-2611-0042" |
| BR-RO-22 | Each run is kept: number, start and end time, started by (person, or "daily schedule"), state (`running`, `done`, `failed`), items checked, raised, skipped and deferred, PR raised and its PO (number + status), failure reason (BR-RO-16); only raised, "needs a reorder qty", "invalid line" and "deferred" items are stored per item, OK and covered items are only counted. Runs are never edited or deleted. | Run 12: daily schedule, done, 40 checked, 2 raised, PR-2611-0042, 1 skipped "needs a reorder qty"; detail shows 3 item rows |
| BR-RO-23 | Every screen offers its next step as the one primary action: Reorder screen → "Check now" (only for `reorder.manage`); a finished run with a PR → "Open PR-…"; the raised PR (owner viewing a draft) → "Submit for approval". Without the key the button is not shown (BR-DS-27). | fs opens Reorder → no Check now button. bo after a run → "Open PR-2611-0042" |
| BR-RO-24 | All reorder endpoints need login (401) and their key (403 `PERMISSION_DENIED`): reading the list and runs `inventory.view`; settings and Check now `reorder.manage`. | qa (no `inventory.view`) GET list → 403. fs POST check-now → 403 |
| BR-RO-25 | A run never moves stock, never creates or changes a PO, and never submits or approves a PR. | After a run → ledger rows unchanged, PO count unchanged, PR status draft |
| BR-RO-26 | Usable stock, on the way and the reorder decision are read at run time inside the run's transaction, so the PR matches what the run saw; a stock posting during the run waits or is seen, never half-seen. | GRN posted at 07:00:01 during run → either counted or not, PR line consistent with the run's snapshot |
| BR-RO-27 | A run still `running` after 15 minutes counts as interrupted: the next start (timer or Check now) first marks it `failed` "Interrupted – server stopped", then runs. | Server crashed at 07:00:30 mid-run → 07:20 Check now: run 12 failed "Interrupted", run 13 starts |
| BR-RO-28 | A PR a person creates for the same item while a run is reading is not seen by that run, so the item may sit on two drafts; nothing blocks it, the owner cancels one by hand (BR-PR-41). | Ravi saves a PR for ADC12 at 07:00:01 while run 12 reads → two draft lines for ADC12; Ravi cancels one |
| BR-RO-29 | A low item whose computed line would fail the PR checks (BR-PR-06/08, qty or estimate out of range) is not raised: it is listed "invalid line" in the run and the run goes on with the other items. | Item with rate 1e13 paise × 1000 → estimate out of range → skipped "invalid line", ADC12 still raised |
| BR-RO-30 | Approval rules apply to a reorder PR exactly as to any PR, with no reorder exception: the draft owner is the requester for every approval rule (BR-APR-24, 33, 39, 61) and the system never approves. | Policy routes `stock_reorder` to back office; Ravi (owner, bo) submits → normal chain, same limits as his own hand-made PR |
| BR-RO-31 | The stock list's existing "below reorder" flag (usable stock alone ≤ level, BR-INV-07) stays as information only; what is raised is decided only by the reorder state here (stock + on the way). | ADC12 480 / level 500, PR open for 1000 → stock list flags "below reorder", Reorder screen "Covered", nothing raised |

## Security
Sensitive data — what must never leave the server or be shown to which role:
| Data | Who may see it | Who may change it |
|---|---|---|
| reorder settings (switch, time, owner) | `inventory.view` | `reorder.manage` |
| live low-stock list, run history | `inventory.view` | nobody (derived / append-only) |
| PR / PO number and status on the list ("Covered by") and on a run | `inventory.view` (number + status only, no estimate, no lines); shown as a link only with `pr.manage` / PO view right, else plain text | nobody |
| raised PR, its estimate | `pr.manage` (as any PR) | its requester (draft owner) or super-admin |
| item reorder qty / min order / multiple | `inventory.view` | `asset.manage` |
| run failure reason | `inventory.view`, fixed text only (BR-RO-16); raw error only in the server log | nobody |

Abuse cases — each one ends in a rule above:
| Who | Tries to | Stopped by |
|---|---|---|
| floor supervisor | click Check now to flood purchase with drafts | BR-RO-24 (403), BR-RO-18 (no duplicates) |
| anyone with the key | start many runs at once | BR-RO-12 |
| bo | name an owner who can't use PRs, so drafts are orphaned | BR-RO-20, BR-RO-15 |
| any `pr.manage` holder | edit or submit the reorder PR they don't own | BR-RO-17 → PR BR-PR-17 |
| run | order or approve by itself | BR-RO-25 |

Audit: settings change (who, when, before → after, BR-RO-20); every run (BR-RO-22, who started it);
the PR itself through the PR trail (BR-PR-46); item reorder fields through BR-INV-25.

## Edge cases
Full list: `design/edge-cases.md` (pass 2). Every row there names a rule in this file.
| Source | Count |
|---|---|
| benchmark | 17 |
| owner (delegated cards) | 6 |
| invariant | 22 |
| benchmark silent → project convention | 7 |

## Changes to other modules
Specs below are not edited here; the change is applied when this spec freezes (owner of each spec updates it).
- **Inventory:** item gets reorder qty, min order qty, order multiple (`numeric(14,3)`, default 0, ≥ 0,
  ≤ 1,000,000,000, whole for pcs/set; BR-RO-09) on item create / edit / list / detail; BR-INV-04 list of
  editable fields grows; inventory "Not now" line "Reorder alerts that raise a PR by themselves" is removed.
  The stock list's `belowReorder` flag (stock alone ≤ level) is unchanged and stays information only (BR-RO-31);
  its help text should point to the Reorder screen as the place that decides what is raised.
- **Purchase requisition:** a PR may carry the reorder run it came from — nullable `reorder_run_id`, unique when
  set, read-only on every PR endpoint, shown as `reorderRunId` on PR list and detail (BR-RO-17); PR list gets
  filters `raisedByReorder` and `reorderRunId`; partial index on pending PR lines by item (on-the-way sum,
  BR-RO-04); `prRepository.createWithItems` is split into `createWithItemsTx(tx, …)` plus the old wrapper so the
  run creates the PR inside its own transaction (BR-RO-16), same checks as BR-PR-01/06/08/11. "Not now" line
  "Auto-PR from reorder level" is removed. No PR rule changes.
- **Auth setup:** new key `reorder.manage`, seed ow, bo.
- **Design system:** new status doc `reorderRun` (running = info, done = success, failed = danger), existing
  tones only.

## Not now
- In-app or e-mail alerts to the purchase role (no notification module yet); the Reorder screen and the PR
  list filter "Raised by reorder" are the signal.
- Per-location or per-supplier reorder levels; one draft per supplier (PR has no supplier field).
- Max-stock / "fill up to max" ordering; forecasting from sales or BOM demand (brief: not included).
- Automatic PO creation or auto-submit of the draft (brief: not included).
- Required-by date on raised lines from supplier lead time.

## Open questions
Must be empty at freeze. Empty: cards 1–6 are in `OWNER.md` (owner delegated, option A pre-approved in chat
2026-11-20); confirm lines are A-01..A-08 and A-39..A-42 in `assumptions.md`; designer questions D1–D6 are answered in
`design/data.md` and `design/api.md` / `design/screens.md`, and the designers' questions to this spec are folded
into BR-RO-10, 11, 15, 20, 21, 22, 09.

## Changelog
- 2026-11-20 v0 — draft (pass 1). Owner delegated decisions; cards 1–6 pending with recommended option applied.
- 2026-11-20 v0 — pass 2: designer answers folded (no catch-up after switch-on, failed day used up, failed
  Check now = 201, switch-on needs a valid owner, "Covered" defined, stored run items, qty cap); BR-RO-27
  (interrupted run) and BR-RO-28 (draft race) added; 42 edge cases, 37 assumptions (8 confirm).
- 2026-11-20 v0 — pre-freeze review: fixed failure-reason list (BR-RO-16), invalid line skipped (BR-RO-29),
  500-line cap with deferral (BR-RO-13), approval unchanged (BR-RO-30), stock-list flag information only
  (BR-RO-31), owner clearable only while off (BR-RO-15, 20), SPEC-01..05 (BR-RO-02, 10, 17, 04, who-can-do),
  PR/PO visibility row in Security; 52 edge cases, 53 assumptions (12 confirm).
- 2026-11-20 v1 — frozen; OWNER.md approved on the owner's delegation (D-028): owner pre-approved recommended options in chat, 2026-11-20: "take ur own decision and record them and run whatever parallel subagents u want to complete a complete scm module according to my plan, ill do a complete merge in moring once completed"
