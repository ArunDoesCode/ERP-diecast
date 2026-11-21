// RFQ, quote and award API types. Source: .pipeline/scm-rfq/contract.md (manifest /api/rfq/*).
import type { PaginationMeta } from "@/types/suppliers";

export type RfqStatus =
	| "draft"
	| "sent"
	| "partially_awarded"
	| "awarded"
	| "closed"
	| "cancelled";
export type RfqLineStatus = "open" | "awarded" | "dropped";
export type QuoteStatus = "draft" | "submitted" | "cancelled" | "not_awarded";
export type CellState =
	| "priced"
	| "not_quoted"
	| "no_quote"
	| "expired"
	| "inactive";

export const RFQ_MAX_SUPPLIERS = 10;
export const RFQ_NOTES_MAX = 2000;
export const RFQ_REASON_MIN = 3;
export const RFQ_REASON_MAX = 500;
export const RFQ_GST_PERCENTS = [
	0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 28, 40,
] as const;

export type DataResponse<T> = { success: true; data: T };
export type PagedResponse<T> = {
	success: true;
	data: T[];
	meta: PaginationMeta;
};

export type PrLineRow = {
	id: number;
	prId: number;
	prNumber: string;
	itemId: number;
	itemCode: string;
	itemName: string;
	qty: number;
	uom: string;
	expectedDate: string | null;
	onOpenRfq: boolean;
	openRfqId: number | null;
	openRfqNumber: string | null;
};
export type PrLinesParams = {
	page?: number;
	pageSize?: number;
	sortBy?: "prNumber" | "itemId" | "expectedDate" | "id";
	sortDir?: "asc" | "desc";
	q?: string;
	prId?: number;
	itemId?: number;
	onOpenRfq?: boolean;
};

export type RfqListRow = {
	id: number;
	rfqNumber: string;
	status: RfqStatus;
	dueDate: string;
	notes: string | null;
	createdByName: string | null;
	createdAt: string;
	supplierCount: number;
	quotedCount: number;
	lineCount: number;
};
export type RfqListParams = {
	page?: number;
	pageSize?: number;
	sortBy?: "id" | "rfqNumber" | "dueDate" | "createdAt" | "status";
	sortDir?: "asc" | "desc";
	q?: string;
	status?: RfqStatus;
	supplierId?: number;
	/** RFQs with a line from this requisition, any status. */
	prId?: number;
	from?: string;
	to?: string;
};

export type RfqHeader = {
	id: number;
	rfqNumber: string;
	status: RfqStatus;
	dueDate: string;
	notes: string | null;
	createdBy: number;
	createdByName: string | null;
	createdAt: string;
	lastUpdatedAt: string | null;
	sentBy: number | null;
	sentByName: string | null;
	sentAt: string | null;
	completedAt: string | null;
	closedBy: number | null;
	closedByName: string | null;
	closedAt: string | null;
	closeReason: string | null;
	cancelledBy: number | null;
	cancelledByName: string | null;
	cancelledAt: string | null;
	cancelReason: string | null;
};

export type RfqSupplier = {
	supplierId: number;
	name: string;
	isActive: boolean;
};

export type RfqLine = {
	id: number;
	prItemId: number;
	prId: number;
	prNumber: string;
	itemId: number;
	itemCode: string;
	itemName: string;
	qty: number;
	uom: string;
	lineStatus: RfqLineStatus;
	prLineCancelled: boolean;
	awardedQuoteItemId: number | null;
	awardedQuoteId: number | null;
	awardedSupplierId: number | null;
	awardedSupplierName: string | null;
	awardedAt: string | null;
	awardReason: string | null;
	awardLowestLandedPaise: number | null;
	awardChosenLandedPaise: number | null;
	poItemId: number | null;
	poId: number | null;
	poNumber: string | null;
	poStatus: string | null;
};

export type QuoteHeader = {
	id: number;
	quoteNumber: string;
	supplierId: number;
	supplierName: string;
	status: QuoteStatus;
	isAwarded: boolean;
	supplierQuoteRef: string | null;
	quoteDate: string | null;
	validTill: string | null;
	paymentTermsDays: number | null;
	isLate: boolean;
	submittedAt: string | null;
	cancelledByName: string | null;
	cancelledAt: string | null;
	cancelReason: string | null;
	/** Lines priced, when the server sends it. */
	pricedCount?: number;
	totalLandedPaise?: number | null;
};

export type ContractHint = {
	supplierId: number;
	contractNumber: string;
	ratePaise: number;
};
export type LineRate = {
	rfqItemId: number;
	lastPoRatePaise: number | null;
	contract: ContractHint[];
};

