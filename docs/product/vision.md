# DiecastOS — product vision and background

Moved here from `backend/CLAUDE.md` on 2026-11-18 (workflow v2, item 0.6) so the package file holds only
conventions. Nothing below is a coding rule; read it when you need the why or the long-term target.

## History of the backend context file
`backend/CLAUDE.md` was rewritten on 2026-07-22 to match the actual repo state — the previous
version described an earlier planned architecture (Turborepo monorepo, Supabase cloud,
job-floor-first build order) that is not what exists here. If you find another drift
like that again, fix the file, don't work around it.

## What this product is

Vertical SaaS ERP for small-to-mid aluminium die casting factories in India.
Built around a real factory visit. One paying customer first → reference → sell to 400+ similar factories.

**Owner's problems in severity order:**

1. No real-time floor visibility
2. Data entry failure (workers won't fill forms)
3. Siloed information across finance, ops, HR, sales
4. Payroll opacity — ₹18L/month with no output tracking
5. Die IP disorganised — 15 years of designs, unsearchable
6. Reactive machine maintenance only
7. Single supervisor dependency

The full factory-floor vision (job tracking, dies, dispatch, floor PWA) is the long-term
target. **Current build focus is the procurement slice** (suppliers → purchase requisitions
→ purchase orders → GRN → approvals). Do not assume job/floor/dispatch code exists — it
doesn't yet.

## Product-level limits (from the old "What NOT to do" list)
- No microservices, message queues, or distributed systems
- No React Native or separate mobile app — PWA only, once that phase starts
- No keyboard input on worker screens (once built)
- No AI features before procurement + floor data (once built) is clean and consistent
- Do not assume Supabase, Turborepo, or a frontend monorepo — none of that exists

## Factory process — long-term vision (map future features to this)

```
01. Client enquiry       → client sends 3D model, drawings, docs
02. Quotation            → versioned price negotiation, delivery date
03. Job creation         → enquiry → job; new die or existing from library
04. Die design           → SolidWorks, owner + design team
05. CNC programming      → machinist codes die into CNC system
06. Die machining        → CNC carves die (hours to days)
07. Machine setup        → casting machine selected, die loaded, stock checked
08. Trial casting        → Trial-0, Trial-1; QA validates die + piece quality
09. Batch casting        → full production run in small batches
10. Trimming/shaping     → flash removed; initial visual QA; scrap or remelt
11. QA sort              → defects separated, categorised by type
12. Finishing            → shot blasting or CNC surface finish
13. Final QA             → pass / rework / reject per piece
14. Packing              → boxes packed, packing list generated
15. Dispatch             → transport arranged, delivery confirmed
16. Invoice + payment    → GST invoice, advance/partial/final payment tracking
```

The current build (procurement: suppliers → PR → PO → GRN → approvals) is the tooling
that supports steps feeding into "07. Machine setup" and "16. Invoice + payment" — it is
a slice of this vision, not the whole thing. Any step can pause, branch, loop back, or run
in parallel. Never model jobs as a linear sequence once job-tracking is actually built.

There is no `jobs.ts`, `workers.ts`, `payroll.ts`, `enquiries.ts`, `qa.ts`, or `station/` in the backend
yet — those belong to a later phase of this vision, not the current codebase.
