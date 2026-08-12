# Claude Code subagents (DiecastOS backend)

These are native [Claude Code subagents](https://code.claude.com/docs/en/sub-agents) — plain
markdown files with YAML frontmatter (`name`, `description`, `tools`) plus a system prompt body.
They mirror the roster in [`.github/agents/`](../../.github/agents/) (GitHub Copilot's format)
and [`.claude/skills/ponytail`](../skills/ponytail/SKILL.md) / [`cavecrew`](../skills/cavecrew/SKILL.md)
(routing skills for the main thread). Keep behavior in sync across all three when editing prompts —
each platform needs its own tool names, but the routing rules and constraints should match.

Claude Code discovers any `.md` file in `.claude/agents/` automatically; `name:` is what you pass
as `subagent_type` to the `Agent` tool, and the `description:` is what the main thread's
auto-delegation matches against.

## Hierarchy

```
User / main Claude Code session
├── ponytail (orchestrator)          ← default for implement / debug / refactor
│   ├── cavecrew-investigator        locate (read-only, compressed)
│   ├── cavecrew-builder             surgical ≤2 files
│   ├── hono-builder                 3+ files / new feature
│   ├── cavecrew-reviewer            fast bug review (read-only)
│   └── hono-reviewer                deep architecture/perf review (read-only)
└── direct Agent call                isolated locate / review / surgical only
```

## Roster

| Agent                                                 | Role                                      | `tools:`                                                              | Entry                                   |
| ------------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------ |
| [`ponytail`](./ponytail.md)                           | Orchestrator — YAGNI, size-based routing  | Read, Edit, Write, Grep, Glob, Bash, Agent, AskUserQuestion, Skill, codegraph | **Proactive** for backend work          |
| [`hono-builder`](./hono-builder.md)                   | Full Hono feature build                   | Read, Edit, Write, Grep, Glob, Bash, Skill, AskUserQuestion, codegraph      | Via ponytail (or scoped hand-off)       |
| [`hono-reviewer`](./hono-reviewer.md)                 | Deep backend review                       | Read, Grep, Glob, Skill, codegraph (no Edit/Write/Bash)                    | Via ponytail, or direct isolated review |
| [`cavecrew-investigator`](./cavecrew-investigator.md) | Locate defs/callers                       | Read, Grep, Glob, codegraph (no Edit/Write/Bash)                           | Direct OK for isolated locate            |
| [`cavecrew-builder`](./cavecrew-builder.md)           | Surgical 1–2 file edit                    | Read, Edit, Write, Grep, Glob, Bash, codegraph                             | Direct OK when path known               |
| [`cavecrew-reviewer`](./cavecrew-reviewer.md)         | Fast compressed review                    | Read, Grep, Glob, Skill, codegraph (no Edit/Write/Bash)                    | Direct OK for quick diff pass           |

The three reviewer/investigator agents are read-only by construction — `tools:` omits `Edit`,
`Write`, and `Bash`, so they cannot mutate the repo even if the prompt were ignored.

## When to bypass ponytail

Calling a subagent directly (via the `Agent` tool) is fine when the task is **one shot** and needs
no map → build → review loop:

- "Where is `requireRole` defined?" → `Agent({ subagent_type: "cavecrew-investigator", ... })`
- "Apply this one-line fix to `src/lib/errors.ts`" → `Agent({ subagent_type: "cavecrew-builder", ... })`
- "Quick review this diff for bugs" → `Agent({ subagent_type: "cavecrew-reviewer", ... })`

Use **ponytail** for anything that might grow past one file, needs API intake, or should get a
review pass.

## Hand-off contract

Every delegation (main → ponytail, or ponytail → worker) passes this brief in the `Agent` prompt:

`scope (files) · goal · constraints · done-check`

Constraints default: 3-layer Hono, `end-points.ts` SoT, OpenAPI, `AppError`, `requireRole`, no
`any`, async-handler wrap. Done-check: `bun run lint && bun run typecheck && bun test`.

## Routing skills

The main thread (or ponytail) should invoke the `Skill` tool with `skill: "ponytail"` when deciding
which agent to spawn, and `skill: "cavecrew"` for cavecrew-only decisions — see
[`.claude/skills/ponytail/SKILL.md`](../skills/ponytail/SKILL.md) and
[`.claude/skills/cavecrew/SKILL.md`](../skills/cavecrew/SKILL.md).

## Codegraph

All agents above reach `mcp__codegraph__codegraph_explore` directly (not through a wrapper tool) —
it's listed explicitly in each agent's `tools:` frontmatter. If `.codegraph/` isn't indexed for this
repo, skip it and fall back to `Grep`/`Glob`/`Read`.
