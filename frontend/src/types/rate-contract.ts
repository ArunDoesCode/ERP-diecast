// Rate contract API types. Source: .pipeline/scm-rfq/contract.md (manifest /api/rate-contract/*).
import type { PaginationMeta } from "@/types/suppliers";

export type ContractStatus = "draft" | "active" | "terminated" | "cancelled";
export type ContractEffectiveStatus = ContractStatus | "expired";

export const CONTRACT_REASON_MIN = 3;
export const CONTRACT_REASON_MAX = 500;
export const CONTRACT_NOTES_MAX = 2000;
export const CONTRACT_ALLOWANCE_MAX = 20;
export const CONTRACT_GST_PERCENTS = [
	0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 28, 40,
] as const;

export type DataResponse<T> = { success: true; data: T };
export type PagedResponse<T> = {
	success: true;
	data: T[];
	meta: PaginationMeta;
};

export type ContractListRow = {
	id: number;
	contractNumber: string;
	supplierId: number;
	supplierName: string;
	status: ContractStatus;
	effectiveStatus: ContractEffectiveStatus;
	validFrom: string;
	validTo: string;
	itemCount: number;
	orderedPercent: number | null;
	createdAt: string;
};
export type ContractListParams = {
	page?: number;
	pageSize?: number;
	sortBy?:
		| "id"
		| "contractNumber"
		| "validFrom"
		| "validTo"
		| "createdAt"
		| "status";
	sortDir?: "asc" | "desc";
	q?: string;
	status?: "draft" | "active" | "expired" | "terminated" | "cancelled";
	supplierId?: number;
	itemId?: number;
	endsWithinDays?: number;
};

export type ContractLine = {
	id: number;
	itemId: number;
	itemCode: string;
	itemName: string;
	uom: string;
	ratePaise: number;
	gstPercent: number;
	agreedQty: number | null;
	orderedQty: number;
	receivedQty: number;
	percentOrdered: number | null;
	capQty: number | null;
};
export type ContractPo = {
	poId: number;
	poNumber: string;
	prId: number | null;
	status: string;
	lineCount: number;
};
export type ContractDetails = {
	id: number;
	contractNumber: string;
	supplierId: number;
	supplierName: string;
	status: ContractStatus;
	effectiveStatus: ContractEffectiveStatus;
	validFrom: string;
	validTo: string;
	allowancePercent: number;
	notes: string | null;
	createdBy: number;
	createdByName: string | null;
	createdAt: string;
	lastUpdatedAt: string | null;
	activatedByName: string | null;
	activatedAt: string | null;
	terminatedOn: string | null;
	terminatedByName: string | null;
	terminatedAt: string | null;
	terminateReason: string | null;
	cancelledByName: string | null;
	cancelledAt: string | null;
	cancelReason: string | null;
	lines: ContractLine[];
	pos: ContractPo[];
};

export type ContractLineInput = {
	itemId: number;
	ratePaise: number;
	gstPercent: number;
	agreedQty: number | null;
};
export type ContractBody = {
	supplierId: number;
	validFrom: string;
	validTo: string;
	allowancePercent?: number;
	notes?: string;
	lines: ContractLineInput[];
};
export type ContractUpdatePayload = ContractBody & { id: number };
export type ContractReasonPayload = { reason: string };
export type ContractTerminatePayload = {
	reason: string;
	terminatedOn?: string;
};
