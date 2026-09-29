# Report 08 — backend-dev
Reverted actorId null workaround (BR-SCO-25).
- backend/src/repository/scoRepository.ts insertOrder: passes `data.createdBy as number` to allocateDocumentSequence.
- backend/src/lib/document-number.ts: `actorId: number` restored; no other caller used null.
Checks: typecheck pass, lint 0 errors (259 pre-existing warnings), bun test 1211 pass / 0 fail. Not committed.
Map updates: none.
