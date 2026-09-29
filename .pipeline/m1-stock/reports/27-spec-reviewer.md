# Report 27 — spec-reviewer, inventory (saved by coordinator)
Gate ok; all 25 BR-INV ids have named tests. FINDINGS: 0 blocker, 3 major, 3 minor. Verdict: NOT READY.
| SPEC-20 | major | backend | poService.ts:110-135 | BR-INV-05 PO half: PR line made before item deactivated can still become a PO line; BR-INV-10 PO/SCO service part not enforced | check in PO draftable lines + test, or defer |
| SPEC-21 | major | backend | routes/asset.ts:66-69 | GET /machines not open to pr.link_machine (who-table) | widen or note |
| SPEC-22 | major | backend | prRepository.ts:372 | inactive-item check only on new PR lines, not edit | confirm/add on update |
| SPEC-23 | minor | contract | routes/asset.ts:301-305 | GET /locations widened; contract.md still says asset.manage | update contract.md |
| SPEC-24 | minor | contract | assetRepository.ts:224-240 | last-rate source `pr_estimate` means item average | rename `item_average` |
| SPEC-25 | minor | contract | contract.md:147-149 | client can send isVirtual; spec only says vendor_premise is virtual | note or drop |
