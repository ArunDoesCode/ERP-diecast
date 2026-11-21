"use client";

import {
	keepPreviousData,
	type QueryClient,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { assetKeys } from "@/lib/api/asset/queries";
import { ApiClientError } from "@/lib/api/client";
import { grnKeys } from "@/lib/api/grn/queries";
import { purchaseOrderKeys } from "@/lib/api/purchase-orders/queries";
import type {
	PrtAwaitingParams,
	PrtCancelPayload,
	PrtCreatePayload,
	PrtDetail,
	PrtListParams,
	PrtUpdatePayload,
} from "@/types/purchase-return";

import {
	cancelPostedReturn,
	cancelReturnDraft,
	createPurchaseReturn,
	getAwaitingReturns,
	getPurchaseReturn,
	getPurchaseReturns,
	getReturnPrefill,
	postPurchaseReturn,
	updatePurchaseReturn,
} from "./fetchers";

export const purchaseReturnKeys = {
	all: ["purchase-returns"] as const,
	lists: () => ["purchase-returns", "list"] as const,
	list: (params?: PrtListParams) =>
		["purchase-returns", "list", params ?? {}] as const,
	awaiting: (params?: PrtAwaitingParams) =>
		["purchase-returns", "awaiting", params ?? {}] as const,
	detail: (id: number) => ["purchase-returns", "detail", id] as const,
	prefill: (grnId: number) => ["purchase-returns", "prefill", grnId] as const,
};

/**
 * A return changes GRN and PO quantities too (BR-PRT-38). The affected GRN and
 * PO ids come from the cached return detail; without it, fall back to the
 * detail prefixes. Stock only moves on post and cancel-posted.
 */
function invalidateAfterReturn(
	queryClient: QueryClient,
	opts: { id?: number; stock?: boolean } = {},
) {
	void queryClient.invalidateQueries({ queryKey: purchaseReturnKeys.all });
	void queryClient.invalidateQueries({ queryKey: grnKeys.list() });
	void queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.cards() });
	const cached =
		opts.id === undefined
			? undefined
			: queryClient.getQueryData<{ data: PrtDetail }>(
					purchaseReturnKeys.detail(opts.id),
				)?.data;
	void queryClient.invalidateQueries({
		queryKey: cached ? grnKeys.detail(cached.grnId) : ["grn", "detail"],
	});
	void queryClient.invalidateQueries({
		queryKey: cached
			? purchaseOrderKeys.detail(cached.poId)
			: ["purchase-orders", "detail"],
	});
	if (opts.stock) {
		void queryClient.invalidateQueries({ queryKey: assetKeys.stock() });
	}
}

export type PrtErrorDetails = {
	grnItemId?: number;
	source?: string;
	cap?: number;
	reserved?: number;
};

export function prtErrorDetails(error: unknown): PrtErrorDetails | undefined {
	if (!(error instanceof ApiClientError)) return undefined;
	const body = error.body;
	if (typeof body !== "object" || body === null) return undefined;
	const details = (body as { details?: unknown }).details;
	return typeof details === "object" && details !== null
		? (details as PrtErrorDetails)
		: undefined;
}

/** Plain words per error code (screens.md, Return detail). Server text is the fallback. */
export function prtErrorMessage(error: unknown, fallback: string) {
	if (!(error instanceof ApiClientError)) return fallback;
	switch (error.code) {
		case "PRT_NOT_EDITABLE":
		case "PRT_NOT_POSTED":
			return "Someone already changed this return. Reload to see it.";
		case "PRT_REPLACEMENT_PO_CLOSED":
			return "The PO is closed. Untick replacement expected.";
		case "PRT_COMPANY_SETTINGS_MISSING":
			return "Plant GSTIN is not set. Add it in company settings first.";
		case "PRT_HSN_MISSING":
			return "An item on this return has no HSN code. Add it in the item master first.";
		case "INSUFFICIENT_STOCK":
			return error.message || "Not enough stock to send this back.";
		case "PRT_CAP_EXCEEDED": {
			const cap = prtErrorDetails(error)?.cap;
			return cap === undefined ? error.message : `Only ${cap} left to return.`;
		}
		default:
			return error.message || fallback;
	}
}

export function usePurchaseReturnsQuery(params: PrtListParams, enabled = true) {
	return useQuery({
		queryKey: purchaseReturnKeys.list(params),
		queryFn: () => getPurchaseReturns(params),
		placeholderData: keepPreviousData,
		enabled,
	});
}

export function useAwaitingReturnsQuery(
	params: PrtAwaitingParams,
	enabled = true,
) {
	return useQuery({
		queryKey: purchaseReturnKeys.awaiting(params),
		queryFn: () => getAwaitingReturns(params),
		placeholderData: keepPreviousData,
		enabled,
	});
}

export function usePurchaseReturnQuery(id: number | undefined) {
	return useQuery({
		queryKey: purchaseReturnKeys.detail(id ?? 0),
		queryFn: () => getPurchaseReturn(id as number),
		enabled: id !== undefined && id > 0,
	});
}

export function useReturnPrefillQuery(
	grnId: number | undefined,
	enabled = true,
) {
	return useQuery({
		queryKey: purchaseReturnKeys.prefill(grnId ?? 0),
		queryFn: () => getReturnPrefill(grnId as number),
		enabled: enabled && grnId !== undefined && grnId > 0,
		retry: false,
	});
}

export function useCreatePurchaseReturnMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: PrtCreatePayload) => createPurchaseReturn(payload),
		onSuccess: () => {
			invalidateAfterReturn(queryClient);
			toast.success("Draft return saved");
		},
		// 400 / 409 are shown by the form.
	});
}

export function useUpdatePurchaseReturnMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: PrtUpdatePayload) => updatePurchaseReturn(payload),
		onSuccess: () => {
			invalidateAfterReturn(queryClient);
			toast.success("Return saved");
		},
	});
}

export function usePostReturnMutation(id: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => postPurchaseReturn(id),
		onSuccess: (result) => {
			invalidateAfterReturn(queryClient);
			toast.success(`Return posted. Debit note ${result.data.dnNumber}`);
		},
		// The dialog shows the error text.
	});
}

export function useCancelReturnDraftMutation(id: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => cancelReturnDraft(id),
		onSuccess: () => {
			invalidateAfterReturn(queryClient);
			toast.success("Draft return cancelled");
		},
	});
}

export function useCancelPostedReturnMutation(id: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: PrtCancelPayload) => cancelPostedReturn(id, payload),
		onSuccess: () => {
			invalidateAfterReturn(queryClient);
			toast.success("Return cancelled");
		},
	});
}
