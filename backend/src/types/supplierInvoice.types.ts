import { z } from "zod";
import {
  supplierInvoiceChargeTypeEnum,
  supplierInvoiceHistoryActionEnum,
  supplierInvoiceMismatchCheckEnum,
  supplierInvoiceMismatchUnitEnum,
  supplierInvoiceStatusEnum,
  supplierInvoiceTaxTypeEnum,
} from "../db/schemas/02_procurement-purchasing";
import { paginationMetaSchema } from "../lib/response-schemas";
import { searchTermSchema } from "../lib/safe-search";

// Supplier invoice contract (docs/specs/supplier-invoice/design/api.md).
// Quantities: up to 3 decimals, > 0, <= 1e9 (BR-SINV-08). The whole-number rule for
// pcs/set items needs the line's unit, so the service enforces that one (400).

const idSchema = z.number().int().positive();
const paise = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

const qty3 = z
  .number()
  .positive()
  .refine((v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6, {
    message: "Quantity can have at most 3 decimals",
  })
  .refine((v) => v <= 1e9, { message: "Quantity is too large" });

/** GST slab list in percent (BR-SINV-08); the server converts to basis points. */
export const GST_SLABS_PERCENT = [
  0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 28, 40,
] as const;
export const gstPercentSchema = z
  .number()
  .max(40)
  .refine((v) => (GST_SLABS_PERCENT as readonly number[]).includes(v), {
    message: "GST % must be one of the slab rates",
  });

/** BR-SINV-05: trimmed, upper-cased, 1-16 chars of A-Z 0-9 - /. */
export const invoiceNumberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9/-]{1,16}$/, "Use 1-16 characters: A-Z, 0-9, - and /");

const reasonSchema = z.string().trim().min(3).max(500);

// --- enums ---
export const supplierInvoiceStatusSchema = z.enum(
  supplierInvoiceStatusEnum.enumValues,
);
export const supplierInvoiceTaxTypeSchema = z.enum(
  supplierInvoiceTaxTypeEnum.enumValues,
);
export const supplierInvoiceChargeTypeSchema = z.enum(
  supplierInvoiceChargeTypeEnum.enumValues,
);
export const supplierInvoiceMismatchCheckSchema = z.enum(
  supplierInvoiceMismatchCheckEnum.enumValues,
);
export const supplierInvoiceMismatchUnitSchema = z.enum(
  supplierInvoiceMismatchUnitEnum.enumValues,
);
export const supplierInvoiceHistoryActionSchema = z.enum(
  supplierInvoiceHistoryActionEnum.enumValues,
);

// --- request bodies (strict: computed values in the body are 400, BR-SINV-10, 13) ---
export const printedTotalsSchema = z
  .object({
    taxablePaise: paise,
    cgstPaise: paise,
    sgstPaise: paise,
    igstPaise: paise,
    totalPaise: paise,
  })
  .strict();

export const supplierInvoiceLineInputSchema = z
  .object({
    grnItemId: idSchema,
    qty: qty3,
    ratePaise: z.number().int().min(1).max(1_000_000_000_000),
    gstPercent: gstPercentSchema,
  })
  .strict();
export type SupplierInvoiceLineInput = z.infer<
  typeof supplierInvoiceLineInputSchema
>;

export const supplierInvoiceChargeInputSchema = z
  .object({
    type: supplierInvoiceChargeTypeSchema,
    description: z.string().trim().max(200).optional(),
    taxablePaise: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    gstPercent: gstPercentSchema,
  })
  .strict()
  .refine((v) => v.type !== "other" || (v.description?.length ?? 0) >= 1, {
    message: "Description is required for an Other charge",
    path: ["description"],
  });
export type SupplierInvoiceChargeInput = z.infer<
  typeof supplierInvoiceChargeInputSchema
>;

const itemLinesSchema = z.array(supplierInvoiceLineInputSchema).min(1).max(200);
const chargeLinesSchema = z.array(supplierInvoiceChargeInputSchema).max(10);

export const createSupplierInvoiceSchema = z
  .object({
    poId: idSchema,
    invoiceNumber: invoiceNumberSchema,
    invoiceDate: isoDate,
    reverseCharge: z.boolean().optional(),
    itcNotEligible: z.boolean().optional(),
    printed: printedTotalsSchema,
    lines: itemLinesSchema,
    charges: chargeLinesSchema.optional(),
  })
  .strict();
export type CreateSupplierInvoiceInput = z.infer<
  typeof createSupplierInvoiceSchema
>;

