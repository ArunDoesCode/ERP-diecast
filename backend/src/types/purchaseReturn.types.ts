import { z } from "zod";
import {
  debitNoteStatusEnum,
  purchaseReturnEventActionEnum,
  purchaseReturnSourceEnum,
  purchaseReturnStatusEnum,
} from "../db/schemas/02_procurement-purchasing";
import { searchTermSchema } from "../lib/safe-search";

// Quantities: up to 3 decimals, > 0, <= 1e9 (BR-PRT-04). The whole-number rule for
// pcs/set items needs the line's unit, so the service enforces that one (400).
const qty3 = z
  .number()
  .positive()
  .refine((v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6, {
    message: "Quantity can have at most 3 decimals",
  })
  .refine((v) => v <= 1e9, { message: "Quantity is too large" });

const idSchema = z.number().int().positive();
const reasonSchema = z.string().trim().min(3).max(500);

export const purchaseReturnStatusSchema = z.enum(
  purchaseReturnStatusEnum.enumValues,
);
export const purchaseReturnSourceSchema = z.enum(
  purchaseReturnSourceEnum.enumValues,
);
export const debitNoteStatusSchema = z.enum(debitNoteStatusEnum.enumValues);
export const purchaseReturnEventActionSchema = z.enum(
  purchaseReturnEventActionEnum.enumValues,
);

// --- request bodies (strict: rate / GST % / item / unit / heat no. never accepted, BR-PRT-09) ---
export const purchaseReturnLineInputSchema = z
  .object({
    grnItemId: idSchema,
    source: purchaseReturnSourceSchema,
    qty: qty3,
  })
  .strict();
export type PurchaseReturnLineInput = z.infer<
  typeof purchaseReturnLineInputSchema
>;

const linesSchema = z.array(purchaseReturnLineInputSchema).min(1).max(100);

const headerShape = {
  reason: reasonSchema,
  vendorReturnRef: z.string().trim().max(100),
  transporter: z.string().trim().max(100),
  vehicleNo: z.string().trim().max(20),
  remarks: z.string().trim().max(500),
  replacementExpected: z.boolean(),
};

export const createPurchaseReturnSchema = z
  .object({
    grnId: idSchema,
    reason: headerShape.reason,
    vendorReturnRef: headerShape.vendorReturnRef.optional(),
    transporter: headerShape.transporter.optional(),
    vehicleNo: headerShape.vehicleNo.optional(),
    remarks: headerShape.remarks.optional(),
    replacementExpected: headerShape.replacementExpected.optional(),
    lines: linesSchema,
  })
  .strict();
export type CreatePurchaseReturnInput = z.infer<
  typeof createPurchaseReturnSchema
>;

export const updatePurchaseReturnSchema = z
  .object({
    id: idSchema,
    reason: headerShape.reason.optional(),
    vendorReturnRef: headerShape.vendorReturnRef.optional(),
    transporter: headerShape.transporter.optional(),
    vehicleNo: headerShape.vehicleNo.optional(),
    remarks: headerShape.remarks.optional(),
    replacementExpected: headerShape.replacementExpected.optional(),
    lines: linesSchema.optional(),
  })
  .strict();
export type UpdatePurchaseReturnInput = z.infer<
  typeof updatePurchaseReturnSchema
>;

export const cancelPurchaseReturnSchema = z
  .object({ reason: reasonSchema })
  .strict();
export type CancelPurchaseReturnInput = z.infer<
  typeof cancelPurchaseReturnSchema
>;

// --- queries ---
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const purchaseReturnListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
    sortBy: z.enum(["id", "proNumber", "createdAt", "status"]).default("id"),
    sortDir: z.enum(["asc", "desc"]).default("desc"),
    status: purchaseReturnStatusSchema.optional(),
    supplierId: z.coerce.number().int().positive().optional(),
    grnId: z.coerce.number().int().positive().optional(),
    poId: z.coerce.number().int().positive().optional(),
    dateFrom: isoDate.optional(),
    dateTo: isoDate.optional(),
    q: searchTermSchema,
  })
  .strict()
  .refine((v) => !v.dateFrom || !v.dateTo || v.dateFrom <= v.dateTo, {
    message: "dateFrom must be on or before dateTo",
    path: ["dateFrom"],
  });
