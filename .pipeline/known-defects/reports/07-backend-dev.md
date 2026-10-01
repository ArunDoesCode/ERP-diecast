# Report 07 — backend-dev — BR-KD-53 guard fixes

Done. `bun test tests/scripts/` 112 pass; full `bun test` 1396 pass; typecheck clean; lint has 0 errors (260 old warnings).

Changed: `backend/scripts/db-reset.ts` only (+53/-12). `prepare-test-db.ts` needed no change: its child `db-reset` runs the same guard, and the three BR-KD-53 prepare tests pass.

| finding | what changed (db-reset.ts) |
|---|---|
| CR-1 / SEC-1 | ~L52: URL with empty path refused (exit 2) before any connect; PGDATABASE is never judged. Empty `DB_RESET_CONFIRM` already fails `confirm !== dbName` now that dbName is never empty. |
| SEC-2 | ~L31-80: host, port, user, pass, db read from `postgres(url).options` (lazy, no connect). `host.length !== 1` refused. PGHOST/PGPORT count when URL omits them. Name must match `[A-Za-z0-9_.$-]+` (percent escapes refused, "cannot be read exactly"). After the guard, `process.env.DATABASE_URL` is rewritten to an explicit `postgres://user:pass@host:port/db[?query]` and PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD are deleted, so children and the in-process client hit exactly what was judged. Drop-schema step now uses the resolved URL. |
| SEC-4 | NODE_ENV compared with `.toLowerCase()`. |
| SEC-3 (side) | Driver reads `[::1]` as host `[`; the guard uses the URL hostname for that case so the existing BR-KD-30 `::1` test still passes (connect still fails closed). |

## Map updates
- db-reset guard now builds its target from the postgres driver's parsed options, not `new URL`. Trap: the driver does not percent-decode the DB name and misparses bracketed IPv6 hosts.
- Guard rewrites `process.env.DATABASE_URL` to the resolved explicit URL and clears PG* env (children inherit it).
- Not done (out of scope, backlogged): CR-2 stray DB_RESET_CONFIRM in prepare, CR-3 `process.execPath`, SEC-3 full IPv6 support.
