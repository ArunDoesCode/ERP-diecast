"use client";

import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { assetKeys } from "@/lib/api/asset/queries";
import { ApiClientError } from "@/lib/api/client";
import {
	purchaseOrderKeys,
	usePurchaseOrderDetailQuery,
} from "@/lib/api/purchase-orders/queries";
import type {
	GrnBypassPayload,
	GrnCreatePayload,
	GrnListParams,
	GrnQaDecisionPayload,
	GrnUpdatePayload,
} from "@/types/grn";

import {
	bypassGrnLineQa,
	correctGrnLine,
	createGrn,
	decideGrnLineQa,
	deleteGrn,
	getGrnById,
	getGrns,
	updateGrn,
} from "./fetchers";

export const grnKeys = {
	list: (params?: GrnListParams) =>
		params ? (["grn", "list", params] as const) : (["grn", "list"] as const),
	detail: (grnId: number) => ["grn", "detail", grnId] as const,
};

function errorMessage(error: unknown, fallback: string) {
	return error instanceof ApiClientError ? error.message : fallback;
}

export function useGrnsQuery(params: GrnListParams) {
	return useQuery({
		queryKey: grnKeys.list(params),
		queryFn: () => getGrns(params),
		placeholderData: keepPreviousData,
	});
}

export function useGrnDetailQuery(grnId: number, enabled: boolean) {
	return useQuery({
		queryKey: grnKeys.detail(grnId),
		queryFn: () => getGrnById(grnId),
		enabled: enabled && Number.isFinite(grnId) && grnId > 0,
	});
}

export function useCreateGrnMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (payload: GrnCreatePayload) => createGrn(payload),
		onSuccess: async (result) => {
			if (!result.success) {
				toast.error(result.message || "Failed to create GRN");
				return;
			}

			await Promise.all([
				queryClient.invalidateQueries({ queryKey: grnKeys.list() }),
				...(result.data.grn.poId != null
					? [
							queryClient.invalidateQueries({
								queryKey: purchaseOrderKeys.detail(result.data.grn.poId),
							}),
						]
					: []),
			]);
			toast.success(result.message || `${result.data.grn.grnNumber} created`);
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to create GRN"));
		},
	});
}

export function useUpdateGrnMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (payload: GrnUpdatePayload) => updateGrn(payload),
		onSuccess: async (result, variables) => {
			if (!result.success) {
				toast.error(result.message || "Failed to update GRN");
				return;
			}

			await Promise.all([
				queryClient.invalidateQueries({ queryKey: grnKeys.list() }),
				queryClient.invalidateQueries({
					queryKey: grnKeys.detail(variables.grnId),
				}),
			]);
			toast.success(result.message || `${result.data.grn.grnNumber} updated`);
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to update GRN"));
		},
	});
}

export function useDeleteGrnMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (grnId: number) => deleteGrn(grnId),
		onSuccess: async (result) => {
			if (!result.success) {
				toast.error(result.message || "Failed to delete GRN");
				return;
			}

			await queryClient.invalidateQueries({ queryKey: grnKeys.list() });
			toast.success(result.message || "GRN deleted");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to delete GRN"));
		},
	});
}

function invalidateGrnAndPO(
	queryClient: ReturnType<typeof useQueryClient>,
	grnId: number,
	poId: number,
) {
	return Promise.all([
		queryClient.invalidateQueries({ queryKey: grnKeys.list() }),
		queryClient.invalidateQueries({ queryKey: grnKeys.detail(grnId) }),
		// Stock and moving average change on QA/bypass/correction postings.
		queryClient.invalidateQueries({ queryKey: assetKeys.items() }),
		queryClient.invalidateQueries({ queryKey: assetKeys.stock() }),
		queryClient.invalidateQueries({ queryKey: assetKeys.movements() }),
		queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.cards() }),
		queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.detail(poId) }),
		// A QA accept/bypass rolls the PO's receipt status forward server-side,
		// which can in turn flip the PO's parent PR's own status. Nothing in the
		// GRN data model carries that PR's id to invalidate it precisely, so
		// invalidate every cached PR detail rather than leave one silently stale.
		queryClient.invalidateQueries({
			queryKey: ["purchase-requisitions", "detail"],
		}),
	]);
}

export function useGrnQaDecisionMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (variables: {
			grnId: number;
			lineId: number;
			poId: number;
			payload: GrnQaDecisionPayload;
		}) => decideGrnLineQa(variables.grnId, variables.lineId, variables.payload),
		onSuccess: async (result, variables) => {
			if (!result.success) {
				toast.error(result.message || "Failed to record QA decision");
				return;
			}

			await invalidateGrnAndPO(queryClient, variables.grnId, variables.poId);
			toast.success(result.message || "QA decision recorded");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to record QA decision"));
		},
	});
}

export function useGrnBypassMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (variables: {
			grnId: number;
			lineId: number;
			poId: number;
			payload: GrnBypassPayload;
		}) => bypassGrnLineQa(variables.grnId, variables.lineId, variables.payload),
		onSuccess: async (result, variables) => {
			if (!result.success) {
				toast.error(result.message || "Failed to bypass QA");
				return;
			}

			await invalidateGrnAndPO(queryClient, variables.grnId, variables.poId);
			toast.success(result.message || "QA bypassed");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to bypass QA"));
		},
	});
}

export function useGrnCorrectionMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (variables: {
			grnId: number;
			lineId: number;
			poId: number;
			payload: { qty: number; reason: string };
		}) => correctGrnLine(variables.grnId, variables.lineId, variables.payload),
		onSuccess: async (result, variables) => {
			if (!result.success) {
				toast.error(result.message || "Failed to correct GRN line");
				return;
			}

			await invalidateGrnAndPO(queryClient, variables.grnId, variables.poId);
			toast.success(result.message || "Correction recorded");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to correct GRN line"));
		},
	});
}

/** poItemId -> uom, from the PO detail (GRN lines carry no uom). */
export function usePoItemUoms(poId: number, enabled: boolean) {
	const query = usePurchaseOrderDetailQuery(poId, enabled);
	const items = query.data?.success ? query.data.data.items : [];
	return new Map(items.map((item) => [item.id, item.uom]));
}
