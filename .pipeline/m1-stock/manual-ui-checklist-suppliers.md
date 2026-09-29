# Manual UI checklist — Suppliers (spec suppliers.md v1)

Users: ow = owner, bo = back_office, fs = floor_supervisor, qa = qa_inspector, sa = super-admin.
Setup: item ADC12 (kg, std rate Rs 240.00, avg cost Rs 0), item FLUX (kg), item LM24 (pcs), service "CNC machining" (pc). Supplier S1 "Hindalco" active. One dispatched PO for S1.
Prices are shown in Rs on screen and stored as paise.

## 1. Create supplier (BR-SUP-01, 05, 06) — `/suppliers`, bo
- [ ] Create with name only. Saved, active, type "raw material", payment terms 0.
- [ ] Create with blank / spaces-only name: refused.
- [ ] Create "hindalco" (S1 is "Hindalco "): toast "Supplier name already exists, use a different name". Dialog stays open. Change to "Hindalco Taloja": saved.
- [ ] Rename another supplier to "HINDALCO": same 409 toast.
- [ ] Type dropdown: raw material, consumables, service provider, trader, both. No "None".
- [ ] Payment terms 400: refused. Terms -1: refused. Terms 30: saved.
- [ ] Email "abc@": refused. Valid email: saved.

## 2. GSTIN and PAN (BR-SUP-02, 03, 04) — create dialog, bo
- [ ] GSTIN typed "27aaacr5055k1z5": shows capitals, saved "27AAACR5055K1Z5".
- [ ] GSTIN "27ABC": refused (not 15 characters / bad format).
- [ ] GSTIN blank: saved.
- [ ] GSTIN 27AAACR5055K1Z5, PAN left blank: PAN fills AAACR5055K.
- [ ] PAN "AAACX1111K" with that GSTIN: refused.
- [ ] PAN "abcde1234f" with no GSTIN: saved in capitals. PAN "12345": refused.
- [ ] Another supplier with same GSTIN in small letters: toast "Supplier GST number already exists".

## 3. Edit supplier (BR-SUP-09) — `/suppliers/[id]`, bo
- [ ] Open Edit details, change nothing, save: refused (needs at least one change).
- [ ] Clear email, phone, address, contact person, GSTIN: saved as empty.
- [ ] Clear name: refused.
- [ ] Change payment terms 30: saved. Create a new PO for S1, leave terms blank: PO shows 30 days.

## 4. Deactivate / reactivate (BR-SUP-07, 08, 24) — `/suppliers/[id]`, bo
- [ ] Deactivate S1 (confirm dialog): badge "Inactive". No delete button anywhere.
- [ ] S1's open PO can still be received via GRN. Old POs, GRNs and price list still open.
- [ ] New PO screen: supplier picker does not list S1. Direct request for a PO or SCO for S1 gives 400.
- [ ] Reactivate S1: back in the PO picker. Price-list rows keep their own active/inactive state.
- [ ] Supplier list status filter: All shows both, Inactive shows only S1, Active hides S1.

## 5. Price list: items (BR-SUP-11..15) — `/suppliers/[id]` Items tab, bo
- [ ] Add ADC12: price Rs 245.50, GST 18, lead time 7, qty 0. Saved, price shows 245.50. Unit is locked to kg.
- [ ] Add ADC12 again: toast "Already on this supplier's price list" (409). No database text.
- [ ] Price 0 or blank: refused. Price with more than 2 decimals of a rupee (e.g. 245.555): refused.
- [ ] GST dropdown holds exactly 0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 28, 40. Default 0.
- [ ] Lead time 366 or -1: refused. 0 and 365: saved.
- [ ] Qty 1000.5555 (4 decimals): refused. 1000.555: saved.
- [ ] Edit the ADC12 row: price to Rs 250, saved.
- [ ] Deactivate the row: shown greyed, still listed.

## 6. Price list: services (BR-SUP-18) — Services tab, bo
- [ ] Add "CNC machining": Rs 40, GST 18. Saved, unit = service's own unit.
- [ ] Add it again: 409 toast. Price 0: refused.
- [ ] Deactivate and re-edit the row: saved.

## 7. Create with price list, all or nothing (BR-SUP-17) — create dialog, bo
- [ ] Create supplier "Test A" with 3 valid items: supplier and all 3 rows saved.
- [ ] Create "Test B" with 3 items where one is repeated: refused, no "Test B" in the list.
- [ ] (API check) Create with item id 999 that does not exist: 400 mentioning "999", no supplier saved.

## 8. Batch price edit (BR-SUP-19..22) — "Edit prices" dialog, bo
- [ ] Change price and GST on 3 rows, Save: all saved, one call.
- [ ] Untouched rows are not sent (no history rows for them).
- [ ] One bad row (e.g. lead time out of range, or row removed by another user): nothing saved, "Result" column shows the reason for that row, toast lists "Row n: reason".
- [ ] Reasons are plain sentences (e.g. "Item not on this supplier"), never text like "duplicate key value violates".
- [ ] (API check) 101 rows: 400, nothing saved. Row with both ids or none: "Give one target: row id or item/service id". Row with no field: "Give at least one field to change".
- [ ] ow / fs: no "Edit prices" button.

## 9. History (BR-SUP-10) — History card on `/suppliers/[id]`, bo then ow
- [ ] Change supplier name: history row with date, your name, field name, old and new value.
- [ ] Change a price 24 500 to 25 000 paise (Rs 245 to Rs 250): row shows Rs 245.00 to Rs 250.00, your name.
- [ ] Change GST %, and row active flag: each adds a row. Change only lead time: no history row required.
- [ ] Deactivate the supplier: history row for isActive.
- [ ] Newest first, 10 per page, next page works.
- [ ] Failed save (e.g. duplicate name): no history row.
- [ ] ow can see the History card.

## 10. Price suggestion on PO (BR-SUP-15, 16) — new PO screen, bo
- [ ] S1 with ADC12 row Rs 245, no past PO: adding ADC12 suggests Rs 245.00, source "supplier price list".
- [ ] After an approved PO to S1 for ADC12 at Rs 260: suggests Rs 260.00, source "last PO".
- [ ] Deactivate the ADC12 price-list row, supplier with no past PO: suggestion skips the row; falls to average cost (if above 0), else item standard rate Rs 240.00, and says which.
- [ ] Supplier with no row for FLUX: suggestion uses average cost or standard rate, never 0.

## 11. Search, paging, sort (BR-SUP-23, 24) — `/suppliers`, fs
- [ ] Search "hind": Hindalco appears. "HIND": same.
- [ ] Search contact person part, email part, phone part, GSTIN part: each finds the supplier.
- [ ] Search "ADC12": every supplier with ADC12 on the list, not those without.
- [ ] Search hint text: "name, contact, email, phone, GSTIN or item SKU".
- [ ] Page size 10 by default; changing to 100 works; default sort by name; choosing another sort works.
- [ ] Each card shows Active / Inactive status.

## 12. Roles (BR-SUP-25)
- [ ] ow, fs: can open `/suppliers`, detail, price list, history. No Create, Edit, Deactivate, Add, Edit prices buttons. (API: create / edit as fs gives 403 naming `supplier.manage`.)
- [ ] bo, sa: all buttons visible and work.
- [ ] qa: cannot open `/suppliers`, or gets 403 naming `supplier.view`. PO supplier picker for a role without the key: refused.
