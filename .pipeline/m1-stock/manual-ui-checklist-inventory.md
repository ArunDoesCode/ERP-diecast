# Manual UI checklist — Inventory (spec inventory.md v1)

Users: ow = owner, bo = back_office, fs = floor_supervisor, qa = qa_inspector, dd = die_designer, sa = super-admin.
Setup: one active `main_store` "Main Store", one active supplier S1, item ADC12 (kg, std rate Rs 240.00, reorder 500) with stock 480 kg in Main Store via a posted GRN, second item FLUX (kg) with no ledger rows.
Prices are shown in Rs on screen and stored as paise.

## 1. Items (BR-INV-01, 02, 03, 25) — `/inventory/items`, bo
- [ ] Create SKU "LM24", name, category Raw Material, unit kg, standard rate Rs 250. Saved, active, stock 0.
- [ ] Category and unit are dropdowns with only the fixed lists (Raw Material, Consumable, Spare Part, Tooling, Packing / kg, pcs, ltr, m, set).
- [ ] Create SKU " adc12 " (case and spaces differ): 409 toast "Item SKU already exists".
- [ ] Create with blank name / no category / no unit: refused.
- [ ] Create with no standard rate, or 0: refused.
- [ ] Edit ADC12: standard rate 240 to 250. Saved. Average cost on the row unchanged.
- [ ] Edit form shows current stock and average cost read-only (cannot type into them).
- [ ] Edit item name as bo: row shows last updated by bo, time now.
- [ ] ow / fs: can open the item list; no create/edit buttons or action gives 403. qa/dd: cannot open the page or get 403.

## 2. Item in use (BR-INV-04) — `/inventory/items`, bo
- [ ] ADC12 (has a GRN): change unit kg to pcs: 409 toast (ITEM_IN_USE). Change SKU: same.
- [ ] ADC12: change name, description, category, reorder level: saved.
- [ ] FLUX (unused): change unit kg to ltr and SKU: saved.

## 3. Deactivate / reactivate items (BR-INV-05, 06) — bo
- [ ] Deactivate FLUX (no stock): Status "Inactive". Not offered in the item picker on a new PR line; new PR with FLUX refused (400).
- [ ] Deactivate ADC12 (has stock 480): saved. `/inventory/stock` still lists it with "Inactive" tag and 480 kg.
- [ ] An open PO with the inactive item can still be received via GRN.
- [ ] Reactivate: item back in pickers.
- [ ] No delete button anywhere for items.

## 4. Reorder flag and quantities (BR-INV-07, 08) — `/inventory/stock`
- [ ] ADC12 reorder 500, stock 480: "Below reorder" tag. Set reorder 480: still flagged (equal). Set reorder 0: no tag.
- [ ] Reorder level negative: refused.
- [ ] Filter "below reorder": lists only flagged active items.
- [ ] Stock-take on a pcs item with 2.5: refused (400). kg item with 2.345: accepted. 2.3456: refused.

## 5. Stock view (BR-INV-19) — `/inventory/stock`, ow / bo / fs
- [ ] Row shows item, SKU, category, stock + unit, average cost, value, reorder level, balance per location.
- [ ] Value = stock x average, rounded to paise (e.g. 1500 kg at Rs 213.33 = Rs 319,995.00).
- [ ] Sum of location balances equals current stock.
- [ ] Search, category filter and sort by stock/value work.
- [ ] qa / dd: no access (403 or hidden). Page has no edit action.
- [ ] Services never appear in the stock view.

## 6. Services (BR-INV-09, 10, 25) — `/inventory/services`, bo
- [ ] Create code "JW-01", name, unit, SAC "998898": saved.
- [ ] SAC "1234", "12345678", "128898" (not starting 99): refused. Blank SAC: accepted.
- [ ] Code "jw-01" again: 409 toast.
- [ ] Blank code / name / unit: refused.
- [ ] Deactivate: not offered on a new PO or SCO line; reactivate restores it.
- [ ] Service does not appear in item pickers, stock view or manual stock form.
- [ ] fs / ow: cannot create or edit (403). No delete button.

