# Questions — subcontracting

| # | Question | Answered by | Answer | Recorded in |
|---|---|---|---|---|
| 1 | Where do plant name/address/GSTIN/state live (BR-SCO-09, 10)? | Arun | New one-row `company_settings` table, owner edits | spec v2 changelog, BR-SCO-09 |
| 2 | Where does HSN on the challan come from? | Arun | `hsn_code` on `item_master` | spec v2 changelog, BR-SCO-09 |
| 3 | Missing plant details / HSN at challan time? | Arun | Block challan, 400 | spec v2 changelog, BR-SCO-09 |
| 4 | Challan date / heat number optional inputs? | coordinator (spec silent, BR-SCO-08 'heat number copied') | yes: date defaults today, heat defaults to SCO line batch | spec changelog |
| 5 | BR-SCO-24 example (409) vs BR-SCO-07 (400) for the race loser | coordinator | 400 if over on arrival; 409 if lost the race after lock | spec changelog |
| 6 | Ledger referenceId challan or SCO? | coordinator | challan id | spec changelog |
| 7 | Uneven send:return ratio, fractional raw pcs | Arun | do what other ERPs do → proportional on cumulative processed, round half up | spec changelog |
| 8 | Close while a receipt is pending QA? | coordinator | 409 decide QA first | spec changelog |
| 9 | material_received while QA pending? | coordinator (backend-dev question, test-writer test) | yes, all pieces covered by receipts; close waits for QA | spec changelog |
