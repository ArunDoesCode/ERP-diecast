import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import { z } from "zod";
import {
  inventoryLedger,
  itemMaster,
  locations,
  machines,
  serviceMaster,
} from "../db/schemas/02_procurement-catalog";

// Fixed lists (BR-INV-02), kept in code.
export const ITEM_CATEGORIES = [
  "Raw Material",
  "Consumable",
  "Spare Part",
  "Tooling",
  "Packing",
] as const;
export const ITEM_UNITS = ["kg", "pcs", "ltr", "m", "set"] as const;
export const itemCategorySchema = z.enum(ITEM_CATEGORIES);
export const itemUnitSchema = z.enum(ITEM_UNITS);

// ?isActive=true|false on list endpoints (pickers ask for true).
const isActiveQuery = z
  .enum(["true", "false"])
  .transform((v) => v === "true")
  .optional();

// Reorder level: >= 0, up to 3 decimals (BR-INV-07, 08).
const reorderLevelSchema = z
  .number()
  .nonnegative()
  .refine((v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6, {
    message: "Quantity can have at most 3 decimals",
  });

// Whole paise > 0 per unit (BR-INV-03); cost columns are int4.
const standardRateSchema = z.number().int().min(1).max(2_147_483_647);

// BR-INV-09: optional; if given, 6 digits starting with 99.
const sacCodeSchema = z
  .string()
  .regex(/^99\d{4}$/, "SAC code must be 6 digits starting with 99");

// BR-INV-17: not in the future.
const maintenanceDateSchema = z.coerce
  .date()
  .refine((d) => d.getTime() <= Date.now(), {
    message: "Last maintenance date cannot be in the future",
  });

// Response shapes for stored rows — distinct from the *CreateSchema /
// *UpdateSchema write contracts below, which omit server-assigned columns
// (id, createdAt, ...).
export const assetItemSchema = createSelectSchema(itemMaster);
export type assetItemSchemaType = z.infer<typeof assetItemSchema>;

export const assetServiceSchema = createSelectSchema(serviceMaster);
export type assetServiceSchemaType = z.infer<typeof assetServiceSchema>;

export const assetLocationSchema = createSelectSchema(locations);
export type assetLocationSchemaType = z.infer<typeof assetLocationSchema>;

export const assetMachineSchema = createSelectSchema(machines);
export type assetMachineSchemaType = z.infer<typeof assetMachineSchema>;

export const assetItemListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  q: z.string().optional(),
  isActive: isActiveQuery,
  category: itemCategorySchema.optional(),
  sortBy: z
    .enum(["sku", "name", "category", "currentStock", "createdAt"])
    .optional(),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});
export type assetItemListQuerySchemaType = z.infer<
  typeof assetItemListQuerySchema
>;

// currentStock / averageCostPaise / isActive are not accepted (BR-GRN-40,
// BR-INV-03): strict makes sending them a 400 instead of silently dropping them.
export const assetItemCreateSchema = z
  .object({
    sku: z.string().trim().min(1),
    name: z.string().trim().min(1),
    description: z.string().nullable().optional(),
    category: itemCategorySchema,
    uom: itemUnitSchema,
    reorderLevel: reorderLevelSchema.optional(),
    standardRatePaise: standardRateSchema,
  })
  .strict();
export type assetItemCreateSchemaType = z.infer<typeof assetItemCreateSchema>;

// GET /asset/items/:itemId/last-rate query + response (BR-INV-24) — fallback
// chain: newest line of an approved-or-later PO for that supplier+item, then
// the supplier's catalog price, then item average cost if > 0, then the item
// standard rate. Always answers (ratePaise >= 1).
export const assetLastRateQuerySchema = z.object({
  supplierId: z.coerce.number().int().positive(),
});
export type assetLastRateQuerySchemaType = z.infer<
  typeof assetLastRateQuerySchema
>;

export const assetLastRateSourceSchema = z.enum([
  "po_history",
  "supplier_catalog",
  "pr_estimate", // item average cost (> 0)
  "standard_rate", // item standard rate (BR-INV-24 last resort)
]);

export const assetLastRateSchema = z.object({
  ratePaise: z.number().int().min(1),
  source: assetLastRateSourceSchema,
});
export type assetLastRateSchemaType = z.infer<typeof assetLastRateSchema>;

export const assetItemUpdateSchema = z
  .object({
    sku: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).optional(),
    description: z.string().nullable().optional(),
    category: itemCategorySchema.optional(),
    uom: itemUnitSchema.optional(),
    reorderLevel: reorderLevelSchema.optional(),
    standardRatePaise: standardRateSchema.optional(),
    // deactivate / reactivate (BR-INV-05); items are never deleted
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "At least one item field must be provided",
  });
