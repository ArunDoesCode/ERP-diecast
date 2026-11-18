---
title: Agentic workflow v2 — build plan
status: proposed (waiting for owner decisions D1–D3)
created: 2026-11-18
source: four read-only audits run on 2026-11-18 (agent setup, run history, frontend design, BOM readiness)
---

# Agentic workflow v2 — build plan

Goal: the owner defines **what** and **why**; agents do research, spec drafting, build, review,
visual check and merge preparation, inside guardrails that are enforced by machines, not by prose.
No product feature is built by this plan. BOM explosion is the first customer of the new flow.

## Target flow

```
/brief   → docs/briefs/<feature>.md        owner: why, who, outcome, non-goals (1 page)
/research→ docs/research/<feature>.md      researcher agent: how ERPNext / Odoo / SAP B1 / others do it
/spec    → docs/specs/<module>.md (draft)  spec-analyst: interview + BRs + Screens + Security sections
pre-freeze review                          spec-reviewer + security-auditor + ui-ux-designer on the DRAFT
/freeze  → status: frozen                  owner: last step that needs presence
/feature or /epic                          build → 5 reviewers + test-runner in parallel → fix loop
visual check                               design-reviewer: Playwright screenshots, light + dark, a11y
PR                                         one-page plain summary + screenshots + gate table
merge                                      per decision D3
/wrap                                      lessons → narrowest file; metrics → state.json
```

Owner touch points after v2: brief, interview answers, freeze, read one-page PR summary, merge epic.

## Owner decisions (block the phases marked)

| Id | Decision | Recommended | Blocks |
|---|---|---|---|
| D1 | Git model | `feature/<id>` branch + worktree per pipeline run, small PR each. Drop `work/<theme>` rule. Skills, `settings.json` and real history already follow this | P0 |
| D2 | Second orchestration system (package agents ponytail, cavecrew-*, caveman-* skills, hono-builder / nextjs-builder as agents) | Retire as agents. Keep the convention content of hono-builder / hono-reviewer / nextjs-builder / nextjs-reviewer as reference docs the pipeline agents read. `/slice` uses pipeline agents | P0 |
| D3 | Merge authority | Sub-feature PR → epic branch: GitHub auto-merge when every gate is green. Epic / feature PR → main: owner clicks after the summary + screenshots + manual checklist | P1, P4 |

## Phase 0 — Truth pass (rules agree with code)

No behaviour change. One commit per item. Owner: coordinator or one general-purpose agent.

| # | Change | Files |
|---|---|---|
| 0.1 | Replace `requireRole` with `requirePermission` everywhere it is mandated | `CLAUDE.md` (Domain invariants), `.claude/agents/backend-dev.md`, `.claude/agents/security-auditor.md` |
| 0.2 | Apply D1: one git model in all places; remove the `bl-006-test-db` reference | `CLAUDE.md` Git section, `docs/WORKFLOW.md`, `.claude/skills/feature/SKILL.md`, `.claude/skills/watch-prs/SKILL.md`, `.claude/settings.json` push allow-list |
| 0.3 | One build order (contract → red tests → code) | `docs/WORKFLOW.md:32` to match `feature/SKILL.md` |
| 0.4 | One spec size limit | `docs/KNOWLEDGE.md`, `spec-analyst.md`, `freeze/SKILL.md` (pick: ≤400 lines, split by sub-module above that) |
| 0.5 | Fix stale references: BR grep path `backend/tests`; `createApp()` exists; remove `drizzle-kit push` allow; `frontend/e2e/**` (created in P3) | `spec-reviewer.md`, `test-writer.md`, `settings.json`, `frontend-dev.md` |
| 0.6 | Cut `backend/CLAUDE.md` to ≤150 lines; move product vision to `docs/product/vision.md` | `backend/CLAUDE.md` |
| 0.7 | Apply D2 | `backend/.claude/`, `frontend/.claude/`, `.claude/skills/slice/SKILL.md` |
| 0.8 | Refresh `docs/STATUS.md`; update milestone line in `CLAUDE.md` (M1, M2 done) | `docs/STATUS.md`, `CLAUDE.md` |
| 0.9 | Housekeeping (owner confirms the list first): delete merged local branches, stale dependabot remotes, unused worktrees | git only |

