import { z } from "zod";

export const moduleSchema = z.object({
  id: z.number(),
  name: z.string(),
});
export type moduleSchemaType = z.infer<typeof moduleSchema>;

export const employeeSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  dailyRatePaise: z.number().nullable(),
  roleId: z.number(),
  isActive: z.boolean(),
  qrToken: z.null(),
  createdAt: z.date(),
  lastUpdatedAt: z.date(),
});
export type employeeSchemaType = z.infer<typeof employeeSchema>;

const loginMethodSchema = z.enum(["password", "qr"]);

export const employeeInputSchema = z
  .object({
    name: z.string().min(1),
    phone: z.string().optional(),
    dailyRatePaise: z.number().int().nonnegative().optional(),
    roleId: z.number(),
    loginMethod: loginMethodSchema,
    email: z.string().email().optional(),
    password: z.string().min(8).optional(),
  })
  .refine(
    (data) =>
      data.loginMethod !== "password" || (!!data.email && !!data.password),
    {
      message: "email and password are required when loginMethod is password",
      path: ["email"],
    },
  );
export type employeeInputSchemaType = z.infer<typeof employeeInputSchema>;

// Update allows editing metadata (name/phone/role/etc.) without resupplying
// email/password when the login method is staying "password" — the service
// layer enforces email+password only when flipping qr -> password.
export const employeeUpdateSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  dailyRatePaise: z.number().int().nonnegative().optional(),
  roleId: z.number(),
  loginMethod: loginMethodSchema,
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
});
export type employeeUpdateSchemaType = z.infer<typeof employeeUpdateSchema>;

// Setup list endpoints always paginate — page/pageSize default so an
// unparameterized request still returns a bounded, paginated response.
export const employeeListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(["name", "roleId", "dailyRatePaise", "isActive"]).optional(),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});
export type employeeListQuerySchemaType = z.infer<
  typeof employeeListQuerySchema
>;

// Debounced name-search + infinite-scroll UI: no sortBy/sortDir, ordered by
// employees.id asc only (still satisfies the PK-tiebreaker rule since it IS
// the only sort column).
export const employeeSearchQuerySchema = z.object({
  q: z.string().min(1),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});
export type employeeSearchQuerySchemaType = z.infer<
  typeof employeeSearchQuerySchema
>;

export const roleSchema = z.object({
  id: z.number(),
  name: z.string(),
  isSystem: z.boolean(),
});
export type roleSchemaType = z.infer<typeof roleSchema>;

export const roleInputSchema = z.object({
  name: z.string().min(1),
});
export type roleInputSchemaType = z.infer<typeof roleInputSchema>;

export const roleListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(["name"]).optional(),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});
export type roleListQuerySchemaType = z.infer<typeof roleListQuerySchema>;

export const pageSchema = z.object({
  id: z.number(),
  key: z.string(),
  label: z.string(),
  path: z.string(),
  sortOrder: z.number(),
  moduleId: z.number().nullable(),
});
export type pageSchemaType = z.infer<typeof pageSchema>;

export const pageInputSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  path: z.string().min(1),
  sortOrder: z.number().optional(),
  moduleId: z.number().nullable(),
});
export type pageInputSchemaType = z.infer<typeof pageInputSchema>;

export const pageListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(["label", "path", "moduleId", "sortOrder"]).optional(),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});
export type pageListQuerySchemaType = z.infer<typeof pageListQuerySchema>;

export const rolePageSchema = z.object({
  id: z.number(),
  roleId: z.number(),
  pageId: z.number(),
});
export type rolePageSchemaType = z.infer<typeof rolePageSchema>;

export const rolePermissionDiffSchema = z.record(
  z.string(),
  z.object({
    added: z.array(z.number()),
    deleted: z.array(z.number()),
  }),
);
export type rolePermissionDiffSchemaType = z.infer<
  typeof rolePermissionDiffSchema
>;
