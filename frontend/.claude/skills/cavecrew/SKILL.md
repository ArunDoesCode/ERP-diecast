---
name: cavecrew
description: >
  Decision guide for delegating to the compressed-output subagents in .claude/agents/.
  Tells the main thread WHEN to spawn cavecrew-investigator (locate code), cavecrew-builder
  (1-2 file edit), or cavecrew-reviewer (fast diff review) instead of doing the work inline.
  Also covers when to route to nextjs-builder/nextjs-reviewer instead, and when to skip
  delegation entirely. Trigger: delegate, use cavecrew, spawn investigator/builder/reviewer,
  save context, which agent, compressed agent output.
---

# Cavecrew — delegation decision guide

Cavecrew = three subagent presets (`cavecrew-investigator`, `cavecrew-builder`,
`cavecrew-reviewer`) that return **compressed, structured output** instead of prose. Spawn
them with the `Agent` tool, `subagent_type` set to the agent's `name`. Same job as a vanilla
locate/edit/review pass; the difference is the tool-result injected back into your context is
far smaller, so a long session lasts longer before compaction.

All three, plus `nextjs-builder`/`nextjs-reviewer`, live only in `.claude/agents/` of this
`frontend/` project — they do not exist at the user/global level and should never be asked to
read or write outside this repo (the one exception: read-only `bun run --cwd ../backend
contract:query`/`contract:generate` shell calls, which are how frontend agents stay in sync
with the backend's API contract without guessing).

## When to use which

| Task                                                        | Use                                              |
| ------------------------------------------------------------ | --------------------------------------------------- |
| "Where is X defined / what calls Y / list uses of Z"        | `cavecrew-investigator`                          |
| Same but you also want suggestions/architecture commentary  | Do it yourself, or ask for prose explicitly      |
| Surgical edit, ≤2 files, scope obvious                       | `cavecrew-builder`                               |
| New feature / 3+ files / cross-cutting frontend change       | `nextjs-builder` (ideally via a scoped hand-off) |
| Review diff, branch, or file for bugs (fast pass)            | `cavecrew-reviewer`                              |
| Deep frontend architecture/perf review with rationale        | `nextjs-reviewer`                                |
| One-line answer you already know                             | No subagent — just answer                        |

Rule of thumb: **if you'd want the subagent's output in 1/3 the tokens, pick cavecrew. If
you'd want prose and rationale, pick `nextjs-reviewer`/`nextjs-builder` or do it inline.**

## Run cavecrew calls in parallel when independent

Spawning a subagent is a normal tool call — issue multiple `Agent` calls for independent
cavecrew tasks in the **same** turn instead of one-at-a-time. Serialize only when one call's
output feeds the next (e.g. investigator's result determines which file to hand to builder).

## Why this exists

Subagent tool results get injected into your context verbatim. A prose-style locate pass
that returns 2k tokens costs 2k tokens of context every time. The same finding from
`cavecrew-investigator` returns a fraction of that, in a format built to be re-parsed rather
than read. Across many delegations in one session that's the difference between context
exhaustion and finishing the task.

## Output contracts

What you can rely on per agent (see each agent's file in `.claude/agents/` for the full
contract):

**`cavecrew-investigator`**

```
<Header>:
- path:line — `symbol` — short note
totals: <counts>.
```

Or `No match.` Always file-path-first, line-number-attached, backticked symbols.

**`cavecrew-builder`**

```
<path:line-range> — <change ≤10 words>.
verified: <re-read OK | mismatch @ path:line>.
```

Or one of: `too-big.` / `needs-confirm.` / `ambiguous.` / `regressed.` (terminal first token).

**`cavecrew-reviewer`**

```
path:line: <emoji> <severity>: <problem>. <fix>.
totals: N🔴 N🟡 N🔵 N❓
```

Or `No issues.` Findings sorted file → line ascending.

## Chaining patterns

**Locate → fix → verify** (most common):

1. `cavecrew-investigator` returns site list.
2. Pick 1-2 sites, hand exact paths to `cavecrew-builder`.
3. `cavecrew-reviewer` audits the diff.

**Parallel scout** (when investigation is broad): spawn 2-3 `cavecrew-investigator` calls in
one message (different angles: defs vs callers vs tests). Aggregate yourself.

**Single-shot edit** (site already known): skip investigator, hand exact path:line to
`cavecrew-builder` directly.

## What NOT to do

- Don't use `cavecrew-builder` when you don't already know the file — spawn investigator
  first, or you'll burn a turn passing context back and forth.
- Don't chain `cavecrew-investigator → cavecrew-builder` for a 5-file refactor — builder will
  return `too-big.` and the turn is wasted. Route to `nextjs-builder` instead.
- Don't ask `cavecrew-reviewer` for "general feedback" — it returns findings only, no
  architecture opinions. Use `nextjs-reviewer` for that.
- Don't expect prose. Cavecrew output is structured, sometimes terse to the point of cryptic —
  paraphrase before showing it to the user directly.

## Auto-clarity (inherited by every cavecrew agent)

Every cavecrew agent drops its compressed format for security-relevant findings (secrets,
auth bypass, exposed credentials), destructive/irreversible actions, or anything genuinely
ambiguous where a terse fragment could be misread. It states the concern plainly, then stops.
