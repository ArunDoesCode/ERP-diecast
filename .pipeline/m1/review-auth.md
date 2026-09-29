# Review scope — auth-setup (S1–S6)

Spec: docs/specs/auth-setup.md (v8, frozen). Contract: .pipeline/m1/contract.md. Base: 5650630.
Commits (auth only): 7554cbb 293e0ec e781268 ae35269 d8ccc1e 6dacd88 cee80b4 0af9269 08a5328 c1e2c6d 7222013 9e4a5d9 3e0808f 4f74b06 f6d5a58 735c5b8 965e7ec b6a09c3
Diff: `git show <sha>` per commit, or `git diff 5650630..HEAD -- backend/src/lib backend/src/routes backend/src/controller backend/src/service backend/src/repository backend/src/db/schemas/01_auth.ts backend/src/types/setup.types.ts backend/src/app.ts frontend/src`
Not in scope: PR cancel, bootstrap-admin, db:reset (other slices in progress), S7 cleanup (Role union / requireRole / role_pages removal is planned, don't report it).
Env for running anything: .pipeline/m1/ENV.md
