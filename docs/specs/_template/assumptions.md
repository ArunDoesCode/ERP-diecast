# <Module> — assumptions

> Every choice an agent made without the owner, during spec **and** build. Append-only, never renumber.
> Rule for choosing: do what ERPNext / Odoo / SAP do; if they disagree, the stricter one. No option surveys.
> Tag `confirm` = touches money, stock, tax, permissions or what a factory user sees → the owner answers
> yes / no. Rows from the spec phase are listed by name in `OWNER.md` → "Decided for you — please confirm";
> rows from the build are listed in the hand-over. Tag `info` = technical, no answer needed.
> A "no" becomes a card (before freeze) or a normal change request (after).
> This file is the only place the columns are defined. Flat spec: `docs/specs/<module>.assumptions.md`.
> Phase = `spec` or `build`. Question names the rule id or area it belongs to.

| Id | Date | Phase | Question | Choice | Source | Tag | Owner answer |
|---|---|---|---|---|---|---|---|
| A-01 | <YYYY-MM-DD> | spec | Max length of the remarks field? | 500 characters | standard (`backend/CLAUDE.md`) | info | — |
| A-02 | <YYYY-MM-DD> | build | Can a closed document be reopened? | No; raise a new one | benchmark: ERPNext <link>, Odoo <link> | confirm | |
