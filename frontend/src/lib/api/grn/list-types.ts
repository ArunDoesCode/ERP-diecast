import type { GrnListParams, GrnListRow, GrnQaStatus } from "@/types/grn";
import type { PaginationMeta } from "@/types/purchase-requisitions";

// Contract step 2: GET /api/grn/getgrns.
export type GrnBucket = "late" | "today" | "later";
export type GrnQaSummary = "pending" | "passed" | "failed" | "mixed";

export type GrnListRowV2 = GrnListRow & {
	supplierName: string | null;
	lineCount: number;
	qaSummary: GrnQaSummary;
	/** Caller holds po.manage: the PO number may be a link (BR-FF-03). */
	poCanOpen: boolean;
};

export type GrnListQuery = Omit<GrnListParams, "status" | "qaStatus"> & {
	/** One status, or the comma list the Done group sends. */
	status?: string;
	qaStatus?: GrnQaStatus;
	bucket?: GrnBucket;
};

export type GrnListMeta = PaginationMeta & {
	statusCounts: Record<string, number>;
};

export type GrnListResultV2 = {
	success: true;
	data: GrnListRowV2[];
	meta: GrnListMeta;
};
