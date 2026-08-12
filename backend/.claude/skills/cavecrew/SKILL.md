---
name: cavecrew
description: >
  Decision guide for delegating to caveman-style subagents. Tells the main
  thread WHEN to spawn `cavecrew-investigator` (locate code), `cavecrew-builder`
  (1-2 file edit), or `cavecrew-reviewer` (diff review) instead of doing the
  work inline or using vanilla `Explore`. Subagent output is caveman-compressed
  so the tool-result injected back into main context is ~60% smaller — main
  context lasts longer across long sessions.
  For multi-step implement/debug/refactor or 3+ file builds, use `ponytail`
  (orchestrator) instead — it routes to cavecrew or `hono-builder` as needed.
  Trigger: "delegate to subagent", "use cavecrew", "spawn investigator/builder/reviewer",
  "save context", "compressed agent output".
---

Cavecrew = three subagent presets that emit caveman output. Same job as Anthropic defaults (`Explore`, edit-style agents, reviewer); difference is the tool-result they return is compressed, so main context shrinks per delegation.

Route multi-step backend work through `ponytail` (see `.claude/skills/ponytail/SKILL.md`). Reach for cavecrew agents directly for isolated locate / surgical / fast-review tasks.

## Run cavecrew calls in parallel when independent

Spawning subagents is a normal tool call — issue multiple `Agent` calls for
independent cavecrew tasks in the **same** message/turn instead of one-at-a-time. Serialize
when one call's output feeds the next (e.g. investigator's result determines which
file to hand to builder). See "Parallel scout" below.

## When to use cavecrew vs alternatives

| Task                                                       | Use                                        |
| ---------------------------------------------------------- | ------------------------------------------ |
| "Where is X defined / what calls Y / list uses of Z"       | `cavecrew-investigator`                    |
| Same but you also want suggestions/architecture commentary | `Explore` (vanilla)                        |
| Surgical edit, ≤2 files, scope obvious                     | `cavecrew-builder`                         |
| New feature / 3+ files / cross-cutting refactor            | `ponytail` → routes to `hono-builder`      |
| Review diff, branch, or file for bugs                      | `cavecrew-reviewer`                        |
| Deep code review with rationale + alternatives             | `hono-reviewer` (or vanilla Code Reviewer) |
| Backend implement / debug / refactor (multi-step)          | `ponytail` first                           |
| One-line answer you already know                           | Main thread, no subagent                   |

Rule of thumb: **if you'd want the subagent's output in 1/3 the tokens, pick cavecrew. If you'd want prose, pick vanilla. If the task may grow past one shot, pick ponytail.**

## Why this exists (the real win)

Subagent tool results get injected into main context verbatim. A vanilla `Explore` that returns 2k tokens of prose costs 2k tokens of main-context budget every time. The same finding from `cavecrew-investigator` returns ~700 tokens. Across 20 delegations in one session that's the difference between context exhaustion and finishing the task.

## Output contracts

What main thread can rely on per agent:

**`cavecrew-investigator`**

```
<Header>:
- path:line — `symbol` — short note
totals: <counts>.
```

Or `No match.` Always file-path-first, line-number-attached, backticked symbols. Safe to grep with `path:\d+`.

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
2. Main thread (or `ponytail`) picks 1-2 sites, hands paths to `cavecrew-builder`.
3. `cavecrew-reviewer` audits the diff.

**Parallel scout** (when investigation is broad):
Spawn 2-3 `cavecrew-investigator` calls in one message (different angles: defs vs callers vs tests). Aggregate in main thread.

**Single-shot edit** (when site is already known):
Skip investigator. Hand exact path:line to `cavecrew-builder` directly.

**Feature / 3+ files:**
Invoke `ponytail` for this — it routes to `hono-builder` then `hono-reviewer` instead of chaining cavecrew calls.

## Where each agent fits best

- Know the exact file already? Hand it straight to `cavecrew-builder`. Don't know it yet? Spawn `cavecrew-investigator` first — that keeps the main thread from spending tokens tracking down context itself.
- A refactor spanning several files fits `ponytail` / `hono-builder` — `cavecrew-builder` is sized for 1-2 files and will return `too-big.` if handed more.
- General feedback or architecture opinions fit `hono-reviewer` — `cavecrew-reviewer` returns findings only, by design.
- Cavecrew output is structured and sometimes terse to the point of cryptic — paraphrase it before showing it to a human.
- Call `hono-builder` directly once `ponytail` has scoped the hand-off; for anything not yet scoped, start with `ponytail`.

## Auto-clarity (inherited)

Subagents switch caveman → normal English for security warnings, irreversible-action confirmations, and any output where fragment ambiguity could be misread. They resume caveman once that's handled.
