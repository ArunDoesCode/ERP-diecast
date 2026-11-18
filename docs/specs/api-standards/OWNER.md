---
module: api-standards
approved_on:                 # set by /freeze when the owner says yes
---

# API standards clean-up — for your approval

> The only file you read. One card needs a letter.
> Say "no" to any numbered line in section 5 and it becomes a card.

## 1. What you asked for
"Clear the standards findings (216 backend, 65 frontend), then make the checks and the two hooks block.
Do the backend ones first: the missing 409 mapping, the unescaped searches, and the missing indexes."

## 2. What changes for the factory user
- A duplicate (the same email saved twice) shows "This record already exists.", not "Internal server error".
- Searching for 50% finds the text "50%". Before, % and _ meant "anything".
- Very long text and very long lists are refused, not saved and not cut short.
- "Today" is always the India date, also between midnight and 5:30 am.
- Lists and stock movements stay fast as data grows (17 database indexes added).
- No screen changes, no new buttons, no change to who may do what.

> Example: at 1:30 am on 19 Nov a purchase request with required-by date 18 Nov is refused as
> "in the past". Today the system still accepts it until 5:30 am.

For you: one command starts a branch with demo data, on your own machine only; every route is permission-tested.

## 3. Screens
None.

## 4. Decisions for you

### Card 1 — Largest order or invoice total
Today an order or invoice total above ₹2,14,74,836.47 (about ₹2.14 crore) fails to save with a server error.
- **A (recommended):** Raise all money fields to the large size now, in this work. The database can then hold
  about ₹90 lakh crore; one amount is allowed up to ₹10,000 crore. ERPNext, Odoo and SAP have no such low limit.
- **B:** Keep ₹2.14 crore for now; a bigger total is refused with a clear message. Large size becomes a later item.
- **For the factory user:** With A, an order above ₹2.14 crore just saves. With B, it must be split into smaller orders.
- **Other parts of the system:** Orders, invoices, prices and stock cost share this limit. Approval limits stay ₹1,000 crore.
- **Cost:** A: about one extra day and a change to every money field in the database. B: no extra time now.
- **Your answer:** A (owner, 2026-11-18)

## 5. Decided for you — please confirm
What ERPNext, Odoo and SAP do, or what the system already does elsewhere. One "no" turns a line into a card.
1. A duplicate the system did not catch earlier shows "This record already exists." instead of a server error.
2. Saving or deleting something tied to a missing or in-use record shows a plain "linked to another record" message.
3. In every search box, %, _ and \ are plain characters and match only themselves.
4. A search longer than 100 characters is refused.
5. Text limits: codes and SKUs 50 characters, names 200, descriptions 1,000, reasons 500, notes 2,000,
   phone 30. Longer text is refused, never cut.
6. Approval limits can be at most ₹1,000 crore; a quantity at most 1,000,000,000.
7. "Today" is the India date everywhere: required-by dates and stock movement date filters follow it.
8. One document can have at most 500 lines; a supplier at most 500 price-list items in one save.
9. A search starts at 2 characters: one letter alone shows the full list.

Everything else: 31 edge cases decided by ERP benchmark, 34 technical choices logged. No reading needed.

## 6. Not included
- The 62 colour findings on the frontend: the approved design system replaces those files.
- Telling the user which field is too long (the message stays "Validation failed").
- Faster search on very large lists, and a limit on how often one user may search.
- The browser test stopping a pull request (it runs, but does not block yet).
- Fixing the dependency audit warnings.