Done when: a grep for `requireRole`, `work/m1`, `bl-006-test-db`, `drizzle-kit push` in `.claude/`, `CLAUDE.md` files and `docs/WORKFLOW.md` returns nothing.

## Phase 1 — Guardrails (machines enforce standards)

| # | Guardrail | How | Replaces |
|---|---|---|---|
| 1.1 | Frozen-spec gate | `PreToolUse` hook on Edit/Write under `backend/src/**`, `frontend/src/**`: read `.pipeline/<run>/state.json` → module → `docs/specs/<module>.md` must have `status: frozen`. Bypass only for `/bug` runs (state flag) | prose in `CLAUDE.md` |
| 1.2 | Test ownership | Same hook: paths `backend/tests/**`, `frontend/e2e/**` writable only when the active agent is `test-writer` (agent name from hook input). CI job: a commit that touches tests and non-tests fails | Haiku after-the-fact check |
| 1.3 | Recurring-defect checks (script `backend/scripts/standards-check.ts`, run in CI and by test-runner) | (a) every FK / filter column in a new migration has an index; (b) no raw `ilike(` outside the shared `safeSearch()` helper; (c) every Zod `z.string()` in route schemas has `.max()`; every quantity has an upper bound; (d) unique / FK violation mapped to 409 in the shared error handler + one test | PERF-1.., SEC-2.., CR-41 findings |
| 1.4 | Frontend standards check (`frontend/scripts/standards-check.ts`) | (a) every `useMutation` calls `invalidateQueries` or carries `// no-invalidate: <reason>`; (b) no raw Tailwind palette classes (`bg-emerald-100` etc.) outside `components/ui` and the status map; (c) no `transition-*` / `animate-*` / `motion.` outside the allow-list in the design skill (P3) | CR-2/3/20/21 findings |
| 1.5 | Security baseline in CI | gitleaks (secret scan), `bun audit` (or osv-scanner), dependabot restored as one grouped weekly PR; authz matrix test: every route in `.contracts/api-manifest.json` has a permission and a 401 + 403 test (generated list, test-writer fills gaps) | manual audit only |
| 1.6 | Frontend CI | add `bun run build`; add Playwright smoke job (P3) | tsc + lint only |
| 1.7 | Date rule | one `istDay()` helper + lint ban on `new Date().toISOString().slice` patterns | issues #63, #82, #83 |

Each check starts in **report mode** for one run, then becomes blocking, so the existing code can be cleaned first (findings become issues, not a hidden refactor).

## Phase 2 — Brief, research, spec upgrades

| # | Change | Files |
|---|---|---|
| 2.1 | `/brief <feature>` skill + template: problem, who, outcome, selling point, non-goals, success measure. Owner-written, agent only asks questions | `.claude/skills/brief/SKILL.md`, `docs/briefs/_template.md` |
| 2.2 | `researcher` agent (sonnet; WebSearch, WebFetch, Read, Grep, Write to `docs/research/` only) + `/research <feature>` skill. Template: question → finding per product (ERPNext, Odoo, SAP B1, plus 1–2 niche foundry / MRP tools) → link + retrieval date → adopt / adapt / reject + reason → open questions for SME | `.claude/agents/researcher.md`, `.claude/skills/research/SKILL.md`, `docs/research/_template.md` |
| 2.3 | spec-analyst reads brief + research; no own web research except follow-ups. `/feature` and `/bug` may call researcher on a BLOCKED spec gap | `spec-analyst.md`, `spec/SKILL.md`, `feature/SKILL.md`, `bug/SKILL.md` |
| 2.4 | Spec template gains: **Screens** (per screen: purpose, pattern, fields, actions, states, permissions), **Security** (permission matrix, sensitive data, abuse cases), **Data** (tables, units, decimals, indexes), **Edge cases from research** | `docs/specs/_template.md`, `freeze/SKILL.md` checklist |
| 2.5 | Pre-freeze review step in `/freeze`: spec-reviewer (BR ↔ AC completeness, cross-spec conflicts), security-auditor (Security section), ui-ux-designer (Screens section) run in parallel on the draft; findings answered before freeze | `freeze/SKILL.md`, the three agent files (add "draft spec mode") |
| 2.6 | Change-request path made cheap: a CR is one spec diff + version bump + list of affected BR tests, batched per run instead of 4–5 commits per finding | `freeze/SKILL.md`, `PROTOCOL.md` |

