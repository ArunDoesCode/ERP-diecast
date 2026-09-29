import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import {
  scoReceiptSettlements,
  subcontractingGrnItems,
  subcontractingGrns,
} from "../db/schemas/02_procurement-purchasing";
import { scoDetailsSchema, scoItemResponseSchema } from "./sco.types";

// --- Responses ---

// Receipt status = grn_status values, only pending_qa / accepted / partial_accepted / rejected.
export const receiptResponseSchema = createSelectSchema(
  subcontractingGrns,
).extend({
  scoNumber: z.string(),
  vendorName: z.string(),
  createdByName: z.string().nullable(),
});
export type receiptResponseSchemaType = z.infer<typeof receiptResponseSchema>;

export const receiptLineResponseSchema = createSelectSchema(
  subcontractingGrnItems,
).extend({
  finishedItemSku: z.string(),
  finishedItemName: z.string(),
  rawItemSku: z.string(),
  rawItemName: z.string(),
  qaDecidedByName: z.string().nullable(),
});
export type receiptLineResponseSchemaType = z.infer<
  typeof receiptLineResponseSchema
>;

// BR-SCO-17: which challans (and how many raw pieces) a receipt line settled.
export const receiptSettlementResponseSchema = createSelectSchema(
  scoReceiptSettlements,
).extend({
  challanId: z.number().int(),
  challanNumber: z.string(),
  scoItemId: z.number().int(),
});
export type receiptSettlementResponseSchemaType = z.infer<
  typeof receiptSettlementResponseSchema
>;

// POST create / GET details / QA decision result.
export const receiptDetailsSchema = z.object({
  receipt: receiptResponseSchema,
  lines: z.array(receiptLineResponseSchema),
  settlements: z.array(receiptSettlementResponseSchema),
});
export type receiptDetailsSchemaType = z.infer<typeof receiptDetailsSchema>;

// GET /sco/getscodetails/:id: S1 payload extended with the S3 read-outs (BR-SCO-22, 17, 12).
export const scoFullItemResponseSchema = scoItemResponseSchema.extend({
  // Raw pieces still at the vendor for this line (BR-SCO-12, 18).
  qtyAtVendor: z.number().int(),
  // accepted x service price, and GST at the line % (BR-SCO-22), paise.
  chargeDuePaise: z.number().int(),
  chargeDueGstPaise: z.number().int(),
});
export const scoChallanSettlementStatusSchema = z.object({
  challanId: z.number().int(),
  challanNumber: z.string(),
  challanLineId: z.number().int(),
  scoItemId: z.number().int(),
  qty: z.number().int(),
  settledQty: z.number().int(),
  // true when settledQty = qty (BR-SCO-17).
  settled: z.boolean(),
});
export const scoFullDetailsSchema = scoDetailsSchema.extend({
  items: z.array(scoFullItemResponseSchema),
  // Job-work charge due (BR-SCO-22): sum over lines; no bill is posted.
  chargeDue: z.object({
    subtotalPaise: z.number().int(),
    gstPaise: z.number().int(),
    totalPaise: z.number().int(),
  }),
  // Every challan line of the SCO with its settled qty.
  challanSettlements: z.array(scoChallanSettlementStatusSchema),
});
export type scoFullDetailsSchemaType = z.infer<typeof scoFullDetailsSchema>;

// --- Requests ---

export const receiptLineInputSchema = z
  .object({
    scoItemId: z.number().int().positive(),
    // BR-SCO-12: whole pieces >= 0; processed + unprocessed must be >= 1.
    processedQty: z.number().int().min(0),
    unprocessedQty: z.number().int().min(0).default(0),
  })
  .refine((l) => l.processedQty + l.unprocessedQty >= 1, {
    message: "Line needs a processed or unprocessed qty",
  });

export const createReceiptSchema = z.object({
  // BR-SCO-12: unique per vendor (409 REPEATED).
  vendorChallanNo: z.string().trim().min(1).max(50),
  // Default = now.
  receivedDate: z.coerce.date().optional(),
  notes: z.string().max(2000).optional(),
  lines: z.array(receiptLineInputSchema).min(1),
});
export type createReceiptSchemaType = z.infer<typeof createReceiptSchema>;

// BR-SCO-13: accepted + rejected = processed (checked in the service, 400).
export const qaDecisionSchema = z.object({
  acceptedQty: z.number().int().min(0),
  rejectedQty: z.number().int().min(0),
  notes: z.string().trim().min(1).max(500).optional(),
});
export type qaDecisionSchemaType = z.infer<typeof qaDecisionSchema>;

export const receiptIdParamSchema = z.object({
  receiptId: z.coerce.number().int().positive(),
});
export const receiptLineParamSchema = receiptIdParamSchema.extend({
  lineId: z.coerce.number().int().positive(),
});
