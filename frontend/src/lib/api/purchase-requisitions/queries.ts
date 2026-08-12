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
	PRCreatePayload,
	PRUpdatePayload,
	PurchaseRequisitionListParams,
} from "@/types/purchase-requisitions";

import {
	createPurchaseRequisition,
	deletePurchaseRequisition,
	getPurchaseRequisitionById,
	getPurchaseRequisitions,
	updatePurchaseRequisition,
} from "./fetchers";

export const purchaseRequisitionKeys = {
	cards: (params?: PurchaseRequisitionListParams) =>
		params
			? (["purchase-requisitions", "cards", params] as const)
			: (["purchase-requisitions", "cards"] as const),
	detail: (prId: number) => ["purchase-requisitions", "detail", prId] as const,
};

function errorMessage(error: unknown, fallback: string) {
	return error instanceof ApiClientError ? error.message : fallback;
}

function normalize(value?: string | null) {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

export function usePurchaseRequisitionsQuery(
	params: PurchaseRequisitionListParams,
) {
	return useQuery({
		queryKey: purchaseRequisitionKeys.cards(params),
		queryFn: () => getPurchaseRequisitions(params),
		placeholderData: keepPreviousData,
	});
}

export function usePurchaseRequisitionDetailQuery(
	prId: number,
	enabled: boolean,
) {
	return useQuery({
		queryKey: purchaseRequisitionKeys.detail(prId),
		queryFn: () => getPurchaseRequisitionById(prId),
		enabled: enabled && Number.isFinite(prId) && prId > 0,
	});
}

export function useCreatePurchaseRequisitionMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (payload: PRCreatePayload) =>
			createPurchaseRequisition(payload),
		onSuccess: async (result) => {
			if (!result.success) {
				toast.error(result.message || "Failed to create PR");
				return;
			}
			await queryClient.invalidateQueries({
				queryKey: purchaseRequisitionKeys.cards(),
			});
			toast.success(result.message || "PR created");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to create PR"));
		},
	});
}

export function useUpdatePurchaseRequisitionMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (payload: PRUpdatePayload) =>
			updatePurchaseRequisition(payload),
		onSuccess: async (result, variables) => {
			if (!result.success) {
				toast.error(result.message || "Failed to update PR");
				return;
			}

			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: purchaseRequisitionKeys.cards(),
				}),
				queryClient.invalidateQueries({
					queryKey: purchaseRequisitionKeys.detail(variables.prId),
				}),
			]);
			toast.success(result.message || "PR updated");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to update PR"));
		},
	});
}

export function useDeletePurchaseRequisitionMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (prId: number) => deletePurchaseRequisition({ prId }),
		onSuccess: async (result, prId) => {
			if (!result.success) {
				toast.error(result.message || "Failed to cancel PR");
				return;
			}

			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: purchaseRequisitionKeys.cards(),
				}),
				queryClient.invalidateQueries({
					queryKey: purchaseRequisitionKeys.detail(prId),
				}),
			]);
			toast.success(result.message || "PR cancelled");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to cancel PR"));
		},
	});
}

export function toPRCreatePayload(input: {
	type: PRCreatePayload["type"];
	notes?: string;
	assetId?: number;
	items: Array<{
		itemId: number;
		requestedQty: number;
		uom: string;
		expectedDate?: string;
	}>;
}): PRCreatePayload {
	return {
		type: input.type,
		notes: normalize(input.notes),
		assetId: input.assetId,
		items: input.items.map((item) => ({
			itemId: item.itemId,
			requestedQty: item.requestedQty,
			uom: item.uom,
			expectedDate: normalize(item.expectedDate),
		})),
	};
}

export function toPRUpdatePayload(input: {
	prId: number;
	type: PRUpdatePayload["type"];
	saleOrderId: PRUpdatePayload["saleOrderId"];
	assetId: PRUpdatePayload["assetId"];
	status: PRUpdatePayload["status"];
	notes?: string;
	originalItems: Array<{
		id: number;
		itemId: number;
		requestedQty: number;
	}>;
	items: Array<{
		id?: number;
		itemId?: number;
		requestedQty?: number;
	}>;
}): PRUpdatePayload {
	const originalById = new Map(
		input.originalItems.map((item) => [item.id, item] as const),
	);
	const seenOriginalIds = new Set<number>();

	const inserts: PRUpdatePayload["inserts"] = [];
	const updates: PRUpdatePayload["updates"] = [];

	for (const item of input.items) {
		if (!item.id) {
			if (item.itemId && item.requestedQty != null) {
				inserts.push({
					itemId: item.itemId,
					requestedQty: item.requestedQty,
				});
			}
			continue;
		}

		const original = originalById.get(item.id);
		if (!original) {
			continue;
		}

		seenOriginalIds.add(item.id);
		const update: PRUpdatePayload["updates"][number] = { id: item.id };

		if (item.itemId != null && item.itemId !== original.itemId) {
			update.itemId = item.itemId;
		}

		if (
			item.requestedQty != null &&
			item.requestedQty !== original.requestedQty
		) {
			update.requestedQty = item.requestedQty;
		}

		if (update.itemId != null || update.requestedQty != null) {
			updates.push(update);
		}
	}

	const deletes: PRUpdatePayload["deletes"] = input.originalItems
		.filter((item) => !seenOriginalIds.has(item.id))
		.map((item) => ({ id: item.id }));

	return {
		prId: input.prId,
		type: input.type,
		saleOrderId: input.saleOrderId,
		assetId: input.assetId,
		status: input.status,
		notes: normalize(input.notes),
		inserts,
		updates,
		deletes,
	};
}
