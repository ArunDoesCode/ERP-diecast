// Stock transfer API types. Source: .pipeline/scm-stock-transfer/contract.md (manifest /api/stock-transfer/*).
import type { PaginationMeta } from "@/types/suppliers";

export type StStatus = "draft" | "posted" | "cancelled" | "reversed";
export type StLocationType =
	| "main_store"
	| "vendor_premise"
	| "finished_goods"
	| "scrap_yard"
	| "store";

export const ST_MAX_LINES = 50;
export const ST_NOTE_MAX = 500;
export const ST_REASON_MAX = 500;
export const ST_WHOLE_NUMBER_UNITS = ["pcs", "set", "sets", "nos"] as const;

export type DataResponse<T> = { success: true; data: T };
export type PagedResponse<T> = {
	success: true;
	data: T[];
	meta: PaginationMeta;
};

export type StListSortField =
	| "createdAt"
	| "transferNumber"
	| "status"
	| "postedAt";

export type StListParams = {
	page?: number;
	pageSize?: number;
	status?: StStatus;
	sourceLocationId?: number;
	destinationLocationId?: number;
	itemId?: number;
	fromDate?: string;
	toDate?: string;
	sortBy?: StListSortField;
	sortDir?: "asc" | "desc";
};

export type StListRow = {
	id: number;
	transferNumber: string;
	status: StStatus;
	sourceName: string;
	destinationName: string;
	lineCount: number;
	createdAt: string;
	postedAt: string | null;
};

export type StLocationRef = { id: number; name: string; type: StLocationType };
export type StActorRef = { id: number; name: string };

export type StDetailLine = {
	lineId: number;
	itemId: number;
	sku: string;
	name: string;
	unit: string;
	qty: number;
	postedUnitCostPaise: number | null;
	postedValuePaise: number | null;
	/** Live balance at the source while draft; null otherwise. */
	sourceBalanceQty: number | null;
};

export type StLedgerRow = {
	id: number;
	transactionType: "in" | "out" | "adjustment";
	referenceType: "stock_transfer" | "stock_transfer_reversal";
	locationId: number;
	quantityChange: number;
	unitCostPaise: number;
	totalValueChangePaise: number;
	createdAt: string;
};

export type StDetail = {
	id: number;
	transferNumber: string;
	status: StStatus;
	source: StLocationRef;
	destination: StLocationRef;
	notes: string | null;
	createdBy: StActorRef | null;
	createdAt: string;
	lastUpdatedBy: StActorRef | null;
	lastUpdatedAt: string;
	postedBy: StActorRef | null;
	postedAt: string | null;
	cancelledBy: StActorRef | null;
	cancelledAt: string | null;
	reversedBy: StActorRef | null;
	reversedAt: string | null;
	reverseReason: string | null;
	lines: StDetailLine[];
	ledgerRows: StLedgerRow[];
};

export type StLineInput = { itemId: number; qty: number };

export type StCreatePayload = {
	sourceLocationId: number;
	destinationLocationId: number;
	notes?: string;
	lines: StLineInput[];
};

export type StUpdatePayload = {
	sourceLocationId?: number;
	destinationLocationId?: number;
	notes?: string | null;
	lines?: StLineInput[];
};

export type StSaved = { id: number; transferNumber: string; status: StStatus };
export type StCancelled = { id: number; status: "cancelled" };
export type StPosted = {
	id: number;
	status: "posted";
	postedAt: string;
	lines: {
		lineId: number;
		itemId: number;
		qty: number;
		unitCostPaise: number;
		valuePaise: number;
	}[];
};
export type StReversePayload = { reason: string };
export type StReversed = {
	id: number;
	status: "reversed";
	reversedAt: string;
};
