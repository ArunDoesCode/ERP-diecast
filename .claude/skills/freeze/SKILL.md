---
name: freeze
description: >
  Freeze a module spec so it can be built, and enforce scope. Runs the pre-freeze review on the draft (four
  reviewers in parallel), checks the agent layer is complete, then the owner approves OWNER.md only and the
  spec gets status: frozen. Also handles change requests against frozen specs; works for old flat specs too.
  Use when: /freeze <module>, "freeze scope", "lock the spec", "is this spec ready", a new idea mid-build.
---

# /freeze <module>

`docs/specs/<module>/spec.md` = **folder spec**; `docs/specs/<module>.md` = **flat spec**. Steps 1–2 are
agent work, done before the owner is asked: a thin owner file must not mean a thin spec.

## 1. Pre-freeze review (on the draft, one message, parallel Agent calls)
| Reviewer ("Draft spec mode" in its agent file) | Reads | Flat spec |
|---|---|---|
| spec-reviewer | `spec.md`, `design/edge-cases.md`, `OWNER.md`, dependent specs | yes |
| security-auditor | `spec.md` → Security, Who can do what; `design/api.md`, `design/data.md` | yes (spec only) |
| performance-auditor | `design/data.md`, list endpoints in `design/api.md` | no |
| design-reviewer | `design/screens.md` + pictures | no |

Findings go to the author (rules → spec-analyst, data/API → solution-designer, screens → ui-ux-designer);
then only reviewers with findings run again, max 2 rounds. An owner-type finding (routing table in
`.claude/agents/spec-analyst.md`) becomes a card; any other finding still open is decided by benchmark
and logged in the assumptions file. No open blocker may remain.

## 2. Completeness checklist (all must pass; report it as a checklist; last four: folder spec only)
- [ ] Every `BR-<MOD>-NN` has an example (given → then). (Older specs: ≥1 acceptance criterion citing it.)
- [ ] "Flow" lists every status of the schema enum (new module: of `design/data.md`). "Who can do
      what" and "Not now" are filled.
- [ ] No open question: "Questions for you" answered or `deferred → backlog`; "Open questions" empty.
- [ ] ≤ 400 lines; above that split by sub-module first. Specs in `depends_on` are `frozen`.
- [ ] `spec.md` → Security filled; every abuse case names a rule.
- [ ] The four `design/` files are filled (no template text); every route has a permission key; every
      edge case names a rule; "Choices made" tables are empty (rows moved to `assumptions.md`).
- [ ] `OWNER.md`: ≤ 60 lines without pictures, six sections, ≤ 7 cards, no links or `BR-` ids in
      cards, one picture per screen, counts match edge-cases.md and assumptions.md.
- [ ] All four reviewers returned `PASS`. `frontend/src/app/(mock)/` does not exist.
Anything fails → list the gaps and stop. Offer `/spec <module>` to fix.

## 3. Owner approval and freeze
- Folder spec: show the path of `OWNER.md` only. Cards without an answer → ask them (max 3 at a time,
  letter answers); spec-analyst folds the answers into `spec.md` (an answer against the recommendation
  re-runs step 1 for the changed rules). Then ask once: "Approve OWNER.md? (y/n)".
- Flat spec: confirm with the user. On yes (both layouts): spec header `status: frozen`,
  `frozen_on: <YYYY-MM-DD>`, `version: <n+1>`, a Changelog line; folder spec also `approved_on` in
  `OWNER.md`. Next step: `/feature <module>`.

## Change requests after freeze (cheap path)
1. Not needed for the current milestone to work at the factory → GitHub issue (`idea` / `change`), stop.
2. Batch **all** changes of the run or review round: **one spec diff, one version bump, one Changelog
   line, one commit** (`docs(<module>): CR v<n> — <summary>`).
3. The diff holds: new or edited rules (never renumber; strike through dropped ones), matching rows in
   the design files, and under the Changelog line the affected rule ids with their tests
   (`grep -rn "BR-XXX-NN" backend/tests`) — one test-writer brief per batch.
4. Owner-type change (routing table) → the owner's yes: a new or edited card in `OWNER.md` (flat spec:
   one letter question). Any other change → a row in the assumptions file (`assumptions.md`; flat spec:
   `docs/specs/<module>.assumptions.md`), no owner stop.
5. Re-run step 2 and the step-1 reviewers whose files changed. The spec stays `frozen` throughout.
