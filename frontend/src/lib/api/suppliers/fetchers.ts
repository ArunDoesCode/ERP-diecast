import { api } from "@/lib/api/client";
import { API_ROUTES } from "@/lib/api/routes";
import type {
	ApiResult,
	AssetItemOption,
	AssetLookupParams,
	AssetServiceOption,
	BatchEditResponse,
	PaginatedResponse,
	Supplier,
	SupplierCreatePayload,
	SupplierDetailPayload,
	SupplierHistoryParams,
	SupplierHistoryRow,
	SupplierItem,
	SupplierItemCreatePayload,
	SupplierItemEditPayload,
	SupplierListParams,
	SupplierMasterUpdatePayload,
	SupplierOfferingListParams,
	SupplierService,
	SupplierServiceCreatePayload,
	SupplierServiceEditPayload,
} from "@/types/suppliers";

function toQueryString(params?: Record<string, unknown>) {
	if (!params) return "";

	const entries = Object.entries(params).filter(
		([, value]) => value !== undefined && value !== null && value !== "",
	);

	if (entries.length === 0) return "";

	return `?${new URLSearchParams(entries.map(([key, value]) => [key, String(value)]))}`;
}

export function getSuppliers(params?: SupplierListParams) {
	return api.get<PaginatedResponse<Supplier>>(
		`${API_ROUTES.suppliers.listSuppliers}${toQueryString(params)}`,
	);
}

export function createSupplier(payload: SupplierCreatePayload) {
	return api.post<ApiResult<Supplier>, SupplierCreatePayload>(
		API_ROUTES.suppliers.createSupplier,
		payload,
	);
}

export function getSupplierDetail(supplierId: number) {
	return api.get<ApiResult<SupplierDetailPayload>>(
		API_ROUTES.suppliers.detail(supplierId),
	);
}

export function updateSupplierMaster(
	supplierId: number,
	payload: SupplierMasterUpdatePayload,
) {
	return api.patch<ApiResult<Supplier>, SupplierMasterUpdatePayload>(
		API_ROUTES.suppliers.updateSupplier(supplierId),
		payload,
	);
}

export function getSupplierItems(
	supplierId: number,
	params?: SupplierOfferingListParams,
) {
	return api.get<
		PaginatedResponse<SupplierDetailPayload["supplierItems"][number]>
	>(`${API_ROUTES.suppliers.listItems(supplierId)}${toQueryString(params)}`);
}

export function createSupplierItem(
	supplierId: number,
	payload: SupplierItemCreatePayload,
) {
	return api.post<
		ApiResult<SupplierDetailPayload["supplierItems"][number]>,
		SupplierItemCreatePayload
	>(API_ROUTES.suppliers.createItem(supplierId), payload);
}

export function editSupplierItem(
	supplierId: number,
	payload: SupplierItemEditPayload | SupplierItemEditPayload[],
) {
	return api.patch<BatchEditResponse<SupplierItem>, typeof payload>(
		API_ROUTES.suppliers.editItem(supplierId),
		payload,
	);
}

export function getSupplierServices(
	supplierId: number,
	params?: SupplierOfferingListParams,
) {
	return api.get<
		PaginatedResponse<SupplierDetailPayload["supplierServices"][number]>
	>(`${API_ROUTES.suppliers.listServices(supplierId)}${toQueryString(params)}`);
}

export function createSupplierService(
	supplierId: number,
	payload: SupplierServiceCreatePayload,
) {
	return api.post<
		ApiResult<SupplierDetailPayload["supplierServices"][number]>,
		SupplierServiceCreatePayload
	>(API_ROUTES.suppliers.createService(supplierId), payload);
}

export function editSupplierService(
	supplierId: number,
	payload: SupplierServiceEditPayload | SupplierServiceEditPayload[],
) {
	return api.patch<BatchEditResponse<SupplierService>, typeof payload>(
		API_ROUTES.suppliers.editService(supplierId),
		payload,
	);
}

export function getSupplierHistory(
	supplierId: number,
	params?: SupplierHistoryParams,
) {
	return api.get<PaginatedResponse<SupplierHistoryRow>>(
		`${API_ROUTES.suppliers.history(supplierId)}${toQueryString(params)}`,
	);
}

export function getAssetItems(params?: AssetLookupParams) {
	return api.get<PaginatedResponse<AssetItemOption>>(
		`${API_ROUTES.assets.items}${toQueryString(params)}`,
	);
}

export function getAssetServices(params?: AssetLookupParams) {
	return api.get<PaginatedResponse<AssetServiceOption>>(
		`${API_ROUTES.assets.services}${toQueryString(params)}`,
	);
}
