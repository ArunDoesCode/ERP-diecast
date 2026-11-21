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
import { purchaseOrderKeys } from "@/lib/api/purchase-orders/keys";
import { purchaseRequisitionKeys } from "@/lib/api/purchase-requisitions/queries";
import type {
	AwardPayload,
	PrLinesParams,
	QuoteBody,
	QuoteCreatePayload,
	ReasonPayload,
	RfqCreatePayload,
	RfqListParams,
	RfqUpdatePayload,
} from "@/types/rfq";

import {
	awardRfq,
	cancelQuote,
	cancelRfq,
	closeRfq,
	createQuote,
	createRfq,
	getComparison,
	getPrLines,
	getQuote,
	getRfq,
	getRfqPrint,
	getRfqs,
	sendRfq,
	submitQuote,
	updateQuote,
	updateRfq,
} from "./fetchers";

export const rfqKeys = {
	all: ["rfq"] as const,
	lists: () => ["rfq", "list"] as const,
	list: (params?: RfqListParams) => ["rfq", "list", params ?? {}] as const,
	detail: (id: number) => ["rfq", "detail", id] as const,
	prLines: (params?: PrLinesParams) =>
		["rfq", "pr-lines", params ?? {}] as const,
	quote: (id: number) => ["rfq", "quote", id] as const,
	comparison: (id: number) => ["rfq", "comparison", id] as const,
	print: (id: number) => ["rfq", "print", id] as const,
};

/** Details of the error body, e.g. `{ agreed, ordered, cap }` or `{ contractNumber }`. */
export function rfqErrorDetails(error: unknown): Record<string, unknown> {
	if (!(error instanceof ApiClientError)) return {};
	const body = error.body as { details?: unknown } | null | undefined;
	const details = body?.details;
	return details && typeof details === "object"
		? (details as Record<string, unknown>)
		: {};
}

/** Plain words per error code (screens.md). Server text is the fallback. */
export function rfqErrorMessage(error: unknown, fallback: string) {
	if (!(error instanceof ApiClientError)) return fallback;
	switch (error.code) {
		case "RFQ_NOT_EDITABLE":
			return "This RFQ was already sent. It can no longer be edited.";
		case "RFQ_INVALID_STATUS":
			return "Someone already changed this RFQ. Reload to see it.";
		case "RFQ_HAS_AWARD":
			return "A line is already awarded, so the RFQ cannot be cancelled. Close it instead.";
		case "RFQ_LINE_AWARDED":
			return "Someone awarded this line. The grid was reloaded.";
		case "PR_LINE_ON_OPEN_RFQ":
			return "A requisition line is already on an open RFQ.";
		case "QUOTE_EXPIRED":
			return "A picked quote has expired. Pick another supplier or enter a new quote.";
		case "QUOTE_AWARDED":
			return "This quote has an awarded line and cannot be cancelled.";
		case "QUOTE_EMPTY":
			return "Price at least one line before submitting.";
		case "QUOTE_NOT_EDITABLE":
			return "A submitted quote can't be edited. Cancel it and enter a new one.";
		case "AWARD_REASON_REQUIRED":
			return "Give a reason for every line you did not award to the lowest quote.";
		case "CONTRACT_QTY_EXCEEDED": {
			const d = rfqErrorDetails(error);
			return d.cap !== undefined
				? `Over contract quantity (agreed ${String(d.agreed)}, ordered ${String(d.ordered)}, cap ${String(d.cap)}).`
				: error.message || fallback;
		}
		default:
			return error.message || fallback;
	}
}

function invalidateRfq(queryClient: QueryClient) {
	void queryClient.invalidateQueries({ queryKey: rfqKeys.all });
}

/** An RFQ changes which PR lines are on an open RFQ (queue, PR page) and an award makes draft POs. */
function invalidateAfterAward(queryClient: QueryClient) {
	invalidateRfq(queryClient);
	void queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.cards() });
	void queryClient.invalidateQueries({
		queryKey: ["purchase-orders", "detail"],
	});
	void queryClient.invalidateQueries({
		queryKey: purchaseRequisitionKeys.cards(),
	});
}

