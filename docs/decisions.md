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

### D-011 — Main store can't be deactivated (2026-09-29, work/m1-stock)
- **Decision:** deactivating the only active `main_store` → 409. Asked and answered by Arun during the inventory
  build; spec line added at the next spec change (BL-048).
- **Why:** GRN always posts to the main store (BR-INV-13) and an inactive location takes no postings
  (BR-INV-15), so deactivating it would stop every receipt.

### D-012 — Permission keys replace role lists (2026-09-29, work/m1; replaces the RBAC part of D-003)
- **Decision:** every route declares one permission key (`requirePermission(key)`) or "any signed-in user";
  services check `can(actor, key)`. Roles are rows in `roles` with grants in `role_permissions`, edited in
  Setup. The key catalog and screens live in code (`lib/permissions.ts`) and sync to the DB on start. Role
  names appear only in seed data (CI scan, BR-AUTH-11). Token = user id + name; role, active flag and keys
  are read from the DB per request (short cache). Super-admin passes every key. S7 removed `pages`,
  `role_pages`, the `Role` union and `requireRole`; `/auth/me` returns `isSuperAdmin` for UI checks.
- **Why:** role lists in code drifted across backend and frontend; the factory needs to change who can do
  what without a deploy.
- **Rejected:** keeping `requireRole` lists next to keys; page-based access (`role_pages`).

### D-013 — One working branch per batch (2026-09-29)
- **Decision:** work happens on one local branch `work/<theme>` in one worktree; every item is its own
  commit; one PR per batch when the user asks. A second branch only for a truly parallel session or an epic.
  Adjusts D-008 ("one branch + PR per feature").
- **Why:** fewer branches, worktrees and PRs to track for a solo developer (set in CLAUDE.md Git, 938ef40;
  no longer reason was written down).

### D-014 — Parallel stock session merged into work/m1 (2026-09-29)
- **Decision:** grn, grn-stock, inventory and suppliers were built in a parallel session on `work/m1-stock`
  and merged into `work/m1` at da516f2, before S7. After the merge, stock routes moved to permission keys,
  stock tests use real employees with seed roles (MRG-T1), and fixtures got standard rates (MRG-B1).
- **Why:** the two sessions touched different modules; merging before S7 let one cleanup pass remove every
  role list at once.

### D-015 — Route → key choices the auth spec does not name (2026-09-29, work/m1)
- **Decision:** reads of items, movements, last rate, stock view and reconciliation → `inventory.view`;
  manual movements → `inventory.adjust`; supplier reads + history → `supplier.view`; other `/asset` and
  `/supplier` writes → `asset.manage` / `supplier.manage`; `GET /asset/locations` → `asset.manage`;
  `GET /asset/machines` → any signed-in user, service allows `asset.manage` or `pr.link_machine`
  (BR-AUTH-26); `/setup/modules` → `setup.roles.manage`; approval request routes → any signed-in user,
  the chain and read rule decide (BR-APR-51), submit also needs the document's key.
- **Why:** BR-AUTH-10 wants one key per route; these follow the spec's "all other routes" rows and keep
  today's access (BR-AUTH-21). Details: `.pipeline/m1/contract.md` "Route → key" and "S7".

### D-016 — Fixture stock equals ledger balance (2026-09-29, known-defects v4)
- **Decision:** BR-KD-46 now expects each item's `currentStock` = its ledger balance after `db:reset`, not 0.
  Fixtures still never write stock or average cost directly; stock comes only from GRN postings.
- **Why:** BL-014 is fixed, so GRN accept posts real stock and average cost; the old "stays 0" check was
  written against the bug.

### D-017 — Plant details, item HSN, company.manage (2026-09-29, subcontracting v2)
- **Decision:** plant name/address/GSTIN/state live in a one-row `company_settings` table, edited by owner
  through new key `company.manage`; `hsn_code` added to `item_master`; challan without either → 400.
- **Why:** challan (BR-SCO-09) and the inter-state e-way check (BR-SCO-10) need them and nothing held them.

### D-018 — Subcontracting build clarifications (2026-09-29, subcontracting v2)
- **Decision:** uneven send:return ratio consumes raw pieces proportionally on cumulative processed qty, rounded half up (Arun: "do what other ERPs do"); race loser on a challan gets 409, over-qty on arrival 400; close waits for QA (409); `material_received` once all pieces are covered by receipts.
- **Why:** spec was silent or its examples conflicted (BR-SCO-07 vs 24, 12 vs 18, 19). All recorded in the spec Changelog.

### D-019 — Document numbers: one shared counter table (2026-09-30)
- **Decision:** keep numeric primary keys; all business document numbers (PR, PO, GRN, SCO) come from one
  `document_number_counters` table, allocated inside the same transaction as the document insert
  (`backend/src/lib/document-number.ts`). Expose a `publicId` (UUID/ULID) only if external links need it.
- **Why:** numeric keys join faster and stay small; one counter table avoids a table per workflow; a rolled-back
  insert rolls the counter back too, so no retry loop on unique conflicts.

### D-020 — Generated, forward-only migrations replace `db:push` (2026-10-01, db-migrations v1)
- **Decision:** schema changes ship as generated migrations (`db:generate` + `db:migrate`); one baseline from `src/db/schemas`; `db:push` removed; CI fails on drift. `db:migrate` on any DB that is not a local `*_test` DB (incl. local dev `diecast`) needs `MIGRATE_CONFIRM=<db>` and a `pg_dump` backup (0700 folder, 0600 file). `db:adopt` deferred — UAT starts empty. Replaces D-004.
- **Why:** UAT-1 brings real factory data; push can drop columns silently.

