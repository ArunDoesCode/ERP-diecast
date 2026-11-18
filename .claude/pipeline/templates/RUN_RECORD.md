<!-- Template for .pipeline/<id>/summary.md — the only run-folder file that is committed (once, in the
     run's docs(<id>) commit). Max 30 lines. It is the permanent record after the worktree is removed.
     Delete these comments. -->
# Run <id>

| | |
|---|---|
| Module / spec | <module> · `<spec path>` v<N> |
| Mode / branch / base | <feature \| sub \| bug \| epic> · `feature/<id>` → `<base>` |
| Dates | started <UTC> · hand-over <UTC> |
| PR | <url> |

## Metrics
<!-- Paste the header + this run's row from `.claude/pipeline/state.sh metrics`. -->

## Gates at hand-over
<!-- Paste `.claude/pipeline/state.sh gates`. -->

## Slices
| Slice | BR ids | Result |
|---|---|---|
| S1 | BR-… | built \| parked → <issue url> |

## Assumptions made (`<assumptions file>`)
A-NN … A-NN — <n> to confirm, <n> info.

## Findings
| Class | Found | Fixed | Backlog (issues) | Rejected |
|---|---|---|---|---|
| CR / SEC / PERF / SPEC / DES / TEST | | | | |

## Lessons (also written to the module map)
- <recurring finding or trap, one line each — max 5>
