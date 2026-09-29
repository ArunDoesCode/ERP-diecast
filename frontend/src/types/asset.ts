import { z } from "zod";

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

export type Ok<T> = {
	success: true;
	data: T;
};

export type ApiErrorModel = {
	success: false;
	message: string;
	code: string;
	details?: unknown;
};

export interface AssetMachine {
	id: number;
	name: string;
	code: string | null;
	isActive: boolean;
	type: string | null;
	status: AssetMachineStatus;
	lastMaintenanceAt: string | null;
	createdBy: number | null;
	createdAt: string;
	lastUpdatedBy: number | null;
	lastUpdatedAt: string;
}

export interface AssetLocation {
	id: number;
	name: string;
	type: AssetLocationType;
	isVirtual: boolean;
	linkedVendorId: number | null;
	isActive: boolean;
	createdAt: string;
}

export interface AssetMovement {
	id: number;
	itemId: number;
	itemSku: string;
	itemName: string;
	itemUom: string;
	locationId: number;
	locationName: string;
	locationType: AssetLocationType;
	batchNumber: string | null;
	transactionType: AssetTransactionType;
	referenceType: AssetReferenceType;
	referenceId: number;
	sourceDocument: AssetSourceDocument | null;
	referenceLineId: number | null;
	quantityChange: number;
	balanceAfter: number;
	unitCostPaise: number;
	totalValueChangePaise: number;
	notes: string | null;
	createdBy: number;
	createdAt: string;
}

export interface AssetSourceDocument {
	type: AssetReferenceType;
	id: number;
	number: string | null;
}

export interface AssetItem {
	id: number;
	sku: string;
	name: string;
	description: string | null;
	category: string;
	uom: string;
	reorderLevel: number | null;
	currentStock: number | null;
	averageCostPaise: number | null;
	standardRatePaise: number;
	isActive: boolean;
	/** HSN code for the job-work challan (BR-SCO-08); null until set. */
	hsnCode?: string | null;
}

export interface AssetStockLocationBalance {
	locationId: number;
	locationName: string;
	locationType: AssetLocationType;
	balance: number;
}

export interface AssetStockRow {
	itemId: number;
	sku: string;
	name: string;
	category: string;
	uom: string;
	currentStock: number;
	averageCostPaise: number;
	valuePaise: number;
	reorderLevel: number;
	belowReorder: boolean;
	isActive: boolean;
	locations: AssetStockLocationBalance[];
}

export interface AssetService {
	id: number;
	code: string;
	name: string;
	description: string | null;
	defaultUom: string;
	sacCode: string | null;
	isActive: boolean;
}

export const assetMachineStatusValues = [
	"idle",
	"running",
	"maintenance",
	"breakdown",
] as const;

export type AssetMachineStatus = (typeof assetMachineStatusValues)[number];

export const assetItemCategoryValues = [
	"Raw Material",
	"Consumable",
	"Spare Part",
	"Tooling",
	"Packing",
] as const;

export type AssetItemCategory = (typeof assetItemCategoryValues)[number];

export const assetItemUomValues = ["kg", "pcs", "ltr", "m", "set"] as const;

export type AssetItemUom = (typeof assetItemUomValues)[number];

export const assetLocationTypeValues = [
	"main_store",
	"vendor_premise",
	"finished_goods",
	"scrap_yard",
] as const;

export type AssetLocationType = (typeof assetLocationTypeValues)[number];

export const assetTransactionTypeValues = ["in", "out", "adjustment"] as const;

export type AssetTransactionType = (typeof assetTransactionTypeValues)[number];

export const assetReferenceTypeValues = [
	"grn",
	"grn_bypass",
	"grn_correction",
	"opening_stock",
	"sco_loss",
	"pro",
	"sco_issue",
	"sco_receipt",
	"job_order_issue",
	"scrap_dispatch",
	"stock_adjustment",
] as const;

export type AssetReferenceType = (typeof assetReferenceTypeValues)[number];

// Only these two can be posted by hand; every other type comes from its source document.
export const assetManualReferenceTypeValues = [
	"stock_adjustment",
	"opening_stock",
] as const;

export type AssetMachineListParams = {
	page?: number;
	pageSize?: number;
	q?: string;
	status?: AssetMachineStatus;
	isActive?: boolean;
};

export type AssetLocationListParams = {
	page?: number;
	pageSize?: number;
	q?: string;
	isActive?: boolean;
};

