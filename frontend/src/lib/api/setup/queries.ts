"use client";

import {
	keepPreviousData,
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { authKeys } from "@/lib/api/auth/queries";
import type {
	AccessLogListParams,
	EmployeeInput,
	EmployeeListParams,
	EmployeeSearchParams,
	PageInput,
	PageListParams,
	RoleGrantsDiff,
	RoleInput,
	RoleListParams,
	RolePage,
	RolePermissionDiff,
	ScreenRolesDiff,
	ScreenUpdateInput,
} from "@/types/setup";

import { setupErrorMessage } from "./error-messages";
import {
	assignEmployeeRole,
	copyRole,
	createEmployee,
	createPage,
	createRole,
	deleteEmployee,
	deletePage,
	deleteRole,
	generateEmployeeQr,
	getAccessLog,
	getAssignableRoles,
	getEmployees,
	getModules,
	getPages,
	getPermissionGrants,
	getRoleGrants,
	getRoles,
	getScreens,
	searchEmployees,
	updateEmployee,
	updatePage,
	updateRole,
	updateRoleGrants,
	updateRolePermissions,
	updateScreen,
	updateScreenRoles,
} from "./fetchers";

export const setupKeys = {
	modules: () => ["setup", "modules"] as const,
	employees: (params?: EmployeeListParams) =>
		params
			? (["setup", "employees", params] as const)
			: (["setup", "employees"] as const),
	employeeSearch: (params: Omit<EmployeeSearchParams, "page">) =>
		["setup", "employees", "search", params] as const,
	roles: (params?: RoleListParams) =>
		params
			? (["setup", "roles", params] as const)
			: (["setup", "roles"] as const),
	pages: (params?: PageListParams) =>
		params
			? (["setup", "pages", params] as const)
			: (["setup", "pages"] as const),
	permissionGrants: () => ["setup", "permissions"] as const,
	roleGrants: (id: number) => ["setup", "role-grants", id] as const,
	screens: () => ["setup", "screens"] as const,
	accessLog: (params?: AccessLogListParams) =>
		params
			? (["setup", "access-log", params] as const)
			: (["setup", "access-log"] as const),
	assignableRoles: () => ["setup", "assignable-roles"] as const,
};

const errorMessage = setupErrorMessage;

// Roles/Employees/Pages/Modules are cross-referenced by nearly every Setup tab
// (e.g. EmployeeTable resolves role names, RoleTable counts employees,
// PermissionsTab joins all four) — a short staleTime avoids a refetch storm
// every time a tab remounts.
const REFERENCE_STALE_TIME_MS = 60_000;

// ---- modules ----

export function useModulesQuery() {
	return useQuery({
		queryKey: setupKeys.modules(),
		queryFn: getModules,
		staleTime: REFERENCE_STALE_TIME_MS,
	});
}

// ---- employees ----

export function useEmployeesQuery(params?: EmployeeListParams) {
	return useQuery({
		queryKey: setupKeys.employees(params),
		queryFn: () => getEmployees(params),
		staleTime: REFERENCE_STALE_TIME_MS,
		// keep showing the previous page's rows while the next page loads, instead of
		// flashing the table to a loading state on every page/sort change
		placeholderData: params ? keepPreviousData : undefined,
	});
}

export function useCreateEmployeeMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (input: EmployeeInput) => createEmployee(input),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: setupKeys.employees() });
			await queryClient.invalidateQueries({ queryKey: ACCESS_LOG_KEY });
			toast.success("Employee created");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to create employee"));
		},
	});
}

export function useUpdateEmployeeMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, input }: { id: number; input: EmployeeInput }) =>
			updateEmployee(id, input),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: setupKeys.employees() });
			await queryClient.invalidateQueries({ queryKey: ACCESS_LOG_KEY });
			toast.success("Employee updated");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to update employee"));
		},
	});
}

export function useDeleteEmployeeMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: number) => deleteEmployee(id),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: setupKeys.employees() });
			await queryClient.invalidateQueries({ queryKey: ACCESS_LOG_KEY });
			toast.success("Employee deleted");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to delete employee"));
		},
	});
}

export function useGenerateEmployeeQrMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: number) => generateEmployeeQr(id),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: setupKeys.employees() });
			await queryClient.invalidateQueries({ queryKey: ACCESS_LOG_KEY });
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to generate QR token"));
		},
	});
}

// Debounced name search with page-based infinite scroll (EmployeeCombobox). `q`/`pageSize`
// define the query identity; `page` is TanStack's own pageParam, not part of the key.
// Disabled until a search term exists — no fetch just from the combobox mounting/focusing.
export function useEmployeeSearchQuery(q: string, pageSize: number) {
	const trimmed = q.trim();

	return useInfiniteQuery({
		queryKey: setupKeys.employeeSearch({ q: trimmed, pageSize }),
		queryFn: ({ pageParam }) =>
			searchEmployees({ q: trimmed, page: pageParam, pageSize }),
		initialPageParam: 1,
		getNextPageParam: (lastPage) =>
			lastPage.meta.page < lastPage.meta.totalPages
				? lastPage.meta.page + 1
				: undefined,
		staleTime: REFERENCE_STALE_TIME_MS,
		enabled: trimmed.length > 0,
	});
}

// ---- roles ----

export function useRolesQuery(params?: RoleListParams) {
	return useQuery({
		queryKey: setupKeys.roles(params),
		queryFn: () => getRoles(params),
		staleTime: REFERENCE_STALE_TIME_MS,
		placeholderData: params ? keepPreviousData : undefined,
	});
}

export function useCreateRoleMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (input: RoleInput) => createRole(input),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: setupKeys.roles() });
			await queryClient.invalidateQueries({ queryKey: ACCESS_LOG_KEY });
			await queryClient.invalidateQueries({
				queryKey: setupKeys.assignableRoles(),
			});
			toast.success("Role created");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to create role"));
		},
	});
}

export function useUpdateRoleMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, input }: { id: number; input: RoleInput }) =>
			updateRole(id, input),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: setupKeys.roles() });
			await queryClient.invalidateQueries({ queryKey: ACCESS_LOG_KEY });
			await queryClient.invalidateQueries({
				queryKey: setupKeys.assignableRoles(),
			});
			toast.success("Role updated");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to update role"));
		},
	});
}

export function useDeleteRoleMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: number) => deleteRole(id),
		onSuccess: async (_data, id) => {
			queryClient.removeQueries({ queryKey: setupKeys.roleGrants(id) });
			await queryClient.invalidateQueries({ queryKey: setupKeys.roles() });
			await queryClient.invalidateQueries({ queryKey: ACCESS_LOG_KEY });
			await queryClient.invalidateQueries({
				queryKey: setupKeys.assignableRoles(),
			});
			toast.success("Role deleted");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to delete role"));
		},
	});
}

// ---- pages ----

export function usePagesQuery(params?: PageListParams) {
	return useQuery({
		queryKey: setupKeys.pages(params),
		queryFn: () => getPages(params),
		staleTime: REFERENCE_STALE_TIME_MS,
		placeholderData: params ? keepPreviousData : undefined,
	});
}

export function useCreatePageMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (input: PageInput) => createPage(input),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: setupKeys.pages() });
			toast.success("Page created");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to create page"));
		},
	});
}

export function useUpdatePageMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, input }: { id: number; input: PageInput }) =>
			updatePage(id, input),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: setupKeys.pages() });
			toast.success("Page updated");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to update page"));
		},
	});
}

export function useDeletePageMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: number) => deletePage(id),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: setupKeys.pages() });
			toast.success("Page deleted");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to delete page"));
		},
	});
}

// ---- permissions ----

export function usePermissionGrantsQuery() {
	return useQuery({
		queryKey: setupKeys.permissionGrants(),
		queryFn: getPermissionGrants,
	});
}

export function useUpdateRolePermissionsMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			roleId,
			diff,
		}: {
			roleId: number;
			diff: RolePermissionDiff;
		}) => updateRolePermissions(roleId, diff),
		onMutate: async ({ roleId, diff }) => {
			await queryClient.cancelQueries({
				queryKey: setupKeys.permissionGrants(),
			});

			const previous = queryClient.getQueryData<{ data: RolePage[] }>(
				setupKeys.permissionGrants(),
			);

			if (previous) {
				const addedPageIds = Object.values(diff).flatMap((d) => d.added);
				const deletedPageIds = Object.values(diff).flatMap((d) => d.deleted);

				const next = previous.data
					.filter(
						(grant) =>
							!(
								grant.roleId === roleId && deletedPageIds.includes(grant.pageId)
							),
					)
					.concat(addedPageIds.map((pageId) => ({ roleId, pageId })));

				queryClient.setQueryData(setupKeys.permissionGrants(), {
					data: next,
				});
			}

			return { previous };
		},
		onError: (error, _variables, context) => {
			if (context?.previous) {
				queryClient.setQueryData(
					setupKeys.permissionGrants(),
					context.previous,
				);
			}
			toast.error(errorMessage(error, "Failed to update permissions"));
		},
		onSuccess: () => {
			toast.success("Permissions updated");
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: setupKeys.permissionGrants() });
		},
	});
}

// ---- S6: role editor, screens, access log, role assignment ----

const ACCESS_LOG_KEY = ["setup", "access-log"] as const;

export function useCopyRoleMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, input }: { id: number; input: RoleInput }) =>
			copyRole(id, input),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: setupKeys.roles() });
			await queryClient.invalidateQueries({
				queryKey: setupKeys.assignableRoles(),
			});
			await queryClient.invalidateQueries({ queryKey: ACCESS_LOG_KEY });
			toast.success("Role copied");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to copy role"));
		},
	});
}

export function useRoleGrantsQuery(id: number | null) {
	return useQuery({
		queryKey: setupKeys.roleGrants(id ?? 0),
		queryFn: () => getRoleGrants(id as number),
		enabled: id !== null,
	});
}

export function useUpdateRoleGrantsMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, diff }: { id: number; diff: RoleGrantsDiff }) =>
			updateRoleGrants(id, diff),
		onSuccess: async (_data, { id }) => {
			await queryClient.invalidateQueries({
				queryKey: setupKeys.roleGrants(id),
			});
			await queryClient.invalidateQueries({ queryKey: setupKeys.roles() });
			await queryClient.invalidateQueries({ queryKey: setupKeys.screens() });
			await queryClient.invalidateQueries({ queryKey: ACCESS_LOG_KEY });
			await queryClient.invalidateQueries({ queryKey: authKeys.me() });
			toast.success("Access saved");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to save access"));
		},
	});
}

export function useScreensQuery() {
	return useQuery({ queryKey: setupKeys.screens(), queryFn: getScreens });
}

export function useUpdateScreenMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ key, input }: { key: string; input: ScreenUpdateInput }) =>
			updateScreen(key, input),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: setupKeys.screens() });
			await queryClient.invalidateQueries({ queryKey: ACCESS_LOG_KEY });
			toast.success("Screen updated");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to update screen"));
		},
	});
}

export function useUpdateScreenRolesMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ key, diff }: { key: string; diff: ScreenRolesDiff }) =>
			updateScreenRoles(key, diff),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: setupKeys.screens() });
			await queryClient.invalidateQueries({ queryKey: setupKeys.roles() });
			await queryClient.invalidateQueries({ queryKey: ACCESS_LOG_KEY });
			await queryClient.invalidateQueries({ queryKey: authKeys.me() });
			toast.success("Screen access updated");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to update screen access"));
		},
	});
}

export function useAccessLogQuery(params: AccessLogListParams) {
	return useQuery({
		queryKey: setupKeys.accessLog(params),
		queryFn: () => getAccessLog(params),
		placeholderData: keepPreviousData,
	});
}

export function useAssignableRolesQuery() {
	return useQuery({
		queryKey: setupKeys.assignableRoles(),
		queryFn: getAssignableRoles,
		staleTime: REFERENCE_STALE_TIME_MS,
	});
}

export function useAssignEmployeeRoleMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, roleId }: { id: number; roleId: number }) =>
			assignEmployeeRole(id, roleId),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: setupKeys.employees() });
			await queryClient.invalidateQueries({ queryKey: setupKeys.roles() });
			await queryClient.invalidateQueries({ queryKey: ACCESS_LOG_KEY });
			await queryClient.invalidateQueries({ queryKey: authKeys.me() });
			toast.success("Role changed");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to change role"));
		},
	});
}
