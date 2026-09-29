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
  sortBy: z
    .enum(["sku", "name", "category", "currentStock", "createdAt"])
    .optional(),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});
export type assetItemListQuerySchemaType = z.infer<
  typeof assetItemListQuerySchema
>;

export const assetItemCreateSchema = createInsertSchema(itemMaster)
  .omit({
    id: true,
    createdBy: true,
    createdAt: true,
    currentStock: true,
    averageCostPaise: true,
  })
  .extend({
    sku: z.string().min(1),
    name: z.string().min(1),
    category: z.string().min(1),
    uom: z.string().min(1),
    reorderLevel: z.number().nonnegative().optional(),
  })
  // currentStock / averageCostPaise are not accepted (BR-GRN-40): strict makes
  // sending them a 400 instead of silently dropping them.
  .strict();
export type assetItemCreateSchemaType = z.infer<typeof assetItemCreateSchema>;

// GET /asset/items/:itemId/last-rate query + response — fallback chain:
// latest PO price for that supplier+item, then the supplier's catalog
// price, then the item master's average cost (the PR estimate).
export const assetLastRateQuerySchema = z.object({
  supplierId: z.coerce.number().int().positive(),
});
export type assetLastRateQuerySchemaType = z.infer<
  typeof assetLastRateQuerySchema
>;

export const assetLastRateSourceSchema = z.enum([
  "po_history",
  "supplier_catalog",
  "pr_estimate",
]);

export const assetLastRateSchema = z.object({
  ratePaise: z.number().int().nonnegative(),
  source: assetLastRateSourceSchema,
});
export type assetLastRateSchemaType = z.infer<typeof assetLastRateSchema>;

export const assetItemUpdateSchema = createUpdateSchema(itemMaster)
  .omit({
    id: true,
    createdBy: true,
    createdAt: true,
    currentStock: true,
    averageCostPaise: true,
  })
  .extend({
    sku: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    category: z.string().min(1).optional(),
    uom: z.string().min(1).optional(),
    reorderLevel: z.number().nonnegative().optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasUpdateField =
      data.sku !== undefined ||
      data.name !== undefined ||
      data.description !== undefined ||
      data.category !== undefined ||
      data.uom !== undefined ||
      data.reorderLevel !== undefined ||
      data.isActive !== undefined;

    if (!hasUpdateField) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one item field must be provided",
      });
    }
  });
export type assetItemUpdateSchemaType = z.infer<typeof assetItemUpdateSchema>;

export const assetServiceListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  q: z.string().optional(),
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
  })
  .extend({
    code: z.string().min(1),
    name: z.string().min(1),
    defaultUom: z.string().min(1),
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
    code: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    defaultUom: z.string().min(1).optional(),
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
  sortBy: z.enum(["name", "type", "createdAt"]).optional(),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});
export type assetLocationListQuerySchemaType = z.infer<
  typeof assetLocationListQuerySchema
>;

export const assetLocationCreateSchema = createInsertSchema(locations)
  .omit({ id: true, createdAt: true })
  .extend({
    name: z.string().min(1),
    linkedVendorId: z.number().int().positive().nullable().optional(),
  });
export type assetLocationCreateSchemaType = z.infer<
  typeof assetLocationCreateSchema
>;

export const assetLocationUpdateSchema = createUpdateSchema(locations)
  .omit({ id: true, createdAt: true })
  .extend({
    name: z.string().min(1).optional(),
    linkedVendorId: z.number().int().positive().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    const hasUpdateField =
      data.name !== undefined ||
      data.type !== undefined ||
      data.isVirtual !== undefined ||
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
// (BR-GRN-43, 44). referenceType is the full enum on purpose: document types
// get 400 "post from its source document" from the service. Server sets
// transactionType = adjustment. unitCostPaise: required > 0 for stock-in
// (quantityChange > 0); ignored for stock-out (valued at current average).
export const assetManualMovementCreateSchema = z.object({
  itemId: z.number().int().positive(),
  locationId: z.number().int().positive(),
  referenceType: inventoryReferenceTypeSchema,
  quantityChange: z
    .number()
    .refine((v) => v !== 0, { message: "quantityChange must be non-zero" })
    .refine((v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6, {
      message: "Quantity can have at most 3 decimals",
    })
    .refine((v) => Math.abs(v) <= 1e9, { message: "Quantity is too large" }),
  // ledger cost columns are int4
  unitCostPaise: z.number().int().min(0).max(2_147_483_647).optional(),
  reason: z.string().trim().min(1).max(1000),
  batchNumber: z.string().trim().min(1).max(100).nullish(),
});
export type assetManualMovementCreateSchemaType = z.infer<
  typeof assetManualMovementCreateSchema
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
  sortBy: z.enum(["name", "type", "status", "createdAt"]).optional(),
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
  })
  .extend({
    name: z.string().min(1),
    status: machineStatusSchema.optional(),
    lastMaintenanceAt: z.coerce.date().nullable().optional(),
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
    name: z.string().min(1).optional(),
    status: machineStatusSchema.optional(),
    lastMaintenanceAt: z.coerce.date().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    const hasUpdateField =
      data.name !== undefined ||
      data.type !== undefined ||
      data.status !== undefined ||
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
