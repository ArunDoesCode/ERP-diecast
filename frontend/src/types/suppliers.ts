import { z } from "zod";

export const supplierTypeValues = [
	"raw_material",
	"consumables",
	"service_provider",
	"trader",
	"both",
] as const;

export type SupplierType = (typeof supplierTypeValues)[number];

export type SupplierSortField =
	| "name"
	| "type"
	| "contactPerson"
	| "isActive"
	| "createdAt";

export type SupplierStatusFilter = "all" | "active" | "inactive";

export type SupplierListParams = {
	status?: SupplierStatusFilter;
	page?: number;
	pageSize?: number;
	q?: string;
	sortBy?: SupplierSortField;
	sortDir?: "asc" | "desc";
};

export type SupplierOfferingListParams = {
	page?: number;
	pageSize?: number;
	q?: string;
};

export type AssetLookupParams = {
	page?: number;
	pageSize?: number;
	q?: string;
};

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

export interface Supplier {
	id: number;
	name: string;
	type: SupplierType | null;
	gstNumber: string | null;
	panNumber: string | null;
	contactPerson: string | null;
	email: string | null;
	phone: string | null;
	address: string | null;
	defaultPaymentTermsDays: number | null;
	isActive: boolean;
	createdBy: number;
	createdAt: string;
}

export interface SupplierItem {
	id: number;
	supplierId: number;
	itemId: number;
	itemName: string;
	supplierSku: string | null;
	supplierUnitPricePaise: number;
	taxPercentage: number | null;
	leadTimeDays: number | null;
	qty: number | null;
	uom: string;
	isActive: boolean;
}

export interface SupplierService {
	id: number;
	supplierId: number;
	serviceId: number;
	serviceName: string;
	serviceUnitPricePaise: number;
	taxPercentage: number | null;
	leadTimeDays: number | null;
	isActive: boolean;
}

export interface SupplierDetailPayload {
	supplier: Supplier;
	supplierItems: SupplierItem[];
	supplierServices: SupplierService[];
}

export interface AssetItemOption {
	id: number;
	sku: string;
	name: string;
	description: string | null;
	uom: string;
	category: string | null;
}

export interface AssetServiceOption {
	id: number;
	code: string;
	name: string;
	description: string | null;
	defaultUom: string;
	sacCode: string | null;
}

export const GST_SLABS = [0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 28, 40] as const;

const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_PATTERN = /^[A-Z]{5}\d{4}[A-Z]$/;
const MAX_PRICE_PAISE = 2147483647;

// PAN sits at GSTIN chars 3-12 (BR-SUP-03).
export function panFromGstin(gstin: string) {
	return gstin.slice(2, 12);
}

export function rupeesToPaise(value: string) {
	return Math.round(Number(value) * 100);
}

export function paiseToRupees(paise: number) {
	return (paise / 100).toFixed(2);
}

function optionalUpper(pattern: RegExp, message: string) {
	return z
		.string()
		.trim()
		.refine((value) => value === "" || pattern.test(value.toUpperCase()), {
			message,
		})
		.optional();
}

export const supplierMasterSchema = z.object({
	name: z.string().trim().min(1, "Supplier name is required"),
	type: z.enum(supplierTypeValues).optional(),
	gstNumber: optionalUpper(GSTIN_PATTERN, "Enter a valid 15-character GSTIN"),
	panNumber: optionalUpper(PAN_PATTERN, "Enter a valid 10-character PAN"),
	contactPerson: z.string().trim().optional(),
	email: z
		.string()
		.trim()
		.refine((value) => value === "" || z.email().safeParse(value).success, {
			message: "Enter a valid email",
		})
		.optional(),
	phone: z.string().trim().optional(),
	address: z.string().trim().optional(),
	defaultPaymentTermsDays: z
		.number()
		.int("Whole days only")
		.min(0, "Must be 0 to 365")
		.max(365, "Must be 0 to 365")
		.optional(),
	isActive: z.boolean().default(true),
});

export type SupplierMasterInput = z.infer<typeof supplierMasterSchema>;

const priceRupeesField = z
	.string()
	.trim()
	.regex(/^\d+(\.\d{1,2})?$/, "Enter a price in rupees, up to 2 decimals")
	.refine(
		(value) => {
			const paise = rupeesToPaise(value);
			return paise >= 1 && paise <= MAX_PRICE_PAISE;
		},
		{ message: "Price must be at least 0.01" },
	);