## 7. Locations (BR-INV-11, 12, 13, 14, 15, 25) — `/inventory/locations`, bo
- [ ] Create "Scrap Yard" type scrap_yard: saved, virtual box available.
- [ ] Create "main store" (any case) again: 409 toast.
- [ ] Create a second main_store with another name: 409. Change the only Main Store type to finished_goods: 409.
- [ ] Type vendor_premise: Supplier picker appears and is required. Save without supplier: refused (400). Only active suppliers offered.
- [ ] Vendor_premise for S1 saved, virtual. A second vendor_premise for S1: 409.
- [ ] Type main_store / scrap_yard / finished_goods with a supplier: refused (400).
- [ ] Scrap Yard with ledger rows: change type or supplier: 409 (LOCATION_IN_USE). Rename: saved.
- [ ] Deactivate a location: hidden from pickers, history still visible in movements. Stock-take/opening stock into it: 400.
- [ ] Reactivate: usable again. No delete button.
- [ ] ow / fs: can see the list in the movement picker; cannot create or edit.

## 8. Machines (BR-INV-16, 17, 18, 25) — `/inventory/machines`, bo
- [ ] Create name "Press 1", code "DC-01": saved, status idle.
- [ ] Code "dc-01" with another name: 409. Name "press 1" with another code: 409.
- [ ] Blank code or blank name: refused.
- [ ] Change status idle to breakdown, then to running, then to idle: all saved. Row shows last updated by user and time.
- [ ] Last maintenance date picker: today accepted; tomorrow refused (max today).
- [ ] Deactivate machine: hidden in the PR machine picker; old PRs still show it.
- [ ] fs (has `pr.link_machine`): PR form machine picker shows name and code of active machines only.
- [ ] No delete button.

## 9. Manual stock screen (BR-INV-21, 22, 23, 08) — `/inventory/movements`, ow or bo
- [ ] New movement dialog opens with type "Stock-take" (not GRN). Only Stock-take and Opening stock offered.
- [ ] Item and location are search pickers; reason is required (blank refused).
- [ ] Stock-take ADC12 / Main Store, balance 480, counted 470: one row, adjustment -10, reason saved. Stock now 470.
- [ ] Counted 480 when balance 480: 400 "no difference", nothing posted.
- [ ] Counted 500 (up): cost in Rs required; without cost refused. With cost: +20 posted.
- [ ] Counted more than balance on an item with no cost given: refused; counted less: cost not needed.
- [ ] Opening stock FLUX / Main Store, qty 100, rate Rs 90: posted +100. Qty 0 or rate missing: refused.
- [ ] Opening stock again for FLUX / Main Store, or for ADC12 (has GRN): 409 toast "use stock-take".
- [ ] Try to reach a service or a GRN-type posting from the form: not possible; no way to pick document types.
- [ ] fs: can open movements list; no new-movement button or 403 on post.
- [ ] Inactive item at 12 kg: stock-take to 0 works. Counted 5 (up): refused.
- [ ] Stock cannot go below zero (counted negative refused).

## 10. Movement list (BR-INV-20) — `/inventory/movements`, ow / bo / fs
- [ ] Filters: item, location, source, type, date range all narrow the list.
- [ ] Source column names the document (e.g. "GRN GRN-0012"); manual rows show "Stock-take (manual)".
- [ ] Detail dialog shows source and reason, read-only. No edit or delete button anywhere.
- [ ] Browser: PATCH or DELETE on a movement URL returns 404/405.
- [ ] qa / dd: no access.

## 11. Last rate (BR-INV-24) — PO form, bo (supplier S1)
- [ ] Only a cancelled PO at Rs 250 and catalog Rs 240: suggested price Rs 240.
- [ ] Approved PO line at Rs 260 exists: suggested Rs 260 (newest approved-or-later PO). Draft and pending PO lines are ignored.
- [ ] No PO, no catalog, average cost 0, standard rate Rs 240: suggested Rs 240 (never blank or an error).
- [ ] No PO, no catalog, average cost > 0: suggested the average.

## 12. Audit (BR-INV-25)
- [ ] For an item, service, location and machine: create, edit, deactivate, reactivate each updates "last updated by / at" to the acting user and now (visible in detail or list).
