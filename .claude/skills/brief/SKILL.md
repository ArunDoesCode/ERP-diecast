---
name: brief
description: >
  Capture the owner's one-page brief for a new feature before any research or spec: problem, who uses it,
  outcome, selling point, what is not included, how we know it worked. The skill only asks questions and
  records the owner's words in docs/briefs/<feature>.md. Use when: /brief <feature>, "new feature idea",
  "I want to build X", or when /research or /spec finds no brief.
---

# /brief <feature>

The brief is the owner's file. You ask and record. You do not design, research or add ideas.

1. Normalise the name to kebab-case. If `docs/briefs/<feature>.md` exists, read it and only fill the gaps.
2. Read what the owner already typed in the prompt. Put each sentence, in his words, under the matching
   heading of `docs/briefs/_template.md`. Do not rewrite it into ERP language.
3. For each heading that is still empty, ask. Rules for questions:
   - max 3 at a time (AskUserQuestion), then wait;
   - each answerable with a letter or one word: offer 2–3 concrete options taken from his own words or
     from `docs/product/vision.md`, plus "other";
   - no question about rules, screens, data or how other ERPs do it — that is `/research` and `/spec`.
4. Write `docs/briefs/<feature>.md` (max 40 lines). Set `module:` to the spec folder it will feed.
   A heading the owner chose to skip gets the line `not decided` — never your guess.
5. Show the file path and ask one question: "Agreed? (y/n)". On yes set `status: agreed`.
6. Next step, one line: `/research <feature>`.

## Never
- Never write feature code, a spec or a rule here.
- Never put a link or a rule id in the brief.
- Too big for one page (more than one outcome, or more than 3 kinds of user) → say so and suggest
  splitting into two briefs.
