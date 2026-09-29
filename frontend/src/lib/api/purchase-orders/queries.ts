"use client";

import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { ApiClientError } from "@/lib/api/client";
import { purchaseRequisitionKeys } from "@/lib/api/purchase-requisitions/queries";
import type {
	ClosePoPayload,
	ConfirmPoPayload,
	LogPoCommunicationPayload,
	MarkPoInvoicedFormInput,
	POCreatePayload,
	POUpdatePayload,
	PurchaseOrderListParams,
	ShortClosePoPayload,
	UpdatePoDelayPayload,
} from "@/types/purchase-orders";

import {
	cancelPurchaseOrder,
	closePurchaseOrder,
	confirmPurchaseOrder,
	createPurchaseOrder,
	escalatePurchaseOrder,
	getItemLastRate,
	getPurchaseOrderById,
	getPurchaseOrderCommunications,
	getPurchaseOrders,
	markPurchaseOrderInvoiced,
	sendPurchaseOrder,
	sendPurchaseOrderReminder,
	shortClosePurchaseOrder,
	updatePurchaseOrder,
	updatePurchaseOrderDelay,
} from "./fetchers";

export const purchaseOrderKeys = {
	cards: (params?: PurchaseOrderListParams) =>
		params
			? (["purchase-orders", "cards", params] as const)
			: (["purchase-orders", "cards"] as const),
	detail: (poId: number) => ["purchase-orders", "detail", poId] as const,
	communications: (poId: number) =>
		["purchase-orders", "communications", poId] as const,
	lastRate: (itemId: number, supplierId: number) =>
		["purchase-orders", "last-rate", itemId, supplierId] as const,
};

const PO_ERROR_MESSAGES: Record<string, string> = {
	PO_NOT_EDITABLE: "Only a draft PO can be edited.",
	DOC_LOCKED_IN_APPROVAL:
		"This PO is waiting for approval and cannot be changed. Withdraw it first.",
	PO_LINE_ALREADY_DRAFTED: "One of those PR lines is already on another PO.",
};

function errorMessage(error: unknown, fallback: string) {
	if (!(error instanceof ApiClientError)) return fallback;
	if (error.code && PO_ERROR_MESSAGES[error.code]) {
		return PO_ERROR_MESSAGES[error.code];
	}
	return error.message;
}

function normalize(value?: string | null) {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

export function usePurchaseOrdersQuery(params: PurchaseOrderListParams) {
	return useQuery({
		queryKey: purchaseOrderKeys.cards(params),
		queryFn: () => getPurchaseOrders(params),
		placeholderData: keepPreviousData,
	});
}

export function usePurchaseOrderDetailQuery(poId: number, enabled: boolean) {
	return useQuery({
		queryKey: purchaseOrderKeys.detail(poId),
		queryFn: () => getPurchaseOrderById(poId),
		enabled: enabled && Number.isFinite(poId) && poId > 0,
	});
}

export function usePoCommunicationsQuery(poId: number, enabled: boolean) {
	return useQuery({
		queryKey: purchaseOrderKeys.communications(poId),
		queryFn: () => getPurchaseOrderCommunications(poId),
		enabled: enabled && Number.isFinite(poId) && poId > 0,
	});
}

export function useItemLastRateQuery(
	itemId: number,
	supplierId: number,
	enabled: boolean,
) {
	return useQuery({
		queryKey: purchaseOrderKeys.lastRate(itemId, supplierId),
		queryFn: () => getItemLastRate(itemId, supplierId),
		enabled:
			enabled &&
			Number.isFinite(itemId) &&
			itemId > 0 &&
			Number.isFinite(supplierId) &&
			supplierId > 0,
	});
}

export function useCreatePurchaseOrderMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (variables: { prId: number; payload: POCreatePayload }) =>
			createPurchaseOrder(variables.payload),
		onSuccess: async (result, variables) => {
			if (!result.success) {
				toast.error(result.message || "Failed to create PO");
				return;
			}

			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: purchaseOrderKeys.cards(),
				}),
				queryClient.invalidateQueries({
					queryKey: purchaseRequisitionKeys.cards(),
				}),
				queryClient.invalidateQueries({
					queryKey: purchaseRequisitionKeys.detail(variables.prId),
				}),
			]);
			toast.success(
				result.message || `${result.data.po.poNumber} draft created`,
			);
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to create PO"));
		},
	});
}

