# How project knowledge is organised (and how it scales)

`CLAUDE.md` cannot hold everything — it's loaded into every session, so every line costs context forever.
Knowledge is layered by **how often it's needed**; agents load the smallest layer that answers the question.

| Layer | File(s) | Loaded | Holds | Budget |
|---|---|---|---|---|
| L0 | root `CLAUDE.md` | every session | product, current milestone, the loop, rules that apply everywhere, **pointers** | ≤ 100 lines |
| L1 | `backend/CLAUDE.md`, `frontend/CLAUDE.md` | when working in that package | tech conventions for the package | ≤ 150 lines each |
| L2 | package skills (`pagination-contract`, `data-table`, `ui-form-standards` …) | when the task matches | detailed how-to for one kind of work | one topic each |
| L3 | `docs/modules/<module>.md` (**module map**, as-built) | before touching a module | where the code is, data model, API, flows, module gotchas, tests, history | 60–250 lines |
| L3 | `docs/specs/<module>.md` (spec, should-be) | before building/changing behaviour | states, rules `BR-*`, acceptance criteria | ≤ 400 lines |
| L3 | `docs/specs/<module>/` (**spec folder**, new modules — see below) | owner: `OWNER.md` only; agents: the rest | owner view + agent view of one module | per file, below |
| L3 | `docs/briefs/<feature>.md` | by `/research`, `/spec` | the owner's why, who, outcome, non-goals | ≤ 40 lines |
| L3 | `docs/research/<feature>.md` | by `/spec`, and on a spec gap | what ERPNext / Odoo / SAP / niche tools do, links + dates, adopt / adapt / reject | ≤ 150 lines |
| L4 | `docs/decisions.md`, GitHub Issues (backlog, UAT bugs), `docs/STATUS.md` | when deciding / planning / picking up | why, what's deferred, what's broken, where we are | append-only / tables |
| L5 | `.pipeline/<feature>/` | only by the coordinator of that feature | briefs, reports, findings, questions of one run | per run, archived |
| — | codegraph index (`.codegraph/`) + contract manifest | on demand | exact symbols, call paths, API shapes | generated |

## Spec folder (new modules; existing flat specs are not migrated)
Flow: `/brief` → `/research` → `/spec` → `/freeze`. The owner reads and approves `OWNER.md` only.
| File in `docs/specs/<module>/` | Written by | Holds | Budget |
|---|---|---|---|
| `OWNER.md` | spec-analyst, last | brief, worked example, pictures, max 7 decision cards | ≤ 60 lines + pictures |
| `spec.md` | spec-analyst | status, flow, rules `BR-*`, security, edge-case counts | ≤ 400 lines |
| `design/data.md` | solution-designer | tables, columns, units, indexes, migrations | ≤ 150 lines |
| `design/api.md` | solution-designer | endpoints, payloads, permission keys | ≤ 150 lines |
| `design/screens.md` + `design/screens/*` | ui-ux-designer | per screen: pattern, fields, actions, states; pictures | ≤ 200 lines |
| `design/edge-cases.md` | spec-analyst | case → what the system does → source → rule | one row per case |
| `assumptions.md` | any agent, spec and build | every choice made without the owner, tag `confirm` / `info` | append-only table |

Flat spec: the assumptions file is `docs/specs/<module>.assumptions.md`. Templates: `docs/specs/_template/`,
`docs/briefs/_template.md`, `docs/research/_template.md`.

## Where does a new learning go?
| The learning is about… | Put it in |
|---|---|
| one module (a trap in GRN costing, a PR status quirk) | that module's map → **Invariants & gotchas** |
| a business rule | the spec (via `/spec` / `/freeze` change path) |
| a choice an agent made without the owner | the module's assumptions file |
| how another product does something | `docs/research/<feature>.md` → Follow-ups |
| a convention for all backend (or all frontend) code | package `CLAUDE.md` — or the matching skill if it's detailed |
| a kind of task (lists, forms, endpoints) | the matching skill |
| a decision with a reason | `docs/decisions.md` |
| everything, every session (rare!) | root `CLAUDE.md` |
| your personal working style | Claude memory |

`/wrap` routes learnings using this table. Rule of thumb: **the narrower the scope, the deeper the layer.**

## How agents avoid re-exploring the codebase
1. **Start from the map, not the code.** Every pipeline agent reads `docs/modules/<module>.md` first.
2. **Only look at what changed.** The map records `last_verified_commit`. Explorer runs
   `git diff <sha>..HEAD --stat -- <paths in the map>` and reads only changed files.
3. **Targeted lookups.** For anything else, codegraph (`codegraph_explore` with a symbol name) instead of
   grep sweeps; the contract manifest (`contract:query`) instead of reading routes/controllers.
4. **Maps are updated in the same PR as the code.** `/feature` Phase 4 refreshes the map (new files,
   endpoints, gotchas, history row, new `last_verified_commit`), so the next run starts accurate.
5. **Resuming work** reads `docs/STATUS.md` → `.pipeline/<feature>/state.json` → plan/findings — no
   re-planning.

## When the codebase grows
- **New module** → `/map <module>` creates its map; add a row to `docs/STATUS.md`.
- **Map > 250 lines** → split by sub-area (`docs/modules/grn/qa.md`, `…/costing.md`) with `grn.md` as index.
- **Spec > 400 lines** → split by sub-module (one spec per sub-module, e.g. `grn` + `grn-stock`); build with `/epic`.
  This is the only spec size rule — `spec-analyst` and `/freeze` apply it. Same for `spec.md` in a spec folder.
- **More than 7 owner cards** → the feature is too big: split into two modules (two spec folders).
- **CLAUDE.md over budget** → move detail to a skill or module map, leave a one-line pointer. `/wrap`
  checks budgets.
- **Backlog** lives in GitHub Issues (filter by label); no file to split.
- **`.pipeline/` grows** → merged runs are history; agents only read the current feature's folder. Archive
  older than a milestone into `docs/history/` summaries if the folder gets noisy.
- **Stale maps** → `/map --stale` lists maps whose paths changed since `last_verified_commit` and refreshes
  them (cheap: Haiku explorer, diff-only).
