# BOM — screens

> Written by ui-ux-designer from `../spec.md`. Sources are endpoints of `api.md` (all under `/api/bom`, short names below). Patterns, components and tokens
> from the `design-system` skill. Pictures are wireframes, not screenshots (no running app/DB allowed in this run).

## Screen list
| Screen | Route | Pattern | Picture |
|---|---|---|---|
| BOM list | `/bom` | list | `screens/bom-list.html` |
| Part page (revisions, tree, needs, used in) | `/bom/part/[itemId]?rev=B` | detail, two-pane | `screens/part-page.html` |
| BOM form (create / edit draft) | `/bom/new?part=<itemId>`, `/bom/[bomId]/edit` | form, full page | `screens/bom-form.html` |
| Release dialog (change summary) | dialog on the part page | form (dialog) | `screens/release-dialog.html` |

Also on the part page, as small dialogs (no own picture): Retire, Delete draft (both confirm, name the document).
Part page default revision: active, else the open draft, else the newest. `?rev=` picks another one.

### BOM list
- **Purpose:** back office / purchase finds a BOM, or starts one. Entry to everything else.
- **Pattern:** list (PageHeader + FilterBar + DataTable + Pagination).
- **Fields:** BOM no. `BOM-<SKU>-<rev>` (mono accent link to part page `?rev=`) · status (`StatusBadge doc="bom"`) · part (SKU + name) · kind (text: Casting / Job work / Assembly) · released on (`formatDate`, `–` for draft). Source: `GET /api/bom` rows `{number, status, partSku, partName, kind, revision, releasedAt}`; filters `status` (csv), `kind`, `q`; `page`, `pageSize` (BR-BOM-25).
- **Filters (URL/nuqs):** quick chips by status (Active + draft default, Active, Draft, Retired, All); kind select; part search box. Page size 10 default, 1–100 (BR-BOM-25).
- **Actions:** "Create BOM" (primary, PageHeader) · `bom.manage` · opens `/bom/new` (form picks the part) · no dialog · BR-BOM-01, 24. Empty list without filters: same action in EmptyState.
- **States:** empty "No BOMs yet" + Create BOM · empty with filters "Nothing matches these filters" + Reset · loading 8 skeleton rows · error `ErrorState` + Try again · no permission: route shows the shell's "no access" page (no `bom.view`).
- **Permissions:** `bom.view` opens. No `bom.manage`: "Create BOM" not rendered.

```
+--------------------------------------------------------------+
| Bills of materials                          [ Create BOM ]   |
| [Active+draft][Active][Draft][Retired][All] Kind[v] [search] |
| BOM no.          Status   Part           Kind      Released  |
| BOM-HSG-RC-B     Draft    HSG-RC Housing Casting   -         |
| BOM-HSG-RC-A     Active   HSG-RC Housing Casting   12 Nov 26 |
| BOM-HSG-MC-A     Active   HSG-MC Machined Job work 14 Nov 26 |
| 1 to 10 of 23                         < 1 2 3 >  10 per page |
+--------------------------------------------------------------+
```

