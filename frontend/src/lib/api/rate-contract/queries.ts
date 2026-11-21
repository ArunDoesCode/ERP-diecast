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
import type {
	ContractBody,
	ContractListParams,
	ContractReasonPayload,
	ContractTerminatePayload,
	ContractUpdatePayload,
} from "@/types/rate-contract";

import {
	activateContract,
	cancelContract,
	createContract,
	getContract,
	getContracts,
	terminateContract,
	updateContract,
} from "./fetchers";

export const rateContractKeys = {
	all: ["rate-contracts"] as const,
	lists: () => ["rate-contracts", "list"] as const,
	list: (params?: ContractListParams) =>
		["rate-contracts", "list", params ?? {}] as const,
	detail: (id: number) => ["rate-contracts", "detail", id] as const,
};

/** Plain words per error code (screens.md). Server text is the fallback. */
export function contractErrorMessage(error: unknown, fallback: string) {
	if (!(error instanceof ApiClientError)) return fallback;
	switch (error.code) {
		case "CONTRACT_NOT_EDITABLE":
			return "Only a draft contract can be changed. Reload to see it.";
		case "CONTRACT_INVALID_STATUS":
			return "Someone already changed this contract. Reload to see it.";
		default:
			return error.message || fallback;
	}
}

/** The clashing contract number of a CONTRACT_OVERLAP error, if the server sent it. */
export function overlapContractNumber(error: unknown): string | null {
	if (!(error instanceof ApiClientError) || error.code !== "CONTRACT_OVERLAP") {
		return null;
	}
	const body = error.body as {
		details?: { contractNumber?: unknown };
	} | null;
	const number = body?.details?.contractNumber;
	return typeof number === "string" ? number : null;
}

/** A contract changes PO rate prefill and the PO line locks, so PO caches go stale with it. */
function invalidateContracts(queryClient: QueryClient) {
	void queryClient.invalidateQueries({ queryKey: rateContractKeys.all });
	void queryClient.invalidateQueries({
		queryKey: ["purchase-orders", "last-rate"],
	});
}

export function useContractsQuery(params: ContractListParams, enabled = true) {
	return useQuery({
		queryKey: rateContractKeys.list(params),
		queryFn: () => getContracts(params),
		placeholderData: keepPreviousData,
		enabled,
	});
}

export function useContractQuery(id: number | undefined) {
	return useQuery({
		queryKey: rateContractKeys.detail(id ?? 0),
		queryFn: () => getContract(id as number),
		enabled: id !== undefined && id > 0,
	});
}

export function useCreateContractMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: ContractBody) => createContract(payload),
		onSuccess: (result) => {
			invalidateContracts(queryClient);
			toast.success(`${result.data.contractNumber} saved as draft`);
		},
		// 400 / 409 are shown by the form.
	});
}

export function useUpdateContractMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: ContractUpdatePayload) => updateContract(payload),
		onSuccess: () => {
			invalidateContracts(queryClient);
			toast.success("Contract saved");
		},
	});
}

export function useActivateContractMutation(id: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => activateContract(id),
		onSuccess: () => {
			invalidateContracts(queryClient);
			toast.success("Contract activated");
		},
	});
}

export function useTerminateContractMutation(id: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: ContractTerminatePayload) =>
			terminateContract(id, payload),
		onSuccess: () => {
			invalidateContracts(queryClient);
			toast.success("Contract terminated");
		},
	});
}

export function useCancelContractMutation(id: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: ContractReasonPayload) => cancelContract(id, payload),
		onSuccess: () => {
			invalidateContracts(queryClient);
			toast.success("Contract cancelled");
		},
	});
}
