# API standards — screens

n/a — no new screens.

Three frontend fixes (no layout change), rules BR-STD-27 and BR-STD-28:

| # | File | Fix |
|---|---|---|
| 1 | `frontend/src/lib/api/auth/queries.ts:79` (`useLogoutMutation`) | Add `// no-invalidate: logout clears the whole query cache (queryClient.clear())` above the `useMutation(` call. No behaviour change. |
| 2 | `frontend/src/components/pages/approval/ApprovalCards.tsx:201` | Remove `animate-spin` from the icon. The button stays disabled while the action runs (design-system spec: no spinners). |
| 3 | `frontend/src/components/pages/subcontracting/ScoCards.tsx:65` | Remove `transition-colors` from the card. The hover background stays, without a fade. |

`frontend/design/motion-allowlist.json` stays empty. The 62 `raw-palette` findings are not touched here
(design-system, issues #88 and #91).