// PATCH: id in the body; every other field optional; lines / charges replace the set.
// poId is immutable: another poId is a 400 (service).
export const updateSupplierInvoiceSchema = z
  .object({
    id: idSchema,
    poId: idSchema.optional(),
    invoiceNumber: invoiceNumberSchema.optional(),
    invoiceDate: isoDate.optional(),
    reverseCharge: z.boolean().optional(),
    itcNotEligible: z.boolean().optional(),
    printed: printedTotalsSchema.optional(),
    lines: itemLinesSchema.optional(),
    charges: chargeLinesSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).some((k) => k !== "id"), {
    message: "Send at least one field to change",
  });
export type UpdateSupplierInvoiceInput = z.infer<
  typeof updateSupplierInvoiceSchema
>;

// submit / back-to-draft take an empty object.
export const supplierInvoiceEmptyBodySchema = z.object({}).strict();

export const releaseSupplierInvoiceSchema = z
  .object({ reason: reasonSchema })
  .strict();
export type ReleaseSupplierInvoiceInput = z.infer<
  typeof releaseSupplierInvoiceSchema
>;

// BR-SINV-26: 10-500 chars when the bill is approved, 3-500 when blocked (service: 400 SINV_REASON_LENGTH).
export const cancelSupplierInvoiceSchema = z
  .object({ reason: z.string().trim().max(500) })
  .strict();
export type CancelSupplierInvoiceInput = z.infer<
  typeof cancelSupplierInvoiceSchema
>;

// --- queries ---
export const supplierInvoiceListStatusSchema = z.enum([
  "draft",
  "blocked",
  "payable",
  "overdue",
  "cancelled",
  "all",
]);

export const supplierInvoiceListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
    sortBy: z
      .enum([
        "ourNumber",
        "invoiceNumber",
        "invoiceDate",
        "dueDate",
        "totalPaise",
        "createdAt",
      ])
      .default("createdAt"),
    sortDir: z.enum(["asc", "desc"]).default("desc"),
    status: supplierInvoiceListStatusSchema.default("all"),
    grnId: z.coerce.number().int().positive().optional(),
    supplierId: z.coerce.number().int().positive().optional(),
    poId: z.coerce.number().int().positive().optional(),
    q: searchTermSchema,
  })
  .strict();
export type SupplierInvoiceListQuery = z.infer<
  typeof supplierInvoiceListQuerySchema
>;

export const billableLinesQuerySchema = z
  .object({
    poId: z.coerce.number().int().positive(),
    grnId: z.coerce.number().int().positive().optional(),
  })
  .strict();
export type BillableLinesQuery = z.infer<typeof billableLinesQuerySchema>;

// --- responses ---
export const supplierInvoiceRowSchema = z.object({
  id: z.number().int(),
  ourNumber: z.string(),
  invoiceNumber: z.string(),
  invoiceDate: z.string(),
  supplier: z.object({ id: z.number().int(), name: z.string() }),
  poNumber: z.string(),
  status: supplierInvoiceStatusSchema,
  totalPaise: z.number().int(),
  dueDate: z.string().nullable(),
  overdue: z.boolean(),
});

export const supplierInvoiceListMetaSchema = paginationMetaSchema.extend({
  statusCounts: z.object({
    draft: z.number().int(),
    blocked: z.number().int(),
    payable: z.number().int(),
    overdue: z.number().int(),
    cancelled: z.number().int(),
  }),
});

export const supplierInvoiceListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(supplierInvoiceRowSchema),
  meta: supplierInvoiceListMetaSchema,
});

export const billableLineSchema = z.object({
  grnItemId: z.number().int(),
  grnId: z.number().int(),
  grnNumber: z.string(),
  itemName: z.string(),
  uom: z.string(),
  netAcceptedQty: z.number(),
  billedQty: z.number(),
  returnedQty: z.number(),
  billableQty: z.number(),
  poRatePaise: z.number().int(),
  poGstPercent: z.number(),
});

export const billableLinesSchema = z.object({
  po: z.object({
    id: z.number().int(),
    // PO detail pages are keyed by PR id; null when the PO has no PR link
    prId: z.number().int().nullable(),
    poNumber: z.string(),
    status: z.string(),
    paymentTermsDays: z.number().int(),
  }),
  supplier: z.object({
    id: z.number().int(),
    name: z.string(),
    gstin: z.string().nullable(),
  }),
  lines: z.array(billableLineSchema),
});

const detailLineSchema = z.object({
  id: z.number().int(),
  lineNo: z.number().int(),
  kind: z.enum(["item", "charge"]),
  grnItemId: z.number().int().nullable(),
  grnId: z.number().int().nullable(),
  grnNumber: z.string().nullable(),
  itemName: z.string().nullable(),
  chargeType: supplierInvoiceChargeTypeSchema.nullable(),
  description: z.string().nullable(),
  uom: z.string().nullable(),
  qty: z.number().nullable(),
  ratePaise: z.number().int().nullable(),
  gstBp: z.number().int(),
  taxablePaise: z.number().int(),
  cgstPaise: z.number().int(),
  sgstPaise: z.number().int(),
  igstPaise: z.number().int(),
  poRatePaise: z.number().int().nullable(),
  poGstBp: z.number().int().nullable(),
  billableQty: z.number().nullable(),
  belowPoRate: z.boolean(),
});

