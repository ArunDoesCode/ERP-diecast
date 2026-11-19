# Purchase Requisition — assumptions

> Every choice an agent made without the owner, during spec **and** build. Append-only, never renumber.
> Rule for choosing: do what ERPNext / Odoo / SAP do; if they disagree, the stricter one. No option surveys.
> Tag `confirm` = touches money, stock, tax, permissions or what a factory user sees → the owner answers
> yes / no. Rows from the spec phase are listed by name in `OWNER.md` → "Decided for you — please confirm";
> rows from the build are listed in the hand-over. Tag `info` = technical, no answer needed.
> A "no" becomes a card (before freeze) or a normal change request (after).
> Column definitions: `docs/specs/_template/assumptions.md`. Phase = `spec` or `build`.

| Id | Date | Phase | Question | Choice | Source | Tag | Owner answer |
|---|---|---|---|---|---|---|---|
| A-01 | 2026-11-19 | spec | BR-PR-48 (#23): what does the PR list `q` search? | Number and notes only; status and type are their own filters. ERPNext and Odoo list views search text fields and filter status through a separate filter, never by free text | benchmark: ERPNext list view filters <https://docs.erpnext.com/docs/user/manual/en/list-view> | info | — |
