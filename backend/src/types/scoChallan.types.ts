import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import {
  scoChallanLines,
  scoChallans,
} from "../db/schemas/02_procurement-purchasing";
import { companySettingsSchema } from "./sco.types";

// --- Responses ---

// BR-SCO-11: ok = more than 60 days left, warning = 0..60 days left, overdue = past due.
export const challanDueStatusSchema = z.enum(["ok", "warning", "overdue"]);

export const challanResponseSchema = createSelectSchema(scoChallans).extend({
  scoNumber: z.string(),
  vendorName: z.string(),
  // Whole days from today to returnDueDate; negative when overdue.
  daysLeft: z.number().int(),
  dueStatus: challanDueStatusSchema,
  createdByName: z.string().nullable(),
});
export type challanResponseSchemaType = z.infer<typeof challanResponseSchema>;

export const challanLineResponseSchema = createSelectSchema(
  scoChallanLines,
).extend({
  itemSku: z.string(),
  itemName: z.string(),
  // qty x unitIssueCostPaise.
  lineValuePaise: z.number().int(),
});
export type challanLineResponseSchemaType = z.infer<
  typeof challanLineResponseSchema
>;

// POST create result and challan details.
export const challanDetailsSchema = z.object({
  challan: challanResponseSchema,
  lines: z.array(challanLineResponseSchema),
});
export type challanDetailsSchemaType = z.infer<typeof challanDetailsSchema>;

// GET /sco/challans/:challanId : everything the printed challan needs (BR-SCO-09, Rule 55).
export const challanPrintSchema = challanDetailsSchema.extend({
  company: companySettingsSchema,
  vendor: z.object({
    id: z.number().int(),
    name: z.string(),
    address: z.string().nullable(),
    // null = "unregistered" on the print.
    gstin: z.string().nullable(),
    // First two GSTIN digits; null when unregistered.
    stateCode: z.string().nullable(),
  }),
  // Fixed legal wording for the print footer.
  declaration: z.string(),
});
export type challanPrintSchemaType = z.infer<typeof challanPrintSchema>;

// --- Requests ---

export const challanLineInputSchema = z.object({
  scoItemId: z.number().int().positive(),
  // BR-SCO-07: whole pieces > 0, at most send qty - already issued.
  qty: z.number().int().min(1),
  // Optional override; default = the SCO line's heat number (BR-SCO-08, 25).
  heatNumber: z.string().trim().min(1).max(100).optional(),
});

export const createChallanSchema = z.object({
  // Default = now. BR-SCO-09: decides the financial year of the number.
  challanDate: z.coerce.date().optional(),
  // BR-SCO-10: required in the cases listed there (checked in the service, 400).
  ewayBillNo: z.string().trim().min(1).max(50).optional(),
  lines: z.array(challanLineInputSchema).min(1),
});
export type createChallanSchemaType = z.infer<typeof createChallanSchema>;

export const scoChallanParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const challanIdParamSchema = z.object({
  challanId: z.coerce.number().int().positive(),
});

// Open = at least one line with settledQty < qty. Default order: soonest due first.
export const openChallanListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z
    .enum(["id", "challanNumber", "challanDate", "returnDueDate"])
    .default("returnDueDate"),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
  vendorId: z.coerce.number().int().positive().optional(),
  scoId: z.coerce.number().int().positive().optional(),
  dueStatus: challanDueStatusSchema.optional(),
});
export type openChallanListQuerySchemaType = z.infer<
  typeof openChallanListQuerySchema
>;
