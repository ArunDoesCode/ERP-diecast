---
module: <kebab-name>
approved_on:                 # set by /freeze when the owner says yes
---

# <Feature name> — for your approval

> The only file you read. Max 60 lines (pictures not counted). No links, no rule ids.
> Answer each card with a letter. Everything else is decided by the agents and logged.

## 1. What you asked for
3 lines, from the brief, in the owner's words.

## 2. What the user will be able to do
5–8 plain lines. Then one worked example with real numbers:

> Example: order for 2,000 pcs of housing HSG-MC. Each piece needs 0.42 kg of ADC12 → 840 kg.
> Stock has 500 kg. The system raises one purchase request line: ADC12, 340 kg.

## 3. Screens
One picture per screen, one line under each.

![<screen name>](design/screens/<screen>.png)
<What the user does on this screen, in one line.>

## 4. Decisions for you
Max 7 cards. More than 7 = the feature is too big and gets split.

### Card 1 — When stock covers only part of the need, how much should the purchase request ask for?
- **A (recommended):** Only the shortfall. Need 840 kg, stock 500 kg → request 340 kg.
- **B:** The full need, 840 kg, and leave the stock untouched.
- **For the factory user:** With A, back office sees smaller requests and stores must keep stock counts
  right. With B, requests are simple but the plant buys metal it already has.
- **Other parts of the system:** Purchase requests will accept a request raised by the system, with no
  human requester.
- **Cost:** A: no extra build time. B: no extra build time, but more cash tied up in metal.
- **Your answer:**

### Card 2 — <question>
- **A (recommended):** …
- **B:** …
- **For the factory user:** …
- **Cost:** …
- **Your answer:**

## 5. Decided for you — please confirm
Cases that change money, stock, tax or who may do what, where ERPNext, Odoo and SAP all do the same.
One plain line each. Say "no" to a line and it becomes a card.
- Receiving more than was ordered is refused.
- <one line per such case>

Everything else: <N> edge cases decided by ERP benchmark, <M> technical choices logged. No reading needed.

## 6. Not included
- … (max 5 lines)