### Part page
- **Purpose:** see one part's BOM (a revision), its levels, what N pieces need, where it is used; take the one next step.
- **Pattern:** detail, two-pane (owner standard). `DetailHeader` on top; left pane (wide) = the revision; right pane (narrow, ≤ 420 px, stacks below under 1100 px) = side panels. Heading-level pane split is the owner's standard and overrides the skill's one-column default (Choices made).
- **Fields:** as listed under DetailHeader, Left pane and Right pane below; every value comes from the Data line (`GET /:id` header and lines, `casting.computed`, audit created/released by/at and reason; formats `formatQty`, `formatDate`, `formatDateTime`; empty = `–`).
- **Data:** revisions = `GET /api/bom?partId=` (newest first); selected revision = `GET /api/bom/:id` (header, lines, `casting.computed`, `inactive` tags, audit created/released by/at, reason, `nextStep`, `nextRevision`, `activeBomId`); tree = `GET /:id/tree`; needs = `GET /needs`; used in = `GET /items/:itemId/where-used`; history of the part = `GET /parts/:partId/history` (History panel 1b). A part with no revision = empty `GET /api/bom?partId=` list.
- **DetailHeader:** docNo `BOM-<SKU>-<rev>` · status badge · meta: part (SKU name), kind, created by/at, released by/at (BR-BOM-23) · back to `/bom`. When the part has no revision: no docNo, the part SKU (+ name) is the title and the badge is omitted. Breadcrumb last item (`useBreadcrumbLast`) = docNo `BOM-<SKU>-<rev>`, or the part SKU when no revision exists; on the form: "New BOM" (create) or the docNo (edit). Rev with open draft by another viewer: draft badge shown in the revision list.
- **Left pane, cards in order:**
  1. *Header:* kind-specific fields. Casting: alloy item, net weight, shot weight, cavities, melt loss %, casting reject % (kg `formatQty` 3 dec, % 2 dec) and the computed read-only rows: poured weight per piece, casting yield %, alloy per good piece (BR-BOM-05, labelled "calculated"). Job work: sent item, send : return, job worker, service, loss % (no price). Assembly: none.
  2. *Change reason* (released revs): text from release (BR-BOM-12/23).
  3. *Level tree:* a flat `DataTable` (no new component): one row per node, name indented by `level`, a chevron icon button on each expandable row (focusable, Enter / Space toggles, `aria-expanded`). Columns: Item (`sku` + `name`, link to `/bom/part/<itemId>`) · Qty per piece (`formatQty`, unit, right) · BOM (`kind` of its active BOM + `revision`, or a tag). Tags via new status-tone doc `bomNode`: `no_bom` = "No BOM" (neutral), `inactive` = "Inactive" (closed), `loop` = "Loop" (danger); "Buy as is" is plain text, no colour. Node fields `{itemId, sku, name, unit, qtyPerPiece, treatment, kind, revision, inactive, children[]}`; `treatment` values per api.md: cast, job_work, assemble, buy, buy_as_is, no_bom, loop. Walks children per BR-BOM-09 up to 10 levels.
- **Right pane panels:**
  1. *Revisions:* all revisions of the part, newest first: number · status badge · released on; current one marked (accent = selection); link switches `?rev=`.
  1b. *History:* `GET /parts/:partId/history` (paginated), newest first, last 20 shown, "Show all" pages on. Columns: When (`formatDateTime`) · Who (`changedBy.name`) · Action (create, edit, delete, release, retire) · Revision (`revision`) · Reason. Empty: "No history yet".
  2. *Needs preview:* "Pieces" number input (whole, 1–1,000,000, label above) + "Calculate" (secondary, `GET /needs?partId&qty&levels=all`). Result from `rows[]` (indent by `level`): Part (`sku`) · Do from `treatment` (cast = Cast, job_work = Send, assemble = Assemble, buy / buy_as_is / no_bom = Buy) · Qty (`qty` + `unit`; cast rows add `pourQty` and `alloyKg`); then "To buy" from `toBuy[]` (Item · Qty + unit). `no_bom` / `noBom` = "No BOM" tag. Errors: 400 `BOM_LOOP` / `BOM_TOO_DEEP` / `BOM_TOO_LARGE` inline; `levels=1` not used here. Footer note "Reads no stock, creates nothing." Only for a part with an active revision (BR-BOM-18): 409 `NO_ACTIVE_BOM` shows "No active revision, release one to preview needs"; on a draft/retired revision the panel says "Needs preview uses the active revision" with a link via `activeBomId`. Result is not auto-run; Enter in the field calculates.
  3. *Used in:* `GET /items/:itemId/where-used` (active revisions, paginated): BOM no. (`number`, link) · part (`partSku`) · role (`role`: Line / Sent item / Alloy) · qty per piece (`qtyPerPiece`, `buyAsIs` tag) (BR-BOM-19). Empty: "Not used in any active BOM."
