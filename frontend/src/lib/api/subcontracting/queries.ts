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
	ChallanCreatePayload,
	CompanySettingsPayload,
	LossLogParams,
	OpenChallanParams,
	QaDecisionPayload,
	ReceiptCreatePayload,
	ScoCreatePayload,
	ScoListParams,
	ScoUpdatePayload,
	VendorStockParams,
} from "@/types/subcontracting";

import {
	cancelSco,
	closeSco,
	createReceipt,
	createSco,
	decideReceiptQa,
	getChallanById,
	getCompanySettings,
	getLossLog,
	getOpenChallans,
	getReceiptById,
	getScoById,
	getScoChallans,
	getScoReceipts,
	getScos,
	getVendorStock,
	issueChallan,
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
	challans: (scoId: number) => ["subcontracting", "challans", scoId] as const,
	openChallans: (params?: OpenChallanParams) =>
		params
			? (["subcontracting", "open-challans", params] as const)
			: (["subcontracting", "open-challans"] as const),
	receipts: (scoId: number) => ["subcontracting", "receipts", scoId] as const,
	receiptDetail: (receiptId: number) =>
		["subcontracting", "receipt", receiptId] as const,
	vendorStock: (params?: VendorStockParams) =>
		["subcontracting", "vendor-stock", params ?? {}] as const,
	lossLog: (params?: LossLogParams) =>
		["subcontracting", "loss-log", params ?? {}] as const,
	challanDetail: (challanId: number) =>
		["subcontracting", "challan", challanId] as const,
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

export function useScoChallansQuery(scoId: number) {
	return useQuery({
		queryKey: scoKeys.challans(scoId),
		queryFn: () => getScoChallans(scoId),
		enabled: Number.isFinite(scoId) && scoId > 0,
	});
}

export function useOpenChallansQuery(params: OpenChallanParams) {
	return useQuery({
		queryKey: scoKeys.openChallans(params),
		queryFn: () => getOpenChallans(params),
		placeholderData: keepPreviousData,
	});
}

export function useChallanDetailQuery(challanId: number) {
	return useQuery({
		queryKey: scoKeys.challanDetail(challanId),
		queryFn: () => getChallanById(challanId),
		enabled: Number.isFinite(challanId) && challanId > 0,
	});
}

export function useIssueChallanMutation(scoId: number) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (payload: ChallanCreatePayload) => issueChallan(scoId, payload),
		onSuccess: async (result) => {
			if (!result.success) {
				toast.error(result.message || "Failed to issue material");
				return;
			}
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: scoKeys.list() }),
				queryClient.invalidateQueries({ queryKey: scoKeys.detail(scoId) }),
				queryClient.invalidateQueries({ queryKey: scoKeys.challans(scoId) }),
				queryClient.invalidateQueries({ queryKey: scoKeys.openChallans() }),
				queryClient.invalidateQueries({
					queryKey: ["subcontracting", "vendor-stock"],
				}),
				queryClient.invalidateQueries({ queryKey: ["inventory"] }),
			]);
			toast.success(
				result.message ||
					`Challan ${result.data.challan.challanNumber} created`,
			);
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to issue material"));
		},
	});
}

export function useScoReceiptsQuery(scoId: number) {
	return useQuery({
		queryKey: scoKeys.receipts(scoId),
		queryFn: () => getScoReceipts(scoId),
		enabled: Number.isFinite(scoId) && scoId > 0,
	});
}

export function useReceiptDetailQuery(receiptId: number | null) {
	return useQuery({
		queryKey: scoKeys.receiptDetail(receiptId ?? 0),
		queryFn: () => getReceiptById(receiptId as number),
		enabled: receiptId !== null && receiptId > 0,
	});
}

export function useCreateReceiptMutation(scoId: number) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (payload: ReceiptCreatePayload) =>
			createReceipt(scoId, payload),
		onSuccess: async (result) => {
			if (!result.success) {
				toast.error(result.message || "Failed to record receipt");
				return;
			}
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: scoKeys.list() }),
				queryClient.invalidateQueries({ queryKey: scoKeys.detail(scoId) }),
				queryClient.invalidateQueries({ queryKey: scoKeys.receipts(scoId) }),
				queryClient.invalidateQueries({ queryKey: scoKeys.challans(scoId) }),
				queryClient.invalidateQueries({ queryKey: scoKeys.openChallans() }),
				queryClient.invalidateQueries({
					queryKey: ["subcontracting", "vendor-stock"],
				}),
				queryClient.invalidateQueries({ queryKey: ["inventory"] }),
			]);
			toast.success(
				result.message || `Receipt ${result.data.receipt.grnNumber} recorded`,
			);
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to record receipt"));
		},
	});
}

export function useDecideQaMutation(scoId: number, receiptId: number) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (variables: { lineId: number } & QaDecisionPayload) => {
			const { lineId, ...payload } = variables;
			return decideReceiptQa(receiptId, lineId, payload);
		},
		onSuccess: async (result) => {
			if (!result.success) {
				toast.error(result.message || "Failed to save QA decision");
				return;
			}
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: scoKeys.list() }),
				queryClient.invalidateQueries({ queryKey: scoKeys.detail(scoId) }),
				queryClient.invalidateQueries({ queryKey: scoKeys.receipts(scoId) }),
				queryClient.invalidateQueries({
					queryKey: scoKeys.receiptDetail(receiptId),
				}),
				queryClient.invalidateQueries({
					queryKey: ["subcontracting", "vendor-stock"],
				}),
				queryClient.invalidateQueries({ queryKey: ["inventory"] }),
			]);
			toast.success(result.message || "QA decision saved");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to save QA decision"));
		},
	});
}

export function useVendorStockQuery(params: VendorStockParams) {
	return useQuery({
		queryKey: scoKeys.vendorStock(params),
		queryFn: () => getVendorStock(params),
		placeholderData: keepPreviousData,
	});
}

export function useLossLogQuery(params: LossLogParams) {
	return useQuery({
		queryKey: scoKeys.lossLog(params),
		queryFn: () => getLossLog(params),
		placeholderData: keepPreviousData,
	});
}

export function useCloseScoMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (variables: { scoId: number; reason?: string }) =>
			closeSco(variables.scoId, { reason: variables.reason }),
		onSuccess: async (result, variables) => {
			if (!result.success) {
				toast.error(result.message || "Failed to close SCO");
				return;
			}
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: scoKeys.list() }),
				queryClient.invalidateQueries({
					queryKey: scoKeys.detail(variables.scoId),
				}),
				queryClient.invalidateQueries({
					queryKey: scoKeys.challans(variables.scoId),
				}),
				queryClient.invalidateQueries({ queryKey: scoKeys.openChallans() }),
				queryClient.invalidateQueries({
					queryKey: ["subcontracting", "vendor-stock"],
				}),
				queryClient.invalidateQueries({
					queryKey: ["subcontracting", "loss-log"],
				}),
				queryClient.invalidateQueries({ queryKey: ["inventory"] }),
			]);
			toast.success(result.message || "SCO closed");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to close SCO"));
		},
	});
}
