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
- The spec (`docs/specs/<module>/spec.md` or `docs/specs/<module>.md`) must have `status: frozen`. If not →
  stop, suggest `/spec` / `/freeze`.
- Work on `feature/<module>-<slice>` in its own worktree `.claude/worktrees/<module>-<slice>` (root
  `CLAUDE.md` → Git), never on `main`. Commit; push and open the PR only when the user says so.
- `.claude/pipeline/state.sh init <module>-<slice> <module> feature feature/<module>-<slice> main` — the
  guardrail hooks read the module from it. The run folder `.pipeline/` is local, never committed.
- Enter plan mode and present: BRs in scope, endpoints touched, files expected to change, tests to add.
  Get approval before step 1.

## 1. Contract
For new/changed endpoints, run the backend `api-endpoint-intake` skill (and `pagination-contract` for list
endpoints). Answers come from the spec — only ask the user what the spec doesn't answer (and then add the
answer to the spec).

## 2. Red — tests first
Delegate to **test-writer** (`subagent_type: test-writer`, never a fork) with the **zero-context brief
template** from `.claude/pipeline/PROTOCOL.md`: spec path + version, BR ids, contract path — nothing from
this conversation or your own reading of the spec/code. Commit its tests alone as `test(<module>): …`.
Expect FAIL-EXPECTED for new behaviour. Any FAIL-BUG on existing code is in scope only if it's one of the
slice's BRs; otherwise open a GitHub issue for it. From here on neither you nor the developer agents edit
test files (see PROTOCOL.md → Test independence).

## 3. Green — backend
Delegate to **backend-dev** (`subagent_type: backend-dev`, brief per PROTOCOL.md) with pointers to: the BR
ids, the failing test files, the contract. It follows `backend/.claude/reference/hono-build-conventions.md`
and runs only those test files plus `bun run typecheck && bun run lint`.

## 4. Contract regen
`cd backend && bun run contract:generate`. Then confirm the endpoints with `bun run contract:query "<METHOD /path>"`.

## 5. Frontend
Delegate to **frontend-dev** (`subagent_type: frontend-dev`) with: the spec's acceptance criteria for these
BRs, the contract query output, and which view/page to change. It follows
`frontend/.claude/reference/nextjs-build-conventions.md`. Then
`cd frontend && bunx tsc --noEmit && bun run lint`.

## 6. Review
Run **spec-reviewer** (module + BRs), **code-reviewer** (it reads the review checklist of the changed
package only) and **test-runner** (the one full `bun test`) in parallel. Blockers go back to backend-dev /
frontend-dev (test changes only via test-writer); re-run. Minor findings → mention to user.

## 7. Close
- In the spec's "Implementation status" table, mark each BR `done` with the test file.
- Tell the user the manual click-through to do (golden path + one negative path, which role to log in as).
- Suggest a commit message. Suggest `/wrap` if the session is long.
