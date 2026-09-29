# DiecastOS development workflow (solo dev + Claude Code)

## The idea in one paragraph
Bugs in this project mostly come from **business rules nobody wrote down** and **scope that keeps moving**,
not from bad code. So every module goes through the same loop, and Claude is used as a *functional consultant*
first and a coder second. Rules get written once (in specs, CLAUDE.md, decisions), tested by id, and never
have to be re-explained.

```
 YOU ──────────────────────────────┐ AGENTS (autonomous) ───────────────────────┐ YOU ───────────────┐
 /spec ─► SME answers ─► /freeze ──►│ /feature: plan → build → audit → test → fix │─► PR: UI test ─► merge
   ▲                                │           ▲______________ loop ___________│      │
   │                                └─────────────────────────────────────────────┘      ▼
   └──────── spec gap found ◄── coordinator question ◄── /watch-prs ◄──────────── PR comment
```

## Who does what
| Stage | Who | Command |
|---|---|---|
| Spec: interview, rules, SME questions | **you** + spec-analyst (Opus) | `/spec <module>` |
| Freeze = hand-off | **you** | `/freeze <module>` |
| Plan, branch, build, audit, test, fix loop, PR | Opus coordinator + Sonnet/Haiku agents | `/feature <module>` or `/epic <module>` |
| Questions the spec can't answer | coordinator asks **you** | (AskUserQuestion / PR comment) |
| Manual UI test, review, merge or comment | **you** on GitHub | — |
| Pick up comments/merges, re-run loop | coordinator | `/loop 10m /watch-prs` |

## The autonomous pipeline
```
 /freeze ─► /feature <module>        (main session = Opus coordinator)
   0 preflight: spec frozen? worktree feature/<id> off base, docker up, baseline test-runner
   1 plan:      explorer(haiku) → plan.md (slices) → questions to you only if spec can't answer
   2 build:     per slice: test-writer (red) → backend-dev contract → backend-dev ∥ frontend-dev (sonnet)
   3 verify:  ┌► code-reviewer ∥ security-auditor ∥ performance-auditor ∥ spec-reviewer   (sonnet)
              │  coordinator triages → fixes routed to backend-dev / frontend-dev / test-writer
              │  test-runner (haiku): typecheck, lint, tests, contract check vs baseline
              └─ any blocker/new failure → loop (max 3, then asks you)
   4 PR:        push → gh pr create (BR coverage, audit summary, manual UI test script) → CI green
 you: manual UI test ─► merge  ─► /watch-prs: cleanup, next epic sub-feature
                    └─► comment ─► /watch-prs → /feature --resume --from-pr → phase 3 again → reply 🤖 on PR
```

### How the agents communicate
- **Hub and spoke.** Subagents can't spawn subagents or message each other, so the coordinator (your main
  session) spawns every agent, gives it a **brief** file, and gets back a short status block + a **report**
  file. Full rules: `.claude/pipeline/PROTOCOL.md`.
- **Shared state** lives in `.pipeline/<feature>/` on the feature branch: `state.json`, `plan.md`,
  `contract.md`, `briefs/`, `reports/`, `findings.md`, `questions.md`. It's committed, so a new session (or
  `/watch-prs` tomorrow) resumes exactly where it left off, and you can read the whole history in the PR.
- **Backend → frontend** hand-off is the API contract only (`contract.md` + generated manifest). That's
  what lets backend-dev and frontend-dev run in parallel without drift.
- **Questions:** an agent that needs a decision returns `BLOCKED` with options; the coordinator answers from
  the spec/decisions if it can, otherwise asks you, then records the answer in the spec changelog.
- **File ownership** (backend-dev → `backend/**`, frontend-dev → `frontend/**`, test-writer → tests)
  prevents parallel agents from editing the same files.
- **Tests are independent of the code.** test-writer writes tests from the spec *before* the code, in a
  fresh context, with a brief that contains only file paths and rule ids — the coordinator adds nothing of
  its own. Developers can't edit tests; if they think one is wrong they must quote the spec. Test and code
  changes go in separate commits and `test-runner` blocks the PR if that's broken. Your manual checklist in
  the PR is written by test-writer too, from the spec.

### Models
| Agent | Model | Why |
|---|---|---|
| coordinator (main session), spec-analyst | Opus | judgement: triage, routing, domain reasoning |
| backend-dev, frontend-dev, test-writer, code-reviewer, security-auditor, performance-auditor, spec-reviewer | Sonnet | strong coding/review at lower cost |
| explorer, test-runner | Haiku | search and command running — cheap and fast |

