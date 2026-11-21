import { z } from "zod";
import { stockTransferStatusEnum } from "../db/schemas/02_procurement-catalog";
import { istDayKey } from "../lib/ist-day";
import { paginatedResponse, successResponse } from "../lib/response-schemas";

// Quantity: > 0, <= 1e9, at most 3 decimals (BR-STR-04, 05). The whole-number rule
// for pcs/set items needs the item unit, so the service enforces that one (400).
const qty3 = z
  .number()
  .positive()
  .refine((v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6, {
    message: "Quantity can have at most 3 decimals",
  })
  .refine((v) => v <= 1e9, { message: "Quantity is too large" });

const idSchema = z.number().int().positive();
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && istDayKey(d) === v;
  }, "Not a real calendar date");

export const stockTransferStatusSchema = z.enum(
  stockTransferStatusEnum.enumValues,
);

// --- params ---
export const stockTransferIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// --- request bodies (strict: any cost field is a 400, BR-STR-07) ---
export const stockTransferLineInputSchema = z
  .object({ itemId: idSchema, qty: qty3 })
  .strict();
export type StockTransferLineInput = z.infer<
  typeof stockTransferLineInputSchema
>;

const linesSchema = z.array(stockTransferLineInputSchema).min(1).max(50);
const notesSchema = z.string().trim().min(1).max(500);

export const createStockTransferSchema = z
  .object({
    sourceLocationId: idSchema,
    destinationLocationId: idSchema,
    notes: notesSchema.optional(),
    lines: linesSchema,
  })
  .strict();
export type CreateStockTransferInput = z.infer<
  typeof createStockTransferSchema
>;

export const updateStockTransferSchema = z
  .object({
    sourceLocationId: idSchema.optional(),
    destinationLocationId: idSchema.optional(),
    notes: notesSchema.nullable().optional(),
    lines: linesSchema.optional(),
  })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "At least one field must be provided",
  });
export type UpdateStockTransferInput = z.infer<
  typeof updateStockTransferSchema
>;

// Empty body for cancel and post (BR-STR-10, 18).
export const emptyBodySchema = z.object({}).strict();

export const reverseStockTransferSchema = z
  .object({ reason: z.string().trim().min(1).max(500) })
  .strict();
export type ReverseStockTransferInput = z.infer<
  typeof reverseStockTransferSchema
>;

// --- list query (BR-STR-27, CR-002) ---
export const stockTransferSortFields = [
  "createdAt",
  "transferNumber",
  "status",
  "postedAt",
] as const;

export const stockTransferListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
    // sortBy omitted -> createdAt desc; sortBy without sortDir -> asc (service resolves).
    sortBy: z.enum(stockTransferSortFields).optional(),
    sortDir: z.enum(["asc", "desc"]).optional(),
    status: stockTransferStatusSchema.optional(),
    sourceLocationId: z.coerce.number().int().positive().optional(),
    destinationLocationId: z.coerce.number().int().positive().optional(),
    itemId: z.coerce.number().int().positive().optional(),
    fromDate: isoDate.optional(),
    toDate: isoDate.optional(),
  })
  .strict()
  .refine((v) => !v.fromDate || !v.toDate || v.fromDate <= v.toDate, {
    message: "fromDate must be on or before toDate",
    path: ["fromDate"],
  });
export type StockTransferListQuery = z.infer<
  typeof stockTransferListQuerySchema
>;

// --- responses ---
export const stockTransferListRowSchema = z.object({
  id: z.number().int(),
  transferNumber: z.string(),
  status: stockTransferStatusSchema,
  sourceName: z.string(),
  destinationName: z.string(),
  lineCount: z.number().int(),
  createdAt: z.string(),
  postedAt: z.string().nullable(),
});
export const stockTransferListResponseSchema = paginatedResponse(
  stockTransferListRowSchema,
);

const locationRefSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  type: z.enum([
    "main_store",
    "vendor_premise",
    "finished_goods",
    "scrap_yard",
    "store",
  ]),
});

const actorRefSchema = z.object({
  id: z.number().int(),
  name: z.string(),
});

export const stockTransferDetailLineSchema = z.object({
  lineId: z.number().int(),
  itemId: z.number().int(),
  sku: z.string(),
  name: z.string(),
  unit: z.string(),
  qty: z.number(),
  postedUnitCostPaise: z.number().int().nullable(),
  postedValuePaise: z.number().int().nullable(),
  // Live balance at the source while draft (a hint, BR-STR-30); null otherwise.
  sourceBalanceQty: z.number().nullable(),
});

export const stockTransferLedgerRowSchema = z.object({
  id: z.number().int(),
  transactionType: z.enum(["in", "out", "adjustment"]),
  referenceType: z.enum(["stock_transfer", "stock_transfer_reversal"]),
  locationId: z.number().int(),
  quantityChange: z.number(),
  unitCostPaise: z.number().int(),
  totalValueChangePaise: z.number().int(),
  createdAt: z.string(),
});

export const stockTransferDetailSchema = z.object({
  id: z.number().int(),
  transferNumber: z.string(),
  status: stockTransferStatusSchema,
  source: locationRefSchema,
  destination: locationRefSchema,
  notes: z.string().nullable(),
  createdBy: actorRefSchema.nullable(),
  createdAt: z.string(),
  lastUpdatedBy: actorRefSchema.nullable(),
  lastUpdatedAt: z.string(),
  postedBy: actorRefSchema.nullable(),
  postedAt: z.string().nullable(),
  cancelledBy: actorRefSchema.nullable(),
  cancelledAt: z.string().nullable(),
  reversedBy: actorRefSchema.nullable(),
  reversedAt: z.string().nullable(),
  reverseReason: z.string().nullable(),
  lines: z.array(stockTransferDetailLineSchema),
  ledgerRows: z.array(stockTransferLedgerRowSchema),
});
export const stockTransferDetailResponseSchema = successResponse(
  stockTransferDetailSchema,
);

export const stockTransferSavedSchema = z.object({
  id: z.number().int(),
  transferNumber: z.string(),
  status: stockTransferStatusSchema,
});
export const stockTransferCancelledSchema = z.object({
  id: z.number().int(),
  status: z.literal("cancelled"),
});
export const stockTransferPostedSchema = z.object({
  id: z.number().int(),
  status: z.literal("posted"),
  postedAt: z.string(),
  lines: z.array(
    z.object({
      lineId: z.number().int(),
      itemId: z.number().int(),
      qty: z.number(),
      unitCostPaise: z.number().int(),
      valuePaise: z.number().int(),
    }),
  ),
});
export const stockTransferReversedSchema = z.object({
  id: z.number().int(),
  status: z.literal("reversed"),
  reversedAt: z.string(),
});
