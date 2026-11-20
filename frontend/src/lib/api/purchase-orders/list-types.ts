import type {
	POStatus,
	PurchaseOrder,
	StatusCounts,
} from "@/types/purchase-orders";
import type { PaginationMeta } from "@/types/purchase-requisitions";

// Contract step 2: GET /api/po/getpos.
export type PoBucket = "late" | "today" | "later";

export type PoListRowV2 = PurchaseOrder & {
	lineCount: number;
	/** 0..100, accepted / ordered by quantity. */
	receivedPct: number;
};

export type PoListMeta = PaginationMeta & {
	statusCounts: Partial<StatusCounts<POStatus>>;
	lateCount: number;
};

export type PoListResultV2 = {
	success: true;
	data: PoListRowV2[];
	meta: PoListMeta;
};

export type PoListSortField =
	| "id"
	| "poNumber"
	| "status"
	| "createdAt"
	| "dueDate"
	| "totalAmountPaise";

export type PoListQuery = {
	page: number;
	pageSize: number;
	q?: string;
	status?: POStatus[];
	mine?: boolean;
	bucket?: PoBucket;
	sortBy: PoListSortField;
	sortDir: "asc" | "desc";
};
