import { z } from "zod";
import { searchTermSchema } from "../lib/safe-search";

// Supplier rating contract types (docs/specs/supplier-rating/design/api.md; BR-SRT-01..40).
// Read-only. Percent values are integer tenths of a percent (800 = 80.0 %),
// quantities are 3-decimal strings, money is integer paise.

const idSchema = z.coerce.number().int().min(1).max(2147483647);
const dateSchema = z.string(); // YYYY-MM-DD (IST day)
const qtyString = z.string(); // "1000.000"

// ---- params / queries ----
export const supplierRatingIdParamSchema = z.object({
  supplierId: idSchema,
});

export const SUPPLIER_RATING_LIST_SORT_FIELDS = [
  "name",
  "score",
  "onTimePct",
  "rejectionPct",
  "priceVariancePct",
  "judgedLines",
  "decidedLines",
] as const;
export const RATING_STATUS_FILTERS = ["active", "inactive", "all"] as const;

const pageSchema = z.coerce.number().int().min(1).max(10000).default(1);
const pageSizeSchema = z.coerce.number().int().min(1).max(100).default(10);
const sortDirSchema = z.enum(["asc", "desc"]);

export const supplierRatingListQuerySchema = z
  .object({
    page: pageSchema,
    pageSize: pageSizeSchema,
    sortBy: z.enum(SUPPLIER_RATING_LIST_SORT_FIELDS).optional(),
    sortDir: sortDirSchema.optional(),
    status: z.enum(RATING_STATUS_FILTERS).default("active"),
    q: searchTermSchema,
  })
  .strict();
export type SupplierRatingListQuery = z.infer<
  typeof supplierRatingListQuerySchema
>;

export const RATING_MEASURES = ["on_time", "rejection", "price"] as const;
export const ratingMeasureSchema = z.enum(RATING_MEASURES);
export type RatingMeasure = z.infer<typeof ratingMeasureSchema>;

export const RATING_LINES_SORT_FIELDS = {
  on_time: ["dueDate", "completionDate", "daysLate", "poNumber", "itemSku"],
  rejection: ["receivedDate", "grnNumber", "rejectedValuePaise", "itemSku"],
  price: ["poDate", "poNumber", "variancePaise", "itemSku"],
} as const satisfies Record<RatingMeasure, readonly string[]>;
export const RATING_LINES_SORT_UNION = [
  ...new Set(Object.values(RATING_LINES_SORT_FIELDS).flat()),
] as [string, ...string[]];

export const ON_TIME_VERDICT_FILTERS = [
  "all",
  "late",
  "on_time",
  "no_due_date",
] as const;

export const supplierRatingLinesQuerySchema = z
  .object({
    measure: ratingMeasureSchema,
    page: pageSchema,
    pageSize: pageSizeSchema,
    sortBy: z.enum(RATING_LINES_SORT_UNION).optional(),
    sortDir: sortDirSchema.optional(),
    verdict: z.enum(ON_TIME_VERDICT_FILTERS).optional(),
  })
  .strict()
  .superRefine((query, ctx) => {
    const allowed: readonly string[] = RATING_LINES_SORT_FIELDS[query.measure];
    if (query.sortBy !== undefined && !allowed.includes(query.sortBy)) {
      ctx.addIssue({
        code: "custom",
        path: ["sortBy"],
        message: `sortBy must be one of ${allowed.join(", ")} for measure ${query.measure}`,
      });
    }
    if (query.verdict !== undefined && query.measure !== "on_time") {
      ctx.addIssue({
        code: "custom",
        path: ["verdict"],
        message: "verdict applies to the on_time measure only",
      });
    }
  });
export type SupplierRatingLinesQuery = z.infer<
  typeof supplierRatingLinesQuerySchema
>;

// ---- responses ----
export const ratingMeasureValueSchema = z.object({
  pctTenths: z.number().int().nullable(),
  lines: z.number().int().min(0),
});

export const RATING_LABELS = ["good", "watch", "poor"] as const;
export const ratingLabelSchema = z.enum(RATING_LABELS);

export const notEnoughDataSchema = z.object({
  judgedLines: z.number().int().min(0),
  decidedLines: z.number().int().min(0),
  required: z.literal(5),
});

