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
	CompanySettingsPayload,
	ScoCreatePayload,
	ScoListParams,
	ScoUpdatePayload,
} from "@/types/subcontracting";

import {
	cancelSco,
	createSco,
	getCompanySettings,
	getScoById,
	getScos,
	saveCompanySettings,
	submitSco,
	updateSco,
} from "./fetchers";

export const scoKeys = {
	list: (params?: ScoListParams) =>
		params
			? (["subcontracting", "list", params] as const)
			: (["subcontracting", "list"] as const),
	detail: (scoId: number) => ["subcontracting", "detail", scoId] as const,
	companySettings: () => ["company", "settings"] as const,
};

// The backend message is already user-facing for 400/409, so show it as-is.
function errorMessage(error: unknown, fallback: string) {
	return error instanceof ApiClientError ? error.message : fallback;
}

export function useScosQuery(params: ScoListParams) {
	return useQuery({
		queryKey: scoKeys.list(params),
		queryFn: () => getScos(params),
		placeholderData: keepPreviousData,
	});
}

export function useScoDetailQuery(scoId: number) {
	return useQuery({
		queryKey: scoKeys.detail(scoId),
		queryFn: () => getScoById(scoId),
		enabled: Number.isFinite(scoId) && scoId > 0,
	});
}

export function useCreateScoMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (payload: ScoCreatePayload) => createSco(payload),
		onSuccess: async (result) => {
			if (!result.success) {
				toast.error(result.message || "Failed to create SCO");
				return;
			}
			await queryClient.invalidateQueries({ queryKey: scoKeys.list() });
			toast.success(
				result.message || `${result.data.sco.scoNumber} draft created`,
			);
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to create SCO"));
		},
	});
}

export function useUpdateScoMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (payload: ScoUpdatePayload) => updateSco(payload),
		onSuccess: async (result, payload) => {
			if (!result.success) {
				toast.error(result.message || "Failed to save SCO");
				return;
			}
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: scoKeys.list() }),
				queryClient.invalidateQueries({
					queryKey: scoKeys.detail(payload.scoId),
				}),
			]);
			toast.success(result.message || "SCO saved");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to save SCO"));
		},
	});
}

export function useSubmitScoMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (scoId: number) => submitSco(scoId),
		onSuccess: async (result, scoId) => {
			if (!result.success) {
				toast.error(result.message || "Failed to submit SCO");
				return;
			}
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: scoKeys.list() }),
				queryClient.invalidateQueries({ queryKey: scoKeys.detail(scoId) }),
			]);
			toast.success(
				result.message ||
					(result.data.sco.status === "approved"
						? "SCO approved"
						: "SCO sent for approval"),
			);
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to submit SCO"));
		},
	});
}

export function useCancelScoMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (variables: { scoId: number; reason: string }) =>
			cancelSco(variables.scoId, { reason: variables.reason }),
		onSuccess: async (result, variables) => {
			if (!result.success) {
				toast.error(result.message || "Failed to cancel SCO");
				return;
			}
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: scoKeys.list() }),
				queryClient.invalidateQueries({
					queryKey: scoKeys.detail(variables.scoId),
				}),
			]);
			toast.success(result.message || "SCO cancelled");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to cancel SCO"));
		},
	});
}

export function useCompanySettingsQuery(enabled = true) {
	return useQuery({
		queryKey: scoKeys.companySettings(),
		queryFn: getCompanySettings,
		enabled,
	});
}

export function useSaveCompanySettingsMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (payload: CompanySettingsPayload) =>
			saveCompanySettings(payload),
		onSuccess: async (result) => {
			if (!result.success) {
				toast.error(result.message || "Failed to save company details");
				return;
			}
			await queryClient.invalidateQueries({
				queryKey: scoKeys.companySettings(),
			});
			toast.success(result.message || "Company details saved");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to save company details"));
		},
	});
}
