import { z } from "zod";
import {
  rfqLineStatusEnum,
  rfqQuoteStatusEnum,
  rfqStatusEnum,
} from "../db/schemas/02_procurement-rfq";
import { paginationMetaSchema } from "../lib/response-schemas";
import { searchTermSchema } from "../lib/safe-search";

// RFQ, quotes, award contract (docs/specs/rfq/design/api.md).
// Money is integer paise per item uom, capped at MAX_MONEY_PAISE (BR-STD-16);
// freight is the whole line and capped at 1e12 paise (BR-RFQ-30, 74).

export { MAX_FREIGHT_PAISE } from "../lib/rfq-math";

const idSchema = z.number().int().positive();
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
export const reasonSchema = z.string().trim().min(3).max(500);

/** Qty: > 0, at most 3 decimals, <= 1e9 (api-standards). */
export const qty3Schema = z
  .number()
  .positive()
  .refine((v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6, {
    message: "Quantity can have at most 3 decimals",
  })
  .refine((v) => v <= 1e9, { message: "Quantity is too large" });

// Rate in paise per item uom. The schema only checks "integer"; the service gives the
// coded errors (< 1 = QUOTE_LINE_INVALID / CONTRACT_LINE_INVALID, above MAX_MONEY_PAISE =
// AMOUNT_TOO_LARGE, BR-RFQ-15, 41, 74).
export const ratePaiseSchema = z.number().int().max(Number.MAX_SAFE_INTEGER);

export const rfqStatusSchema = z.enum(rfqStatusEnum.enumValues);
export const rfqLineStatusSchema = z.enum(rfqLineStatusEnum.enumValues);
export const rfqQuoteStatusSchema = z.enum(rfqQuoteStatusEnum.enumValues);

const ts = z.string(); // ISO timestamp
const tsNull = z.string().nullable();

// --- requests ---
export const rfqEmptyBodySchema = z.object({}).strict();
export const rfqReasonBodySchema = z.object({ reason: reasonSchema }).strict();

export const prLinesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
    sortBy: z.enum(["prNumber", "itemId", "expectedDate", "id"]).optional(),
    sortDir: z.enum(["asc", "desc"]).default("asc"),
    q: searchTermSchema,
    prId: z.coerce.number().int().positive().optional(),
    itemId: z.coerce.number().int().positive().optional(),
    onOpenRfq: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === "true")),
  })
  .strict();
export type PrLinesQuery = z.infer<typeof prLinesQuerySchema>;

export const rfqListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
    sortBy: z
      .enum(["id", "rfqNumber", "dueDate", "createdAt", "status"])
      .optional(),
    sortDir: z.enum(["asc", "desc"]).default("desc"),
    q: searchTermSchema,
    status: rfqStatusSchema.optional(),
    supplierId: z.coerce.number().int().positive().optional(),
    // RFQs with any line from this PR, any status
    prId: z.coerce.number().int().positive().optional(),
    // created-at IST days, inclusive
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
  })
  .strict();
export type RfqListQuery = z.infer<typeof rfqListQuerySchema>;

// Counts and duplicates are checked in the service so they carry their codes
// (RFQ_SUPPLIER_LIMIT, RFQ_DUPLICATE_ID, RFQ_EMPTY); the schema only bounds the array.
const idList = (max: number, min = 0) => z.array(idSchema).min(min).max(max);

export const createRfqSchema = z
  .object({
    dueDate: isoDateSchema,
    notes: z.string().trim().max(2000).optional(),
    supplierIds: idList(50),
    prItemIds: idList(500, 1),
  })
  .strict();
export type CreateRfqInput = z.infer<typeof createRfqSchema>;

export const updateRfqSchema = z
  .object({
    id: idSchema,
    dueDate: isoDateSchema.optional(),
    notes: z.string().trim().max(2000).nullish(),
    addSupplierIds: idList(50).optional(),
    removeSupplierIds: idList(50).optional(),
    addPrItemIds: idList(500).optional(),
    removePrItemIds: idList(500).optional(),
  })
  .strict()
  .refine(
    (v) => {
      const { id: _id, ...rest } = v;
      return Object.values(rest).some((x) => x !== undefined);
    },
    { message: "At least one field to change must be provided" },
  );
export type UpdateRfqInput = z.infer<typeof updateRfqSchema>;

export const quoteLineInputSchema = z
  .object({
    rfqItemId: idSchema,
    isQuoted: z.boolean(),
    ratePaise: ratePaiseSchema.optional(),
    // slab and cap checks are in the service (QUOTE_LINE_INVALID, AMOUNT_TOO_LARGE)
    gstPercent: z.number().min(0).max(100).optional(),
    leadDays: z.number().int().min(0).max(365).optional(),
    freightPaise: z
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
  })
  .strict();

const quoteBodyShape = {
  supplierQuoteRef: z.string().trim().min(1).max(100),
  quoteDate: isoDateSchema,
  validTill: isoDateSchema,
  paymentTermsDays: z.number().int().min(0).max(365).optional(),
  // one entry per RFQ line; a missing line counts as not quoted
  lines: z.array(quoteLineInputSchema).max(500),
};