export type PurchaseReturnListQuery = z.infer<
  typeof purchaseReturnListQuerySchema
>;

export const awaitingReturnQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
    sortBy: z.enum(["grnId", "grnNumber", "receivedDate"]).default("grnId"),
    sortDir: z.enum(["asc", "desc"]).default("asc"),
    supplierId: z.coerce.number().int().positive().optional(),
  })
  .strict();
export type AwaitingReturnQuery = z.infer<typeof awaitingReturnQuerySchema>;

// --- responses ---
export const purchaseReturnCreatedSchema = z.object({
  id: z.number().int(),
  proNumber: z.string(),
  status: purchaseReturnStatusSchema,
});

export const purchaseReturnCancelledDraftSchema = z.object({
  id: z.number().int(),
  status: z.literal("cancelled"),
});

export const purchaseReturnPostedSchema = z.object({
  id: z.number().int(),
  status: z.literal("posted"),
  debitNoteId: z.number().int(),
  dnNumber: z.string(),
  challanNumber: z.string(),
  totalPaise: z.number().int(),
  ledgerRowIds: z.array(z.number().int()),
});

export const purchaseReturnCancelledSchema = z.object({
  id: z.number().int(),
  status: z.literal("cancelled"),
  debitNoteStatus: z.literal("cancelled"),
});

export const purchaseReturnListRowSchema = z.object({
  id: z.number().int(),
  proNumber: z.string(),
  status: purchaseReturnStatusSchema,
  grnNumber: z.string(),
  poNumber: z.string(),
  supplierName: z.string(),
  linesCount: z.number().int(),
  totalPaise: z.number().int().nullable(),
  createdAt: z.string(),
});

export const purchaseReturnListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(purchaseReturnListRowSchema),
  meta: z.object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    total: z.number().int().min(0),
    totalPages: z.number().int().min(0),
    statusCounts: z.object({
      draft: z.number().int(),
      posted: z.number().int(),
      cancelled: z.number().int(),
    }),
    awaitingCount: z.number().int(),
  }),
});

export const awaitingReturnRowSchema = z.object({
  grnId: z.number().int(),
  grnNumber: z.string(),
  grnItemId: z.number().int(),
  itemId: z.number().int(),
  itemName: z.string(),
  batchNumber: z.string().nullable(),
  rejectedQty: z.number(),
  rejectedReserved: z.number(),
  awaitingQty: z.number(),
  receivedDate: z.string().nullable(),
  supplierId: z.number().int(),
  supplierName: z.string(),
  uom: z.string(),
});

export const awaitingReturnListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(awaitingReturnRowSchema),
  meta: purchaseReturnListResponseSchema.shape.meta,
});

const capFields = {
  rejectedQty: z.number(),
  rejectedReserved: z.number(),
  rejectedReturnable: z.number(),
  acceptedNet: z.number(),
  acceptedReserved: z.number(),
  acceptedReturnable: z.number(),
};

export const purchaseReturnPrefillSchema = z.object({
  grnId: z.number().int(),
  grnNumber: z.string(),
  poId: z.number().int(),
  supplierId: z.number().int(),
  supplierName: z.string(),
  poNumber: z.string(),
  replacementExpected: z.literal(false),
  lines: z.array(
    z.object({
      grnItemId: z.number().int(),
      itemId: z.number().int(),
      itemName: z.string(),
      uom: z.string(),
      batchNumber: z.string().nullable(),
      ratePaise: z.number().int(),
      gstPercent: z.number(),
      ...capFields,
      suggested: z.array(
        z.object({ source: z.literal("rejected"), qty: z.number() }),
      ),
    }),
  ),
  mainAction: z.enum(["prefilled", "secondary", "none"]),
});