Change a model by editing `model:` in `.claude/agents/<name>.md`. Use the family alias (`opus` / `sonnet` /
`haiku`), not a dated id — the alias picks up new releases (e.g. a new Sonnet) with no edit.

### Really large features (`/epic`)
Spec → coordinator splits it into ordered sub-features (5–15 BRs each, e.g. `bom-master` →
`bom-explosion-engine` → `sale-order` → `so-explosion-to-pr`), you approve the split once, then:
`epic/<name>` branch ← one `feature/<name>--<sub>` branch + PR per sub-feature (full pipeline each). The
end-to-end scenario test is written first and turns green as sub-features land. Final epic PR into `main`
gets a full re-audit.

### One-time setup
1. `brew install gh && gh auth login` (the pipeline creates PRs and reads comments with `gh`).
2. GitHub → Settings → Branches → protect `main`: require PR + CI (`backend`, `frontend` jobs) to pass.
3. Permissions: `.claude/settings.json` (committed) allows the git/gh/bun/docker commands the pipeline needs
   and **denies** force-push, pushing to `main`, `gh pr merge` (merging is yours), hard reset, `rm -rf` and
   reading `.env`. Add more with `/fewer-permission-prompts` after a first run.

### Documentation & picking up work
- **Pick up:** `/status` (or open `docs/STATUS.md`) — what's waiting on you, active pipelines, next action.
- **Specs** (`docs/specs/`) say what should happen; **module maps** (`docs/modules/`) say what the code does
  and where; **GitHub Issues** hold everything deferred (labels `P1–P3`, type, `mod:<module>`). All three are updated in
  the same PR as the code, so `main` is always documented.
- Agents read the map and only explore code changed since its `last_verified_commit` — no full re-exploration.
- How knowledge is layered and how it scales as the codebase grows: `docs/KNOWLEDGE.md`.
4. Fix the known defects (open issues labelled `defect`) first (a good first `/feature` run), otherwise CI starts red.

---

## Day-to-day routine

### Morning (10 min)
1. Check GitHub: PRs labelled `agent-pipeline` waiting for you → manual UI test (script is in the PR body).
   Merge, or leave review comments.
2. `claude --model opus` at repo root → `/loop 10m /watch-prs` in one session (it picks up your comments).
3. In another session: `/spec` the **next** module (your thinking time with spec-analyst), or `/freeze`
   one whose SME answers came back → then `/feature <module>` and let it run.

