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
	ReorderItemsParams,
	ReorderOwnerCandidatesParams,
	ReorderRunsParams,
	ReorderSettingsPayload,
} from "@/types/reorder";

import {
	checkReorderNow,
	getReorderItems,
	getReorderOwnerCandidates,
	getReorderRun,
	getReorderRuns,
	getReorderSettings,
	updateReorderSettings,
} from "./fetchers";

export const reorderKeys = {
	all: ["reorder"] as const,
	items: (params?: ReorderItemsParams) =>
		["reorder", "items", params ?? {}] as const,
	runs: (params?: ReorderRunsParams) =>
		["reorder", "runs", params ?? {}] as const,
	run: (runId: number) => ["reorder", "run", runId] as const,
	settings: () => ["reorder", "settings"] as const,
	ownerCandidates: (params?: ReorderOwnerCandidatesParams) =>
		["reorder", "owner-candidates", params ?? {}] as const,
};

/** Server text is already plain words for 400 / 404 / 409. */
export function reorderErrorMessage(error: unknown, fallback: string) {
	return error instanceof ApiClientError ? error.message : fallback;
}

export function useReorderItemsQuery(params: ReorderItemsParams) {
	return useQuery({
		queryKey: reorderKeys.items(params),
		queryFn: () => getReorderItems(params),
		placeholderData: keepPreviousData,
		// The server re-classifies every item per request; don't redo it on focus.
		staleTime: 30_000,
		refetchOnWindowFocus: false,
	});
}

export function useReorderRunsQuery(params: ReorderRunsParams) {
	return useQuery({
		queryKey: reorderKeys.runs(params),
		queryFn: () => getReorderRuns(params),
		placeholderData: keepPreviousData,
	});
}

/** The run detail polls every 3 s while the run is still running. */
export function useReorderRunQuery(runId: number) {
	return useQuery({
		queryKey: reorderKeys.run(runId),
		queryFn: () => getReorderRun(runId),
		enabled: runId > 0,
		refetchInterval: (query) =>
			query.state.data?.data.state === "running" ? 3000 : false,
	});
}

export function useReorderSettingsQuery(enabled = true) {
	return useQuery({
		queryKey: reorderKeys.settings(),
		queryFn: () => getReorderSettings(),
		enabled,
	});
}

export function useReorderOwnerCandidatesQuery(
	params: ReorderOwnerCandidatesParams,
	enabled = true,
) {
	return useQuery({
		queryKey: reorderKeys.ownerCandidates(params),
		queryFn: () => getReorderOwnerCandidates(params),
		enabled,
		placeholderData: keepPreviousData,
	});
}

export function useCheckReorderNowMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => checkReorderNow(),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: reorderKeys.all });
			void queryClient.invalidateQueries({
				queryKey: purchaseRequisitionKeys.cards(),
			});
		},
		onError: (error) => {
			if (
				error instanceof ApiClientError &&
				error.code === "REORDER_RUN_BUSY"
			) {
				toast.error("A check is already running");
				return;
			}
			toast.error(
				reorderErrorMessage(error, "The check could not be started."),
			);
		},
	});
}

export function useUpdateReorderSettingsMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: ReorderSettingsPayload) =>
			updateReorderSettings(payload),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: reorderKeys.settings() });
			toast.success("Settings saved");
		},
		// 400 REORDER_OWNER_INVALID is shown under the owner field by the dialog.
	});
}
