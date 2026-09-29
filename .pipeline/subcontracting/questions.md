# Questions — subcontracting

| # | Question | Answered by | Answer | Recorded in |
|---|---|---|---|---|
| 1 | Where do plant name/address/GSTIN/state live (BR-SCO-09, 10)? | Arun | New one-row `company_settings` table, owner edits | spec v2 changelog, BR-SCO-09 |
| 2 | Where does HSN on the challan come from? | Arun | `hsn_code` on `item_master` | spec v2 changelog, BR-SCO-09 |
| 3 | Missing plant details / HSN at challan time? | Arun | Block challan, 400 | spec v2 changelog, BR-SCO-09 |