### During the day
- Answer coordinator questions when they come (it only asks what the spec can't answer).
- Manual test ready PRs: `cd .claude/worktrees/<id>` → run backend + frontend → follow the checklist.
  Comment precisely: "Step 4: expected X, got Y" — the watcher turns each comment into a finding.
- Anything new you think of → a GitHub issue ("Change request or idea" form), not a PR comment (comments = bugs/spec mismatches).

### End of day (5 min)
- `/wrap` in the sessions you interacted with (captures preferences so you stop repeating them).
- Stop the watcher loop.

### Weekly (30–45 min)
- Backlog triage; check `findings.md` of merged features for recurring issues → add rules to CLAUDE.md
  or reviewer agents so they're caught earlier next time.
- Track: repeated corrections, pipeline loops that hit the limit, bugs found by you vs by agents.

### Rules of thumb
- **Two-strikes rule**: corrected the same thing twice → it goes into CLAUDE.md or an agent file.
- The better the spec, the less the pipeline asks you. Spend time on `/spec`, not on reviewing code.
- If the coordinator stops at the loop limit, the cause is almost always a spec gap — fix the spec.

---

## How to test the current system (today, before new infra exists)

### A. Bring it up
```bash
cd backend
docker compose up -d                       # dev Postgres :5432 "diecast" + test Postgres :5433 "diecast_test" (in-memory)
cp .env.example .env                       # set DATABASE_URL=postgres://postgres:postgres@localhost:5432/diecast
                                           # (DATABASE_URL_TEST is prefilled) and two different ≥32-char secrets (no "replace")
bun install
SEED_USER_PASSWORD='choose-8+chars' bun run db:reset   # wipes the dev DB (public schema), schema + roles + permissions
                                           # + admin@diecast.local + approval policies + demo data (PRs, POs, GRNs)
                                           # add --no-fixtures for an empty system (admin only); local hosts only
bun run db:test:prepare                    # schema + seed into the test DB (re-run after container restart)
bun run dev                                # API on :4000

cd ../frontend
# .env: NEXT_PUBLIC_API_URL=http://localhost:4000/api
bun install && bun run dev                 # UI on :3000
```
**Logins after `db:reset`:** `admin@diecast.local` (super-admin) and `owner@`, `back_office@`, `floor_supervisor@`,
`qa_inspector@`, `die_designer@diecast.local` — all with the `SEED_USER_PASSWORD` you gave. `db:reset` never runs
with `NODE_ENV=production` and refuses non-local hosts unless `--allow-remote` and `DB_RESET_CONFIRM=<db name>`.
For a real first admin without demo data use `bun run bootstrap-admin` (`BOOTSTRAP_ADMIN_NAME/_EMAIL/_PASSWORD`,
min 8). Exit 2 = already bootstrapped, 3 = roles not seeded (run `db:reset --no-fixtures`).

### B. Automated checks you can run now
```bash
cd backend  && bun run typecheck && bun run lint && bun test   # runs against diecast_test only (BL-006)
cd frontend && bunx tsc --noEmit && bun run lint               # expect 8 tsc + ~58 lint errors (backlog)
```

### C. Retroactive testing of existing modules (this *is* milestone M1)
The procurement code exists but has no spec, so "testing" = writing down what it should do, then checking:
1. `/spec grn` (start with GRN — most rules: partial receipt, QA reject, stock + avg cost). Tell it the code
   exists so it writes the spec retroactively and lists suspected gaps.
2. Get SME answers → `/freeze grn`.
3. Ask: "Use test-writer to cover all BR-GRN rules against the existing code." You'll get PASS /
   FAIL-BUG per rule — that list is your real bug list for GRN.
4. Fix FAIL-BUGs with `/bug` (or `/slice` for missing behaviour).
5. Repeat for purchase-requisition, approval, purchase-order.
6. Write one **scenario test**: PR → multi-level approval → PO → send/confirm → partial GRN → QA reject part
   → stock ledger & avg cost correct. This scenario is your UAT rehearsal.

### D. Manual golden path (after each module, and weekly)
Log in as each role and walk: create PR → approve (each level) → create PO from PR → confirm → GRN partial →
QA accept/reject lines → check inventory movements + item stock. Note anything surprising → `/bug` or backlog.

---

## How to proceed with new development

### Milestones
| # | Milestone | What you do | Exit gate |
|---|---|---|---|
| M0 | Workflow infra (~1 week) | Items under "Workflow infrastructure" (issues labelled `infra`): bootstrap-admin, `db:reset` + realistic fixtures, test DB, `createApp()`, commit contract manifest + route check, CI, hooks. Fix the 3 known defects via `/bug`. | CI green; `db:reset && bun test` works from zero |
| M1 | Procurement hardening | Retroactive specs + BR tests for GRN, PR, Approval, PO (section C) | Scenario test green; SME walkthrough OK |
| M2 | Subcontracting | `/spec subcontracting` (schema exists, no routes): SCO, issue material to vendor location, job-work challan, receive back, QA, loss/scrap | Scenario extended to SCO |
| UAT-1 | Procurement at factory (2–3 weeks) | Real users, real data. Switch `db:push` → migrations first (D-004). Log via `/bug` into `docs/uat-log.md`; S1/S2 fixed immediately | Sign-off from purchase + stores |
| M3 | BOM spec (parallel with UAT-1) | `/spec bom` with real part drawings: levels, casting yield (shot weight, runner/overflow %, rejection %), alloy, inserts, consumables, packaging, subcontract ops, revisions | Spec frozen |
| M4 | Sale Order + BOM explosion | `/spec sale-order`, then slices: BOM master → SO → explosion → net requirement vs stock → draft PRs/SCOs through the existing procurement services | Scenario: SO → PRs/SCOs auto-created |
| UAT-2 | Planning at factory | Same as UAT-1 | Sign-off |

### Starting any new module (checklist)
1. `/spec <module>` — include dependencies (`depends_on`) and what existing APIs it reuses.
2. SME questions answered → `/freeze <module>`.
3. ≤15 BRs → `/feature <module>`; bigger → `/epic <module>` (approve the split once).
4. Keep `/loop 10m /watch-prs` running; answer questions; manual-test each PR; merge or comment.
5. Epic: the scenario test for the full flow must be green before the epic PR into `main`.
6. SME walkthrough → fix via PR comments → spec "Implementation status" all done → module DONE.
Prefer `/slice` (manual, you in the loop) only for small experiments or when you want to learn the code.

### Scope discipline
- The frozen spec is the scope. New ideas → backlog, reviewed weekly, never mid-slice.
- Change to a frozen spec only if the factory can't work without it; `/freeze` handles the re-freeze and
  lists affected tests.
- UAT feedback that is a *new feature* is backlog, not a bug.
