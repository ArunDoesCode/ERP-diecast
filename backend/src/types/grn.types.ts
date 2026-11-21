import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import {
  grnItems,
  grnStatusEnum,
  grns,
  poStatusEnum,
  prStatusEnum,
} from "../db/schemas/02_procurement-purchasing";
import { searchTermSchema } from "../lib/safe-search";

// Units counted in whole pieces (BR-GRN-02). One source: the frontend copy in
// frontend/src/lib/grn-units.ts must match (contract test, #31).
export const WHOLE_NUMBER_UNITS: readonly string[] = [
  "pcs",
  "set",
  "sets",
  "nos",
];

// Quantities: up to 3 decimals (BR-GRN-02). Whole-number rule for pcs/set items
// needs the item's unit, so the service enforces that one (400).
const qty3 = (schema: z.ZodNumber) =>
  schema
    .refine((v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6, {
      message: "Quantity can have at most 3 decimals",
    })
    .refine((v) => v <= 1e9, { message: "Quantity is too large" });

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

// GET /grn/getgrns row: the header plus its PO's number (BR-GRN-45).
export const grnQaSummarySchema = z.enum([
  "pending",
  "passed",
  "failed",
  "mixed",
]);
export type grnQaSummarySchemaType = z.infer<typeof grnQaSummarySchema>;

export const grnListRowSchema = grnSchema.extend({
  poNumber: z.string().nullable(),
  // Contract step 2 (BR-FF-28, 108, 109, 115): optional until implemented.
  supplierName: z.string().nullable(),
  lineCount: z.number().int().min(0),
  /** pending if any line pending; passed (passed/waived); failed; else mixed. */
  qaSummary: grnQaSummarySchema.nullable(),
  /** Caller holds po.manage; else the PO number is plain text (BR-FF-03). */
  poCanOpen: z.boolean(),
});
export type grnListRowSchemaType = z.infer<typeof grnListRowSchema>;

// The GRN's PO and the requisitions behind it, for the document flow (BR-GRN-45).
export const grnLinkedPoSchema = z.object({
  id: z.number().int(),
  poNumber: z.string(),
  status: z.enum(poStatusEnum.enumValues),
});
export const grnLinkedPrSchema = z.object({
  id: z.number().int(),
  prNumber: z.string(),
  status: z.enum(prStatusEnum.enumValues),
});

// Response shape for a stored GRN line row.
export const grnItemSchema = createSelectSchema(grnItems);
export type grnItemSchemaType = z.infer<typeof grnItemSchema>;

// GRN line joined with item + PO-item fields, as returned by getDetails.
export const grnItemDetailSchema = grnItemSchema.extend({
  itemId: z.number().int(),
  itemSku: z.string(),
  itemName: z.string(),
  // BR-GRN-46
  uom: z.string(),
  orderedQty: z.number(),
  // PO line qty accepted so far across all GRNs (BR-GRN-47).
  poReceivedQty: z.number(),
  // Sum of all corrections posted on this line (BR-GRN-35).
  correctedQty: z.number(),
  // acceptedQty - correctedQty. acceptedQty itself never changes (BR-GRN-35).
  netAcceptedQty: z.number(),
});
export type grnItemDetailSchemaType = z.infer<typeof grnItemDetailSchema>;

// GET /grn/getgrndetails/:id response payload.
export const grnDetailsSchema = z.object({
  // supplierName: the GRN header shows the supplier (additive, BR-FF-108).
  grn: grnSchema.extend({ supplierName: z.string().nullable() }),
  po: grnLinkedPoSchema.nullable(),
  prs: z.array(grnLinkedPrSchema),
  items: z.array(grnItemDetailSchema),
});
export type grnDetailsSchemaType = z.infer<typeof grnDetailsSchema>;

// POST /grn/creategrn body — header + lines. GRN + lines are created in
// `draft` status; no stock effect until a line is QA-accepted or bypassed.
export const createGrnLineSchema = z.object({
  poItemId: z.number().int().positive(),
  arrivedQty: qty3(z.number().positive()),
  // Supplier heat / batch number, copied onto the ledger row (BR-GRN-21).
  batchNumber: z.string().trim().min(1).max(100).optional(),
});
export type createGrnLineSchemaType = z.infer<typeof createGrnLineSchema>;

export const createGrnSchema = z.object({
  poId: z.number().int().positive(),
  // Mandatory (BR-GRN-05). receivedDate is NOT accepted: server time (BR-GRN-08);
  // if a client sends it, it is ignored.
  challanNo: z.string().trim().min(1).max(100),
  challanDate: z.coerce.date().optional(),
  vehicleNo: z.string().max(50).optional(),
  driverName: z.string().max(200).optional(),
  driverPhone: z.string().max(30).optional(),
  remarks: z.string().max(1000).optional(),
  lines: z.array(createGrnLineSchema).min(1).max(500),
});
export type createGrnSchemaType = z.infer<typeof createGrnSchema>;

// PATCH /grn/updategrn body — header fields and/or line arrivedQty edits.
// Only legal while the GRN is still `draft` (no line has posted yet).
export const updateGrnLineSchema = z.object({
  id: z.number().int().positive(),
  arrivedQty: qty3(z.number().positive()),
  batchNumber: z.string().trim().min(1).max(100).nullish(),
});
export type updateGrnLineSchemaType = z.infer<typeof updateGrnLineSchema>;

export const updateGrnSchema = z
  .object({
    grnId: z.number().int().positive(),
    // Challan stays mandatory: it can be changed but not cleared (BR-GRN-05).
    challanNo: z.string().trim().min(1).max(100).optional(),
    challanDate: z.coerce.date().nullish(),
    vehicleNo: z.string().max(50).nullish(),
    driverName: z.string().max(200).nullish(),
    driverPhone: z.string().max(30).nullish(),
    remarks: z.string().max(1000).nullish(),
    lines: z
      .array(updateGrnLineSchema)
      .max(500)
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

// POST /grn/:id/lines/:lineId/qa body — one decision per line (BR-GRN-09, 10).
// acceptedQty + rejectedQty must equal the line's arrived qty (service, 400).
// The line is `passed` if acceptedQty > 0, else `failed`; `decision` is derived
// (output only, not sent). certificateUrl/remarks go onto one `qa_tests` row.
export const grnQaActionBodySchema = z
  .object({
    acceptedQty: qty3(z.number().min(0)),
    rejectedQty: qty3(z.number().min(0)),
    remarks: z.string().max(1000).optional(),
    certificateUrl: z
      .string()
      .url()
      .refine((u) => /^https?:\/\//i.test(u), {
        message: "certificateUrl must be an http(s) link",
      })
      .optional(),
    batchNumber: z.string().trim().min(1).max(100).optional(),
    // Required (and only honoured) when the accept goes past 105% of ordered
    // and the actor holds `grn.over_receipt_override` (BR-GRN-15).
    overrideReason: z.string().trim().min(1).max(1000).optional(),
  })
  .refine((d) => d.acceptedQty + d.rejectedQty > 0, {
    message: "acceptedQty + rejectedQty must be > 0",
  });

// Parsed form used by controller/service: adds the derived `decision`.
export const grnQaActionSchema = grnQaActionBodySchema.transform((d) => ({
  ...d,
  decision: (d.acceptedQty > 0 ? "accept" : "reject") as "accept" | "reject",
}));
export type grnQaActionSchemaType = z.infer<typeof grnQaActionSchema>;

// POST /grn/:id/lines/:lineId/bypass body — needs `grn.qa_bypass` and a reason
// (BR-GRN-18). acceptedQty defaults to arrived; a smaller value records the rest
// as rejected (BR-GRN-10).
export const grnBypassSchema = z.object({
  bypassReason: z.string().trim().min(1).max(1000),
  acceptedQty: qty3(z.number().positive()).optional(),
  batchNumber: z.string().trim().min(1).max(100).optional(),
  overrideReason: z.string().trim().min(1).max(1000).optional(),
});
export type grnBypassSchemaType = z.infer<typeof grnBypassSchema>;

// POST /grn/:id/lines/:lineId/correction body — `grn.correct` (BR-GRN-29).
// Posts one `grn_correction` ledger row (-qty at the posted cost); never edits
// the line's accepted qty (BR-GRN-35).
export const grnCorrectionSchema = z.object({
  qty: qty3(z.number().positive()),
  reason: z.string().trim().min(1).max(1000),
});
export type grnCorrectionSchemaType = z.infer<typeof grnCorrectionSchema>;

export const grnListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
    sortBy: z.enum(["id", "grnNumber", "status", "receivedDate"]).optional(),
    sortDir: z.enum(["asc", "desc"]).default("asc"),
    poId: z.coerce.number().int().positive().optional(),
    // Comma-separated statuses, e.g. "accepted,partial_accepted" (Done chip).
    status: z
      .string()
      .max(200)
      .optional()
      .transform((value) =>
        value
          ? value
              .split(",")
              .map((entry) => entry.trim())
              .filter(Boolean)
          : undefined,
      )
      .pipe(z.array(grnStatusSchema).max(20).optional()),
    qaStatus: grnQaStatusSchema.optional(),
    q: searchTermSchema,
    // BR-FF-28, 108: received-date bucket (late = before IST today).
    bucket: z.enum(["late", "today", "later"]).optional(),
  })
  .strict()
  // CR-05: bucket=late implies qaStatus=pending; any other qaStatus is a 400.
  .refine(
    (q) =>
      q.bucket !== "late" ||
      q.qaStatus === undefined ||
      q.qaStatus === "pending",
    { message: "bucket=late requires qaStatus=pending", path: ["bucket"] },
  );
