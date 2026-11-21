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
	SoAuditParams,
	SoCreatePayload,
	SoDraftsPayload,
	SoExplosionListParams,
	SoExplosionRowsParams,
	SoListParams,
	SoReasonPayload,
	SoUpdatePayload,
	SoVersionPayload,
} from "@/types/sale-order";

import {
	cancelSaleOrder,
	closeSaleOrder,
	confirmSaleOrder,
	createSaleOrder,
	createSoDrafts,
	getSaleOrder,
	getSaleOrderAudit,
	getSaleOrders,
	getSoExplosion,
	getSoExplosionRows,
	getSoExplosions,
	holdSaleOrder,
	resumeSaleOrder,
	runSoExplosion,
	updateSaleOrder,
} from "./fetchers";

export const soKeys = {
	all: ["sale-orders"] as const,
	list: (params?: SoListParams) =>
		["sale-orders", "list", params ?? {}] as const,
	detail: (soId: number) => ["sale-orders", "detail", soId] as const,
	audit: (soId: number, params?: SoAuditParams) =>
		["sale-orders", "audit", soId, params ?? {}] as const,
	explosions: (soId: number, params?: SoExplosionListParams) =>
		["sale-orders", "explosions", soId, params ?? {}] as const,
	explosion: (soId: number, eid: number) =>
		["sale-orders", "explosion", soId, eid] as const,
	explosionRows: (soId: number, eid: number, params?: SoExplosionRowsParams) =>
		["sale-orders", "explosion-rows", soId, eid, params ?? {}] as const,
};

/** Server text is already plain words for 400 / 409. */
export function soErrorMessage(error: unknown, fallback: string) {
	return error instanceof ApiClientError ? error.message : fallback;
}

export function useSaleOrdersQuery(params: SoListParams, enabled = true) {
	return useQuery({
		queryKey: soKeys.list(params),
		queryFn: () => getSaleOrders(params),
		placeholderData: keepPreviousData,
		enabled,
	});
}

export function useSaleOrderQuery(soId: number | undefined) {
	return useQuery({
		queryKey: soKeys.detail(soId ?? 0),
		queryFn: () => getSaleOrder(soId as number),
		enabled: soId !== undefined && soId > 0,
	});
}

export function useSaleOrderAuditQuery(soId: number, params?: SoAuditParams) {
	return useQuery({
		queryKey: soKeys.audit(soId, params),
		queryFn: () => getSaleOrderAudit(soId, params),
		enabled: soId > 0,
		placeholderData: keepPreviousData,
	});
}

export function useSoExplosionsQuery(
	soId: number,
	params?: SoExplosionListParams,
	enabled = true,
) {
	return useQuery({
		queryKey: soKeys.explosions(soId, params),
		queryFn: () => getSoExplosions(soId, params),
		enabled: enabled && soId > 0,
	});
}

export function useSoExplosionQuery(soId: number, eid: number | undefined) {
	return useQuery({
		queryKey: soKeys.explosion(soId, eid ?? 0),
		queryFn: () => getSoExplosion(soId, eid as number),
		enabled: eid !== undefined && eid > 0,
	});
}

export function useSoExplosionRowsQuery(
	soId: number,
	eid: number | undefined,
	params?: SoExplosionRowsParams,
) {
	return useQuery({
		queryKey: soKeys.explosionRows(soId, eid ?? 0, params),
		queryFn: () => getSoExplosionRows(soId, eid as number, params),
		enabled: eid !== undefined && eid > 0,
		placeholderData: keepPreviousData,
	});
}

export function useCreateSaleOrderMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: SoCreatePayload) => createSaleOrder(payload),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: soKeys.all });
			toast.success("Draft saved");
		},
		// 400 / 409 CUSTOMER_PO_EXISTS are shown by the form.
	});
}

export function useUpdateSaleOrderMutation(soId: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: SoUpdatePayload) => updateSaleOrder(soId, payload),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: soKeys.all });
			toast.success("Sale order saved");
		},
		// 409s (STALE_VERSION, LIVE_DOCUMENTS_LINKED, ...) are shown by the form.
	});
}

export function useConfirmSaleOrderMutation(soId: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: SoVersionPayload) => confirmSaleOrder(soId, payload),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: soKeys.all });
			toast.success("Sale order confirmed");
		},
		onError: (error) => {
			toast.error(soErrorMessage(error, "Could not confirm the sale order."));
		},
	});
}

export function useResumeSaleOrderMutation(soId: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: SoVersionPayload) => resumeSaleOrder(soId, payload),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: soKeys.all });
			toast.success("Sale order resumed");
		},
		onError: (error) => {
			toast.error(soErrorMessage(error, "Could not resume the sale order."));
		},
	});
}

export type SoReasonAction = "hold" | "close" | "cancel";

const REASON_CALLS = {
	hold: holdSaleOrder,
	close: closeSaleOrder,
	cancel: cancelSaleOrder,
} as const;

const REASON_DONE: Record<SoReasonAction, string> = {
	hold: "Sale order put on hold",
	close: "Sale order closed",
	cancel: "Sale order cancelled",
};

/** Hold / close / cancel share one body; the dialog shows the 409 text itself. */
export function useSoReasonMutation(soId: number, action: SoReasonAction) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: SoReasonPayload) =>
			REASON_CALLS[action](soId, payload),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: soKeys.all });
			toast.success(REASON_DONE[action]);
		},
	});
}

export function useRunSoExplosionMutation(soId: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => runSoExplosion(soId),
		onSuccess: (result) => {
			void queryClient.invalidateQueries({ queryKey: soKeys.all });
			toast.success(`Explosion ${result.data.number} done`);
		},
		onError: (error) => {
			toast.error(soErrorMessage(error, "Could not explode the BOM."));
		},
	});
}

export function useCreateSoDraftsMutation(soId: number, eid: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: SoDraftsPayload) =>
			createSoDrafts(soId, eid, payload),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: soKeys.all });
		},
		// The view shows the numbers as links (success) or the server message (409 / 400).
	});
}
