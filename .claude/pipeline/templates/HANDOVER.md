<!-- Hand-over for one run. Write to .pipeline/<id>/HANDOVER.md and paste as the top of the PR body.
     Hard limit: 40 lines. Plain words. No BR ids outside the "Built" list. Delete empty sections and these comments. -->
# Hand-over — <id> (<date>)

**Status:** <ready to try | stopped: <hard stop, one line>> · PR <url> · branch `feature/<id>`

## Built
- <what the user can now do, one line per slice> (BR-…)
<!-- Epic: one line per sub-feature instead — what the user can now do · merged / waiting / parked · PR. This is the split. -->

## Parked (not built — one issue each)
- <slice, one line why> → <issue url>

## Please confirm (answer yes / no on the PR)
<!-- Only assumptions tagged `confirm`. Each a full question the owner can answer without opening a file.
     A "no" becomes a normal change request, not a re-run. -->
1. A-NN — <question in plain words>? We chose: <choice> (as <ERPNext / Odoo / SAP B1> does).

## Try it
```bash
# From the worktree .claude/worktrees/<id>. Starts the DBs, asks before migrating the dev DB, starts API :4000 + UI :3000.
cd backend && bun run try            # `bun run try --check` first shows what it would do; Ctrl-C stops both
```
Demo data: the dev DB as it is. Logins `<role>@diecast.local` (password = your `SEED_USER_PASSWORD`).
No `backend/.env` in the worktree → `bun --env-file=<state.json envFile> run …`. Never `bun run db:reset` here.

1. Log in as `<role>@diecast.local`.
2. Open <menu → screen>.
3. <click / type — what to do>
4. **Expect:** <what you should see>
5. <one "must be refused" step: wrong role or bad value> — **Expect:** <message>
<!-- 5–10 steps, written from test-writer's checklist; real numbers, real screen names. -->

## Blocked by permission / red before this run
- <command or check> — <one line> (only if any)
