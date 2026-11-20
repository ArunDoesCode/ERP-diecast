# Stock transfer — screens

> Written by ui-ux-designer from `../spec.md` and `api.md` (field names below are the api.md names). Checked by design-reviewer before freeze.
> Patterns, components and tokens come from the `design-system` skill
> (`frontend/.claude/skills/design-system/SKILL.md`). Pictures are wireframes, not screenshots
> (no running app / DB allowed in this run). Mock route not used.

## Screen list
| Screen | Route | Pattern | Picture |
|---|---|---|---|
| Stock transfers | `/inventory/stock-transfers` | list | wireframe below |
| New / edit transfer | `/inventory/stock-transfers/new`, `/inventory/stock-transfers/[id]/edit` | form (own page) | wireframe below |
| Transfer detail | `/inventory/stock-transfers/[id]` | detail (two-pane) | wireframe below |
| Move stock (change to existing screen) | `/inventory/stock` | list (row action) | wireframe below |
| Location form (change to existing screen) | `/inventory/locations` | form (dialog) | wireframe below |

Sidebar: "Stock transfers" under Inventory, after "Stock" and "Movements"; screen key = its route `/inventory/stock-transfers`
(`SCREENS`, visible with `inventory.view`, as api.md Registration notes). Breadcrumbs: Inventory › Stock transfers › `ST-2026-0001` (last crumb via
`useBreadcrumbLast`); New: Inventory › Stock transfers › New transfer.

### Stock transfers (list)
- **Purpose:** stores / floor supervisor find a transfer, see what is waiting to be posted.
- **Pattern:** list. `PageHeader` + `FilterBar` + `DataTable` + `Pagination`; state in URL (nuqs); `loading.tsx` next to `page.tsx`.
- **Fields (source: `GET /api/stock-transfer` row):** Transfer no. (`transferNumber`, mono accent link) · Status (`status`, `StatusBadge doc="st"`) · From (`sourceName`) · To (`destinationName`) · Lines (`lineCount`, right) · Date (`createdAt`, `formatDate`) · Posted on (`postedAt`, `formatDateTime`, `–` for draft). Value is not a column (cost lives on the detail, BR-INV-19).
- **Filters (BR-STR-27, query params):** quick chips by `status` (All, Draft, Posted, Cancelled, Reversed); From (`sourceLocationId`), To (`destinationLocationId`), Item (`itemId`) selects; date range (`fromDate`, `toDate`, on created date). Sort `createdAt` desc by default; paging `page`/`pageSize` (`meta.total`). No search box (api.md has no `q`). The api gives no per-status counts, so chips show no counts.
- **Actions:** "New transfer" (primary, `stock_transfer.manage`, links to `/new`, BR-STR-08). Row click opens detail.
- **States:** empty = "No stock transfers yet" + "New transfer" (only with key; else text only) · with filters "Nothing matches these filters" + Reset · loading 8 skeleton rows · error `ErrorState` + Try again · no permission (no `inventory.view`) = route not reachable, shell 403 page.
- **Permissions:** `inventory.view` opens. "New transfer" hidden without `stock_transfer.manage`.

```
+------------------------------------------------------------------+
| Stock transfers                                  [ New transfer ]|
| ==== (accent band)                                               |
| (All)(Draft)(Posted)(Cancelled)(Reversed)       [Reset]      |
| From [v]  To [v]  Item [v]  Date [from]-[to]                     |
| Transfer no.  Status    From        To          Lines  Date      |
| ST-2026-0003  Draft     Main Store  Shop Floor      2  20 Nov 26 |
| ST-2026-0001  Posted    Main Store  Shop Floor      1  18 Nov 26 |
|                                  1 to 12 of 12   < 1 >  [25 v]   |
+------------------------------------------------------------------+
```

