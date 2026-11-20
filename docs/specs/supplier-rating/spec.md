---
module: supplier-rating
status: frozen            # draft | frozen (set only by /freeze; change requests keep it frozen)
version: 1
frozen_on: 2026-11-20
owner: Arun
depends_on: [suppliers, purchase-order, grn, auth-setup]
brief: docs/briefs/supplier-rating.md
research: docs/research/supplier-rating.md
---

# Supplier rating

> Agent layer. The owner reads `OWNER.md`, not this file. ≤ 400 lines (above that: split by sub-module).
> Plain words, one sentence per rule. Tables and columns: `design/data.md`. Endpoints: `design/api.md`.
> Screens: `design/screens.md`. Code locations and history: `docs/modules/<module>.md`.
> Owner delegated every decision (brief, 2026-11-20). Each "Card:" line below is the recommended option,
> already applied in the rules; pass 2 turns them into `OWNER.md` cards.

## Summary
A read-only rating per supplier, computed live from POs and GRNs already in the system: on-time delivery %,
rejection %, price variance %, and a 0–100 score with a Good / Watch / Poor label. Purchase sees it on the
supplier page; the owner compares all suppliers on one list. Nobody types a score. Done = purchase can open
any supplier and see why its score is what it is, line by line.
Example data used below: supplier **Sri Balaji Alloys**, item **ADC12 ingot**, PO line **1,000 kg at
₹210/kg** (21,000 paise), item standard rate **₹200/kg**, original due date **10 Nov**, GRN on **12 Nov**:
1,000 kg arrived, 980 accepted, 20 rejected. Over 12 months: 10 lines judged, 8 on time (80 %), rejection
2 % → score 0.5 × 80 + 0.5 × 98 = **89 → Good**.

## Who can do what
| Action | Key | Seed roles |
|---|---|---|
| See ratings (list, supplier card, line drill-down, trend) | `supplier.rating.view` (new) | ow, bo (sa passes all) |
| Change weights / grace days / bands | — none in v1 (fixed values, see Not now) | — |

## Flow
Read-only; no documents, no statuses. Data in → number out.
| From | Action | To | Rule |
|---|---|---|---|
| PO line sent to supplier + GRN lines with QA decided | open rating | on-time % | BR-SRT-01..10 |
| GRN lines with QA decided | open rating | rejection % | BR-SRT-11..15 |
| PO lines sent in the window | open rating | price variance % | BR-SRT-16..20 |
| on-time % + rejection % | open rating | score + label | BR-SRT-21..25 |

## Rules
IDs are permanent (strike out, never renumber). Tests are named by rule id.

### Window and dates
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-SRT-01 | The rating covers a rolling window of the last 12 months ending today (plant IST day), computed live on every read; no score is stored. | Today 20 Nov 2026 → window 21 Nov 2025 – 20 Nov 2026; a GRN corrected a minute ago shows in the next read |
| BR-SRT-02 | "Today" and every date compare use the Asia/Kolkata calendar day (D-022). | GRN posted 21 Nov 00:30 IST (20 Nov UTC) → its arrival date is 21 Nov |

