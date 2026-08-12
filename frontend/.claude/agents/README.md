# Claude Code subagents (ERP Diecast frontend)

These are native [Claude Code subagents](https://code.claude.com/docs/en/sub-agents) — plain
markdown files with YAML frontmatter (`name`, `description`, `tools`) plus a system prompt
body. They mirror the roster in [`.github/agents/`](../../.github/agents/) (GitHub Copilot's
format, kept for reference — not touched by this migration) and the backend's own
[`../backend/.claude/agents/`](../../../backend/.claude/agents/) roster. Keep behavior in sync
across the two when editing prompts — each side needs its own tool names and contract-lookup
commands, but the routing rules and constraints should match.

Claude Code discovers any `.md` file in `.claude/agents/` automatically; `name:` is what you
pass as `subagent_type` to the `Agent` tool, and `description:` is what auto-delegation
matches against.

**All six agents live only in this `frontend/.claude/agents/` folder** — project-scoped, not
installed at the user/global level — and every agent's prompt is instructed to operate only
within this repository (the one exception being read-only `bun run --cwd ../backend
contract:query`/`contract:generate` lookups against the backend's generated API contract).

## Hierarchy

```
User / main Claude Code session
├── ponytail (orchestrator)          ← default for implement / debug / refactor
│   ├── cavecrew-investigator        locate (read-only, compressed)
│   ├── cavecrew-builder             surgical ≤2 files
│   ├── nextjs-builder               3+ files / new feature
│   ├── cavecrew-reviewer            fast bug review (read-only)
│   └── nextjs-reviewer              deep architecture/perf/responsiveness review (read-only)
└── direct Agent call                isolated locate / review / surgical only
```

## Roster

| Agent                                                 | Role                                       | `tools:`                                                                          | Entry                                    |
| ------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------- |
| [`ponytail`](./ponytail.md)                            | Orchestrator — YAGNI, size-based routing    | Read, Edit, Write, Bash, Agent, AskUserQuestion, Skill, ToolSearch, codegraph        | **Proactive** for frontend work           |
| [`nextjs-builder`](./nextjs-builder.md)                | Full Next.js feature build                  | Read, Edit, Write, Bash, Skill, AskUserQuestion, ToolSearch, codegraph               | Via ponytail (or scoped hand-off)         |
| [`nextjs-reviewer`](./nextjs-reviewer.md)              | Deep frontend review (arch/perf/responsive) | Read, ToolSearch, Skill, codegraph (no Edit/Write/Bash)                              | Via ponytail, or direct isolated review   |
| [`cavecrew-investigator`](./cavecrew-investigator.md)  | Locate defs/callers                         | Read, ToolSearch, codegraph (no Edit/Write/Bash)                                     | Direct OK for isolated locate             |
| [`cavecrew-builder`](./cavecrew-builder.md)            | Surgical 1–2 file edit                      | Read, Edit, Write, Bash, ToolSearch, codegraph                                       | Direct OK when path known                 |
| [`cavecrew-reviewer`](./cavecrew-reviewer.md)          | Fast compressed review                      | Read, ToolSearch, Skill, codegraph (no Edit/Write/Bash)                              | Direct OK for quick diff pass             |

The three reviewer/investigator agents are read-only by construction — `tools:` omits `Edit`,
`Write`, and `Bash`, so they cannot mutate the repo even if the prompt were ignored. (This
harness has no dedicated read-only `Grep`/`Glob` tool, so these three lean on
`mcp__codegraph__codegraph_explore` — already the primary locate tool in this project — plus
`Read`, rather than shell-based search.)

## When to bypass ponytail

Calling a subagent directly (via the `Agent` tool) is fine when the task is **one shot** and
needs no map → build → review loop:

- "Where is `useSuppliersQuery` defined?" → `Agent({ subagent_type: "cavecrew-investigator", ... })`
- "Apply this one-line fix to `src/lib/api/routes.ts`" → `Agent({ subagent_type: "cavecrew-builder", ... })`
- "Quick review this diff for bugs" → `Agent({ subagent_type: "cavecrew-reviewer", ... })`

Use **ponytail** for anything that might grow past one file, needs a backend contract lookup,
or should get a review pass.

## Hand-off contract

Every delegation (main → ponytail, or ponytail → worker) passes this brief in the `Agent`
prompt:

`scope (files) · goal · constraints · done-check`

Constraints default: page → view → pages-component pattern, `api.*` + `API_ROUTES` only (no
raw fetch/axios/Supabase), TanStack Query for server state, Zustand for UI state only, feature
key-factory invalidation. Done-check: `npx tsc --noEmit -p .` and `npx biome check <files>`
both clean.

## Routing skill

The main thread (or ponytail) should invoke the `Skill` tool with `skill: "cavecrew"` when
deciding which agent to spawn — see [`.claude/skills/cavecrew/SKILL.md`](../skills/cavecrew/SKILL.md).
Feature-build skills (`structure-guard`, `client-data-state`, `ui-form-standards`, `data-table`,
`shadcn`, `karpathy-guidelines`, `pwa-runtime-ux`) live alongside it in `.claude/skills/`.

## Codegraph

All agents above reach `mcp__codegraph__codegraph_explore` directly (not through a wrapper
tool) — it's listed explicitly in each agent's `tools:` frontmatter. If `.codegraph/` isn't
indexed for this repo, skip it and fall back to `Read` + `Bash` (grep/find).