function invalidatePOAndPR(
	queryClient: ReturnType<typeof useQueryClient>,
	poId: number,
	prId?: number,
) {
	return Promise.all([
		queryClient.invalidateQueries({
			queryKey: purchaseOrderKeys.communications(poId),
		}),
		queryClient.invalidateQueries({ queryKey: ["approval"] }),
		queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.cards() }),
		queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.detail(poId) }),
		queryClient.invalidateQueries({
			queryKey: purchaseRequisitionKeys.cards(),
		}),
		// This PO's status change can flip its parent PR's own status server-side
		// (approved -> partial_ordered -> fully_ordered, or back on cancel). When
		// the caller knows the exact prId (PR-scoped views), invalidate just that
		// detail query. When it doesn't (e.g. the PO Tracking screen — `PurchaseOrder`
		// carries no prId), invalidate every cached PR detail rather than silently
		// leaving an open PR detail page stale.
		prId != null
			? queryClient.invalidateQueries({
					queryKey: purchaseRequisitionKeys.detail(prId),
				})
			: queryClient.invalidateQueries({
					queryKey: ["purchase-requisitions", "detail"],
				}),
	]);
}

export function useUpdatePurchaseOrderMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (variables: { prId?: number; payload: POUpdatePayload }) =>
			updatePurchaseOrder(variables.payload),
		onSuccess: async (result, variables) => {
			if (!result.success) {
				toast.error(result.message || "Failed to update PO");
				return;
			}

			await invalidatePOAndPR(
				queryClient,
				variables.payload.poId,
				variables.prId,
			);
			toast.success(result.message || `${result.data.po.poNumber} updated`);
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to update PO"));
		},
	});
}

export function useCancelPurchaseOrderMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (variables: { poId: number; prId?: number; reason?: string }) =>
			cancelPurchaseOrder(variables.poId, variables.reason),
		onSuccess: async (result, variables) => {
			if (!result.success) {
				toast.error(result.message || "Failed to cancel PO");
				return;
			}

			await invalidatePOAndPR(queryClient, variables.poId, variables.prId);
			toast.success(result.message || `${result.data.poNumber} cancelled`);
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to cancel PO"));
		},
	});
}

export function useMarkPoSentMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (variables: {
			poId: number;
			prId?: number;
			payload: LogPoCommunicationPayload;
		}) => sendPurchaseOrder(variables.poId, variables.payload),
		onSuccess: async (result, variables) => {
			if (!result.success) {
				toast.error(result.message || "Failed to mark PO as sent");
				return;
			}

			await invalidatePOAndPR(queryClient, variables.poId, variables.prId);
			toast.success(result.message || `${result.data.poNumber} marked as sent`);
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to mark PO as sent"));
		},
	});
}

export function useSendPoReminderMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (variables: {
			poId: number;
			payload: LogPoCommunicationPayload;
		}) => sendPurchaseOrderReminder(variables.poId, variables.payload),
		onSuccess: async (result, variables) => {
			if (!result.success) {
				toast.error(result.message || "Failed to log reminder");
				return;
			}

			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: purchaseOrderKeys.detail(variables.poId),
				}),
				queryClient.invalidateQueries({
					queryKey: purchaseOrderKeys.communications(variables.poId),
				}),
			]);
			toast.success(
				result.message || `Reminder logged via ${result.data.channel}`,
			);
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to log reminder"));
		},
	});
}

export function useEscalatePoMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (variables: {
			poId: number;
			payload: LogPoCommunicationPayload;
		}) => escalatePurchaseOrder(variables.poId, variables.payload),
		onSuccess: async (result, variables) => {
			if (!result.success) {
				toast.error(result.message || "Failed to log escalation");
				return;
			}

			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: purchaseOrderKeys.detail(variables.poId),
				}),
				queryClient.invalidateQueries({
					queryKey: purchaseOrderKeys.communications(variables.poId),
				}),
			]);
			toast.success(
				result.message || `Escalation logged via ${result.data.channel}`,
			);
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to log escalation"));
		},
	});
}

