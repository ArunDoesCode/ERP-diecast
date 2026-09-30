# DiecastOS Approval Policy Engine - Reference Documentation

## 1. Overview

The DiecastOS Approval Policy Engine is a rule-based system that determines who needs to approve Purchase Requests (PR), Purchase Orders (PO), and Subcontracting Orders (SCO) based on document type, category, amount, and special flags.

**Core Principle:** Specificity wins. More specific policies override generic ones.

---

## 2. Document Types & Categories

### Document Types

| Code  | Name                 | Description                            |
| ----- | -------------------- | -------------------------------------- |
| `pr`  | Purchase Request     | Internal request to purchase something |
| `po`  | Purchase Order       | Formal order sent to a supplier        |
| `sco` | Subcontracting Order | Job work sent to an external vendor    |

### Categories (Sub-Document Types)

| Value            | Description                                  |
| ---------------- | -------------------------------------------- |
| `any`            | Applies to all categories (generic fallback) |
| `sale_order`     | Linked to a customer sale order              |
| `stock_reorder`  | Standard inventory replenishment             |
| `maintenance`    | Machine spares, repairs, MRO                 |
| `tooling`        | Die bases, H13 steel, tool room supplies     |
| `subcontracting` | Outsourced CNC, plating, external QA         |
| `misc`           | Admin, PPE, general factory supplies         |

---

## 3. Approval Roles

| Role               | Responsibility                                            |
| ------------------ | --------------------------------------------------------- |
| `super-admin`      | System administrator (bypasses most rules)                |
| `owner`            | Factory owner - final authority on high-value items       |
| `back_office`      | Admin/procurement staff - handles routine approvals       |
| `floor_supervisor` | Production floor manager - oversees operational purchases |

---

## 4. Policy Matching Logic

### Step 1: Gather Document Context

When a document is submitted for approval, collect:

- **Document Type:** PR, PO, or SCO
- **Category:** tooling, maintenance, etc. (or "any")
- **Total Amount:** in paise (1 INR = 100 paise)
- **Special Flags:** is_sale_order_linked

### Step 2: Query Matching Policies

Find all ACTIVE policies where:

- Document Type matches
- Category is exact match OR policy Category = "any"
- Amount falls within min/max range (if specified)
- Special flags match (if specified)

### Step 3: Rank by Specificity (Highest to Lowest)

This is enforced directly by the DB query in `approvalRepository.findMatchingActivePolicy`
(a `CASE` expression ordered ahead of priority), not just a conceptual guideline:

| Rank | Criteria                               | Example                   |
| ---- | -------------------------------------- | ------------------------- |
| 1    | Exact Category + Amount constraints    | Tooling PR under ₹50k     |
| 2    | Exact Category + No Amount constraints | All Maintenance PRs       |
| 3    | "any" Category + Amount constraints    | PRs under ₹10k (any type) |
| 4    | "any" Category + No Amount constraints | Catch-all fallback        |

### Step 4: Apply Priority Number

Within the same specificity tier, **lower priority number wins** (1 is highest priority).

### Step 5: Execute Approval Chain

- If `auto_approve: true` → Document approved immediately
- If `auto_approve: false` → Create approval request and assign first approver

---

## 5. Amount Reference (in Paise)

| Amount    | Paise      | Description               |
| --------- | ---------- | ------------------------- |
| ₹10,000   | 1,000,000  | Small purchases           |
| ₹20,000   | 2,000,000  | Medium job work           |
| ₹25,000   | 2,500,000  | Small PO threshold        |
| ₹50,000   | 5,000,000  | Medium-to-large threshold |
| ₹1,00,000 | 10,000,000 | Large PO threshold        |

---

## 6. Policy Coverage Summary

### PR (Purchase Request) - 8 Policies

| Priority | Category         | Amount Range | Approval Chain                 |
| -------- | ---------------- | ------------ | ------------------------------ |
| 1        | tooling          | Any          | Owner                          |
| 2        | maintenance      | Any          | Floor Supervisor → Owner       |
| 3        | any (Sale Order) | < ₹50k       | Back Office                    |
| 4        | any (Sale Order) | ≥ ₹50k       | Back Office → Owner            |
| 5        | subcontracting   | Any          | Floor Supervisor → Back Office |
| 10       | any              | < ₹10k       | Back Office                    |
| 11       | any              | ₹10k - ₹50k  | Back Office → Owner            |
| 12       | any              | ≥ ₹50k       | Owner                          |

### PO (Purchase Order) - 5 Policies

| Priority | Category    | Amount Range | Approval Chain           |
| -------- | ----------- | ------------ | ------------------------ |
| 1        | tooling     | Any          | Owner                    |
| 2        | maintenance | Any          | Floor Supervisor → Owner |
| 5        | any         | < ₹25k       | Back Office              |
| 6        | any         | ₹25k - ₹1L   | Back Office → Owner      |
| 7        | any         | ≥ ₹1L        | Owner                    |

### SCO (Subcontracting Order) - 3 Policies

| Priority | Category       | Amount Range | Approval Chain                 |
| -------- | -------------- | ------------ | ------------------------------ |
| 1        | subcontracting | < ₹20k       | Floor Supervisor               |
| 2        | subcontracting | ₹20k - ₹50k  | Floor Supervisor → Back Office |
| 3        | subcontracting | ≥ ₹50k       | Floor Supervisor → Owner       |

