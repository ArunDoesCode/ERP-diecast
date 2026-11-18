# DiecastOS development workflow (solo dev + Claude Code)

## The idea in one paragraph
Bugs in this project mostly come from **business rules nobody wrote down** and **scope that keeps moving**,
not from bad code. So every module goes through the same loop. You say **what** and **why**; agents do the
research, the spec detail, the build, the reviews and the hand-over. You read decisions and pictures, not
long documents. Intent and open items of this flow: `docs/plans/agentic-workflow-v2.md`.

```
 YOU ─────────────────────────────────────┐ AGENTS (no waiting) ─────────────────────────┐ YOU ───────────
 /brief → /research → /spec → answer cards │ /build → /goal + /feature (or /epic):        │ read hand-over
            → /freeze (approve OWNER.md) ─►│ plan → build → review loop → park → hand-over│─► try it → answer
                                           └──────────────────────────────────────────────┘   confirm → merge
   PR comment or "no" on a confirm line ──► /watch-prs ──► /feature --resume ──► back to you
```

## Who does what
| Stage | Who | Command | Output |
|---|---|---|---|
| Brief: why, who, outcome, not included | **you** (the skill only asks) | `/brief <feature>` | `docs/briefs/<feature>.md` |
| Research: what ERPNext / Odoo / SAP B1 do | researcher | `/research <feature>` | `docs/research/<feature>.md` |
| Spec: rules, data, API, screens, edge cases | spec-analyst, solution-designer, ui-ux-designer; **you** answer the interview | `/spec <module>` | `docs/specs/<module>/` |
| Pre-freeze review, then your approval of `OWNER.md` | 5 reviewers, then **you** | `/freeze <module>` | `status: frozen` |
| Start the build | **you** paste two lines | `/build <module>` | `/goal …` + `/feature` or `/epic` |
| Plan, build, review loop, park, PR, hand-over | Opus coordinator + agents, unattended | `/feature`, `/epic` | PR with hand-over |
| Try it, answer the `confirm` lines, merge or comment | **you** on GitHub | — | — |
| Pick up comments and merges | watcher | `/loop 10m /watch-prs` | — |
| End of session | **you** | `/wrap` | lessons in the right file |

What you read: the brief you wrote, `OWNER.md` (≤ 60 lines + pictures, max 7 decision cards), and the
hand-over (≤ 40 lines: built · parked · confirm yes/no · try it). Everything else is for agents.

## Where the rules live (one copy each — this file only points)
| Rule | File |
|---|---|
| Spec steps, who writes which file | `.claude/skills/spec/SKILL.md`; file list and budgets: `docs/KNOWLEDGE.md` → Spec folder |
| What becomes an owner card, what an agent decides | `.claude/agents/spec-analyst.md` → "What reaches the owner" |
| Pre-freeze review, checklist, change requests | `.claude/skills/freeze/SKILL.md` |
| Build phases | `.claude/skills/feature/SKILL.md`, `.claude/skills/epic/SKILL.md` |
| Never-wait policy, hard stops, run state, briefs, test independence, loop limit | `.claude/pipeline/PROTOCOL.md` |
| What to do when something fails | `docs/runbooks/README.md` |
| Git model, checks, domain invariants | root `CLAUDE.md` |
| Hand-over and PR shape | `.claude/pipeline/templates/` |

Things worth knowing without opening those files:
- **Never-wait.** After `/freeze` the build does not stop to ask. A spec gap is settled by benchmark and
  logged as an assumption; a slice that will not go green is parked with an issue; the rest ships.
- **Run folder.** `.pipeline/<id>/` is local to the run's worktree and git-ignored. Only `summary.md` (the
  run record) is committed. `/status` shows a metrics table; `docs/metrics/runs.md` keeps one row per run.
- **Tests are independent of the code.** Only test-writer writes tests, from the spec, before the code.
- **Merging.** Sub-feature PR → epic branch: the pipeline merges when every gate is green. Anything → `main`: you.
- **Epic split.** The coordinator chooses the split (it is build order, not behaviour). You see it in the
  epic hand-over, one line per sub-feature.

### Agents and models
| When | Agents | Model |
|---|---|---|
| Spec | spec-analyst | opus |
| Spec | researcher, solution-designer, ui-ux-designer | sonnet |
| Build | coordinator (main session) | opus |
| Build | backend-dev, frontend-dev, test-writer, code-reviewer, security-auditor, performance-auditor, spec-reviewer, design-reviewer | sonnet |
| Build | explorer, test-runner | haiku |

Change a model by editing `model:` in `.claude/agents/<name>.md`. Use the family alias (`opus` / `sonnet` /
`haiku`), not a dated id. design-reviewer is active only once the design system exists (rule:
`.claude/pipeline/PROTOCOL.md` → Efficiency); until then its gates show `skipped`.

### One-time setup
1. `brew install gh jq && gh auth login` (the pipeline uses `gh`; the hooks and `state.sh` need `jq`).
2. GitHub → Settings → Branches → protect `main`: require PR + CI (`backend`, `frontend` jobs) to pass.
3. Permissions: `.claude/settings.json` (committed) holds the allow / deny lists and hooks. Only you edit
   it; agents never do. For unattended runs also set `permissions.defaultMode: "auto"` in your **user**
   `~/.claude/settings.json` and run the build in a background session or the desktop app.

