# <Module> — edge cases

> Written by spec-analyst from `docs/research/<feature>.md` → "Edge cases seen in the products", the
> interview and the designers' files. Checked by spec-reviewer: every row names a rule. Tests are named
> by rule id, so the rule id is also the test id. The owner sees only the count.

Source: **benchmark** (what ERPNext / Odoo / SAP do) · **owner** (an answered card or interview answer) ·
**invariant** (money in paise, stock only through the ledger, permission + audit on state changes).

| # | Case | What the system does | Source | Rule |
|---|---|---|---|---|
| E-01 | Receive more than ordered | Refused with a clear message | benchmark (ERPNext, SAP) | BR-XXX-07 |
| E-02 | Two users post against the same line at once | Second one fails, nothing half-saved | invariant | BR-XXX-09 |
