---
module: suppliers
status: frozen           # draft | frozen | changed-after-freeze
version: 1
frozen_on: 2026-09-29
owner: Arun
depends_on: [auth-setup, inventory]
---
# Suppliers (supplier master, supplier items and services, search)

## Summary

The list of everyone we buy from: ingot sellers, flux and die-spray vendors, CNC shops, platers,
transporters. Each supplier has tax ids (GSTIN, PAN), contact and payment terms, plus a price list:
the items and services they supply, at what price, GST %, lead time. PO uses it to pick a supplier and
suggest a price. Done = back office adds "Hindalco" with GSTIN, lists ADC12 ingot at ₹245/kg, and the
PO screen offers Hindalco and suggests ₹245.

## Who can do what

| Action | Allowed |
| --- | --- |
| List, search, view suppliers and their price lists; pick an active supplier on a PO | `supplier.view` (seed: ow, bo, fs) |
| Create, edit, deactivate suppliers; add and edit their items and services | `supplier.manage` (seed: bo) |
| Delete a supplier or a price-list row | nobody: deactivate instead (BR-SUP-07) |

## Flow

| From | Action | To | Rule |
| --- | --- | --- | --- |
| — | create (with optional item price list) | active | BR-SUP-01..06, 17 |
| active | deactivate | inactive | BR-SUP-07 |
| inactive | reactivate | active | BR-SUP-08 |
| price-list row active | deactivate row | row inactive | BR-SUP-15 |

## Rules

| ID | Rule | Example (given → then) |
| --- | --- | --- |
| BR-SUP-01 | Name is required (trimmed, not blank). Creating or renaming a supplier to a name that matches another supplier, ignoring case and spaces, is rejected with 409 "Supplier name already exists, use a different name"; the user changes the name and saves again. | "Hindalco " exists, create "hindalco" → 409; change to "Hindalco Taloja" → saved; rename S2 to "HINDALCO" → 409 |
| BR-SUP-02 | GSTIN is optional (unregistered sellers are allowed); if given it is saved in capitals and must be a valid 15-character GSTIN, else 400. | "27aaacr5055k1z5" → saved "27AAACR5055K1Z5"; "27ABC" → 400; blank → saved |
| BR-SUP-03 | No two suppliers may have the same GSTIN: 409 "Supplier GST number already exists", ignoring case. | S1 has 27AAACR5055K1Z5, S2 saves it in small letters → 409 |
| BR-SUP-04 | PAN is optional, saved in capitals, must be 10 characters (5 letters, 4 digits, 1 letter); if GSTIN is given, PAN must equal GSTIN characters 3–12, and is filled from the GSTIN when left blank. | GSTIN 27AAACR5055K1Z5, PAN blank → PAN AAACR5055K; PAN AAACX1111K → 400 |
| BR-SUP-05 | Type is one of raw material, consumables, service provider, trader, both; default raw material. | no type → raw material |
| BR-SUP-06 | Default payment terms are whole days 0–365 (default 0); a new PO with no terms typed copies them. Email, if given, must be a valid address. | terms 400 → 400; "abc@" → 400; S1 terms 30, new PO blank → 30 days |
| BR-SUP-07 | Suppliers are never deleted, only deactivated. An inactive supplier cannot be chosen on a new PO or SCO (400) but its old POs, GRNs and price list stay readable, and open POs carry on. | deactivate S1 with an open PO → PO still receivable; new PO for S1 → rejected |
| BR-SUP-08 | An inactive supplier can be reactivated; its price-list rows keep their own active flag. | reactivate S1 → PO allowed again, old prices back |
| BR-SUP-09 | An edit must change at least one field; optional fields (GSTIN, PAN, contact, email, phone, address) can be cleared, name cannot. | edit with no fields → 400; clear email → saved |
| BR-SUP-10 | Every supplier change and every price-list price, GST % or active change adds a history row: who, when, old and new values. | price 24 500 → 25 000 paise → history row "Asha, 29-09, 24 500 → 25 000" |
| BR-SUP-11 | A supplier has at most one price-list row per item and one per service: a second one → 409; an unknown item or service → 400. | ADC12 already on Hindalco, add ADC12 again → 409 |
| BR-SUP-12 | Price is in whole paise and must be more than 0. | ₹245.50 → 24 550 paise; price 0 → 400 |
| BR-SUP-13 | GST % must be one of 0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 28, 40; default 0. | 18 → ok; 17 → 400 |
| BR-SUP-14 | An item row's unit must equal the item's own unit; lead time is whole days 0–365; "qty" is the most the supplier can give at this price, up to 3 decimals, 0 = no limit. | ADC12 is in kg, row in "ton" → 400; lead time 7 → ok |
| BR-SUP-15 | An inactive price-list row means "no longer approved for this item": it is kept, shown greyed, and never used for a price suggestion. | row inactive → PO price suggestion skips it |
| BR-SUP-16 | The PO price suggestion for supplier + item is the "last rate" of inventory BR-INV-24: last approved-or-later PO price to this supplier, else the active price-list price, else the item's average cost, else the item's standard rate; the answer says which one it used. | no past PO, row ₹245 → suggests 24 500, source "supplier price list" |
| BR-SUP-17 | Creating a supplier with an item price list saves everything or nothing: a repeated or unknown item rejects the whole create with 400 naming the items. | 3 items, one unknown id 999 → 400 "999", no supplier saved |
| BR-SUP-18 | Service rows follow BR-SUP-11..13 and 15; their unit is the service's own unit. | CNC machining ₹40/pc at 18 % → saved |
| BR-SUP-19 | A batch price edit takes at most 100 rows, else 400 with nothing saved (BL-031). | 101 rows → 400 |
| BR-SUP-20 | Each batch row names exactly one target (price-list row id or item/service id) and at least one field to change, else that row fails. | row with both ids → "give one target" |
| BR-SUP-21 | A batch edit saves all rows or none: one bad row → 400, nothing saved; the reply lists each row with ok or a reason. | 20 rows, row 7 unknown → 400, row 7 "Item not on this supplier", nothing saved |
| BR-SUP-22 | Error text shown for a supplier or batch row is a fixed plain sentence, never database text (BL-035). | duplicate key in DB → "Already on this supplier's price list", not `duplicate key value violates…` |
| BR-SUP-23 | Search matches, ignoring case and on any part: supplier name, contact person, email, phone, GSTIN, or the SKU of an item they supply; pages of 1–100 (default 10), sorted by name unless chosen. | "hind" → Hindalco; "ADC12" → every supplier with ADC12 on their list |
| BR-SUP-24 | The supplier list shows active and inactive with their status and can filter by it; the PO supplier picker shows only active ones. | filter "inactive" → only S1; PO picker → no S1 |
| BR-SUP-25 | Without the needed key every supplier action returns 403 `PERMISSION_DENIED` naming the key (BR-AUTH-09). | qa opens supplier list → 403 `supplier.view`; fs edits a supplier → 403 `supplier.manage` |

