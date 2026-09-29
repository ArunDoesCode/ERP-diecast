# Report 37 — frontend-dev — supplier screens

Status: DONE. `bunx tsc --noEmit` and `bun run lint` clean (whole frontend).

## Screens touched
| URL | Roles | Changed |
|---|---|---|
| `/suppliers` | view: super-admin, owner, back_office, floor_supervisor | Status filter (All/Active/Inactive, sent as `status`); search box hint "name, contact, email, phone, GSTIN or item SKU"; status badge already on cards; "Create supplier" only for super-admin, back_office |
| Create supplier dialog | super-admin, back_office | Only name required; type defaults to raw_material (no "None"); GSTIN forced to caps, 15 chars, format checked; PAN caps, 10 chars, auto-filled from GSTIN chars 3-12 when blank and GSTIN reaches 15; contact/email/phone/address optional; payment terms 0-365 (default 0) |
| `/suppliers/[supplierId]` | view: 4 roles; manage buttons: super-admin, back_office | New Deactivate / Reactivate button with confirm dialog (sends `{mode:"master", isActive}`), no delete; Edit details dialog same rules as create (blanks clear the field); new History card (when, who, what, field, old -> new; price shown in rupees; 10 per page) |
| Price list (items + services tabs) on same page | manage: super-admin, back_office | Add/Edit dialog: price in rupees (converted to paise), GST % dropdown (0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 28, 40), lead time 0-365, qty up to 3 decimals (items), unit locked to item unit; inactive rows greyed; other roles see the table read-only (no edit link, no add) |
| "Edit prices" batch dialog (same page) | super-admin, back_office | Edits price, GST %, lead time, active for the rows on the current page (max 100); sends only changed rows in one call; on 400 shows each failed row's reason in a "Result" column and a toast listing the reasons; nothing saved |

API errors show as toasts with the API message (batch failure lists "Row n: reason").

## Map updates
- New files: `components/pages/suppliers/SupplierHistoryCard.tsx`, `SupplierBatchEditDialog.tsx`; `lib/api/suppliers/permissions.ts` (`canManageSuppliers`: super-admin, back_office).
- New route const: `API_ROUTES.suppliers.history(id)`.
- New query key `suppliersKeys.history(supplierId, params?)` = `["suppliers", id, "history", params]`; hook `useSupplierHistoryQuery`; helper `getBatchFailures(error)`.
- `useEditSupplierItemMutation` / `useEditSupplierServiceMutation` now take one row or an array; return type `BatchEditResponse` (`{success,data,summary}`). Item/service edits and master updates also invalidate the history key.
- Types: `GST_SLABS`, `panFromGstin`, `rupeesToPaise`, `paiseToRupees`, `SupplierStatusFilter`, `SupplierHistoryRow`, `BatchRowResult`, `BatchEditResponse`. Item/service form schemas now use `supplierUnitPriceRupees` / `serviceUnitPriceRupees` (string) instead of `...Paise`.
- Traps hit: `ApiClientError` dropped the response body, so a 400 `BATCH_FAILED` lost its per-row reasons.

## Edits outside the brief's "May edit" list (please confirm)
- `frontend/src/lib/api/client.ts`: `ApiClientError` now also keeps `body` (additive, needed to read per-row batch failures).
- `frontend/src/components/common/DataTable.tsx`: optional `rowClassName` prop (additive, used to grey inactive rows).
- `frontend/src/lib/api/suppliers/permissions.ts`: new role helper. Roles hardcoded per contract table; should follow the auth session's permission keys when that lands.

## Notes
- `listSuppliers` `status` is wired for the list page only; the PO supplier picker (`status=active`) and the "Jump to supplier" lookup were not touched (lookup still shows all statuses).
- History needs backend S12 (501 until then): card shows "Failed to load history" with Retry.
- Not verified against a running backend (typecheck/lint only).
