import type {
	ApiResult,
	PaginatedResponse,
} from "@/types/purchase-requisitions";
import type { PrtLinkedReturn } from "@/types/purchase-return";

export const poStatusValues = [
	"draft",
	"pending_approval",
	"approved",
	"dispatched",
	"partial_received",
	"fully_received",
	"invoiced",
	"closed",
	"cancelled",
] as const;

export type POStatus = (typeof poStatusValues)[number];
export type POSortField =
	| "id"
	| "poNumber"
	| "status"
	| "createdAt"
	| "dueDate"
	| "totalAmountPaise";

export interface PurchaseOrder {
	id: number;
	poNumber: string;
	supplierId: number;
	/** BR-PO-24 */
	supplierName: string;
	status: POStatus;
	subtotalPaise: number;
	taxAmountPaise: number;
	totalAmountPaise: number;
	paymentTermsDays: number | null;
	deliveryTerms: string | null;
	notes: string | null;
	expectedDeliveryDate: string | null;
	approvedBy: number | null;
	currentApprovalLevel: number;
	totalApprovalLevels: number;
	createdAt: string;
	createdBy: number;
	revisedDeliveryDate: string | null;
	delayReason: string | null;
	supplierConfirmed: boolean;
	confirmationMethod: string | null;
	confirmedAt: string | null;
	confirmedBy: number | null;
	confirmationNote: string | null;
	closedAt: string | null;
	closedBy: number | null;
	closeNote: string | null;
	// BR-PO-11/13/15/19 — absent at runtime until the backend build lands.
	cancelledBy?: number | null;
	cancelledByName?: string | null;
	cancelledAt?: string | null;
	cancelReason?: string | null;
	shortClosed?: boolean;
	invoicedBy?: number | null;
	invoicedAt?: string | null;
	/** Revised date if set, else expected date (BR-PO-19). */
	dueDate?: string | null;
}

export interface PurchaseOrderItem {
	id: number;
	poId: number;
	itemId: number;
	qty: number;
	receivedQty: number;
	unitPricePaise: number;
	gstPercent?: number | null;
	lineValuePaise?: number;
	lineTaxPaise?: number;
	uom: string | null;
	itemSku?: string;
	itemName?: string;
	itemCategory?: string;
	prItemId?: number | null;
	prNumber?: string | null;
	/** Qty sent back on posted purchase returns (BR-PRT-38). Absent until the backend sends it. */
	returnedQty?: number;
	// scm-rfq: contract / quote link and rate-override audit. Null for callers without po.manage / contract.view.
	contractItemId?: number | null;
	contractNumber?: string | null;
	contractRatePaise?: number | null;
	quoteItemId?: number | null;
	quoteNumber?: string | null;
	rateSource?: "contract" | "quote" | null;
	rateOverrideReason?: string | null;
	rateOverrideBy?: number | null;
	rateOverrideByName?: string | null;
	rateOverrideAt?: string | null;
}

export interface PurchaseOrderDetailPayload {
	po: PurchaseOrder;
	items: PurchaseOrderItem[];
	/** Returns made against this PO (BR-PRT-38). Absent until the backend sends it. */
	returns?: PrtLinkedReturn[];
}

export type PurchaseOrderListParams = {
	page?: number;
	pageSize?: number;
	sortBy?: POSortField;
	sortDir?: "asc" | "desc";
	status?: POStatus | POStatus[];
	supplierId?: number;
	q?: string;
	overdue?: boolean;
	mine?: boolean;
	bucket?: "late" | "today" | "later";
};

/** BR-SUP-13 allowed GST percentages. */
export const GST_PERCENT_VALUES = [
	0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 28, 40,
] as const;

export const PO_REASON_MIN = 3;
export const PO_REASON_MAX = 500;

export type POCreatePayload = {
	supplierId: number;
	paymentTermsDays?: number;
	deliveryTerms?: string;
	expectedDeliveryDate?: string;
	notes?: string;
	lines: Array<{
		prItemId: number;
		unitPricePaise: number;
		gstPercent?: number;
		/** Only with a rate different from the contract rate (needs `contract.override_rate`). */
		rateOverrideReason?: string;
	}>;
};

