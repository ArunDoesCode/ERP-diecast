# cavecrew

Decision guide. When to delegate to caveman subagents instead of doing the work inline.

## What it does

Tells the main thread when to spawn a caveman-style subagent versus the vanilla equivalent. The win: subagent tool-results inject back into main context verbatim, and caveman output is roughly 1/3 the size of vanilla prose. Across 20 delegations in one session, that is the difference between context exhaustion and finishing the task.

Three subagents:

| Subagent                | Job                      | Use when                                             |
| ----------------------- | ------------------------ | ---------------------------------------------------- |
| `cavecrew-investigator` | Locate code (read-only)  | "Where is X defined / what calls Y / list uses of Z" |
| `cavecrew-builder`      | Surgical edit, 1-2 files | Scope is obvious, ≤2 files. Refuses 3+ file scope.   |
| `cavecrew-reviewer`     | Diff/file review         | One-line findings with severity emoji                |

Use vanilla `Explore` when you want prose or architecture commentary. Use `hono-reviewer` for deep backend review. Use **`ponytail`** for multi-step implement/debug/refactor and for **3+ file / new feature** builds (it routes to `hono-builder`). Use main thread directly for one-line answers.

This skill is a decision guide, not a slash command. It activates when the conversation mentions delegation. For orchestrator routing, also see [ponytail skill](../ponytail/SKILL.md).

## How to invoke

Triggers on phrases like "delegate to subagent", "use cavecrew", "spawn investigator", "save context", "compressed agent output".

## Example chaining

Locate → fix → verify (most common):

1. `cavecrew-investigator` returns site list (`path:line — symbol — note`)
2. Main thread (or `ponytail`) picks 1-2 sites, hands paths to `cavecrew-builder`
3. `cavecrew-reviewer` audits the resulting diff

Parallel scout: spawn 2-3 `cavecrew-investigator` calls in one message with different angles (defs, callers, tests). Aggregate in main.

Feature work: invoke `ponytail` — do not stretch cavecrew across 3+ files.

## See also

- [`SKILL.md`](./SKILL.md) — full decision matrix and output contracts
- [`../ponytail/SKILL.md`](../ponytail/SKILL.md) — when to use orchestrator vs direct cavecrew
- [`agents/cavecrew-investigator.md`](../../agents/cavecrew-investigator.md)
- [`agents/cavecrew-builder.md`](../../agents/cavecrew-builder.md)
- [`agents/cavecrew-reviewer.md`](../../agents/cavecrew-reviewer.md)
- [`agents/README.md`](../../agents/README.md) — full agent hierarchy
