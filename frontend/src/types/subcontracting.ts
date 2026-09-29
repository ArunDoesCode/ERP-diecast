import { z } from "zod";

import type { ApiResult, PaginationMeta } from "@/types/suppliers";

export const scoStatusValues = [
	"draft",
	"pending_approval",
	"approved",
	"rejected",
	"require_more_info",
	"material_issued",
	"material_received",
	"closed",
	"cancelled",
] as const;

export type ScoStatus = (typeof scoStatusValues)[number];

export type ScoSortField =
	| "id"
	| "scoNumber"
	| "status"
	| "createdAt"
	| "expectedReturnDate";

export interface Sco {
	id: number;
	scoNumber: string;
	vendorId: number;
	status: ScoStatus;
	projectRef: string | null;
	notes: string | null;
	expectedReturnDate: string;
	subtotalPaise: number;
	taxAmountPaise: number;
	totalAmountPaise: number;
	approvedBy: number | null;
	currentApprovalLevel: number;
	totalApprovalLevels: number;
	createdBy: number;
	createdAt: string;
	lastUpdatedBy: number | null;
	lastUpdatedAt: string | null;
	cancelledBy: number | null;
	cancelledAt: string | null;
	cancelReason: string | null;
	closedBy: number | null;
	closedAt: string | null;
	closeReason: string | null;
	vendorName: string;
	cancelledByName: string | null;
}

export interface ScoLine {
	id: number;
	scoId: number;
	rawItemId: number;
	rawItemBatch: string | null;
	/** SEND qty (whole pieces). */
	rawQtyToIssue: number;
	serviceId: number;
	serviceDescription: string;
	serviceHsnSacCode: string | null;
	serviceUnitPricePaise: number;
	/** GST %. */
	serviceTaxPercentage: number;
	finishedItemId: number;
	/** RETURN qty (whole pieces). */
	expectedReturnQty: number;
	issuedQty: number;
	acceptedQty: number;
	rejectedQty: number;
	unprocessedQty: number;
	lossQty: number;
	rawItemSku: string;
	rawItemName: string;
	finishedItemSku: string;
	finishedItemName: string;
	lineValuePaise: number;
	lineTaxPaise: number;
	/** S3: raw pcs still at vendor (incl. pending QA). Absent on create/update responses. */
	qtyAtVendor?: number;
	pendingQaQty?: number;
	chargeDuePaise?: number;
	chargeDueGstPaise?: number;
}

export interface ScoChargeDue {
	subtotalPaise: number;
	gstPaise: number;
	totalPaise: number;
}

export interface ChallanSettlementRow {
	challanId: number;
	challanNumber: string;
	challanLineId: number;
	scoItemId: number;
	qty: number;
	settledQty: number;
	settled: boolean;
}

export interface ScoDetailPayload {
	sco: Sco;
	items: ScoLine[];
	chargeDue?: ScoChargeDue;
	challanSettlements?: ChallanSettlementRow[];
}

export type ScoListParams = {
	page?: number;
	pageSize?: number;
	sortBy?: ScoSortField;
	sortDir?: "asc" | "desc";
	status?: ScoStatus | ScoStatus[];
	vendorId?: number;
	q?: string;
	createdFrom?: string;
	createdTo?: string;
};

export type ScoListResult = {
	success: true;
	data: Sco[];
	meta: PaginationMeta;
};

export type ScoDetailResult = ApiResult<ScoDetailPayload>;

export type ScoLineInput = {
	rawItemId: number;
	finishedItemId: number;
	serviceId: number;
	rawQtyToIssue: number;
	expectedReturnQty: number;
	serviceUnitPricePaise?: number;
	serviceTaxPercentage?: number;
	rawItemBatch?: string;
};

export type ScoCreatePayload = {
	vendorId: number;
	expectedReturnDate: string;
	projectRef?: string;
	notes?: string;
	lines: ScoLineInput[];
};

export type ScoUpdatePayload = {
	scoId: number;
	expectedReturnDate?: string;
	projectRef?: string | null;
	notes?: string | null;
	lines?: ScoLineInput[];
};

export type ScoCancelPayload = { reason: string };

export const SCO_REASON_MIN = 3;
export const SCO_REASON_MAX = 500;

export const scoCancelSchema = z.object({
	reason: z
		.string()
		.trim()
		.min(SCO_REASON_MIN, `Reason must be at least ${SCO_REASON_MIN} characters`)
		.max(SCO_REASON_MAX),
});

export interface CompanySettings {
	id: number;
	name: string;
	address: string;
	gstin: string;
	stateCode: string;
	updatedBy: number | null;
	updatedAt: string;
}

export type CompanySettingsResult = {
	success: true;
	data: CompanySettings | null;
};

export const companySettingsSchema = z.object({
	name: z.string().trim().min(1, "Name is required").max(200),
	address: z.string().trim().min(1, "Address is required").max(500),
	gstin: z
		.string()
		.trim()
		.length(15, "GSTIN must be 15 characters")
		.transform((value) => value.toUpperCase()),
	stateCode: z
		.string()
		.trim()
		.regex(/^\d{2}$/, "State code must be 2 digits"),
});

export type CompanySettingsInput = z.input<typeof companySettingsSchema>;
export type CompanySettingsPayload = z.output<typeof companySettingsSchema>;

// ---- S2: challan (issue material) ----

export type ChallanDueStatus = "ok" | "warning" | "overdue";