## Phase 2b — Owner view vs agent view (added 2026-11-18, owner feedback)

Problem stated by the owner: specs and plans are too long, decisions link to other specs, and the
build stops and waits. Principle: **the owner reads decisions and pictures; agents read everything else.**

### Two layers per feature

```
docs/specs/<module>/
  OWNER.md        ← the only file the owner reads and approves (hard limit: 60 lines + pictures)
  spec.md         ← agent layer: BRs, acceptance criteria, state machine (today's spec)
  design/
    data.md       ← tables, columns, units, indexes, migrations
    api.md        ← endpoints, payloads, permissions (source for the contract)
    screens.md    ← per screen: pattern, fields, actions, states
    screens/*.png ← mock screenshots (light), rendered from real components with fake data
    edge-cases.md ← case → what the system does → source (benchmark / owner / invariant)
  assumptions.md  ← every choice an agent made without the owner, appended during spec AND build
```

Existing flat `docs/specs/<module>.md` files stay as they are; the folder layout applies to new
modules (BOM, sale order) and to a module when it gets its next change request.

### OWNER.md — fixed shape

1. **What you asked for** — the brief, 3 lines.
2. **What the user will be able to do** — 5–8 plain lines, one worked example with real numbers
   (for BOM: one part, one order quantity, the resulting PR lines).
3. **Screens** — one mock screenshot per screen, one line under each.
4. **Decisions for you** — max 7 cards. Each card is self-contained:
   question · options A/B · recommendation · what it changes for the factory user · what it costs.
   **No links and no BR ids.** If a card touches another module, the effect is restated in one line
   inside the card ("Purchase requests will accept a request with no human requester").
5. **Decided for you** — count only ("43 edge cases decided by ERP benchmark — list in edge-cases.md").
6. **Not included** — out-of-scope list, 5 lines.

### What reaches the owner, what does not

| Kind of question | Who decides |
|---|---|
| Changes money, stock, tax, or who is allowed to do something | owner card |
| Changes what a factory user sees or must do | owner card |
| Mature ERPs disagree with each other, or die-casting differs from the benchmark | owner card |
| Everything else (validation limits, pagination, error codes, naming, indexes, endpoint shape) | agent, by benchmark + standards, logged in `assumptions.md` |

More than 7 cards = the feature is too big; spec-analyst splits it.

### Who designs schema, endpoints, screens, edge cases

| Artifact | Author | Checked by (before freeze, in parallel) | Owner sees |
|---|---|---|---|
| Business rules | spec-analyst | spec-reviewer | worked example only |
| Schema (`data.md`) | new `solution-designer` agent (sonnet) | performance-auditor (indexes, locks), security-auditor | nothing |
| Endpoints (`api.md`) | solution-designer | security-auditor (permission on every route), code-reviewer (conventions) | nothing |
| Screens | ui-ux-designer | design-reviewer | the mock screenshots |
| Edge cases | researcher (from benchmark) + spec-analyst | spec-reviewer (every case has a rule and a test id) | count, plus the few that became cards |

Mock screenshots: ui-ux-designer builds each screen as a throwaway route under
`frontend/src/app/(mock)/<module>/…` from real shared components with fixture data, screenshots it
with Playwright, then the route is deleted before the build starts (never merged).

`/freeze` = the owner approves OWNER.md. The freeze checklist additionally verifies that the agent
layer is complete and all pre-freeze reviewers passed, so a thin owner file does not mean a thin spec.

### Never-wait build policy (replaces "stop and ask" in `/feature`, `/epic`, PROTOCOL)

| Event during the build | Old behaviour | New behaviour |
|---|---|---|
| Spec gap | BLOCKED, ask owner | researcher → follow benchmark → log in `assumptions.md` with tag `confirm` → continue |
| Check / CI / env failure | stop | matching runbook; second failure of the same kind → park |
| Same finding survives 2 fixes, or 3 loop rounds | stop and ask | **park** the slice: revert it to last green, open a GitHub issue with the evidence, continue with the other slices |
| Push / open PR | ask owner | automatic to `feature/*` or `epic/*`; never to `main` |
| Hard stops (the only ones) | — | destructive or irreversible action; a guardrail hook denies; a domain invariant (money, stock ledger, audit) would be broken; a needed secret or access is missing |

