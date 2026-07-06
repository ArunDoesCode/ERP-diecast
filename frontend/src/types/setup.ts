import { z } from "zod";

export interface Module {
  id: number;
  name: string;
}

export interface Role {
  id: number;
  name: string;
  isSystem: boolean;
}

export interface Page {
  id: number;
  key: string;
  label: string;
  path: string;
  sortOrder: number;
  moduleId: number | null;
}

export interface Employee {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  qrToken: string | null;
  loginMethod: "password" | "qr";
  roleId: number;
  dailyRatePaise: number;
  isActive: boolean;
}

export interface RolePage {
  roleId: number;
  pageId: number;
}

// ---- list pagination ----

// mirrors backend employeeListQuerySchema/roleListQuerySchema/pageListQuerySchema
// (zod, all optional except sortDir default "asc")
export type EmployeeSortField =
  | "name"
  | "roleId"
  | "dailyRatePaise"
  | "isActive";

export type RoleSortField = "name";

export type PageSortField = "label" | "path" | "moduleId" | "sortOrder";

export type ListParams<TSortField extends string> = {
  page?: number;
  pageSize?: number;
  sortBy?: TSortField;
  sortDir?: "asc" | "desc";
};

export type EmployeeListParams = ListParams<EmployeeSortField>;
export type RoleListParams = ListParams<RoleSortField>;
export type PageListParams = ListParams<PageSortField>;

// GET /setup/employees/search — name search, page-based infinite scroll
export type EmployeeSearchParams = {
  q: string;
  page: number;
  pageSize: number;
};

export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type PaginatedResponse<T> = {
  success: true;
  data: T[];
  meta: PaginationMeta;
};

// ---- forms ----

export const employeeSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    phone: z.string().optional(),
    dailyRatePaise: z.coerce.number().int().min(0),
    roleId: z.coerce.number().int().min(1, "Role is required"),
    loginMethod: z.enum(["password", "qr"]),
    email: z.email("Enter a valid email").optional().or(z.literal("")),
    // Only required on CREATE — editing an existing password-login employee must not
    // force a password re-type every time. EmployeeForm enforces "required on create"
    // imperatively (form.setError) and omits an empty password from the edit payload.
    password: z
      .string()
      .min(6, "Min 6 characters")
      .optional()
      .or(z.literal("")),
  })
  .superRefine((val, ctx) => {
    if (val.loginMethod === "password" && !val.email) {
      ctx.addIssue({
        code: "custom",
        message: "Email is required",
        path: ["email"],
      });
    }
  });
export type EmployeeInput = z.infer<typeof employeeSchema>;

export const roleSchema = z.object({
  name: z.string().min(1, "Name is required"),
});
export type RoleInput = z.infer<typeof roleSchema>;

export const pageSchema = z.object({
  key: z.string().min(1, "Key is required"),
  label: z.string().min(1, "Label is required"),
  path: z.string().min(1, "Path is required"),
  sortOrder: z.coerce.number().int().default(0),
  moduleId: z.coerce.number().int().nullable(),
});
export type PageInput = z.infer<typeof pageSchema>;

// keyed by moduleId (string-keyed object, not moduleName — names can be renamed via
// PageForm/PagesTab, ids are stable); submitted for one Role at a time.
export type RolePermissionDiff = Record<
  string,
  { added: number[]; deleted: number[] }
>;
