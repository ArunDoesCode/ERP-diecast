"use client";

import {
	keepPreviousData,
	type QueryClient,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { ApiClientError } from "@/lib/api/client";
import type {
	StCreatePayload,
	StListParams,
	StReversePayload,
	StUpdatePayload,
} from "@/types/stock-transfer";

import {
	cancelStockTransfer,
	createStockTransfer,
	getStockTransfer,
	getStockTransfers,
	postStockTransfer,
	reverseStockTransfer,
	updateStockTransfer,
} from "./fetchers";

export const stockTransferKeys = {
	all: ["stock-transfers"] as const,
	lists: () => ["stock-transfers", "list"] as const,
	list: (params?: StListParams) =>
		["stock-transfers", "list", params ?? {}] as const,
	detail: (id: number) => ["stock-transfers", "detail", id] as const,
};

/** Stock only moves on post and reverse: refresh stock balances and movements then. */
function invalidateAfterTransfer(
	queryClient: QueryClient,
	opts: { stock?: boolean } = {},
) {
	void queryClient.invalidateQueries({ queryKey: stockTransferKeys.all });
	if (opts.stock) {
		void queryClient.invalidateQueries({ queryKey: ["assets", "stock"] });
		void queryClient.invalidateQueries({ queryKey: ["assets", "movements"] });
		void queryClient.invalidateQueries({
			queryKey: ["assets", "reconciliation"],
		});
	}
}

/** Plain words per error code; the server text is the fallback. */
export function stErrorMessage(error: unknown, fallback: string) {
	if (!(error instanceof ApiClientError)) return fallback;
	switch (error.code) {
		case "STR_NOT_DRAFT":
			return "Only a draft can be changed. Reload to see the latest.";
		case "STR_NOT_POSTED":
			return "Only a posted transfer can be reversed. Reload to see the latest.";
		case "STR_RETRY":
			return "The stock was busy. Please try again.";
		default:
			return error.message || fallback;
	}
}

export function useStockTransfersQuery(params: StListParams, enabled = true) {
	return useQuery({
		queryKey: stockTransferKeys.list(params),
		queryFn: () => getStockTransfers(params),
		placeholderData: keepPreviousData,
		enabled,
	});
}

export function useStockTransferQuery(id: number | undefined) {
	return useQuery({
		queryKey: stockTransferKeys.detail(id ?? 0),
		queryFn: () => getStockTransfer(id as number),
		enabled: id !== undefined && id > 0,
	});
}

export function useCreateStockTransferMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: StCreatePayload) => createStockTransfer(payload),
		onSuccess: () => {
			invalidateAfterTransfer(queryClient);
			toast.success("Draft transfer saved");
		},
		// 400 / 409 are shown by the form.
	});
}

export function useUpdateStockTransferMutation(id: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: StUpdatePayload) => updateStockTransfer(id, payload),
		onSuccess: () => {
			invalidateAfterTransfer(queryClient);
			toast.success("Transfer saved");
		},
	});
}

export function usePostStockTransferMutation(id: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => postStockTransfer(id),
		onSuccess: () => {
			invalidateAfterTransfer(queryClient, { stock: true });
			toast.success("Transfer posted");
		},
		// The dialog shows the error text.
	});
}

export function useCancelStockTransferMutation(id: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => cancelStockTransfer(id),
		onSuccess: () => {
			invalidateAfterTransfer(queryClient);
			toast.success("Transfer cancelled");
		},
	});
}

export function useReverseStockTransferMutation(id: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: StReversePayload) =>
			reverseStockTransfer(id, payload),
		onSuccess: () => {
			invalidateAfterTransfer(queryClient, { stock: true });
			toast.success("Transfer reversed");
		},
	});
}
