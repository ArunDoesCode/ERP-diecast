# Report 23 — frontend-dev — S4 screens
Status: DONE. `bunx tsc --noEmit` and `bun run lint` clean. Not committed.

## Screens touched
| URL | Role | Purpose |
|---|---|---|
| `/subcontracting/[scoId]` | `sco.close` to see the button | New "Close order" dialog, shown only in material_issued / material_received. Shows qty left at vendor. If >0: needs `sco.loss_override` (others see a note that the owner must close, confirm is disabled) and a reason of 3-500 chars. If 0: no reason, no loss. Server 403/400/409 messages shown as a toast (incl. "decide QA first"). Closed SCOs show closed date + reason in the summary. |
| `/subcontracting/reports` (new) | `sco.view` | Tabs: Stock at vendors (vendor filter, sortable, paginated), SCO register (status / vendor / created-from-to filters, sortable, paginated), Loss log (vendor / date filters, sortable, paginated, links to SCO). Link to Open challans. |
| `/subcontracting` | any | New "Reports" button next to "Open challans". |

## Map updates
- Route: `/subcontracting/reports`.
- View: `ScoReportsView`. Components (pages/subcontracting): `CloseScoDialog`, `VendorStockReport`, `ScoRegisterReport`, `LossLogReport`, `ReportFilters` (`VendorFilter`, `DateRangeFilter`, `SortableHead`).
- API routes: `subcontracting.close/vendorStock/lossLog`; fetchers `closeSco/getVendorStock/getLossLog`; hooks `useCloseScoMutation/useVendorStockQuery/useLossLogQuery`.
- Query keys: `["subcontracting","vendor-stock",params]`, `["subcontracting","loss-log",params]`. Close invalidates list, detail, challans, open-challans, both report keys, `["inventory"]`.
- Types: `ScoListParams` gained `createdFrom/createdTo`; added `VendorStock*`, `LossLog*`, `ScoClosePayload`.
- Traps: qty left = sum of `ScoLine.qtyAtVendor` (optional in type; detail response has it). Vendor filter label is lost if the chosen vendor drops out of the search results. `git status` shows unrelated backend edits (from another agent), not touched here.
