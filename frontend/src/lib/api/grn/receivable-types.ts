import type { PaginationMeta } from "@/types/purchase-requisitions";

// Contract: GET /api/grn/getreceivablepos. Never carries price, GST or totals (BR-FF-62).
export type ReceivableBucket = "late" | "today" | "later";

export type ReceivableLine = {
	poItemId: number;
	itemId: number;
	sku: string | null;
	itemName: string | null;
	uom: string | null;
	orderedQty: number;
	receivedQty: number;
	pendingQaQty: number;
	openQty: number;
};

export type ReceivablePo = {
	poId: number;
	poNumber: string;
	supplierId: number;
	supplierName: string | null;
	status: "dispatched" | "partial_received";
	dueDate: string | null;
	isLate: boolean;
	lines: ReceivableLine[];
};

export type ReceivableParams = {
	page?: number;
	pageSize?: number;
	sortBy?: "dueDate" | "poNumber" | "supplierName";
	sortDir?: "asc" | "desc";
	q?: string;
	poId?: number;
	bucket?: ReceivableBucket;
};

export type ReceivableResult = {
	success: true;
	data: ReceivablePo[];
	meta: PaginationMeta & { today: string };
};
