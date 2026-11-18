# API standards — edge cases

> Every row names a rule in `../spec.md`. Tests are named by rule id.

Source: **benchmark** (what ERPNext / Odoo / SAP B1 and Postgres practice do) · **owner** (instruction of
2026-11-18) · **invariant** (money in paise, frozen module specs win, tests never touch the dev DB).

| # | Case | What the system does | Source | Rule |
|---|---|---|---|---|
| E-01 | Two users save the same unique value at the same moment; the pre-check passes for both | One row is saved; the other gets 409 "This record already exists." | benchmark (ERPNext duplicate-entry message, Odoo unique-constraint message) | BR-STD-01 |
| E-02 | A delete hits a row that another table still points to | 409 "…linked to another record…", nothing deleted | benchmark (ERPNext "cannot delete, linked with", SAP B1 blocks) | BR-STD-02 |
| E-03 | An insert points to a parent id that was removed a moment ago, and the service did not check | 409 `LINKED_RECORD`, nothing saved | benchmark | BR-STD-02 |
| E-04 | A service already checks an unknown item or service and answers 400 (BR-SUP-11) | Still 400: the service runs before the database | invariant (frozen spec wins) | BR-STD-05 |
| E-05 | Duplicate item SKU, supplier name or GSTIN caught by the service | Still the module's own 409 text ("Item SKU already exists" …) | invariant (frozen spec wins) | BR-STD-05 |
| E-06 | Server runs with `NODE_ENV=development` | The 409 body is the same fixed text; no constraint name | benchmark (OWASP: no schema detail in errors) | BR-STD-03 |
| E-07 | The 23505 is wrapped two levels deep by Drizzle | Still recognised (cause chain) | invariant (existing `isUniqueViolation`) | BR-STD-04 |
| E-08 | A database error that is neither a duplicate nor a broken link (say a not-null violation, 23502) | 500 "Internal server error" as today | invariant | BR-STD-06 |
| E-09 | User searches `50%` | Only text containing "50%" | owner | BR-STD-08 |
| E-10 | User searches `a_b` or `__` | `_` matches only an underscore | owner | BR-STD-08 |
| E-11 | User searches a term with a backslash (`a\b`) | Matches only text with that backslash; no SQL error | benchmark (Postgres LIKE escape) | BR-STD-08 |
| E-12 | Search box holds only spaces | Treated as no search: full list | benchmark (ERPNext, Odoo list search) | BR-STD-10 |
| E-13 | `q` is 100 characters, then 101 | 100 → searched; 101 → 400, no query | benchmark | BR-STD-11 |
| E-14 | `q` has 99 characters plus 5 spaces at the ends | Trimmed first, so accepted | benchmark | BR-STD-10, 11 |
| E-15 | Employee search endpoint with an empty term | 400 as today: the term is required there | invariant (existing contract) | BR-STD-10 |
| E-16 | Text is exactly at its limit | Accepted and saved whole | benchmark (SAP B1 fixed field lengths) | BR-STD-13 |
| E-17 | Text is one character over | 400, nothing saved, nothing cut | benchmark (ERPNext "value too long", never truncates) | BR-STD-13, 19 |
| E-18 | Reason fields already limited to 3–500 by PR, PO and SCO specs | Unchanged | invariant (frozen spec wins) | BR-STD-13 |
| E-19 | Unit price one paise above the money limit of Card 1 | 400 instead of a database error | invariant (money is whole paise) | BR-STD-16 |
| E-20 | Quantity 2.5 on a `pcs` item, within the upper bound | Still refused by the module rule | invariant (BR-INV-08) | BR-STD-17 |
| E-21 | PR saved at 01:30 IST with yesterday's date as required-by | Refused `PR_DATE_IN_PAST` | benchmark (ERPNext uses the site time zone for "today") | BR-STD-25 |
| E-22 | Stock movement posted at 00:30 IST, user filters on that India day | Listed under that day, not the day before | benchmark | BR-STD-26 |
| E-23 | A new foreign key is added later without an index or a reason | CI fails | owner | BR-STD-20, 21, 29 |
| E-24 | `db:test:rebuild` pointed at a database whose name does not end in `_test`; `bun run try` on an empty dev database | Rebuild refuses with exit 2; `try` seeds nothing and only prints the command | invariant (BR-KD-30, 52) | T-1, T-2 |
| E-25 | A request carries a list longer than its maximum (501 lines, 1,001 permission keys) | 400, nothing saved, no document number used | benchmark (OWASP: limit the size of every input) | BR-STD-33 |
| E-26 | User types one letter in a search box | Treated as no search: the full list, nothing hidden; searching starts at 2 letters | benchmark (ERP search boxes start matching at 1–2 characters; a one-letter "contains" match narrows almost nothing) | BR-STD-38 |
| E-27 | Prices are within the limit but quantity × price, or the sum of the lines, is above the money limit | 400 with a plain message naming the limit, nothing saved; never a server error | owner (Card 1) | BR-STD-39 |
| E-28 | A user without the module's create permission sends a value that already exists; or the duplicate happens on login | 403 for the user (the permission check comes first); login never answers 409 | invariant (permission before data, BR-AUTH-10) | BR-STD-36 |
| E-29 | A duplicate or broken link is hit in the second step of a multi-step save | The whole save is rolled back; 409; no half-saved document | invariant (one transaction per write) | BR-STD-35 |
| E-30 | A hook runs in deny mode and `jq` is not installed | The edit is blocked (fail closed) | invariant (guard rails fail closed) | BR-STD-41 |
| E-31 | An agent edits a test file through a symlink outside `backend/tests` | The real path is checked; blocked unless the agent is test-writer | invariant (test independence) | BR-STD-41 |
