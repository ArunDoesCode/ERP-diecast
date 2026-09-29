import { api } from "@/lib/api/client";
import { API_ROUTES } from "@/lib/api/routes";
import type {
	ApprovalActionInput,
	ApprovalCurrentByDocResponse,
	ApprovalDocType,
	ApprovalHistoryEntry,
	ApprovalMyPendingParams,
	ApprovalPolicyCreateInput,
	ApprovalPolicyDetails,
	ApprovalPolicyListParams,
	ApprovalPolicySummary,
	ApprovalPolicyUpdateInput,
	ApprovalRequest,
	ApprovalRequestDetails,
	ApprovalRequestSummary,
	ApprovalSubmitRequestInput,
	ApprovalTrailEntry,
	PaginatedResponse,
} from "@/types/approval";

type Ok<T> = { success: true; data: T; message?: string };

function toQueryString(params?: Record<string, unknown>) {
	if (!params) return "";
	const entries = Object.entries(params).filter(
		([, value]) => value !== undefined,
	);
	if (entries.length === 0) return "";
	return `?${new URLSearchParams(entries.map(([key, value]) => [key, String(value)]))}`;
}

export const getApprovalPolicies = (params?: ApprovalPolicyListParams) =>
	api.get<PaginatedResponse<ApprovalPolicySummary>>(
		`${API_ROUTES.approval.getPolicies}${toQueryString(params)}`,
	);

export const getApprovalPolicyDetails = (id: number) =>
	api.get<Ok<ApprovalPolicyDetails>>(API_ROUTES.approval.getPolicyDetails(id));

export const createApprovalPolicy = (input: ApprovalPolicyCreateInput) =>
	api.post<Ok<{ id: number }>, ApprovalPolicyCreateInput>(
		API_ROUTES.approval.createPolicy,
		input,
	);

export const updateApprovalPolicy = (
	id: number,
	input: ApprovalPolicyUpdateInput,
) =>
	api.patch<Ok<{ id: number }>, ApprovalPolicyUpdateInput>(
		API_ROUTES.approval.updatePolicy(id),
		input,
	);

export const submitApprovalRequest = (input: ApprovalSubmitRequestInput) =>
	api.post<Ok<ApprovalRequest>, ApprovalSubmitRequestInput>(
		API_ROUTES.approval.submitRequest,
		input,
	);

export const getApprovalRequestDetails = (id: number) =>
	api.get<Ok<ApprovalRequestDetails>>(
		API_ROUTES.approval.getRequestDetails(id),
	);

export const getApprovalRequestTrail = (id: number) =>
	api.get<Ok<ApprovalTrailEntry[]>>(API_ROUTES.approval.getRequestTrail(id));

export const actOnApprovalRequest = (id: number, input: ApprovalActionInput) =>
	api.post<Ok<ApprovalRequest>, ApprovalActionInput>(
		API_ROUTES.approval.actOnRequest(id),
		input,
	);

export const getMyPendingApprovals = (params?: ApprovalMyPendingParams) =>
	api.get<PaginatedResponse<ApprovalRequestSummary>>(
		`${API_ROUTES.approval.getMyPendingApprovals}${toQueryString(params)}`,
	);

export const getCurrentApprovalByDoc = (
	docType: ApprovalDocType,
	docId: number,
) =>
	api.get<Ok<ApprovalCurrentByDocResponse>>(
		API_ROUTES.approval.getCurrentApprovalByDoc(docType, docId),
	);

export const getApprovalHistory = (docType: ApprovalDocType, docId: number) =>
	api.get<Ok<ApprovalHistoryEntry[]>>(
		API_ROUTES.approval.getApprovalHistory(docType, docId),
	);