export type AssetMovementListParams = {
	page?: number;
	pageSize?: number;
	itemId?: number;
	locationId?: number;
	referenceType?: AssetReferenceType;
	transactionType?: AssetTransactionType;
	fromDate?: string;
	toDate?: string;
};

export type AssetItemListParams = {
	page?: number;
	pageSize?: number;
	q?: string;
	category?: AssetItemCategory;
	isActive?: boolean;
};

export type AssetServiceListParams = {
	page?: number;
	pageSize?: number;
	q?: string;
	isActive?: boolean;
};

export type AssetStockListParams = {
	page?: number;
	pageSize?: number;
	q?: string;
	category?: AssetItemCategory;
	locationId?: number;
	belowReorder?: boolean;
	sortBy?: "sku" | "name" | "category" | "currentStock" | "valuePaise";
	sortDir?: "asc" | "desc";
};

function hasAtLeastOneDefinedField(value: Record<string, unknown>) {
	return Object.values(value).some((field) => field !== undefined);
}

export const assetMachineCreateSchema = z.object({
	name: z.string().trim().min(1, "Machine name is required"),
	code: z.string().trim().min(1, "Machine code is required"),
	type: z.string().trim().nullable().optional(),
	status: z.enum(assetMachineStatusValues).optional(),
	lastMaintenanceAt: z.string().trim().nullable().optional(),
});

export const assetMachineFormSchema = assetMachineCreateSchema
	.extend({ isActive: z.boolean() })
	.refine(
		(value) => {
			if (!value.lastMaintenanceAt) return true;
			const picked = new Date(`${value.lastMaintenanceAt}T00:00:00`);
			return picked.getTime() <= Date.now();
		},
		{
			message: "Last maintenance cannot be in the future",
			path: ["lastMaintenanceAt"],
		},
	);

export const assetMachineUpdateSchema = assetMachineCreateSchema
	.partial()
	.extend({ isActive: z.boolean().optional() })
	.refine(hasAtLeastOneDefinedField, {
		message: "At least one field is required",
	});

export const assetLocationCreateSchema = z.object({
	name: z.string().trim().min(1, "Location name is required"),
	type: z.enum(assetLocationTypeValues),
	isVirtual: z.boolean().optional(),
	linkedVendorId: z.number().int().positive().nullable().optional(),
});

export const assetLocationFormSchema = assetLocationCreateSchema
	.extend({ isActive: z.boolean() })
	.refine(
		(value) => value.type !== "vendor_premise" || !!value.linkedVendorId,
		{
			message: "Supplier is required for a vendor premise",
			path: ["linkedVendorId"],
		},
	);

export const assetLocationUpdateSchema = assetLocationCreateSchema
	.partial()
	.extend({ isActive: z.boolean().optional() })
	.refine(hasAtLeastOneDefinedField, {
		message: "At least one field is required",
	});

const reasonSchema = z.string().trim().min(1, "Reason is required").max(1000);

// Wire shapes (contract: body discriminated on referenceType).
export const assetStockTakeSchema = z.object({
	itemId: z.number().int().positive("Item is required"),
	locationId: z.number().int().positive("Location is required"),
	referenceType: z.literal("stock_adjustment"),
	countedQty: z.number().min(0, "Counted quantity cannot be negative"),
	reason: reasonSchema,
	unitCostPaise: z.number().int().min(1).max(2147483647).optional(),
	batchNumber: z.string().trim().nullable().optional(),
});

export const assetOpeningStockSchema = z.object({
	itemId: z.number().int().positive("Item is required"),
	locationId: z.number().int().positive("Location is required"),
	referenceType: z.literal("opening_stock"),
	qty: z.number().positive("Quantity must be greater than 0"),
	unitCostPaise: z.number().int().min(1, "Rate is required"),
	reason: reasonSchema,
	batchNumber: z.string().trim().nullable().optional(),
});

