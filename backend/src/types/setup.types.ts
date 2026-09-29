import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { employees } from "../db/schemas/03_hcm";

export const moduleSchema = z.object({
  id: z.number(),
  name: z.string(),
});
export type moduleSchemaType = z.infer<typeof moduleSchema>;

// Repository never returns the real qrToken (see employeeRepository.toEmployee),
// so the select schema overrides that column to the z.null() literal it
// actually resolves to on the wire.
export const employeeSchema = createSelectSchema(employees)
  .omit({ passwordHash: true, createdBy: true, lastUpdatedBy: true })
  .extend({ qrToken: z.null() });
export type employeeSchemaType = z.infer<typeof employeeSchema>;

// POST /employees/:id/qr response payload — the one-time raw QR token
// (never persisted in plaintext, distinct from employeeSchema.qrToken).
export const employeeQrTokenSchema = z.object({ qrToken: z.string() });
export type employeeQrTokenSchemaType = z.infer<typeof employeeQrTokenSchema>;

const loginMethodSchema = z.enum(["password", "qr"]);

// Base insert-derived shape for the columns shared by create/update payloads.
// Only name/roleId are picked straight from the derived insert schema —
// phone/dailyRatePaise/email are nullable columns, so drizzle-zod would
// derive them as `.optional().nullable()`; the write contract here only
// ever accepts omission (never an explicit null), so those three stay
// hand-authored to preserve that exact behavior.
const employeeWriteBaseSchema = createInsertSchema(employees, {
  name: (schema) => schema.min(1),
}).pick({ name: true, roleId: true });

export const employeeInputSchema = employeeWriteBaseSchema
  .extend({
    phone: z.string().optional(),
    dailyRatePaise: z.number().int().nonnegative().optional(),
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
export const employeeUpdateSchema = employeeWriteBaseSchema.extend({
  phone: z.string().optional(),
  dailyRatePaise: z.number().int().nonnegative().optional(),
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

// Debounced name-search + infinite-scroll UI.
export const employeeSearchQuerySchema = z.object({
  q: z.string().min(1),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(["name", "roleId", "dailyRatePaise", "isActive"]).optional(),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
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

export const roleUpdateSchema = roleInputSchema
  .partial()
  .superRefine((data, ctx) => {
    if (data.name === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one role field must be provided",
      });
    }
  });
export type roleUpdateSchemaType = z.infer<typeof roleUpdateSchema>;

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

// key is immutable on update — omitted here rather than silently ignored
// downstream.
export const pageUpdateSchema = pageInputSchema
  .omit({ key: true })
  .partial()
  .superRefine((data, ctx) => {
    const hasUpdateField =
      data.label !== undefined ||
      data.path !== undefined ||
      data.sortOrder !== undefined ||
      data.moduleId !== undefined;

    if (!hasUpdateField) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one page field must be provided",
      });
    }
  });
export type pageUpdateSchemaType = z.infer<typeof pageUpdateSchema>;

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

// ---------------------------------------------------------------------------
// S6 (auth-setup v7): role editor, screens admin, guardrails, access log.
// Old role_pages endpoints (/pages*, /permissions, /roles/:roleId/permissions)
// stay unchanged until S7.
// ---------------------------------------------------------------------------

/** GET /roles row (BR-AUTH-07, 19): role + key and active-employee counts. */
export const roleListItemSchema = roleSchema.extend({
  isSuperAdmin: z.boolean(),
  keyCount: z.number().int().min(0),
  employeeCount: z.number().int().min(0),
});
export type roleListItemSchemaType = z.infer<typeof roleListItemSchema>;

/** POST /roles/:id/copy body (BR-AUTH-25). */
export const roleCopyInputSchema = z.object({ name: z.string().trim().min(1) });
export type roleCopyInputSchemaType = z.infer<typeof roleCopyInputSchema>;

export const roleGrantItemSchema = z.object({
  key: z.string(),
  module: z.string(),
  label: z.string(),
  description: z.string(),
  grantable: z.boolean(),
  granted: z.boolean(),
});
export type roleGrantItemSchemaType = z.infer<typeof roleGrantItemSchema>;

/** GET/POST /roles/:id/grants response: the whole catalog with granted flags. */
export const roleGrantsSchema = z.object({
  roleId: z.number(),
  roleName: z.string(),
  isSystem: z.boolean(),
  isSuperAdmin: z.boolean(),
  // true for super-admin: every key shown granted, read-only (BR-AUTH-18)
  readOnly: z.boolean(),
  keys: z.array(roleGrantItemSchema),
});
export type roleGrantsSchemaType = z.infer<typeof roleGrantsSchema>;

/** POST /roles/:id/grants body: the diff the UI confirmed (keys, not page ids). */
export const roleGrantsDiffSchema = z
  .object({
    added: z.array(z.string()).default([]),
    removed: z.array(z.string()).default([]),
  })
  .superRefine((data, ctx) => {
    if (data.added.length === 0 && data.removed.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one key must be added or removed",
      });
    }
  });
