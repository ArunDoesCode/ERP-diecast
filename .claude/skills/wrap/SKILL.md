---
name: wrap
description: >
  End-of-session knowledge capture so the user never repeats themselves: extracts corrections, preferences,
  decisions, gotchas and deferred ideas from the session and writes each into the right file. Use when:
  /wrap, "end of session", "save what we learned", "remember this", before /clear, or after a long session.
---

# /wrap

Review this session's conversation and produce a short list of candidate entries, each routed to one place:

| Kind | Goes to |
|---|---|
| User corrected Claude on a convention / preference (esp. more than once) | `CLAUDE.md` (root if cross-package, else package `CLAUDE.md`) — one line, imperative |
| Product/architecture decision with a reason | `docs/decisions.md` (date, decision, why, alternatives rejected) |
| Recurring bug pattern + fix | `frontend/docs/gotchas.md` (or a backend section there) |
| New/changed business rule | the module spec (via `/spec` or `/freeze` change path) — don't edit frozen specs silently |
| Idea not in current scope | `docs/backlog.md` |
| Personal working-style preference (tone, plan format, how much to ask) | Claude memory |
| Progress on BRs | spec "Implementation status" table |

Rules:
- Show the list to the user first; write only what they accept.
- Deduplicate: search the target file before adding; update an existing line rather than adding a near-copy.
- Keep `CLAUDE.md` files lean — if a root/package CLAUDE.md passes ~150 lines, propose moving detail into a
  skill or doc and linking it.
- Finish with: what's the next slice / next step, in one line, so the next session can start with it.
