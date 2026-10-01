# Report 10 — test-writer — SEC-7 tests
Feature: db-migrations. Spec: changelog "security re-audit SEC-7"; BR-MIG-16/17/11.
File: backend/tests/scripts/db-migrations.test.ts (appended one `describe`, 17 tests; nothing existing touched). Biome clean.

## Results: 17 FAIL-EXPECTED (red, 0 pass). Existing tests not re-run (nothing changed there).
| group | tests | red because |
|---|---|---|
| db:migrate, `?database=` `?dbname=` `?user=` `?host=` `?port=` `?options=` `?search_path=` | 7 | exit is 1 or 0, not 2 |
| db:test:prepare, same 7 keys | 7 | exit is 1 or 0, not 2 |
| db:migrate, encoded key `?%64atabase=` | 1 | exit 0: migrated the other DB |
| db:migrate, `?connect_timeout=5&database=` | 1 | exit 0 |
| db:migrate on non-usual DB (confirm given), `?database=` | 1 | exit 0: backup + migrate ran against the override |

The exit-0 cases are the real hole: the driver applied `?database=` and migrated a different DB than the one the guard checked.

## Safety
URL path is always a scratch DB (`*_test` / `GUARD`); override targets are scratch `FRESH`, an unresolvable host, a closed port, or a non-existent user. Existing `assertScratchOnly` guard still applies. Both scratch DBs are recreated per test and dropped in `afterAll`.

## Notes
- `search_path` is covered as an example of "any key the driver sends to the server at connect"; `connect_timeout` is only used as a harmless companion key and is not asserted to be refused or allowed alone.
- db:test:prepare asserts exit 2 here (the SEC-7 changelog line says exit 2 for both scripts); earlier several-host tests only assert non-zero.
- Not covered: no-override URL still works (already covered by every other test in the file).

## QUESTIONS
none