export type roleGrantsDiffSchemaType = z.infer<typeof roleGrantsDiffSchema>;

/** GET /screens row (BR-AUTH-15): code-owned fields + UI-owned fields + ticked roles. */
export const screenSchema = z.object({
  key: z.string(),
  path: z.string(),
  // null = any signed-in user (no roles to tick)
  permissionKey: z.string().nullable(),
  label: z.string(),
  sortOrder: z.number().int(),
  // "" = no menu group
  menuGroup: z.string(),
  // roles that hold the screen's key (super-admin excluded: always sees it)
  roleIds: z.array(z.number()),
});
export type screenSchemaType = z.infer<typeof screenSchema>;

/** PATCH /screens/:key body: key/path/permissionKey are code-owned (BR-AUTH-06). */
export const screenUpdateSchema = z
  .object({
    label: z.string().trim().min(1).optional(),
    sortOrder: z.number().int().optional(),
    // "" clears the group (stored as "")
    menuGroup: z.string().trim().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (
      data.label === undefined &&
      data.sortOrder === undefined &&
      data.menuGroup === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one screen field must be provided",
      });
    }
  });
export type screenUpdateSchemaType = z.infer<typeof screenUpdateSchema>;

/** POST /screens/:key/roles body: tick = grant the screen's key to the role. */
export const screenRolesDiffSchema = z
  .object({
    added: z.array(z.number().int()).default([]),
    removed: z.array(z.number().int()).default([]),
  })
  .superRefine((data, ctx) => {
    if (data.added.length === 0 && data.removed.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one role must be added or removed",
      });
    }
  });
export type screenRolesDiffSchemaType = z.infer<typeof screenRolesDiffSchema>;

/** PATCH /employees/:id/role body. Strict: exactly one roleId (BR-AUTH-08). */
export const employeeRoleAssignSchema = z
  .object({ roleId: z.number().int() })
  .strict();
export type employeeRoleAssignSchemaType = z.infer<
  typeof employeeRoleAssignSchema
>;

/** GET /employees/assignable-roles row (BR-AUTH-16). */
export const assignableRoleSchema = z.object({
  id: z.number(),
  name: z.string(),
});
export type assignableRoleSchemaType = z.infer<typeof assignableRoleSchema>;

/** GET /access-log row (BR-AUTH-20). before/after are free JSON snapshots. */
export const accessLogSchema = z.object({
  id: z.number(),
  at: z.string(),
  actorId: z.number().nullable(),
  actorName: z.string().nullable(),
  action: z.string(),
  target: z.string(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
});
export type accessLogSchemaType = z.infer<typeof accessLogSchema>;

export const accessLogListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(["at", "action", "actorId"]).optional(),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});
export type accessLogListQuerySchemaType = z.infer<
  typeof accessLogListQuerySchema
>;

export * from "./supplier.types";