End of run = one hand-over, written to the PR body and `.pipeline/<run>/HANDOVER.md` (≤40 lines):
built · parked (with issue links) · assumptions tagged `confirm` (answer yes/no each) ·
**Try it**: one command that starts backend + frontend on the branch with seeded demo data, and a
5–10 line click list. The owner tries it locally, answers the `confirm` items, merges.
A "no" on an assumption becomes a normal change request, not a re-run of the whole feature.

Permissions for unattended runs: project `settings.json` allow-list covers every command the pipeline
uses (bun, docker compose, gh pr create/view, git on `feature/*` + `epic/*`); deny-list keeps
`git push` to main, `gh pr merge`, `db:reset` against any DB except `diecast_test`, and `rm -rf`
outside the worktree. The run uses the worktree, so a bad run costs one branch.

### Run driver

See "Run driver" under Phase 4: `/goal` drives the build, `/loop` only polls PRs.

## Phase 3 — Design system, motion, visual verification

Gate: write and freeze a short `docs/specs/design-system.md` first (this is frontend feature code).
Keep shadcn (radix-mira). Add colour and controlled motion; no new component library.

| # | Change | Detail |
|---|---|---|
| 3.1 | Colour tokens in `frontend/src/app/globals.css` (light + dark) | `--success`, `--warning`, `--info`, `--neutral` each with `-foreground` and `-subtle`; an accent hue next to emerald; `--chart-1..5` with five distinct hues; sidebar active tint from primary; load the mono font that the token names |
| 3.2 | Status map | one `StatusBadge` + `lib/status-tone.ts` (status → tone) for PR, PO, GRN, SCO; delete the four per-module badge files; same status = same colour everywhere, dark mode correct |
| 3.3 | Motion tokens | `--motion-fast: 120ms`, `--motion-base: 180ms`, `--motion-slow: 260ms`, one ease-out curve; `prefers-reduced-motion` turns all off. **Allow-list (the only places motion may exist):** dialog / sheet / popover enter-exit, toast, sidebar collapse, table row hover, button press, skeleton shimmer, status change highlight (one 600 ms flash), number count-up on dashboard cards. **Never:** page transitions, bounce / spring, looping, scroll-triggered, decorative. Check 1.4(c) enforces it; a new entry in the allow-list is an owner decision in `docs/decisions.md` |
| 3.4 | Shared components | `PageHeader`, `EmptyState`, `ErrorState`, `FilterBar`, `StatCard`, `DetailHeader`, `DocumentFlow` (PR→PO→GRN chain), one pagination, one `format.ts` (date, money). Adopt view by view |
| 3.5 | Shell | top bar (breadcrumbs, global search stub, user menu), sidebar icons + brand, type scale for titles, touch density mode for shop-floor routes |
| 3.6 | `design-system` skill | tokens, status map, component catalogue, four screen patterns (list, detail, form, dashboard), motion allow-list, do / do-not with screenshots. frontend-dev must load it |
| 3.7 | `ui-ux-designer` agent (sonnet) | writes the Screens section at spec time; picks patterns from the skill; never invents tokens |
| 3.8 | `design-reviewer` agent (sonnet, Playwright) | fifth reviewer: starts the app on the test DB, screenshots every changed screen in light + dark at desktop + tablet, runs axe, compares with the skill, saves to `.pipeline/<run>/screens/`, attaches to PR |
| 3.9 | Playwright smoke | `frontend/e2e/`: login + one happy path per module; written by test-writer |

## Phase 4 — Pipeline efficiency and metrics

| # | Change | Expected effect |
|---|---|---|
| 4.1 | `state.json` schema: phase timestamps, per-agent duration + token count, fix-loop rounds, finding counts by class; written by the coordinator at each phase change; `/status` prints a small table | cycle time becomes measurable |
| 4.2 | `.pipeline/` out of git except one `summary.md` per run | removes about 65 of 72 chore commits per run |
| 4.3 | test-runner in parallel with reviewers; dev agents run only the tests of their slice; spec-reviewer does not run tests | `bun test` once per loop, not three times |
| 4.4 | `/watch-prs` cheap pre-check (shell `gh pr list` compare with last state) before any model call; model = haiku for the pass, opus only on resume | removes an Opus call every 10 minutes |
| 4.5 | test-writer gets `backend/tests/README.md`: fixture catalogue, helper defaults, response-shape source (`contract:query`), ordering rule | cuts the one-third of test commits that repair tests |
| 4.6 | Context diet: code-reviewer reads only the changed package's reviewer doc; briefs carry pointers, not pasted text; agent files ≤60 lines, detail in skills | lower tokens per agent call |
| 4.7 | PR body template: one-page plain summary (what changed, why, which BRs, risks, how to try it), gate table, screenshots | owner understands every merge in two minutes |
| 4.8 | STATUS / backlog updates once per run in the docs commit, not per step | less docs churn |
| 4.9 | Apply D3 in `settings.json`, `feature/SKILL.md`, `epic/SKILL.md`, branch protection | no idle wait on sub-feature merges |

