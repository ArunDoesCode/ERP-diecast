---
name: spec
description: >
  Start or extend the functional spec for a module (PR, approval, PO, GRN, subcontracting, BOM, sale order…)
  before any code is written. Runs brief → research → interview → rules → data/API and screen design →
  edge cases → a short OWNER.md with max 7 decision cards, as a draft spec folder docs/specs/<module>/.
  Use when: /spec <module>, "write the spec", "how should X work", "define rules", starting a new module,
  or when a bug reveals an unwritten rule.
---

# /spec <module>

The owner reads one file at the end: `docs/specs/<module>/OWNER.md`. Agents own all other detail.
You (main session) run the steps; subagents cannot spawn each other. Briefs to agents carry pointers
(paths, module, mode), not pasted text.

## 0. Which layout
- `docs/specs/<module>.md` exists (flat spec) → **flat path**: delegate to spec-analyst with the path and
  the owner's notes verbatim; it follows "Flat specs" in `.claude/agents/spec-analyst.md`. If the spec is
  `frozen`, this is a change request → `/freeze <module>` change path. Then stop here.
- Otherwise → **folder path** below. Copy `docs/specs/_template/` to `docs/specs/<module>/` if missing.

## Folder path
| Step | Who | Writes | Needs |
|---|---|---|---|
| 1 | — | — | `docs/briefs/<feature>.md` with `status: agreed`. Missing → stop, suggest `/brief <feature>` |
| 2 | researcher | `docs/research/<feature>.md` | Missing → run it as in `/research`. Present → reuse |
| 3 | spec-analyst, pass 1 | `spec.md` (draft) | interview: max 3 questions at a time, letter answers |
| 4 | solution-designer ∥ ui-ux-designer (one message, two Agent calls) | `design/data.md`, `design/api.md` ∥ `design/screens.md` + pictures | `spec.md` |
| 5 | spec-analyst, pass 2 | `design/edge-cases.md`, `assumptions.md`, then `OWNER.md` last | all of the above |

- Interviews need the owner: if the subagent cannot ask, run its questions through AskUserQuestion in
  the main thread and pass the answers back verbatim.
- Step 4 questions: a designer returns questions instead of guessing. Technical ones you answer from
  conventions; behaviour ones go to spec-analyst in step 5 (it adds a rule, an assumption or a card).
  If a designer's answer changes `spec.md`, re-run the other designer only for the changed rules.
- After step 4, `design/screens.md` may say "source: pending api.md": send ui-ux-designer once more
  to fill the sources from `design/api.md`.
- What becomes an owner card and what an agent decides: the routing table in
  `.claude/agents/spec-analyst.md`. **More than 7 cards = split the feature** into two modules; do not
  squeeze cards.
- Resuming: run only the steps whose output file is missing or older than `spec.md`.

## Show the owner (one screen)
- Path of `OWNER.md`, number of cards, number of pictures.
- Counts only: rules, edge cases, assumptions.
- Next step: "Answer the cards in OWNER.md (a letter each), then `/freeze <module>`."
Do not paste rules, tables or designs into the chat.

## Never
- Never write feature code in this skill. Never set `status: frozen` (only `/freeze`).
- Never ask the owner a technical question (limits, names, indexes, endpoint shape).
- Never leave `frontend/src/app/(mock)/` behind after step 4.
