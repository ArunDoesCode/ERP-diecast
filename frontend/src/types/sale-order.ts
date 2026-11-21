// Sale order + explosion API types. Source: .pipeline/scm-sale-order/contract.md.
import type { PaginationMeta } from "@/types/suppliers";

export const soStatusValues = [
	"draft",
	"confirmed",
	"on_hold",
	"closed",
	"cancelled",
] as const;
export type SoStatus = (typeof soStatusValues)[number];
export type SoCloseKind = "manual" | "fully_delivered";
export type SoSnapshotListStatus =
	| "current"
	| "out_of_date"
	| "superseded"
	| "none";
export type SoOutOfDateReason =
	| "so_changed"
	| "bom_changed"
	| "delivery_changed";
export type SoRowType = "cast" | "job_work" | "assemble" | "buy";
export type SoRowTag = "no_bom" | "buy_as_is";
export type SoBlockReason = "inactive_item" | "no_active_bom" | "bom_loop";

export const SO_GST_PERCENTS = [
	0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 28, 40,
] as const;

export const SO_REASON_MIN = 3;
export const SO_REASON_MAX = 500;
export const SO_MAX_LINES = 200;
export const SO_PO_NUMBER_MAX = 50;
export const SO_ADDRESS_MAX = 300;
export const SO_NOTES_MAX = 1000;
export const SO_LINE_NOTES_MAX = 500;
export const SO_QTY_MAX = 1_000_000;
export const SO_PRICE_MAX_PAISE = 100_000_000;

export type DataResponse<T> = { success: true; data: T };
export type PagedResponse<T, M = object> = {
	success: true;
	data: T[];
	meta: PaginationMeta & M;
};

export type SoStatusCounts = Record<SoStatus, number>;

export type SoListSortField =
	| "soNumber"
	| "orderDate"
	| "createdAt"
	| "totalAmountPaise";

export type SoListParams = {
	page?: number;
	pageSize?: number;
	sortBy?: SoListSortField;
	sortDir?: "asc" | "desc";
	q?: string;
	status?: string;
	customerId?: number;
};

export type SoListRow = {
	id: number;
	soNumber: string;
	customerId: number;
	customerName: string;
	customerPoNumber: string | null;
	status: SoStatus;
	orderDate: string;
	totalAmountPaise: number;
	nextDeliveryDate: string | null;
	snapshotStatus: SoSnapshotListStatus;
	createdAt: string;
};

export type SoLine = {
	id: number;
	lineNo: number;
	itemId: number;
	sku: string;
	itemName: string;
	uom: string;
	qty: number;
	unitPricePaise: number;
	lineAmountPaise: number;
	gstPercent: number;
	deliveryDate: string;
	deliveredQty: number;
	openQty: number;
	notes: string | null;
};

export type SoRaisedDocument = {
	type: "pr" | "sco";
	id: number;
	number: string;
	status: string;
	runNo: number;
};

export type SoCurrentSnapshot = {
	id: number;
	runNo: number;
	number: string;
	outOfDate: boolean;
	rowCount: number;
	flaggedCount: number;
	createdAt: string;
};

export type SoDetail = {
	id: number;
	soNumber: string;
	customerId: number;
	customerName: string;
	status: SoStatus;
	orderDate: string;
	customerPoNumber: string | null;
	customerPoDate: string | null;
	shipToAddress: string | null;
	shipToStateCode: string | null;
	notes: string | null;
	totalAmountPaise: number;
	editVersion: number;
	closeKind: SoCloseKind | null;
	holdReason: string | null;
	closeReason: string | null;
	cancelReason: string | null;
	confirmedAt: string | null;
	createdByName: string;
	createdAt: string;
	lastUpdatedAt: string;
	lines: SoLine[];
	raisedDocuments: SoRaisedDocument[];
	currentSnapshot: SoCurrentSnapshot | null;
};

export type SoLineCreateInput = {
	itemId: number;
	qty: number;
	unitPricePaise: number;
	gstPercent: number;
	deliveryDate: string;
	notes?: string;
};

export type SoCreatePayload = {
	customerId: number;
	orderDate: string;
	customerPoNumber?: string;
	customerPoDate?: string;
	shipToAddress?: string;
	shipToStateCode?: string;
	notes?: string;
	lines: SoLineCreateInput[];
};

