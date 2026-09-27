# DiecastOS development workflow (solo dev + Claude Code)

## The idea in one paragraph
Bugs in this project mostly come from **business rules nobody wrote down** and **scope that keeps moving**,
not from bad code. So every module goes through the same loop, and Claude is used as a *functional consultant*
first and a coder second. Rules get written once (in specs, CLAUDE.md, decisions), tested by id, and never
have to be re-explained.

```
 /spec ──► SME answers ──► /freeze ──► /slice … /slice ──► scenario test ──► SME walkthrough ──► DONE
   ▲                                     │   │                                                   │
   └──────── spec gap found ◄─── /bug ◄──┘   └── ideas → docs/backlog.md                /wrap ◄──┘
```

## Toolkit
| Command / agent | Use it for |
|---|---|
| `/spec <module>` → `spec-analyst` | Benchmark ERPNext/Odoo/SAP B1, interview you, write `docs/specs/<module>.md` |
| `/freeze <module>` | Completeness check → `status: frozen`; routes change requests to backlog or re-freeze |
| `/slice <module> <BRs>` | One vertical slice: contract → `test-writer` (red) → `hono-builder` (green) → contract regen → `nextjs-builder` → `spec-reviewer` + code reviewers |
| `/bug <desc>` | Repro → map to BR → regression test → fix → log |
| `/wrap` | End of session: corrections/decisions/gotchas/backlog written to the right file |
| `hono-reviewer`, `nextjs-reviewer` | Code/architecture review per package |
| `cavecrew-*` | Cheap locate / 1–2 file edits / quick review |

Launch `claude` from the **repo root** so root `CLAUDE.md`, the workflow agents and skills load. Package
skills load automatically when you work on files under `backend/` or `frontend/`. If a package agent
(e.g. `hono-builder`) isn't listed in a root session, `/slice` falls back to a general agent that follows
the agent file.

---

## Day-to-day routine

### Start of day (10 min)
1. `git pull`; start infra: `cd backend && docker compose up -d`.
2. Open `docs/backlog.md` + current spec's "Implementation status" → pick **one** slice for the session.
3. `claude` at repo root → "Read CLAUDE.md and docs/specs/<module>.md. Next slice: BR-… Use /slice."

### Build block (per slice, 1–3 h)
1. `/slice <module> <BRs>` — approve the plan it shows (plan mode). Read the plan; it's the cheapest place
   to catch a misunderstanding.
2. Let it run tests red → green. Read FAIL-BUG results carefully — those are real bugs in existing code.
3. Manual click-through it proposes: golden path + one negative path, logged in as the right role.
4. Commit (one slice = one commit/branch). `/clear` before the next slice — fresh context beats long context.

### Thinking block (while things run, or 30 min/day)
- Work on the *next* module's spec with `/spec` — this is where you gain functional knowledge.
  Ask it: "What will a stores clerk / purchase manager / accountant expect from this that I haven't thought of?"
- Collect SME questions; send them to the factory in one batch (WhatsApp/printed), not one by one.

### End of day (5 min)
- `/wrap` — accept what should be remembered. This is what stops you repeating preferences.
- Anything you thought of mid-build that isn't in the spec → `docs/backlog.md`.

### Weekly (30–45 min, e.g. Friday)
- Triage backlog: promote, defer or delete.
- Review root/package `CLAUDE.md` size and correctness (fix drift, e.g. `backend/CLAUDE.md` route list).
- Run the full scenario tests + full manual golden path on a fresh DB.
- Two numbers to track: *times you corrected Claude on the same thing* and *bugs found by the factory vs by
  tests*. Both should go down.

### Rules of thumb
- **Two-strikes rule**: corrected the agent twice on the same thing → say "add this to CLAUDE.md" (or `/wrap`).
- One module in build at a time; the next one in spec at the same time is fine.
- Backend and frontend of the same slice in the **same session** (after the contract) — never split them
  across days, that's where drift comes from.
- Use worktrees if you run two agents in parallel; merge only green branches.
- Don't let an agent "also improve" things. Out-of-slice findings → backlog.

---

## How to test the current system (today, before new infra exists)

### A. Bring it up
```bash
cd backend
docker compose up -d                       # Postgres 15, db "diecast", port 5432
cp .env.example .env                       # set DATABASE_URL=postgres://postgres:postgres@localhost:5432/diecast
                                           # and two different ≥32-char secrets (no "replace" in them)
bun install && bun run db:push             # create schema
psql "$DATABASE_URL" -f src/db/seed_page_access.sql   # roles, pages, role→page access
bun run db:seed:approval-policies          # approval policy rules
bun run dev                                # API on :4000

cd ../frontend
# .env: NEXT_PUBLIC_API_URL=http://localhost:4000/api
bun install && bun run dev                 # UI on :3000
```
**First user:** `POST /api/auth/register` requires an existing `super-admin`/`owner`, so on an empty DB insert
the first admin employee manually (password hashed with `Bun.password.hash`). A `bootstrap-admin` script is on
the backlog; ask Claude to write it as your first M0 task.

### B. Automated checks you can run now
```bash
cd backend  && bun run typecheck && bun run lint && bun test   # 2 test files today
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
| M0 | Workflow infra (~1 week) | Items under "Workflow infrastructure" in `docs/backlog.md`: bootstrap-admin, `db:reset` + realistic fixtures, test DB, `createApp()`, commit contract manifest + route check, CI, hooks. Fix the 3 known defects via `/bug`. | CI green; `db:reset && bun test` works from zero |
| M1 | Procurement hardening | Retroactive specs + BR tests for GRN, PR, Approval, PO (section C) | Scenario test green; SME walkthrough OK |
| M2 | Subcontracting | `/spec subcontracting` (schema exists, no routes): SCO, issue material to vendor location, job-work challan, receive back, QA, loss/scrap | Scenario extended to SCO |
| UAT-1 | Procurement at factory (2–3 weeks) | Real users, real data. Switch `db:push` → migrations first (D-004). Log via `/bug` into `docs/uat-log.md`; S1/S2 fixed immediately | Sign-off from purchase + stores |
| M3 | BOM spec (parallel with UAT-1) | `/spec bom` with real part drawings: levels, casting yield (shot weight, runner/overflow %, rejection %), alloy, inserts, consumables, packaging, subcontract ops, revisions | Spec frozen |
| M4 | Sale Order + BOM explosion | `/spec sale-order`, then slices: BOM master → SO → explosion → net requirement vs stock → draft PRs/SCOs through the existing procurement services | Scenario: SO → PRs/SCOs auto-created |
| UAT-2 | Planning at factory | Same as UAT-1 | Sign-off |

### Starting any new module (checklist)
1. `/spec <module>` — include dependencies (`depends_on`) and what existing APIs it reuses.
2. SME questions answered → `/freeze <module>`.
3. Break the spec into slices (ask: "propose slices in build order, each 2–6 BRs, each demo-able").
4. `/slice` each one; `/clear` between slices; `/wrap` at the end of the day.
5. Scenario test for the module's full flow.
6. SME walkthrough → fix → spec "Implementation status" all done → module DONE.

### Scope discipline
- The frozen spec is the scope. New ideas → backlog, reviewed weekly, never mid-slice.
- Change to a frozen spec only if the factory can't work without it; `/freeze` handles the re-freeze and
  lists affected tests.
- UAT feedback that is a *new feature* is backlog, not a bug.