### New / edit transfer (form, own page)
- **Purpose:** back office builds a draft: one source, one destination, up to 50 lines.
- **Pattern:** form on its own page (lines table makes it more than 6 fields); two columns from 768 px; `<Label>` above every field, `min-h-19`.
- **Fields:** From location (`sourceLocationId`; select from `GET /api/asset/locations`, active, `type` not `vendor_premise`; BR-STR-01..03) · To location (`destinationLocationId`; same list, the From choice is removed from it, BR-STR-01) · Note (`notes`, textarea, optional, max 500) · Lines (1 to 50, BR-STR-04): Item (`lines[].itemId`; searchable select from `GET /api/asset/items`, active stock items only, BR-STR-06) · Qty (`lines[].qty`; right-aligned, unit from the item shown beside the input, `formatQty`; decimals by unit, BR-STR-05) · Available at source (hint, read only, e.g. "1,500 kg at Main Store"; on an existing draft from `GET /api/stock-transfer/:id` `lines[].sourceBalanceQty`; on a new or changed line from `GET /api/asset/inventory/stock?locationId=<source>`; shows "–" until From and Item are chosen, BR-STR-30) · remove-line icon button. Items already used are disabled in the picker (BR-STR-04). No cost field anywhere (BR-STR-07).
- **Actions:** "Save draft" (primary, `stock_transfer.manage`; `POST /api/stock-transfer`, or `PATCH /api/stock-transfer/:id` with the whole `lines` list on edit; "Saving…"; BR-STR-08/09; no dialog; on success opens the detail) · "Cancel" (outline, back, asks "Discard changes?" only if the form is dirty) · "Add line" (outline). Edit page only: none other; cancel-document is on the detail page.
- **Inline checks:** qty above the hint turns the hint into a warning text "Only 150 kg at Main Store" (does not block save; binding check is at post, BR-STR-13/30). Server errors (`STR_SAME_LOCATION`, `STR_LOCATION_INACTIVE`, `STR_VENDOR_LOCATION`, `STR_DUPLICATE_ITEM`, qty unit; BR-STR-01..06) show under the field they name; line errors name the line number.
- **States:** loading (edit: skeleton fields) · error loading a draft = `ErrorState` + Try again · edit of a non-draft (`STR_NOT_DRAFT` 409, or status not `draft` on load) = redirect to detail with a notice "Only a draft can be edited" (BR-STR-09) · empty lines = first blank line is shown, not a separate empty state · no permission = "You can't create transfers" `EmptyState`, link back to list.
- **Permissions:** `stock_transfer.manage`.

```
+------------------------------------------------------------------+
| New transfer                                                     |
| ==== (accent band)                                               |
| From location *            To location *                         |
| [Main Store          v]    [Shop Floor          v]               |
| Note                                                             |
| [................................................]               |
| Lines                                                            |
| Item                      Available at source     Qty        [x] |
| [ADC12 ingot        v]    1,500 kg at Main Store  [200  ] kg     |
| [Select item        v]    –                       [     ]        |
| [ + Add line ]                                                   |
|                                    [ Cancel ] [ Save draft ]     |
+------------------------------------------------------------------+
```

### Transfer detail (two-pane)
- **Purpose:** check a transfer, take its next step (post, reverse, make a new one).
- **Pattern:** detail. `DetailHeader` (docNo, `StatusBadge`, meta, actions, back to list). Two panes from 1024 px: left (wide) = Lines card; right = Details card + History card. Below 1024 px the panes stack, Lines first. On the form below 1024 px the balance hint wraps under the item; all touch targets are at least 36 px. `DocumentFlow` not used (one document, no chain; renders nothing).
- **Fields (source: `GET /api/stock-transfer/:id`):**
  - Header meta: From (`source.name`) · To (`destination.name`).
  - Lines card: Item (`sku` + `name`) · Qty (`qty`, `formatQty` with `unit`, right) · Rate (`postedUnitCostPaise`, `formatMoney`, right, posted / reversed only) · Value (`postedValuePaise`, `formatMoney`, right, posted / reversed only; total row = sum, at the bottom). Draft shows "Available at source" (`sourceBalanceQty`, null once not draft) instead of Rate and Value (BR-STR-30). Cost visible with `inventory.view` (same as stock view).
  - Details card: Created (`createdBy`, `createdAt`) · Note (`notes`) · Posted (`postedBy`, `postedAt`, `formatDateTime`, BR-STR-18) · Cancelled (`cancelledBy`, `cancelledAt`) · Reversed (`reversedBy`, `reversedAt`) · Reason (`reverseReason`). Rows with no value are not shown.
  - History card: lines built from the created / last updated (`lastUpdatedBy/At`) / posted / cancelled / reversed pairs, plus the posted ledger rows (`ledgerRows`: `transactionType`, `referenceType`, `quantityChange`, `unitCostPaise`, `totalValueChangePaise`, shown with the location name, found by matching `locationId` to `source.id` / `destination.id`) for posted / reversed (BR-STR-25). Link "View stock movements" to `/inventory/movements` filtered by `referenceType` `stock_transfer` / `stock_transfer_reversal`.