export function usePrLinesQuery(params: PrLinesParams, enabled = true) {
	return useQuery({
		queryKey: rfqKeys.prLines(params),
		queryFn: () => getPrLines(params),
		placeholderData: keepPreviousData,
		enabled,
	});
}

export function useRfqsQuery(params: RfqListParams, enabled = true) {
	return useQuery({
		queryKey: rfqKeys.list(params),
		queryFn: () => getRfqs(params),
		placeholderData: keepPreviousData,
		enabled,
	});
}

export function useRfqQuery(id: number | undefined) {
	return useQuery({
		queryKey: rfqKeys.detail(id ?? 0),
		queryFn: () => getRfq(id as number),
		enabled: id !== undefined && id > 0,
	});
}

export function useRfqPrintQuery(id: number | undefined) {
	return useQuery({
		queryKey: rfqKeys.print(id ?? 0),
		queryFn: () => getRfqPrint(id as number),
		enabled: id !== undefined && id > 0,
	});
}

export function useQuoteQuery(id: number | undefined) {
	return useQuery({
		queryKey: rfqKeys.quote(id ?? 0),
		queryFn: () => getQuote(id as number),
		enabled: id !== undefined && id > 0,
	});
}

export function useComparisonQuery(id: number | undefined) {
	return useQuery({
		queryKey: rfqKeys.comparison(id ?? 0),
		queryFn: () => getComparison(id as number),
		enabled: id !== undefined && id > 0,
	});
}

export function useCreateRfqMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: RfqCreatePayload) => createRfq(payload),
		onSuccess: (result) => {
			invalidateAfterAward(queryClient);
			toast.success(`${result.data.rfqNumber} saved as draft`);
		},
		// 400 / 409 are shown by the form.
	});
}

export function useUpdateRfqMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: RfqUpdatePayload) => updateRfq(payload),
		onSuccess: () => {
			invalidateAfterAward(queryClient);
			toast.success("RFQ saved");
		},
	});
}

export function useSendRfqMutation(id: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => sendRfq(id),
		onSuccess: () => {
			invalidateRfq(queryClient);
			toast.success("RFQ sent. Enter quotes as they arrive");
		},
	});
}

export function useCancelRfqMutation(id: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: ReasonPayload) => cancelRfq(id, payload),
		onSuccess: () => {
			invalidateAfterAward(queryClient);
			toast.success("RFQ cancelled");
		},
	});
}

export function useCloseRfqMutation(id: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: ReasonPayload) => closeRfq(id, payload),
		onSuccess: () => {
			invalidateAfterAward(queryClient);
			toast.success("RFQ closed");
		},
	});
}

export function useCreateQuoteMutation(rfqId: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: QuoteCreatePayload) => createQuote(rfqId, payload),
		onSuccess: () => {
			invalidateRfq(queryClient);
			toast.success("Quote saved as draft");
		},
	});
}

export function useUpdateQuoteMutation(quoteId: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: QuoteBody) => updateQuote(quoteId, payload),
		onSuccess: () => {
			invalidateRfq(queryClient);
			toast.success("Quote saved");
		},
	});
}

export function useSubmitQuoteMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (quoteId: number) => submitQuote(quoteId),
		onSuccess: () => {
			invalidateRfq(queryClient);
			toast.success("Quote submitted");
		},
	});
}

export function useCancelQuoteMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (vars: { quoteId: number; reason: string }) =>
			cancelQuote(vars.quoteId, { reason: vars.reason }),
		onSuccess: () => {
			invalidateRfq(queryClient);
			toast.success("Quote cancelled");
		},
	});
}

export function useAwardRfqMutation(id: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: AwardPayload) => awardRfq(id, payload),
		onSuccess: () => {
			invalidateAfterAward(queryClient);
		},
		onError: (error) => {
			if (
				error instanceof ApiClientError &&
				error.code === "RFQ_LINE_AWARDED"
			) {
				toast.error("Someone awarded this line");
				invalidateRfq(queryClient);
			}
		},
	});
}
