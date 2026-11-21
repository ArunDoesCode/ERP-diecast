// Dispatch (delivery note) API types. Source: .pipeline/scm-dispatch/contract.md (manifest /api/dispatch/*).
// Price, tax and value fields (`*` in the contract) are absent without `so.view`, hence optional here.
import type { PaginationMeta } from "@/types/suppliers";

export type DnStatus = "draft" | "posted" | "cancelled";
export type DnMode = "road" | "rail" | "air" | "ship";

export const DN_MAX_LINES = 200;
export const DN_MAX_PACKAGES = 500;
export const DN_REASON_MIN = 3;
export const DN_REASON_MAX = 500;
export const DN_REMARKS_MAX = 500;
export const DN_LOT_MAX = 50;
export const DN_QTY_MAX = 1_000_000;
export const DN_PENDING_PAGE_SIZE = 100;
export const DN_MODES: { value: DnMode; label: string }[] = [
	{ value: "road", label: "Road" },
	{ value: "rail", label: "Rail" },
	{ value: "air", label: "Air" },
	{ value: "ship", label: "Ship" },
];

export type DataResponse<T> = { success: true; data: T };
export type PagedResponse<T, M = PaginationMeta> = {
	success: true;
	data: T[];
	meta: M;
};

export type DnRef = { id: number; name: string };
export type DnItemRef = { id: number; sku: string; name: string };

// ---- Pending dispatch ----

export type DnPendingSort = "soDate" | "customerName" | "itemSku" | "openQty";

export type DnPendingParams = {
	page?: number;
	pageSize?: number;
	sortBy?: DnPendingSort;
	sortDir?: "asc" | "desc";
	customerId?: number;
	itemId?: number;
	soId?: number;
	locationId?: number;
};

export type DnPendingRow = {
	soId: number;
	soNumber: string;
	soLineId: number;
	customer: DnRef;
	item: DnItemRef;
	uom: string;
	deliveryDate: string;
	ordered: number;
	delivered: number;
	open: number;
	soDate: string;
	stockAtLocation: number;
};

export type DnPendingSoHeader = {
	soNumber: string;
	customerPoNumber: string | null;
	customer: {
		id: number;
		name: string;
		address: string;
		stateCode: string;
		gstin: string | null;
	};
	shipTo: { address: string; stateCode: string };
};

export type DnPendingMeta = PaginationMeta & {
	customers: DnRef[];
	items: DnItemRef[];
	so?: DnPendingSoHeader;
};

export type DnSettings = {
	ewayIntraLimitPaise: number;
	plantStateCode: string | null;
};

// ---- Register ----

export type DnListSort =
	| "noteDate"
	| "dnNumber"
	| "customerName"
	| "status"
	| "valuePaise";

export type DnListParams = {
	page?: number;
	pageSize?: number;
	sortBy?: DnListSort;
	sortDir?: "asc" | "desc";
	dateFrom?: string;
	dateTo?: string;
	customerId?: number;
	soId?: number;
	status?: DnStatus;
	ewayMissing?: "true" | "false";
};

export type DnListRow = {
	id: number;
	dnNumber: string | null;
	soId: number;
	soNumber: string;
	totalQty: number;
	noteDate: string;
	customer: DnRef;
	status: DnStatus;
	ewayBillNo: string | null;
	ewayValidUntil: string | null;
	ewayExpired: boolean;
	ewayNeeded: boolean;
	valuePaise?: number;
};

export type DnListMeta = PaginationMeta & { customers: DnRef[] };

// ---- Detail ----

export type DnTransport = {
	mode: DnMode | null;
	vehicleNo: string | null;
	transporterId: string | null;
	transporterName: string | null;
	transportDocNo: string | null;
	transportDocDate: string | null;
	distanceKm: number | null;
	ewayBillNo: string | null;
	ewayBillDate: string | null;
};