export type grnListQuerySchemaType = z.infer<typeof grnListQuerySchema>;

// GET /grn/getreceivablepos (BR-FF-61..64, 66, 70..72). Receive picker + form.
const DOC_ID_MAX = 2147483647;

export const receivablePoBucketSchema = z.enum(["late", "today", "later"]);

export const receivablePosQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
    sortBy: z.enum(["dueDate", "poNumber", "supplierName"]).default("dueDate"),
    sortDir: z.enum(["asc", "desc"]).default("asc"),
    q: searchTermSchema,
    poId: z.coerce.number().int().min(1).max(DOC_ID_MAX).optional(),
    bucket: receivablePoBucketSchema.optional(),
  })
  .strict();
export type receivablePosQuerySchemaType = z.infer<
  typeof receivablePosQuerySchema
>;

// No price, GST, line value or totals, ever (BR-FF-62, 06).
export const receivablePoLineSchema = z.object({
  poItemId: z.number().int(),
  itemId: z.number().int(),
  sku: z.string(),
  itemName: z.string(),
  uom: z.string(),
  orderedQty: z.number(),
  receivedQty: z.number(),
  pendingQaQty: z.number(),
  openQty: z.number(),
});

export const receivablePoRowSchema = z.object({
  poId: z.number().int(),
  poNumber: z.string(),
  supplierId: z.number().int(),
  supplierName: z.string(),
  status: z.enum(["dispatched", "partial_received"]),
  dueDate: z.string().nullable(),
  isLate: z.boolean(),
  lines: z.array(receivablePoLineSchema),
});
export type receivablePoRowSchemaType = z.infer<typeof receivablePoRowSchema>;

// paginationMeta plus `today` (IST day, YYYY-MM-DD) — the picker's "today".
export const receivablePosResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(receivablePoRowSchema),
  meta: z.object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    total: z.number().int().min(0),
    totalPages: z.number().int().min(0),
    today: z.string(),
  }),
});
