"use client";

import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { ApiClientError } from "@/lib/api/client";
import type {
	AssetItemCreatePayload,
	AssetItemListParams,
	AssetItemUpdatePayload,
	AssetLocationCreatePayload,
	AssetLocationListParams,
	AssetLocationUpdatePayload,
	AssetMachineCreatePayload,
	AssetMachineListParams,
	AssetMachineUpdatePayload,
	AssetMovementCreatePayload,
	AssetMovementListParams,
	AssetServiceCreatePayload,
	AssetServiceListParams,
	AssetServiceUpdatePayload,
} from "@/types/asset";

import {
	createItem,
	createLocation,
	createMachine,
	createMovement,
	createService,
	getItems,
	getLocations,
	getMachines,
	getMovements,
	getServices,
	updateItem,
	updateLocation,
	updateMachine,
	updateService,
} from "./fetchers";

export const assetKeys = {
	machines: (params?: AssetMachineListParams) =>
		params
			? (["assets", "machines", params] as const)
			: (["assets", "machines"] as const),
	locations: (params?: AssetLocationListParams) =>
		params
			? (["assets", "locations", params] as const)
			: (["assets", "locations"] as const),
	movements: (params?: AssetMovementListParams) =>
		params
			? (["assets", "movements", params] as const)
			: (["assets", "movements"] as const),
	items: (params?: AssetItemListParams) =>
		params
			? (["assets", "items", params] as const)
			: (["assets", "items"] as const),
	services: (params?: AssetServiceListParams) =>
		params
			? (["assets", "services", params] as const)
			: (["assets", "services"] as const),
};

function errorMessage(error: unknown, fallback: string) {
	return error instanceof ApiClientError ? error.message : fallback;
}

export function useMachinesQuery(params?: AssetMachineListParams) {
	return useQuery({
		queryKey: assetKeys.machines(params),
		queryFn: () => getMachines(params),
		placeholderData: keepPreviousData,
	});
}

export function useCreateMachineMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (payload: AssetMachineCreatePayload) => createMachine(payload),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: assetKeys.machines() });
			toast.success("Machine created");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to create machine"));
		},
	});
}

export function useUpdateMachineMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			machineId,
			payload,
		}: {
			machineId: number;
			payload: AssetMachineUpdatePayload;
		}) => updateMachine(machineId, payload),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: assetKeys.machines() });
			toast.success("Machine updated");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to update machine"));
		},
	});
}

export function useLocationsQuery(params?: AssetLocationListParams) {
	return useQuery({
		queryKey: assetKeys.locations(params),
		queryFn: () => getLocations(params),
		placeholderData: keepPreviousData,
	});
}

export function useCreateLocationMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (payload: AssetLocationCreatePayload) =>
			createLocation(payload),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: assetKeys.locations() });
			toast.success("Location created");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to create location"));
		},
	});
}

export function useUpdateLocationMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			locationId,
			payload,
		}: {
			locationId: number;
			payload: AssetLocationUpdatePayload;
		}) => updateLocation(locationId, payload),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: assetKeys.locations() });
			toast.success("Location updated");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to update location"));
		},
	});
}

export function useMovementsQuery(params?: AssetMovementListParams) {
	return useQuery({
		queryKey: assetKeys.movements(params),
		queryFn: () => getMovements(params),
		placeholderData: keepPreviousData,
	});
}

export function useCreateMovementMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (payload: AssetMovementCreatePayload) =>
			createMovement(payload),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: assetKeys.movements() });
			toast.success("Movement created");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to create movement"));
		},
	});
}

export function useItemsQuery(params?: AssetItemListParams) {
	return useQuery({
		queryKey: assetKeys.items(params),
		queryFn: () => getItems(params),
		placeholderData: keepPreviousData,
	});
}

export function useCreateItemMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (payload: AssetItemCreatePayload) => createItem(payload),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: assetKeys.items() });
			toast.success("Item created");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to create item"));
		},
	});
}

export function useUpdateItemMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			itemId,
			payload,
		}: {
			itemId: number;
			payload: AssetItemUpdatePayload;
		}) => updateItem(itemId, payload),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: assetKeys.items() });
			toast.success("Item updated");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to update item"));
		},
	});
}

export function useServicesQuery(params?: AssetServiceListParams) {
	return useQuery({
		queryKey: assetKeys.services(params),
		queryFn: () => getServices(params),
		placeholderData: keepPreviousData,
	});
}

export function useCreateServiceMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (payload: AssetServiceCreatePayload) => createService(payload),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: assetKeys.services() });
			toast.success("Service created");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to create service"));
		},
	});
}

export function useUpdateServiceMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			serviceId,
			payload,
		}: {
			serviceId: number;
			payload: AssetServiceUpdatePayload;
		}) => updateService(serviceId, payload),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: assetKeys.services() });
			toast.success("Service updated");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to update service"));
		},
	});
}
