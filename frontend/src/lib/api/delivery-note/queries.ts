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
import { soKeys } from "@/lib/api/sale-order/queries";
import type {
	DnCreatePayload,
	DnListParams,
	DnPendingParams,
	DnReasonPayload,
	DnTransportInput,
	DnUpdatePayload,
} from "@/types/delivery-note";

import {
	cancelDeliveryNote,
	cancelDeliveryNoteDraft,
	createDeliveryNote,
	getDeliveryNote,
	getDeliveryNotes,
	getDispatchSettings,
	getPendingDispatch,
	getTransportHistory,
	postDeliveryNote,
	updateDeliveryNote,
	updateDeliveryNoteTransport,
} from "./fetchers";

export const deliveryNoteKeys = {
	all: ["delivery-notes"] as const,
	pending: (params?: DnPendingParams) =>
		["delivery-notes", "pending", params ?? {}] as const,
	settings: () => ["delivery-notes", "settings"] as const,
	lists: () => ["delivery-notes", "list"] as const,
	list: (params?: DnListParams) =>
		["delivery-notes", "list", params ?? {}] as const,
	detail: (id: number) => ["delivery-notes", "detail", id] as const,
	history: (id: number, page = 1) =>
		["delivery-notes", "history", id, page] as const,
};

/** Post and cancel move stock and the SO's delivered qty; saves only touch the notes. */
function invalidateAfterNote(
	queryClient: QueryClient,
	opts: { soId?: number; stock?: boolean } = {},
) {
	void queryClient.invalidateQueries({ queryKey: deliveryNoteKeys.all });
	if (opts.soId !== undefined) {
		void queryClient.invalidateQueries({ queryKey: soKeys.lists() });
		void queryClient.invalidateQueries({
			queryKey: soKeys.detail(opts.soId),
		});
	}
	if (opts.stock) {
		void queryClient.invalidateQueries({ queryKey: ["assets", "stock"] });
		void queryClient.invalidateQueries({ queryKey: ["assets", "movements"] });
		void queryClient.invalidateQueries({
			queryKey: ["assets", "reconciliation"],
		});
	}
}

export type DnErrorDetails = { soLineId?: number; itemId?: number };

export function dnErrorDetails(error: unknown): DnErrorDetails | undefined {
	if (!(error instanceof ApiClientError)) return undefined;
	const body = error.body;
	if (typeof body !== "object" || body === null) return undefined;
	const details = (body as { details?: unknown }).details;
	return typeof details === "object" && details !== null
		? (details as DnErrorDetails)
		: undefined;
}

/** Plain words per error code (screens.md). The server text is the fallback. */
export function dnErrorMessage(error: unknown, fallback: string) {
	if (!(error instanceof ApiClientError)) return fallback;
	switch (error.code) {
		case "DISPATCH_NOTE_STATUS":
			return "Someone already changed this note. Reload to see it.";
		case "DISPATCH_SO_NOT_CONFIRMED":
			return "The sale order is not confirmed any more (on hold or closed), so delivery cannot go ahead.";
		case "DISPATCH_COMPANY_OR_HSN_MISSING":
			return error.message || "Company details or an item HSN code is missing.";
		case "DISPATCH_PACKED_QTY_MISMATCH":
			return (
				error.message ||
				"Packed quantity must equal the note quantity for every packed line."
			);
		case "DISPATCH_EWAY_REQUIRED":
			return (
				error.message ||
				"An e-way bill is needed. Fill the mode, vehicle or transporter ID, distance, e-way bill no. and date."
			);
		case "DISPATCH_EWAY_REUSED":
			return "That e-way bill number is already on another delivery note.";
		case "DISPATCH_NOTE_FIELD_LOCKED":
			return "That field cannot be changed after the note is posted.";
		case "DISPATCH_SO_CLOSED_MANUALLY":
			return "The sale order was closed by hand, so this note cannot be cancelled.";
		case "INSUFFICIENT_STOCK":
			return error.message || "Not enough stock at the source location.";
		default:
			return error.message || fallback;
	}
}

export function usePendingDispatchQuery(
	params: DnPendingParams,
	enabled = true,
) {
	return useQuery({
		queryKey: deliveryNoteKeys.pending(params),
		queryFn: () => getPendingDispatch(params),
		placeholderData: keepPreviousData,
		enabled,
	});
}

export function useDispatchSettingsQuery(enabled = true) {
	return useQuery({
		queryKey: deliveryNoteKeys.settings(),
		queryFn: getDispatchSettings,
		enabled,
	});
}

export function useDeliveryNotesQuery(params: DnListParams, enabled = true) {
	return useQuery({
		queryKey: deliveryNoteKeys.list(params),
		queryFn: () => getDeliveryNotes(params),
		placeholderData: keepPreviousData,
		enabled,
	});
}

export function useDeliveryNoteQuery(id: number | undefined) {
	return useQuery({
		queryKey: deliveryNoteKeys.detail(id ?? 0),
		queryFn: () => getDeliveryNote(id as number),
		enabled: id !== undefined && id > 0,
	});
}

export function useTransportHistoryQuery(
	id: number | undefined,
	page: number,
	enabled = true,
) {
	return useQuery({
		queryKey: deliveryNoteKeys.history(id ?? 0, page),
		queryFn: () => getTransportHistory(id as number, { page, pageSize: 10 }),
		placeholderData: keepPreviousData,
		enabled: enabled && id !== undefined && id > 0,
	});
}

export function useCreateDeliveryNoteMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: DnCreatePayload) => createDeliveryNote(payload),
		onSuccess: () => {
			invalidateAfterNote(queryClient);
			toast.success("Draft delivery note saved");
		},
		// 400 / 409 are shown by the form.
	});
}

/** The id is a variable: a form that just created its note keeps saving to the same draft. */
export function useUpdateDeliveryNoteMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (args: { id: number; payload: DnUpdatePayload }) =>
			updateDeliveryNote(args.id, args.payload),
		onSuccess: () => {
			invalidateAfterNote(queryClient);
			toast.success("Delivery note saved");
		},
	});
}

export function usePostDeliveryNoteMutation(id: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => postDeliveryNote(id),
		onSuccess: (result) => {
			invalidateAfterNote(queryClient, {
				soId: result.data.soId,
				stock: true,
			});
			toast.success(`Delivery note ${result.data.dnNumber ?? ""} posted`);
		},
		// The dialog shows the error text.
	});
}

export function useCancelDeliveryNoteDraftMutation(id: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: DnReasonPayload) =>
			cancelDeliveryNoteDraft(id, payload),
		onSuccess: () => {
			invalidateAfterNote(queryClient);
			toast.success("Draft delivery note cancelled");
		},
	});
}

export function useCancelDeliveryNoteMutation(id: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: DnReasonPayload) => cancelDeliveryNote(id, payload),
		onSuccess: (result) => {
			invalidateAfterNote(queryClient, {
				soId: result.data.soId,
				stock: true,
			});
			toast.success("Delivery note cancelled. Stock is back.");
		},
	});
}

export function useUpdateTransportMutation(id: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: DnTransportInput) =>
			updateDeliveryNoteTransport(id, payload),
		onSuccess: () => {
			invalidateAfterNote(queryClient);
			toast.success("Transport updated");
		},
	});
}