### Documentation & picking up work
- **Pick up:** `/status` (or open `docs/STATUS.md`) — what's waiting on you, active runs, next action.
- **Specs** say what should happen; **module maps** (`docs/modules/`) say what the code does and where;
  **GitHub Issues** hold everything deferred. All are updated in the same PR as the code.
- How knowledge is layered and how it scales: `docs/KNOWLEDGE.md`.

---

## Day-to-day routine

### Merging (GitHub settings, since 2026-09-30)
- `main` is protected: a PR can merge only when the `backend` and `frontend` CI checks pass (admins can bypass; no review required).
- Auto-merge is on: press **Enable auto-merge** on a PR after your manual test — it merges itself when CI is green. Merged branches are deleted automatically.

### Morning (10 min)
1. `/status`, then GitHub: PRs labelled `agent-pipeline` waiting for you → read the hand-over at the top,
   try it, answer the `confirm` lines (yes / no), merge or comment.
2. `claude` at repo root → `/loop 10m /watch-prs` in one session (it picks up your comments and merges).
3. In another session (`claude --model opus`): `/brief` or `/spec` the **next** module, or `/freeze` one whose
   cards you answered → `/build <module>` → paste its two lines and let it run.

### During the day
- The build does not ask you anything. It stops only on a hard stop (it prints `HARD STOP:` and why).
- Try ready PRs: `cd .claude/worktrees/<id>` → the "Try it" block of the hand-over → follow its click list.
  Comment precisely: "Step 4: expected X, got Y" — the watcher turns each comment into a finding.
- Anything new you think of → a GitHub issue ("Change request or idea" form), not a PR comment (comments = bugs/spec mismatches).

### End of day (5 min)
- `/wrap` in the sessions you interacted with (captures preferences so you stop repeating them).
- Stop the watcher loop.

### Weekly (30–45 min)
- Backlog triage; read the "Lessons" of merged runs (`.pipeline/<id>/summary.md`) for recurring issues →
  add a rule to a standards check, a skill or a reviewer agent so it is caught earlier next time.
- Track with `docs/metrics/runs.md`: fix rounds, parked slices, `confirm` counts, bugs found by you vs by agents.

### Rules of thumb
- **Two-strikes rule**: corrected the same thing twice → it goes into CLAUDE.md or an agent file.
- The better the brief and the card answers, the fewer `confirm` lines and parked slices at hand-over.
- A parked slice is almost always a spec gap — answer the question in its issue, then `/feature <module> --resume`.

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
bun run seed                               # optional: subcontracting demo data (vendor, stock, 5 SCOs), after db:reset
bun run db:test:prepare                    # wipes + rebuilds the test DB (= db:reset --no-fixtures; needs SEED_USER_PASSWORD; re-run after container restart)
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
cd frontend && bunx tsc --noEmit && bun run lint
```

### C. Retroactive testing of an existing module (how M1 was done; flat specs)
For code that exists without a spec, "testing" = writing down what it should do, then checking:
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

### Milestones (live state: `docs/STATUS.md`)
| # | Milestone | State | Exit gate |
|---|---|---|---|
| M0 | Workflow infra | done | CI green; `db:reset && bun test` works from zero |
| M1 | Procurement hardening (specs + BR tests for PR, Approval, PO, GRN) | **merged** | Scenario test green |
| M2 | Subcontracting | **merged** | Scenario extended to SCO |
| W2 | Workflow v2 (`docs/plans/agentic-workflow-v2.md`), then its pilot on a small feature | in progress | Pilot run compared with the baseline in `docs/metrics/runs.md` |
| UAT-1 | Procurement at factory (2–3 weeks): real users, real data; log via `/bug` into `docs/uat-log.md`; S1/S2 fixed at once | not started | Sign-off from purchase + stores |
| M3 | BOM: `/brief bom-explosion` → `/research` → `/spec bom` (levels, casting yield, alloy, inserts, subcontract ops, revisions) | not started | Spec frozen |
| M4 | Sale Order + BOM explosion (SO → explosion → net requirement vs stock → draft PRs/SCOs) | not started | Scenario: SO → PRs/SCOs auto-created |
| UAT-2 | Planning at factory | not started | Sign-off |

### Starting any new module (checklist)
1. `/brief <feature>` → `/research <feature>` → `/spec <module>` (new modules get a spec folder).
2. Answer the cards in `OWNER.md` → `/freeze <module>`.
3. `/build <module>` — it picks `/feature` (≤ 15 rules) or `/epic` (more) and prints the two lines to run.
4. Keep `/loop 10m /watch-prs` running; try each PR; answer its `confirm` lines; merge or comment.
5. Epic: the scenario test for the full flow must be green before the epic PR into `main`.
6. SME walkthrough → fix via PR comments → all rules built, nothing parked → module DONE.
Prefer `/slice` (manual, you in the loop) only for small experiments or when you want to learn the code.

### Scope discipline
- The frozen spec is the scope. New ideas → backlog, reviewed weekly, never mid-slice.
- Change to a frozen spec only if the factory can't work without it; `/freeze` handles the re-freeze and
  lists affected tests.
- UAT feedback that is a *new feature* is backlog, not a bug.
