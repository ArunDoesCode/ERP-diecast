# Subcontracting — assumptions

> Every choice an agent made without the owner, during spec **and** build. Append-only, never renumber.
> Rule for choosing: do what ERPNext / Odoo / SAP do; if they disagree, the stricter one. No option surveys.
> Tag `confirm` = touches money, stock, tax, permissions or what a factory user sees → the owner answers
> yes / no. Rows from the spec phase are listed by name in `OWNER.md` → "Decided for you — please confirm";
> rows from the build are listed in the hand-over. Tag `info` = technical, no answer needed.
> A "no" becomes a card (before freeze) or a normal change request (after).
> Column definitions: `docs/specs/_template/assumptions.md`. Phase = `spec` or `build`.

| Id | Date | Phase | Question | Choice | Source | Tag | Owner answer |
|---|---|---|---|---|---|---|---|
| A-01 | 2026-11-19 | spec | BR-SCO-27 (#83): can a receipt be dated in the future? | No (400); back-dating open, same as challans (v3). ERPNext refuses future posting dates on stock transactions | benchmark: ERPNext posting date/time on stock entries <https://docs.erpnext.com/docs/user/manual/en/stock-entry> | info | — |
| A-02 | 2026-11-19 | spec | BR-SCO-27 (#82): which day sets the receipt number period? | The IST day the receipt is saved, as every SCO number (v4 dates note) | own rule BR-SCO-01, v4 | info | — |
| A-03 | 2026-11-19 | spec | BR-SCO-28 (#60): issue cost when a processed piece maps to 0 raw pieces? | Weighted average issue cost of all challans of that SCO line; never 0. ERPNext and Odoo always value consumed raw material at its valuation rate, so a finished part never takes only the service charge | benchmark: ERPNext subcontracting receipt (raw material cost from supplied items) <https://docs.erpnext.com/docs/user/manual/en/subcontracting> | confirm | yes — Arun in chat 2026-11-19 (fix all open issues) |
| A-04 | 2026-11-19 | spec | BR-SCO-29 (#58): who reads company settings history? | Same as who reads settings (`sco.view`); one row per changed field with old/new, who, when. ERPNext keeps a Version row with old/new per field on tracked doctypes; Odoo tracks fields in the chatter | benchmark: ERPNext Track Changes <https://docs.erpnext.com/docs/user/manual/en/customize-form>, Odoo chatter tracking | info | — |
