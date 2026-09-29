---
module: grn-stock
status: draft            # draft | frozen | changed-after-freeze
version: 0
frozen_on:
owner: Arun
depends_on: [grn, inventory, purchase-order, auth-setup]
---
# GRN — stock posting and average cost

> Part of the GRN spec (`grn.md`). How receipts and corrections hit the stock ledger, item stock and
> average cost, and what the manual stock-movement screen may post. Settles BL-014, BL-015, BL-016.
> Code, gaps and history: `docs/modules/grn.md`, `docs/modules/inventory.md`.

## Summary

The stock ledger is the only record of stock. Item "current stock" and "average cost" are a fast copy
of it, kept right in the same save as every posting. Stock is valued at the PO rate without GST (GST is
claimed back as input credit). One average cost per item for the whole plant. Done = a reconciliation
check finds zero differences after any mix of receipts, corrections and manual adjustments.

- Affects: PR cost estimates and "last rate" fallback read the item's average cost.
- Report: stock reconciliation — items where stock ≠ ledger total, and item+location pairs whose last balance ≠ ledger total.

## Who can do what

| Action | Allowed |
|---|---|
| post receipts / corrections | only through GRN actions, with their keys (see `grn.md`) |
| manual stock adjustment | `inventory.adjust` (seed: owner, back_office; super-admin passes) |
| edit item stock or average cost directly | nobody |

## Flow

| From | Action | To | Rule |
|---|---|---|---|
| GRN line pending | accept / bypass | ledger +qty, stock and average up | BR-GRN-21, 22, 24, 37, 38, 42 |
| GRN line posted | correction | ledger −qty, stock and average reversed | BR-GRN-22, 32, 33, 37, 39 |
| — | manual adjustment | ledger ±qty | BR-GRN-33, 43, 44 |

## Rules

| ID | Rule | Example (given → then) |
|---|---|---|
| BR-GRN-21 | Each accept or bypass with accepted qty > 0 posts one ledger row: type `in`, +accepted qty, cost = PO rate without GST, location = `main_store`, reference `grn` or `grn_bypass` with GRN id and GRN line id, and the supplier heat/batch number if entered (assumed). If no `main_store` exists, it fails with 404 and nothing is saved. | Accept 980 → one row `in`, +980, cost 21000, `grn`, line id set |
| BR-GRN-22 | Accept, bypass and correction save everything in one go: ledger row, item stock and average, GRN line, QA row, PO line and PO/GRN status. If any step fails, nothing is saved. | PO update forced to fail → no ledger row, stock unchanged, line `pending` |
| BR-GRN-24 | Row value = qty × cost, rounded half away from zero, same sign as qty. A full reversal at the same cost nets to exactly 0 paise. | 2.5 kg @ 1 paise → +3; its correction → −3; net 0 |
| BR-GRN-32 | A correction posts one ledger row: type `adjustment`, −qty, cost = the cost the line was posted at, reference `grn_correction` with GRN id and line id. (assumed) | L1 posted at 21000, average now 20500, correct 30 → −30 @ 21000, `grn_correction` |
| BR-GRN-33 | No posting (correction or manual) may take the balance of an item at a location below zero. Otherwise 409 "Insufficient stock", nothing posted. | Received 980, 900 issued (balance 80), correct 100 → 409 |
| BR-GRN-37 | The ledger is the truth. Item current stock = sum of all its ledger rows across locations, stored on the item and updated in the same save as every ledger row, from every posting path. | Accept 980 → stock 980; correction 30 → 950 |
| BR-GRN-38 | One moving average per item for the whole plant. On stock in: new average = (old stock × old average + qty × cost) ÷ (old stock + qty), rounded half up. If old stock ≤ 0, new average = cost. | 0 stock, 1000 @ 21000 → 21000; then 500 @ 22000 → 21333; stock −5, 10 @ 100 → 100 |
| BR-GRN-39 | A GRN correction takes value out at the posted cost: new average = (stock × average − qty × cost) ÷ (stock − qty), rounded half up. If stock − qty = 0 or the result is negative, the average stays. Any other stock out leaves the average unchanged. | 1500 @ 21333, correct 500 received @ 22000 → 21000; stock 500, correct 500 → average unchanged |
| BR-GRN-40 | Item current stock and average cost cannot be set through the item create/edit API (400, BR-INV-03). Opening stock goes in as a manual adjustment with type `opening_stock`, qty and rate. (assumed) | Edit item with stock 50 → 400, stock unchanged |
| BR-GRN-41 | For every item, current stock = ledger total; for every item+location, the last balance = ledger total. The reconciliation check returns zero rows after any sequence of postings. | Any mix of accepts, bypasses, corrections, adjustments → 0 rows |
| BR-GRN-42 | Postings for the same item are handled one at a time (item row locked before reading balance or average), including the very first posting for a new item+location. | New item, two +10 at once → balances 10 and 20, stock 20 |
| BR-GRN-43 | The manual movement screen may post only `stock_adjustment` (stock-take) or `opening_stock`, type `adjustment`, with a reason, by holders of `inventory.adjust`. Document types (`grn`, `grn_bypass`, `grn_correction`, `pro`, `sco_issue`, `sco_receipt`, `sco_loss`, `job_order_issue`, `scrap_dispatch`) get 400 "post from its source document"; without the key → 403. | back_office posts type `grn` → 400; no reason → 400; floor_supervisor (no key) → 403; owner → 200 |
| BR-GRN-44 | A manual stock-in needs cost > 0. A manual stock-out is valued at the current average cost, whatever the client sends. | Manual −2 sent with cost 1 → row cost = current average |

## Not now

- FIFO / cost layers; average per location; working stock out from the ledger on every read.
- A stock-adjustment document with approval (for now one ledger row with a reason).
- Landed cost in the stock rate.

## Questions for you

None open.

## Changelog

- 2026-09-28 — rewritten in slim format (split out of `grn.md`). Merged: BR-GRN-21 (was 21, 23), 22 (was 22, 36), 33 (was 33, 44 negative part), 43 (was 43, 45).
- 2026-09-29 — answers folded in: Q1=A (BR-GRN-37, 38, 39), Q2=A (BR-GRN-43, "Who can do what").
- 2026-09-29 — consistency pass: manual adjustment by key `inventory.adjust` (who-table, BR-GRN-43); reference type `sco_loss` added (BR-SCO-19); BR-GRN-40 → 400, same as BR-INV-03.
