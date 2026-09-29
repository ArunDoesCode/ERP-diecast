# Decisions log

Append-only. One entry per decision: what, why, what was rejected. Newest at the bottom.
If a decision is reversed, add a new entry that references the old one — don't edit history.

---

### D-001 — Money stored as integer paise
- **Decision:** all monetary columns are integers in paise (`*Paise`).
- **Why:** no float rounding errors in totals/tax; simple comparisons.
- **Rejected:** `numeric` with decimals, JS floats.

### D-002 — REST with verb-style paths, not GraphQL
- **Decision:** Hono REST; route paths are verb-style (`/pr/getprs`, `/po/createpo`) and defined once in
  `backend/src/routes/end-points.ts`; frontend mirrors them in `frontend/src/lib/api/routes.ts`.
- **Why:** existing convention; contract manifest generated from route descriptors.

### D-003 — Custom JWT auth, no Supabase
- **Decision:** `jose` JWT access + refresh tokens; desk users email/password, floor operators QR token.
  RBAC via `requireRole` middleware; allowed pages from `/auth/me` drive the frontend sidebar and `proxy.ts`.
- **Rejected:** Supabase auth / DB RLS (removed earlier).

### D-004 — Schema changes via `drizzle-kit push` during pre-release
- **Decision:** `bun run db:push` while there is no production data.
- **Revisit before UAT-1:** switch to generated migrations once the factory has real data.

### D-005 — Spec-first workflow with frozen specs (2026-09-27)
- **Decision:** every module follows SPEC → FREEZE → CONTRACT → BACKEND+TESTS → FRONTEND → SCENARIO → SME
  CHECK. No feature code without a frozen spec. See `docs/WORKFLOW.md`.
- **Why:** bugs came from unwritten business rules and moving scope; solo dev needs rules written once.

### D-006 — Claude Code only; GitHub Copilot mirrors removed (2026-09-27)
- **Decision:** deleted `backend/.github` and `frontend/.github` (Copilot agents/skills/instructions).
  Workflow agents/skills live in repo-root `.claude/`, implementation agents in package `.claude/`.
- **Why:** three copies of every agent drifted; only Claude Code is used.

### D-007 — Procurement goes to UAT before BOM is built
- **Decision:** order is PR → Approval → PO → GRN → Subcontracting → UAT-1 → BOM spec → Sale Order + BOM
  explosion. BOM explosion reuses the procurement APIs to raise PRs/subcontract orders.
- **Why:** if procurement isn't validated at the factory, BOM bugs and procurement bugs are indistinguishable.

### D-008 — Autonomous agent pipeline after spec freeze (2026-09-27)
- **Decision:** after `/freeze`, the main session (Opus) coordinates `/feature` / `/epic`: Sonnet dev,
  test-writer and 4 reviewer agents, Haiku explorer + test-runner. Hub-and-spoke via
  `.pipeline/<feature>/` files (`.claude/pipeline/PROTOCOL.md`). One branch + worktree + PR per feature;
  large features as `epic/<name>` with sub-feature PRs into it. User involved only for questions, manual UI
  test, merge/comments. PR comments picked up by a local watcher (`/loop 10m /watch-prs`). CI on every PR.
- **Why:** user wants to be involved only at spec and PR; subagents can't spawn subagents, so the coordinator
  must be the main session.
- **Rejected:** GitHub Action (`@claude`) for comments — needs API secret + CI database, costs per run;
  revisit if the laptop-must-be-on constraint becomes a problem. Package `ponytail` orchestrators — as
  subagents they can't spawn the agents they route to; kept only as reference.

### D-009 — Tests are written independently of the code (2026-09-27)
- **Decision:** only `test-writer` writes or changes tests, from the frozen spec, before implementation.
  The coordinator starts it in a fresh context (never a fork) with a pointers-only brief (spec path, BR ids,
  contract path) and adds no context of its own. Developer agents never touch test files; test and code
  changes go in separate `test(…)` vs `feat(…)`/`fix(…)` commits, which `test-runner` checks on every run.
  The PR's manual UI checklist is also written by `test-writer` from the spec. A test changes only when a
  finding quotes the spec rule that shows it is wrong.
- **Why:** if the same agent (or a coordinator that has seen the code) shapes the tests, they encode the
  implementation's assumptions and stop catching its mistakes.
- **Rejected:** letting developers fix "wrong" tests themselves; developer-written manual test scripts.

### D-010 — GRN/stock build choices (2026-09-29, work/m1-stock)
- **Decision:** (1) one posting function `postStock` for every stock change, run in the caller's tx, lock
  order GRN → PO → line → item; (2) ledger row value is `bigint` (a 100 t receipt is > int4 paise);
  (3) stock reconciliation ships as an API only, screen in BL-045; (4) the test-integrity rule means test
  files only in `test(` commits and none in `feat(`/`fix(` — pipeline notes in a `test(` commit are fine.
- **Why:** (1)(2) BR-GRN-22/37/42 need one atomic, ordered path; (3) keep the batch to spec scope;
  (4) that is how PROTOCOL.md rule 5 reads; test-runner flagged it stricter.
