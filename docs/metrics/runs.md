# Pipeline runs — one line per run

Appended by `/wrap` with `.claude/pipeline/state.sh line` (source: the run's `state.json` + `git log
<base>..HEAD`). Never edit old rows. Used to compare runs with the baseline below.

- **Min** = first phase start → hand-over. **Tokens** = sum over agent calls that reported them.
- **Findings** = all found by reviewers and test-runner. **Confirm** = assumptions waiting for a yes/no.
- **chore+docs** = bookkeeping commits (target: 0 + 1). **test** / **fix** = commits of that type.

## Baseline (before v2, from git history, 2026-11-18)
Source: `docs/plans/agentic-workflow-v2.md` → Phase 6 and Baseline.
| Measure | Baseline |
|---|---|
| Plan → merge | m1: 4 h 40 min · subcontracting: 1 h 26 min |
| Fix rounds | 3 (m1) and 2 (subcontracting) |
| Bookkeeping share of commits | 47% |
| Test-repair share of test commits | 33% |
| Spec changes after freeze | 31 |

## Runs
| Date | Run | Mode | Min | Agent calls | Tokens | Fix rounds | Findings | Parked | Confirm | Commits | chore+docs | test | fix | PR |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-11-18 | epic-design-system | epic | 126 | 11 (epic) + ~60 (sub-features) | 0 | 1 | 0 | 0 | 0 | 41 | 0+2 | 14 | 7 | epic PR |
| 2026-11-20 | epic-design-system-v2 | epic | 39 | 0 | 0 | 0 | 0 | 0 | 0 | 16 | 0+1 | 5 | 3 | epic PR |
