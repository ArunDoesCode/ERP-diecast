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
