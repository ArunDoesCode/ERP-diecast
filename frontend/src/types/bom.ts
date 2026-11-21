// BOM API types. Source: .pipeline/scm-bom/contract.md (decimals are JSON numbers, dates ISO strings).
import type { PaginationMeta } from "@/types/suppliers";

export const bomKindValues = ["casting", "job_work", "assembly"] as const;
export type BomKind = (typeof bomKindValues)[number];
export const bomKindLabels: Record<BomKind, string> = {
	casting: "Casting",
	job_work: "Job work",
	assembly: "Assembly",
};

export type BomStatus = "draft" | "active" | "retired";
export type BomNextStep =
	| "create"
	| "release"
	| "waiting_for_release"
	| "start_revision"
	| "open_draft"
	| "open_active"
	| "none";
export type BomTreatment =
	| "cast"
	| "job_work"
	| "assemble"
	| "buy"
	| "buy_as_is"
	| "no_bom"
	| "loop";
export type BomWhereUsedRole = "line" | "sent_item" | "alloy";
export type BomHistoryAction =
	| "create"
	| "edit"
	| "delete"
	| "release"
	| "retire";

export const BOM_REASON_MIN = 3;
export const BOM_REASON_MAX = 500;
export const BOM_NOTE_MAX = 200;
export const BOM_MAX_LINES = 50;

export type DataResponse<T> = { success: true; data: T };
export type PagedResponse<T> = {
	success: true;
	data: T[];
	meta: PaginationMeta;
};

export type BomListSortField =
	| "partSku"
	| "partName"
	| "revisionNo"
	| "kind"
	| "status"
	| "releasedAt"
	| "createdAt";

export type BomListParams = {
	page?: number;
	pageSize?: number;
	sortBy?: BomListSortField;
	sortDir?: "asc" | "desc";
	/** One csv string, e.g. "active,draft". */
	status?: string;
	kind?: BomKind;
	q?: string;
	partId?: number;
};

export type BomListRow = {
	id: number;
	number: string;
	partId: number;
	partSku: string;
	partName: string;
	kind: BomKind;
	status: BomStatus;
	revision: string;
	releasedAt: string | null;
};

export type BomItemRef = {
	sku: string;
	name: string;
	unit: string;
	inactive: boolean;
};

export type BomCastingDetail = {
	alloyItemId: number | null;
	alloy: BomItemRef | null;
	netWeightKg: number | null;
	shotWeightKg: number | null;
	cavities: number | null;
	meltLossPct: number | null;
	castingRejectPct: number | null;
	computed: {
		pouredWeightKg: number | null;
		yieldPct: number | null;
		alloyPerGoodPieceKg: number | null;
	};
};

export type BomJobWorkDetail = {
	sentItemId: number | null;
	sentItem: BomItemRef | null;
	sendQty: number | null;
	returnQty: number | null;
	jobWorkerId: number | null;
	jobWorkerName: string | null;
	jobWorkerInactive: boolean;
	serviceId: number | null;
	serviceName: string | null;
	serviceInactive: boolean;
	jobWorkLossPct: number | null;
};

export type BomDetailLine = {
	id: number;
	lineNo: number;
	componentItemId: number;
	sku: string;
	name: string;
	unit: string;
	inactive: boolean;
	qtyPerPiece: number;
	buyAsIs: boolean;
	note: string | null;
};

export type BomDetail = {
	id: number;
	number: string;
	partId: number;
	part: BomItemRef;
	revisionNo: number;
	revision: string;
	kind: BomKind;
	status: BomStatus;
	version: number;
	casting: BomCastingDetail | null;
	jobWork: BomJobWorkDetail | null;
	lines: BomDetailLine[];
	changeReason: string | null;
	releasedByName: string | null;
	releasedAt: string | null;
	retiredByName: string | null;
	retiredAt: string | null;
	retireReason: string | null;
	createdByName: string | null;
	createdAt: string;
	lastUpdatedByName: string | null;
	lastUpdatedAt: string | null;
	nextStep: BomNextStep;
	nextRevision: string | null;
	activeBomId: number | null;
	openDraftId: number | null;
	openDraftRevision: string | null;
};

