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

export type SupplierListParams = {
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

export const supplierMasterSchema = z.object({
  name: z.string().trim().min(1, "Supplier name is required"),
  type: z.enum(supplierTypeValues).optional(),
  gstNumber: z.string().trim().optional().or(z.literal("")),
  panNumber: z.string().trim().optional().or(z.literal("")),
  contactPerson: z.string().trim().optional().or(z.literal("")),
  email: z.email("Enter a valid email").optional().or(z.literal("")),
  phone: z.string().trim().optional().or(z.literal("")),
  address: z.string().trim().optional().or(z.literal("")),
  defaultPaymentTermsDays: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean().default(true),
});

export type SupplierMasterInput = z.infer<typeof supplierMasterSchema>;

export const supplierItemInputSchema = z
  .object({
    supplierItemsId: z.coerce.number().int().positive().optional(),
    itemId: z.coerce.number().int().positive().optional(),
    supplierSku: z.string().trim().optional().or(z.literal("")),
    supplierUnitPricePaise: z.coerce.number().int().min(0),
    taxPercentage: z.coerce.number().min(0).max(100).optional(),
    leadTimeDays: z.coerce.number().int().min(0).optional(),
    qty: z.coerce.number().min(0).optional(),
    uom: z.string().trim().min(1, "UOM is required"),
    isActive: z.boolean().default(true),
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
    supplierServiceId: z.coerce.number().int().positive().optional(),
    serviceId: z.coerce.number().int().positive().optional(),
    serviceUnitPricePaise: z.coerce.number().int().min(0),
    taxPercentage: z.coerce.number().min(0).max(100).optional(),
    leadTimeDays: z.coerce.number().int().min(0).optional(),
    isActive: z.boolean().default(true),
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
