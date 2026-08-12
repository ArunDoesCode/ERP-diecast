import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import {
  supplierItems,
  supplierMaster,
  supplierServices,
  supplierTypeEnum,
} from "../db/schemas/02_procurement-suppliers";

export const supplierTypeSchema = z.enum(supplierTypeEnum.enumValues);

export const supplierSchema = createSelectSchema(supplierMaster);
export type supplierSchemaType = z.infer<typeof supplierSchema>;

export const supplierItemSchema = createSelectSchema(supplierItems);
export type supplierItemSchemaType = z.infer<typeof supplierItemSchema>;

export const supplierServiceSchema = createSelectSchema(
  supplierServices,
).extend({
  serviceCode: z.string(),
  serviceName: z.string(),
});
export type supplierServiceSchemaType = z.infer<typeof supplierServiceSchema>;

// GET /:supplierId/detail response payload — supplier master plus item/service counts.
export const supplierDetailSchema = z.object({
  supplier: supplierSchema,
  itemCount: z.number().int().nonnegative(),
  serviceCount: z.number().int().nonnegative(),
});
export type supplierDetailSchemaType = z.infer<typeof supplierDetailSchema>;

// Bespoke response shapes for the two batch-edit routes below — these
// controllers spread the service result directly ({success, data, summary}),
// not the standard {success, data} envelope. See routes/supplier.ts register()
// notes for the documented deviation.
const batchEditSelectorSchema = z.object({
  supplierItemsId: z.number().int().positive().optional(),
  itemId: z.number().int().positive().optional(),
});

export const supplierItemBatchEditResultSchema = z.object({
  index: z.number().int().nonnegative(),
  selector: batchEditSelectorSchema,
  success: z.boolean(),
  data: supplierItemSchema.optional(),
  error: z.string().optional(),
});
export type supplierItemBatchEditResultSchemaType = z.infer<
  typeof supplierItemBatchEditResultSchema
>;

export const supplierBatchEditSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  success: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});
export type supplierBatchEditSummarySchemaType = z.infer<
  typeof supplierBatchEditSummarySchema
>;

const batchEditServiceSelectorSchema = z.object({
  supplierServiceId: z.number().int().positive().optional(),
  serviceId: z.number().int().positive().optional(),
});

export const supplierServiceBatchEditResultSchema = z.object({
  index: z.number().int().nonnegative(),
  selector: batchEditServiceSelectorSchema,
  success: z.boolean(),
  data: supplierServiceSchema.optional(),
  error: z.string().optional(),
});
export type supplierServiceBatchEditResultSchemaType = z.infer<
  typeof supplierServiceBatchEditResultSchema
>;

// Full response envelope for PATCH .../editItem — {success, ...serviceResult},
// not the standard {success, data}. Documented deviation, not normalized.
export const supplierItemEditResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(supplierItemBatchEditResultSchema),
  summary: supplierBatchEditSummarySchema,
});
export type supplierItemEditResponseSchemaType = z.infer<
  typeof supplierItemEditResponseSchema
>;

// Full response envelope for PATCH .../editService — same deviation as above.
export const supplierServiceEditResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(supplierServiceBatchEditResultSchema),
  summary: supplierBatchEditSummarySchema,
});
export type supplierServiceEditResponseSchemaType = z.infer<
  typeof supplierServiceEditResponseSchema
>;

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

export const supplierItemCreateSchema = z.object({
  itemId: z.number().int().positive(),
  supplierSku: z.string().optional(),
  supplierUnitPricePaise: z.number().int().nonnegative(),
  taxPercentage: z.number().nonnegative().optional(),
  leadTimeDays: z.number().int().nonnegative().optional(),
  qty: z.number().nonnegative().optional(),
  uom: z.string().min(1),
  isActive: z.boolean().optional(),
});
export type supplierItemCreateSchemaType = z.infer<
  typeof supplierItemCreateSchema
>;

export const supplierServiceCreateSchema = z.object({
  serviceId: z.number().int().positive(),
  serviceUnitPricePaise: z.number().int().nonnegative(),
  taxPercentage: z.number().nonnegative().optional(),
  leadTimeDays: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
});
export type supplierServiceCreateSchemaType = z.infer<
  typeof supplierServiceCreateSchema
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
  supplierItems: z.array(supplierItemCreateSchema).optional(),
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
