import type {
	PaginationMeta,
	PRStatus,
	PurchaseRequisition,
} from "@/types/purchase-requisitions";

// Contract step 2: GET /api/pr/getprs.
export type PrBucket = "late" | "today" | "later";

export type PrListRowV2 = PurchaseRequisition & {
	requestedByName: string | null;
	lineCount: number;
	/** YYYY-MM-DD of the earliest pending line, or null. */
	earliestRequiredBy: string | null;
	sentBack: boolean;
};

export type PrListMeta = PaginationMeta & {
	statusCounts: Partial<Record<PRStatus, number>>;
	toOrderCount: number;
};

export type PrListResultV2 = {
	success: true;
	data: PrListRowV2[];
	meta: PrListMeta;
};

export type PrListSortField =
	| "id"
	| "prNumber"
	| "type"
	| "status"
	| "createdAt"
	| "estimatedAmountPaise";

/** What the list sends. `bucket` needs `toOrder: true` (server answers 400 otherwise). */
export type PrListQuery = {
	page: number;
	pageSize: number;
	q?: string;
	status?: PRStatus[];
	mine?: boolean;
	toOrder?: boolean;
	bucket?: PrBucket;
	sortBy: PrListSortField;
	sortDir: "asc" | "desc";
};
