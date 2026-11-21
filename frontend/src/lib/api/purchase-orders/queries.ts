"use client";

import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { ApiClientError } from "@/lib/api/client";
import { documentKeys } from "@/lib/api/document/queries";
import { grnKeys } from "@/lib/api/grn/queries";
import { homeKeys } from "@/lib/api/home/queries";
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
	getSupplierPriceRows,
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
	priceRows: (supplierId: number, itemIds: number[]) =>
		["purchase-orders", "price-rows", supplierId, itemIds] as const,
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

/**
 * The supplier's price-list rows for the PO's own items (#107): used for the
 * rate and GST % of each line, not capped at 100 rows.
 */
export function useSupplierPriceRowsQuery(
	supplierId: number,
	itemIds: number[],
	enabled = true,
) {
	const ids = [...new Set(itemIds)].sort((a, b) => a - b);
	return useQuery({
		queryKey: purchaseOrderKeys.priceRows(supplierId, ids),
		queryFn: () => getSupplierPriceRows(supplierId, ids),
		enabled: enabled && supplierId > 0 && ids.length > 0,
		placeholderData: keepPreviousData,
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
				queryClient.invalidateQueries({ queryKey: homeKeys.all }),
				queryClient.invalidateQueries({ queryKey: documentKeys.all }),
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

export type PoDraftGroup = {
	supplierId: number;
	supplierName: string;
	lines: Array<{ prItemId: number; unitPricePaise: number }>;
};

export type PoDraftOutcome =
	| {
			ok: true;
			supplierName: string;
			po: { id: number; poNumber: string };
	  }
	| { ok: false; supplierName: string; message: string; conflict: boolean };

/**
 * Create PO from a requisition (BR-FF-48, 58, 59): one createpo call per supplier, in
 * parallel. A refused supplier does not stop the others; the result lists every outcome.
 * No toasts here: the caller words the message from the outcomes.
 */
export function useCreateDraftPosMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (variables: {
			prId: number;
			groups: PoDraftGroup[];
		}): Promise<PoDraftOutcome[]> =>
			Promise.all(
				variables.groups.map(async (group): Promise<PoDraftOutcome> => {
					try {
						const result = await createPurchaseOrder({
							supplierId: group.supplierId,
							lines: group.lines,
						});
						if (!result.success) {
							return {
								ok: false,
								supplierName: group.supplierName,
								message: result.message || "Could not create the order",
								conflict: false,
							};
						}
						return {
							ok: true,
							supplierName: group.supplierName,
							po: {
								id: result.data.po.id,
								poNumber: result.data.po.poNumber,
							},
						};
					} catch (error) {
						const conflict =
							error instanceof ApiClientError &&
							(error.status === 409 ||
								error.code === "PO_LINE_ALREADY_DRAFTED" ||
								// Sequential case: BR-PO-01 answers a code-less 400 "PR item N is not in pending status" (A-87).
								(error.status === 400 &&
									!error.code &&
									/is not in pending status/i.test(error.message)));
						return {
							ok: false,
							supplierName: group.supplierName,
							message: conflict
								? "Already on another order"
								: errorMessage(error, "Could not create the order"),
							conflict,
						};
					}
				}),
			),
		onSettled: async (_outcomes, _error, variables) => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: homeKeys.all }),
				queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.cards() }),
				queryClient.invalidateQueries({
					queryKey: purchaseRequisitionKeys.cards(),
				}),
				queryClient.invalidateQueries({
					queryKey: purchaseRequisitionKeys.detail(variables.prId),
				}),
				queryClient.invalidateQueries({ queryKey: documentKeys.all }),
				queryClient.invalidateQueries({ queryKey: ["approval"] }),
			]);
		},
	});
}

function invalidatePOAndPR(
	queryClient: ReturnType<typeof useQueryClient>,
	poId: number,
	prId?: number,
) {
	return Promise.all([
		queryClient.invalidateQueries({ queryKey: homeKeys.all }),
		queryClient.invalidateQueries({ queryKey: grnKeys.receivable() }),
		queryClient.invalidateQueries({
			queryKey: purchaseOrderKeys.communications(poId),
		}),
		queryClient.invalidateQueries({ queryKey: documentKeys.all }),
		queryClient.invalidateQueries({ queryKey: ["approval", "pending"] }),
		queryClient.invalidateQueries({ queryKey: ["approval", "history"] }),
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

/** `quietSuccess.current = true` skips the "updated" toast (Save and submit shows one toast). */
export function useUpdatePurchaseOrderMutation(quietSuccess?: {
	current: boolean;
}) {
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
			if (!quietSuccess?.current) {
				toast.success(result.message || `${result.data.po.poNumber} updated`);
			}
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to update PO"));
		},
	});
}

export function useCancelPurchaseOrderMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (variables: { poId: number; prId?: number; reason: string }) =>
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

			await invalidatePOAndPR(queryClient, variables.poId);
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

			await invalidatePOAndPR(queryClient, variables.poId);
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

			await invalidatePOAndPR(queryClient, variables.poId);
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