export type RfqDetails = {
	rfq: RfqHeader;
	suppliers: RfqSupplier[];
	lines: RfqLine[];
	quotes: QuoteHeader[];
	lineRates?: LineRate[];
};

export type RfqSaved = {
	id: number;
	rfqNumber: string;
	status: "draft";
	dueDate: string;
	suppliers: RfqSupplier[];
	lines: Array<{
		id: number;
		prItemId: number;
		itemId: number;
		qty: number;
		uom: string;
		lineStatus: RfqLineStatus;
	}>;
};

export type RfqCreatePayload = {
	dueDate: string;
	notes?: string;
	supplierIds: number[];
	prItemIds: number[];
};
export type RfqUpdatePayload = {
	id: number;
	dueDate?: string;
	notes?: string;
	addSupplierIds?: number[];
	removeSupplierIds?: number[];
	addPrItemIds?: number[];
	removePrItemIds?: number[];
};
export type ReasonPayload = { reason: string };

export type PrintSheet = {
	supplier: {
		id: number;
		name: string;
		address: string | null;
		gstin: string | null;
	};
	lines: Array<{
		itemCode: string;
		itemName: string;
		qty: number;
		uom: string;
	}>;
};
export type RfqPrint = {
	rfqNumber: string;
	dueDate: string;
	company: {
		name: string;
		address: string | null;
		gstin: string | null;
	} | null;
	sheets: PrintSheet[];
};

export type QuoteLine = {
	id: number;
	rfqItemId: number;
	itemId: number;
	itemCode: string;
	itemName: string;
	qty: number;
	uom: string;
	isQuoted: boolean;
	ratePaise: number | null;
	gstPercent: number | null;
	leadDays: number | null;
	freightPaise: number | null;
	lineValuePaise: number | null;
	lineTaxPaise: number | null;
	landedRatePaise: number | null;
	isAwarded: boolean;
};
export type QuoteDetails = QuoteHeader & {
	rfqId: number;
	rfqNumber: string;
	rfqStatus: RfqStatus;
	lines: QuoteLine[];
};
export type QuoteLineInput = {
	rfqItemId: number;
	isQuoted: boolean;
	ratePaise?: number;
	gstPercent?: number;
	leadDays?: number;
	freightPaise?: number;
};
export type QuoteBody = {
	supplierQuoteRef: string;
	quoteDate: string;
	validTill: string;
	paymentTermsDays?: number;
	lines: QuoteLineInput[];
};
export type QuoteCreatePayload = QuoteBody & { supplierId: number };

export type ComparisonCell = {
	supplierId: number;
	quoteId: number | null;
	quoteItemId: number | null;
	state: CellState;
	ratePaise: number | null;
	gstPercent: number | null;
	freightPaise: number | null;
	landedRatePaise: number | null;
	leadDays: number | null;
	validTill: string | null;
	paymentTermsDays: number | null;
	isLate: boolean;
	isLowest: boolean;
	eligible: boolean;
};
export type ComparisonRow = {
	rfqItemId: number;
	itemId: number;
	itemCode: string;
	itemName: string;
	qty: number;
	uom: string;
	lineStatus: RfqLineStatus;
	prLineCancelled: boolean;
	lastPoRatePaise?: number | null;
	contract?: ContractHint[];
	cells: ComparisonCell[];
};
export type ComparisonSupplier = {
	supplierId?: number;
	id?: number;
	name?: string;
	supplierName?: string;
	isActive?: boolean;
};
export type CancelledQuote = {
	quoteId: number;
	quoteNumber: string;
	supplierId: number;
	cancelledBy: number | null;
	cancelledByName: string | null;
	cancelledAt: string | null;
	cancelReason: string | null;
};
export type Comparison = {
	rfq: { id: number; rfqNumber: string; status: RfqStatus; dueDate: string };
	suppliers: ComparisonSupplier[];
	rows: ComparisonRow[];
	cancelledQuotes: CancelledQuote[];
};

export type AwardPayload = {
	lines: Array<{ rfqItemId: number; quoteItemId: number; reason?: string }>;
};
export type AwardResult = {
	rfq: { id: number; status: RfqStatus };
	pos: Array<{
		poId: number;
		poNumber: string;
		supplierId: number;
		lineCount: number;
	}>;
	awards: Array<{
		rfqItemId: number;
		poId: number;
		poNumber: string;
		poItemId: number;
		ratePaise: number;
		source: "contract" | "quote";
	}>;
};
