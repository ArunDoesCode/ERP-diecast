/**
 * Idempotent baseline seed for approval policies (see docs/modules/approval.md).
 *
 * Replaces hand-run SQL: reruns safely (fresh dev DB, CI, onboarding a new dev) by
 * upserting on the same (priority, docType, subDocType) uniqueness the DB enforces,
 * and validates every policy against the same Zod schema the CRUD API uses before
 * touching the DB.
 *
 * Usage: `bun scripts/seed-approval-policies.ts`
 */
import { and, eq, sql } from "drizzle-orm";
import { db, disconnectDb } from "../src/db/client";
import { roles } from "../src/db/schemas/01_auth";
import { approvalPolicies } from "../src/db/schemas/02_procurement-approval";
import { employees } from "../src/db/schemas/03_hcm";
import { fallbackPolicyName } from "../src/lib/approval-fallback";
import { createApprovalPolicySchema } from "../src/types/approval.types";

const POLICIES: ReadonlyArray<
  ReturnType<typeof createApprovalPolicySchema.parse>
> = [
  // ─── PR (Purchase Request) ──────────────────────────────────────────────
  {
    name: "Tooling PR - Always Owner Approval",
    description:
      "All tooling/die purchases require owner approval due to high capital impact",
    isActive: true,
    priority: 1,
    docType: "pr",
    subDocType: "tooling",
    autoApprove: false,
    approvalChain: [{ level: 1, approverType: "role", role: "owner" }],
  },
  {
    name: "Maintenance PR - Production + Owner",
    description:
      "Maintenance purchases need production floor approval and owner sign-off",
    isActive: true,
    priority: 2,
    docType: "pr",
    subDocType: "maintenance",
    autoApprove: false,
    approvalChain: [
      { level: 1, approverType: "role", role: "floor_supervisor" },
      { level: 2, approverType: "role", role: "owner" },
    ],
  },
  {
    name: "Sale Order PR - Fast Track (<₹50k)",
    description:
      "Customer sale order linked purchases under ₹50k get fast-track approval",
    isActive: true,
    priority: 3,
    docType: "pr",
    subDocType: "sale_order",
    maxAmountPaise: 5_000_000,
    autoApprove: false,
    approvalChain: [{ level: 1, approverType: "role", role: "back_office" }],
  },
  {
    name: "Sale Order PR - Owner Review (≥₹50k)",
    description:
      "Customer sale order linked purchases ₹50k and above need owner review",
    isActive: true,
    priority: 4,
    docType: "pr",
    subDocType: "sale_order",
    minAmountPaise: 5_000_000,
    autoApprove: false,
    approvalChain: [
      { level: 1, approverType: "role", role: "back_office" },
      { level: 2, approverType: "role", role: "owner" },
    ],
  },
  {
    name: "Subcontracting PR - Production Oversight",
    description:
      "All subcontracting requests need production supervisor approval",
    isActive: true,
    priority: 5,
    docType: "pr",
    subDocType: "subcontracting",
    autoApprove: false,
    approvalChain: [
      { level: 1, approverType: "role", role: "floor_supervisor" },
      { level: 2, approverType: "role", role: "back_office" },
    ],
  },
  {
    name: "PR - Small Purchase (<₹10k)",
    description: "Small purchases under ₹10k approved by back office",
    isActive: true,
    priority: 10,
    docType: "pr",
    subDocType: "any",
    maxAmountPaise: 1_000_000,
    autoApprove: false,
    approvalChain: [{ level: 1, approverType: "role", role: "back_office" }],
  },
  {
    name: "PR - Medium Purchase (₹10k-₹50k)",
    description: "Medium purchases need back office and owner approval",
    isActive: true,
    priority: 11,
    docType: "pr",
    subDocType: "any",
    minAmountPaise: 1_000_000,
    maxAmountPaise: 5_000_000,
    autoApprove: false,
    approvalChain: [
      { level: 1, approverType: "role", role: "back_office" },
      { level: 2, approverType: "role", role: "owner" },
    ],
  },
  {
    name: "PR - Large Purchase (≥₹50k)",
    description: "Large purchases require owner approval",
    isActive: true,
    priority: 12,
    docType: "pr",
    subDocType: "any",
    minAmountPaise: 5_000_000,
    autoApprove: false,
    approvalChain: [{ level: 1, approverType: "role", role: "owner" }],
  },

  // ─── PO (Purchase Order) ─────────────────────────────────────────────────
  {
    name: "Tooling PO - Owner Approval",
    description: "All tooling purchase orders require owner approval",
    isActive: true,
    priority: 1,
    docType: "po",
    subDocType: "tooling",
    autoApprove: false,
    approvalChain: [{ level: 1, approverType: "role", role: "owner" }],
  },
  {
    name: "Maintenance PO - Production + Owner",
    description:
      "Maintenance purchase orders need production and owner approval",
    isActive: true,
    priority: 2,
    docType: "po",
    subDocType: "maintenance",
    autoApprove: false,
    approvalChain: [
      { level: 1, approverType: "role", role: "floor_supervisor" },
      { level: 2, approverType: "role", role: "owner" },
    ],
  },
  {
    name: "PO - Small Order (<₹25k)",
    description: "Small purchase orders approved by back office",
    isActive: true,
    priority: 5,
    docType: "po",
    subDocType: "any",
    maxAmountPaise: 2_500_000,
    autoApprove: false,
    approvalChain: [{ level: 1, approverType: "role", role: "back_office" }],
  },
  {
    name: "PO - Medium Order (₹25k-₹1L)",
    description: "Medium purchase orders need back office and owner approval",
    isActive: true,
    priority: 6,
    docType: "po",
    subDocType: "any",
    minAmountPaise: 2_500_000,
    maxAmountPaise: 10_000_000,
    autoApprove: false,
    approvalChain: [
      { level: 1, approverType: "role", role: "back_office" },
      { level: 2, approverType: "role", role: "owner" },
    ],
  },
  {
    name: "PO - Large Order (≥₹1L)",
    description: "Large purchase orders require owner approval",
    isActive: true,
    priority: 7,
    docType: "po",
    subDocType: "any",
    minAmountPaise: 10_000_000,
    autoApprove: false,
    approvalChain: [{ level: 1, approverType: "role", role: "owner" }],
  },

  // ─── SCO (Subcontracting Order) ──────────────────────────────────────────
  {
    name: "SCO - Small Job Work (<₹20k)",
    description: "Small subcontracting jobs approved by floor supervisor",
    isActive: true,
    priority: 1,
    docType: "sco",
    subDocType: "subcontracting",
    maxAmountPaise: 2_000_000,
    autoApprove: false,
    approvalChain: [
      { level: 1, approverType: "role", role: "floor_supervisor" },
    ],
  },
  {
    name: "SCO - Medium Job Work (₹20k-₹50k)",
    description:
      "Medium subcontracting jobs need floor supervisor and back office",
    isActive: true,
    priority: 2,
    docType: "sco",
    subDocType: "subcontracting",
    minAmountPaise: 2_000_000,
    maxAmountPaise: 5_000_000,
    autoApprove: false,
    approvalChain: [
      { level: 1, approverType: "role", role: "floor_supervisor" },
      { level: 2, approverType: "role", role: "back_office" },
    ],
  },
  {
    name: "SCO - Large Job Work (≥₹50k)",
    description:
      "Large subcontracting jobs need floor supervisor and owner approval",
    isActive: true,
    priority: 3,
    docType: "sco",
    subDocType: "subcontracting",
    minAmountPaise: 5_000_000,
    autoApprove: false,
    approvalChain: [
      { level: 1, approverType: "role", role: "floor_supervisor" },
      { level: 2, approverType: "role", role: "owner" },
    ],
  },
].map((policy) => createApprovalPolicySchema.parse(policy));

