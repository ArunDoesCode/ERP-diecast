import { createSelectSchema, createUpdateSchema } from "drizzle-zod";
import { z } from "zod";
import {
  poCommunicationChannelEnum,
  poCommunications,
  poCommunicationTypeEnum,
  poStatusEnum,
  purchaseOrderItems,
  purchaseOrders,
} from "../db/schemas/02_procurement-purchasing";

export const poStatusSchema = z.enum(poStatusEnum.enumValues);
export type poStatusSchemaType = z.infer<typeof poStatusSchema>;

// Response shape for a stored purchase order row.
export const poSchema = createSelectSchema(purchaseOrders);
export type poSchemaType = z.infer<typeof poSchema>;

// Response shape for a stored purchase order item row (write-side projection).
export const poItemSchema = createSelectSchema(purchaseOrderItems).pick({
  id: true,
  poId: true,
  itemId: true,
  qty: true,
  receivedQty: true,
  unitPricePaise: true,
  uom: true,
});
export type poItemSchemaType = z.infer<typeof poItemSchema>;

// PO item row joined with item master + originating PR fields, as returned
// by getDetails, for traceability back to the source PR line.
export const poItemDetailSchema = poItemSchema.extend({
  itemSku: z.string(),
  itemName: z.string(),
  itemCategory: z.string(),
  prItemId: z.number().int().nullable(),
  prNumber: z.string().nullable(),
});
export type poItemDetailSchemaType = z.infer<typeof poItemDetailSchema>;

// GET /po/getpodetails/:id response payload.
export const poDetailsSchema = z.object({
  po: poSchema,
  items: z.array(poItemDetailSchema),
});
export type poDetailsSchemaType = z.infer<typeof poDetailsSchema>;

// PATCH /po/updatepo response payload — po plus only the items touched by
// this update (inserts/updates), not the full item list.
export const poUpdateResultSchema = z.object({
  po: poSchema,
  items: z.array(poItemSchema),
});
export type poUpdateResultSchemaType = z.infer<typeof poUpdateResultSchema>;

export const createPoSchema = z.object({
  supplierId: z.number().int().positive(),
  paymentTermsDays: z.number().int().min(0).optional(),
  deliveryTerms: z.string().max(500).optional(),
  expectedDeliveryDate: z.coerce.date().optional(),
  notes: z.string().max(2000).optional(),
  lines: z
    .array(
      z.object({
        prItemId: z.number().int().positive(),
        unitPricePaise: z.number().int().nonnegative(),
      }),
    )
    .min(1),
});
export type createPoSchemaType = z.infer<typeof createPoSchema>;

// A new line added on update — pulls in a not-yet-drafted PR item.
export const updatePoInsertItemSchema = z.object({
  prItemId: z.number().int().positive(),
  unitPricePaise: z.number().int().nonnegative(),
});
export type updatePoInsertItemSchemaType = z.infer<
  typeof updatePoInsertItemSchema
>;

// Reprice an existing line — qty is never editable (always the full
// remaining PR-item quantity at draft time).
export const updatePoUpdateItemSchema = z.object({
  id: z.number().int().positive(),
  unitPricePaise: z.number().int().nonnegative(),
});
export type updatePoUpdateItemSchemaType = z.infer<
  typeof updatePoUpdateItemSchema
>;

export const updatePoDeleteItemSchema = z.object({
  id: z.number().int().positive(),
});

const poUpdateBaseSchema = createUpdateSchema(purchaseOrders, {
  paymentTermsDays: z.number().int().min(0).nullable(),
  deliveryTerms: z.string().max(500).nullable(),
  notes: z.string().max(2000).nullable(),
  expectedDeliveryDate: z.coerce.date().nullable(),
});

export const updatePoSchema = poUpdateBaseSchema
  .pick({
    paymentTermsDays: true,
    deliveryTerms: true,
    notes: true,
    expectedDeliveryDate: true,
  })
  .extend({
    poId: z.number().int().positive(),
    inserts: z
      .array(updatePoInsertItemSchema)
      .nullish()
      .transform((v) => v ?? []),
    updates: z
      .array(updatePoUpdateItemSchema)
      .nullish()
      .transform((v) => v ?? []),
    deletes: z
      .array(updatePoDeleteItemSchema)
      .nullish()
      .transform((v) => v ?? []),
  })
  .superRefine((data, ctx) => {
    const hasUpdateField =
      data.paymentTermsDays !== undefined ||
      data.deliveryTerms !== undefined ||
      data.notes !== undefined ||
      data.expectedDeliveryDate !== undefined ||
      data.inserts.length > 0 ||
      data.updates.length > 0 ||
      data.deletes.length > 0;

    if (!hasUpdateField) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one updatable field must be provided",
      });
    }
  });

