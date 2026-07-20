import { z } from "zod";

export const assetItemListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  q: z.string().optional(),
});
export type assetItemListQuerySchemaType = z.infer<
  typeof assetItemListQuerySchema
>;

export const assetItemCreateSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  category: z.string().min(1),
  uom: z.string().min(1),
  reorderLevel: z.number().nonnegative().optional(),
  currentStock: z.number().nonnegative().optional(),
  averageCostPaise: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
});
export type assetItemCreateSchemaType = z.infer<typeof assetItemCreateSchema>;

export const assetItemUpdateSchema = z
  .object({
    sku: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    category: z.string().min(1).optional(),
    uom: z.string().min(1).optional(),
    reorderLevel: z.number().nonnegative().optional(),
    currentStock: z.number().nonnegative().optional(),
    averageCostPaise: z.number().int().nonnegative().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const hasUpdateField =
      data.sku !== undefined ||
      data.name !== undefined ||
      data.description !== undefined ||
      data.category !== undefined ||
      data.uom !== undefined ||
      data.reorderLevel !== undefined ||
      data.currentStock !== undefined ||
      data.averageCostPaise !== undefined ||
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
});
export type assetServiceListQuerySchemaType = z.infer<
  typeof assetServiceListQuerySchema
>;

export const assetServiceCreateSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  sacCode: z.string().nullable().optional(),
  defaultUom: z.string().min(1),
  isActive: z.boolean().optional(),
});
export type assetServiceCreateSchemaType = z.infer<
  typeof assetServiceCreateSchema
>;

export const assetServiceUpdateSchema = z
  .object({
    code: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    sacCode: z.string().nullable().optional(),
    defaultUom: z.string().min(1).optional(),
    isActive: z.boolean().optional(),
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
});
export type assetLocationListQuerySchemaType = z.infer<
  typeof assetLocationListQuerySchema
>;

export const assetLocationCreateSchema = z.object({
  name: z.string().min(1),
  type: z.enum([
    "main_store",
    "vendor_premise",
    "finished_goods",
    "scrap_yard",
  ]),
  isVirtual: z.boolean().optional(),
  linkedVendorId: z.number().int().positive().nullable().optional(),
});
export type assetLocationCreateSchemaType = z.infer<
  typeof assetLocationCreateSchema
>;

export const assetLocationUpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    type: z
      .enum(["main_store", "vendor_premise", "finished_goods", "scrap_yard"])
      .optional(),
    isVirtual: z.boolean().optional(),
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
});
export type assetMachineListQuerySchemaType = z.infer<
  typeof assetMachineListQuerySchema
>;

export const assetMachineCreateSchema = z.object({
  name: z.string().min(1),
  type: z.string().nullable().optional(),
  status: machineStatusSchema.optional(),
  lastMaintenanceAt: z.coerce.date().nullable().optional(),
});
export type assetMachineCreateSchemaType = z.infer<
  typeof assetMachineCreateSchema
>;

export const assetMachineUpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    type: z.string().nullable().optional(),
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
