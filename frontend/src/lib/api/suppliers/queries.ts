"use client";

import {
	keepPreviousData,
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { ApiClientError } from "@/lib/api/client";
import type {
	AssetLookupParams,
	BatchRowResult,
	SupplierCreatePayload,
	SupplierHistoryParams,
	SupplierItemCreatePayload,
	SupplierItemEditPayload,
	SupplierListParams,
	SupplierMasterUpdatePayload,
	SupplierOfferingListParams,
	SupplierServiceCreatePayload,
	SupplierServiceEditPayload,
} from "@/types/suppliers";

import {
	createSupplier,
	createSupplierItem,
	createSupplierService,
	editSupplierItem,
	editSupplierService,
	getAssetItems,
	getAssetServices,
	getSupplierDetail,
	getSupplierHistory,
	getSupplierItems,
	getSupplierServices,
	getSuppliers,
	updateSupplierMaster,
} from "./fetchers";

export const suppliersKeys = {
	cards: (params?: SupplierListParams) =>
		params
			? (["suppliers", "cards", params] as const)
			: (["suppliers", "cards"] as const),
	detail: (supplierId: number) => ["suppliers", "detail", supplierId] as const,
	items: (supplierId: number, params?: SupplierOfferingListParams) =>
		params
			? (["suppliers", supplierId, "items", params] as const)
			: (["suppliers", supplierId, "items"] as const),
	services: (supplierId: number, params?: SupplierOfferingListParams) =>
		params
			? (["suppliers", supplierId, "services", params] as const)
			: (["suppliers", supplierId, "services"] as const),
	history: (supplierId: number, params?: SupplierHistoryParams) =>
		params
			? (["suppliers", supplierId, "history", params] as const)
			: (["suppliers", supplierId, "history"] as const),
	supplierLookup: (params: Omit<AssetLookupParams, "page">) =>
		["suppliers", "lookup", params] as const,
	assetItemsLookup: (params: Omit<AssetLookupParams, "page">) =>
		["suppliers", "asset-items", params] as const,
	assetServicesLookup: (params: Omit<AssetLookupParams, "page">) =>
		["suppliers", "asset-services", params] as const,
};

// A failed batch (400 BATCH_FAILED) carries one row per input row, with the
// reason on the rows that failed. Nothing was saved (BR-SUP-21).
export function getBatchFailures(error: unknown): BatchRowResult<unknown>[] {
	if (!(error instanceof ApiClientError)) return [];
	const body = error.body as { data?: unknown } | null;
	if (!body || !Array.isArray(body.data)) return [];
	return (body.data as BatchRowResult<unknown>[]).filter(
		(row) => row.success === false,
	);
}

function errorMessage(error: unknown, fallback: string) {
	const failures = getBatchFailures(error);
	if (failures.length > 0) {
		return failures
			.map(
				(row) => `Row ${row.index + 1}: ${row.error ?? "could not be saved"}`,
			)
			.join("; ");
	}
	return error instanceof ApiClientError ? error.message : fallback;
}

function invalidateHistory(
	queryClient: ReturnType<typeof useQueryClient>,
	supplierId: number,
) {
	return queryClient.invalidateQueries({
		queryKey: suppliersKeys.history(supplierId),
	});
}

export function useSupplierHistoryQuery(
	supplierId: number,
	params: SupplierHistoryParams,
	enabled = true,
) {
	return useQuery({
		queryKey: suppliersKeys.history(supplierId, params),
		queryFn: () => getSupplierHistory(supplierId, params),
		enabled: supplierId > 0 && enabled,
		placeholderData: keepPreviousData,
	});
}

function normalize(value?: string | null) {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

export function useSuppliersQuery(params: SupplierListParams) {
	return useQuery({
		queryKey: suppliersKeys.cards(params),
		queryFn: () => getSuppliers(params),
		placeholderData: keepPreviousData,
	});
}

export function useSupplierLookupQuery(q: string, pageSize: number) {
	const trimmed = q.trim();
	return useInfiniteQuery({
		queryKey: suppliersKeys.supplierLookup({ q: trimmed, pageSize }),
		queryFn: ({ pageParam }) =>
			getSuppliers({
				q: trimmed,
				page: pageParam,
				pageSize,
				sortBy: "name",
				sortDir: "asc",
			}),
		initialPageParam: 1,
		getNextPageParam: (lastPage) =>
			lastPage.meta.page < lastPage.meta.totalPages
				? lastPage.meta.page + 1
				: undefined,
		enabled: trimmed.length > 0,
	});
}

export function useCreateSupplierMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (payload: SupplierCreatePayload) => createSupplier(payload),
		onSuccess: async (result) => {
			if (!result.success) {
				toast.error(result.message || "Failed to create supplier");
				return;
			}
			await queryClient.invalidateQueries({ queryKey: suppliersKeys.cards() });
			toast.success(result.message || "Supplier created");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to create supplier"));
		},
	});
}