export const purchaseReturnDetailsSchema = z.object({
  id: z.number().int(),
  proNumber: z.string(),
  status: purchaseReturnStatusSchema,
  reason: z.string(),
  vendorReturnRef: z.string().nullable(),
  transporter: z.string().nullable(),
  vehicleNo: z.string().nullable(),
  remarks: z.string().nullable(),
  challanNumber: z.string().nullable(),
  replacementExpected: z.boolean(),
  grnId: z.number().int(),
  grnNumber: z.string(),
  grnChallanNo: z.string().nullable(),
  poId: z.number().int(),
  poNumber: z.string(),
  supplierId: z.number().int(),
  supplierName: z.string(),
  postedBy: z.number().int().nullable(),
  postedAt: z.string().nullable(),
  cancelledBy: z.number().int().nullable(),
  cancelledAt: z.string().nullable(),
  cancelReason: z.string().nullable(),
  createdBy: z.number().int(),
  createdAt: z.string(),
  lastUpdatedBy: z.number().int(),
  lastUpdatedAt: z.string(),
  lines: z.array(
    z.object({
      id: z.number().int(),
      grnItemId: z.number().int(),
      poItemId: z.number().int(),
      itemId: z.number().int(),
      itemName: z.string(),
      hsnCode: z.string().nullable(),
      batchNumber: z.string().nullable(),
      source: purchaseReturnSourceSchema,
      qty: z.number(),
      uom: z.string(),
      ratePaise: z.number().int(),
      gstPercent: z.number(),
      taxablePaise: z.number().int().nullable(),
      gstPaise: z.number().int().nullable(),
      cgstPaise: z.number().int().nullable(),
      sgstPaise: z.number().int().nullable(),
      igstPaise: z.number().int().nullable(),
      ledgerId: z.number().int().nullable(),
      cancelLedgerId: z.number().int().nullable(),
      ...capFields,
    }),
  ),
  documentFlow: z.array(
    z.object({
      step: z.enum(["po", "grn", "return"]),
      docNo: z.string(),
      id: z.number().int(),
      status: z.string(),
    }),
  ),
  debitNote: z
    .object({
      id: z.number().int(),
      dnNumber: z.string(),
      debitNoteDate: z.string(),
      status: debitNoteStatusSchema,
      taxablePaise: z.number().int(),
      cgstPaise: z.number().int(),
      sgstPaise: z.number().int(),
      igstPaise: z.number().int(),
      totalPaise: z.number().int(),
      isInterstate: z.boolean(),
      billOffsetPaise: z.number().int(),
      supplierBill: z
        .object({
          id: z.number().int(),
          invoiceNumber: z.string(),
          invoiceDate: z.string(),
        })
        .nullable(),
      plantName: z.string(),
      plantAddress: z.string(),
      plantGstin: z.string(),
      plantStateCode: z.string(),
      supplierName: z.string(),
      supplierAddress: z.string().nullable(),
      supplierGstin: z.string().nullable(),
    })
    .nullable(),
  events: z.array(
    z.object({
      id: z.number().int(),
      action: purchaseReturnEventActionSchema,
      fromStatus: purchaseReturnStatusSchema.nullable(),
      toStatus: purchaseReturnStatusSchema,
      reason: z.string().nullable(),
      actorId: z.number().int(),
      actorName: z.string().nullable(),
      at: z.string(),
    }),
  ),
  // Drafts only; same pure function post uses (BR-PRT-40).
  preview: z
    .object({
      stockOut: z.array(
        z.object({
          itemId: z.number().int(),
          qty: z.number(),
          uom: z.string(),
        }),
      ),
      debitNoteTotalPaise: z.number().int(),
      poEffect: z.enum(["credit_only", "replacement"]),
    })
    .nullable(),
});
