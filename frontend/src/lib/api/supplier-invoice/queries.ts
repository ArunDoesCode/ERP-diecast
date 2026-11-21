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
import { grnKeys } from "@/lib/api/grn/keys";
import { purchaseOrderKeys } from "@/lib/api/purchase-orders/keys";
import type {
	InvoiceTolerancesPayload,
	SinvCancelPayload,
	SinvCreatePayload,
	SinvListParams,
	SinvReleasePayload,
	SinvUpdatePayload,
} from "@/types/supplier-invoice";

import {
	backToDraftSupplierInvoice,
	cancelSupplierInvoice,
	createSupplierInvoice,
	deleteSupplierInvoice,
	getBillableLines,
	getInvoiceTolerances,
	getSupplierInvoice,
	getSupplierInvoices,
	releaseSupplierInvoice,
	saveInvoiceTolerances,
	submitSupplierInvoice,
	updateSupplierInvoice,
} from "./fetchers";

export const supplierInvoiceKeys = {
	all: ["supplier-invoices"] as const,
	lists: () => ["supplier-invoices", "list"] as const,
	list: (params?: SinvListParams) =>
		["supplier-invoices", "list", params ?? {}] as const,
	detail: (id: number) => ["supplier-invoices", "detail", id] as const,
	billable: (poId: number, grnId?: number) =>
		["supplier-invoices", "billable", poId, grnId ?? null] as const,
	tolerances: () => ["supplier-invoices", "tolerances"] as const,
};

/**
 * A bill moves PO status (invoiced) and the billable qty shown on GRN and PO
 * detail (BR-SINV-29, 38), so those caches go stale with it.
 */
function invalidateAfterInvoice(queryClient: QueryClient) {
	void queryClient.invalidateQueries({ queryKey: supplierInvoiceKeys.lists() });
	void queryClient.invalidateQueries({
		queryKey: ["supplier-invoices", "detail"],
	});
	void queryClient.invalidateQueries({
		queryKey: ["supplier-invoices", "billable"],
	});
	void queryClient.invalidateQueries({ queryKey: purchaseOrderKeys.cards() });
	void queryClient.invalidateQueries({
		queryKey: ["purchase-orders", "detail"],
	});
	void queryClient.invalidateQueries({ queryKey: grnKeys.list() });
	void queryClient.invalidateQueries({ queryKey: ["grn", "detail"] });
}

/** Plain words per error code (screens.md). Server text is the fallback. */
export function sinvErrorMessage(error: unknown, fallback: string) {
	if (!(error instanceof ApiClientError)) return fallback;
	switch (error.code) {
		case "SINV_BUSY":
		case "SINV_STALE_QTY":
			return "Changed by someone else. Reload and try again.";
		case "SINV_NOT_DRAFT":
		case "SINV_NOT_BLOCKED":
		case "SINV_NOT_CANCELLABLE":
			return "Someone already changed this invoice. Reload to see it.";
		case "SINV_SELF_RELEASE":
			return "A second person must release this invoice.";
		default:
			return error.message || fallback;
	}
}

export function isSinvConflict(error: unknown) {
	return (
		error instanceof ApiClientError &&
		(error.code === "SINV_BUSY" || error.code === "SINV_STALE_QTY")
	);
}

/** BR-SINV-34: busy / stale quantity -> toast "Changed by someone else" and refetch. */
function onActionError(queryClient: QueryClient, error: unknown) {
	if (!isSinvConflict(error)) return;
	toast.error("Changed by someone else");
	invalidateAfterInvoice(queryClient);
}

export function useSupplierInvoicesQuery(
	params: SinvListParams,
	enabled = true,
) {
	return useQuery({
		queryKey: supplierInvoiceKeys.list(params),
		queryFn: () => getSupplierInvoices(params),
		placeholderData: keepPreviousData,
		enabled,
	});
}

export function useSupplierInvoiceQuery(id: number | undefined) {
	return useQuery({
		queryKey: supplierInvoiceKeys.detail(id ?? 0),
		queryFn: () => getSupplierInvoice(id as number),
		enabled: id !== undefined && id > 0,
	});
}

export function useBillableLinesQuery(
	poId: number | undefined,
	grnId: number | undefined,
	enabled = true,
) {
	return useQuery({
		queryKey: supplierInvoiceKeys.billable(poId ?? 0, grnId),
		queryFn: () => getBillableLines(poId as number, grnId),
		enabled: enabled && poId !== undefined && poId > 0,
		retry: false,
	});
}

export function useInvoiceTolerancesQuery(enabled = true) {
	return useQuery({
		queryKey: supplierInvoiceKeys.tolerances(),
		queryFn: getInvoiceTolerances,
		enabled,
	});
}

export function useSaveInvoiceTolerancesMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: InvoiceTolerancesPayload) =>
			saveInvoiceTolerances(payload),
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: supplierInvoiceKeys.tolerances(),
			});
			void queryClient.invalidateQueries({
				queryKey: ["company", "settings", "history"],
			});
			toast.success("Invoice matching saved");
		},
		// The card shows the error text.
	});
}

export function useCreateSupplierInvoiceMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: SinvCreatePayload) => createSupplierInvoice(payload),
		onSuccess: () => {
			invalidateAfterInvoice(queryClient);
		},
		// 400 / 409 are shown by the form.
	});
}

export function useUpdateSupplierInvoiceMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: SinvUpdatePayload) => updateSupplierInvoice(payload),
		onSuccess: () => {
			invalidateAfterInvoice(queryClient);
		},
	});
}

export function useSubmitSupplierInvoiceMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: number) => submitSupplierInvoice(id),
		onSuccess: (result) => {
			invalidateAfterInvoice(queryClient);
			toast.success(
				result.data.status === "blocked"
					? "Invoice saved and blocked"
					: "Invoice submitted. Payable",
			);
		},
		onError: (error) => onActionError(queryClient, error),
	});
}

export function useBackToDraftMutation(id: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => backToDraftSupplierInvoice(id),
		onSuccess: () => {
			invalidateAfterInvoice(queryClient);
			toast.success("Invoice is a draft again");
		},
		onError: (error) => onActionError(queryClient, error),
	});
}

export function useDeleteSupplierInvoiceMutation(id: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => deleteSupplierInvoice(id),
		onSuccess: () => {
			invalidateAfterInvoice(queryClient);
			toast.success("Draft deleted");
		},
		onError: (error) => onActionError(queryClient, error),
	});
}

export function useReleaseSupplierInvoiceMutation(id: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: SinvReleasePayload) =>
			releaseSupplierInvoice(id, payload),
		onSuccess: () => {
			invalidateAfterInvoice(queryClient);
			toast.success("Invoice released. Payable");
		},
		onError: (error) => onActionError(queryClient, error),
	});
}

export function useCancelSupplierInvoiceMutation(id: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: SinvCancelPayload) =>
			cancelSupplierInvoice(id, payload),
		onSuccess: () => {
			invalidateAfterInvoice(queryClient);
			toast.success("Invoice cancelled");
		},
		onError: (error) => onActionError(queryClient, error),
	});
}
