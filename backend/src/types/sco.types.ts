import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import {
  scoStatusEnum,
  subcontractingOrderItems,
  subcontractingOrders,
} from "../db/schemas/02_procurement-purchasing";
import { companySettings } from "../db/schemas/04_company";
import { gstPercentSchema } from "./po.types";

export const scoStatusSchema = z.enum(scoStatusEnum.enumValues);
export type scoStatusSchemaType = z.infer<typeof scoStatusSchema>;

// --- Responses ---

// SCO row as returned: stored columns plus vendor and canceller names.
export const scoResponseSchema = createSelectSchema(
  subcontractingOrders,
).extend({
  vendorName: z.string(),
  cancelledByName: z.string().nullable(),
});
export type scoResponseSchemaType = z.infer<typeof scoResponseSchema>;

// Line as returned: stored columns (rawQtyToIssue = send qty, expectedReturnQty
// = return qty, whole pieces) plus item names and computed values (BR-SCO-04).
export const scoItemResponseSchema = createSelectSchema(
  subcontractingOrderItems,
).extend({
  rawItemSku: z.string(),
  rawItemName: z.string(),
  finishedItemSku: z.string(),
  finishedItemName: z.string(),
  // service price x return qty, no GST.
  lineValuePaise: z.number().int(),
  lineTaxPaise: z.number().int(),
});
export type scoItemResponseSchemaType = z.infer<typeof scoItemResponseSchema>;

// GET /sco/getscodetails/:id and create/update/submit result.
export const scoDetailsSchema = z.object({
  sco: scoResponseSchema,
  items: z.array(scoItemResponseSchema),
});
export type scoDetailsSchemaType = z.infer<typeof scoDetailsSchema>;

// --- Requests ---

const wholeQtySchema = z.number().int().min(1); // BR-SCO-02

export const scoLineInputSchema = z.object({
  rawItemId: z.number().int().positive(),
  finishedItemId: z.number().int().positive(),
  serviceId: z.number().int().positive(),
  // BR-SCO-02: send qty and return qty, whole pieces > 0.
  rawQtyToIssue: wholeQtySchema,
  expectedReturnQty: wholeQtySchema,
  // BR-SCO-02: omitted = copied from the vendor's active service price list.
  serviceUnitPricePaise: z.number().int().min(1).optional(),
  serviceTaxPercentage: gstPercentSchema.optional(),
  rawItemBatch: z.string().trim().min(1).max(100).optional(),
});
export type scoLineInputSchemaType = z.infer<typeof scoLineInputSchema>;

export const createScoSchema = z.object({
  vendorId: z.number().int().positive(),
  // BR-SCO-03: today .. today + 365 days (checked in the service, 400).
  expectedReturnDate: z.coerce.date(),
  projectRef: z.string().trim().min(1).max(200).optional(),
  notes: z.string().max(2000).optional(),
  lines: z.array(scoLineInputSchema).min(1),
});
export type createScoSchemaType = z.infer<typeof createScoSchema>;

// Draft only (BR-SCO-05). `lines`, when sent, replaces all lines. Status and
// vendor are not editable; unknown keys (e.g. `status`) are a 400.
export const updateScoSchema = z
  .object({
    scoId: z.number().int().positive(),
    expectedReturnDate: z.coerce.date().optional(),
    projectRef: z.string().trim().min(1).max(200).nullish(),
    notes: z.string().max(2000).nullish(),
    lines: z.array(scoLineInputSchema).min(1).optional(),
  })
  .strict()
  .refine(
    (d) =>
      d.expectedReturnDate !== undefined ||
      d.projectRef !== undefined ||
      d.notes !== undefined ||
      d.lines !== undefined,
    { message: "At least one updatable field must be provided" },
  );
export type updateScoSchemaType = z.infer<typeof updateScoSchema>;

// BR-SCO-20: reason 3-500 chars, every status.
export const cancelScoSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
export type cancelScoSchemaType = z.infer<typeof cancelScoSchema>;

// BR-SCO-19: reason 3-500 chars. Required when qty is left at the vendor
// (checked in the service, 400); optional otherwise.
export const closeScoSchema = z.object({
  reason: z.string().trim().min(3).max(500).optional(),
});
export type closeScoSchemaType = z.infer<typeof closeScoSchema>;

export const scoListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z
    .enum(["id", "scoNumber", "status", "createdAt", "expectedReturnDate"])
    .optional(),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
  // Comma-separated statuses, e.g. "draft,approved".
  status: z
    .string()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean)
        : undefined,
    )
    .pipe(z.array(scoStatusSchema).optional()),
  vendorId: z.coerce.number().int().positive().optional(),
  // Matches SCO number or vendor name (case-insensitive contains).
  q: z.string().trim().min(1).max(100).optional(),
  // Register date filter (S4): SCO createdAt, inclusive, ISO dates.
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
});
export type scoListQuerySchemaType = z.infer<typeof scoListQuerySchema>;

export const scoIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// --- Company settings (BR-SCO-09) ---

export const companySettingsSchema = createSelectSchema(companySettings);
export type companySettingsSchemaType = z.infer<typeof companySettingsSchema>;

// GET returns null until the owner first saves.
export const companySettingsUpsertSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    address: z.string().trim().min(1).max(500),
    gstin: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^\d{2}[A-Z0-9]{13}$/, "GSTIN must be 15 characters"),
    stateCode: z
      .string()
      .trim()
      .regex(/^\d{2}$/, "State code is 2 digits"),
  })
  .strict();
export type companySettingsUpsertSchemaType = z.infer<
  typeof companySettingsUpsertSchema
>;
