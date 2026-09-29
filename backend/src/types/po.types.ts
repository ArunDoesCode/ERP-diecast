import { createSelectSchema } from "drizzle-zod";
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

// BR-SUP-13 / BR-PO-04: allowed GST % values.
export const gstPercentSchema = z.union([
  z.literal(0),
  z.literal(0.1),
  z.literal(0.25),
  z.literal(1.5),
  z.literal(3),
  z.literal(5),
  z.literal(12),
  z.literal(18),
  z.literal(28),
  z.literal(40),
]);
export type gstPercentSchemaType = z.infer<typeof gstPercentSchema>;

// PO row as returned: the stored columns (cancel / short-close / invoice who and
// when, BR-PO-11, 13, 21) plus the canceller's name and the due date (BR-PO-19).
export const poResponseSchema = poSchema.extend({
  cancelledByName: z.string().nullable(),
  // BR-PO-19: revisedDeliveryDate if set, else expectedDeliveryDate.
  dueDate: z.date().nullable(),
});
export type poResponseSchemaType = z.infer<typeof poResponseSchema>;

// Per-line GST fields (BR-PO-04).
export const poItemGstSchema = z.object({
  gstPercent: gstPercentSchema,
  lineValuePaise: z.number().int(),
  lineTaxPaise: z.number().int(),
});

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
export const poItemDetailSchema = poItemSchema
  .extend(poItemGstSchema.shape)
  .extend({
    itemSku: z.string(),
    itemName: z.string(),
    itemCategory: z.string(),
    prItemId: z.number().int().nullable(),
    prNumber: z.string().nullable(),
  });
export type poItemDetailSchemaType = z.infer<typeof poItemDetailSchema>;

// GET /po/getpodetails/:id response payload.
export const poDetailsSchema = z.object({
  po: poResponseSchema,
  items: z.array(poItemDetailSchema),
});
export type poDetailsSchemaType = z.infer<typeof poDetailsSchema>;

// PATCH /po/updatepo response payload — po plus only the items touched by
// this update (inserts/updates), not the full item list.
export const poUpdateResultSchema = z.object({
  po: poResponseSchema,
  items: z.array(poItemSchema.extend(poItemGstSchema.shape)),
});
export type poUpdateResultSchemaType = z.infer<typeof poUpdateResultSchema>;

export const createPoSchema = z.object({
  supplierId: z.number().int().positive(),
  // BR-PO-23: whole days 0-365; omitted = copy the supplier's default terms.
  paymentTermsDays: z.number().int().min(0).max(365).optional(),
  deliveryTerms: z.string().max(500).optional(),
  expectedDeliveryDate: z.coerce.date().optional(),
  notes: z.string().max(2000).optional(),
  lines: z
    .array(
      z.object({
        prItemId: z.number().int().positive(),
        // BR-PO-03: paise, >= 1. Omitted = the supplier price suggestion
        // (last PO rate, else price list, else average cost); editable in draft.
        unitPricePaise: z.number().int().min(1).optional(),
        // BR-PO-04: omitted = supplier's active price-list GST % (else 0).
        gstPercent: gstPercentSchema.optional(),
      }),
    )
    .min(1),
});
export type createPoSchemaType = z.infer<typeof createPoSchema>;

// A new line added on update — pulls in a not-yet-drafted PR item.
export const updatePoInsertItemSchema = z.object({
  prItemId: z.number().int().positive(),
  unitPricePaise: z.number().int().min(1).optional(),
  gstPercent: gstPercentSchema.optional(),
});
export type updatePoInsertItemSchemaType = z.infer<
  typeof updatePoInsertItemSchema
>;

// Reprice an existing line — qty is never editable (always the full
// remaining PR-item quantity at draft time).
export const updatePoUpdateItemSchema = z.object({
  id: z.number().int().positive(),
  unitPricePaise: z.number().int().min(1).optional(),
  gstPercent: gstPercentSchema.optional(),
});
export type updatePoUpdateItemSchemaType = z.infer<
  typeof updatePoUpdateItemSchema
>;

export const updatePoDeleteItemSchema = z.object({
  id: z.number().int().positive(),
});

export const updatePoSchema = z
  .object({
    paymentTermsDays: z.number().int().min(0).max(365).optional(),
    deliveryTerms: z.string().max(500).nullish(),
    notes: z.string().max(2000).nullish(),
    expectedDeliveryDate: z.coerce.date().nullish(),
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

// Cancel body (DELETE /po/deletepo/:id). BR-PO-11: reason is required for
// every status (draft included), trimmed 3-500 chars, else 400.
export const cancelPoSchema = z.object({
  reason: z.string().trim().min(3).max(500),
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
// BR-PO-16: both required; only on dispatched / partial_received.
export const updatePoDelaySchema = z.object({
  revisedDeliveryDate: z.coerce.date(),
  delayReason: z.string().trim().min(1).max(1000),
});
export type updatePoDelaySchemaType = z.infer<typeof updatePoDelaySchema>;

// POST /po/:id/confirm — supplier confirmation of the PO, never blocks a
// status transition.
export const confirmPoSchema = z.object({
  confirmationMethod: poCommunicationChannelSchema,
  note: z.string().max(1000).optional(),
});
export type confirmPoSchemaType = z.infer<typeof confirmPoSchema>;

// POST /po/:id/invoice — records a supplier invoice against a fully-received
// PO and moves it to `invoiced`. Full 3-way-match/payment workflow is a
// future AP feature; this only creates the supplierInvoices row.
export const markPoInvoicedSchema = z.object({
  invoiceNumber: z.string().trim().min(1).max(100),
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

// POST /po/:id/short-close (BR-PO-13): partial_received -> closed as a whole;
// open qty dropped, PR lines -> closed. Reason trimmed 3-500 chars, else 400.
export const shortClosePoSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
export type shortClosePoSchemaType = z.infer<typeof shortClosePoSchema>;

// GET /po/:id/communications (BR-PO-08, 17, 21): the PO log, newest first.
export const poCommunicationDetailSchema = poCommunicationSchema.extend({
  sentByName: z.string().nullable(),
});
export type poCommunicationDetailSchemaType = z.infer<
  typeof poCommunicationDetailSchema
>;
