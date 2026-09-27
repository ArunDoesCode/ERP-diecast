---
name: slice
description: >
  Build one vertical slice of a frozen spec, test-first, across backend and frontend: gate check → contract →
  failing tests → backend implementation → contract regeneration → frontend → spec review → checks. Use when:
  /slice <module> <BR ids>, "build BR-GRN-03..06", "implement this part of the spec", "next slice".
---

# /slice <module> <BR ids>

A slice = the smallest set of rules that is useful end-to-end (usually one state transition, 2–6 BRs).
If the user gives no BR ids, read the spec and propose the next slice (rules not yet marked done); confirm.

## 0. Gate
- `docs/specs/<module>.md` must have `status: frozen`. If not → stop, suggest `/spec` / `/freeze`.
- Work in a git worktree/branch, not on `main`.
- Enter plan mode and present: BRs in scope, endpoints touched, files expected to change, tests to add.
  Get approval before step 1.

## 1. Contract
For new/changed endpoints, run the backend `api-endpoint-intake` skill (and `pagination-contract` for list
endpoints). Answers come from the spec — only ask the user what the spec doesn't answer (and then add the
answer to the spec).

## 2. Red — tests first
Delegate to **test-writer** with module + BR ids. Expect FAIL-EXPECTED for new behaviour. Any FAIL-BUG on
existing code is in scope only if it's one of the slice's BRs; otherwise log it in `docs/backlog.md`.

## 3. Green — backend
Delegate to **hono-builder** (`backend/.claude/agents/hono-builder.md`) with: the BR list, the failing test
files, the contract. If the agent type isn't registered in this session, spawn a general-purpose agent and
tell it to read and follow that file. Loop until `cd backend && bun test` passes and
`bun run typecheck && bun run lint` are clean.

## 4. Contract regen
`cd backend && bun run contract:generate`. Then confirm the endpoints with `bun run contract:query "<METHOD /path>"`.

## 5. Frontend
Delegate to **nextjs-builder** (`frontend/.claude/agents/nextjs-builder.md`) with: the spec's acceptance
criteria for these BRs, the contract query output, and which view/page to change. Then
`cd frontend && bunx tsc --noEmit && bun run lint`.

## 6. Review
Run **spec-reviewer** (module + BRs) and **hono-reviewer** / **nextjs-reviewer** in parallel. Fix blockers,
re-run. Minor findings → mention to user.

## 7. Close
- In the spec's "Implementation status" table, mark each BR `done` with the test file.
- Tell the user the manual click-through to do (golden path + one negative path, which role to log in as).
- Suggest a commit message. Suggest `/wrap` if the session is long.
