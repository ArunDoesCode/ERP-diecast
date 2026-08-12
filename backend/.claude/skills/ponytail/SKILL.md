---
name: ponytail
description: >
  Main-thread routing guide for DiecastOS backend work. Tells the main Claude Code session
  WHEN to invoke the `ponytail` orchestrator versus calling a cavecrew/hono subagent
  directly. Use when implementing, debugging, or refactoring backend code, or when
  deciding which subagent to spawn.
  Trigger: implement feature, backend refactor, debug backend, ponytail, which subagent,
  delegate backend work, orchestrate agents.
---

# Ponytail routing (main thread)

`ponytail` is the **orchestrator**. The other five agents in `.claude/agents/` are **delegate targets**.

## Default rule

| Task                                                       | Invoke                                   |
| ---------------------------------------------------------- | ---------------------------------------- |
| Backend implement / debug / refactor (anything multi-step) | `ponytail`                               |
| Isolated locate ("where is X / what calls Y")              | `cavecrew-investigator` directly OK      |
| Isolated surgical edit (≤2 files, path known)              | `cavecrew-builder` directly OK           |
| Isolated fast bug review of a known diff                   | `cavecrew-reviewer` directly OK          |
| Isolated deep architecture/perf review                     | `hono-reviewer` directly OK              |
| New feature / 3+ files / cross-cutting                     | `ponytail` → it routes to `hono-builder` |
| One-line answer already known                              | Main thread, no subagent                 |

Reserve direct `hono-builder` calls for when `ponytail` (or the user) has already handed you a scoped brief — going through `ponytail` first is what gets you the map → intake → review sequence.

## Hierarchy

```
User / main Claude Code session
├── ponytail (orchestrator)  ← default entry for backend work
│   ├── cavecrew-investigator  (locate)
│   ├── cavecrew-builder       (≤2 file edit)
│   ├── hono-builder           (3+ file / feature)
│   ├── cavecrew-reviewer      (fast review)
│   └── hono-reviewer          (deep review)
└── direct subagent            ← use for isolated locate/review/surgical work
```

## How to invoke

Use the `Agent` tool (or user phrase "use ponytail / use cavecrew-investigator / …") with `subagent_type` set to the agent's `name` from `.claude/agents/<name>.md`.

Hand-off brief when delegating (or when asking ponytail to delegate):

`scope (files) · goal · constraints · done-check`

## Related skills

- `.claude/skills/cavecrew/SKILL.md` — when to use compressed cavecrew vs prose Explore
- `.claude/skills/api-endpoint-intake/SKILL.md` — mandatory before new/changed endpoints
- `.claude/skills/pagination-contract/SKILL.md` — list endpoint pagination rules
- `.claude/skills/karpathy-guidelines/SKILL.md` — surgical change discipline

## See also

- `.claude/agents/README.md` — agent roster and sync note
- `.claude/agents/ponytail.md` — full orchestrator system prompt