export type assetItemUpdateSchemaType = z.infer<typeof assetItemUpdateSchema>;

export const assetServiceListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  q: z.string().optional(),
  isActive: isActiveQuery,
  sortBy: z.enum(["code", "name", "createdAt"]).optional(),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});
export type assetServiceListQuerySchemaType = z.infer<
  typeof assetServiceListQuerySchema
>;

export const assetServiceCreateSchema = createInsertSchema(serviceMaster)
  .omit({
    id: true,
    createdBy: true,
    createdAt: true,
    lastUpdatedBy: true,
    lastUpdatedAt: true,
    isActive: true,
  })
  .extend({
    code: z.string().trim().min(1),
    name: z.string().trim().min(1),
    defaultUom: z.string().trim().min(1),
    sacCode: sacCodeSchema.nullable().optional(),
  });
export type assetServiceCreateSchemaType = z.infer<
  typeof assetServiceCreateSchema
>;

export const assetServiceUpdateSchema = createUpdateSchema(serviceMaster)
  .omit({
    id: true,
    createdBy: true,
    createdAt: true,
    lastUpdatedBy: true,
    lastUpdatedAt: true,
  })
  .extend({
    code: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).optional(),
    defaultUom: z.string().trim().min(1).optional(),
    sacCode: sacCodeSchema.nullable().optional(),
  })
  .superRefine((data, ctx) => {
    const hasUpdateField =
      data.code !== undefined ||
      data.name !== undefined ||
      data.description !== undefined ||
      data.sacCode !== undefined ||
      data.defaultUom !== undefined ||
      data.isActive !== undefined;

    if (!hasUpdateField) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one service field must be provided",
      });
    }
  });
export type assetServiceUpdateSchemaType = z.infer<
  typeof assetServiceUpdateSchema
>;

export const inventoryReferenceTypeSchema = z.enum([
  "grn",
  "grn_bypass",
  "pro",
  "sco_issue",
  "sco_receipt",
  "job_order_issue",
  "scrap_dispatch",
  "stock_adjustment",
  "grn_correction",
  "opening_stock",
  "sco_loss",
]);

// The only reference types the manual movement screen may post (BR-GRN-43).
export const manualMovementReferenceTypeSchema = z.enum([
  "stock_adjustment",
  "opening_stock",
]);

export const inventoryTransactionTypeSchema = z.enum([
  "in",
  "out",
  "adjustment",
]);

// Document types the manual screen must refuse (BR-GRN-43).
export const documentMovementReferenceTypeSchema = z.enum([
  "grn",
  "grn_bypass",
  "grn_correction",
  "pro",
  "sco_issue",
  "sco_receipt",
  "sco_loss",
  "job_order_issue",
  "scrap_dispatch",
]);

export const assetInventoryMovementListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
    itemId: z.coerce.number().int().positive().optional(),
    locationId: z.coerce.number().int().positive().optional(),
    referenceType: inventoryReferenceTypeSchema.optional(),
    transactionType: inventoryTransactionTypeSchema.optional(),
    fromDate: z.coerce.date().optional(),
    toDate: z.coerce.date().optional(),
    sortBy: z
      .enum(["createdAt", "transactionType", "quantityChange"])
      .optional(),
    sortDir: z.enum(["asc", "desc"]).default("asc"),
  })
  .superRefine((data, ctx) => {
    if (data.fromDate && data.toDate && data.fromDate > data.toDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "fromDate cannot be greater than toDate",
        path: ["fromDate"],
      });
    }
  });
export type assetInventoryMovementListQuerySchemaType = z.infer<
  typeof assetInventoryMovementListQuerySchema
>;

export const assetLocationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  q: z.string().optional(),
  isActive: isActiveQuery,
  sortBy: z.enum(["name", "type", "createdAt"]).optional(),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});
export type assetLocationListQuerySchemaType = z.infer<
  typeof assetLocationListQuerySchema
>;

// BR-INV-11..14. Cross-field rules (vendor_premise needs an active supplier and
// is forced virtual, other types must not link one, one main_store) and
// LOCATION_IN_USE are checked by the service.
export const assetLocationCreateSchema = createInsertSchema(locations)
  .omit({
    id: true,
    createdAt: true,
    createdBy: true,
    lastUpdatedBy: true,
    lastUpdatedAt: true,
    isActive: true,
  })
  .extend({
    name: z.string().trim().min(1),
    linkedVendorId: z.number().int().positive().nullable().optional(),
  });
