import { z } from "zod";
import { searchTermSchema } from "../lib/safe-search";

// Customer contract types (sale-order design/api.md; BR-SO-01..03).

const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const nameField = z.string().trim().min(1).max(120);
const stateCodeField = z
  .string()
  .trim()
  .regex(/^\d{2}$/, "2-digit GST state code");
const addressField = z.string().trim().min(1).max(300);
const gstinField = z
  .string()
  .trim()
  .toUpperCase()
  .regex(GSTIN_RE, "Invalid GST number");

// Create: when gstin is given its first two digits must equal stateCode
// (BR-SO-01); the check is a refine so the 400 names the field.
const gstinMatchesState = (v: {
  stateCode?: string | undefined;
  gstin?: string | undefined;
}) => !v.gstin || !v.stateCode || v.gstin.slice(0, 2) === v.stateCode;
const GSTIN_STATE_MESSAGE = {
  message: "GSTIN must start with the state code",
  path: ["gstin"],
};

// POST /api/customers
export const createCustomerSchema = z
  .object({
    name: nameField,
    stateCode: stateCodeField,
    address: addressField,
    gstin: gstinField.optional(),
  })
  .refine(gstinMatchesState, GSTIN_STATE_MESSAGE);
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

// PATCH /api/customers/:id: at least one field. The service re-checks the
// GSTIN / state pair against the stored row when only one of them is sent.
export const updateCustomerSchema = z
  .object({
    name: nameField.optional(),
    stateCode: stateCodeField.optional(),
    address: addressField.optional(),
    gstin: gstinField.nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "At least one field is required",
  })
  .refine(
    (v) => !v.gstin || !v.stateCode || v.gstin.slice(0, 2) === v.stateCode,
    GSTIN_STATE_MESSAGE,
  );
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const customerIdParamSchema = z.object({
  id: z.coerce.number().int().min(1),
});

export const CUSTOMER_LIST_SORT_FIELDS = ["name", "createdAt"] as const;
// GET /api/customers (also the customer combobox: ?isActive=true&q=)
export const customerListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(CUSTOMER_LIST_SORT_FIELDS).default("name"),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
  q: searchTermSchema,
  isActive: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  stateCode: stateCodeField.optional(),
});
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;

export const customerSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  stateCode: z.string(),
  address: z.string(),
  gstin: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  lastUpdatedAt: z.string(),
});
export type CustomerRow = z.infer<typeof customerSchema>;
