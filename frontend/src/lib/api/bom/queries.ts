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
	BomCreatePayload,
	BomHistoryParams,
	BomListParams,
	BomNeedsParams,
	BomReleasePayload,
	BomRetirePayload,
	BomUpdatePayload,
	BomWhereUsedParams,
} from "@/types/bom";

import {
	createBom,
	deleteBom,
	getBom,
	getBomChangeSummary,
	getBomHistory,
	getBomNeeds,
	getBoms,
	getBomTree,
	getBomWhereUsed,
	releaseBom,
	retireBom,
	startBomRevision,
	updateBom,
} from "./fetchers";

export const bomKeys = {
	all: ["bom"] as const,
	list: (params?: BomListParams) => ["bom", "list", params ?? {}] as const,
	detail: (bomId: number) => ["bom", "detail", bomId] as const,
	tree: (bomId: number) => ["bom", "tree", bomId] as const,
	changeSummary: (bomId: number) => ["bom", "change-summary", bomId] as const,
	needs: (params: BomNeedsParams) => ["bom", "needs", params] as const,
	whereUsed: (itemId: number, params?: BomWhereUsedParams) =>
		["bom", "where-used", itemId, params ?? {}] as const,
	history: (partId: number, params?: BomHistoryParams) =>
		["bom", "history", partId, params ?? {}] as const,
};

/** Message shown to the user; the server text is already plain words for 400/409. */
export function bomErrorMessage(error: unknown, fallback: string) {
	return error instanceof ApiClientError ? error.message : fallback;
}

export function useBomsQuery(params: BomListParams, enabled = true) {
	return useQuery({
		queryKey: bomKeys.list(params),
		queryFn: () => getBoms(params),
		placeholderData: keepPreviousData,
		enabled,
	});
}

export function useBomQuery(bomId: number | undefined) {
	return useQuery({
		queryKey: bomKeys.detail(bomId ?? 0),
		queryFn: () => getBom(bomId as number),
		enabled: bomId !== undefined && bomId > 0,
	});
}

export function useBomTreeQuery(bomId: number | undefined) {
	return useQuery({
		queryKey: bomKeys.tree(bomId ?? 0),
		queryFn: () => getBomTree(bomId as number),
		enabled: bomId !== undefined && bomId > 0,
	});
}

export function useBomChangeSummaryQuery(bomId: number, enabled: boolean) {
	return useQuery({
		queryKey: bomKeys.changeSummary(bomId),
		queryFn: () => getBomChangeSummary(bomId),
		enabled: enabled && bomId > 0,
		// A summary read at open time must not be reused from an older draft version.
		gcTime: 0,
	});
}

/** Needs preview runs only when the user presses Calculate: `params` is null until then. */
export function useBomNeedsQuery(params: BomNeedsParams | null) {
	return useQuery({
		queryKey: params
			? bomKeys.needs(params)
			: (["bom", "needs", "idle"] as const),
		queryFn: () => getBomNeeds(params as BomNeedsParams),
		enabled: params !== null,
		retry: false,
	});
}

export function useBomWhereUsedQuery(
	itemId: number,
	params?: BomWhereUsedParams,
	enabled = true,
) {
	return useQuery({
		queryKey: bomKeys.whereUsed(itemId, params),
		queryFn: () => getBomWhereUsed(itemId, params),
		enabled: enabled && itemId > 0,
		placeholderData: keepPreviousData,
	});
}

export function useBomHistoryQuery(partId: number, params?: BomHistoryParams) {
	return useQuery({
		queryKey: bomKeys.history(partId, params),
		queryFn: () => getBomHistory(partId, params),
		enabled: partId > 0,
		placeholderData: keepPreviousData,
	});
}

export function useCreateBomMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: BomCreatePayload) => createBom(payload),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: bomKeys.all });
			toast.success("Draft saved");
		},
		// 409 BOM_ALREADY_EXISTS is handled by the form (inline banner with link).
	});
}

export function useUpdateBomMutation(bomId: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: BomUpdatePayload) => updateBom(bomId, payload),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: bomKeys.all });
			toast.success("Draft saved");
		},
		onError: (error) => {
			toast.error(bomErrorMessage(error, "Could not save the draft."));
		},
	});
}

export function useDeleteBomMutation(bomId: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => deleteBom(bomId),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: bomKeys.all });
			toast.success("Draft deleted");
		},
		onError: (error) => {
			toast.error(bomErrorMessage(error, "Could not delete the draft."));
		},
	});
}

export function useStartBomRevisionMutation(partId: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => startBomRevision(partId),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: bomKeys.all });
			toast.success("New revision started");
		},
		// 409 BOM_DRAFT_OPEN is turned into a toast with a link by the caller.
	});
}

export function useReleaseBomMutation(bomId: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: BomReleasePayload) => releaseBom(bomId, payload),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: bomKeys.all });
			toast.success("BOM released");
		},
		// 400 BOM_RELEASE_INVALID and 409s are shown inside the dialog.
	});
}

export function useRetireBomMutation(bomId: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: BomRetirePayload) => retireBom(bomId, payload),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: bomKeys.all });
			toast.success("BOM retired");
		},
		onError: (error) => {
			toast.error(bomErrorMessage(error, "Could not retire the BOM."));
		},
	});
}
