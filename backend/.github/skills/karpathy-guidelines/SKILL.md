---
name: karpathy-guidelines
description: "Behavioral guidelines to reduce common LLM coding mistakes. Use when writing, reviewing, or refactoring code to avoid overcomplication, make surgical changes, surface assumptions, and define verifiable success criteria. Triggers: write code, review code, refactor, implement, edit, change, fix, add feature. Applies to every coding task."
---

# Karpathy Guidelines

Behavioral guidelines to reduce common LLM coding mistakes, derived from [Andrej Karpathy's observations](https://x.com/karpathy/status/2015883857489522876) on LLM coding pitfalls.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that **your** changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan before starting:
\`\`\`

1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
   \`\`\`

Strong success criteria allow independent looping. Weak criteria ("make it work") require constant clarification.

## 5. Type Source-Of-Truth By Layer (DiecastOS backend)

**One boundary, one owner. No duplicated type contracts.**

- Controller/service boundary types come from Zod schemas (`z.infer`) in `src/types/*.types.ts`.
- Repository input/update/select types come from Drizzle schema inference (`$inferInsert`, `$inferSelect`), then narrowed with `Pick`/`Omit`/`Partial` (use the shared `PartialUpdate<T>` helper in `src/lib/types.ts` instead of plain `Partial<T>` — this repo runs `exactOptionalPropertyTypes`).
- Do not handwrite duplicate unions/DTOs in repository when Drizzle already owns that contract.
- When a Zod schema in `src/types/*.types.ts` mirrors a Drizzle table's shape, derive it with `drizzle-zod` (`createSelectSchema`/`createInsertSchema`/`createUpdateSchema`) and `.pick()`/`.omit()`/`.extend()` for the API-facing variant — do not hand-declare field types/nullability that the column definition already owns.
- Exception: when the API contract intentionally narrows a column's nullability (e.g. accepts omission but never an explicit `null`), keep that specific field hand-authored with a one-line comment explaining why — don't force a derivation that silently widens accepted input.
- Repository column projections that select every column use `getTableColumns(table)` from `drizzle-orm` instead of re-listing every field by hand.
- If business rule requires extra guarantees (example: force `updatedAt`), compose a small overlay on top of inferred types instead of redefining full shape.
