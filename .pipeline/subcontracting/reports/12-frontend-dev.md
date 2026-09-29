# Report 12 — frontend-dev — S2 screens (challan)
tsc + biome clean. Not committed. Backend file `document-number.ts` shows modified in git: not mine.

## Screens touched
| URL | Who | What |
|---|---|---|
| `/subcontracting/[scoId]` | `sco.view`; "Issue material" needs `sco.issue_receive` | New "Issue material" dialog (only when status approved or material_issued): challan date, e-way bill no., per line qty (max = send - issued, whole pcs) and heat number (prefilled from line batch). Backend 400/409 message shown inline + toast. New "Issued" column and a "Challans" card (number link, date, e-way bill, value, return due + badge). Edit/Submit/Cancel now also need `sco.manage` explicitly |
| `/subcontracting/challans` | `sco.view` | Open challans table sorted by due date, filter all / due within 60 days / overdue / on track, pagination. Badge: days left, overdue = "deemed supply, tell accounts" |
| `/subcontracting/challans/[challanId]` | `sco.view` | Challan detail and printable page (Print button, `window.print`): consignor, consignee (GSTIN or "unregistered"), place of supply, lines with HSN, heat, qty, rate, taxable value, total, declaration text from API |
| `/subcontracting` | `sco.view` | New "Open challans" button |

## Map updates
- Routes: `subcontracting/challans/page.tsx`, `subcontracting/challans/[challanId]/page.tsx` (static `challans` wins over `[scoId]`).
- Views: `OpenChallansView`, `ChallanDetailView`. Components: `IssueMaterialDialog`, `ScoChallansCard`, `ChallanDueBadge`.
- API: `API_ROUTES.subcontracting.{challans,openChallans,challanDetail}`; fetchers `issueChallan/getScoChallans/getOpenChallans/getChallanById`; hooks `useIssueChallanMutation/useScoChallansQuery/useOpenChallansQuery/useChallanDetailQuery`.
- Query keys: `["subcontracting","challans",scoId]`, `["subcontracting","open-challans",params]`, `["subcontracting","challan",id]`. Issue also invalidates `["inventory"]`.
- Traps: e-way bill field is always shown as optional (client cannot know inter-state/unregistered/value rule without extra data); server error is the enforcement. Dialog uses plain state (dynamic per-line fields), not RHF. Contract says challan date is an ISO datetime; sent as local-midnight ISO.

## QUESTIONS
1. Contract does not give a vendor GST state/registration on the SCO, so "show e-way bill when required" is a hint, not conditional. OK?
