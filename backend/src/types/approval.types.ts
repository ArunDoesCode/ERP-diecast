import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import { z } from "zod";
import {
  approvalPolicies,
  approvalRequests,
  approvalTrails,
  procurementCategoryEnum,
} from "../db/schemas/02_procurement-approval";
import { prTypeEnum } from "../db/schemas/02_procurement-purchasing";

export const approvalDocTypeSchema = z.enum(["pr", "po", "sco"]);

export const approvalChainStepSchema = z
  .object({
    level: z.number().int().min(1),
    approverType: z.enum(["role", "specific"]),
    role: z.string().min(1).optional(),
    employeeId: z.number().int().positive().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.approverType === "role") {
      if (!data.role) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "role is required when approverType is role",
        });
      }
      if (data.employeeId !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "employeeId must not be provided for role approvers",
        });
      }
      return;
    }

    if (data.employeeId === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "employeeId is required when approverType is specific",
      });
    }
    if (data.role !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "role must not be provided for specific approvers",
      });
    }
  });

export const approvalChainSchema = z
  .array(approvalChainStepSchema)
  .min(1)
  .superRefine((steps, ctx) => {
    const levels = new Set<number>();
    for (const step of steps) {
      if (levels.has(step.level)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate approval level: ${step.level}`,
        });
      }
      levels.add(step.level);
    }

    const sortedLevels = [...levels].sort((a, b) => a - b);
    for (let index = 0; index < sortedLevels.length; index += 1) {
      const expectedLevel = index + 1;
      if (sortedLevels[index] !== expectedLevel) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "approvalChain levels must be sequential starting from 1",
        });
        break;
      }
    }
  });

export type approvalChainSchemaType = z.infer<typeof approvalChainSchema>;

// Response shape for a stored approval policy row — approvalChain narrows
// drizzle-zod's generic jsonb inference to the actual step-array contract.
export const approvalPolicySchema = createSelectSchema(approvalPolicies, {
  approvalChain: () => approvalChainSchema,
});
export type approvalPolicySchemaType = z.infer<typeof approvalPolicySchema>;

// Response shape for a stored approval request row.
export const approvalRequestSchema = createSelectSchema(approvalRequests, {
  chainSnapshot: () => approvalChainSchema,
});
export type approvalRequestSchemaType = z.infer<typeof approvalRequestSchema>;

// Summary of the underlying PR/PO/SCO document, enriched onto approval rows
// so the UI doesn't need a second round-trip to show what's being approved.
export const approvalDocSummarySchema = z.object({
  docNumber: z.string(),
  amountPaise: z.number().int(),
  supplierName: z.string().nullable().optional(),
});
export type approvalDocSummarySchemaType = z.infer<
  typeof approvalDocSummarySchema
>;

// getRequestDetails joins in the matched policy's name/description.
export const approvalRequestDetailSchema = approvalRequestSchema.extend({
  policyName: z.string(),
  policyDescription: z.string().nullable(),
  docSummary: approvalDocSummarySchema,
});
export type approvalRequestDetailSchemaType = z.infer<
  typeof approvalRequestDetailSchema
>;

// getMyPendingApprovals / getCurrentApprovalByDoc join in the policy name only.
export const approvalRequestListItemSchema = approvalRequestSchema.extend({
  policyName: z.string(),
  docSummary: approvalDocSummarySchema,
});
export type approvalRequestListItemSchemaType = z.infer<
  typeof approvalRequestListItemSchema
>;

// Response shape for a single approval trail entry, joined with the actor's name.
export const approvalTrailEntrySchema = createSelectSchema(
  approvalTrails,
).extend({
  actorName: z.string(),
});
export type approvalTrailEntrySchemaType = z.infer<
  typeof approvalTrailEntrySchema
>;

export const approvalPolicyListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  docType: approvalDocTypeSchema.optional(),
  isActive: z.coerce.boolean().optional(),
  q: z.string().trim().min(1).optional(),
  sortBy: z
    .enum(["name", "priority", "docType", "isActive", "createdAt"])
    .optional(),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});

export type approvalPolicyListQuerySchemaType = z.infer<
  typeof approvalPolicyListQuerySchema
>;

export const createApprovalPolicySchema = createInsertSchema(approvalPolicies, {
  name: (schema) => schema.min(1),
  priority: z.number().int().positive(),
  approvalChain: () => approvalChainSchema,
})
  .pick({
    name: true,
    isActive: true,
    priority: true,
    docType: true,
    autoApprove: true,
    approvalChain: true,
  })
  .extend({
    // These columns are nullable with no default, so drizzle-zod's insert
    // schema derives them as `.optional().nullable()`. The create contract
    // only ever accepts omission (never an explicit null), so they're kept
    // hand-authored here instead of silently widening the accepted shape.
    description: z.string().optional(),
    subDocType: z.enum(procurementCategoryEnum.enumValues).default("any"),
    isSaleOrderLinked: z.boolean().optional(),

    minAmountPaise: z.coerce
      .number()
      .int()
      .min(0)
      .nonnegative()
      .nullable()
      .optional(),
    maxAmountPaise: z.coerce
      .number()
      .int()
      .min(0)
      .nonnegative()
      .nullable()
      .optional(),
  })
  .superRefine((data, ctx) => {
    const hasMin = data.minAmountPaise != null;
    const hasMax = data.maxAmountPaise != null;

    if (hasMin && hasMax && data.maxAmountPaise! <= data.minAmountPaise!) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "maxAmountPaise must be greater than minAmountPaise",
        path: ["maxAmountPaise"],
      });
    }
  });

export type createApprovalPolicySchemaType = z.infer<
  typeof createApprovalPolicySchema
>;

export const updateApprovalPolicySchema = createUpdateSchema(approvalPolicies, {
  name: (schema) => schema.min(1),
  priority: z.number().int().positive().optional(),
  // No .default() here: PATCH is partial, an omitted subDocType must stay
  // unchanged instead of resetting to "any" (BL-022).
  subDocType: () => z.enum(procurementCategoryEnum.enumValues).optional(),
  minAmountPaise: z.coerce
    .number()
    .int()
    .min(0)
    .nonnegative()
    .nullable()
    .optional(),
  maxAmountPaise: z.coerce
    .number()
    .int()
    .min(0)
    .nonnegative()
    .nullable()
    .optional(),
  approvalChain: () => approvalChainSchema,
})
  .pick({
    name: true,
    description: true,
    isActive: true,
    priority: true,
    subDocType: true,
    isSaleOrderLinked: true,
    minAmountPaise: true,
    maxAmountPaise: true,
    autoApprove: true,
    approvalChain: true,
  })
  .superRefine((data, ctx) => {
    const hasAnyField =
      data.name !== undefined ||
      data.description !== undefined ||
      data.isActive !== undefined ||
      data.priority !== undefined ||
      data.subDocType !== undefined ||
      data.isSaleOrderLinked !== undefined ||
      data.minAmountPaise !== undefined ||
      data.maxAmountPaise !== undefined ||
      data.autoApprove !== undefined ||
      data.approvalChain !== undefined;

    if (!hasAnyField) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one updatable field must be provided",
      });
    }

    const hasMin = data.minAmountPaise != null;
    const hasMax = data.maxAmountPaise != null;

    if (hasMin && hasMax && data.maxAmountPaise! <= data.minAmountPaise!) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "maxAmountPaise must be greater than minAmountPaise",
        path: ["maxAmountPaise"],
      });
    }
  });

export type updateApprovalPolicySchemaType = z.infer<
  typeof updateApprovalPolicySchema
>;

export const submitApprovalRequestSchema = z.object({
  docType: approvalDocTypeSchema,
  docId: z.number().int().positive(),
});

export type submitApprovalRequestSchemaType = z.infer<
  typeof submitApprovalRequestSchema
>;

export const approvalRequestIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type approvalRequestIdParamSchemaType = z.infer<
  typeof approvalRequestIdParamSchema
>;

export const approvalPolicyIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type approvalPolicyIdParamSchemaType = z.infer<
  typeof approvalPolicyIdParamSchema
>;

export const approvalDocLookupParamSchema = z.object({
  docType: approvalDocTypeSchema,
  docId: z.coerce.number().int().positive(),
});

export type approvalDocLookupParamSchemaType = z.infer<
  typeof approvalDocLookupParamSchema
>;

export const approvalActionSchema = z.enum([
  "approve",
  "reject",
  "sent_back",
  "cancel",
  "withdraw",
]);

export const approvalActionRequestSchema = z.object({
  action: approvalActionSchema,
  notes: z.string().trim().min(1).optional(),
});

export type approvalActionRequestSchemaType = z.infer<
  typeof approvalActionRequestSchema
>;

export const myPendingApprovalsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  employeeId: z.coerce.number().int().positive().optional(),
  docType: approvalDocTypeSchema.optional(),
  sortBy: z.enum(["requestedAt", "docType", "status"]).optional(),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});

export type myPendingApprovalsQuerySchemaType = z.infer<
  typeof myPendingApprovalsQuerySchema
>;
