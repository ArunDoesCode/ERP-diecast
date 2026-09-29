import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import {
  supplierHistory,
  supplierHistoryEntityEnum,
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

// ---- shared field rules (BR-SUP-02, 04, 06, 12, 13, 14) ----
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
export const SUPPLIER_GST_SLABS = [
  0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 28, 40,
] as const;

// "" means "no value" (saved as null); anything else is trimmed, upper-cased and format-checked.
const gstinField = z
  .string()
  .trim()
  .toUpperCase()
  .refine((v) => v === "" || GSTIN_RE.test(v), "Invalid GST number");
const panField = z
  .string()
  .trim()
  .toUpperCase()
  .refine((v) => v === "" || PAN_RE.test(v), "Invalid PAN");
const emailField = z
  .string()
  .trim()
  .refine((v) => v === "" || z.email().safeParse(v).success, "Invalid email");
const optText = z.string().trim();
const nameField = z.string().trim().min(1, "Name is required");
const paymentTermsField = z.number().int().min(0).max(365);
const gstPercentField = z
  .number()
  .refine((v) => (SUPPLIER_GST_SLABS as readonly number[]).includes(v), {
    message: "GST % must be one of 0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 28, 40",
  });
const pricePaiseField = z.number().int().min(1).max(2147483647);
const leadTimeField = z.number().int().min(0).max(365);
const qtyField = z
  .number()
  .min(0)
  .refine((v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6, {
    message: "Qty allows at most 3 decimals",
  });

// PAN characters must equal GSTIN characters 3-12 when both are given (BR-SUP-04).
// The service also checks this against the stored value when only one of them is sent.
function refinePanMatchesGstin(
  data: {
    gstNumber?: string | null | undefined;
    panNumber?: string | null | undefined;
  },
  ctx: z.RefinementCtx,
) {
  const gst = data.gstNumber?.trim().toUpperCase();
  const pan = data.panNumber?.trim().toUpperCase();
  if (gst && pan && GSTIN_RE.test(gst) && gst.slice(2, 12) !== pan) {
    ctx.addIssue({
      code: "custom",
      path: ["panNumber"],
      message: "PAN must match characters 3-12 of the GST number",
    });
  }
}

export const supplierListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z
    .enum(["name", "type", "contactPerson", "isActive", "createdAt"])
    .optional(),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
  // BR-SUP-23: matches name, contact person, email, phone, GSTIN, or SKU of a supplied item (ignore case, any part)
  q: z.string().optional(),
  // BR-SUP-24: the PO supplier picker sends "active"
  status: z.enum(["all", "active", "inactive"]).default("all"),
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
  supplierSku: optText.optional(),
  supplierUnitPricePaise: pricePaiseField,
  taxPercentage: gstPercentField.default(0),
  leadTimeDays: leadTimeField.default(0),
  qty: qtyField.default(0), // 0 = no limit
  // must equal the item's own unit, else 400 (BR-SUP-14); the form locks it to the item unit
  uom: z.string().trim().min(1),
  isActive: z.boolean().optional(),
});
export type supplierItemCreateSchemaType = z.infer<
  typeof supplierItemCreateSchema
>;

export const supplierServiceCreateSchema = z.object({
  serviceId: z.number().int().positive(),
  serviceUnitPricePaise: pricePaiseField,
  taxPercentage: gstPercentField.default(0),
  leadTimeDays: leadTimeField.default(0),
  isActive: z.boolean().optional(),
});
export type supplierServiceCreateSchemaType = z.infer<
  typeof supplierServiceCreateSchema
>;

export const supplierCreateSchema = z
  .object({
    name: nameField,
    type: supplierTypeSchema.default("raw_material"),
    gstNumber: gstinField.optional(),
    panNumber: panField.optional(), // blank + GSTIN given -> filled from GSTIN
    contactPerson: optText.optional(),
    email: emailField.optional(),
    phone: optText.optional(),
    address: optText.optional(),
    defaultPaymentTermsDays: paymentTermsField.default(0),
    isActive: z.boolean().optional(),
    supplierItems: z.array(supplierItemCreateSchema).optional(),
  })
  .superRefine(refinePanMatchesGstin);
export type supplierCreateSchemaType = z.infer<typeof supplierCreateSchema>;

