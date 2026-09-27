---
name: spec
description: >
  Start or extend the functional spec for a module (PR, approval, PO, GRN, subcontracting, BOM, sale order…)
  before any code is written. Delegates to the spec-analyst agent, which benchmarks mature ERPs, reads the
  schema, interviews the user, and writes docs/specs/<module>.md (status: draft) with numbered business rules
  and acceptance criteria. Use when: /spec <module>, "write the spec", "how should X work", "define rules",
  starting a new module, or when a bug reveals an unwritten rule.
---

# /spec <module>

1. Normalise the module name to kebab-case (`purchase-requisition`, `grn`, `subcontracting`, `bom`, …).
2. If `docs/specs/<module>.md` exists, read it. If `status: frozen`, warn the user that changing it moves it
   to `changed-after-freeze` and ask whether this is a real rule change or a backlog idea
   (backlog → append to `docs/backlog.md` and stop).
3. Delegate to the **spec-analyst** agent (Agent tool, `subagent_type: spec-analyst`) with:
   - module name, whether it's new or retroactive (code already exists),
   - path of the existing spec if any,
   - the user's own notes from the prompt, verbatim.
   If the agent type isn't available, follow `.claude/agents/spec-analyst.md` yourself.
   Interviews need the user: run the spec-analyst's questions through AskUserQuestion in the main thread
   if the subagent can't ask directly.
4. When the spec is written, show the user:
   - rule count, acceptance-criteria count, open-question count,
   - the **Open questions for factory SME** list (they should print/send this),
   - gaps found in existing code.
5. Next step suggestion: "Get SME answers, then `/spec <module>` again to fold them in, then `/freeze <module>`."

Never write feature code in this skill.