export type assetLocationCreateSchemaType = z.infer<
  typeof assetLocationCreateSchema
>;

export const assetLocationUpdateSchema = createUpdateSchema(locations)
  .omit({
    id: true,
    createdAt: true,
    createdBy: true,
    lastUpdatedBy: true,
    lastUpdatedAt: true,
  })
  .extend({
    name: z.string().trim().min(1).optional(),
    isActive: z.boolean().optional(),
    linkedVendorId: z.number().int().positive().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    const hasUpdateField =
      data.name !== undefined ||
      data.type !== undefined ||
      data.isVirtual !== undefined ||
      data.isActive !== undefined ||
      data.linkedVendorId !== undefined;

    if (!hasUpdateField) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one location field must be provided",
      });
    }
  });
export type assetLocationUpdateSchemaType = z.infer<
  typeof assetLocationUpdateSchema
>;

export const assetInventoryMovementCreateSchema = z.object({
  itemId: z.number().int().positive(),
  locationId: z.number().int().positive(),
  batchNumber: z.string().nullable().optional(),
  transactionType: inventoryTransactionTypeSchema,
  referenceType: inventoryReferenceTypeSchema,
  referenceId: z.number().int().positive(),
  quantityChange: z.number().refine((value) => value !== 0, {
    message: "quantityChange must be non-zero",
  }),
  unitCostPaise: z.number().int().min(0),
  notes: z.string().nullable().optional(),
});
export type assetInventoryMovementCreateSchemaType = z.infer<
  typeof assetInventoryMovementCreateSchema
>;

// POST /asset/inventory/movements body — manual stock-take / opening stock
// (BR-GRN-43, BR-INV-21..23). Discriminated by referenceType; server sets
// transactionType = adjustment. A document referenceType parses (so the
// service can answer 400 "post from its source document") but is never posted.
const qty3dp = z
  .number()
  .refine((v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6, {
    message: "Quantity can have at most 3 decimals",
  })
  .refine((v) => Math.abs(v) <= 1e9, { message: "Quantity is too large" });
const reasonSchema = z.string().trim().min(1).max(1000);
const batchSchema = z.string().trim().min(1).max(100).nullish();
const costSchema = z.number().int().min(1).max(2_147_483_647); // int4

export const assetManualMovementCreateSchema = z.discriminatedUnion(
  "referenceType",
  [
    // Stock-take: counted qty; server posts counted - balance at that location
    // (0 difference -> 400 "no difference"). unitCostPaise is needed only when
    // the difference is positive (BR-GRN-44); ignored when negative (valued at
    // average).
    z.object({
      itemId: z.number().int().positive(),
      locationId: z.number().int().positive(),
      referenceType: z.literal("stock_adjustment"),
      countedQty: qty3dp.refine((v) => v >= 0, {
        message: "Counted quantity cannot be negative",
      }),
      unitCostPaise: costSchema.optional(),
      reason: reasonSchema,
      batchNumber: batchSchema,
    }),
    // Opening stock: qty + rate; only for an item+location with no ledger rows.
    z.object({
      itemId: z.number().int().positive(),
      locationId: z.number().int().positive(),
      referenceType: z.literal("opening_stock"),
      qty: qty3dp.refine((v) => v > 0, {
        message: "Quantity must be greater than 0",
      }),
      unitCostPaise: costSchema,
      reason: reasonSchema,
      batchNumber: batchSchema,
    }),
    z.object({
      itemId: z.number().int().positive(),
      locationId: z.number().int().positive(),
      referenceType: documentMovementReferenceTypeSchema,
      reason: z.string().optional(),
    }),
  ],
);
export type assetManualMovementCreateSchemaType = z.infer<
  typeof assetManualMovementCreateSchema
>;

// GET /asset/inventory/stock (BR-INV-19, 07, 06): one row per item.
export const assetStockLocationBalanceSchema = z.object({
  locationId: z.number().int(),
  locationName: z.string(),
  locationType: z.enum([
    "main_store",
    "vendor_premise",
    "finished_goods",
    "scrap_yard",
  ]),
  // last ledger balanceAfter for that item+location
  balance: z.number(),
});

export const assetStockRowSchema = z.object({
  itemId: z.number().int(),
  sku: z.string(),
  name: z.string(),
  category: z.string(),
  uom: z.string(),
  currentStock: z.number(),
  averageCostPaise: z.number().int(),
  // round(currentStock x averageCostPaise), paise
  valuePaise: z.number().int(),
  reorderLevel: z.number(),
  // active item, reorderLevel > 0 and currentStock <= reorderLevel
  belowReorder: z.boolean(),
  // shown with an "inactive" mark (only items with stock != 0 are listed)
  isActive: z.boolean(),
  // locations with at least one ledger row for the item
  locations: z.array(assetStockLocationBalanceSchema),
});
export type assetStockRowSchemaType = z.infer<typeof assetStockRowSchema>;

export const assetStockListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  q: z.string().optional(),
  category: itemCategorySchema.optional(),
  locationId: z.coerce.number().int().positive().optional(),
  belowReorder: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  sortBy: z
    .enum(["sku", "name", "category", "currentStock", "valuePaise"])
    .optional(),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});
