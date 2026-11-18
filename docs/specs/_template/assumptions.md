# <Module> — assumptions

> Every choice an agent made without the owner, during spec **and** build. Append-only, never renumber.
> Rule for choosing: do what ERPNext / Odoo / SAP do; if they disagree, the stricter one. No option surveys.
> Tag `confirm` = touches money, stock, tax, permissions or what a factory user sees → the owner answers
> yes / no at hand-over. Tag `info` = technical, no answer needed. A "no" becomes a normal change request.

| Id | Date | Phase | Question | Choice | Source | Tag | Owner answer |
|---|---|---|---|---|---|---|---|
| A-01 | <YYYY-MM-DD> | spec | Max length of the remarks field? | 500 characters | standard (`backend/CLAUDE.md`) | info | — |
| A-02 | <YYYY-MM-DD> | build | Can a closed document be reopened? | No; raise a new one | benchmark: ERPNext <link>, Odoo <link> | confirm | |
