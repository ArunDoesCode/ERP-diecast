# Report 06 — frontend-dev — S1 screens
tsc + biome clean. Not committed.

## Screens touched
| URL | Who | What |
|---|---|---|
| `/subcontracting` | `sco.view` (needs a screen row, see Q1) | SCO card list: status filter, search, sort, pagination. "New SCO" (`sco.manage`), "Company details" link (`sco.loss_override`) |
| `/subcontracting/new` | `sco.manage` | Create form: vendor (active service_provider/both), return date, project ref, notes, lines (raw item, finished item, service from vendor list, send/return qty whole pcs, price, GST slab, batch). Live totals |
| `/subcontracting/[scoId]` | `sco.view` | Detail: status, summary, totals incl. GST, approval level, lines table, approval history. Draft: Edit, Submit (creator + `sco.manage`). Cancel (draft/pending/approved, `sco.manage`) with reason 3-500 |
| `/subcontracting/[scoId]/edit` | `sco.manage` | Same form, draft only, vendor read-only; lines replace all |
| `/subcontracting/settings` | `sco.loss_override` | Company name, address, GSTIN, state code |
| `/inventory` items dialog (edit) | `asset.manage` | New "HSN code (optional)" field, edit mode only |

## Map updates
- Routes: `app/(protected)/subcontracting/{page,new,settings,[scoId],[scoId]/edit}` + `error.tsx`.
- Views: `SubcontractingView`, `ScoFormView`, `ScoDetailView`, `CompanySettingsView` (+ `use-sco-controls.ts`).
- Components: `ScoCards`, `ScoForm`, `ScoItemPicker`, `CancelScoAlert`, `CompanySettingsForm`.
- API: `lib/api/subcontracting/{fetchers,queries}.ts`; `API_ROUTES.subcontracting`, `API_ROUTES.company`; types `types/subcontracting.ts`; helper `lib/sco-format.ts`.
- Query keys (`scoKeys`): `["subcontracting","list",params]`, `["subcontracting","detail",id]`, `["company","settings"]`.
- Traps: nav is backend-driven (screens table), so no frontend nav edit; `AssetItem.hsnCode` is edit-only (create endpoint takes none); company form remounts by `updatedAt` key instead of a reset effect.

## QUESTIONS / notes
1. Nav: `SCREENS` in `backend/src/lib/permissions.ts` has no `/subcontracting` entry, so the sidebar link will not appear. Backend-dev must add it (key `sco.view`).
2. Brief says `company.manage`, but that key does not exist; contract says PATCH company settings needs `sco.loss_override`. I gated the settings page/link on `sco.loss_override`.
3. Submit uses `POST /sco/:id/submit` (not approval `submitRequest`). Submit button is shown only when the signed-in user is the creator.
4. Frontend sends explicit price and GST per line (prefilled from the vendor service list).
5. Pre-existing lint/tsc errors: none.

## Follow-up note
- Company settings page and "Company details" link now gated on `company.manage` (was `sco.loss_override`). Q1/Q2 above resolved. HSN edit-only accepted. tsc + lint clean, not committed.
