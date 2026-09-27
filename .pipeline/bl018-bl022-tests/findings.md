# Findings — bl018-bl022-tests

## F-01 — tests not written by test-writer (process violation)
- Rule: `.claude/pipeline/PROTOCOL.md` → Test independence, rule 1: "test-writer writes and changes tests;
  backend-dev / frontend-dev write code. No agent does both, and the coordinator never edits tests".
- Files: `backend/src/types/approval.types.test.ts`, `backend/src/service/authService.test.ts` were written by
  the coordinator in PR #4 (commits `37eea02`, `0b43592`) in the same commits as the fixes.
- Decision (user, 2026-09-27: "redo"): test-writer replaces both files with its own regression tests derived
  from the spec rules below; the coordinator's versions are discarded.
- Rules: `docs/specs/approval.md` BR-APR-08, BR-APR-10 (BL-022) · `docs/specs/auth-setup.md` BR-AUTH-01,
  BR-AUTH-02 (BL-018).
