# Questions — m1-stock

| # | question | answered by | answer | recorded in |
|---|---|---|---|---|
| 1 | GET /machines for pr.link_machine holders? | coordinator | auth session owns BR-AUTH-26 (already on work/m1) — leave | plan.md part 2 |
| 2a | Stock view: active items + inactive with stock ≠ 0? | coordinator | yes (BR-INV-06) | contract.md |
| 2b | Stock-take positive difference: cost optional? | coordinator | no — required > 0, else 400 (grn-stock BR-GRN-44 "manual stock-in needs cost > 0") | contract.md |
| 2c | Inactive item: adjust down to zero only? | coordinator | yes (BR-INV-06 "can still be adjusted to zero") | contract.md |
| 3 | GET /locations needs asset.manage → owner (inventory.adjust) can't pick a location on the manual form | coordinator | widen GET /locations (read only) to inventory.view roles; writes stay asset.manage. Spec who-table: adjust needs a location pick | plan.md part 2; backend-dev S8 |
| 4 | Item "in use" flag for disabling SKU/unit up front | coordinator | not now; 409 toast is enough (BR-INV-04) | — |
| 5 | Error envelope in contract.md `{error:{code}}` vs app `{message, code}` | coordinator | app shape `{message, code}` is right; contract.md wording fixed | contract.md |
| 6 | BR-INV-10 service id as itemId: 400 (spec) vs contract "404/400" | coordinator | spec wins: 400 | contract.md |
