// Reorder API types. Source: .pipeline/scm-reorder/contract.md.
import type { PaginationMeta } from "@/types/suppliers";

export const reorderStateValues = [
	"will_be_ordered",
	"covered",
	"needs_reorder_qty",
	"ok",
] as const;
export type ReorderItemState = (typeof reorderStateValues)[number];
export type ReorderRunState = "running" | "done" | "failed";
export type ReorderTrigger = "schedule" | "manual";
export type ReorderOutcome =
	| "raised"
	| "needs_reorder_qty"
	| "invalid_line"
	| "deferred";

export type ReorderDataResponse<T> = { success: true; data: T };
export type ReorderPagedResponse<T, M = object> = {
	success: true;
	data: T[];
	meta: PaginationMeta & M;
};

export type ReorderStateCounts = Record<ReorderItemState, number>;

export type ReorderItemSortField =
	| "sku"
	| "name"
	| "usableQty"
	| "projectedQty"
	| "state";

export type ReorderItemsParams = {
	page?: number;
	pageSize?: number;
	sortBy?: ReorderItemSortField;
	sortDir?: "asc" | "desc";
	state?: string;
	q?: string;
};

export type ReorderCoveredBy = {
	type: "pr" | "po";
	id: number;
	number: string;
};

export type ReorderItemRow = {
	itemId: number;
	sku: string;
	name: string;
	uom: string;
	usableQty: number;
	onTheWayQty: number;
	projectedQty: number;
	reorderLevel: number;
	reorderQty: number;
	orderQty: number | null;
	state: ReorderItemState;
	coveredBy: ReorderCoveredBy | null;
};

export type ReorderRunsParams = {
	page?: number;
	pageSize?: number;
	sortBy?: "startedAt" | "id" | "state";
	sortDir?: "asc" | "desc";
	state?: string;
	trigger?: ReorderTrigger;
};

export type ReorderPersonRef = { id: number; name: string };

export type ReorderRun = {
	id: number;
	trigger: ReorderTrigger;
	state: ReorderRunState;
	startedBy: ReorderPersonRef | null;
	startedAt: string;
	finishedAt: string | null;
	draftOwner: ReorderPersonRef | null;
	itemsChecked: number;
	itemsRaised: number;
	itemsSkipped: number;
	itemsDeferred: number;
	pr: { id: number; prNumber: string; status: string } | null;
	po: { id: number; poNumber: string; status: string } | null;
	failureReason: string | null;
};

export type ReorderRunItem = {
	itemId: number;
	sku: string;
	name: string;
	uom: string;
	outcome: ReorderOutcome;
	usableQty: number;
	onTheWayQty: number;
	projectedQty: number;
	reorderLevel: number;
	reorderQty: number;
	orderQty: number | null;
	prItemId: number | null;
};

export type ReorderRunDetail = ReorderRun & { items: ReorderRunItem[] };

export type ReorderSettings = {
	enabled: boolean;
	runHour: number;
	draftOwner: ReorderPersonRef | null;
	draftOwnerValid: boolean;
	updatedBy: ReorderPersonRef | null;
	updatedAt: string | null;
};

export type ReorderSettingsPayload = {
	enabled?: boolean;
	runHour?: number;
	draftOwnerId?: number | null;
};

export type ReorderOwnerCandidatesParams = {
	q?: string;
	page?: number;
	pageSize?: number;
	sortBy?: "name";
	sortDir?: "asc" | "desc";
};
