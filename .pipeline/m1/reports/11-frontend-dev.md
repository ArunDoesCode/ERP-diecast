# Report 11 — frontend-dev — S5 permission-based UI

tsc + lint clean. No role-name literal left in frontend/src (approval-policy chain `role` form fields untouched: approval config, not a UI gate; S6).

## What changed
- Store (`auth-session-store.ts`): `role` (display), `permissions`, `screens`; `allowedPages` and token decode removed. Filled from login `user` and `/auth/me` (`id,name,role,permissions,screens`).
- `useCan(key)` in `src/hooks/use-can.ts`; `<Can perm fallback>` in `src/components/common/Can.tsx`.
- `grn-permissions.ts` deleted. GRN views use keys; `role` prop removed from GrnLinesTable / QA modal / bypass alert.
- Sidebar: grouped by `menuGroup`, ordered by `sortOrder`, label from `screens`.
- `proxy.ts`: still calls `/auth/me`; path opens if it matches a `screens[].path` (prefix), plus `/landing` and `/approvals` always.
- `auth.register` route removed (F-FE-1); no callers existed.
- Token type `AccessTokenPayload` now `{userId,userName,exp}`.

## Map updates
- New: `hooks/use-can.ts`, `components/common/Can.tsx`, types `AuthScreen`, `AuthUser` in `types/auth.ts`.
- Store fields: `permissions`, `screens`. No new query keys.
- Trap: BSD sed `-i` on macOS breaks multi-file edits; use python/Edit.

## Screens touched
| URL | Key | Effect |
|---|---|---|
| Sidebar (all) | `screens` from /auth/me | Only screens the user holds appear; grouped by menuGroup |
| any protected URL | screens | Path not in user's screens (and not /landing, /approvals) redirects to `/` |
| `/purchase-orders` | `po.manage` | Tracking section shown only with key |
| `/purchase-orders/[id]` and tracking cards | `po.manage` | PO action buttons (edit/send/cancel etc.) shown only with key |
| same, in-transit PO | `grn.edit_draft` | "Receive/create GRN" button shown only with key (independent of po.manage) |
| `/purchase-requisitions` create + edit modal | `pr.link_machine` | Machine field shown and `assetId` sent only with key; options from `GET /asset/machines` |
| `/grn/[id]` | `grn.edit_draft` | Draft edit actions (draft status only) |
| `/grn/[id]` lines | `grn.qa_decide` / `grn.qa_bypass` / `grn.correct` | QA decision / bypass / correction buttons each per key |
| GRN QA + bypass dialogs | `grn.over_receipt_override` | Over-105% hint text differs (holder: server won't block) |

## Notes
- Assumed `/auth/me` `screens` is already filtered to the user's keys (contract says "built pages only" list; backend must filter). If it returns all screens, sidebar/guard would over-show: confirm.
- Machine list for a user with `pr.link_machine` but not `asset.manage` relies on backend Q1 option A.