export const createQuoteSchema = z
  .object({ supplierId: idSchema, ...quoteBodyShape })
  .strict();
export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;

// PATCH has no supplierId (the quote's supplier never changes).
export const updateQuoteSchema = z.object(quoteBodyShape).strict();
export type UpdateQuoteInput = z.infer<typeof updateQuoteSchema>;

export const awardSchema = z
  .object({
    lines: z
      .array(
        z
          .object({
            rfqItemId: idSchema,
            quoteItemId: idSchema,
            reason: reasonSchema.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(500)
      .refine(
        (lines) => new Set(lines.map((l) => l.rfqItemId)).size === lines.length,
        { message: "Each rfqItemId may appear once" },
      ),
  })
  .strict();
export type AwardInput = z.infer<typeof awardSchema>;

// --- responses ---
export const prLineRowSchema = z.object({
  id: z.number().int(), // purchase_request_items.id, send as prItemIds
  prId: z.number().int(),
  prNumber: z.string(),
  itemId: z.number().int(),
  itemCode: z.string(),
  itemName: z.string(),
  // requestedQty - issuedQty, 3 decimals
  qty: z.number(),
  uom: z.string(),
  expectedDate: tsNull,
  onOpenRfq: z.boolean(),
  openRfqId: z.number().int().nullable(),
  openRfqNumber: z.string().nullable(),
});
export const prLinesListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(prLineRowSchema),
  meta: paginationMetaSchema,
});

export const rfqRowSchema = z.object({
  id: z.number().int(),
  rfqNumber: z.string(),
  status: rfqStatusSchema,
  dueDate: z.string(),
  notes: z.string().nullable(),
  createdAt: ts,
  createdByName: z.string().nullable(),
  supplierCount: z.number().int(),
  // suppliers with a live submitted quote
  quotedCount: z.number().int(),
  lineCount: z.number().int(),
});
export const rfqListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(rfqRowSchema),
  meta: paginationMetaSchema,
});

export const rfqHeaderSchema = z.object({
  id: z.number().int(),
  rfqNumber: z.string(),
  status: rfqStatusSchema,
  dueDate: z.string(),
  notes: z.string().nullable(),
  createdBy: z.number().int(),
  createdByName: z.string().nullable(),
  createdAt: ts,
  lastUpdatedAt: tsNull,
  sentBy: z.number().int().nullable(),
  sentByName: z.string().nullable(),
  sentAt: tsNull,
  completedAt: tsNull,
  closedBy: z.number().int().nullable(),
  closedByName: z.string().nullable(),
  closedAt: tsNull,
  closeReason: z.string().nullable(),
  cancelledBy: z.number().int().nullable(),
  cancelledByName: z.string().nullable(),
  cancelledAt: tsNull,
  cancelReason: z.string().nullable(),
});

export const rfqSupplierSchema = z.object({
  supplierId: z.number().int(),
  name: z.string(),
  isActive: z.boolean(),
});

export const rfqLineSchema = z.object({
  id: z.number().int(),
  prItemId: z.number().int(),
  prId: z.number().int(),
  prNumber: z.string(),
  itemId: z.number().int(),
  itemCode: z.string(),
  itemName: z.string(),
  qty: z.number(),
  uom: z.string(),
  lineStatus: rfqLineStatusSchema,
  // BR-RFQ-11: the PR line was cancelled after it joined the RFQ
  prLineCancelled: z.boolean(),
  awardedQuoteItemId: z.number().int().nullable(),
  awardedQuoteId: z.number().int().nullable(),
  awardedSupplierId: z.number().int().nullable(),
  awardedSupplierName: z.string().nullable(),
  awardedAt: tsNull,
  awardReason: z.string().nullable(),
  awardLowestLandedPaise: z.number().int().nullable(),
  awardChosenLandedPaise: z.number().int().nullable(),
  poItemId: z.number().int().nullable(),
  poId: z.number().int().nullable(),
  poNumber: z.string().nullable(),
  poStatus: z.string().nullable(),
});

export const rfqQuoteHeaderSchema = z.object({
  id: z.number().int(),
  quoteNumber: z.string(),
  supplierId: z.number().int(),
  supplierName: z.string(),
  // "awarded" is derived: isAwarded is true when any line of the quote is awarded
  status: rfqQuoteStatusSchema,
  isAwarded: z.boolean(),
  supplierQuoteRef: z.string(),
  quoteDate: z.string(),
  validTill: z.string(),
  paymentTermsDays: z.number().int(),
  isLate: z.boolean(),
  // DES-26: count of priced lines and landed total (line value + freight, capped)
  linesPriced: z.number().int(),
  totalLandedPaise: z.number().int(),
  submittedAt: tsNull,
  cancelledByName: z.string().nullable(),
  cancelledAt: tsNull,
  cancelReason: z.string().nullable(),
});

