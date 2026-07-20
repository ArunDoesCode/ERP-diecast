import { z } from "zod";

export const supplierTypeSchema = z.enum([
  "raw_material",
  "consumables",
  "service_provider",
  "trader",
  "both",
]);

export const supplierSchema = z.object({
  id: z.number(),
  name: z.string(),
  type: supplierTypeSchema,
  gstNumber: z.string().nullable(),
  panNumber: z.string().nullable(),
  contactPerson: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  defaultPaymentTermsDays: z.number().nullable(),
  isActive: z.boolean(),
  createdBy: z.number().nullable(),
  createdAt: z.date(),
});
export type supplierSchemaType = z.infer<typeof supplierSchema>;

export const supplierItemSchema = z.object({
  id: z.number(),
  supplierId: z.number(),
  itemId: z.number(),
  supplierSku: z.string().nullable(),
  supplierUnitPricePaise: z.number(),
  taxPercentage: z.number(),
  leadTimeDays: z.number(),
  qty: z.number(),
  uom: z.string(),
  isActive: z.boolean(),
  createdBy: z.number().nullable(),
  createdAt: z.date(),
  lastUpdatedBy: z.number().nullable(),
  lastUpdatedAt: z.date(),
});
export type supplierItemSchemaType = z.infer<typeof supplierItemSchema>;

export const supplierServiceSchema = z.object({
  id: z.number(),
  supplierId: z.number(),
  serviceId: z.number(),
  serviceCode: z.string(),
  serviceName: z.string(),
  serviceUnitPricePaise: z.number(),
  taxPercentage: z.number(),
  leadTimeDays: z.number(),
  isActive: z.boolean(),
  createdBy: z.number().nullable(),
  createdAt: z.date(),
  lastUpdatedBy: z.number().nullable(),
  lastUpdatedAt: z.date(),
});
export type supplierServiceSchemaType = z.infer<typeof supplierServiceSchema>;

export const supplierListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z
    .enum(["name", "type", "contactPerson", "isActive", "createdAt"])
    .optional(),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
  q: z.string().optional(),
});
export type supplierListQuerySchemaType = z.infer<
  typeof supplierListQuerySchema
>;

export const supplierItemLookupQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  q: z.string().optional(),
});
export type supplierItemLookupQuerySchemaType = z.infer<
  typeof supplierItemLookupQuerySchema
>;

export const supplierServiceListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  q: z.string().optional(),
});
export type supplierServiceListQuerySchemaType = z.infer<
  typeof supplierServiceListQuerySchema
>;

export const supplierDetailQuerySchema = z.object({
  supplierId: z.coerce.number().int().positive(),
});
export type supplierDetailQuerySchemaType = z.infer<
  typeof supplierDetailQuerySchema
>;

export const supplierItemInputSchema = z.object({
  itemId: z.number().int().positive(),
  supplierSku: z.string().optional(),
  supplierUnitPricePaise: z.number().int().nonnegative(),
  taxPercentage: z.number().nonnegative().optional(),
  leadTimeDays: z.number().int().nonnegative().optional(),
  qty: z.number().nonnegative().optional(),
  uom: z.string().min(1),
  isActive: z.boolean().optional(),
});
export type supplierItemInputSchemaType = z.infer<
  typeof supplierItemInputSchema
>;

export const supplierServiceInputSchema = z.object({
  serviceId: z.number().int().positive(),
  serviceUnitPricePaise: z.number().int().nonnegative(),
  taxPercentage: z.number().nonnegative().optional(),
  leadTimeDays: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
});
export type supplierServiceInputSchemaType = z.infer<
  typeof supplierServiceInputSchema
>;

export const supplierCreateSchema = z.object({
  name: z.string().min(1),
  type: supplierTypeSchema.optional(),
  gstNumber: z.string().optional(),
  panNumber: z.string().optional(),
  contactPerson: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  defaultPaymentTermsDays: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
  supplierItems: z.array(supplierItemInputSchema).optional(),
});
export type supplierCreateSchemaType = z.infer<typeof supplierCreateSchema>;

const supplierMasterUpdateSchema = z
  .object({
    mode: z.literal("master"),
    name: z.string().min(1).optional(),
    type: supplierTypeSchema.optional(),
    gstNumber: z.string().nullable().optional(),
    panNumber: z.string().nullable().optional(),
    contactPerson: z.string().nullable().optional(),
    email: z.string().email().nullable().optional(),
    phone: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    defaultPaymentTermsDays: z.number().int().nonnegative().optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const hasUpdateField =
      data.name !== undefined ||
      data.type !== undefined ||
      data.gstNumber !== undefined ||
      data.panNumber !== undefined ||
      data.contactPerson !== undefined ||
      data.email !== undefined ||
      data.phone !== undefined ||
      data.address !== undefined ||
      data.defaultPaymentTermsDays !== undefined ||
      data.isActive !== undefined;

    if (!hasUpdateField) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one supplier master field must be provided",
      });
    }
  });