export interface Challan {
	id: number;
	challanNumber: string;
	scoId: number;
	vendorId: number;
	challanDate: string;
	ewayBillNo: string | null;
	valuePaise: number;
	returnDueDate: string;
	createdBy: number;
	createdAt: string;
	scoNumber: string;
	vendorName: string;
	createdByName: string | null;
	/** Whole days to the due date; negative = overdue. */
	daysLeft: number;
	dueStatus: ChallanDueStatus;
}

export interface ChallanLine {
	id: number;
	challanId: number;
	scoItemId: number;
	itemId: number;
	qty: number;
	unitIssueCostPaise: number;
	heatNumber: string | null;
	hsnCode: string;
	settledQty: number;
	itemSku: string;
	itemName: string;
	lineValuePaise: number;
}

export interface ChallanCreatePayload {
	challanDate?: string;
	ewayBillNo?: string;
	lines: Array<{ scoItemId: number; qty: number; heatNumber?: string }>;
}

export type ChallanCreateResult = ApiResult<{
	challan: Challan;
	lines: ChallanLine[];
}>;

export type ChallanListResult = ApiResult<Challan[]>;

export type OpenChallanSortField =
	| "id"
	| "challanNumber"
	| "challanDate"
	| "returnDueDate";

export type OpenChallanParams = {
	page?: number;
	pageSize?: number;
	sortBy?: OpenChallanSortField;
	sortDir?: "asc" | "desc";
	vendorId?: number;
	scoId?: number;
	dueStatus?: ChallanDueStatus;
};

export type OpenChallanResult = {
	success: true;
	data: Challan[];
	meta: PaginationMeta;
};

export interface ChallanDetailPayload {
	challan: Challan;
	lines: ChallanLine[];
	company: CompanySettings | null;
	vendor: {
		id: number;
		name: string;
		address: string | null;
		gstin: string | null;
		stateCode: string | null;
	};
	declaration: string;
}

export type ChallanDetailResult = ApiResult<ChallanDetailPayload>;

// ---- S3: receipt + QA ----

export type ReceiptQaStatus =
	| "pending_qa"
	| "accepted"
	| "partial_accepted"
	| "rejected";

export interface Receipt {
	id: number;
	grnNumber: string;
	scoId: number;
	vendorId: number;
	vendorChallanNo: string;
	status: ReceiptQaStatus;
	receivedDate: string;
	notes: string | null;
	createdBy: number;
	createdAt: string;
	scoNumber: string;
	vendorName: string;
	createdByName: string | null;
}

export interface ReceiptLine {
	id: number;
	scoGrnId: number;
	scoItemId: number;
	processedQty: number;
	unprocessedQty: number;
	acceptedQty: number | null;
	rejectedQty: number | null;
	qaStatus: ReceiptQaStatus;
	qaDecidedBy: number | null;
	qaDecidedAt: string | null;
	qaNotes: string | null;
	heatNumber: string | null;
	finishedItemSku: string;
	finishedItemName: string;
	rawItemSku: string;
	rawItemName: string;
	qaDecidedByName: string | null;
}

export interface ReceiptSettlement {
	id: number;
	receiptItemId: number;
	challanLineId: number;
	qty: number;
	createdAt: string;
	challanId: number;
	challanNumber: string;
	scoItemId: number;
}

export interface ReceiptDetailPayload {
	receipt: Receipt;
	lines: ReceiptLine[];
	settlements: ReceiptSettlement[];
}

export type ReceiptDetailResult = ApiResult<ReceiptDetailPayload>;
export type ReceiptListResult = ApiResult<Receipt[]>;

export interface ReceiptCreatePayload {
	vendorChallanNo: string;
	receivedDate?: string;
	notes?: string;
	lines: Array<{
		scoItemId: number;
		processedQty: number;
		unprocessedQty?: number;
	}>;
}

export interface QaDecisionPayload {
	acceptedQty: number;
	rejectedQty: number;
	notes?: string;
}

// ---- S4: close + reports ----

export type ScoClosePayload = { reason?: string };

export type VendorStockSortField =
	| "vendorName"
	| "itemSku"
	| "qty"
	| "valuePaise";

export type VendorStockParams = {
	page?: number;
	pageSize?: number;
	sortBy?: VendorStockSortField;
	sortDir?: "asc" | "desc";
	vendorId?: number;
};

export interface VendorStockRow {
	vendorId: number;
	vendorName: string;
	itemId: number;
	itemSku: string;
	itemName: string;
	qty: number;
	valuePaise: number;
}

export type VendorStockResult = {
	success: true;
	data: VendorStockRow[];
	meta: PaginationMeta;
};

export type LossLogSortField = "id" | "createdAt" | "qty" | "costPaise";

export type LossLogParams = {
	page?: number;
	pageSize?: number;
	sortBy?: LossLogSortField;
	sortDir?: "asc" | "desc";
	vendorId?: number;
	scoId?: number;
	createdFrom?: string;
	createdTo?: string;
};

export interface LossLogRow {
	ledgerId: number;
	scoId: number;
	scoNumber: string;
	vendorId: number;
	vendorName: string;
	itemId: number;
	itemSku: string;
	itemName: string;
	qty: number;
	costPaise: number;
	batchNumber: string | null;
	reason: string;
	createdBy: number;
	createdByName: string | null;
	createdAt: string;
}

export type LossLogResult = {
	success: true;
	data: LossLogRow[];
	meta: PaginationMeta;
};
