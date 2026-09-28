---
name: freeze
description: >
  Freeze a module spec so it can be built, and enforce scope. Checks docs/specs/<module>.md is complete
  (every BR has an acceptance criterion, no unanswered SME questions, dependencies frozen), then sets
  status: frozen with a date. Also handles change requests against frozen specs. Use when: /freeze <module>,
  "freeze scope", "lock the spec", "is this spec ready", or when a new idea arrives mid-build.
---

# /freeze <module>

## Completeness check (all must pass)
Read `docs/specs/<module>.md` and report a checklist:
- [ ] Every `BR-<MOD>-NN` row has an example (given → then). (Older specs: ≥1 acceptance criterion citing it.)
- [ ] "Flow" lists every status that exists in the schema enum for this module (compare with
      `backend/src/db/schemas/`). Extra/missing statuses are listed.
- [ ] "Questions for you" all answered, or each remaining one explicitly marked `deferred → backlog`.
- [ ] "Who can do what" filled in.
- [ ] "Not now" section present (even if short).
- [ ] ≤ 150 lines / ≤ 25 rules, or the user agreed to the size.
- [ ] Specs this one depends on (listed under Dependencies) are `frozen`.

If anything fails: list the gaps and stop. Offer `/spec <module>` to fix.

## Freeze
If all pass, confirm with the user, then edit the header:
`status: frozen`, `frozen_on: <YYYY-MM-DD>`, `version: <n+1>`. Add a line to the spec's Changelog.

## Change requests after freeze
When the user (or you) wants to change a frozen spec:
- Is it needed for the **current milestone to work at the factory**? If no → append to `docs/backlog.md`
  (`- [ ] <module>: <idea> — why — raised <date>`) and stop.
- If yes → set `status: changed-after-freeze`, apply the change as new/edited BRs (never renumber;
  strike through deprecated rules), add a Changelog line, re-run the completeness check, re-freeze.
  List which existing tests/BRs are affected so `/slice` can update them.