### Fallback Policies - 3 Policies

Priority 99 for each document type (PR, PO, SCO) with category "any" to catch unmatched edge cases.

---

## 7. Real-World Scenarios

### Scenario 1: Expensive Tooling Purchase

**Input:** Tooling PR for ₹1,50,000 (H13 steel die base)
**Matched Policy:** Priority 1 (Tooling PR)
**Result:** Owner approval required
**Why:** Tooling is critical capital expenditure regardless of amount

### Scenario 2: Small Office Supply Purchase

**Input:** Misc PR for ₹5,000 (office stationery)
**Matched Policy:** Priority 10 (Generic PR under ₹10k)
**Result:** Back Office approval
**Why:** Small routine purchases don't need owner attention

### Scenario 3: Customer-Funded Purchase

**Input:** Sale Order linked PR for ₹30,000
**Matched Policy:** Priority 3 (Sale Order PR under ₹50k)
**Result:** Back Office approval (fast track)
**Why:** Customer orders need quick turnaround

### Scenario 4: Machine Maintenance

**Input:** Maintenance PR for ₹80,000 (furnace repair)
**Matched Policy:** Priority 2 (Maintenance PR)
**Result:** Floor Supervisor → Owner approval chain
**Why:** Machine downtime is critical but high value needs owner sign-off

### Scenario 5: Subcontracting Job Work

**Input:** SCO for ₹35,000 (CNC machining)
**Matched Policy:** Priority 2 (SCO Medium Job Work)
**Result:** Floor Supervisor → Back Office approval
**Why:** Production needs to verify the job, back office handles payment terms

---

## 8. Configuring Policies

Two complementary ways to configure policies — pick whichever fits the situation:

### A. Baseline / bulk config — the seed script (replaces hand-run SQL)

`scripts/seed-approval-policies.ts` holds the full baseline policy set (the same policies
listed in section 6 above) as a typed array, validated against the same Zod schema
(`createApprovalPolicySchema`) the CRUD API uses. Run it with:

```bash
bun scripts/seed-approval-policies.ts
```

- **Idempotent** — upserts on `(priority, docType, subDocType)`, the same uniqueness the
  DB enforces, so rerunning it (fresh dev DB, CI, onboarding a new dev) is always safe.
- **No manual `created_by` fixing** — it looks up an active `super-admin` employee at run
  time instead of a hardcoded ID.
- **Git-diffable** — editing a policy is editing the array in that file and rerunning the
  script; the change shows up in a normal PR diff, not a one-off SQL statement someone ran
  by hand and nobody else sees.

To add or change a baseline policy: edit the `POLICIES` array in
`scripts/seed-approval-policies.ts`, then rerun the script.

### B. Ad-hoc / runtime tuning — the CRUD API

For a single one-off change in a running environment (no redeploy, no rerunning a
script), use the policy endpoints under `/api/approval` (`requireRole("super-admin")` for
writes) — `src/routes/approval.ts` / `approvalController.ts` / `approvalService.ts`. This
is the same code path the seed script's data eventually lives in; either route ends up as
rows in `approval_policies`.

---

## 9. Approval Chain JSON Structure

```json
[
  {
    "level": 1,
    "role": "floor_supervisor",
    "approverType": "role"
  },
  {
    "level": 2,
    "role": "owner",
    "approverType": "role"
  }
]
```

**Fields:**

- `level`: Sequential approval order (1 = first approver)
- `role`: The role name that must approve
- `approverType`: Always "role" (specific employee approvals removed)

---

## 10. Key Design Decisions

1. **Single Category Enum:** One `procurement_category` enum used across PR, PO, and SCO for consistency
2. **"any" as Default:** The value "any" replaces NULL to avoid Postgres unique index issues
3. **Amount in Paise:** All amounts stored as integers in paise to avoid floating-point errors
4. **Priority Numbering:** Lower numbers = higher priority. Gaps (1, 2, 3, 10, 11, 12) allow inserting new policies between existing ones
5. **Fallback Policies:** Priority 99 catch-all ensures no document gets stuck without an approval path

---

## 11. Troubleshooting

### Foreign Key Error on Insert

If you get: `violates foreign key constraint "approval_policies_created_by_employees_id_fkey"`
while using the CRUD API directly (not the seed script — that resolves this automatically),
find a valid `super-admin` employee ID:

```sql
SELECT id, name FROM employees WHERE role_id = (SELECT id FROM roles WHERE name = 'super-admin') LIMIT 1;
```

### No Policy Matched

If a document doesn't match any policy, it falls back to Priority 99 which routes to Owner. Check that:

- The document category exists in the enum
- The amount is within a valid range
- The policy is set to `is_active: true`

### Wrong Policy Matched

Check the specificity hierarchy. If a generic policy is winning over a specific one, verify:

- The specific policy has `is_active: true`
- The priority numbers are correct (lower = wins)
- The category values match exactly

---

## 12. Future Enhancements

- Add department-based approvals
- Add supplier-specific approval rules
- Add time-based auto-approval for urgent items
- Add approval delegation for out-of-office scenarios

---

_Document Version: 1.1_
_Last Updated: 2026-08-12_
_System: DiecastOS Approval Policy Engine_