### On-time delivery
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-SRT-03 | On-time is judged per PO line, never per quantity, so over-delivery cannot push it above 100 %. | Line of 1,000 kg, 1,200 kg arrive on time → counts as 1 on-time line, not 120 % |
| BR-SRT-04 | Only lines of POs that reached `dispatched` or later count; `draft`, `pending_approval`, `approved` and `cancelled` POs are ignored. | Cancelled PO with a past due date → not in on-time at all |
| BR-SRT-05 | The due date is the PO's original expected delivery date; a revised date is shown beside it but never used. **Card: late against the first promised date or the revised date — recommended A: first promised date.** | Expected 10 Nov, revised 20 Nov, arrives 15 Nov → late by 5 days |
| BR-SRT-06 | Grace days = 0: a line is on time only when it is complete on or before the due date; arriving early is on time. **Card: how many days late still count as on time — recommended 0.** | Due 10 Nov, complete 10 Nov → on time; complete 11 Nov → late by 1 day; complete 1 Nov → on time |
| BR-SRT-07 | A line is complete on the GRN received date of the GRN line whose received qty brings the line's arrived qty to at least the ordered qty, counting every GRN line including GRNs still in draft or QA; rejection % still waits for QA (BR-SRT-12). | Ordered 1,000; GRN 5 Nov 600 kg, GRN 12 Nov 400 kg, due 10 Nov → complete 12 Nov → late by 2 days. GRN 9 Nov 1,000 kg, QA done 12 Nov, due 10 Nov → on time |
| BR-SRT-08 | A line still not complete after its due date counts as late from the day after the due date, and stays late when it finally arrives. **Card: should a PO line that is past due and not yet delivered already pull the score down — recommended A: yes, from the day after it is due.** | Due 10 Nov, nothing arrived, today 20 Nov → 1 late line (10 days and counting) |
| BR-SRT-09 | A short-closed line (arrived < ordered on a PO marked short-closed) is judged by the short-close date: on time if closed on or before the due date, else late; the drill-down shows a "short-closed after due date" count. | Ordered 1,000, 700 arrive 8 Nov, due 10 Nov: short-closed 9 Nov → on time; short-closed 15 Nov → late by 5 days |
| BR-SRT-10 | A line falls in the window by its judgement date: completion date if complete, short-close date if short-closed, else the day after its due date; on-time % = on-time lines ÷ judged lines, 1 decimal. | 10 lines judged in window, 8 on time → 80.0 % |
| BR-SRT-32 | A PO line whose PO has no expected delivery date is left out of on-time and listed in the drill-down as "no due date" with a count beside the %. | PO with no expected date, delivered 12 Nov → not judged; card shows "1 line with no due date" |

### Rejection
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-SRT-11 | Rejection % = value of rejected qty ÷ value of arrived qty over GRN lines with a QA decision whose GRN received date is in the window; value = qty × the PO line rate, so kg and pieces never get added together. | 1,000 kg arrived, 20 rejected at ₹210 → 4,200 ÷ 2,10,000 = 2.0 % |
| BR-SRT-12 | Only GRN lines with QA `passed` or `failed` are decided and count in rejection %; lines still pending QA are left out until decided. | GRN 18 Nov with QA pending → not in rejection %; passed on 19 Nov → in |
| BR-SRT-13 | Lines whose QA was bypassed or `waived` are not decided: they are left out of rejection % and of the 5-line minimum, and shown as "n lines not inspected" with their rejected qty. | 10 GRN lines: 7 passed/failed, 2 bypassed, 1 waived with 5 kg rejected → rejection from 7 lines; "3 not inspected, 5 kg rejected" shown |
| BR-SRT-14 | Post-acceptance GRN corrections do not change rejection %. | 980 accepted, later corrected −10 → rejection stays 2.0 % |
| BR-SRT-15 | Beside the %, the count of GRN lines with any rejected qty is shown ("2 of 10 lines had rejects"). | One line 20 kg rejected, one 5 pcs rejected → "2 of 10 lines" |
| BR-SRT-33 | GRNs still in `draft` are left out of rejection % only (they still count for on-time, BR-SRT-07); GRNs not linked to a PO are not part of any measure. | Draft GRN 19 Nov, 1,000 kg received, 50 kg rejected → line complete 19 Nov; rejection % unchanged |

### Price variance
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-SRT-16 | Price variance covers PO lines of POs dispatched or later (not cancelled) whose PO date — the IST day the PO was created — is in the window. | PO created 3 Mar 2026, sent → in; draft PO → out |
| BR-SRT-17 | The reference rate is the item's standard rate; if the item has none, the same supplier's rate on its previous sent PO line for that item; if neither exists, the line is left out. | Standard ₹200, PO rate ₹210 → +5.0 %; no standard, previous PO ₹205, now ₹210 → +2.4 % |
| BR-SRT-18 | A line is compared only when its UOM equals the reference's UOM; otherwise it is left out and counted as "not compared". | Standard rate per kg, PO line in nos → not compared |
| BR-SRT-19 | Supplier price variance % = Σ (PO rate − reference) × qty ÷ Σ reference × qty over compared lines, 1 decimal; plus = paid more than reference. | 1,000 kg at ₹210 vs ₹200 → +10,000 ÷ 2,00,000 = +5.0 % |
| BR-SRT-20 | Price variance is shown beside the score and is not part of it. **Card: should paying above the standard rate lower the supplier's score — recommended A: no, show it beside the score only.** | Score 89, price +5.0 % → score stays 89 |

