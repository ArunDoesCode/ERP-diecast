# Questions — m1

| # | asked by | question | answer | recorded in |
|---|---|---|---|---|
| 1 | backend-dev (03) | employee-directory screen key? | new key `employees.directory.view`, seed owner (keeps today) | spec v6 changelog |
| 2 | backend-dev (03) | landing/approvals permission null? | yes, any signed-in user | spec v6 changelog |
| 3 | backend-dev (03) | leave unbuilt seed pages out? | yes (BR-AUTH-06) | spec v6 changelog |
| 4 | test-writer (02) | asset reads = inventory.view, movement POST = inventory.adjust? | yes | spec v6 changelog, contract.md |
| 5 | test-writer (02) | key for last-rate, supplier listItems/listServices? | inventory.view; supplier.view | spec v6 changelog, contract.md |
| 6 | backend-dev (06) | GET /asset/machines for bo (asset.manage) + fs (pr.link_machine)? | A: route any-authenticated, service allows asset.manage OR pr.link_machine (BR-AUTH-26) | contract S3 |
| 7 | backend-dev (06) | /setup/modules, /setup/pages* key? | setup.roles.manage (super-admin only, as today) | contract S3 |
| 8 | test-writer (10) | can bo still create a maintenance PR (needs machine)? | yes — seed pr.link_machine to ow, bo, fs (BR-AUTH-21 parity) | spec v7 changelog, contract |
| 9 | test-writer (10) | PR Machine field = purchase_requests.assetId? | yes | spec v7 changelog |
| 10 | backend-dev (15) | S6 codes/choices: ROLE_NOT_ASSIGNABLE (BR-16), SCREEN_HAS_NO_KEY, unpaginated screens/assignable-roles, SYSTEM_ROLE_PROTECTED on super-admin grants (BR-18), UNKNOWN_KEY | all accepted | contract S6 |
| 11 | test-writer (16) | delete role held only by inactive employees? | block: 409 ROLE_HAS_INACTIVE_EMPLOYEES (FK; employees keep a role) | spec v8 |
| 12 | frontend-dev (17) | default Setup tab | first tab the user can open | frontend follow-up |
| 13 | frontend-dev (17) | PATCH employee resends unchanged roleId | backend skips BR-16/17 when unchanged | backend S6 |
| 14 | frontend-dev (17) | menuGroup "" | = no group (null), not 400 | backend S6 |
| 15 | test-writer (21) | PR cancel: reason transport, cancel fields, test level | body {reason}; cancelledBy/cancelledByName/cancelledAt/cancelReason; HTTP tests | contract PR-S1 |