const gstField = z
	.number()
	.refine((value) => (GST_SLABS as readonly number[]).includes(value), {
		message: "Choose a GST slab",
	});

const leadTimeField = z
	.number()
	.int("Whole days only")
	.min(0, "Must be 0 to 365")
	.max(365, "Must be 0 to 365");

export const supplierItemInputSchema = z
	.object({
		supplierItemsId: z.number().int().positive().optional(),
		itemId: z.number().int().positive().optional(),
		supplierSku: z.string().trim().optional(),
		supplierUnitPriceRupees: priceRupeesField,
		taxPercentage: gstField,
		leadTimeDays: leadTimeField,
		qty: z
			.number()
			.min(0, "Cannot be negative")
			.refine((value) => Math.round(value * 1000) / 1000 === value, {
				message: "At most 3 decimals",
			}),
		uom: z.string().trim().min(1, "UOM is required"),
		isActive: z.boolean(),
	})
	.superRefine((value, ctx) => {
		if (!value.supplierItemsId && !value.itemId) {
			ctx.addIssue({
				code: "custom",
				path: ["itemId"],
				message: "Choose an item",
			});
		}
	});

export type SupplierItemInput = z.infer<typeof supplierItemInputSchema>;

export const supplierServiceInputSchema = z
	.object({
		supplierServiceId: z.number().int().positive().optional(),
		serviceId: z.number().int().positive().optional(),
		serviceUnitPriceRupees: priceRupeesField,
		taxPercentage: gstField,
		leadTimeDays: leadTimeField,
		isActive: z.boolean(),
	})
	.superRefine((value, ctx) => {
		if (!value.supplierServiceId && !value.serviceId) {
			ctx.addIssue({
				code: "custom",
				path: ["serviceId"],
				message: "Choose a service",
			});
		}
	});

export type SupplierServiceInput = z.infer<typeof supplierServiceInputSchema>;

export type SupplierHistoryEntity = "supplier" | "item" | "service";

export interface SupplierHistoryRow {
	id: number;
	supplierId: number;
	entity: SupplierHistoryEntity;
	entityId: number;
	field: string;
	oldValue: string | null;
	newValue: string | null;
	changedBy: number;
	changedByName: string | null;
	entityLabel: string | null;
	changedAt: string;
}

export type SupplierHistoryParams = {
	page?: number;
	pageSize?: number;
	entity?: SupplierHistoryEntity;
};

export interface BatchRowResult<T> {
	index: number;
	selector: Record<string, unknown>;
	success: boolean;
	data?: T;
	error?: string;
}

export interface BatchEditResponse<T> {
	success: boolean;
	data: BatchRowResult<T>[];
	summary: { total: number; success: number; failed: number };
	message?: string;
}

export type SupplierCreatePayload = {
	name: string;
	type?: SupplierType;
	gstNumber?: string;
	panNumber?: string;
	contactPerson?: string;
	email?: string;
	phone?: string;
	address?: string;
	defaultPaymentTermsDays?: number;
	isActive?: boolean;
};

export type SupplierMasterUpdatePayload = {
	mode: "master";
	name?: string;
	type?: SupplierType;
	gstNumber?: string | null;
	panNumber?: string | null;
	contactPerson?: string | null;
	email?: string | null;
	phone?: string | null;
	address?: string | null;
	defaultPaymentTermsDays?: number;
	isActive?: boolean;
};

export type SupplierItemCreatePayload = {
	itemId: number;
	supplierSku?: string;
	supplierUnitPricePaise: number;
	taxPercentage?: number;
	leadTimeDays?: number;
	qty?: number;
	uom: string;
	isActive?: boolean;
};

export type SupplierItemEditPayload = {
	supplierItemsId?: number;
	itemId?: number;
	supplierSku?: string | null;
	supplierUnitPricePaise?: number;
	taxPercentage?: number;
	leadTimeDays?: number;
	qty?: number;
	uom?: string;
	isActive?: boolean;
};

export type SupplierServiceCreatePayload = {
	serviceId: number;
	serviceUnitPricePaise: number;
	taxPercentage?: number;
	leadTimeDays?: number;
	isActive?: boolean;
};

export type SupplierServiceEditPayload = {
	supplierServiceId?: number;
	serviceId?: number;
	serviceUnitPricePaise?: number;
	taxPercentage?: number;
	leadTimeDays?: number;
	isActive?: boolean;
};