export type updatePoSchemaType = z.infer<typeof updatePoSchema>;

export const poListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
    sortBy: z.enum(["id", "poNumber", "status", "createdAt"]).optional(),
    sortDir: z.enum(["asc", "desc"]).default("asc"),
    // Comma-separated list of statuses, e.g. "draft,approved".
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
      .pipe(z.array(poStatusSchema).optional()),
    supplierId: z.coerce.number().int().positive().optional(),
    q: z.string().trim().min(1).optional(),
    // Dispatched/partial_received POs whose expectedDeliveryDate has passed
    // and still have remaining (not-yet-received) qty on at least one line.
    overdue: z
      .enum(["true", "false"])
      .optional()
      .transform((value) => value === "true"),
  })
  .strict();

export type poListQuerySchemaType = z.infer<typeof poListQuerySchema>;

// DELETE /po/deletepo/:id body. `reason` is required by poService.cancel
// whenever the PO's current status isn't `draft` — the schema can't see the
// PO's status, so that conditional check lives in the service layer.
export const cancelPoSchema = z.object({
  reason: z.string().min(1).max(500).optional(),
});
export type cancelPoSchemaType = z.infer<typeof cancelPoSchema>;

// --- PO communications (send/reminder/escalation log) ---

export const poCommunicationTypeSchema = z.enum(
  poCommunicationTypeEnum.enumValues,
);
export type poCommunicationTypeSchemaType = z.infer<
  typeof poCommunicationTypeSchema
>;

export const poCommunicationChannelSchema = z.enum(
  poCommunicationChannelEnum.enumValues,
);

export const poCommunicationSchema = createSelectSchema(poCommunications);
export type poCommunicationSchemaType = z.infer<typeof poCommunicationSchema>;

// POST /po/:id/send — flips approved -> dispatched, logs a `po_sent` row.
export const markPoSentSchema = z
  .object({
    channel: poCommunicationChannelSchema,
    note: z.string().max(1000).optional(),
    toEmail: z.string().email().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.channel === "email" && !data.toEmail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "toEmail is required when channel is email",
        path: ["toEmail"],
      });
    }
  });
export type markPoSentSchemaType = z.infer<typeof markPoSentSchema>;

// POST /po/:id/reminder and POST /po/:id/escalate — log-only, no status
// change.
export const logPoCommunicationSchema = z.object({
  channel: poCommunicationChannelSchema,
  note: z.string().max(1000).optional(),
  toEmail: z.string().email().optional(),
});
export type logPoCommunicationSchemaType = z.infer<
  typeof logPoCommunicationSchema
>;

// PATCH /po/:id/delay — expectedDeliveryDate itself is never overwritten;
// this only records the supplier's revised promise + why.
export const updatePoDelaySchema = z.object({
  revisedDeliveryDate: z.coerce.date().optional(),
  delayReason: z.string().max(1000).optional(),
});
export type updatePoDelaySchemaType = z.infer<typeof updatePoDelaySchema>;

// POST /po/:id/confirm — supplier confirmation of the PO, never blocks a
// status transition.
export const confirmPoSchema = z.object({
  confirmationMethod: z.string().min(1).max(200),
  note: z.string().max(1000).optional(),
});
export type confirmPoSchemaType = z.infer<typeof confirmPoSchema>;

// POST /po/:id/invoice — records a supplier invoice against a fully-received
// PO and moves it to `invoiced`. Full 3-way-match/payment workflow is a
// future AP feature; this only creates the supplierInvoices row.
export const markPoInvoicedSchema = z.object({
  invoiceNumber: z.string().min(1).max(100),
  invoiceDate: z.coerce.date(),
  billedAmountPaise: z.number().int().nonnegative(),
  dueDate: z.coerce.date().optional(),
});
export type markPoInvoicedSchemaType = z.infer<typeof markPoInvoicedSchema>;

// POST /po/:id/close — terminal close, legal from `fully_received` or
// `invoiced`.
export const closePoSchema = z.object({
  note: z.string().max(1000).optional(),
});
export type closePoSchemaType = z.infer<typeof closePoSchema>;
