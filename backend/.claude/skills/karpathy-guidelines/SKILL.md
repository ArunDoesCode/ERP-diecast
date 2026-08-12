---
name: karpathy-guidelines
description: "Behavioral guidelines for correct LLM coding habits: keep solutions minimal and grounded, make surgical changes, surface assumptions, and define verifiable success criteria. Use when writing, reviewing, or refactoring code. Triggers: write code, review code, refactor, implement, edit, change, fix, add feature. Applies to every coding task."
---

# Karpathy Guidelines

Behavioral guidelines to reduce common LLM coding mistakes, derived from [Andrej Karpathy's observations](https://x.com/karpathy/status/2015883857489522876) on LLM coding pitfalls.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**State assumptions. Surface confusion. Surface tradeoffs.**

Before implementing:

- State assumptions explicitly. When uncertain, ask.
- When multiple interpretations exist, present them and let the user pick.
- When a simpler approach exists, say so — push back when warranted.
- When something is unclear, stop, name what's confusing, and ask.

## 2. Simplicity First

**Minimum code that solves the problem. Build only what was asked for.**

- Build exactly the features that were asked for.
- Reach for an abstraction when the code has 2+ real uses, not for single-use code.
- Add flexibility or configurability when it was requested, not ahead of that.
- Handle the error scenarios that can actually occur.
- If 200 lines could be 50, rewrite it at 50.

Ask: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Leave adjacent code, comments, and formatting as they are.
- Refactor what's actually broken or in scope, not what merely could be nicer.
- Match existing style, even when you'd do it differently.
- When you notice unrelated dead code, mention it and leave it for a separate pass.

When your changes create orphans:

- Remove imports/variables/functions that **your** changes made unused.
- Leave pre-existing dead code in place unless the user asks for it to go.

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
- Repository input/update/select types come from Drizzle schema inference (`$inferInsert`, `$inferSelect`), then narrowed with `Pick`/`Omit`/`Partial`.
- Derive repository unions/DTOs from Drizzle's inferred types rather than hand-writing duplicates. Under `exactOptionalPropertyTypes`, use the shared `PartialUpdate<T>` helper (`src/lib/types.ts`) rather than plain `Partial<T>`.
- When a Zod schema in `src/types/*.types.ts` mirrors a Drizzle table's shape, derive it with `drizzle-zod` (`createSelectSchema`/`createInsertSchema`/`createUpdateSchema`) and `.pick()`/`.omit()`/`.extend()` for the API-facing variant, rather than hand-declaring field types and nullability the column already owns.
- Exception: when the API contract intentionally narrows a column's nullability (accepts omission but never an explicit `null`, say), keep that field hand-authored with a one-line comment explaining why — a forced derivation would silently widen accepted input.
- Use `getTableColumns(table)` from `drizzle-orm` for repository column projections that select every column, instead of re-listing every field by hand.
- When a business rule needs extra guarantees (example: force `updatedAt`), compose a small overlay on top of the inferred type instead of redefining the full shape.