### Score and label
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-SRT-21 | Score = 50 % × on-time % + 50 % × (100 − rejection %), using the displayed 1-decimal values, rounded half up to a whole number. **Card: how much does delivery count against quality — recommended A: 50 / 50.** | On-time 80 %, rejection 2 % → 89 |
| BR-SRT-22 | The headline 12-month score is shown only when the window has at least 5 judged on-time lines and at least 5 QA-decided GRN lines; otherwise "Not enough data" with the counts, and the three measures still show (trend months: see BR-SRT-28). **Card: fewest delivered lines before a score is shown — recommended 5.** | 3 judged lines → "Not enough data (3 of 5 lines)", on-time % still shown |
| BR-SRT-23 | A measure with no lines shows "No data", never 0 % or 100 %. | Supplier with POs but no GRN → rejection "No data" |
| BR-SRT-24 | Label: Good = 80–100, Watch = 60–79, Poor = 0–59; no label without a score. **Card: where Good / Watch / Poor start — recommended A: Good from 80, Poor below 60.** | 89 → Good; 72 → Watch; 55 → Poor |
| BR-SRT-25 | The label only informs: it never blocks or warns on a PR, PO or GRN. | Poor supplier → PO for it is created as usual |
| BR-SRT-36 | There is no score and no label unless both on-time and rejection have data, for the window and for each trend month alike. | Sep: 2 judged lines, no decided GRN line → on-time shown, score and label "No data" |
| BR-SRT-37 | An on-time line belongs to the window or month of its judgement date (BR-SRT-10). | Due 28 Oct, complete 3 Nov → Nov |
| BR-SRT-38 | A rejection line belongs to the window or month of its GRN received date. | GRN 31 Oct, QA decided 2 Nov → Oct |
| BR-SRT-39 | A price line belongs to the window or month of its PO date (BR-SRT-16). | PO created 30 Sep, delivered 5 Nov → Sep |

### Screens and access
| ID | Rule | Example (given → then) |
|---|---|---|
| BR-SRT-26 | The ratings list shows every supplier with score, label, on-time %, rejection %, price variance % and line counts; sortable by each; active suppliers only by default, with a filter for all. | Inactive supplier with history → shown when filter "All" |
| BR-SRT-27 | Each measure opens the lines behind it (PO no., item, due date, revised date, completion date, days late; GRN no., arrived, rejected, value; PO rate, reference rate and its source). | Click on-time 80 % → 10 lines, 2 marked late with days late |
| BR-SRT-28 | The supplier page shows the same rating as a card, plus a 12-month trend where each month applies BR-SRT-03..21, 23, 24, 36 to the lines of that month (BR-SRT-37..39) and shows its score with its line counts, without the 5-line minimum. | Nov bucket holds only lines judged in Nov 2026; Sep with 2 judged and 2 decided lines → score 75 "(2 lines)" |
| BR-SRT-29 | Every rating read (list, card, drill-down, trend) needs `supplier.rating.view`; without it → 403 naming the key, and the supplier page hides the card. | Floor supervisor (has `supplier.view` only) → supplier page without the rating card; API 403 |
| BR-SRT-30 | Lines of subcontracting orders (SCO) are not part of any measure. | Job-work vendor with SCOs only → "No data" |
| BR-SRT-31 | Screens follow design-system v2 (`frontend/.claude/skills/design-system/SKILL.md`). | — |
| BR-SRT-34 | A rating asked for a supplier id that does not exist → 404; an inactive supplier is still found. | Supplier 999 → 404; inactive Kumar Castings → its rating |
| BR-SRT-35 | In the drill-down a PO or GRN number links to its document only when the user holds that document's view key; otherwise it is plain text. | Back office without GRN view → GRN no. shown, not clickable |
| BR-SRT-40 | `supplier.rating.view` is independent of `supplier.view`: its holders see supplier names in the rating list and drill-down even without `supplier.view`. | Role with rating key only → list shows "Sri Balaji Alloys"; supplier page itself → 403 |
| BR-SRT-41 | Query bounds: `page` 1–10,000, `pageSize` 1–100, ids 1–2,147,483,647 (int32), `q` ≤ 100 characters with `%` and `_` matched literally; anything outside → 400. | pageSize 500 → 400; supplier id 3,000,000,000 → 400; q "50%" matches only names containing "50%" |

