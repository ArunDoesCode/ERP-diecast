# Report 39 — test-writer
- F-TEST-12: pr-machine.test.ts "add a machine with pr.link_machine succeeds" now edits a PR requested by the linker (BR-PR-17).
- CR-8-T: approvalRepository.test.ts passes `loadActor(requestor)` to submitRequest. Requester moved to a fixture role without approval.auto_approve_own (BR-APR-61: an owner's own request is auto-approved, so the pending Owner step would not appear).
- Both files: 14 pass, lint clean. Nothing else changed.