### Run driver (checked against Claude Code docs, 2026-11-18)

| Tool | What it is | Use here |
|---|---|---|
| `/goal <condition>` | After every turn a small model reads the conversation and decides: not met → another turn; met / impossible → stop. No built-in turn cap. It cannot run commands, it only reads what the coordinator printed | **Drives the build** after freeze |
| `/loop` | Repeats a prompt on an interval or self-paced. Made for polling | Only `/loop 10m /watch-prs` |
| Workflow tool | Script that fans out many subagents in the background | Optional later for `/epic` sub-features in parallel |
| Stop hook | Script after every turn | Backup: refuse to stop while `state.json` phase ≠ `handover` |

4.10 — `/feature` and `/epic` end every turn by printing the gate table from `state.json`
(typecheck, lint, tests, contract, standards-check, 5 reviewers, screenshots, PR url, parked count),
because the `/goal` judge sees only the conversation.

4.11 — `/build <module>` wrapper skill: verifies freeze, then tells the owner the one line to run:

```
/goal The /feature <module> run has reached phase "handover": every gate in the printed gate table is green or the slice is listed as parked with an issue link, a PR is open, and HANDOVER.md is written. Or stop after 40 turns.
```

followed by `/feature <module>`. Whether `/goal` can wrap a skill call in one line is **not
documented**; the two-step form above does not depend on it. Verify in the P6 pilot.

4.12 — Unattended permissions (the owner sets these; agents never edit permission settings):
`permissions.defaultMode: "auto"` in the **user** `~/.claude/settings.json` (project settings ignore
`auto`), project allow / deny lists as in Phase 2b, sandbox on for Bash. Run in a background session
or the desktop app so a closed terminal does not end it.

## Phase 5 — Runbooks

`docs/runbooks/` — one page each, same shape (symptom → check → fix → when to stop and ask):
fix loop does not end · CI red · test DB reset (must target `diecast_test`) · spec gap found mid-build ·
worktree / branch cleanup · contract manifest stale · agent blocked by permission · resume after crash.
Skills link to the runbook at the point of failure instead of repeating the text.

## Phase 6 — Pilot before BOM

Run the whole v2 flow on one small real feature: **landing dashboard** (pending approvals, open POs,
GRNs awaiting QA). It uses every new part (brief, research, Screens section, tokens, StatCard, motion,
design-reviewer) and has low domain risk. Compare `state.json` metrics with the M1 / M2 baselines:
commits per feature, bookkeeping share (baseline 47%), test-repair share (baseline 33%), spec changes
after freeze (baseline 31), fix-loop rounds (baseline 3 and 2). Adjust, then start `/brief bom-explosion`.

## Build order and delegation

| Step | Phases | Who | Parallel |
|---|---|---|---|
| 1 | P0 | one general-purpose agent, coordinator reviews diff | — |
| 2 | P1 hooks + checks (report mode) · P2 skills / agents / templates · P5 runbooks | three agents, disjoint files | yes |
| 3 | P3 spec → freeze (owner) → tokens + components via frontend-dev; design agents + skill | sequential inside P3 | P4 in parallel |
| 4 | P1 checks switched to blocking after clean-up issues are closed | coordinator | — |
| 5 | P6 pilot | normal `/feature` | — |

Rules for the build itself: one commit per numbered item; no product behaviour change outside P3;
tests only by test-writer; nothing is pushed until the owner asks.

## Baseline (2026-11-18)

M1 plan→merge 4 h 40 min; subcontracting 1 h 26 min; 186 agent runs over three pipelines; 0 human
reviews on 34 PRs; 51 open issues (0 P1); 5 worktrees and 20 local branches; frontend has no tests,
no build in CI, no visual check; BOM and sale order have no spec, tables or code.