## Security
| Data | Who may see it | Who may change it |
|---|---|---|
| Ratings, line drill-down incl. PO rates and reference rates, supplier names | `supplier.rating.view` (ow, bo), independent of `supplier.view` (BR-SRT-40) | nobody (computed) |
| Item standard rate inside the drill-down | same as above | item master owners (unchanged) |

Abuse cases:
| Who | Tries to | Stopped by |
|---|---|---|
| buyer | re-date a late PO so the supplier looks punctual | BR-SRT-05 |
| buyer | short-close a late open line to hide lateness | BR-SRT-09 (judged by short-close date vs original due date; "short-closed after due date" count shown) |
| floor supervisor | read supplier prices through the rating | BR-SRT-29 |
| anyone | type or edit a score | no write path (BR-SRT-01) |
| QA | bypass or waive QA to keep a supplier's rejection low | BR-SRT-13 (not-inspected count and its rejected qty shown beside the %) |
| store keeper | hold a GRN in draft or QA to change a line's completion | BR-SRT-07 (completion uses received qty and the GRN received date from any GRN line, draft or not, never the QA or posting date) |
| owner / admin | revoke the seeded rating grant from back office | not durable in v1: the seed re-inserts it on restart, as for every seeded key (assumption A-40) |

Audit: none — the feature writes nothing. Every source change (PO, GRN, QA, correction) is already audited.

## Edge cases
Full list: `design/edge-cases.md` (pass 2). Every row there names a rule in this file.
| Source | Count |
|---|---|
| benchmark | 28 |
| owner | 8 |
| invariant | 12 |

## Not now
- Editing weights, grace days, minimum lines or band limits on a settings screen (fixed values in v1).
- Leaving tooling / die / one-off POs out of on-time (no reliable item flag today).
- Subcontracting (SCO) delays and rejects as a fourth measure.
- Returns to supplier after acceptance (purchase-returns) counted as rejection.
- Reject rate by heat / batch number.
- Blocking or warning on PR / PO / RFQ for Poor suppliers.
- Manual surveys or scorecards (brief: not included).
- Stored monthly snapshots, export, e-mail of ratings.

## Open questions
Must be empty at freeze. Each one ends as an owner card in `OWNER.md` or a row in `assumptions.md`.
| # | Question | Goes to |
|---|---|---|
| — | None open. Cards 1–7 → `OWNER.md` (answered A, owner pre-approved 2026-11-20); the rest → `assumptions.md` A-01..A-41 | — |

## Changelog
- 2026-11-20 v0 — draft (owner delegated; 7 cards pending with recommended options applied)
- 2026-11-20 v0 — pass 2: coordinator answers folded in (BR-SRT-12, 16, 21, 22, 28); new BR-SRT-32..35; edge cases, assumptions, OWNER.md written
- 2026-11-20 v0 — pre-freeze review fixes: BR-SRT-07 (GRN date, any QA state), 09 (short-close date), 12/13 (waived = bypassed), 28; new BR-SRT-36..41
- 2026-11-20 v1 — frozen; OWNER.md approved on the owner's delegation (D-028): owner pre-approved recommended options in chat, 2026-11-20: "take ur own decision and record them and run whatever parallel subagents u want to complete a complete scm module according to my plan, ill do a complete merge in moring once completed"
