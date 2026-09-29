---
name: wrap
description: >
  End-of-session knowledge capture so the user never repeats themselves: extracts corrections, preferences,
  decisions, gotchas and deferred ideas from the session and writes each into the right file. Use when:
  /wrap, "end of session", "save what we learned", "remember this", before /clear, or after a long session.
---

# /wrap

Review this session's conversation and produce a short list of candidate entries, each routed to one place:

Route by **scope** — the narrower the scope, the deeper the layer (full table: `docs/KNOWLEDGE.md`):

| Kind | Goes to |
|---|---|
| Trap / quirk in one module | `docs/modules/<module>.md` → Invariants & gotchas |
| New/changed business rule | the module spec (via `/spec` or `/freeze` change path) — don't edit frozen specs silently |
| Convention for all backend or all frontend code | package `CLAUDE.md`, or the matching skill if it's detailed |
| How to do one kind of task (lists, forms, endpoints) | the matching skill |
| Rule that applies to every session everywhere (rare) | root `CLAUDE.md` — one line, imperative |
| Product/architecture decision with a reason | `docs/decisions.md` (date, decision, why, alternatives rejected) |
| Idea / defect not in current scope | GitHub issue (`gh issue create`, labels priority + type + `mod:`) |
| Personal working-style preference (tone, plan format, how much to ask) | Claude memory |
| Progress, what's next | `docs/STATUS.md` |

Rules:
- Show the list to the user first; write only what they accept.
- Deduplicate: search the target file before adding; update an existing line rather than adding a near-copy.
- Budgets (`docs/KNOWLEDGE.md`): root `CLAUDE.md` ≤ 100 lines, package ≤ 150, map ≤ 250. Over budget →
  propose moving detail down a layer and leaving a one-line pointer.
- Finish by updating `docs/STATUS.md` **Next action** (one concrete command) so the next session — or
  `/status` — starts from it.
