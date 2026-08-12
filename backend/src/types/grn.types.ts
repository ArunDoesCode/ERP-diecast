import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import {
  grnItems,
  grnStatusEnum,
  grns,
} from "../db/schemas/02_procurement-purchasing";

export const grnStatusSchema = z.enum(grnStatusEnum.enumValues);
export type grnStatusSchemaType = z.infer<typeof grnStatusSchema>;

export const grnQaStatusSchema = z.enum([
  "pending",
  "passed",
  "failed",
  "waived",
]);
export type grnQaStatusSchemaType = z.infer<typeof grnQaStatusSchema>;

// Response shape for a stored GRN header row.
export const grnSchema = createSelectSchema(grns);
export type grnSchemaType = z.infer<typeof grnSchema>;

// Response shape for a stored GRN line row.
export const grnItemSchema = createSelectSchema(grnItems);
export type grnItemSchemaType = z.infer<typeof grnItemSchema>;

// GRN line joined with item + PO-item fields, as returned by getDetails.
export const grnItemDetailSchema = grnItemSchema.extend({
  itemId: z.number().int(),
  itemSku: z.string(),
  itemName: z.string(),
  orderedQty: z.number(),
});
export type grnItemDetailSchemaType = z.infer<typeof grnItemDetailSchema>;

// GET /grn/getgrndetails/:id response payload.
export const grnDetailsSchema = z.object({
  grn: grnSchema,
  items: z.array(grnItemDetailSchema),
});
export type grnDetailsSchemaType = z.infer<typeof grnDetailsSchema>;

// POST /grn/creategrn body — header + lines. GRN + lines are created in
// `draft` status; no stock effect until a line is QA-accepted or bypassed.
export const createGrnLineSchema = z.object({
  poItemId: z.number().int().positive(),
  arrivedQty: z.number().positive(),
});
export type createGrnLineSchemaType = z.infer<typeof createGrnLineSchema>;

export const createGrnSchema = z.object({
  poId: z.number().int().positive(),
  challanNo: z.string().max(100).optional(),
  challanDate: z.coerce.date().optional(),
  vehicleNo: z.string().max(50).optional(),
  driverName: z.string().max(200).optional(),
  driverPhone: z.string().max(30).optional(),
  remarks: z.string().max(1000).optional(),
  lines: z.array(createGrnLineSchema).min(1),
});
export type createGrnSchemaType = z.infer<typeof createGrnSchema>;

// PATCH /grn/updategrn body — header fields and/or line arrivedQty edits.
// Only legal while the GRN is still `draft` (no line has posted yet).
export const updateGrnLineSchema = z.object({
  id: z.number().int().positive(),
  arrivedQty: z.number().positive(),
});
export type updateGrnLineSchemaType = z.infer<typeof updateGrnLineSchema>;

export const updateGrnSchema = z
  .object({
    grnId: z.number().int().positive(),
    challanNo: z.string().max(100).nullish(),
    challanDate: z.coerce.date().nullish(),
    vehicleNo: z.string().max(50).nullish(),
    driverName: z.string().max(200).nullish(),
    driverPhone: z.string().max(30).nullish(),
    remarks: z.string().max(1000).nullish(),
    lines: z
      .array(updateGrnLineSchema)
      .nullish()
      .transform((v) => v ?? []),
  })
  .superRefine((data, ctx) => {
    const hasUpdateField =
      data.challanNo !== undefined ||
      data.challanDate !== undefined ||
      data.vehicleNo !== undefined ||
      data.driverName !== undefined ||
      data.driverPhone !== undefined ||
      data.remarks !== undefined ||
      data.lines.length > 0;

    if (!hasUpdateField) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one updatable field must be provided",
      });
    }
  });
export type updateGrnSchemaType = z.infer<typeof updateGrnSchema>;

// POST /grn/:id/lines/:lineId/qa body — QA accept/reject decision.
// certificateUrl/remarks are logged onto a `qaTests` row, not the grnItems
// row (grnItems has no such columns — reusing the existing qaTests table
// instead of adding new ones).
export const grnQaActionSchema = z
  .object({
    decision: z.enum(["accept", "reject"]),
    acceptedQty: z.number().min(0).optional(),
    rejectedQty: z.number().min(0).optional(),
    remarks: z.string().max(1000).optional(),
    certificateUrl: z.string().url().optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.decision === "accept" &&
      (data.acceptedQty === undefined || data.acceptedQty <= 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "acceptedQty must be > 0 when decision is accept",
        path: ["acceptedQty"],
      });
    }
    if (
      data.decision === "reject" &&
      (data.rejectedQty === undefined || data.rejectedQty <= 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "rejectedQty must be > 0 when decision is reject",
        path: ["rejectedQty"],
      });
    }
  });
export type grnQaActionSchemaType = z.infer<typeof grnQaActionSchema>;

// POST /grn/:id/lines/:lineId/bypass body — mandatory reason. acceptedQty
// defaults to the line's arrivedQty (receivedQty column) if omitted; the
// caller may reduce it for visible damage at receipt.
export const grnBypassSchema = z.object({
  bypassReason: z.string().min(1).max(1000),
  acceptedQty: z.number().positive().optional(),
});
export type grnBypassSchemaType = z.infer<typeof grnBypassSchema>;

// POST /grn/:id/lines/:lineId/correction body — owner/back_office only.
// Posts a negative stock_adjustment ledger entry; never mutates the
// original GRN line row (audit trail stays intact).
export const grnCorrectionSchema = z.object({
  qty: z.number().positive(),
  reason: z.string().min(1).max(1000),
});
export type grnCorrectionSchemaType = z.infer<typeof grnCorrectionSchema>;

export const grnListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
    sortBy: z.enum(["id", "grnNumber", "status", "receivedDate"]).optional(),
    sortDir: z.enum(["asc", "desc"]).default("asc"),
    poId: z.coerce.number().int().positive().optional(),
    status: grnStatusSchema.optional(),
    qaStatus: grnQaStatusSchema.optional(),
    q: z.string().trim().min(1).optional(),
  })
  .strict();
export type grnListQuerySchemaType = z.infer<typeof grnListQuerySchema>;