## Not now

- Bank details (schema exists, no screens) — build with supplier payments.
- Several GSTINs per supplier (one per state), several addresses or contacts.
- Price validity dates, quantity breaks, several prices per item, currency other than INR.
- Unit conversion (tonne ↔ kg) on price-list rows.
- Supplier hold (block POs or payments until a date), rating / scorecard, approved-vendor checks on PO.
- Bulk import of price lists from Excel; GSTIN online check against the GST portal.
- TDS / MSME fields; job-work (Sec 143) supplier fields — with M2 Subcontracting.

## Questions for you

None open.

## Changelog

- 2026-09-29 v0 — retroactive draft from code + ERPNext / Odoo / SAP B1 benchmark; BL-031, BL-035 folded in.
- 2026-09-29 — consistency pass: Q4 decided, new key `supplier.view` (ow, bo, fs) for list/search/view and the PO picker (who-table, BR-SUP-25); BR-SUP-16 follows inventory BR-INV-24.
- 2026-09-29 — final answers folded: Q1 batch all-or-nothing (BR-SUP-21), Q2 history row per change (BR-SUP-10), Q3 duplicate name rejected on create, user renames (BR-SUP-01), Q5 unit = item unit (BR-SUP-14), Q6 new PO copies supplier terms (BR-SUP-06), Q7 GSTIN optional (BR-SUP-02).
- 2026-09-29 — coordinator decisions 2026-09-29: duplicate-name check also on rename (BR-SUP-01); recommended defaults accepted, "(assumed)" dropped from BR-SUP-04, 12, 13, 14.
- 2026-09-29 — pre-freeze touch-up: BR-SUP-16 last fallback = item standard rate (inventory BR-INV-24); BR-SUP-07 also blocks new SCOs (subcontracting BR-SCO-01).
- 2026-09-29 — frozen v1 (all questions answered by Arun)