export type SoLineUpdateInput = {
	id?: number;
	itemId?: number;
	qty: number;
	unitPricePaise: number;
	gstPercent: number;
	deliveryDate: string;
	notes?: string;
};

export type SoUpdatePayload = {
	editVersion: number;
	customerId?: number;
	orderDate?: string;
	customerPoNumber?: string | null;
	customerPoDate?: string;
	shipToAddress?: string;
	shipToStateCode?: string;
	notes?: string;
	lines?: SoLineUpdateInput[];
	removeLineIds?: number[];
};

export type SoVersionPayload = { editVersion: number };
export type SoReasonPayload = { reason: string; editVersion: number };

export type SoAuditRow = {
	id: number;
	actorId: number | null;
	actorName: string | null;
	action: string;
	targetType: string;
	targetId: number | null;
	before: unknown;
	after: unknown;
	at: string;
};

export type SoAuditParams = {
	page?: number;
	pageSize?: number;
	sortDir?: "asc" | "desc";
	action?: string;
};

export type SoExplosionRun = {
	id: number;
	runNo: number;
	number: string;
	status: "current" | "superseded";
	outOfDate: boolean;
	createdByName: string;
	createdAt: string;
	supersededAt: string | null;
	rowCount: number;
	flaggedCount: number;
};

export type SoExplosionListParams = {
	page?: number;
	pageSize?: number;
	sortBy?: "runNo" | "createdAt";
	sortDir?: "asc" | "desc";
	status?: "current" | "superseded";
};

export type SoExplosionCreated = {
	id: number;
	runNo: number;
	number: string;
	createdAt: string;
	rowCount: number;
	flaggedCount: number;
};

export type SoExplosionHeader = {
	id: number;
	runNo: number;
	number: string;
	status: "current" | "superseded";
	outOfDate: boolean;
	outOfDateReasons: SoOutOfDateReason[];
	createdBy: number;
	createdByName: string;
	createdAt: string;
	supersededAt: string | null;
	totals: {
		rowCount: number;
		flaggedCount: number;
		shortCount: number;
		raisedCount: number;
	};
	bomRevisions: { partSku: string; revision: string }[];
};

export type SoExplosionRowSource = {
	soLineId: number;
	lineNo: number;
	qty: number;
	sourceSku: string;
	sourceLevel: number;
};

export type SoExplosionRow = {
	id: number;
	itemId: number;
	sku: string;
	name: string;
	level: number;
	type: SoRowType;
	tag: SoRowTag | null;
	blockReason: SoBlockReason | null;
	bomRevision: string | null;
	bomRevisionId: number | null;
	uom: string;
	grossQty: number;
	onHandQty: number;
	reservedOtherQty: number;
	freeQty: number;
	openPrQty: number;
	openPoQty: number;
	openScoQty: number;
	lateSupplyQty: number;
	netQty: number;
	pourQty: number | null;
	sendQty: number | null;
	requiredBy: string;
	pastDue: boolean;
	selectable: boolean;
	raised: {
		type: "pr" | "sco";
		docId: number;
		docNumber: string;
		qty: number;
		at: string;
	} | null;
	sources: SoExplosionRowSource[];
	jobWorker: {
		defaultVendorId: number | null;
		serviceId: number | null;
		candidates: { vendorId: number; name: string }[];
	} | null;
};

export type SoExplosionRowsParams = {
	page?: number;
	pageSize?: number;
	sortBy?: "level" | "sku" | "netQty" | "type";
	sortDir?: "asc" | "desc";
	type?: SoRowType;
	net?: "short";
	flagged?: boolean;
};

export type SoDraftPick = {
	rowId: number;
	qty: number;
	vendorId?: number;
	expectedReturnDate?: string;
};

export type SoDraftsPayload = { rows: SoDraftPick[] };

export type SoDraftsResult = {
	prs: { id: number; prNumber: string; lineCount: number }[];
	scos: { id: number; scoNumber: string }[];
	rows: {
		rowId: number;
		prItemId: number | null;
		scoItemId: number | null;
		stillShortBy: number;
	}[];
};

export const soRowTypeLabels: Record<SoRowType, string> = {
	cast: "Cast",
	job_work: "Job work",
	assemble: "Assemble",
	buy: "Buy",
};

/** Whole numbers for piece-like units, 3 decimals otherwise. */
export function qtyDecimals(uom: string | null | undefined) {
	return uom === "pcs" || uom === "set" || uom === "nos" ? 0 : 3;
}
