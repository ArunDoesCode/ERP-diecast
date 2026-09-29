# Report 33 — test-writer — checklist (inventory)
Wrote `.pipeline/m1-stock/manual-ui-checklist-inventory.md`: 12 groups covering BR-INV-01..25, each with a golden path and negative paths (wrong role, duplicate, out-of-range, inactive, in-use).
Screens/URLs from frontend-dev "Screens touched"; roles from spec and contract role table.

## QUESTIONS / notes
- Frontend-dev QUESTION 1 (owner picker 403 on GET /locations): contract now says GET /locations = `inventory.view`, so checklist section 7/9 expects ow can load the location picker. Verify.
- Spec BR-INV-05 "new PR/PO/supplier-item link refused for inactive item" is included in section 3 (PR only tested on UI; PO/supplier-item link left to backend tests).