export function useSupplierDetailQuery(supplierId: number) {
	return useQuery({
		queryKey: suppliersKeys.detail(supplierId),
		queryFn: () => getSupplierDetail(supplierId),
		enabled: Number.isFinite(supplierId) && supplierId > 0,
	});
}

export function useUpdateSupplierMasterMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			supplierId,
			payload,
		}: {
			supplierId: number;
			payload: SupplierMasterUpdatePayload;
		}) => updateSupplierMaster(supplierId, payload),
		onSuccess: async (result, variables) => {
			if (!result.success) {
				toast.error(result.message || "Failed to update supplier");
				return;
			}
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: suppliersKeys.cards() }),
				queryClient.invalidateQueries({
					queryKey: suppliersKeys.detail(variables.supplierId),
				}),
				invalidateHistory(queryClient, variables.supplierId),
			]);
			toast.success(result.message || "Supplier updated");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to update supplier"));
		},
	});
}

export function useSupplierItemsQuery(
	supplierId: number,
	params: SupplierOfferingListParams,
	enabled = true,
) {
	return useQuery({
		queryKey: suppliersKeys.items(supplierId, params),
		queryFn: () => getSupplierItems(supplierId, params),
		enabled: supplierId > 0 && enabled,
		placeholderData: keepPreviousData,
	});
}

export function useSupplierServicesQuery(
	supplierId: number,
	params: SupplierOfferingListParams,
	enabled = true,
) {
	return useQuery({
		queryKey: suppliersKeys.services(supplierId, params),
		queryFn: () => getSupplierServices(supplierId, params),
		enabled: supplierId > 0 && enabled,
		placeholderData: keepPreviousData,
	});
}

export function useAssetItemsLookupQuery(q: string, pageSize: number) {
	const trimmed = q.trim();
	return useInfiniteQuery({
		queryKey: suppliersKeys.assetItemsLookup({ q: trimmed, pageSize }),
		queryFn: ({ pageParam }) =>
			getAssetItems({ q: trimmed, page: pageParam, pageSize }),
		initialPageParam: 1,
		getNextPageParam: (lastPage) =>
			lastPage.meta.page < lastPage.meta.totalPages
				? lastPage.meta.page + 1
				: undefined,
		enabled: trimmed.length > 0,
	});
}

export function useAssetServicesLookupQuery(q: string, pageSize: number) {
	const trimmed = q.trim();
	return useInfiniteQuery({
		queryKey: suppliersKeys.assetServicesLookup({ q: trimmed, pageSize }),
		queryFn: ({ pageParam }) =>
			getAssetServices({ q: trimmed, page: pageParam, pageSize }),
		initialPageParam: 1,
		getNextPageParam: (lastPage) =>
			lastPage.meta.page < lastPage.meta.totalPages
				? lastPage.meta.page + 1
				: undefined,
		enabled: trimmed.length > 0,
	});
}

