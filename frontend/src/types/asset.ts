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
	quantityChange: number;
	balanceAfter: number;
	unitCostPaise: number;
	totalValueChangePaise: number;
	notes: string | null;
	createdBy: number;
	createdAt: string;
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
	isActive: boolean;
}

export interface AssetService {
	id: number;
	code: string;
	name: string;
	description: string | null;
	defaultUom: string;
	sacCode: string | null;
	isActive?: boolean;
}

export const assetMachineStatusValues = [
	"idle",
	"running",
	"maintenance",
	"breakdown",
] as const;

export type AssetMachineStatus = (typeof assetMachineStatusValues)[number];

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
	"pro",
	"sco_issue",
	"sco_receipt",
	"job_order_issue",
	"scrap_dispatch",
	"stock_adjustment",
] as const;

export type AssetReferenceType = (typeof assetReferenceTypeValues)[number];

export type AssetMachineListParams = {
	page?: number;
	pageSize?: number;
	q?: string;
	status?: AssetMachineStatus;
};

export type AssetLocationListParams = {
	page?: number;
	pageSize?: number;
	q?: string;
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
};

export type AssetServiceListParams = {
	page?: number;
	pageSize?: number;
	q?: string;
};

function hasAtLeastOneDefinedField(value: Record<string, unknown>) {
	return Object.values(value).some((field) => field !== undefined);
}

export const assetMachineCreateSchema = z.object({
	name: z.string().trim().min(1, "Machine name is required"),
	type: z.string().trim().nullable().optional(),
	status: z.enum(assetMachineStatusValues).optional(),
	lastMaintenanceAt: z.string().trim().nullable().optional(),
});

export const assetMachineUpdateSchema = assetMachineCreateSchema
	.partial()
	.refine(hasAtLeastOneDefinedField, {
		message: "At least one field is required",
	});

export const assetLocationCreateSchema = z.object({
	name: z.string().trim().min(1, "Location name is required"),
	type: z.enum(assetLocationTypeValues),
	isVirtual: z.boolean().optional(),
	linkedVendorId: z.number().int().positive().nullable().optional(),
});

export const assetLocationUpdateSchema = assetLocationCreateSchema
	.partial()
	.refine(hasAtLeastOneDefinedField, {
		message: "At least one field is required",
	});

export const assetMovementCreateSchema = z.object({
	itemId: z.number().int().positive("Item is required"),
	locationId: z.number().int().positive("Location is required"),
	batchNumber: z.string().trim().nullable().optional(),
	transactionType: z.enum(assetTransactionTypeValues),
	referenceType: z.enum(assetReferenceTypeValues),
	referenceId: z.number().int().positive("Reference is required"),
	quantityChange: z.number().refine((value) => value !== 0, {
		message: "Quantity change cannot be zero",
	}),
	unitCostPaise: z.number().int().min(0),
	notes: z.string().trim().nullable().optional(),
});

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

export const assetItemCreateSchema = z.object({
	sku: z.string().min(1),
	name: z.string().min(1),
	description: z.string().nullable().optional(),
	category: z.string().min(1),
	uom: z.string().min(1),
	reorderLevel: z.number().nonnegative().optional(),
	currentStock: z.number().nonnegative().optional(),
	averageCostPaise: z.number().int().nonnegative().optional(),
	isActive: z.boolean().optional(),
});

export const assetItemUpdateSchema = assetItemCreateSchema
	.partial()
	.refine(hasAtLeastOneDefinedField, {
		message: "At least one field is required",
	});

export const assetServiceCreateSchema = z.object({
	code: z.string().trim().min(1, "Code is required"),
	name: z.string().trim().min(1, "Service name is required"),
	description: z.string().trim().nullable().optional(),
	defaultUom: z.string().trim().min(1, "Default UOM is required"),
	sacCode: z.string().trim().nullable().optional(),
	isActive: z.boolean().optional(),
});

export const assetServiceUpdateSchema = assetServiceCreateSchema
	.partial()
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