export type DnActivity = {
	at: string;
	actorName: string | null;
	action: string;
	reason: string | null;
};

export type DnDetailLine = {
	id: number;
	soLineId: number;
	item: { id: number; sku: string; name: string; hsnCode: string | null };
	qty: number;
	uom: string;
	deliveryDate: string;
	lotNo: string | null;
	openQtyAtRead: number;
	unitPricePaise?: number;
	gstPercent?: number;
	taxablePaise?: number;
	gstPaise?: number;
};

export type DnDetailPackage = {
	id: number;
	lineId: number;
	soLineId: number;
	packageNo: string;
	qty: number;
	netKg: number;
	grossKg: number;
	lotNo: string | null;
};

export type DnCompany = {
	name: string | null;
	address: string | null;
	gstin: string | null;
	stateCode: string | null;
};

export type DnDetail = {
	soStatus: string;
	activity: DnActivity[];
	id: number;
	dnNumber: string | null;
	status: DnStatus;
	soId: number;
	soNumber: string;
	customerPoNumber: string | null;
	customer: {
		id: number;
		name: string;
		address: string;
		gstin: string | null;
		stateCode: string;
	};
	shipTo: { address: string; stateCode: string };
	noteDate: string;
	sourceLocation: DnRef;
	remarks: string | null;
	lines: DnDetailLine[];
	packages: DnDetailPackage[];
	transport: DnTransport;
	ewayValidUntil: string | null;
	ewayExpired: boolean;
	ewayNeeded: boolean;
	ewayLimitPaise: number;
	company: DnCompany | null;
	taxablePaise?: number;
	gstPaise?: number;
	valuePaise?: number;
	postedBy: { id: number; name: string } | null;
	postedAt: string | null;
	cancelReason: string | null;
	cancelledBy: { id: number; name: string } | null;
	cancelledAt: string | null;
	createdBy: { id: number; name: string } | null;
	createdAt: string;
};

export type DnTransportHistoryField =
	| "vehicleNo"
	| "transporterId"
	| "transporterName"
	| "transportDocNo"
	| "transportDocDate"
	| "ewayBillNo"
	| "ewayBillDate"
	| "distanceKm";

export type DnTransportHistoryRow = {
	id: number;
	field: DnTransportHistoryField;
	oldValue: string | null;
	newValue: string | null;
	changedBy: number;
	changedByName: string | null;
	changedAt: string;
};

// ---- Payloads (all bodies are strict) ----

export type DnTransportInput = {
	mode?: DnMode | null;
	vehicleNo?: string | null;
	transporterId?: string | null;
	transporterName?: string | null;
	transportDocNo?: string | null;
	transportDocDate?: string | null;
	ewayBillNo?: string | null;
	ewayBillDate?: string | null;
	distanceKm?: number | null;
};

export type DnLineInput = {
	soLineId: number;
	qty: number;
	lotNo?: string | null;
};

export type DnPackageInput = {
	soLineId: number;
	packageNo: string;
	qty: number;
	netKg: number;
	grossKg: number;
	lotNo?: string | null;
};

export type DnCreatePayload = {
	soId: number;
	noteDate?: string;
	sourceLocationId?: number;
	remarks?: string;
	lines: DnLineInput[];
	packages?: DnPackageInput[];
	transport?: DnTransportInput;
};

export type DnUpdatePayload = {
	noteDate?: string;
	sourceLocationId?: number;
	remarks?: string | null;
	lines?: DnLineInput[];
	packages?: DnPackageInput[];
	transport?: DnTransportInput;
};

export type DnReasonPayload = { reason: string };

/** Whole numbers for pcs / set, up to 3 decimals otherwise (BR-DSP-05). */
export function dnQtyDecimals(uom: string | null | undefined) {
	const unit = (uom ?? "").toLowerCase();
	return unit === "pcs" || unit === "set" || unit === "sets" || unit === "nos"
		? 0
		: 3;
}
