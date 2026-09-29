# Report 41 — frontend-dev — SPEC-43
- GSTIN change to a valid 15-char value now always refills PAN (chars 3-12); PAN stays editable. Before, it only filled when PAN was empty.
- Added `isValidGstin` in `types/suppliers.ts`.
- maxLength: name 200, contact 200, phone 30, email 254, address 500 (master form); supplier SKU 100 (offerings dialog).
- tsc and lint clean. 3 files, 12 lines added.

## Screens touched
- /suppliers (supplier master modal, create/edit; any role that can edit suppliers): GST field refills PAN; text inputs length-capped.
- /suppliers offerings dialog: Supplier SKU capped at 100.

## Map updates
- New helper `isValidGstin` in `src/types/suppliers.ts`.