export const ratingSchema = z.object({
  supplierId: z.number().int(),
  supplierName: z.string(),
  isActive: z.boolean(),
  windowFrom: dateSchema,
  windowTo: dateSchema,
  onTime: ratingMeasureValueSchema.extend({
    onTimeLines: z.number().int().min(0),
    lateLines: z.number().int().min(0),
    openLateLines: z.number().int().min(0),
    shortClosedLateCount: z.number().int().min(0),
    // PO cancelled after dispatch, judged by its cancel date (A-42)
    cancelledAfterDispatchCount: z.number().int().min(0),
    noDueDateCount: z.number().int().min(0),
  }),
  rejection: ratingMeasureValueSchema.extend({
    linesWithRejects: z.number().int().min(0),
    decidedLines: z.number().int().min(0),
    notInspectedLines: z.number().int().min(0),
    notInspectedRejectedQty: z.array(
      z.object({ uom: z.string(), qty: qtyString }),
    ),
  }),
  priceVariance: ratingMeasureValueSchema.extend({
    comparedLines: z.number().int().min(0),
    notComparedLines: z.number().int().min(0),
  }),
  score: z.number().int().min(0).max(100).nullable(),
  label: ratingLabelSchema.nullable(),
  notEnoughData: notEnoughDataSchema.nullable(),
});
export type SupplierRating = z.infer<typeof ratingSchema>;

export const onTimeLineSchema = z.object({
  poItemId: z.number().int(),
  poId: z.number().int(),
  poNumber: z.string(),
  prId: z.number().int().nullable(),
  grnId: z.number().int().nullable(),
  itemSku: z.string(),
  itemName: z.string(),
  uom: z.string(),
  orderedQty: qtyString,
  arrivedQty: qtyString,
  dueDate: dateSchema.nullable(),
  revisedDate: dateSchema.nullable(),
  completionDate: dateSchema.nullable(),
  judgementDate: dateSchema.nullable(),
  verdict: z.enum(["on_time", "late"]).nullable(),
  daysLate: z.number().int().nullable(),
  state: z.enum([
    "complete",
    "short_closed",
    "cancelled_after_dispatch",
    "open_past_due",
    "no_due_date",
  ]),
});

export const rejectionLineSchema = z.object({
  grnItemId: z.number().int(),
  grnId: z.number().int().nullable(),
  grnNumber: z.string(),
  poId: z.number().int(),
  poNumber: z.string(),
  prId: z.number().int().nullable(),
  itemSku: z.string(),
  receivedDate: dateSchema,
  arrivedQty: qtyString,
  rejectedQty: qtyString,
  uom: z.string(),
  ratePaise: z.number().int(),
  rejectedValuePaise: z.number().int(),
  arrivedValuePaise: z.number().int(),
  inspection: z.enum(["decided", "not_inspected"]),
});

export const priceLineSchema = z.object({
  poItemId: z.number().int(),
  poId: z.number().int(),
  poNumber: z.string(),
  prId: z.number().int().nullable(),
  grnId: z.number().int().nullable(),
  poDate: dateSchema,
  itemSku: z.string(),
  uom: z.string(),
  qty: qtyString,
  ratePaise: z.number().int(),
  referenceRatePaise: z.number().int().nullable(),
  referenceSource: z.enum(["standard_rate", "previous_po", "none"]),
  variancePaise: z.number().int().nullable(),
  variancePctTenths: z.number().int().nullable(),
  lineVariancePaise: z.number().int().nullable(),
  compared: z.boolean(),
  notComparedReason: z.enum(["uom_differs", "no_reference"]).nullable(),
});

export const trendMonthSchema = z.object({
  month: z.string(), // YYYY-MM (IST)
  onTime: ratingMeasureValueSchema,
  rejection: ratingMeasureValueSchema,
  priceVariance: ratingMeasureValueSchema,
  score: z.number().int().min(0).max(100).nullable(),
  label: ratingLabelSchema.nullable(),
  notEnoughData: z.null(),
});

export const supplierRatingTrendSchema = z.object({
  months: z.array(trendMonthSchema).length(12),
});
