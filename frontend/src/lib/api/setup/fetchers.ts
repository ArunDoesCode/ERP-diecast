import { api } from "@/lib/api/client";
import { API_ROUTES } from "@/lib/api/routes";
import type {
	AccessLogEntry,
	AccessLogListParams,
	AssignableRole,
	Employee,
	EmployeeInput,
	EmployeeListParams,
	EmployeeSearchParams,
	Module,
	PaginatedResponse,
	Role,
	RoleGrants,
	RoleGrantsDiff,
	RoleInput,
	RoleListParams,
	Screen,
	ScreenRolesDiff,
	ScreenUpdateInput,
} from "@/types/setup";

// Standard backend envelope: every 2xx response is `{ success: true, data }`
// (paginated list endpoints add `meta` on top — see PaginatedResponse in
// the backend `pagination-contract` skill). HTTP-level failures throw
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

// ---- S6: role grants, copy, screens, access log, role assignment ----

export const copyRole = (id: number, input: RoleInput) =>
	api.post<Ok<Role>, RoleInput>(API_ROUTES.setup.roles.copy(id), input);
export const getRoleGrants = (id: number) =>
	api.get<Ok<RoleGrants>>(API_ROUTES.setup.roles.grants(id));
export const updateRoleGrants = (id: number, diff: RoleGrantsDiff) =>
	api.post<Ok<RoleGrants>, RoleGrantsDiff>(
		API_ROUTES.setup.roles.grants(id),
		diff,
	);

export const getScreens = () =>
	api.get<Ok<Screen[]>>(API_ROUTES.setup.screens.list);
export const updateScreen = (key: string, input: ScreenUpdateInput) =>
	api.patch<Ok<Screen>, ScreenUpdateInput>(
		API_ROUTES.setup.screens.update(key),
		input,
	);
export const updateScreenRoles = (key: string, diff: ScreenRolesDiff) =>
	api.post<Ok<Screen>, ScreenRolesDiff>(
		API_ROUTES.setup.screens.roles(key),
		diff,
	);

export const getAccessLog = (params?: AccessLogListParams) =>
	api.get<PaginatedResponse<AccessLogEntry>>(
		`${API_ROUTES.setup.accessLog.list}${toQueryString(params)}`,
	);

export const getAssignableRoles = () =>
	api.get<Ok<AssignableRole[]>>(API_ROUTES.setup.employees.assignableRoles);
export const assignEmployeeRole = (id: number, roleId: number) =>
	api.patch<Ok<Employee>, { roleId: number }>(
		API_ROUTES.setup.employees.assignRole(id),
		{ roleId },
	);
