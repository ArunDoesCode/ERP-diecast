# Manual UI checklist — branch work/m1 (auth-setup, known-defects, PR, approval, PO)

Also see: GRN + GRN stock, inventory, suppliers checklists in `.pipeline/m1-stock/manual-ui-checklist.md`.

Setup: `bun run db:reset` (fixture data). Logins `<role>@diecast.local`, password = `SEED_USER_PASSWORD`:
ow = owner, bo = back_office, fs = floor_supervisor, qa = qa_inspector, dd = die_designer.
sa = the super-admin (first admin, not a fixture user). Use two browsers/profiles when a check needs two people.

## 1. Menus and buttons follow grants (BR-AUTH-13, 14, 15, 24)
- [ ] sa, `/setup` > Roles > back_office: untick `po.manage`, save. bo, next click (no re-login): PO menu gone, `/purchase-orders` redirects home. Expected: BR-AUTH-12/15.
- [ ] Tick it back: PO menu returns on bo's next click.
- [ ] qa, sidebar: only screens qa's role holds (GRN, subcontracting view); no PO, PR, Setup.
- [ ] ow: no Setup menu. Type `/setup` in URL: redirected or denied.
- [ ] bo without `grn.correct` (untick it): GRN detail shows no "Correct" button. Restore.
- [ ] sa: sees every menu item and every button (including Correct, over-receipt reason box).
- [ ] Role removed from a user while logged in (sa deactivates fs): fs's next action goes to login (401).

## 2. Setup > Roles (BR-AUTH-16..20, 25) — login sa
- [ ] Tabs are Employees, Roles, Screens, Access log. No Pages or Permissions tab.
- [ ] Create role "accounts", tick a few keys grouped by module (label + one-line description each). `setup.roles.manage` not offered.
- [ ] Copy back_office as "accounts2": same keys, not marked system.
- [ ] Rename "accounts": works. Rename owner or back_office: blocked with message (system role). Super-admin role has no key list to edit.
- [ ] Delete "accounts2": works. Delete a role with an active employee: blocked, message names the count. Role only held by inactive employees: blocked too ("move them to another role").
- [ ] Rename a role used in an approval policy chain: blocked with the chain message.
- [ ] Employees tab: sa creates employee (owner cannot: no create button for ow). Only super-admin role picker includes super-admin; deactivate the only super-admin: blocked (last admin).
- [ ] Access log tab: every change above shows who, when, before/after. No edit/delete controls.

## 3. Setup > Screens (BR-AUTH-06, 15, 20) — login sa
- [ ] List comes from code; no add/delete button. Change a label, order and menu group: sidebar updates.
- [ ] Tick store role (fs) on a screen: fs gets the screen after next click, and its API opens (same as granting the key on the Roles page).
- [ ] Screen with no key (Home, Approvals): tick boxes disabled or refused with message.
- [ ] Log shows the screen change.

## 4. `isSuperAdmin` on ownership buttons (BR-PR-17, FE-SA)
- [ ] fs raises a draft PR. sa opens it: Edit and Cancel PR available; no "Submit for approval" (requester only).
- [ ] bo (another pr.manage holder) opens fs's PR: view only, no Edit, no Cancel.
- [ ] sa on PO detail: line-cancel available on a line from fs's PR; bo: not available.

## 5. Cancel PR screen (BR-KD-16, BR-PR-39, 41, 42, 43) — login fs (requester) unless noted
- [ ] Draft, pending_approval, approved PRs: "Cancel PR" button enabled. Rejected, cancelled, partial_ordered, fully_ordered: button disabled.
- [ ] Click Cancel PR: dialog asks for reason first; nothing is sent before it. Empty or 2 letters: refused. Reason "duplicate": success.
- [ ] After success: PR list (status cancelled, under the cancelled filter), detail (read-only, reason, who, when) and the approval queue (open request gone) all refresh without a page reload. Number kept.
- [ ] PR with 1 of 3 lines on a live PO: cancel shows 409 message naming the PO number and "cancel the PO first"; dialog stays open, reason kept.
- [ ] Cancel a pending_approval PR: approver's queue no longer shows it; approval trail has one "cancelled" row by the canceller.
- [ ] Cancelled PR: no Edit, no Submit, no Cancel.
- [ ] Two tabs: cancel in tab 1, then cancel again in tab 2: error message in the dialog (409), dialog stays open.

## 6. PR estimate note (BR-PR-14, BR-PR-11) — login fs
- [ ] Item with average cost 0 (never received) and standard rate 24,000 paise: add qty 10 to a PR. Estimate shows Rs 2,400.00 and a note under Estimate: "Estimate uses standard rate for: <item> (no cost history yet)".
- [ ] Item with average cost > 0 on the same PR: not listed in the note, uses average.
- [ ] After a GRN gives the item an average cost, open a draft PR again: note no longer lists it; submit recomputes.
- [ ] Submit is allowed with the note showing.

## 7. Approval policy form (BR-APR-57..60) — login sa or ow (`approval.policy.manage` is super-admin only; ow/bo view)
- [ ] Edit a policy (tooling, 25,000 to 1,00,000, 2 steps): form opens only after details load, shows category, amounts, auto-approve and every step incl. specific employees.
- [ ] Rename only, save: category still tooling.
- [ ] Change name, click Cancel, reopen: stored name shown, not the edit.
- [ ] Open edit, change a field, switch to another window and back (refetch): your edit is still there.
- [ ] Save that fails (e.g. overlapping range, 409): form stays open, values kept, server message shown.
- [ ] Good save: form closes, list and details show new values.
- [ ] bo/ow (view only): no Edit/Create buttons.

## 8. Purchase order screens (BR-PO-01..23) — login bo (fs has no PO menu: BR-PO-20)
- [ ] `/purchase-orders`: create from approved PR lines; supplier picker works for bo. Rate prefilled from price list; rate 0 refused; payment terms prefilled from supplier, 400 days refused.
- [ ] Draft PO edit: change rate, GST %, expected date; remove a line: PR line back to pending. Last line removal refused.
- [ ] Submit: PO locked (Edit unavailable); policy chosen on total incl. GST. Approver (ow) approves: PO approved, PR lines show ordered.
- [ ] Send: choose channel; email with no address refused; expected date missing refused; after send status dispatched and one "PO sent" row.
- [ ] Dispatched: Reminder / Escalate / Confirm log rows appear with correct labels (Phone call, Email, WhatsApp, In person). Delay needs date + reason; original expected date unchanged.
- [ ] Cancel: reason required (3–500), also for draft. PO with a GRN: refused. After cancel its PR lines show cancelled.
- [ ] Partial received PO: Short-close with reason works, PR line closed; Close/Invoice buttons hidden or refused until fully_received.
- [ ] Fully received: Record invoice; same invoice number twice from same supplier: 409 message. Close works after.
- [ ] Overdue list: PO with revised date in future is not listed; with past date and open qty is.
- [ ] Two tabs: send in both, one wins, other shows 409 message.
