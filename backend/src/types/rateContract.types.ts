import { z } from "zod";
import { rateContractStatusEnum } from "../db/schemas/02_procurement-rfq";
import { paginationMetaSchema } from "../lib/response-schemas";
import { searchTermSchema } from "../lib/safe-search";
import { isoDateSchema, ratePaiseSchema, reasonSchema } from "./rfq.types";

// Rate contracts (docs/specs/rfq/design/api.md → Contracts).

const idSchema = z.number().int().positive();

export const rateContractStatusSchema = z.enum(
  rateContractStatusEnum.enumValues,
);
// `expired` is computed (active and valid_to < today, BR-RFQ-47), never stored.
export const rateContractEffectiveStatusSchema = z.enum([
  ...rateContractStatusEnum.enumValues,
  "expired",
]);

export const contractEmptyBodySchema = z.object({}).strict();
export const contractReasonBodySchema = z
  .object({ reason: reasonSchema })
  .strict();

export const terminateContractSchema = z
  .object({
    reason: reasonSchema,
    // IST day, today..validTo; default today
    terminatedOn: isoDateSchema.optional(),
  })
  .strict();
export type TerminateContractInput = z.infer<typeof terminateContractSchema>;

export const contractLineInputSchema = z
  .object({
    itemId: idSchema,
    ratePaise: ratePaiseSchema,
    // slab, rate >= 1 and qty checks are in the service (CONTRACT_LINE_INVALID, AMOUNT_TOO_LARGE)
    gstPercent: z.number().min(0).max(100),
    // null / omitted = rate-only line (BR-RFQ-41)
    agreedQty: z.number().max(1e12).nullish(),
  })
  .strict();

const contractBodyShape = {
  supplierId: idSchema,
  // missing / bad dates are CONTRACT_DATES_INVALID, checked in the service (BR-RFQ-40)
  validFrom: isoDateSchema.optional(),
  validTo: isoDateSchema.optional(),
  allowancePercent: z
    .number()
    .min(0)
    .max(20)
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, {
      message: "Allowance can have at most 2 decimals",
    })
    .optional(),
  notes: z.string().trim().max(2000).optional(),
  lines: z.array(contractLineInputSchema).min(1).max(500),
};

export const createContractSchema = z.object(contractBodyShape).strict();
export type CreateContractInput = z.infer<typeof createContractSchema>;

export const updateContractSchema = z
  .object({ id: idSchema, ...contractBodyShape })
  .strict();
export type UpdateContractInput = z.infer<typeof updateContractSchema>;

export const contractListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
    sortBy: z
      .enum([
        "id",
        "contractNumber",
        "validFrom",
        "validTo",
        "createdAt",
        "status",
      ])
      .optional(),
    // default sort: validTo asc for endsWithinDays, else createdAt desc
    sortDir: z.enum(["asc", "desc"]).optional(),
    q: searchTermSchema,
    status: rateContractEffectiveStatusSchema.optional(),
    supplierId: z.coerce.number().int().positive().optional(),
    itemId: z.coerce.number().int().positive().optional(),
    endsWithinDays: z.coerce.number().int().min(1).max(365).optional(),
  })
  .strict();
export type ContractListQuery = z.infer<typeof contractListQuerySchema>;

// --- responses ---
export const contractRowSchema = z.object({
  id: z.number().int(),
  contractNumber: z.string(),
  supplierId: z.number().int(),
  supplierName: z.string(),
  status: rateContractStatusSchema,
  effectiveStatus: rateContractEffectiveStatusSchema,
  validFrom: z.string(),
  validTo: z.string(),
  createdByName: z.string().nullable(),
  itemCount: z.number().int(),
  // ordered / agreed over lines with an agreed qty; null when all lines are rate-only
  orderedPercent: z.number().nullable(),
  createdAt: z.string(),
});
export const contractListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(contractRowSchema),
  meta: paginationMetaSchema,
});

export const contractLineSchema = z.object({
  id: z.number().int(),
  itemId: z.number().int(),
  itemCode: z.string(),
  itemName: z.string(),
  uom: z.string(),
  ratePaise: z.number().int(),
  gstPercent: z.number().min(0).max(100),
  agreedQty: z.number().nullable(),
  orderedQty: z.number(),
  receivedQty: z.number(),
  percentOrdered: z.number().nullable(),
  // agreedQty x (1 + allowance), floored to 3 decimals; null for rate-only
  capQty: z.number().nullable(),
});

export const contractDetailsSchema = z.object({
  id: z.number().int(),
  contractNumber: z.string(),
  supplierId: z.number().int(),
  supplierName: z.string(),
  status: rateContractStatusSchema,
  effectiveStatus: rateContractEffectiveStatusSchema,
  validFrom: z.string(),
  validTo: z.string(),
  allowancePercent: z.number(),
  notes: z.string().nullable(),
  createdBy: z.number().int(),
  createdByName: z.string().nullable(),
  createdAt: z.string(),
  lastUpdatedAt: z.string().nullable(),
  activatedByName: z.string().nullable(),
  activatedAt: z.string().nullable(),
  terminatedOn: z.string().nullable(),
  terminatedByName: z.string().nullable(),
  terminatedAt: z.string().nullable(),
  terminateReason: z.string().nullable(),
  cancelledByName: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  cancelReason: z.string().nullable(),
  lines: z.array(contractLineSchema),
  // POs with lines on this contract
  pos: z.array(
    z.object({
      poId: z.number().int(),
      poNumber: z.string(),
      prId: z.number().int().nullable(),
      status: z.string(),
      lineCount: z.number().int(),
    }),
  ),
});