export type POCreateResult = ApiResult<PurchaseOrderDetailPayload>;
// BR-PO-26: the list `meta` also counts rows per status for the same search.
export type StatusCounts<S extends string> = Record<S, number>;
export type POListResult = PaginatedResponse<PurchaseOrder> & {
	meta: { statusCounts?: StatusCounts<POStatus> };
};

export type POUpdatePayload = {
	poId: number;
	paymentTermsDays?: number | null;
	deliveryTerms?: string | null;
	notes?: string | null;
	expectedDeliveryDate?: string | null;
	inserts?: Array<{
		prItemId: number;
		unitPricePaise: number;
		gstPercent?: number;
		rateOverrideReason?: string;
	}>;
	updates?: Array<{
		id: number;
		unitPricePaise: number;
		gstPercent?: number;
		rateOverrideReason?: string;
	}>;
	deletes?: Array<{ id: number }>;
};

export type POUpdateResult = ApiResult<{
	po: PurchaseOrder;
	items: PurchaseOrderItem[];
}>;

export type POCancelResult = ApiResult<PurchaseOrder>;

// inventory BR-INV-30: where the rate suggestion comes from.
export type LastRateSource =
	| "contract"
	| "po_history"
	| "supplier_catalog"
	| "item_average"
	| "standard_rate";

/** BR-PO-25: the label shown next to the rate suggestion. */
export const LAST_RATE_SOURCE_LABEL: Record<LastRateSource, string> = {
	contract: "Contract",
	po_history: "Last PO",
	supplier_catalog: "Price list",
	item_average: "Item average",
	standard_rate: "Standard rate",
};

/**
 * BR-PO-25: the rate box text for a suggestion in paise. A suggestion of 0
 * (legacy item with no standard rate, BR-INV-24) or none leaves the box empty
 * for the user to type; it is never prefilled with 0.
 */
export function suggestedRateInput(ratePaise: number | null | undefined) {
	return ratePaise != null && ratePaise > 0 ? String(ratePaise / 100) : "";
}

export type LastRateResult = ApiResult<{
	ratePaise: number;
	source: LastRateSource;
	/** Source "contract" only (inventory BR-INV-30): the line is bound to this contract line. */
	contractItemId?: number;
	contractId?: number;
	contractNumber?: string;
	/** Contract quantity still open on the date (a number, or a decimal string). */
	qtyLeft?: number | string;
	gstPercent?: number;
}>;

export type LastRateData = Extract<LastRateResult, { success: true }>["data"];

export const poCommunicationChannelValues = [
	"email",
	"whatsapp",
	"phone",
	"in_person",
] as const;
export type PoCommunicationChannel =
	(typeof poCommunicationChannelValues)[number];
export type PoCommunicationType = "po_sent" | "reminder" | "escalation";
export type PoCommunicationStatus = "logged" | "success" | "failed";

export interface PoCommunication {
	id: number;
	poId: number;
	type: PoCommunicationType;
	channel: PoCommunicationChannel;
	status: PoCommunicationStatus;
	toEmail: string | null;
	note: string | null;
	errorMessage: string | null;
	sentBy: number | null;
	sentAt: string;
}

export type LogPoCommunicationPayload = {
	channel: PoCommunicationChannel;
	note?: string;
	toEmail?: string;
};
export type UpdatePoDelayPayload = {
	revisedDeliveryDate?: string;
	delayReason?: string;
};
export type ConfirmPoPayload = { confirmationMethod: string; note?: string };
export type ClosePoPayload = { note?: string };
export type ShortClosePoPayload = { reason: string };

// Bare responses — confirmed via backend source, do not wrap in { po: ... }:
export type POSendResult = ApiResult<PurchaseOrder>;
export type PODelayResult = ApiResult<PurchaseOrder>;
export type POConfirmResult = ApiResult<PurchaseOrder>;
export type POCloseResult = ApiResult<PurchaseOrder>;
export type POShortCloseResult = ApiResult<PurchaseOrder>;
export type POCommunicationsResult = ApiResult<PoCommunication[]>;
export type POCommunicationResult = ApiResult<PoCommunication>;