// Optional fields are clearable with "" or null (BR-SUP-09); name is not.
const supplierMasterUpdateSchema = z
  .object({
    mode: z.literal("master"),
    name: nameField.optional(),
    type: supplierTypeSchema.optional(),
    gstNumber: gstinField.nullable().optional(),
    panNumber: panField.nullable().optional(),
    contactPerson: optText.nullable().optional(),
    email: emailField.nullable().optional(),
    phone: optText.nullable().optional(),
    address: optText.nullable().optional(),
    defaultPaymentTermsDays: paymentTermsField.optional(),
    isActive: z.boolean().optional(), // false = deactivate, true = reactivate (BR-SUP-07, 08)
  })
  .superRefine((data, ctx) => {
    const { mode: _mode, ...fields } = data;
    if (Object.values(fields).every((v) => v === undefined)) {
      ctx.addIssue({
        code: "custom",
        message: "At least one supplier master field must be provided",
      });
    }
    refinePanMatchesGstin(data, ctx);
  });

const supplierItemUpdateSchema = z
  .object({
    mode: z.literal("item"),
    supplierItemsId: z.number().int().positive().optional(),
    itemId: z.number().int().positive().optional(),
    supplierSku: optText.nullable().optional(),
    supplierUnitPricePaise: pricePaiseField.optional(),
    taxPercentage: gstPercentField.optional(),
    leadTimeDays: leadTimeField.optional(),
    qty: qtyField.optional(),
    uom: z.string().trim().min(1).optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if ((data.supplierItemsId !== undefined) === (data.itemId !== undefined)) {
      ctx.addIssue({
        code: "custom",
        message: "Provide exactly one selector: supplierItemsId or itemId",
      });
    }
    const { mode: _mode, supplierItemsId: _a, itemId: _b, ...fields } = data;
    if (Object.values(fields).every((v) => v === undefined)) {
      ctx.addIssue({
        code: "custom",
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

// Batch rows are NOT refined here: "one target" / "at least one field" are checked per row by the service so the
// reply can list each row with its reason (BR-SUP-20, 21). Only value rules and the 100-row cap fail the whole request.
export const supplierItemEditSchema = z.object({
  supplierItemsId: z.number().int().positive().optional(),
  itemId: z.number().int().positive().optional(),
  supplierSku: optText.nullable().optional(),
  supplierUnitPricePaise: pricePaiseField.optional(),
  taxPercentage: gstPercentField.optional(),
  leadTimeDays: leadTimeField.optional(),
  qty: qtyField.optional(),
  uom: z.string().trim().min(1).optional(),
  isActive: z.boolean().optional(),
});
export type supplierItemEditSchemaType = z.infer<typeof supplierItemEditSchema>;

export const supplierItemBatchEditSchema = z.union([
  supplierItemEditSchema,
  z.array(supplierItemEditSchema).min(1).max(100),
]);
export type supplierItemBatchEditSchemaType = z.infer<
  typeof supplierItemBatchEditSchema
>;

export const supplierServiceEditSchema = z.object({
  supplierServiceId: z.number().int().positive().optional(),
  serviceId: z.number().int().positive().optional(),
  serviceUnitPricePaise: pricePaiseField.optional(),
  taxPercentage: gstPercentField.optional(),
  leadTimeDays: leadTimeField.optional(),
  isActive: z.boolean().optional(),
});
export type supplierServiceEditSchemaType = z.infer<
  typeof supplierServiceEditSchema
>;

export const supplierServiceBatchEditSchema = z.union([
  supplierServiceEditSchema,
  z.array(supplierServiceEditSchema).min(1).max(100),
]);
export type supplierServiceBatchEditSchemaType = z.infer<
  typeof supplierServiceBatchEditSchema
>;

// ---- history (BR-SUP-10) ----
export const supplierHistoryEntitySchema = z.enum(
  supplierHistoryEntityEnum.enumValues,
);
export const supplierHistoryRowSchema = createSelectSchema(
  supplierHistory,
).extend({
  changedByName: z.string().nullable(),
  entityLabel: z.string().nullable(), // item sku / service code / null for supplier
});
export type supplierHistoryRowSchemaType = z.infer<
  typeof supplierHistoryRowSchema
>;

export const supplierHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  entity: supplierHistoryEntitySchema.optional(),
});
export type supplierHistoryQuerySchemaType = z.infer<
  typeof supplierHistoryQuerySchema
>;