const FALLBACK_DOC_TYPES = ["pr", "po", "sco"] as const;

/**
 * BR-APR-22 / F-APR-1: the built-in fallback (one level, role owner) is seed data.
 * One inactive record per doc type so it never competes as a candidate; the service
 * only reads it (by `fallbackPolicyName`). Idempotent; `createdBy` may be null.
 */
export async function seedFallbackPolicies(actorId: number | null) {
  for (const docType of FALLBACK_DOC_TYPES) {
    const values = {
      name: fallbackPolicyName(docType),
      description: "Built-in fallback when no active policy matches (inactive)",
      isActive: false,
      priority: 9999,
      docType,
      subDocType: "any" as const,
      minAmountPaise: null,
      maxAmountPaise: null,
      autoApprove: false,
      approvalLevels: 1,
      approvalChain: [
        { level: 1, approverType: "role" as const, role: "owner" },
      ],
      createdBy: actorId,
      lastUpdatedBy: actorId,
    };
    const [existing] = await db
      .select({ id: approvalPolicies.id })
      .from(approvalPolicies)
      .where(
        and(
          eq(approvalPolicies.name, values.name),
          eq(approvalPolicies.docType, docType),
          eq(approvalPolicies.isActive, false),
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(approvalPolicies)
        .set({
          approvalLevels: values.approvalLevels,
          approvalChain: values.approvalChain,
          lastUpdatedAt: new Date(),
        })
        .where(eq(approvalPolicies.id, existing.id));
    } else {
      await db.insert(approvalPolicies).values(values);
    }
  }
}

async function findSeedActorId(): Promise<number> {
  const [row] = await db
    .select({ id: employees.id })
    .from(employees)
    .innerJoin(roles, eq(employees.roleId, roles.id))
    .where(eq(roles.name, "super-admin"))
    .limit(1);

  if (!row) {
    throw new Error(
      "No employee with role 'super-admin' found — create one before seeding approval policies.",
    );
  }

  return row.id;
}

async function main() {
  const actorId = await findSeedActorId();

  for (const policy of POLICIES) {
    const values = {
      name: policy.name,
      description: policy.description ?? null,
      isActive: policy.isActive ?? true,
      priority: policy.priority,
      docType: policy.docType,
      subDocType: policy.subDocType,
      minAmountPaise: policy.minAmountPaise ?? null,
      maxAmountPaise: policy.maxAmountPaise ?? null,
      autoApprove: policy.autoApprove ?? false,
      approvalLevels: policy.approvalChain.length,
      approvalChain: policy.approvalChain,
      createdBy: actorId,
      lastUpdatedBy: actorId,
    };

    await db
      .insert(approvalPolicies)
      .values(values)
      .onConflictDoUpdate({
        target: [
          approvalPolicies.priority,
          approvalPolicies.docType,
          approvalPolicies.subDocType,
        ],
        // Matches the partial unique index uq_policy_priority_doctype_subdoctype
        // (`where is_active = true`) — every seeded row is active, so this is safe.
        targetWhere: sql`${approvalPolicies.isActive} = true`,
        set: {
          name: values.name,
          description: values.description,
          isActive: values.isActive,
          minAmountPaise: values.minAmountPaise,
          maxAmountPaise: values.maxAmountPaise,
          autoApprove: values.autoApprove,
          approvalLevels: values.approvalLevels,
          approvalChain: values.approvalChain,
          lastUpdatedBy: actorId,
          lastUpdatedAt: new Date(),
        },
      });

    console.log(`Seeded: ${values.name}`);
  }

  await seedFallbackPolicies(actorId);

  console.log(
    `Done — ${POLICIES.length} approval policies and ${FALLBACK_DOC_TYPES.length} fallbacks seeded.`,
  );
}

if (import.meta.main) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => disconnectDb());
}