- **Actions (BR-STR-28; the one primary button depends on status):**
  | Status | Primary | Others |
  |---|---|---|
  | draft | "Post transfer" (`stock_transfer.manage`; not rendered without the key) | "Edit" (outline, same key), More ▸ "Cancel transfer" (same key) |
  | posted | "New transfer" (`stock_transfer.manage`) | More ▸ "Reverse" (`stock_transfer.reverse`, destructive, confirm dialog with reason) |
  | cancelled / reversed | "New transfer" (`stock_transfer.manage`) | none |
  Confirm dialogs (all name the document):
  - Post (`POST /api/stock-transfer/:id/post`): "Move 1 line from Main Store to Shop Floor?" body lists the lines; button "Post transfer", running "Posting…" (BR-STR-11, 31).
  - Cancel (`POST …/cancel`, More menu): "Cancel ST-2026-0002? It posts nothing and cannot be reopened." No reason field (BR-STR-10). Buttons: "Keep draft" (outline) and "Cancel transfer" (destructive, the one primary).
  - Reverse (`POST …/reverse`, body `reason`): reason textarea (required, 1 to 500, counter) + text "Moves the stock back at the same cost." Button "Reverse transfer" (danger tone, the dialog's one primary), running "Reversing…" (BR-STR-19..23).
  - Refusals (`STR_INSUFFICIENT_STOCK`, `STR_ZERO_COST`, `STR_REVERSE_SHORT`, `STR_LOCATION_INACTIVE`, `STR_NOT_DRAFT` / `STR_NOT_POSTED`; BR-STR-12, 13, 16, 17, 21, 22) keep the dialog open and show the server `message` in plain words in the dialog (e.g. "Line 1: only 80 kg left at Shop Floor"). Nothing changes; the user may close.
- **States:** loading = `DetailHeader loading` + skeleton cards · error = `ErrorState` + Try again · 404 = `EmptyState` "Transfer not found" + "Back to stock transfers" · no permission: actions not rendered, header keeps height.
- **Permissions:** `inventory.view` opens; actions per the table; floor supervisor sees a read-only page.

```
+------------------------------------------------------------------+
| < Stock transfers                                                |
| ST-2026-0001  [Posted]   Main Store -> Shop Floor                |
| ====                  [ More v ]        [ New transfer ] (primary)|
| +-- Lines ---------------------------+ +-- Details -------------+ |
| | Item        Qty      Rate    Value | | Created  Asha, 18 Nov  | |
| | ADC12 ingot 200 kg  ₹213.33 ₹42,666.00| | Posted   Asha, 18 Nov  | |
| |                     Total ₹42,666.00| | Note     Weekly issue  | |
| +------------------------------------+ +-- History -------------+ |
|                                        | Posted / Created ...   | |
|                                        | View stock movements > | |
+------------------------------------------------------------------+
```

### Move stock (change to the existing Stock screen)
- **Purpose:** from an item's location balance, start a draft with that item and source filled in (BR-STR-29). Answers open question 5.
- **Pattern:** a row action on the existing stock list; no new screen. The stock view is one row per item per location, so the action sits on that row.
- **Fields:** none new; the row comes from `GET /api/asset/inventory/stock`. Passes `item` and `from` (location id) to `/inventory/stock-transfers/new?item=<id>&from=<id>`; the form reads them and opens with line 1 filled. An unknown or inactive id is ignored (blank form).
- **Actions:** "Move stock" (outline, small, last column, `stock_transfer.manage`; not rendered without the key, and hidden on rows with zero balance or a `vendor_premise` / virtual location, BR-STR-03). No dialog. Keyboard: reachable as a normal button in the row.
- **States:** inherits the stock list states. **Permissions:** `stock_transfer.manage`.

```
| Item         Location     On hand      Value        |            |
| ADC12 ingot  Main Store   1,500 kg     3,20,000.00  | [Move stock]|
| ADC12 ingot  Shop Floor   0 kg         –            |  (hidden)  |
```

### Location form (change to the existing Locations screen, BR-STR-32)
Text only. Type select gets one new option "Store" (type `store`; hint: "Shop floor, quarantine, re-melt bin"). No supplier field for `store` (as for the other non-vendor types). Not virtual. Several allowed, so no "already exists" block. Permission unchanged.

```
Type  [Store            v]   options: Main store, Finished goods, Scrap yard,
Hint  Shop floor, quarantine, re-melt bin   Vendor premise, Store (new)
```

## Status map (add to `src/lib/status-tone.ts` as `doc="st"`, existing tones only)
| Status | Label | Tone | Why |
|---|---|---|---|
| draft | Draft | neutral | not started |
| posted | Posted | success | done |
| cancelled | Cancelled | closed | filed, no effect |
| reversed | Reversed | closed | filed, undone; the label and icon tell it from Cancelled |

## Choices made
Design choices not asked of the owner. spec-analyst moves these rows into `../assumptions.md`.
| Question | Choice | Source |
|---|---|---|
| — | Moved to `../assumptions.md` (A-20..A-29) by spec-analyst, 2026-11-20. | |
