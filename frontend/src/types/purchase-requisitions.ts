import { z } from "zod";

export const prTypeValues = [
	"sale_order",
	"stock_reorder",
	"maintenance",
	"tooling",
	"subcontracting",
	"misc",
] as const;

export const prStatusValues = [
	"draft",
	"pending_approval",
	"approved",
	"rejected",
	"partial_ordered",
	"fully_ordered",
	"cancelled",
] as const;

export const prItemStatusValues = [
	"pending",
	"po_draft",
	"ordered",
	"closed",
	"cancelled",
] as const;

export type PRType = (typeof prTypeValues)[number];
export type PRStatus = (typeof prStatusValues)[number];
export type PRItemStatus = (typeof prItemStatusValues)[number];

export type PRSortField = "id" | "prNumber" | "type" | "status" | "createdAt";

export type PaginationMeta = {
	page: number;
	pageSize: number;
	total: number;
	totalPages: number;
};

export type PaginatedResponse<T> = {
	success: true;
	data: T[];
	meta: PaginationMeta;
};

export type ApiResult<T> =
	| {
			success: true;
			message?: string;
			data: T;
	  }
	| {
			success: false;
			message: string;
			code?:
				| "BAD_REQUEST"
				| "NOT_FOUND"
				| "CONFLICT"
				| "FORBIDDEN"
				| "UNAUTHORIZED";
			data?: null;
	  };

export interface PurchaseRequisition {
	id: number;
	prNumber: string;
	type: PRType;
	saleOrderId: number | null;
	assetId: number | null;
	status: PRStatus;
	requestedBy: number;
	requestedByName?: string | null;
	approvedBy: number | null;
	currentApprovalLevel: number;
	totalApprovalLevels: number;
	estimatedAmountPaise: number;
	notes: string | null;
	cancelledBy?: number | null;
	cancelledByName?: string | null;
	cancelledAt?: string | null;
	cancelReason?: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface PurchaseRequisitionItem {
	id: number;
	prId: number;
	itemId: number;
	itemSku: string | null;
	itemName: string | null;
	itemCategory: string | null;
	requestedQty: number;
	issuedQty: number;
	uom: string | null;
	expectedDate: string | null;
	status?: PRItemStatus;
	estRatePaise?: number;
	linkedPoId?: number | null;
	linkedPoNumber?: string | null;
	defaultSupplierId?: number | null;
	defaultSupplierName?: string | null;
}

export type PRLinkedPoStatus =
	| "draft"
	| "pending_approval"
	| "approved"
	| "dispatched"
	| "partial_received"
	| "fully_received"
	| "invoiced"
	| "closed"
	| "cancelled";

export interface PRLinkedPo {
	id: number;
	poNumber: string;
	supplierId: number;
	status: PRLinkedPoStatus;
	totalAmountPaise: number;
}

export interface PurchaseRequisitionDetailPayload {
	pr: PurchaseRequisition;
	items: PurchaseRequisitionItem[];
	linkedPos: PRLinkedPo[];
}

export type PurchaseRequisitionListParams = {
	page?: number;
	pageSize?: number;
	sortBy?: PRSortField;
	sortDir?: "asc" | "desc";
	status?: PRStatus | PRStatus[];
	type?: PRType;
	q?: string;
};

/** Local calendar date as YYYY-MM-DD (matches <input type="date">). */
export function todayIso() {
	const now = new Date();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	return `${now.getFullYear()}-${month}-${day}`;
}

export const prItemInputSchema = z.object({
	id: z.coerce.number().int().positive().optional(),
	itemId: z.coerce.number().int().positive("Item id is required"),
	requestedQty: z.coerce
		.number()
		.positive("Requested qty must be greater than 0")
		.refine(
			(value) => Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-6,
			"Qty can have at most 3 decimals",
		),
	uom: z.string().trim().min(1, "UOM is required"),
	expectedDate: z
		.string()
		.trim()
		.optional()
		.or(z.literal(""))
		.refine(
			(value) => !value || value >= todayIso(),
			"Required-by date cannot be in the past",
		),
});

const itemsArraySchema = z
	.array(prItemInputSchema)
	.min(1, "At least one item is required")
	.refine(
		(items) => new Set(items.map((item) => item.itemId)).size === items.length,
		"The same item is on the PR twice. Keep one line.",
	);

export const prCreateFormSchema = z.object({
	type: z.enum(prTypeValues, {
		error: "PR type is required",
	}),
	assetId: z.coerce.number().int().positive().optional(),
	notes: z.string().trim().optional().or(z.literal("")),
	items: itemsArraySchema,
});

export const prEditFormSchema = z.object({
	prId: z.coerce.number().int().positive(),
	status: z.enum(prStatusValues),
	notes: z.string().trim().optional().or(z.literal("")),
	items: itemsArraySchema,
});

export type PRItemInput = z.infer<typeof prItemInputSchema>;
export type PRCreateFormInput = z.infer<typeof prCreateFormSchema>;
export type PREditFormInput = z.infer<typeof prEditFormSchema>;

export type PRCreatePayload = {
	type: PRType;
	assetId?: number;
	notes?: string;
	items: Array<{
		itemId: number;
		requestedQty: number;
		uom: string;
		expectedDate?: string;
	}>;
};

export type PRUpdatePayload = {
	prId: number;
	type: PRType;
	saleOrderId: number | null;
	assetId: number | null;
	notes?: string;
	status: PRStatus;
	inserts: Array<{
		itemId: number;
		requestedQty: number;
		expectedDate?: string;
	}>;
	updates: Array<{
		id: number;
		itemId?: number;
		requestedQty?: number;
		expectedDate?: string;
	}>;
	deletes: Array<{
		id: number;
	}>;
};

export type PRDeletePayload = {
	prId: number;
	reason: string;
};

export const PR_CANCEL_REASON_MIN = 3;
export const PR_CANCEL_REASON_MAX = 500;