export function useUpdatePoDelayMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (variables: {
			poId: number;
			prId?: number;
			payload: UpdatePoDelayPayload;
		}) => updatePurchaseOrderDelay(variables.poId, variables.payload),
		onSuccess: async (result, variables) => {
			if (!result.success) {
				toast.error(result.message || "Failed to update delivery delay");
				return;
			}

			await invalidatePOAndPR(queryClient, variables.poId, variables.prId);
			toast.success(result.message || `${result.data.poNumber} updated`);
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to update delivery delay"));
		},
	});
}

export function useConfirmPoMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (variables: { poId: number; payload: ConfirmPoPayload }) =>
			confirmPurchaseOrder(variables.poId, variables.payload),
		onSuccess: async (result, variables) => {
			if (!result.success) {
				toast.error(result.message || "Failed to record confirmation");
				return;
			}

			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: purchaseOrderKeys.detail(variables.poId),
				}),
				queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.cards() }),
			]);
			toast.success(result.message || `${result.data.poNumber} confirmed`);
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to record confirmation"));
		},
	});
}

export function useMarkPoInvoicedMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (variables: {
			poId: number;
			payload: MarkPoInvoicedFormInput;
		}) =>
			markPurchaseOrderInvoiced(variables.poId, {
				invoiceNumber: variables.payload.invoiceNumber,
				invoiceDate: variables.payload.invoiceDate,
				billedAmountPaise: Math.round(
					variables.payload.billedAmountRupees * 100,
				),
				dueDate: normalize(variables.payload.dueDate),
			}),
		onSuccess: async (result, variables) => {
			if (!result.success) {
				toast.error(result.message || "Failed to mark PO as invoiced");
				return;
			}

			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: purchaseOrderKeys.detail(variables.poId),
				}),
				queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.cards() }),
			]);
			toast.success(result.message || `${result.data.poNumber} invoiced`);
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to mark PO as invoiced"));
		},
	});
}

export function useClosePoMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (variables: { poId: number; payload: ClosePoPayload }) =>
			closePurchaseOrder(variables.poId, variables.payload),
		onSuccess: async (result, variables) => {
			if (!result.success) {
				toast.error(result.message || "Failed to close PO");
				return;
			}

			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: purchaseOrderKeys.detail(variables.poId),
				}),
				queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.cards() }),
			]);
			toast.success(result.message || `${result.data.poNumber} closed`);
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to close PO"));
		},
	});
}

export function useShortClosePoMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (variables: { poId: number; payload: ShortClosePoPayload }) =>
			shortClosePurchaseOrder(variables.poId, variables.payload),
		onSuccess: async (result, variables) => {
			if (!result.success) {
				toast.error(result.message || "Failed to short-close PO");
				return;
			}

			await invalidatePOAndPR(queryClient, variables.poId);
			toast.success(result.message || `${result.data.poNumber} short-closed`);
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to short-close PO"));
		},
	});
}

export function toPOCreatePayload(input: {
	supplierId: number;
	paymentTermsDays?: number | null;
	deliveryTerms?: string;
	expectedDeliveryDate?: string;
	notes?: string;
	lines: Array<{
		prItemId: number;
		unitPriceRupees: number;
		gstPercent?: number;
	}>;
}): POCreatePayload {
	return {
		supplierId: input.supplierId,
		paymentTermsDays: input.paymentTermsDays ?? undefined,
		deliveryTerms: normalize(input.deliveryTerms),
		expectedDeliveryDate: normalize(input.expectedDeliveryDate),
		notes: normalize(input.notes),
		lines: input.lines.map((line) => ({
			prItemId: line.prItemId,
			unitPricePaise: Math.round(line.unitPriceRupees * 100),
			gstPercent: line.gstPercent,
		})),
	};
}