- **Next step (one primary button in DetailHeader, BR-BOM-24):** the view renders `nextStep` from `GET /:id` (server already folds in the caller's permissions; the view does not recompute): `release` = "Release" · `waiting_for_release` = plain text · `start_revision` = "Start revision <`nextRevision`>" (`POST /parts/:partId/revisions`) · `open_active` = link to `activeBomId` · `create` = "Create BOM". Meaning: draft → "Release" (`bom.release`; without it the plain text "Waiting for release", not a button) · active → "Start revision <next>" (`bom.manage`) · retired → "Open active revision" (link) or "Start revision <next>" if none is active · part without BOM (item, no revision) → "Create BOM" (`bom.manage`) and the page shows EmptyState "No BOM for HSG-RC" with the Used in panel still present.
- **Other actions ("More" menu, DetailHeader):** Edit (draft, `bom.manage`, goes to form, BR-BOM-11) · Delete draft (`bom.manage`, confirm dialog "Delete BOM-HSG-RC-B?", BR-BOM-15) · Retire (active, `bom.release`, dialog lists every active BOM that uses the part + required reason ≤ 500, BR-BOM-16). Retire dialog states: affected-BOM list loading = skeleton lines (Retire stays disabled until it loads) · list error = `ErrorState` + Try again (Retire disabled) · none affected = "No active BOM uses this part" (Retire allowed). Start revision with an open draft: 409 `BOM_DRAFT_OPEN` (`details.draftId/revision`) shown as an error toast naming draft B with link (BR-BOM-14). Edit/Delete on a released revision: 409 `BOM_NOT_DRAFT` toast. Retire: `POST /:id/retire {reason 3–500}`, affected BOMs from where-used of the part, 409 `BOM_NOT_ACTIVE` toast. Delete: `DELETE /:id`. Running action: button label "Releasing…", "Retiring…", "Deleting…".
- **States:** loading `DetailHeader loading` + skeleton cards · error `ErrorState` + Try again (404 "BOM not found") · empty tree: assembly draft with no lines "No components yet" + Edit · needs preview empty "Enter pieces and press Calculate" · needs preview error: red inline message from server (400 loop/levels, BR-BOM-10) · no permission: no `bom.view` → shell no-access; see Permissions.
- **Permissions:** `bom.view` opens. Hidden when missing: Edit/Delete/Start/Create (`bom.manage`); Release/Retire (`bom.release`). Header keeps its height.
- **Picture:** `screens/part-page.html`

```
+--------------------------------------------------------------+
| < BOM   BOM-HSG-RC-A [Active]            [Start revision B] [More v] |
| Part HSG-RC · Casting · Released by Arun 20 Nov 2026         |
| +--------------------------------+ +-----------------------+ |
| | Header (alloy ADC12, net 0.850 | | Revisions             | |
| |  shot 2.000, 2 cav, 3 %, 5 %)  | | A Active 20 Nov  <-   | |
| |  Calculated: yield 85.0 %      | | Needs preview         | |
| | Level tree                     | | Pieces [1000][Calc]   | |
| | v HSG-RC     1   Casting       | | ADC12 900.100 kg ...  | |
| |   BUSH-M6    2   No BOM        | | To buy: ...           | |
| |   ADC12   0.882 kg No BOM      | | Used in: HSG-MC A  1  | |
| +--------------------------------+ +-----------------------+ |
+--------------------------------------------------------------+
```

### BOM form (create / edit draft)
- **Purpose:** back office writes a draft: pick part and kind, fill kind fields, add lines.
- **Pattern:** form, own page (> 6 fields); two columns from 768 px; label above each 36 px field; fields keep `min-h-19`.
- **Data:** create `POST /api/bom {partId, kind, …}` (409 `BOM_ALREADY_EXISTS` → "HSG-RC already has a BOM" + link to its part page, which offers Start revision); edit `PATCH /:id` (full replace of header and lines; 409 `BOM_NOT_DRAFT`); load `GET /:id`. Pickers: `GET /api/asset/items?q&isActive` (needs `inventory.view`, held by the same seed roles), `GET /api/supplier/:supplierId/listServices`. Write responses (create, save, release, retire, start revision) return only `{id, status, version}`: the view refetches `GET /:id` after each write. A draft may be saved incomplete; release checks completeness. Body: `casting {alloyItemId, netWeightKg, shotWeightKg, cavities, meltLossPct, castingRejectPct}`, `jobWork {sentItemId, sendQty, returnQty, jobWorkerId, serviceId, jobWorkLossPct}`, `lines[{componentItemId, qtyPerPiece, buyAsIs, note ≤ 200}]`. Calculated rows: `casting.computed {pouredWeightKg, yieldPct, alloyPerGoodPieceKg}` after save; while typing the form shows the same formulas client-side, display only.
- **Sections (cards):** 1 *Part and kind:* part (searchable select of active pcs/set items; prefilled and locked when opened from a part; on edit locked), kind (radio: Casting / Job work / Assembly; changeable only in draft, BR-BOM-08). Revision letter shown read-only after create. 2 *Casting data* (kind = casting): alloy (select, active kg items), net weight, shot weight (kg, 3 dec, right-aligned, unit suffix), cavities, melt loss %, casting reject %; the calculated figures show live, read-only. Help line under shot weight: "At least net × cavities" (BR-BOM-04). 3 *Job work* (kind = job work): sent item (select pcs), send, return (whole, default 1 : 1), job worker (select suppliers of type service provider / both), service (select, only that job worker's active services, resets when worker changes), loss %. 4 *Components:* editable lines: item (select, active, no services) · qty per piece (3 dec) · "Buy as is" checkbox · note · remove. Add line button; max 50. Below 1024 px each line stacks inside its card (fields one per row, remove button at the end of the line). Hidden for job work (BR-BOM-07); required for assembly (BR-BOM-08). 5 *Change reason* is asked at release, not here.
- **Actions:** Cancel (back) · "Save draft" (primary, `bom.manage`; create or update; "Saving…") · field errors under fields from 400 with rule text; a loop error shows the path "HSG-RC → HSG-MC → HSG-RC" in an error banner at the top (BR-BOM-10). Release is not on this page (one place: part page).
- **States:** loading edit data: skeleton fields · error loading: `ErrorState` + Try again · not draft (409 / opened by URL): `EmptyState` "This revision is released and cannot be edited" + "Open BOM" and, with `bom.manage`, "Start revision" · inactive item on a saved draft: line tagged "Inactive", save refused (BR-BOM-21) · no permission: no `bom.manage` → no-access page.
- **Permissions:** `bom.manage`.
- **Picture:** `screens/bom-form.html`

```
+--------------------------------------------------------------+
| New BOM                                                      |
| Part [HSG-RC v]            Kind (o) Casting ( ) Job ( ) Asm  |
| Casting data                                                 |
| Alloy [ADC12 v]       Net kg [0.850]   Shot kg [2.000]       |
| Cavities [2]   Melt loss % [3]   Reject % [5]                |
| Calculated: poured 1.000 kg · yield 85.0 % · alloy 0.882 kg  |
| Components                                                   |
| Item [BUSH-M6 v]  Qty/pc [2.000] [ ] Buy as is  Note [..] x  |
| [ + Add line ]                                               |
|                                      [ Cancel ] [Save draft] |
+--------------------------------------------------------------+
```

### Release dialog
- **Purpose:** owner checks what changes against the active revision, gives the reason, makes the draft live.
- **Pattern:** dialog (change summary + 1 field); opened by "Release" on a draft.
- **Fields:** from `GET /:id/change-summary` (`firstRevision`, `against.revision`, `header[{field, old, new}]`, `lines.added/removed/changed`, `canRelease`, `problems[{code, field, message}]`; BR-BOM-13). Shown: *Lines* groups Added / Removed / Changed with item, old → new qty or buy-as-is; *Header* changed fields as "Melt loss 3 % → 4 %" (units via `format.ts`); rev A shows "First revision, nothing to compare". Line "A (active) will be retired" for rev B+. The summary body scrolls inside the dialog (max height about 60 vh); the reason field and the Cancel / Release actions stay visible. Change reason: textarea, label above, required from rev B, ≤ 500 chars with counter.
- **Actions:** Cancel · "Release BOM-HSG-RC-B" (primary, `bom.release`, `POST /:id/release {reason}`, "Releasing…", BR-BOM-12, 17). `problems[]` are listed on open and Release is disabled when `canRelease` is false. Failure 400 `BOM_RELEASE_INVALID` (`details.problems[]`): list of every problem inside the dialog (item inactive, loop, data incomplete), nothing changes, dialog stays open. 409 `BOM_NOT_DRAFT` / `BOM_RELEASE_CONFLICT` (another release won): message "HSG-RC changed meanwhile, reload" + Reload.
- **States:** summary loading skeleton lines · summary error with Try again (Release disabled) · no changes found: "No changes against rev A" (release still allowed with reason) · no permission: button never shown.
- **Permissions:** `bom.release`.
- **Picture:** `screens/release-dialog.html`

```
+------------------------------------------------+
| Release BOM-HSG-RC-B                       [x] |
| Changes against rev A (active, will be retired)|
| Lines   Changed  BUSH-M6   qty 2 -> 3          |
| Header  Melt loss  3 % -> 4 %                  |
| Change reason *                                |
| [ 3 bushes per housing.....................  ] |
|                                  0 / 500       |
|                     [ Cancel ] [ Release B ]   |
+------------------------------------------------+
```

## Status map
New doc `bom` in `status-tone.ts` using existing tones only (answers open question 4): draft = neutral · active = success · retired = closed. Second new doc `bomNode` for tree tags: `no_bom` = neutral · `inactive` = closed · `loop` = danger. "Buy as is" = plain text, no colour. Same colours in list, header, revision panel.

## Choices made
| Question | Choice | Source |
|---|---|---|

Moved to `../assumptions.md` (A-37..A-44) by spec-analyst, pass 2.
