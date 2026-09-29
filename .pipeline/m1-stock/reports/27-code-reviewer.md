# Report 27 — code-reviewer, inventory (saved by coordinator)
FINDINGS: 0 blocker, 3 major, 4 minor
| CR-20 | major | frontend | lib/api/grn/queries.ts:145-146 invalidateGrnAndPO | GRN actions don't invalidate assetKeys.stock() → stale stock view | add stock() invalidation |
| CR-21 | major | frontend | lib/api/asset/queries.ts:93,114,138,159,218,240 | item create misses stock(); location create/update miss stock()+movements(); item update misses movements() | add invalidations |
| CR-22 | major | backend | stockPostingRepository.ts; assetService.updateLocation | BR-INV-15 inactive location enforced only on manual path; GRN can post into an inactive main store; the only main store can be deactivated | check in postStock; block deactivating the only main_store (409) |
| CR-23 | minor | backend | assetService.updateLocation | isVirtual stays true after leaving vendor_premise; client isVirtual honoured for other types | reset on type change |
| CR-24 | minor | backend | assetService.updateItem / isItemInUse | BR-INV-04 check-then-act without lock | tx + item FOR UPDATE |
| CR-25 | minor | backend | asset.types reorderLevelSchema; updateItem | reorder level 2.5 accepted for pcs/set (BR-INV-07/08) | whole-number check in service |
| CR-26 | minor | backend | assetRepository.getLastRate | newest PO line with rate 0 hides older positive lines; Math.max(standard,1) returns a fake 1 paise for legacy rows | filter rate > 0; no fake 1 paise |
