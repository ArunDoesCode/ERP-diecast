// Supplier invoice API types. Source: .pipeline/scm-supplier-invoice/contract.md (manifest /api/supplier-invoice/*, /api/company/invoice-tolerances).
import type { PaginationMeta } from "@/types/suppliers";

export type SinvStatus =
	| "draft"
	| "blocked"
	| "approved"
	| "cancelled"
	| "legacy";
export type SinvListStatus =
	| "draft"
	| "blocked"
	| "payable"
	| "overdue"
	| "cancelled"
	| "all";
export type SinvTaxType = "cgst_sgst" | "igst" | "none";
export type SinvCheck =
	| "qty"
	| "price"
	| "tax"
	| "tax_rate"
	| "total"
	| "charge";
export type SinvChargeType = "freight" | "packing" | "tooling" | "other";
export type SinvHistoryAction =
	| "create"
	| "edit"
	| "submit"
	| "back_to_draft"
	| "release"
	| "cancel"
	| "delete";

export const SINV_GST_PERCENTS = [
	0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 28, 40,
] as const;
export const SINV_INVOICE_NUMBER_PATTERN = /^[A-Z0-9/-]{1,16}$/;
export const SINV_MAX_CHARGES = 10;
export const SINV_RELEASE_REASON_MIN = 3;
export const SINV_CANCEL_REASON_MIN_BLOCKED = 3;
export const SINV_CANCEL_REASON_MIN_APPROVED = 10;
export const SINV_REASON_MAX = 500;
export const SINV_CHARGE_TYPE_LABEL: Record<SinvChargeType, string> = {
	freight: "Freight",
	packing: "Packing",
	tooling: "Tooling",
	other: "Other",
};
/** Weight units get the weight tolerance; every other unit must match exactly (BR-SINV-22). */
export const SINV_WEIGHT_UNITS = ["kg", "g", "tonne"] as const;
export const SINV_WHOLE_NUMBER_UNITS = ["pcs", "set", "sets", "nos"] as const;

export type DataResponse<T> = { success: true; data: T };
export type PagedResponse<T, M = object> = {
	success: true;
	data: T[];
	meta: PaginationMeta & M;
};

export type SinvListSortField =
	| "ourNumber"
	| "invoiceNumber"
	| "invoiceDate"
	| "dueDate"
	| "totalPaise"
	| "createdAt";
export type SinvListParams = {
	page?: number;
	pageSize?: number;
	sortBy?: SinvListSortField;
	sortDir?: "asc" | "desc";
	status?: SinvListStatus;
	supplierId?: number;
	poId?: number;
	grnId?: number;
	q?: string;
};

export type SinvListRow = {
	id: number;
	ourNumber: string;
	invoiceNumber: string;
	invoiceDate: string;
	supplier: { id: number; name: string };
	poNumber: string;
	status: SinvStatus;
	totalPaise: number;
	dueDate: string | null;
	overdue: boolean;
};

export type SinvListMeta = {
	statusCounts: {
		draft: number;
		blocked: number;
		payable: number;
		overdue: number;
		cancelled: number;
	};
};

export type SinvBillableLine = {
	grnItemId: number;
	grnId: number;
	grnNumber: string;
	itemName: string;
	uom: string;
	netAcceptedQty: number;
	billedQty: number;
	returnedQty: number;
	billableQty: number;
	poRatePaise: number;
	poGstPercent: number;
};

export type SinvBillable = {
	po: {
		id: number;
		poNumber: string;
		status: string;
		paymentTermsDays: number;
	};
	supplier: { id: number; name: string; gstin: string | null };
	lines: SinvBillableLine[];
};

export type SinvPrinted = {
	taxablePaise: number;
	cgstPaise: number;
	sgstPaise: number;
	igstPaise: number;
	totalPaise: number;
};

export type SinvLine = {
	id: number;
	lineNo: number;
	kind: "item" | "charge";
	grnItemId: number | null;
	grnId: number | null;
	grnNumber: string | null;
	itemName: string | null;
	chargeType: SinvChargeType | null;
	description: string | null;
	uom: string | null;
	qty: number | null;
	ratePaise: number | null;
	gstBp: number;
	taxablePaise: number;
	cgstPaise: number;
	sgstPaise: number;
	igstPaise: number;
	poRatePaise: number | null;
	poGstBp: number | null;
	billableQty: number | null;
	belowPoRate: boolean;
};

export type SinvMismatch = {
	check: SinvCheck;
	lineId: number | null;
	head: "cgst" | "sgst" | "igst" | null;
	expected: number;
	billed: number;
	unit: "paise" | "milli_qty" | "bp";
};

export type SinvHistory = {
	id: number;
	action: SinvHistoryAction;
	fromStatus: SinvStatus | null;
	toStatus: SinvStatus | null;
	reason: string | null;
	detail: unknown;
	createdBy: number;
	createdByName: string | null;
	createdAt: string;
};

export type SinvDebitNote = {
	id: number;
	number: string;
	totalPaise: number;
	billOffsetPaise: number;
	status: string;
};

export type SinvDetail = {
	id: number;
	ourNumber: string;
	invoiceNumber: string;
	invoiceDate: string;
	fy: string;
	status: SinvStatus;
	poId: number;
	poNumber: string;
	supplier: { id: number; name: string; gstin: string | null };
	billedAmountPaise: number;
	printed: SinvPrinted;
	taxablePaise: number;
	cgstPaise: number;
	sgstPaise: number;
	igstPaise: number;
	totalPaise: number;
	taxType: SinvTaxType | null;
	supplierGstin: string | null;
	supplierStateCode: string | null;
	plantStateCode: string | null;
	reverseCharge: boolean;
	itcIneligible: boolean;
	paymentTermsDays: number;
	dueDate: string | null;
	overdue: boolean;
	paymentStatus: string;
	tolerances: { priceTolBpUsed: number | null; weightTolBpUsed: number | null };
	submittedBy: number | null;
	submittedAt: string | null;
	releasedBy: number | null;
	releasedAt: string | null;
	releaseReason: string | null;
	cancelledBy: number | null;
	cancelledAt: string | null;
	cancelReason: string | null;
	createdBy: number;
	createdAt: string;
	lastUpdatedBy: number | null;
	lastUpdatedAt: string | null;
	lines: SinvLine[];
	mismatches: SinvMismatch[];
	history: SinvHistory[];
	debitNotes: SinvDebitNote[];
	netPayablePaise: number;
	flow: {
		pr: { id: number; number: string; status: string }[];
		po: { id: number; number: string; status: string };
		grns: { id: number; number: string; status: string }[];
	};
};

export type SinvLineInput = {
	grnItemId: number;
	qty: number;
	ratePaise: number;
	gstPercent: number;
};
export type SinvChargeInput = {
	type: SinvChargeType;
	description?: string;
	taxablePaise: number;
	gstPercent: number;
};

export type SinvCreatePayload = {
	poId: number;
	invoiceNumber: string;
	invoiceDate: string;
	reverseCharge?: boolean;
	itcNotEligible?: boolean;
	printed: SinvPrinted;
	lines: SinvLineInput[];
	charges?: SinvChargeInput[];
};
export type SinvUpdatePayload = { id: number } & Partial<SinvCreatePayload>;
export type SinvReleasePayload = { reason: string };
export type SinvCancelPayload = { reason: string };
export type SinvDeleted = { id: number; deleted: true };

export type InvoiceTolerances = {
	priceTolerancePercent: number;
	weightTolerancePercent: number;
};
export type InvoiceTolerancesPayload = Partial<InvoiceTolerances>;
