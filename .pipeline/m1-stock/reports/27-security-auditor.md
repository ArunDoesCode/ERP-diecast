# Report 27 — security-auditor, inventory (saved by coordinator from the agent's return; file was not written)
FINDINGS: 0 blocker, 0 major, 1 minor
| SEC-20 | minor | backend | assetRepository list search | `ilike '%q%'` does not escape `%` / `_` in user input (wildcard match, no data leak) | escape `\ % _` before building the pattern |
