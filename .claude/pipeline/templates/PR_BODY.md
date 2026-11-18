<!-- PR body. One page, plain words, readable in two minutes. Delete these comments.
     Title: "<id>: <what the user can now do>". Label: agent-pipeline. -->
<!-- 1. Paste .pipeline/<id>/HANDOVER.md here, unchanged (Built · Parked · Please confirm · Try it). -->

## What changed and why
- **Why:** <the problem from the brief / spec, one line>
- **Backend:** <one line> · **Frontend:** <one line> · **Database:** <migration yes/no, one line>

## Rules covered
Spec: `<spec path>` v<N>.
| Rule | Test |
|---|---|
| BR-XXX-01 <short name> | `<test file>` |
<!-- More than 12 rules: one row per slice with the BR range. Parked rules are listed under Parked, not here. -->

## Risks
- <what could go wrong for a factory user, or "none known"> · <migration / data risk> · <anything a reviewer rejected and why>

## Gates
<!-- Paste the output of `.claude/pipeline/state.sh gates`. -->

## Screenshots
<!-- From .pipeline/<id>/screens/ (design-reviewer). No design-reviewer yet: write "skipped — <reason>". -->

## Manual test checklist
<!-- Checkbox list written by test-writer (checklist mode) from the spec. -->

Closes #<n>. Follow-up issues: #<n>, #<n>.
Reply on this PR to request changes; the watcher picks it up. Merge when satisfied.
<!-- pipeline:<id> -->
