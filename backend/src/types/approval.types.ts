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

const approvalChainLevelsCheck = (
  steps: { level: number }[],
  ctx: z.RefinementCtx,
) => {
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
};

// At least one step (auto-approve off).
export const approvalChainSchema = z
  .array(approvalChainStepSchema)
  .min(1)
  .superRefine(approvalChainLevelsCheck);

// May be empty (BR-APR-05: auto-approve policies and their requests carry no
// steps). Used for stored rows and for input; "auto-approve off needs a step"
// is checked next to `autoApprove` (create schema / service on edit).
export const approvalChainOrEmptySchema = z
  .array(approvalChainStepSchema)
  .superRefine(approvalChainLevelsCheck);

export type approvalChainSchemaType = z.infer<typeof approvalChainSchema>;

// Response shape for a stored approval policy row — approvalChain narrows
// drizzle-zod's generic jsonb inference to the actual step-array contract.
export const approvalPolicySchema = createSelectSchema(approvalPolicies, {
  approvalChain: () => approvalChainOrEmptySchema,
});
export type approvalPolicySchemaType = z.infer<typeof approvalPolicySchema>;

// Response shape for a stored approval request row.
export const approvalRequestSchema = createSelectSchema(approvalRequests, {
  chainSnapshot: () => approvalChainOrEmptySchema,
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
  approvalChain: () => approvalChainOrEmptySchema,
})
  .pick({
    name: true,
    isActive: true,
    priority: true,
    docType: true,
    autoApprove: true,
  })
  .extend({
    // BR-APR-05: an auto-approve policy sends no chain (levels = 0); an
    // auto-approve-off policy needs at least one step (checked below).
    approvalChain: approvalChainOrEmptySchema.default([]),
    // These columns are nullable with no default, so drizzle-zod's insert
    // schema derives them as `.optional().nullable()`. The create contract
    // only ever accepts omission (never an explicit null), so they're kept
    // hand-authored here instead of silently widening the accepted shape.
    description: z.string().optional(),
    subDocType: z.enum(procurementCategoryEnum.enumValues).default("any"),
    // BR-APR-15: `isSaleOrderLinked` is gone; a stray value is ignored (never stored).
    // Whole paise (BR-APR-06). The form takes rupees (up to 2 decimals) and
    // sends rupees x 100 (BL-025 is a frontend bug: it must not send rupees).
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

    if (!data.autoApprove && data.approvalChain.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "approvalChain needs at least one step unless autoApprove",
        path: ["approvalChain"],
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
  approvalChain: () => approvalChainOrEmptySchema,
})
  .pick({
    name: true,
    description: true,
    isActive: true,
    priority: true,
    subDocType: true,
    minAmountPaise: true,
    maxAmountPaise: true,
    autoApprove: true,
    approvalChain: true,
  })
  .extend({
    // BR-APR-11: the doc type is fixed after create; any value sent is a 400.
    docType: z.never({ error: "docType cannot be changed" }).optional(),
  })
  .superRefine((data, ctx) => {
    const hasAnyField =
      data.name !== undefined ||
      data.description !== undefined ||
      data.isActive !== undefined ||
      data.priority !== undefined ||
      data.subDocType !== undefined ||
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

// `notes` (the typed comment) is REQUIRED for approve / reject / sent_back
// (BR-APR-37): the service answers 400 `APPROVAL_NOTES_REQUIRED` (not a Zod
// error, so the code is stable) — hence no `.min(1)` here. Optional for
// withdraw / cancel (BR-APR-39).
export const approvalActionRequestSchema = z.object({
  action: approvalActionSchema,
  notes: z.string().optional(),
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

// GET /getApprovalHistory/:docType/:docId (BR-APR-54): every request of a
// document newest first, each with its trail oldest first. Readable per
// BR-APR-51 (403 otherwise). Empty array when the doc was never submitted.
export const approvalHistoryItemSchema = approvalRequestListItemSchema.extend({
  trail: z.array(approvalTrailEntrySchema),
});
export type approvalHistoryItemSchemaType = z.infer<
  typeof approvalHistoryItemSchema
>;