export type assetStockListQuerySchemaType = z.infer<
  typeof assetStockListQuerySchema
>;

// GET /asset/inventory/reconciliation (BR-GRN-41). One row per mismatch;
// zero rows = books agree with the ledger.
export const assetReconciliationRowSchema = z.object({
  kind: z.enum(["item_stock", "item_location_balance"]),
  itemId: z.number().int(),
  itemSku: z.string(),
  // null for kind = item_stock
  locationId: z.number().int().nullable(),
  // item.currentStock (item_stock) or the last ledger balanceAfter (item_location_balance)
  storedQty: z.number(),
  // sum of quantityChange over the ledger (whole item, or that item+location)
  ledgerQty: z.number(),
});
export type assetReconciliationRowSchemaType = z.infer<
  typeof assetReconciliationRowSchema
>;

export const assetReconciliationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(["itemId"]).optional(),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});
export type assetReconciliationQuerySchemaType = z.infer<
  typeof assetReconciliationQuerySchema
>;

// Response shape for a stored inventory ledger row.
export const assetInventoryMovementSchema = createSelectSchema(inventoryLedger);
export type assetInventoryMovementSchemaType = z.infer<
  typeof assetInventoryMovementSchema
>;

// Row of the movement list (BR-INV-20): the ledger row plus display names and
// the source document. Read-only — no edit/delete routes exist.
export const assetInventoryMovementListRowSchema =
  assetInventoryMovementSchema.extend({
    itemSku: z.string(),
    itemName: z.string(),
    locationName: z.string(),
    sourceDocument: z.object({
      type: inventoryReferenceTypeSchema,
      id: z.number().int(),
      // document number, e.g. "GRN-2026-0001"; null for manual movements
      // (referenceId 0: the reason is in `notes`)
      number: z.string().nullable(),
    }),
  });
export type assetInventoryMovementListRowSchemaType = z.infer<
  typeof assetInventoryMovementListRowSchema
>;

export const machineStatusSchema = z.enum([
  "idle",
  "running",
  "maintenance",
  "breakdown",
]);

export const assetMachineListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  q: z.string().optional(),
  status: machineStatusSchema.optional(),
  isActive: isActiveQuery,
  sortBy: z.enum(["name", "code", "type", "status", "createdAt"]).optional(),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});
export type assetMachineListQuerySchemaType = z.infer<
  typeof assetMachineListQuerySchema
>;

export const assetMachineCreateSchema = createInsertSchema(machines)
  .omit({
    id: true,
    createdBy: true,
    createdAt: true,
    lastUpdatedBy: true,
    lastUpdatedAt: true,
    isActive: true,
  })
  .extend({
    name: z.string().trim().min(1),
    code: z.string().trim().min(1),
    status: machineStatusSchema.optional(),
    lastMaintenanceAt: maintenanceDateSchema.nullable().optional(),
  });
export type assetMachineCreateSchemaType = z.infer<
  typeof assetMachineCreateSchema
>;

export const assetMachineUpdateSchema = createUpdateSchema(machines)
  .omit({
    id: true,
    createdBy: true,
    createdAt: true,
    lastUpdatedBy: true,
    lastUpdatedAt: true,
  })
  .extend({
    name: z.string().trim().min(1).optional(),
    code: z.string().trim().min(1).optional(),
    status: machineStatusSchema.optional(),
    isActive: z.boolean().optional(),
    lastMaintenanceAt: maintenanceDateSchema.nullable().optional(),
  })
  .superRefine((data, ctx) => {
    const hasUpdateField =
      data.name !== undefined ||
      data.code !== undefined ||
      data.type !== undefined ||
      data.status !== undefined ||
      data.isActive !== undefined ||
      data.lastMaintenanceAt !== undefined;

    if (!hasUpdateField) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one machine field must be provided",
      });
    }
  });
export type assetMachineUpdateSchemaType = z.infer<
  typeof assetMachineUpdateSchema
>;