export const rfqDetailsSchema = z.object({
  rfq: rfqHeaderSchema,
  suppliers: z.array(rfqSupplierSchema),
  lines: z.array(rfqLineSchema),
  quotes: z.array(rfqQuoteHeaderSchema),
  // last PO rate and contract rates per line, only for po.manage / contract.view (BR-RFQ-56)
  lineRates: z
    .array(
      z.object({
        rfqItemId: z.number().int(),
        lastPoRatePaise: z.number().int().nullable(),
        contract: z.array(
          z.object({
            supplierId: z.number().int(),
            contractNumber: z.string(),
            ratePaise: z.number().int(),
          }),
        ),
      }),
    )
    .optional(),
});

export const rfqCreatedSchema = z.object({
  id: z.number().int(),
  rfqNumber: z.string(),
  status: rfqStatusSchema,
  dueDate: z.string(),
  suppliers: z.array(rfqSupplierSchema),
  lines: z.array(
    z.object({
      id: z.number().int(),
      prItemId: z.number().int(),
      itemId: z.number().int(),
      qty: z.number(),
      uom: z.string(),
      lineStatus: rfqLineStatusSchema,
    }),
  ),
});

export const rfqPrintSchema = z.object({
  rfqNumber: z.string(),
  dueDate: z.string(),
  // null when company settings are not saved
  company: z
    .object({
      name: z.string(),
      address: z.string().nullable(),
      gstin: z.string().nullable(),
    })
    .nullable(),
  sheets: z.array(
    z.object({
      supplier: z.object({
        id: z.number().int(),
        name: z.string(),
        address: z.string().nullable(),
        gstin: z.string().nullable(),
      }),
      lines: z.array(
        z.object({
          itemCode: z.string(),
          itemName: z.string(),
          qty: z.number(),
          uom: z.string(),
        }),
      ),
    }),
  ),
});

export const rfqQuoteLineSchema = z.object({
  id: z.number().int(),
  rfqItemId: z.number().int(),
  itemId: z.number().int(),
  itemCode: z.string(),
  itemName: z.string(),
  qty: z.number(),
  uom: z.string(),
  isQuoted: z.boolean(),
  ratePaise: z.number().int().nullable(),
  gstPercent: z.number().nullable(),
  leadDays: z.number().int().nullable(),
  freightPaise: z.number().int().nullable(),
  lineValuePaise: z.number().int().nullable(),
  lineTaxPaise: z.number().int().nullable(),
  landedRatePaise: z.number().int().nullable(),
  isAwarded: z.boolean(),
});

export const rfqQuoteDetailsSchema = rfqQuoteHeaderSchema.extend({
  rfqId: z.number().int(),
  rfqNumber: z.string(),
  rfqStatus: rfqStatusSchema,
  lines: z.array(rfqQuoteLineSchema),
});

export const comparisonCellSchema = z.object({
  supplierId: z.number().int(),
  quoteId: z.number().int().nullable(),
  quoteItemId: z.number().int().nullable(),
  state: z.enum(["priced", "not_quoted", "no_quote", "expired", "inactive"]),
  ratePaise: z.number().int().nullable(),
  gstPercent: z.number().nullable(),
  freightPaise: z.number().int().nullable(),
  landedRatePaise: z.number().int().nullable(),
  leadDays: z.number().int().nullable(),
  validTill: z.string().nullable(),
  paymentTermsDays: z.number().int().nullable(),
  isLate: z.boolean().nullable(),
  isLowest: z.boolean(),
  eligible: z.boolean(),
});

export const rfqComparisonSchema = z.object({
  rfq: z.object({
    id: z.number().int(),
    rfqNumber: z.string(),
    status: rfqStatusSchema,
    dueDate: z.string(),
  }),
  suppliers: z.array(rfqSupplierSchema),
  rows: z.array(
    z.object({
      rfqItemId: z.number().int(),
      itemId: z.number().int(),
      itemCode: z.string(),
      itemName: z.string(),
      qty: z.number(),
      uom: z.string(),
      lineStatus: rfqLineStatusSchema,
      prLineCancelled: z.boolean(),
      // omitted for callers without po.manage or contract.view (BR-RFQ-56)
      lastPoRatePaise: z.number().int().nullable().optional(),
      contract: z
        .array(
          z.object({
            supplierId: z.number().int(),
            contractNumber: z.string(),
            ratePaise: z.number().int(),
          }),
        )
        .optional(),
      cells: z.array(comparisonCellSchema),
    }),
  ),
  cancelledQuotes: z.array(
    z.object({
      quoteId: z.number().int(),
      quoteNumber: z.string(),
      supplierId: z.number().int(),
      cancelledBy: z.number().int().nullable(),
      cancelledByName: z.string().nullable(),
      cancelledAt: tsNull,
      cancelReason: z.string().nullable(),
    }),
  ),
});

export const awardResultSchema = z.object({
  rfq: z.object({ id: z.number().int(), status: rfqStatusSchema }),
  pos: z.array(
    z.object({
      poId: z.number().int(),
      poNumber: z.string(),
      supplierId: z.number().int(),
      lineCount: z.number().int(),
    }),
  ),
  awards: z.array(
    z.object({
      rfqItemId: z.number().int(),
      poId: z.number().int(),
      poNumber: z.string(),
      poItemId: z.number().int(),
      ratePaise: z.number().int(),
      source: z.enum(["contract", "quote"]),
    }),
  ),
});
