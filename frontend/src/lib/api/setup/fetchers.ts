import { api } from "@/lib/api/client";
import { API_ROUTES } from "@/lib/api/routes";
import type {
  Employee,
  EmployeeInput,
  EmployeeListParams,
  EmployeeSearchParams,
  Module,
  Page,
  PageInput,
  PageListParams,
  PaginatedResponse,
  Role,
  RoleInput,
  RoleListParams,
  RolePage,
  RolePermissionDiff,
} from "@/types/setup";

// Standard backend envelope: every 2xx response is `{ success: true, data }`
// (paginated list endpoints add `meta` on top — see PaginatedResponse in
// docs/backend-pagination-contract.md). HTTP-level failures throw
// ApiClientError in the client, so `success` is always `true` here.
type Ok<T> = { success: true; data: T };

function toQueryString(params?: Record<string, unknown>) {
  if (!params) return "";
  const entries = Object.entries(params).filter(
    ([, value]) => value !== undefined,
  );
  if (entries.length === 0) return "";
  return `?${new URLSearchParams(entries.map(([key, value]) => [key, String(value)]))}`;
}

export const getModules = () =>
  api.get<Ok<Module[]>>(API_ROUTES.setup.modules.list);

// No params = full unpaginated list (RoleTable/EmployeeCombobox cross-reference use
// this). EmployeeTable passes params for server-side page/sort.
export const getEmployees = (params?: EmployeeListParams) =>
  api.get<PaginatedResponse<Employee>>(
    `${API_ROUTES.setup.employees.list}${toQueryString(params)}`,
  );

export const searchEmployees = (params: EmployeeSearchParams) =>
  api.get<PaginatedResponse<Employee>>(
    `${API_ROUTES.setup.employees.search}${toQueryString(params)}`,
  );

export const createEmployee = (input: EmployeeInput) =>
  api.post<Ok<Employee>, EmployeeInput>(
    API_ROUTES.setup.employees.create,
    input,
  );
export const updateEmployee = (id: number, input: EmployeeInput) =>
  api.patch<Ok<Employee>, EmployeeInput>(
    API_ROUTES.setup.employees.update(id),
    input,
  );
export const deleteEmployee = (id: number) =>
  api.delete<Ok<null>>(API_ROUTES.setup.employees.remove(id));
export const generateEmployeeQr = (id: number) =>
  api.post<Ok<{ qrToken: string }>>(API_ROUTES.setup.employees.generateQr(id));

export const getRoles = (params?: RoleListParams) =>
  api.get<PaginatedResponse<Role>>(
    `${API_ROUTES.setup.roles.list}${toQueryString(params)}`,
  );
export const createRole = (input: RoleInput) =>
  api.post<Ok<Role>, RoleInput>(API_ROUTES.setup.roles.create, input);
export const updateRole = (id: number, input: RoleInput) =>
  api.patch<Ok<Role>, RoleInput>(API_ROUTES.setup.roles.update(id), input);
export const deleteRole = (id: number) =>
  api.delete<Ok<null>>(API_ROUTES.setup.roles.remove(id));

export const getPages = (params?: PageListParams) =>
  api.get<PaginatedResponse<Page>>(
    `${API_ROUTES.setup.pages.list}${toQueryString(params)}`,
  );
export const createPage = (input: PageInput) =>
  api.post<Ok<Page>, PageInput>(API_ROUTES.setup.pages.create, input);
export const updatePage = (id: number, input: PageInput) =>
  api.patch<Ok<Page>, PageInput>(API_ROUTES.setup.pages.update(id), input);
export const deletePage = (id: number) =>
  api.delete<Ok<null>>(API_ROUTES.setup.pages.remove(id));

export const getPermissionGrants = () =>
  api.get<Ok<RolePage[]>>(API_ROUTES.setup.permissions.list);
export const updateRolePermissions = (
  roleId: number,
  diff: RolePermissionDiff,
) =>
  api.post<Ok<RolePage[]>, RolePermissionDiff>(
    API_ROUTES.setup.permissions.updateForRole(roleId),
    diff,
  );
