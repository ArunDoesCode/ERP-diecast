# Spec gap found mid-build

## Symptom
- An agent returns `BLOCKED` with a question no business rule answers.
- A reviewer finding says "unspecced" / "spec is silent" (past: SPEC-26, SPEC-6, CR-6 challan date bounds).
- Two findings on the same line disagree and both cite "reasonable behaviour".

## Check
```bash
grep -n -i "<keyword>" docs/specs/<module>.md          # rule, example or changelog line?
grep -n -i "<keyword>" docs/decisions.md               # decided before?
gh issue list --label mod:<module> --search "<keyword>"   # already deferred?
```
Found an answer → it is not a gap. Quote it in `.pipeline/<id>/questions.md`, re-brief the agent, done.

Not found → sort the gap:

| Kind | What to do |
|---|---|
| The only sensible answer breaks a domain invariant (money not in paise, stock changed outside `inventory_ledger`, state change without permission check or audit) | **Hard stop** |
| Changes money, stock, tax, who may do something, or what a factory user sees | benchmark, tag `confirm` |
| Everything else (limits, pagination, error codes, names, indexes) | benchmark or project standard, tag `info` |

## Fix
1. Get the benchmark: how ERPNext, Odoo and SAP Business One handle the case. Use the `researcher` agent
   (**missing — to be added**, plan item 2.2); until then the coordinator does a short WebSearch itself.
2. Pick what most of them do. If they disagree, pick the stricter one (refuse rather than allow).
3. Append one row to `assumptions.md` (new modules: `docs/specs/<module>/assumptions.md`; for a flat
   `docs/specs/<module>.md` spec the place is not decided — use `.pipeline/<id>/assumptions.md`):
   `| A-NN | date | BR or area | question | what we chose | source (product + link, or "standard") | confirm / info |`
4. Add the rule to the spec so tests can be written from it: a line in the spec **Changelog**
   ("assumed during build, A-NN"), bump the version, spec stays `frozen`. Commit `docs(<id>): assumption A-NN`.
5. Re-brief in this order: test-writer (pointer to the new spec version + BR id, nothing else) → developer.
   The answer goes in the spec, never in the test-writer brief.
6. Add the row to `.pipeline/<id>/questions.md` (question, "benchmark", answer, A-NN).
7. Rows tagged `confirm` are listed in `HANDOVER.md` as yes/no questions for the owner. A later "no" is a
   normal change request, not a re-run.
8. A gap that is a **new idea**, not a missing rule (past: SPEC-4 sco-ist-date) → GitHub issue with label
   `idea` or `change`, not into this build.

## If it fails twice
The same gap comes back after one assumption (tests and reviewers still disagree, or the benchmark gives
no usable answer) → [park-a-slice.md](park-a-slice.md) for the slice that needs the rule. Put the question,
the options and the benchmark links in the issue; label `change`.

Hard stop (invariant conflict): write the question and both options at the top of `HANDOVER.md`, set
`state.json` phase to `handover`, stop the run.

## Never
- Never guess a business rule without writing the assumption row.
- Never put the answer only in a brief, a code comment or a test.
- Never change a rule that the frozen spec does state — that is a change request (`/freeze`), not a gap.
- Never stop and wait for the owner for a gap that is not a hard stop.
- Never let a developer or reviewer decide a gap; the coordinator decides and records it.