// Form shape: one quantity field, rate typed in rupees; the form converts to the wire shapes above.
export const assetMovementFormSchema = z
	.object({
		referenceType: z.enum(assetManualReferenceTypeValues),
		itemId: z.number().int().positive("Item is required"),
		locationId: z.number().int().positive("Location is required"),
		quantity: z.number({ message: "Quantity is required" }).min(0),
		unitCost: z.number().min(0.01, "Rate must be at least ₹0.01").optional(),
		batchNumber: z.string().nullable().optional(),
		reason: reasonSchema,
	})
	.superRefine((value, ctx) => {
		if (value.referenceType === "opening_stock") {
			if (value.quantity <= 0) {
				ctx.addIssue({
					code: "custom",
					path: ["quantity"],
					message: "Quantity must be greater than 0",
				});
			}
			if (value.unitCost === undefined) {
				ctx.addIssue({
					code: "custom",
					path: ["unitCost"],
					message: "Rate is required for opening stock",
				});
			}
		}
	});

export type AssetMovementFormValues = z.infer<typeof assetMovementFormSchema>;

export const assetMovementCreateSchema = z.discriminatedUnion("referenceType", [
	assetStockTakeSchema,
	assetOpeningStockSchema,
]);

export type AssetMachineCreatePayload = z.infer<
	typeof assetMachineCreateSchema
>;
export type AssetMachineUpdatePayload = z.infer<
	typeof assetMachineUpdateSchema
>;

export type AssetLocationCreatePayload = z.infer<
	typeof assetLocationCreateSchema
>;
export type AssetLocationUpdatePayload = z.infer<
	typeof assetLocationUpdateSchema
>;

export type AssetMovementCreatePayload = z.infer<
	typeof assetMovementCreateSchema
>;

const MAX_PAISE = 2147483647;

// Wire shape: POST /items is strict (no isActive / stock fields).
export const assetItemCreateSchema = z.object({
	sku: z.string().trim().min(1, "SKU is required"),
	name: z.string().trim().min(1, "Item name is required"),
	description: z.string().nullable().optional(),
	category: z.enum(assetItemCategoryValues),
	uom: z.enum(assetItemUomValues),
	reorderLevel: z.number().nonnegative().optional(),
	standardRatePaise: z.number().int().min(1).max(MAX_PAISE),
});

export const assetItemUpdateSchema = assetItemCreateSchema
	.partial()
	.extend({
		isActive: z.boolean().optional(),
		hsnCode: z.string().trim().min(1).max(20).nullable().optional(),
	})
	.refine(hasAtLeastOneDefinedField, {
		message: "At least one field is required",
	});

// Form shape: the user types rupees; the payload builder converts to paise.
export const assetItemFormSchema = z.object({
	sku: assetItemCreateSchema.shape.sku,
	name: assetItemCreateSchema.shape.name,
	description: z.string().nullable().optional(),
	category: z.enum(assetItemCategoryValues, {
		message: "Select a category",
	}),
	uom: z.enum(assetItemUomValues, { message: "Select a unit" }),
	reorderLevel: z.number().nonnegative().optional(),
	// Edit only: the create endpoint does not take an HSN code.
	hsnCode: z
		.string()
		.trim()
		.max(20, "HSN must be 20 characters or fewer")
		.nullable()
		.optional(),
	standardRate: z
		.number({ message: "Standard rate is required" })
		.min(0.01, "Standard rate must be at least ₹0.01")
		.max(MAX_PAISE / 100, "Standard rate is too large"),
	isActive: z.boolean(),
});

export type AssetItemFormValues = z.infer<typeof assetItemFormSchema>;

export const assetServiceCreateSchema = z.object({
	code: z.string().trim().min(1, "Code is required"),
	name: z.string().trim().min(1, "Service name is required"),
	description: z.string().trim().nullable().optional(),
	defaultUom: z.string().trim().min(1, "Default UOM is required"),
	sacCode: z
		.string()
		.trim()
		.regex(/^99\d{4}$/, "SAC must be 6 digits starting with 99")
		.nullable()
		.optional(),
});

export const assetServiceFormSchema = assetServiceCreateSchema.extend({
	isActive: z.boolean(),
});

export const assetServiceUpdateSchema = assetServiceCreateSchema
	.partial()
	.extend({ isActive: z.boolean().optional() })
	.refine(hasAtLeastOneDefinedField, {
		message: "At least one field is required",
	});

export type AssetItemCreatePayload = z.infer<typeof assetItemCreateSchema>;
export type AssetItemUpdatePayload = z.infer<typeof assetItemUpdateSchema>;

export type AssetServiceCreatePayload = z.infer<
	typeof assetServiceCreateSchema
>;
export type AssetServiceUpdatePayload = z.infer<
	typeof assetServiceUpdateSchema
>;
