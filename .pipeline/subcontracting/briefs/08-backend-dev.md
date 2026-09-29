# Brief 08 — backend-dev — revert actorId null workaround
Feature: subcontracting  Branch: claude/subcontracting-feature-b19136  Spec: docs/specs/subcontracting.md (v2, frozen)
BR scope: BR-SCO-25 (audit: who)
## Task
test-writer now cleans counter rows in `sco.test.ts`. Revert the workaround: SCO numbering passes the real actor id to `allocateDocumentSequence` in `scoRepository.insertOrder`; restore `allocateDocumentSequence` in `document-number.ts` to its previous signature unless another caller needs `null`.
## Scope (required — every line filled)
- In: that revert only.
- Out: everything else; no tests.
- May edit: backend/src/repository/scoRepository.ts, backend/src/lib/document-number.ts   May read: anything
- Size: ≤ 2 files, ≤ 20 lines
- Stop if: sco.test.ts fails after the revert → BLOCKED with the error
## Done when
- sco.test.ts, full bun test, typecheck pass. Do NOT commit.
Write your report to: .pipeline/subcontracting/reports/08-backend-dev.md
