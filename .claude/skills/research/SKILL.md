---
name: research
description: >
  Benchmark how mature ERPs and niche foundry tools handle a feature, before the spec is written. Delegates
  to the researcher agent, which writes docs/research/<feature>.md with links, retrieval dates and an
  adopt / adapt / reject verdict per finding. Also answers a single spec gap. Use when: /research <feature>,
  /research <feature> "<question>", "how do other ERPs do X", "benchmark this", or a spec gap mid-build.
---

# /research <feature> ["<one question>"]

1. Normalise the name to kebab-case.
2. **Full research** (no question given):
   - `docs/briefs/<feature>.md` must exist with `status: agreed`. If not: stop, suggest `/brief <feature>`.
   - `docs/research/<feature>.md` already exists → ask "Refresh? (y/n)"; default no.
3. **Gap mode** (a question is given, or `/spec`, `/feature`, `/bug` hit a rule nobody wrote): no brief
   check. The answer is appended to the feature's research file.
4. Delegate to the **researcher** agent (`subagent_type: researcher`, fresh context). The brief has
   pointers only:
   - feature, mode (full | gap), the question (gap mode, verbatim),
   - paths: brief, module map, spec if any,
   - may write: `docs/research/<feature>.md` only.
   Steps and output shape are in `.claude/agents/researcher.md` and `docs/research/_template.md` — do not
   repeat them in the brief.
5. Show the owner, on one screen:
   - the **Copy these** list (verbatim, max 7 lines),
   - counts: adopt / adapt / reject, "products disagree",
   - the SME questions (he prints or sends these).
6. Next step, one line: `/spec <module>`.

## Rules
- Record what the products do; do not present a survey of options to the owner. One verdict per finding.
- Gap mode never stops a build: the caller takes the answer, logs the choice in the module's
  assumptions file and continues (`docs/runbooks/spec-gap-mid-build.md`).
- Never write a spec, a rule or code in this skill.