### D-021 — The reset/migrate guard judges the DB the driver will really use (2026-10-01, known-defects v5, db-migrations v1)
- **Decision:** only a local `*_test` DB on 5432/5433 runs `db:reset` without a confirm; every other DB needs `DB_RESET_CONFIRM=<db>`. The guard refuses a URL with no DB name, several hosts, an encoded host, or any query string (postgres.js applies `?database=` at connect time — verified). `db:test:prepare` follows the same guard.
- **Why:** a dev-URL run wiped the dev DB (#56); the first guard checked the URL path but the driver connected elsewhere.

### D-022 — All subcontracting "today" is the plant's IST day (2026-10-01, subcontracting v4)
- **Decision:** SCO dates, challan date check, expected-return check, days-left, number period and date pickers use Asia/Kolkata, on server and UI (#63). The receipt-number period and a receipt-date check are separate issues (#82, #83).
- **Why:** UTC "today" was wrong from 00:00 to 05:30 IST.

### D-023 — One git model and one agent system (2026-11-18, workflow v2 phase 0)
- **Decision:** (D1) every pipeline run gets its own `feature/<id>` branch + worktree and one small PR; epics use `epic/<name>`. The `work/<theme>` shared-branch rule is dropped. (D2) the package-level agents and skills (`ponytail`, `cavecrew-*`, `caveman-*`, `karpathy-guidelines`) are deleted; `hono-builder` / `hono-reviewer` / `nextjs-builder` / `nextjs-reviewer` became reference docs in `backend/.claude/reference/` and `frontend/.claude/reference/`, read by the root pipeline agents.
- **Why:** skills, settings and history already followed `feature/<id>`; two orchestration systems gave agents two sets of rules. Plan: `docs/plans/agentic-workflow-v2.md`.

### D-024 — End-to-end tests run locally before push; CI runs them only on PRs into main (2026-11-18, owner)
- **Decision:** the test-runner runs the Playwright e2e suite locally (test DB, demo data, then reset) before the coordinator pushes (`.claude/agents/test-runner.md` step 9). The CI `e2e` job runs only on PRs into `main` and pushes to `main`; sub-feature PRs into `epic/*` skip it.
- **Why:** epic design-system pushed one e2e test fix at a time and waited ~5 minutes of CI for each; local runs catch the same failures in about 2 minutes and the full suite still runs once on the epic PR.

### D-025 — design-system skill turns on the design-reviewer (2026-11-18, owner)
- **Decision:** `frontend/.claude/skills/design-system/SKILL.md` is written (plan step 3.6), so the design-reviewer is active (PROTOCOL → Efficiency). In `/feature` Phase 3 it runs right after test-runner, not in parallel (same ports and test DB), on the screens the dev reports list; it sets gates `design` and `screenshots`. Without `@axe-core/playwright` it checks accessibility with Playwright's accessibility snapshot and notes "axe not installed".
- **Why:** the owner asked for design and screenshot gates on every build now that the tokens and components exist.

### D-026 — Design system v2 colours: graphite and indigo (2026-11-20, owner)
- **Decision:** the emerald primary and steel-blue accent are replaced by a graphite primary and one indigo accent on neutral greys (hue 286). Status tones and chart colours stay. Values: `docs/specs/design-system/spec.md` → "Tokens — colour" (v2).
- **Why:** the owner asked for a sleek, modern, minimalist look and to "change the color scheme completely", and picked "A graphite" from three drawn directions. A green main button also competed with the green "approved" status. Required by BR-DS-24 before any token value changes.

### D-027 — Design system v2 sizes: one step up (2026-11-20, owner)
- **Decision:** 14 px text, 36 px buttons and fields, 44 px table rows, 24 px bold page titles, 24 px card padding; "Compact" gives 13 px text and 36 px rows. This replaces the 13 px / 36 px answer of 2026-11-18. Values: `docs/specs/design-system/spec.md` → "Tokens — type, density, shape" (v2).
- **Why:** the owner found the app too small ("a little zoomed in") and picked "Size A (14 px)" from a drawn comparison of today, A and B. Most controls were 12 px text in 28 px boxes.


### D-040 — factory-flows decided and frozen overnight on the owner's behalf (2026-11-20, factory-flows v1)
- **Decision:** every card and "please confirm" line in `docs/specs/factory-flows/OWNER.md` took the recommended option (cards 1–3 = A; 19 confirm rows = yes), each backed by an ERPNext / Odoo / SAP B1 benchmark (stricter one when they disagree, `docs/research/factory-flows.md` → Decision benchmarks), and the spec was frozen without a live OWNER.md approval. Owner's words, relayed by the parent session: owner pre-approved recommended options in chat, 2026-11-20: "automate that sessions take ur own decision and record them and run whatever parallel subagents u want ... ill do a complete merge in moring once completed"; "dont want for my review ill review the decicsion u take tonight".
- **Why:** the owner went to bed and asked for the build to run to hand-over overnight; he reviews all decisions in the morning. Any "no" becomes a change request (`/freeze factory-flows` change path).

### D-041 — factory-flows built overnight; e2e tail parked (2026-11-21, factory-flows v1)
- **Decision:** the epic was built as commits on one branch (`epic/factory-flows`, cut from `epic/design-system-v2`) with one PR into main, instead of sub-PRs into the epic. After the third fix round 7 Playwright specs were still red (mostly older golden specs and tablet views); they were parked as one issue rather than looping a fourth time (PROTOCOL loop limit). All backend, typecheck, lint, contract and build gates are green.
- **Why:** owner asked for one PR to review in the morning; the loop limit exists to stop endless fix rounds.
