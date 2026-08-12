import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import { z } from "zod";
import {
  poStatusEnum,
  prItemStatusEnum,
  prStatusEnum,
  prTypeEnum,
  purchaseRequestItems,
  purchaseRequests,
} from "../db/schemas/02_procurement-purchasing";

export const prTypeSchema = z.enum(prTypeEnum.enumValues);

export const prStatusSchema = z.enum(prStatusEnum.enumValues);
export type prStatusSchemaType = z.infer<typeof prStatusSchema>;

export const prItemStatusSchema = z.enum(prItemStatusEnum.enumValues);
export type prItemStatusSchemaType = z.infer<typeof prItemStatusSchema>;

// Response shape for a stored purchase request row.
export const prSchema = createSelectSchema(purchaseRequests);
export type prSchemaType = z.infer<typeof prSchema>;

// Response shape for a stored purchase request item row (write-side projection).
export const prItemSchema = createSelectSchema(purchaseRequestItems).pick({
  id: true,
  prId: true,
  itemId: true,
  requestedQty: true,
  issuedQty: true,
  uom: true,
  expectedDate: true,
});
export type prItemSchemaType = z.infer<typeof prItemSchema>;

// PR item row joined with item master fields, as returned by getDetails.
export const prItemDetailSchema = prItemSchema.extend({
  status: prItemStatusSchema,
  itemSku: z.string(),
  itemName: z.string(),
  itemCategory: z.string(),
  estRatePaise: z.number().int().nonnegative(),
  linkedPoId: z.number().int().nullable(),
  linkedPoNumber: z.string().nullable(),
  defaultSupplierId: z.number().int().nullable(),
  defaultSupplierName: z.string().nullable(),
});
export type prItemDetailSchemaType = z.infer<typeof prItemDetailSchema>;

// PO summary as returned on the PR detail's "linked POs" panel — the POs
// spawned from this PR's lines, joined back via prPoItemLinks.
const prLinkedPoStatusSchema = z.enum(poStatusEnum.enumValues);

export const prLinkedPoSchema = z.object({
  id: z.number().int(),
  poNumber: z.string(),
  supplierId: z.number().int(),
  status: prLinkedPoStatusSchema,
  totalAmountPaise: z.number().int(),
});
export type prLinkedPoSchemaType = z.infer<typeof prLinkedPoSchema>;

// GET /pr/getprdetails/:id response payload.
export const prDetailsSchema = z.object({
  pr: prSchema.extend({ requestedByName: z.string() }),
  items: z.array(prItemDetailSchema),
  linkedPos: z.array(prLinkedPoSchema),
});
export type prDetailsSchemaType = z.infer<typeof prDetailsSchema>;

// PATCH /pr/updatepr response payload — pr plus only the items touched by
// this update (inserts/updates), not the full item list.
export const prUpdateResultSchema = z.object({
  pr: prSchema,
  items: z.array(prItemSchema),
});
export type prUpdateResultSchemaType = z.infer<typeof prUpdateResultSchema>;

export const createPrItemSchema = createInsertSchema(purchaseRequestItems, {
  itemId: z.number().int().positive(),
  requestedQty: z.number().int().positive(),
}).pick({
  itemId: true,
  requestedQty: true,
});
export type createPrItemSchemaType = z.infer<typeof createPrItemSchema>;

const prCreateBaseSchema = createInsertSchema(purchaseRequests, {
  saleOrderId: z.number().int().positive().optional(),
  assetId: z.number().int().positive().optional(),
  notes: z.string().min(1),
});

export const createPrSchema = prCreateBaseSchema
  .pick({
    type: true,
    saleOrderId: true,
    assetId: true,
    notes: true,
  })
  .extend({
    items: z.array(createPrItemSchema).min(1),
  })
  .superRefine((data, ctx) => {
    if (data.type === "maintenance" && data.assetId == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "assetId is required when type is maintenance",
      });
    }
  });

export type createPrSchemaType = z.infer<typeof createPrSchema>;

// Same field shape as createPrItemSchema — kept as a distinct export so the
// update-payload contract (inserts/updates/deletes) reads independently of
// the create contract even though the underlying schema is identical.
export const updatePrInsertItemSchema = createPrItemSchema;

export const updatePrUpdateItemSchema = createUpdateSchema(
  purchaseRequestItems,
  {
    itemId: z.number().int().positive(),
    requestedQty: z.number().int().positive(),
  },
)
  .pick({
    itemId: true,
    requestedQty: true,
  })
  .extend({
    id: z.number().int().positive(),
  })
  .superRefine((data, ctx) => {
    if (data.itemId === undefined && data.requestedQty === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one field must be provided for item update",
      });
    }
  });

export const updatePrDeleteItemSchema = z.object({
  id: z.number().int().positive(),
});

const prUpdateBaseSchema = createUpdateSchema(purchaseRequests, {
  saleOrderId: z.number().int().positive().nullable(),
  assetId: z.number().int().positive().nullable(),
  notes: z.string().min(1),
});

export const updatePrSchema = prUpdateBaseSchema
  .pick({
    type: true,
    saleOrderId: true,
    assetId: true,
    notes: true,
    status: true,
  })
  .extend({
    prId: z.number().int().positive(),
    inserts: z
      .array(updatePrInsertItemSchema)
      .nullish()
      .transform((v) => v ?? []),
    updates: z
      .array(updatePrUpdateItemSchema)
      .nullish()
      .transform((v) => v ?? []),
    deletes: z
      .array(updatePrDeleteItemSchema)
      .nullish()
      .transform((v) => v ?? []),
  })
  .superRefine((data, ctx) => {
    const hasUpdateField =
      data.type !== undefined ||
      data.saleOrderId !== undefined ||
      data.assetId !== undefined ||
      data.notes !== undefined ||
      data.status !== undefined ||
      data.inserts.length > 0 ||
      data.updates.length > 0 ||
      data.deletes.length > 0;

    if (!hasUpdateField) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one updatable field must be provided",
      });
    }

    const effectiveType = data.type;
    if (effectiveType === "maintenance" && data.assetId === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "assetId cannot be null when type is maintenance",
      });
    }
  });

export type updatePrSchemaType = z.infer<typeof updatePrSchema>;

export const prListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
    sortBy: z
      .enum(["id", "prNumber", "type", "status", "createdAt"])
      .optional(),
    sortDir: z.enum(["asc", "desc"]).default("asc"),
    // Comma-separated list of statuses, e.g. "approved,partial_ordered".
    status: z
      .string()
      .optional()
      .transform((value) =>
        value
          ? value
              .split(",")
              .map((entry) => entry.trim())
              .filter(Boolean)
          : undefined,
      )
      .pipe(z.array(prStatusSchema).optional()),
    type: prTypeSchema.optional(),
    q: z.string().trim().min(1).optional(),
  })
  .strict();

export type prListQuerySchemaType = z.infer<typeof prListQuerySchema>;
