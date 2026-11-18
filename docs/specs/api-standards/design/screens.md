# API standards — screens

n/a — no new screens.

Seven frontend fixes (no layout change), rules BR-STD-27, BR-STD-28 and BR-STD-16:

| # | File | Fix |
|---|---|---|
| 1 | `frontend/src/lib/api/auth/queries.ts:79` (`useLogoutMutation`) | Add `// no-invalidate: logout clears the whole query cache (queryClient.clear())` above the `useMutation(` call. No behaviour change. |
| 2 | `frontend/src/components/pages/approval/ApprovalCards.tsx:201` | Remove `animate-spin` from the icon. The button stays disabled while the action runs (design-system spec: no spinners). |
| 3 | `frontend/src/components/pages/subcontracting/ScoCards.tsx:65` | Remove `transition-colors` from the card. The hover background stays, without a fade. |
| 4 | `frontend/src/types/suppliers.ts:143` (`MAX_PRICE_PAISE = 2147483647`, used at :205 by `priceRupeesField`) | Delete the local constant; use the shared `MAX_MONEY_PAISE`. |
| 5 | `frontend/src/types/asset.ts:306` (`assetStockTakeSchema.unitCostPaise` `.max(2147483647)`) | `.max(MAX_MONEY_PAISE)`. |
| 6 | `frontend/src/types/asset.ts:375` (`MAX_PAISE = 2147483647`, used at :385 `standardRatePaise` and :418 `standardRate` in rupees) | Delete the local constant; use the shared `MAX_MONEY_PAISE` (:418 stays `MAX_MONEY_PAISE / 100`). |
| 7 | `frontend/src/components/pages/suppliers/SupplierBatchEditDialog.tsx:48` (`MAX_PRICE_PAISE = 2147483647`, used at :89) | Delete the local constant; use the shared `MAX_MONEY_PAISE`. |

Fixes 4–7 (BR-STD-16, Card 1 = A): the shared constant is new, `frontend/src/lib/money.ts`:
`export const MAX_MONEY_PAISE = 10_000_000_000_000;` (₹10,000 crore, the same value as the backend
`backend/src/lib/money.ts`). These four lines are every hit of `2147483647`, `2_147_483_647` and `214748` in
`frontend/` (searched 2026-11-18); after the fix the search over `frontend/src` prints nothing. Messages and
layout do not change.

> Example: supplier batch edit, unit price `30000000.00` (₹3 crore = 3000000000 paise). Today: a form error,
> the row cannot be saved. After: saved. `100000000000.00` (₹10,000 crore) → saved; `100000000000.01` → form
> error, no request. Item form: standard rate `30000000` → saved (today "Standard rate is too large").

`frontend/design/motion-allowlist.json` stays empty. The 62 `raw-palette` findings are not touched here
(design-system, issues #88 and #91).
