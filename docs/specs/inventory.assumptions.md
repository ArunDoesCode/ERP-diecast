# Inventory — assumptions

> Every choice an agent made without the owner, during spec **and** build. Append-only, never renumber.
> Rule for choosing: do what ERPNext / Odoo / SAP do; if they disagree, the stricter one. No option surveys.
> Tag `confirm` = touches money, stock, tax, permissions or what a factory user sees → the owner answers
> yes / no. Rows from the spec phase are listed by name in `OWNER.md` → "Decided for you — please confirm";
> rows from the build are listed in the hand-over. Tag `info` = technical, no answer needed.
> A "no" becomes a card (before freeze) or a normal change request (after).
> Column definitions: `docs/specs/_template/assumptions.md`. Phase = `spec` or `build`.

| Id | Date | Phase | Question | Choice | Source | Tag | Owner answer |
|---|---|---|---|---|---|---|---|
| A-01 | 2026-11-19 | spec | BR-INV-26 (#27): can opening stock be negative? | No: stock in only, qty > 0; stock out is a stock-take. ERPNext's opening-stock reconciliation refuses negative qty; Odoo counts can't be below 0 | benchmark: ERPNext <https://docs.erpnext.com/docs/user/manual/en/stock-reconciliation>, Odoo <https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/inventory/warehouses_storage/inventory_management/count_products.html> | confirm | yes — Arun in chat 2026-11-19 (fix all open issues) |
| A-02 | 2026-11-19 | spec | BR-INV-27 (#37): `isVirtual` for types other than `vendor_premise`? | False, derived from type, never set by the client. Odoo marks only non-physical locations (vendor, customer, loss) virtual; our other three types are physical places in the plant | benchmark: Odoo <https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/inventory/warehouses_storage/inventory_management/use_locations.html> | info | — |
| A-03 | 2026-11-19 | spec | BR-INV-28 (#40): location edit with nothing to change? | 400, same as suppliers BR-SUP-09; an edit that changes nothing must not move the audit stamp | own rule BR-SUP-09 | info | — |
| A-04 | 2026-11-19 | spec | BR-INV-29 (#33): what does the stock check screen do? | Read-only list of the reconciliation rows; fixing is a stock-take. ERPNext's stock ledger invariant report and Odoo's inventory valuation are read-only too | benchmark: ERPNext Stock Ledger Invariant Check report | info | — |
