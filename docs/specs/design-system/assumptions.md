# Design system — assumptions

> status: draft. Every choice made without the owner while drafting the spec. Append-only, never renumber.
> Tag `confirm` = changes what a factory user sees in a way that carries meaning → the owner answers
> yes / no (these five are listed in `OWNER.md` → "Decided for you — please confirm").
> Tag `info` = technical or covered by an owner card; no answer needed.

| Id | Date | Phase | Question | Choice | Source | Tag | Owner answer |
|---|---|---|---|---|---|---|---|
| A-01 | 2026-11-18 | spec | Colour of Draft | Grey (neutral). Today amber. Amber is kept for "waiting on someone" only | benchmark: Odoo shows draft in grey; one tone per meaning (plan 3.2) | confirm | |
| A-02 | 2026-11-18 | spec | Colour of Cancelled and Closed | Grey outline for both, on PR, PO and SCO. Today: PO cancelled red, SCO closed green, PR and SCO cancelled grey | benchmark: Odoo shows cancelled in grey; today's PR and SCO already do | confirm | |
| A-03 | 2026-11-18 | spec | Colour of a partly accepted GRN and a waived QA check | Partly accepted = amber (some material was refused, someone must act). Waived = grey (no judgement made). Today violet and blue | one tone per meaning (plan 3.2) | confirm | |
| A-04 | 2026-11-18 | spec | Status labels | Sentence case from one map: "Partly ordered", "Partly received", "Partly accepted", "Pending QA", "Sent back", "On time", "Due soon". Today PR, PO and GRN print the raw name with spaces | SCO already has a label map (`lib/sco-format.ts`) | confirm | |
| A-05 | 2026-11-18 | spec | Money format | Indian grouping with paise in tables, documents and forms (₹4,82,000.00); whole rupees on stat cards and page summaries. Today five files drop paise and one shows them | benchmark: ERPNext, Odoo and SAP B1 show two decimals on documents | confirm | |
| A-06 | 2026-11-18 | spec | Name of the second brand colour token | `--brand-accent` (+ `-foreground`, `-subtle`). shadcn already uses `--accent` for the hover surface, so that name stays as it is | `frontend/src/app/globals.css`, shadcn convention | info | — |
| A-07 | 2026-11-18 | spec | Danger tone token | Reuse `--destructive`; add `--destructive-foreground` and `--destructive-subtle`; change its value (light 0.577 → 0.53 lightness, dark 0.704 → 0.76) so text on its tint passes 4.5:1 | WCAG AA; contrast computed in `preview.html` | info | — |
| A-08 | 2026-11-18 | spec | Does success cover both "approved" and "completed"? | Yes: approved, accepted, passed, fully ordered, fully received, invoiced, material received are all green | five tones keep the screen calm; plan 3.1 names four tones + danger | info | — |
| A-09 | 2026-11-18 | spec | Is the accent a status colour? | No. It marks selection and position only (BR-DS-07) | keeps B's copper away from the amber warning tone | info | — |
| A-10 | 2026-11-18 | spec | Neutral greys | Slightly tinted (hue 250 in A, 65 in B); page is off-white, cards are white. Today greys have almost no hue | owner: "too black and white"; visible in preview, decided by card 1 | info | — |
| A-11 | 2026-11-18 | spec | `--primary` in dark mode | Value kept. Used as a fill only; coloured text on dark uses tone tokens or `--brand-accent`. The `link` button variant switches from `text-primary` to `text-brand-accent` | dark primary on dark page is about 2.5:1 as text | info | — |
| A-12 | 2026-11-18 | spec | Skeleton shimmer vs the "never looping" rule | The skeleton sweep is the one allowed loop, and only while loading | plan 3.3 lists both; this resolves the overlap | info | — |
| A-13 | 2026-11-18 | spec | Duration for the status flash and count-up | Fourth token `--motion-emphasis: 600ms` for both | plan 3.3 gives 600 ms for the flash; count-up had no value | info | — |
| A-14 | 2026-11-18 | spec | When does the status flash run? | Only after the current user's own action, never on background refresh | avoids rows flashing on their own during long sessions | info | — |
| A-15 | 2026-11-18 | spec | When does count-up run? | Once per page load, numbers only, never on refetch | plan 3.3 "number count-up on dashboard cards" | info | — |
| A-16 | 2026-11-18 | spec | Exit speed of dialogs and toasts | Enter 180 ms, exit 120 ms; scale from 0.96; toast slides 8 px | common practice: exits faster than entrances | info | — |
| A-17 | 2026-11-18 | spec | Toast timing | Success closes after 4 s, errors stay until closed, at most three visible | sonner defaults, errors made persistent | info | — |
| A-18 | 2026-11-18 | spec | Badge shape | 11 px text (today 10 px), leading dot, pill; finished or cancelled = outline with hollow dot | readability on long sessions; colour not the only signal | info | — |
| A-19 | 2026-11-18 | spec | Density values and storage | Comfortable 36 px / 13 px, compact 30 px / 12 px (today's size), kept in `localStorage` per browser | owner card 2 decides the default | info | — |
| A-20 | 2026-11-18 | spec | Date format | `28 Nov 2026`, date-time `28 Nov 2026, 14:05`, always IST; empty value shows `–` | matches `formatScoDate` in use today | info | — |
| A-21 | 2026-11-18 | spec | Where do logout, role and the light/dark switch go? | Into a user menu in the new top bar; the sidebar header shows the brand instead of "Role: …" | plan 3.5 (top bar with user menu, sidebar brand) | info | — |
| A-22 | 2026-11-18 | spec | Top-bar search | A visible, disabled box until a search feature is specified | plan 3.5 "global search stub" | info | — |
| A-23 | 2026-11-18 | spec | Approvals count in the sidebar (shown in the preview) | Not in this work; it needs a count query and ships with the home dashboard feature | no backend change in this spec | info | — |
| A-24 | 2026-11-18 | spec | Where do shared components live? | `frontend/src/components/shared/`; maps and formatters in `src/lib/` | path already named in `frontend/design/motion-allowlist.json` | info | — |
| A-25 | 2026-11-18 | spec | Chart colours | Five hues in fixed order (emerald, blue, amber, violet, rose; B swaps in copper and a pink); no charts library chosen | plan 3.1 "five distinct hues" | info | — |
| A-26 | 2026-11-18 | spec | How were the pictures in `design/screens/` made? | macOS Quick Look rendering of `preview.html` (styles only, no script, about 950 px wide). The installed browser would not run headless in the sandbox. Motion was not captured; contrast numbers in the pictures come from the same formula run in Node | tooling limit on this machine | info | — |
