/** Supplier rating — mirrors `.pipeline/scm-supplier-rating/contract.md`. Percent = integer tenths (800 = 80.0 %), null = no data. */

export type RatingLabel = "good" | "watch" | "poor";

export type OnTimeSummary = {
	pctTenths: number | null;
	lines: number;
	onTimeLines: number;
	lateLines: number;
	openLateLines: number;
	shortClosedLateCount: number;
	cancelledAfterDispatchCount: number;
	noDueDateCount: number;
};

export type RejectionSummary = {
	pctTenths: number | null;
	lines: number;
	linesWithRejects: number;
	decidedLines: number;
	notInspectedLines: number;
	notInspectedRejectedQty: Array<{ uom: string; qty: string }>;
};

export type PriceVarianceSummary = {
	pctTenths: number | null;
	lines: number;
	comparedLines: number;
	notComparedLines: number;
};

export type Rating = {
	supplierId: number;
	supplierName: string;
	isActive: boolean;
	windowFrom: string;
	windowTo: string;
	onTime: OnTimeSummary;
	rejection: RejectionSummary;
	priceVariance: PriceVarianceSummary;
	score: number | null;
	label: RatingLabel | null;
	notEnoughData: {
		judgedLines: number;
		decidedLines: number;
		required: number;
	} | null;
};

export type TrendMeasure = { pctTenths: number | null; lines: number };

export type TrendMonth = {
	month: string;
	onTime: TrendMeasure;
	rejection: TrendMeasure;
	priceVariance: TrendMeasure;
	score: number | null;
	label: RatingLabel | null;
	notEnoughData: null;
};

export type RatingMeta = {
	page: number;
	pageSize: number;
	total: number;
	totalPages: number;
};

export type RatingListResponse = {
	success: true;
	data: Rating[];
	meta: RatingMeta;
};

export type RatingCardResponse = { success: true; data: Rating };

export type RatingTrendResponse = {
	success: true;
	data: { months: TrendMonth[] };
};

export type RatingListSortField =
	| "name"
	| "score"
	| "onTimePct"
	| "rejectionPct"
	| "priceVariancePct"
	| "judgedLines"
	| "decidedLines";

export type RatingStatusFilter = "active" | "inactive" | "all";

export type RatingListParams = {
	page?: number;
	pageSize?: number;
	sortBy?: RatingListSortField;
	sortDir?: "asc" | "desc";
	status?: RatingStatusFilter;
	q?: string;
};

export type RatingMeasure = "on_time" | "rejection" | "price";

export type OnTimeVerdictFilter = "all" | "late" | "on_time" | "no_due_date";

export type OnTimeLine = {
	poItemId: number;
	poId: number;
	poNumber: string;
	prId: number | null;
	itemSku: string;
	itemName: string;
	uom: string;
	orderedQty: string;
	arrivedQty: string;
	dueDate: string | null;
	revisedDate: string | null;
	completionDate: string | null;
	judgementDate: string | null;
	verdict: "on_time" | "late" | null;
	daysLate: number | null;
	state:
		| "complete"
		| "short_closed"
		| "cancelled_after_dispatch"
		| "open_past_due"
		| "no_due_date";
};

export type RejectionLine = {
	grnItemId: number;
	grnNumber: string;
	grnId: number | null;
	poId: number;
	poNumber: string;
	prId: number | null;
	itemSku: string;
	receivedDate: string;
	arrivedQty: string;
	rejectedQty: string;
	uom: string;
	ratePaise: number;
	rejectedValuePaise: number;
	arrivedValuePaise: number;
	inspection: "decided" | "not_inspected";
};

export type PriceLine = {
	poItemId: number;
	poId: number;
	poNumber: string;
	prId: number | null;
	poDate: string;
	itemSku: string;
	uom: string;
	qty: string;
	ratePaise: number;
	referenceRatePaise: number | null;
	referenceSource: "standard_rate" | "previous_po" | "none";
	variancePaise: number | null;
	variancePctTenths: number | null;
	lineVariancePaise: number | null;
	compared: boolean;
	notComparedReason: "uom_differs" | "no_reference" | null;
};

export type RatingLinesParams = {
	measure: RatingMeasure;
	page?: number;
	pageSize?: number;
	sortBy?: string;
	sortDir?: "asc" | "desc";
	verdict?: OnTimeVerdictFilter;
};

export type RatingLinesResponse<T> = {
	success: true;
	data: T[];
	meta: RatingMeta;
};

/** Sort keys per measure (contract whitelist). */
export const LINE_SORT_KEYS: Record<RatingMeasure, readonly string[]> = {
	on_time: ["dueDate", "completionDate", "daysLate", "poNumber", "itemSku"],
	rejection: ["receivedDate", "grnNumber", "rejectedValuePaise", "itemSku"],
	price: ["poDate", "poNumber", "variancePaise", "itemSku"],
};