export function useCreateSupplierItemMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			supplierId,
			payload,
		}: {
			supplierId: number;
			payload: SupplierItemCreatePayload;
		}) => createSupplierItem(supplierId, payload),
		onSuccess: async (result, variables) => {
			if (!result.success) {
				toast.error(result.message || "Failed to add item");
				return;
			}
			await queryClient.invalidateQueries({
				queryKey: suppliersKeys.items(variables.supplierId),
			});
			toast.success(result.message || "Item added");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to add item"));
		},
	});
}

export function useEditSupplierItemMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			supplierId,
			payload,
		}: {
			supplierId: number;
			payload: SupplierItemEditPayload | SupplierItemEditPayload[];
		}) => editSupplierItem(supplierId, payload),
		onSuccess: async (result, variables) => {
			if (!result.success) {
				toast.error(result.message || "Failed to update item");
				return;
			}
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: suppliersKeys.items(variables.supplierId),
				}),
				invalidateHistory(queryClient, variables.supplierId),
			]);
			toast.success(
				Array.isArray(variables.payload)
					? `${result.summary.success} rows saved`
					: "Item updated",
			);
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to update item"));
		},
	});
}

export function useCreateSupplierServiceMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			supplierId,
			payload,
		}: {
			supplierId: number;
			payload: SupplierServiceCreatePayload;
		}) => createSupplierService(supplierId, payload),
		onSuccess: async (result, variables) => {
			if (!result.success) {
				toast.error(result.message || "Failed to add service");
				return;
			}
			await queryClient.invalidateQueries({
				queryKey: suppliersKeys.services(variables.supplierId),
			});
			toast.success(result.message || "Service added");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to add service"));
		},
	});
}

export function useEditSupplierServiceMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			supplierId,
			payload,
		}: {
			supplierId: number;
			payload: SupplierServiceEditPayload | SupplierServiceEditPayload[];
		}) => editSupplierService(supplierId, payload),
		onSuccess: async (result, variables) => {
			if (!result.success) {
				toast.error(result.message || "Failed to update service");
				return;
			}
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: suppliersKeys.services(variables.supplierId),
				}),
				invalidateHistory(queryClient, variables.supplierId),
			]);
			toast.success(
				Array.isArray(variables.payload)
					? `${result.summary.success} rows saved`
					: "Service updated",
			);
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to update service"));
		},
	});
}

export function toSupplierCreatePayload(input: {
	name: string;
	type?: string;
	gstNumber?: string;
	panNumber?: string;
	contactPerson?: string;
	email?: string;
	phone?: string;
	address?: string;
	defaultPaymentTermsDays?: number;
	isActive: boolean;
}): SupplierCreatePayload {
	return {
		name: input.name,
		type: input.type as SupplierCreatePayload["type"],
		gstNumber: normalize(input.gstNumber)?.toUpperCase(),
		panNumber: normalize(input.panNumber)?.toUpperCase(),
		contactPerson: normalize(input.contactPerson),
		email: normalize(input.email),
		phone: normalize(input.phone),
		address: normalize(input.address),
		defaultPaymentTermsDays: input.defaultPaymentTermsDays,
		isActive: input.isActive,
	};
}

export function toSupplierMasterUpdatePayload(input: {
	name: string;
	type?: string;
	gstNumber?: string;
	panNumber?: string;
	contactPerson?: string;
	email?: string;
	phone?: string;
	address?: string;
	defaultPaymentTermsDays?: number;
	isActive: boolean;
}): SupplierMasterUpdatePayload {
	return {
		mode: "master",
		name: normalize(input.name),
		type: input.type as SupplierMasterUpdatePayload["type"],
		gstNumber: normalize(input.gstNumber)?.toUpperCase() ?? null,
		panNumber: normalize(input.panNumber)?.toUpperCase() ?? null,
		contactPerson: normalize(input.contactPerson) ?? null,
		email: normalize(input.email) ?? null,
		phone: normalize(input.phone) ?? null,
		address: normalize(input.address) ?? null,
		defaultPaymentTermsDays: input.defaultPaymentTermsDays,
		isActive: input.isActive,
	};
}
