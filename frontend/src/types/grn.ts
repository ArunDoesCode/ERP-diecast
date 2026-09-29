import type {
	ApiResult,
	PaginatedResponse,
} from "@/types/purchase-requisitions";

export const grnStatusValues = [
	"draft",
	"pending_qa",
	"accepted",
	"rejected",
	"partial_accepted",
] as const;
export type GrnStatus = (typeof grnStatusValues)[number];

export const grnQaStatusValues = [
	"pending",
	"passed",
	"failed",
	"waived",
] as const;
export type GrnQaStatus = (typeof grnQaStatusValues)[number];

export type GrnSortField = "id" | "grnNumber" | "status" | "receivedDate";

export interface Grn {
	id: number;
	grnNumber: string;
	poId: number | null;
	supplierId: number;
	status: GrnStatus;
	receivedDate: string | null;
	createdBy: number | null;
	challanNo: string | null;
	challanDate: string | null;
	vehicleNo: string | null;
	driverName: string | null;
	driverPhone: string | null;
	remarks: string | null;
}

export interface GrnItem {
	id: number;
	grnId: number | null;
	poItemId: number | null;
	receivedQty: number;
	acceptedQty: number;
	rejectedQty: number | null;
	qaStatus: GrnQaStatus | null;
	isQaBypassed: boolean | null;
	qaBypassReason: string | null;
	qaBypassedBy: number | null;
	qaBypassedAt: string | null;
	challanPhotoUrl: string | null;
	batchNumber: string | null;
	overReceiptExcessQty: number | null;
	overReceiptReason: string | null;
	overReceiptBy: number | null;
}

export interface GrnItemDetail extends GrnItem {
	itemId: number;
	itemSku: string;
	itemName: string;
	orderedQty: number;
	correctedQty: number;
	netAcceptedQty: number;
}

export interface GrnDetailPayload {
	grn: Grn;
	items: GrnItemDetail[];
}

export type GrnListParams = {
	page?: number;
	pageSize?: number;
	sortBy?: GrnSortField;
	sortDir?: "asc" | "desc";
	poId?: number;
	status?: GrnStatus;
	qaStatus?: GrnQaStatus;
	q?: string;
};

export type GrnListResult = PaginatedResponse<Grn>;
export type GrnDetailResult = ApiResult<GrnDetailPayload>;

export type GrnCreatePayload = {
	poId: number;
	challanNo: string;
	challanDate?: string;
	vehicleNo?: string;
	driverName?: string;
	driverPhone?: string;
	remarks?: string;
	lines: Array<{ poItemId: number; arrivedQty: number; batchNumber?: string }>;
};
export type GrnCreateResult = ApiResult<GrnDetailPayload>;

export type GrnUpdatePayload = {
	grnId: number;
	challanNo?: string;
	challanDate?: string | null;
	vehicleNo?: string | null;
	driverName?: string | null;
	driverPhone?: string | null;
	remarks?: string | null;
	lines?: Array<{
		id: number;
		arrivedQty: number;
		batchNumber?: string | null;
	}>;
};
export type GrnUpdateResult = ApiResult<GrnDetailPayload>;
export type GrnDeleteResult = ApiResult<{ id: number }>;

export type GrnQaDecisionPayload = {
	acceptedQty: number;
	rejectedQty: number;
	remarks?: string;
	certificateUrl?: string;
	batchNumber?: string;
	overrideReason?: string;
};
export type GrnBypassPayload = {
	bypassReason: string;
	acceptedQty?: number;
	batchNumber?: string;
	overrideReason?: string;
};
export type GrnCorrectionPayload = { qty: number; reason: string };

export type GrnLineActionResult = ApiResult<GrnItem>;
export type GrnCorrectionResult = ApiResult<{
	id: number;
	quantityChange: number;
	[key: string]: unknown;
}>;
