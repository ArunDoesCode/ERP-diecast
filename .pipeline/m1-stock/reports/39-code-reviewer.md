# Report 39 — code-reviewer, suppliers (saved by coordinator)
FINDINGS: 0 blocker, 0 major, 5 minor
| CR-40 | minor | backend | supplierService.ts:375 vs :432-487 | create-with-items saves blank supplierSku as "" (single add saves null) | blankToNull in create() |
| CR-41 | minor | backend | supplierRepository.ts ~237, ~257, ~305 | item/service list search not LIKE-escaped | use escapeLike |
| CR-42 | minor | backend | supplierRepository.ts (6 old update/edit methods, listItems); supplier.types.ts:177, :195 | dead code | delete |
| CR-43 | minor | backend | supplierService.ts:580-668 | item/service batch edit near-duplicates | generic runBatch helper (BL-033) |
| CR-44 | minor | spec | supplierService.ts:194-214, 243-263 | history logs more fields than BR-SUP-10 lists | same as SPEC-41 |