const mismatchSchema = z.object({
  check: supplierInvoiceMismatchCheckSchema,
  lineId: z.number().int().nullable(),
  head: z.string().nullable(),
  expected: z.number().int(),
  billed: z.number().int(),
  unit: supplierInvoiceMismatchUnitSchema,
});

const historyRowSchema = z.object({
  id: z.number().int(),
  action: supplierInvoiceHistoryActionSchema,
  fromStatus: supplierInvoiceStatusSchema.nullable(),
  toStatus: supplierInvoiceStatusSchema.nullable(),
  reason: z.string().nullable(),
  detail: z.unknown().nullable(),
  createdBy: z.number().int(),
  createdByName: z.string().nullable(),
  createdAt: z.string(),
});

const docRefSchema = z.object({
  id: z.number().int(),
  number: z.string(),
  status: z.string(),
});

export const supplierInvoiceDetailsSchema = z.object({
  id: z.number().int(),
  ourNumber: z.string(),
  invoiceNumber: z.string(),
  invoiceDate: z.string(),
  fy: z.string(),
  status: supplierInvoiceStatusSchema,
  poId: z.number().int(),
  prId: z.number().int().nullable(),
  poNumber: z.string(),
  supplier: z.object({
    id: z.number().int(),
    name: z.string(),
    gstin: z.string().nullable(),
  }),
  billedAmountPaise: z.number().int(),
  printed: printedTotalsSchema,
  taxablePaise: z.number().int(),
  cgstPaise: z.number().int(),
  sgstPaise: z.number().int(),
  igstPaise: z.number().int(),
  totalPaise: z.number().int(),
  taxType: supplierInvoiceTaxTypeSchema.nullable(),
  supplierGstin: z.string().nullable(),
  supplierStateCode: z.string().nullable(),
  plantStateCode: z.string().nullable(),
  reverseCharge: z.boolean(),
  itcIneligible: z.boolean(),
  paymentTermsDays: z.number().int(),
  dueDate: z.string().nullable(),
  overdue: z.boolean(),
  paymentStatus: z.string(),
  tolerances: z.object({
    priceTolBpUsed: z.number().int().nullable(),
    weightTolBpUsed: z.number().int().nullable(),
  }),
  submittedBy: z.number().int().nullable(),
  submittedAt: z.string().nullable(),
  releasedBy: z.number().int().nullable(),
  releasedAt: z.string().nullable(),
  releaseReason: z.string().nullable(),
  cancelledBy: z.number().int().nullable(),
  cancelledAt: z.string().nullable(),
  cancelReason: z.string().nullable(),
  createdBy: z.number().int(),
  createdAt: z.string(),
  lastUpdatedBy: z.number().int().nullable(),
  lastUpdatedAt: z.string().nullable(),
  lines: z.array(detailLineSchema),
  mismatches: z.array(mismatchSchema),
  history: z.array(historyRowSchema),
  debitNotes: z.array(
    z.object({
      id: z.number().int(),
      number: z.string(),
      totalPaise: z.number().int(),
      billOffsetPaise: z.number().int(),
      status: z.string(),
    }),
  ),
  netPayablePaise: z.number().int(),
  flow: z.object({
    pr: z.array(docRefSchema),
    po: docRefSchema,
    grns: z.array(docRefSchema),
  }),
});
export type SupplierInvoiceDetails = z.infer<
  typeof supplierInvoiceDetailsSchema
>;

export const supplierInvoiceDeletedSchema = z.object({
  id: z.number().int(),
  deleted: z.literal(true),
});

// --- company invoice tolerances (BR-SINV-32) ---
const percent2 = z
  .number()
  .min(0)
  .max(10)
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, {
    message: "At most 2 decimals",
  });

export const invoiceTolerancesSchema = z.object({
  priceTolerancePercent: z.number(),
  weightTolerancePercent: z.number(),
});
export type InvoiceTolerances = z.infer<typeof invoiceTolerancesSchema>;

export const updateInvoiceTolerancesSchema = z
  .object({
    priceTolerancePercent: percent2.optional(),
    weightTolerancePercent: percent2.optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.priceTolerancePercent !== undefined ||
      v.weightTolerancePercent !== undefined,
    { message: "Send at least one tolerance" },
  );
export type UpdateInvoiceTolerancesInput = z.infer<
  typeof updateInvoiceTolerancesSchema
>;