export type BomTreeNode = {
	itemId: number;
	sku: string;
	name: string;
	kind?: BomKind;
	unit: string;
	qtyPerPiece: number;
	treatment: BomTreatment;
	bomId?: number;
	revision?: string;
	inactive: boolean;
	children: BomTreeNode[];
};

export type BomNeedsParams = {
	partId: number;
	qty: number;
	levels?: "all" | "1";
};

export type BomNeedsRow = {
	index: number;
	parentIndex: number | null;
	level: number;
	path: number[];
	itemId: number;
	sku: string;
	unit: string;
	qty: number;
	treatment: BomTreatment;
	partItemId?: number;
	kind?: BomKind;
	inactive: boolean;
	hasActiveBom: boolean;
	bomId?: number;
	revision?: string;
	pourQty?: number;
	alloyItemId?: number;
	alloyKg?: number;
	sendQty?: number;
	returnQty?: number;
	jobWorkerId?: number;
	serviceId?: number;
	jobWorkLossPct?: number;
};

export type BomNeedsToBuy = {
	itemId: number;
	sku: string;
	unit: string;
	qty: number;
	noBom: boolean;
};

export type BomNeeds = {
	partId: number;
	qty: number;
	rootBomId: number;
	revision: string;
	rows: BomNeedsRow[];
	toBuy: BomNeedsToBuy[];
};

export type BomWhereUsedResponse = PagedResponse<BomWhereUsedRow> & {
	part: { id: number; sku: string; name: string };
};

export type BomWhereUsedParams = {
	page?: number;
	pageSize?: number;
	sortBy?: "partSku" | "revisionNo";
	sortDir?: "asc" | "desc";
};

export type BomWhereUsedRow = {
	bomId: number;
	number: string;
	partId: number;
	partSku: string;
	partName: string;
	revision: string;
	role: BomWhereUsedRole;
	qtyPerPiece: number;
	buyAsIs: boolean | null;
	returnQty: number | null;
};

export type BomHistoryParams = {
	page?: number;
	pageSize?: number;
	sortBy?: "changedAt";
	sortDir?: "asc" | "desc";
};

export type BomHistoryRow = {
	id: number;
	action: BomHistoryAction;
	revision: string;
	changes: unknown;
	reason: string | null;
	changedBy: { id: number; name: string };
	changedAt: string;
};

export type BomLineInput = {
	componentItemId: number;
	qtyPerPiece: number;
	buyAsIs: boolean;
	note?: string;
};

export type BomCastingInput = {
	alloyItemId?: number;
	netWeightKg?: number;
	shotWeightKg?: number;
	cavities?: number;
	meltLossPct?: number;
	castingRejectPct?: number;
};

export type BomJobWorkInput = {
	sentItemId?: number;
	sendQty?: number;
	returnQty?: number;
	jobWorkerId?: number;
	serviceId?: number;
	jobWorkLossPct?: number;
};

export type BomDraftInput = {
	kind: BomKind;
	casting?: BomCastingInput;
	jobWork?: BomJobWorkInput;
	lines: BomLineInput[];
};

export type BomCreatePayload = BomDraftInput & { partId: number };
export type BomUpdatePayload = BomDraftInput & { version: number };

export type BomWriteResult = { id: number; status: BomStatus; version: number };
export type BomReleaseResult = BomWriteResult & {
	retiredPreviousId: number | null;
};
export type BomDeleteResult = { id: number; deleted: true };

export type BomReleasePayload = { version: number; reason?: string };
export type BomRetirePayload = { reason: string };

export type BomChangeSummary = {
	bomId: number;
	version: number;
	against: { id: number; revision: string } | null;
	firstRevision: boolean;
	header: { field: string; old: unknown; new: unknown }[];
	lines: {
		added: BomLineInput[];
		removed: BomLineInput[];
		changed: {
			componentItemId: number;
			qtyOld: number;
			qtyNew: number;
			buyAsIsOld: boolean;
			buyAsIsNew: boolean;
		}[];
	};
	canRelease: boolean;
	problems: { code: string; field?: string; message: string }[];
};

export type BomProblem = { code: string; field?: string; message: string };
