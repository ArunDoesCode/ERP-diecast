# Plan — m1-stock, part 1: grn + grn-stock

Specs: `docs/specs/grn.md` v1, `docs/specs/grn-stock.md` v1 (frozen). Maps: `docs/modules/grn.md`, `inventory.md`.
Explorer: `reports/01-explorer.md`. Baseline: `reports/00-test-runner-baseline.md` (all green, 13 old lint warnings).
Base: `work/m1` @ a6ca63e. Env + boundaries: `ENV.md`.

## How the build runs (batched to save rounds, test-first kept)
1. One **contract** step for all slices (descriptors, Zod, `contract.md`, manifest; no logic).
2. **test-writer** ×2 in parallel, fresh context: (a) `grn.md` BRs, (b) `grn-stock.md` BRs. One `test(…)` commit.
3. **backend-dev** slice by slice (S1 → S5), one `feat(…)` commit per slice; **frontend-dev** in parallel
   with S1 (disjoint ownership), against `contract.md`.

## Slices
| # | Slice | BRs | Backend | Frontend |
|---|---|---|---|---|
| S1 | Posting engine | 21, 22, 24, 37, 38, 42 | tx-aware posting fn (item row lock, balance, value rounding, stock + moving average on item, all in caller's tx); ledger `reference_line_id`; GRN accept/bypass/correct in one tx | — |
| S2 | Create & draft | 01 (create), 02, 04, 05, 06, 08, 19 | challan mandatory + (supplier, challan) unique among non-deleted; dup PO line; qty decimals / pcs whole; receivedDate server-only; role guards per key | create/edit modal: challan required, no date field |
| S3 | QA decisions | 01 (accept), 09, 10, 12, 13, 15, 18, 25, 27 | line lock + one decision; accepted+rejected=arrived; bypass partial → rejected; over-receipt with key + reason, stored (actor, reason, excess) under PO-line lock; fs off bypass; heat/batch no. | decision modal: accepted/rejected qty, override reason; bypass: accepted qty + reason; batch no.; fs no bypass button |
| S4 | Correction | 29, 32, 33, 34, 35, 39 | `grn_correction` ref type; posted-cost; sum of corrections ≤ accepted; negative-balance 409; PO received qty down + status back (BR-PO-10: partial or dispatched); 409 if PO invoiced/closed; `netAcceptedQty` in details | line shows accepted + net accepted |
| S5 | Manual movements, item API, reconciliation | 33 (manual), 40, 41, 43, 44 | movements route: only `stock_adjustment`/`opening_stock`, reason, `inventory.adjust` roles (ow, bo, sa); stock-in cost > 0; stock-out at average; item create/edit rejects stock/avg (400); reconciliation query + `GET` endpoint (`inventory.view`) | movement form: 2 types only, reason; item form: stock/avg read-only |

## Decisions taken while planning (recorded here; none change the spec)
- PO status after correction follows purchase-order BR-PO-10 (can go to `dispatched` when nothing left received).
- `opening_stock` is a new ref-type enum value (BR-GRN-40/43), with `grn_correction` (BR-GRN-32).
- Reconciliation: backend endpoint only this round; a screen → backlog.
- Quantity columns are `double precision` today. Backend-dev: keep all qty math exact to 3 decimals so
  stock = ledger total holds exactly (BR-GRN-41); may move touched GRN/ledger/item qty columns to
  `numeric(14,3)` if needed — PO columns only if unavoidable (other session owns PO).
- Route guards: `requireRole` with the key's seed roles + super-admin and `// perm: <key>` (see ENV.md).
  Super-admin passes the over-receipt check (BR-AUTH-21 intended difference).

---

# Plan — m1-stock, part 2: inventory

Spec: `docs/specs/inventory.md` v1 (frozen). Map: `docs/modules/inventory.md`. Explorer: `reports/19-explorer.md`.
Baseline: `reports/17-test-runner.md` (all green at 1fe3cfd; no code change since). User: no merge of work/m1 first.
Same batched flow as part 1: one contract step → test-writer (fresh) → backend-dev slice by slice ∥ frontend-dev.

## Slices
| # | Slice | BRs | Backend | Frontend |
|---|---|---|---|---|
| S6 | Items | 01, 02, 03, 04, 05 (item side), 06, 08, 25 | SKU unique ignoring case/spaces (409); category + unit fixed lists; `standard_rate_paise` (> 0, required on create); SKU/unit locked once used (409 `ITEM_IN_USE`); deactivate/reactivate, no delete; who/when | item form: lists, standard rate, stock/avg read-only, active toggle |
| S7 | Services + machines | 09, 10, 16, 17, 18, 25 | service code unique ignoring case, SAC 6 digits starting 99; services never in stock paths; machine code column (required, unique ignoring case), name unique; status change saves who/when; maintenance date not future | service + machine forms |
| S8 | Locations | 11, 12, 13, 14, 15 | name unique ignoring case; vendor_premise ↔ one active supplier, virtual; one main_store; type/supplier locked once used (409 `LOCATION_IN_USE`); isActive, inactive → no postings | location form + active toggle |
| S9 | Stock view + movements | 07, 19, 20, 21, 22, 23 | stock view endpoint (per item: unit, stock, average, value, per-location balance, reorder flag, inactive mark); movement list names source doc, read-only; stock-take = counted qty → posts difference (0 → 400); opening stock only for item+location with no rows (409) | stock view screen; movement form: counted qty for stock-take, qty + rate for opening |
| S10 | Last rate | 24 | PO line of approved-or-later PO → catalog → average > 0 → standard rate; returns source | — |

## Decisions (none change the spec)
- Guards: item/service/location/machine writes `asset.manage` (sa, bo); reads for items, stock view, movements
  `inventory.view` (sa, ow, bo, fs); `requireRole` + `// perm:` (ENV.md). The auth session already rewrote
  asset.ts guards on work/m1 — expect a merge conflict there; its permission version wins.
- BR-INV-05/10 on PR/PO: work/m1's new `prService` already blocks inactive items; PO lines come from PR lines.
  On this branch only the smallest change if a test needs it, marked "take work/m1 version on merge".
- New column `item_master.standard_rate_paise`: existing rows need a value — backend-dev picks a safe path for
  `db:push` (e.g. default 0 in DB, > 0 enforced by the API). PR estimates switching to it (BR-PR-11) stays with the auth session.