const supplierItemUpdateSchema = z
  .object({
    mode: z.literal("item"),
    supplierItemsId: z.number().int().positive().optional(),
    itemId: z.number().int().positive().optional(),
    supplierSku: z.string().nullable().optional(),
    supplierUnitPricePaise: z.number().int().nonnegative().optional(),
    taxPercentage: z.number().nonnegative().optional(),
    leadTimeDays: z.number().int().nonnegative().optional(),
    qty: z.number().nonnegative().optional(),
    uom: z.string().min(1).optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const hasSupplierItemsId = data.supplierItemsId !== undefined;
    const hasItemId = data.itemId !== undefined;

    if (hasSupplierItemsId === hasItemId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide exactly one selector: supplierItemsId or itemId",
      });
    }

    const hasUpdateField =
      data.supplierSku !== undefined ||
      data.supplierUnitPricePaise !== undefined ||
      data.taxPercentage !== undefined ||
      data.leadTimeDays !== undefined ||
      data.qty !== undefined ||
      data.uom !== undefined ||
      data.isActive !== undefined;

    if (!hasUpdateField) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one supplier item field must be provided",
      });
    }
  });

export const supplierUpdateSchema = z.discriminatedUnion("mode", [
  supplierMasterUpdateSchema,
  supplierItemUpdateSchema,
]);
export type supplierUpdateSchemaType = z.infer<typeof supplierUpdateSchema>;

export const supplierItemListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  q: z.string().optional(),
});
export type supplierItemListQuerySchemaType = z.infer<
  typeof supplierItemListQuerySchema
>;

export const supplierItemCreateSchema = supplierItemInputSchema;
export type supplierItemCreateSchemaType = z.infer<
  typeof supplierItemCreateSchema
>;

export const supplierItemEditSchema = z
  .object({
    supplierItemsId: z.number().int().positive().optional(),
    itemId: z.number().int().positive().optional(),
    supplierSku: z.string().nullable().optional(),
    supplierUnitPricePaise: z.number().int().nonnegative().optional(),
    taxPercentage: z.number().nonnegative().optional(),
    leadTimeDays: z.number().int().nonnegative().optional(),
    qty: z.number().nonnegative().optional(),
    uom: z.string().min(1).optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const hasSupplierItemsId = data.supplierItemsId !== undefined;
    const hasItemId = data.itemId !== undefined;

    if (hasSupplierItemsId === hasItemId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide exactly one selector: supplierItemsId or itemId",
      });
    }

    const hasUpdateField =
      data.supplierSku !== undefined ||
      data.supplierUnitPricePaise !== undefined ||
      data.taxPercentage !== undefined ||
      data.leadTimeDays !== undefined ||
      data.qty !== undefined ||
      data.uom !== undefined ||
      data.isActive !== undefined;

    if (!hasUpdateField) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one supplier item field must be provided",
      });
    }
  });
export type supplierItemEditSchemaType = z.infer<typeof supplierItemEditSchema>;

export const supplierItemBatchEditSchema = z.union([
  supplierItemEditSchema,
  z.array(supplierItemEditSchema).min(1),
]);
export type supplierItemBatchEditSchemaType = z.infer<
  typeof supplierItemBatchEditSchema
>;

export const supplierServiceCreateSchema = supplierServiceInputSchema;
export type supplierServiceCreateSchemaType = z.infer<
  typeof supplierServiceCreateSchema
>;

export const supplierServiceEditSchema = z
  .object({
    supplierServiceId: z.number().int().positive().optional(),
    serviceId: z.number().int().positive().optional(),
    serviceUnitPricePaise: z.number().int().nonnegative().optional(),
    taxPercentage: z.number().nonnegative().optional(),
    leadTimeDays: z.number().int().nonnegative().optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const hasSupplierServiceId = data.supplierServiceId !== undefined;
    const hasServiceId = data.serviceId !== undefined;

    if (hasSupplierServiceId === hasServiceId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide exactly one selector: supplierServiceId or serviceId",
      });
    }

    const hasUpdateField =
      data.serviceUnitPricePaise !== undefined ||
      data.taxPercentage !== undefined ||
      data.leadTimeDays !== undefined ||
      data.isActive !== undefined;

    if (!hasUpdateField) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one supplier service field must be provided",
      });
    }
  });
export type supplierServiceEditSchemaType = z.infer<
  typeof supplierServiceEditSchema
>;

export const supplierServiceBatchEditSchema = z.union([
  supplierServiceEditSchema,
  z.array(supplierServiceEditSchema).min(1),
]);
export type supplierServiceBatchEditSchemaType = z.infer<
  typeof supplierServiceBatchEditSchema
>;
