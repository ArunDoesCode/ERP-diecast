// Purchase return API types. Source: .pipeline/scm-purchase-returns/contract.md (manifest /api/purchase-return/*).
import type { PaginationMeta } from "@/types/suppliers";

export type PrtStatus = "draft" | "posted" | "cancelled";
export type PrtSource = "rejected" | "accepted";
export type PrtEventAction =
	| "create"
	| "edit"
	| "post"
	| "cancel_draft"
	| "cancel_posted";
export type PrtMainAction = "prefilled" | "secondary" | "none";

export const PRT_REASON_MIN = 3;
export const PRT_REASON_MAX = 500;
export const PRT_MAX_LINES = 100;
export const PRT_WHOLE_NUMBER_UNITS = ["pcs", "set", "sets", "nos"] as const;

export type DataResponse<T> = { success: true; data: T };
export type PagedResponse<T, M = object> = {
	success: true;
	data: T[];
	meta: PaginationMeta & M;
};

export type PrtStatusCounts = Record<PrtStatus, number>;

export type PrtListSortField = "id" | "proNumber" | "createdAt" | "status";
export type PrtListParams = {
	page?: number;
	pageSize?: number;
	sortBy?: PrtListSortField;
	sortDir?: "asc" | "desc";
	status?: PrtStatus;
	supplierId?: number;
	grnId?: number;
	poId?: number;
	dateFrom?: string;
	dateTo?: string;
	q?: string;
};

export type PrtListRow = {
	id: number;
	proNumber: string;
	status: PrtStatus;
	grnNumber: string;
	poNumber: string;
	supplierName: string;
	linesCount: number;
	totalPaise: number | null;
	createdAt: string;
};

export type PrtListMeta = {
	statusCounts: PrtStatusCounts;
	awaitingCount: number;
};

export type PrtAwaitingSortField = "grnId" | "grnNumber" | "receivedDate";
export type PrtAwaitingParams = {
	page?: number;
	pageSize?: number;
	sortBy?: PrtAwaitingSortField;
	sortDir?: "asc" | "desc";
	supplierId?: number;
};

export type PrtAwaitingRow = {
	grnId: number;
	grnNumber: string;
	grnItemId: number;
	itemId: number;
	itemName: string;
	batchNumber: string | null;
	rejectedQty: number;
	rejectedReserved: number;
	awaitingQty: number;
	receivedDate: string | null;
	supplierId: number;
	supplierName: string;
	uom: string;
};

export type PrtLine = {
	id: number;
	grnItemId: number;
	poItemId: number;
	itemId: number;
	itemName: string;
	hsnCode: string | null;
	batchNumber: string | null;
	source: PrtSource;
	qty: number;
	uom: string;
	ratePaise: number;
	gstPercent: number;
	taxablePaise: number;
	gstPaise: number;
	cgstPaise: number;
	sgstPaise: number;
	igstPaise: number | null;
	ledgerId: number | null;
	cancelLedgerId: number | null;
	rejectedQty: number;
	rejectedReserved: number;
	rejectedReturnable: number;
	acceptedNet: number;
	acceptedReserved: number;
	acceptedReturnable: number;
};

export type PrtFlowStep = {
	step: "po" | "grn" | "return";
	docNo: string;
	id: number;
	status: string;
};

export type PrtDebitNote = {
	id: number;
	dnNumber: string;
	debitNoteDate: string;
	status: "issued" | "cancelled";
	taxablePaise: number;
	cgstPaise: number;
	sgstPaise: number;
	igstPaise: number;
	totalPaise: number;
	isInterstate: boolean;
	billOffsetPaise: number;
	supplierBill: {
		id: number;
		invoiceNumber: string;
		invoiceDate: string;
	} | null;
	plantName: string;
	plantAddress: string | null;
	plantGstin: string | null;
	plantStateCode: string | null;
	supplierName: string;
	supplierAddress: string | null;
	supplierGstin: string | null;
};

export type PrtEvent = {
	id: number;
	action: PrtEventAction;
	fromStatus: PrtStatus | null;
	toStatus: PrtStatus;
	reason: string | null;
	actorId: number;
	actorName: string | null;
	at: string;
};

export type PrtPreview = {
	stockOut: { itemId: number; qty: number; uom: string }[];
	debitNoteTotalPaise: number;
	poEffect: "credit_only" | "replacement";
};

export type PrtDetail = {
	id: number;
	proNumber: string;
	status: PrtStatus;
	reason: string;
	vendorReturnRef: string | null;
	transporter: string | null;
	vehicleNo: string | null;
	remarks: string | null;
	challanNumber: string | null;
	replacementExpected: boolean;
	grnId: number;
	grnNumber: string;
	grnChallanNo: string | null;
	poId: number;
	poNumber: string;
	supplierId: number;
	supplierName: string;
	postedBy: number | null;
	postedAt: string | null;
	cancelledBy: number | null;
	cancelledAt: string | null;
	cancelReason: string | null;
	createdBy: number;
	createdAt: string;
	lastUpdatedBy: number | null;
	lastUpdatedAt: string | null;
	lines: PrtLine[];
	documentFlow: PrtFlowStep[];
	debitNote: PrtDebitNote | null;
	events: PrtEvent[];
	preview: PrtPreview | null;
};

export type PrtPrefillLine = {
	grnItemId: number;
	itemId: number;
	itemName: string;
	uom: string;
	batchNumber: string | null;
	ratePaise: number;
	gstPercent: number;
	rejectedQty: number;
	rejectedReserved: number;
	rejectedReturnable: number;
	acceptedNet: number;
	acceptedReserved: number;
	acceptedReturnable: number;
	suggested: { source: "rejected"; qty: number }[];
};

export type PrtPrefill = {
	grnId: number;
	grnNumber: string;
	poId: number;
	supplierId: number;
	supplierName: string;
	poNumber: string;
	replacementExpected: boolean;
	lines: PrtPrefillLine[];
	mainAction: PrtMainAction;
};

export type PrtLineInput = {
	grnItemId: number;
	source: PrtSource;
	qty: number;
};

export type PrtCreatePayload = {
	grnId: number;
	reason: string;
	vendorReturnRef?: string;
	transporter?: string;
	vehicleNo?: string;
	remarks?: string;
	replacementExpected?: boolean;
	lines: PrtLineInput[];
};

export type PrtUpdatePayload = {
	id: number;
	reason?: string;
	vendorReturnRef?: string;
	transporter?: string;
	vehicleNo?: string;
	remarks?: string;
	replacementExpected?: boolean;
	lines?: PrtLineInput[];
};

export type PrtCreated = { id: number; proNumber: string; status: "draft" };
export type PrtUpdated = { id: number; proNumber: string; status: PrtStatus };
export type PrtCancelledDraft = { id: number; status: "cancelled" };
export type PrtPosted = {
	id: number;
	status: "posted";
	debitNoteId: number;
	dnNumber: string;
	challanNumber: string;
	totalPaise: number;
	ledgerRowIds: number[];
};
export type PrtCancelledPosted = {
	id: number;
	status: "cancelled";
	debitNoteStatus: "cancelled";
};
export type PrtCancelPayload = { reason: string };

/** Return summary on GRN / PO detail (BR-PRT-38); lands with the backend implement step. */
export type PrtLinkedReturn = {
	id: number;
	proNumber: string;
	status: PrtStatus;
};
