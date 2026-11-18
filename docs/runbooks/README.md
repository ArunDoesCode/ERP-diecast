# Runbooks — what to do when a build goes wrong

For pipeline agents in an unattended run (first) and the owner (second). One page per case, same shape:
**Symptom · Check · Fix · If it fails twice · Never**. Policy behind them: `.claude/pipeline/PROTOCOL.md`
→ "Never-wait build policy".

| Symptom | Runbook |
|---|---|
| Verify loop is on round 3, or the same finding came back after 2 fixes | [fix-loop-does-not-end.md](fix-loop-does-not-end.md) |
| `gh pr checks` red, or a local check fails (typecheck, lint, tests, contract, migrations) | [ci-red.md](ci-red.md) |
| Many unrelated tests fail at once; test DB empty; you are about to run `db:reset` | [test-db-reset.md](test-db-reset.md) |
| The spec does not say what to do | [spec-gap-mid-build.md](spec-gap-mid-build.md) |
| A slice cannot be made green | [park-a-slice.md](park-a-slice.md) |
| `contract:check` fails, or frontend calls a route the backend does not have | [contract-manifest-stale.md](contract-manifest-stale.md) |
| Old worktrees and branches pile up after merges | [worktree-branch-cleanup.md](worktree-branch-cleanup.md) |
| A tool call is denied (permission rule, hook, classifier) | [permission-blocked.md](permission-blocked.md) |
| Session died or was closed in the middle of a run | [resume-after-crash.md](resume-after-crash.md) |
| Cannot connect to Postgres, port in use, migrations out of sync | [docker-or-port-problem.md](docker-or-port-problem.md) |

## Rules that hold in every runbook
- **Never wait for the owner** unless it is a hard stop.
- **Hard stops:** only the four listed in `.claude/pipeline/PROTOCOL.md` → Never-wait build policy. On one:
  write `HANDOVER.md`, phase `handover`, print a line starting `HARD STOP:`, stop.
- **Second failure of the same kind = park** the slice ([park-a-slice.md](park-a-slice.md)) and go on.
- **Only the coordinator** parks, opens issues, edits `state.json` and talks to GitHub. A subagent that
  hits one of these cases returns `FAILED` or `BLOCKED` with the runbook name in `NEXT:`.
- Tests are changed only by test-writer, in a `test(<id>):` commit, with a spec rule quoted.
- Work only in the run's worktree on `feature/<id>` or `epic/<name>`. Never push to `main`.

## Words used
| Word | Meaning |
|---|---|
| `<id>` | run id = folder name `.pipeline/<id>/` (local to the worktree, not in git; only `summary.md` is committed) |
| `state.json` | the run's state; fields in `.claude/pipeline/state.schema.json` (`phase`, `currentSlice`, `fixRounds`, `lastGreen`, `parked`, `failures`, `gates`, `pr`). Update with `.claude/pipeline/state.sh` |
| Assumptions file | `docs/specs/<module>/assumptions.md`, or `docs/specs/<module>.assumptions.md` for a flat spec. Columns: `docs/specs/_template/assumptions.md` |
| Hand-over | `.pipeline/<id>/HANDOVER.md` from `.claude/pipeline/templates/HANDOVER.md`; also the top of the PR body |
| Last green | `state.json` → `lastGreen`: newest commit where typecheck, lint, tests and contract check all passed |
| Park | revert one slice to last green, open an issue with the evidence, continue with the rest |
| Env file | file with `DATABASE_URL`, `DATABASE_URL_TEST`, secrets, `SEED_USER_PASSWORD`. A new worktree has no `backend/.env` (gitignored). Past runs stored the path in `state.json` → `envFile` and ran `bun --env-file=<path> …` |

## Not there yet (the runbooks say "missing — to be added" where they need these)
- Allow rules for `gh issue create`, `gh issue list`, `git revert`, `git worktree remove`,
  `.claude/pipeline/state.sh`, `.claude/pipeline/merge-sub-pr.sh` are not all in `.claude/settings.json`
  today; only the owner changes that file.
