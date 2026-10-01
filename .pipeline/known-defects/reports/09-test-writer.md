# Report 09 — test-writer — SEC-7 (BR-KD-53 query string)

Added 9 tests in a new `describe` at the end of `backend/tests/scripts/db-guard-target.test.ts`. No existing test touched. Biome clean.
Spec basis: v5 changelog line "SEC-7" (any URL with a query string is refused, exit 2 before connecting, by `db:reset` and `db:test:prepare`).

Run: 22 pass (all old tests), 9 fail (all new) = FAIL-EXPECTED (rule not built yet). Reset/prepare exit 1 or 0 instead of 2.

| Test | Result |
|---|---|
| reset `?database=diecast` on `_test` URL (usual dead port) -> exit 2, no connect | FAIL-EXPECTED (exit 1) |
| reset `?user=other` -> exit 2, no connect | FAIL-EXPECTED |
| reset `?host=prod.example.com` on scratch DB -> exit 2, data intact | FAIL-EXPECTED |
| reset `?sslmode=disable` (harmless key) -> exit 2, data intact | FAIL-EXPECTED (prepare ran, exit 0) |
| reset query string + `--allow-remote` + matching confirm -> exit 2 | FAIL-EXPECTED |
| reset local `diecast` + `?database=other` + matching confirm -> exit 2, no connect | FAIL-EXPECTED |
| prepare `?database=diecast` -> exit 2, no connect | FAIL-EXPECTED |
| prepare `?host=prod.example.com` on scratch DB -> exit 2, data intact | FAIL-EXPECTED |
| prepare `?sslmode=disable` -> exit 2, data intact | FAIL-EXPECTED (exit 0) |

Safety: `?database=diecast` only targets a usual port where nothing listens (test skips itself if none is free); live-server cases name only the scratch DB.

Not covered (spec silent): a bare `?` with an empty query, and `#fragment`. Tell me if they should be refused.
