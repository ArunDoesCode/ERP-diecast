"use client";

import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { ApiClientError } from "@/lib/api/client";
import { prErrorMessage } from "@/lib/api/purchase-requisitions/error-messages";
import type {
	ApprovalActionInput,
	ApprovalDocType,
	ApprovalMyPendingParams,
	ApprovalPolicyCreateInput,
	ApprovalPolicyListParams,
	ApprovalPolicyUpdateInput,
	ApprovalSubmitRequestInput,
} from "@/types/approval";

import {
	actOnApprovalRequest,
	createApprovalPolicy,
	getApprovalPolicies,
	getApprovalPolicyDetails,
	getApprovalRequestDetails,
	getApprovalRequestTrail,
	getCurrentApprovalByDoc,
	getMyPendingApprovals,
	submitApprovalRequest,
	updateApprovalPolicy,
} from "./fetchers";

export const approvalKeys = {
	policies: (params?: ApprovalPolicyListParams) =>
		params
			? (["approval", "policies", params] as const)
			: (["approval", "policies"] as const),
	policyDetails: (id: number) => ["approval", "policy", id] as const,
	requestDetails: (id: number) => ["approval", "request", id] as const,
	requestTrail: (id: number) => ["approval", "request-trail", id] as const,
	myPending: (params?: ApprovalMyPendingParams) =>
		params
			? (["approval", "pending", params] as const)
			: (["approval", "pending"] as const),
	currentByDoc: (docType: ApprovalDocType, docId: number) =>
		["approval", "current-by-doc", docType, docId] as const,
};

function errorMessage(error: unknown, fallback: string) {
	return error instanceof ApiClientError
		? prErrorMessage(error, fallback)
		: fallback;
}

export function useApprovalPoliciesQuery(params?: ApprovalPolicyListParams) {
	return useQuery({
		queryKey: approvalKeys.policies(params),
		queryFn: () => getApprovalPolicies(params),
		placeholderData: params ? keepPreviousData : undefined,
	});
}

export function useApprovalPolicyDetailsQuery(id?: number) {
	return useQuery({
		queryKey: approvalKeys.policyDetails(id ?? 0),
		queryFn: () => getApprovalPolicyDetails(id ?? 0),
		enabled: typeof id === "number",
	});
}

export function useUpdateApprovalPolicyMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			id,
			input,
		}: {
			id: number;
			input: ApprovalPolicyUpdateInput;
		}) => updateApprovalPolicy(id, input),
		onSuccess: async (_, variables) => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: approvalKeys.policies() }),
				queryClient.invalidateQueries({
					queryKey: approvalKeys.policyDetails(variables.id),
				}),
			]);
			toast.success("Policy updated");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to update policy"));
		},
	});
}

export function useCreateApprovalPolicyMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (input: ApprovalPolicyCreateInput) =>
			createApprovalPolicy(input),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: approvalKeys.policies(),
			});
			toast.success("Policy created");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to create policy"));
		},
	});
}

export function useSubmitApprovalRequestMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (input: ApprovalSubmitRequestInput) =>
			submitApprovalRequest(input),
		onSuccess: async (result, variables) => {
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: approvalKeys.myPending(),
				}),
				queryClient.invalidateQueries({
					queryKey: approvalKeys.currentByDoc(
						variables.docType,
						variables.docId,
					),
				}),
				queryClient.invalidateQueries({ queryKey: ["purchase-requisitions"] }),
			]);
			toast.success(result.message || "Submitted for approval");
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to submit approval request"));
		},
	});
}

export function useApprovalRequestDetailsQuery(id?: number) {
	return useQuery({
		queryKey: approvalKeys.requestDetails(id ?? 0),
		queryFn: () => getApprovalRequestDetails(id ?? 0),
		enabled: typeof id === "number",
	});
}

export function useApprovalRequestTrailQuery(id?: number) {
	return useQuery({
		queryKey: approvalKeys.requestTrail(id ?? 0),
		queryFn: () => getApprovalRequestTrail(id ?? 0),
		enabled: typeof id === "number",
	});
}

export function useActOnApprovalRequestMutation() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, input }: { id: number; input: ApprovalActionInput }) =>
			actOnApprovalRequest(id, input),
		onSuccess: async (result, variables) => {
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: approvalKeys.requestDetails(variables.id),
				}),
				queryClient.invalidateQueries({
					queryKey: approvalKeys.requestTrail(variables.id),
				}),
				queryClient.invalidateQueries({ queryKey: approvalKeys.myPending() }),
				queryClient.invalidateQueries({
					queryKey: ["approval", "current-by-doc"],
				}),
				queryClient.invalidateQueries({ queryKey: ["purchase-requisitions"] }),
			]);
			if (result.success) {
				const messageByAction: Record<ApprovalActionInput["action"], string> = {
					approve: "Approval approved",
					reject: "Approval rejected",
					sent_back: "Approval sent back",
					cancel: "Approval cancelled",
					withdraw: "Withdrawn - PR is back in draft",
				};
				toast.success(
					result.message || messageByAction[variables.input.action],
				);
			}
		},
		onError: (error) => {
			toast.error(errorMessage(error, "Failed to update approval request"));
		},
	});
}

export function useMyPendingApprovalsQuery(params?: ApprovalMyPendingParams) {
	return useQuery({
		queryKey: approvalKeys.myPending(params),
		queryFn: () => getMyPendingApprovals(params),
		placeholderData: params ? keepPreviousData : undefined,
	});
}

export function useCurrentApprovalByDocQuery(
	docType?: ApprovalDocType,
	docId?: number,
) {
	return useQuery({
		queryKey: approvalKeys.currentByDoc(docType ?? "pr", docId ?? 0),
		queryFn: () => getCurrentApprovalByDoc(docType ?? "pr", docId ?? 0),
		enabled: Boolean(docType && docId),
	});
}
