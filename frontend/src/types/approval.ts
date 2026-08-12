import { z } from "zod";

export type ApprovalDocType = "pr" | "po" | "sco";

export type ApprovalApproverType = "role" | "specific";

export type ApprovalRequestAction =
	| "approve"
	| "reject"
	| "sent_back"
	| "cancel";

export type ApprovalRequestStatus =
	| "pending_approval"
	| "approved"
	| "rejected"
	| "require_more_info"
	| "partial_ordered"
	| "fully_ordered"
	| "cancelled"
	| "auto_approved";

export type ApprovalTrailAction =
	| "submitted"
	| "approved"
	| "rejected"
	| "require_more_info"
	| "auto_approved"
	| "cancelled";

export type ApprovalPolicySortField =
	| "name"
	| "docType"
	| "priority"
	| "isActive";

export type ApprovalPendingSortField = "requestedAt" | "docType" | "status";

export type ApprovalPolicyChainLevel = {
	level: number;
	approverType: ApprovalApproverType;
	role: string | null;
	employeeId: number | null;
};

// Request payload row: only the key relevant to `approverType` is sent.
// role  -> { role } (no employeeId)
// specific -> { employeeId } (no role)
export type ApprovalPolicyChainLevelInput = {
	level: number;
	approverType: ApprovalApproverType;
	role?: string;
	employeeId?: number;
};

export type ApprovalPolicyPrType =
	| "sale_order"
	| "stock_reorder"
	| "maintenance"
	| "tooling"
	| "subcontracting"
	| "misc";

export type ApprovalPolicySummary = {
	id: number;
	name: string;
	description: string | null;
	isActive: boolean;
	priority: number;
	docType: ApprovalDocType;
	prType: ApprovalPolicyPrType | string | null;
	isSaleOrderLinked: boolean | null;
	minAmountPaise: number | null;
	maxAmountPaise: number | null;
	autoApprove: boolean;
	approvalLevels: number;
	approvalChain: ApprovalPolicyChainLevel[];
	createdAt: string;
	createdBy: number | null;
	lastUpdatedAt: string;
	lastUpdatedBy: number | null;
};

export type ApprovalPolicyDetails = ApprovalPolicySummary;

export type ApprovalPolicyUpdateInput = Partial<{
	name: string;
	description: string | null;
	isActive: boolean;
	priority: number;
	prType: ApprovalPolicyPrType | null;
	isSaleOrderLinked: boolean | null;
	minAmountPaise: number | null;
	maxAmountPaise: number | null;
	autoApprove: boolean;
	approvalChain: ApprovalPolicyChainLevelInput[];
}>;

export type ApprovalPolicyCreateInput = {
	name: string;
	description?: string;
	isActive?: boolean;
	priority: number;
	docType: ApprovalDocType;
	prType?: ApprovalPolicyPrType;
	isSaleOrderLinked?: boolean;
	minAmountPaise?: number;
	maxAmountPaise?: number;
	autoApprove?: boolean;
	approvalChain: ApprovalPolicyChainLevelInput[];
};

export type ApprovalPolicyListParams = {
	page?: number;
	pageSize?: number;
	sortBy?: ApprovalPolicySortField;
	sortDir?: "asc" | "desc";
	docType?: ApprovalDocType;
	isActive?: boolean;
	q?: string;
};

export type ApprovalSubmitRequestInput = {
	docType: ApprovalDocType;
	docId: number;
};

export type ApprovalActionInput = {
	action: ApprovalRequestAction;
	notes?: string;
};

export type ApprovalMyPendingParams = {
	page?: number;
	pageSize?: number;
	employeeId?: number;
	docType?: ApprovalDocType;
	sortBy?: ApprovalPendingSortField;
	sortDir?: "asc" | "desc";
};

export type PaginationMeta = {
	page: number;
	pageSize: number;
	total: number;
	totalPages: number;
};

export type PaginatedResponse<T> = {
	success: true;
	data: T[];
	meta: PaginationMeta;
};

export type ApprovalRequest = {
	id: number;
	docType: ApprovalDocType;
	docId: number;
	policyId: number;
	status: ApprovalRequestStatus;
	currentLevel: number;
	totalLevels: number;
	chainSnapshot: ApprovalPolicyChainLevel[];
	currentApproverRole: string | null;
	currentApproverEmployeeId: number | null;
	requestedBy: number;
	requestedAt: string;
	completedAt: string | null;
};

export type ApprovalDocSummary = {
	docNumber: string;
	amountPaise: number;
	supplierName?: string | null;
};

export type ApprovalRequestSummary = ApprovalRequest & {
	policyName: string;
	docSummary: ApprovalDocSummary;
};

export type ApprovalRequestDetails = ApprovalRequestSummary & {
	policyDescription: string | null;
};

export type ApprovalTrailEntry = {
	id: number;
	requestId: number;
	docType: ApprovalDocType;
	docId: number;
	level: number;
	action: ApprovalTrailAction;
	actionBy: number;
	actorName: string;
	actionAt: string;
	notes: string | null;
};

export type ApprovalCurrentByDocResponse = ApprovalRequestSummary | null;

export const approvalPolicyFormSchema = z.object({
  name: z.string().min(1, "Policy name is required"),
  description: z.string().optional().default(""),
  isActive: z.boolean().default(true),
  priority: z.coerce.number().int().min(1, "Priority must be greater than 0"),
  docType: z.enum(["pr", "po", "sco"]),
  subDocType: z
    .enum([
      "any",
      "sale_order",
      "stock_reorder",
      "maintenance",
      "tooling",
      "subcontracting",
      "misc",
    ])
    .or(z.literal(""))
    .default(""),
  // isSaleOrderLinked: z.enum(["any", "yes", "no"]).default("any"),
  minAmountPaise: z.string().optional().default(""),
  maxAmountPaise: z.string().optional().default(""),
  autoApprove: z.boolean().default(false),
  approvalChain: z
    .array(
      z.object({
        approverType: z.enum(["role", "specific"]),
        role: z.string().default(""),
        employeeId: z.number().nullable().default(null),
        employeeSearch: z.string().default(""),
      }),
    )
    .min(1),
});

export type ApprovalPolicyFormInput = z.infer<typeof approvalPolicyFormSchema>;
