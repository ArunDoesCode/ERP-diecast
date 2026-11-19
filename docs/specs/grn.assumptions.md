# GRN (and grn-stock) — assumptions

> Every choice an agent made without the owner, during spec **and** build. Append-only, never renumber.
> Rule for choosing: do what ERPNext / Odoo / SAP do; if they disagree, the stricter one. No option surveys.
> Tag `confirm` = touches money, stock, tax, permissions or what a factory user sees → the owner answers
> yes / no. Rows from the spec phase are listed by name in `OWNER.md` → "Decided for you — please confirm";
> rows from the build are listed in the hand-over. Tag `info` = technical, no answer needed.
> A "no" becomes a card (before freeze) or a normal change request (after).
> Column definitions: `docs/specs/_template/assumptions.md`. Phase = `spec` or `build`.

| Id | Date | Phase | Question | Choice | Source | Tag | Owner answer |
|---|---|---|---|---|---|---|---|
| A-01 | 2026-11-19 | spec | BR-GRN-47 (#30): does the screen's over-receipt warning count earlier receipts? | Yes, same sum as the server (received so far + this one vs ordered × 1.05). ERPNext's over-delivery allowance is checked against the total received on the order line | benchmark: ERPNext over delivery/receipt allowance <https://docs.erpnext.com/docs/user/manual/en/stock-settings> | info | — |
| A-02 | 2026-11-19 | spec | BR-GRN-48 (#28): unit cost cap on manual movements? | The 64-bit money limit of BR-STD-16, not the old 32-bit cap the issue named (api-standards Card 1 = A made money 64-bit) | api-standards BR-STD-16, 39, 43 | info | — |
