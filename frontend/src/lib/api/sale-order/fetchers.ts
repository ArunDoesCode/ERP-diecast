import { api } from "@/lib/api/client";
import { API_ROUTES } from "@/lib/api/routes";
import type {
	DataResponse,
	PagedResponse,
	SoAuditParams,
	SoAuditRow,
	SoCreatePayload,
	SoDetail,
	SoDraftsPayload,
	SoDraftsResult,
	SoExplosionCreated,
	SoExplosionHeader,
	SoExplosionListParams,
	SoExplosionRow,
	SoExplosionRowsParams,
	SoExplosionRun,
	SoListParams,
	SoListRow,
	SoReasonPayload,
	SoStatusCounts,
	SoUpdatePayload,
	SoVersionPayload,
} from "@/types/sale-order";

function toQueryString(params?: object) {
	if (!params) return "";
	const entries = Object.entries(params).filter(
		([, value]) => value !== undefined && value !== null && value !== "",
	);
	if (entries.length === 0) return "";
	return `?${new URLSearchParams(entries.map(([key, value]) => [key, String(value)]))}`;
}

export function getSaleOrders(params?: SoListParams) {
	return api.get<PagedResponse<SoListRow, { statusCounts?: SoStatusCounts }>>(
		`${API_ROUTES.saleOrders.list}${toQueryString(params)}`,
	);
}

export function getSaleOrder(soId: number) {
	return api.get<DataResponse<SoDetail>>(API_ROUTES.saleOrders.detail(soId));
}

export function createSaleOrder(payload: SoCreatePayload) {
	return api.post<DataResponse<SoDetail>, SoCreatePayload>(
		API_ROUTES.saleOrders.create,
		payload,
	);
}

export function updateSaleOrder(soId: number, payload: SoUpdatePayload) {
	return api.patch<DataResponse<SoDetail>, SoUpdatePayload>(
		API_ROUTES.saleOrders.update(soId),
		payload,
	);
}

export function confirmSaleOrder(soId: number, payload: SoVersionPayload) {
	return api.post<DataResponse<SoDetail>, SoVersionPayload>(
		API_ROUTES.saleOrders.confirm(soId),
		payload,
	);
}

export function resumeSaleOrder(soId: number, payload: SoVersionPayload) {
	return api.post<DataResponse<SoDetail>, SoVersionPayload>(
		API_ROUTES.saleOrders.resume(soId),
		payload,
	);
}

export function holdSaleOrder(soId: number, payload: SoReasonPayload) {
	return api.post<DataResponse<SoDetail>, SoReasonPayload>(
		API_ROUTES.saleOrders.hold(soId),
		payload,
	);
}

export function closeSaleOrder(soId: number, payload: SoReasonPayload) {
	return api.post<DataResponse<SoDetail>, SoReasonPayload>(
		API_ROUTES.saleOrders.close(soId),
		payload,
	);
}

export function cancelSaleOrder(soId: number, payload: SoReasonPayload) {
	return api.post<DataResponse<SoDetail>, SoReasonPayload>(
		API_ROUTES.saleOrders.cancel(soId),
		payload,
	);
}

export function getSaleOrderAudit(soId: number, params?: SoAuditParams) {
	return api.get<PagedResponse<SoAuditRow>>(
		`${API_ROUTES.saleOrders.audit(soId)}${toQueryString(params)}`,
	);
}

export function getSoExplosions(soId: number, params?: SoExplosionListParams) {
	return api.get<PagedResponse<SoExplosionRun>>(
		`${API_ROUTES.saleOrders.explosions(soId)}${toQueryString(params)}`,
	);
}

export function runSoExplosion(soId: number) {
	return api.post<DataResponse<SoExplosionCreated>, Record<string, never>>(
		API_ROUTES.saleOrders.explosions(soId),
		{},
	);
}

export function getSoExplosion(soId: number, eid: number) {
	return api.get<DataResponse<SoExplosionHeader>>(
		API_ROUTES.saleOrders.explosion(soId, eid),
	);
}

export function getSoExplosionRows(
	soId: number,
	eid: number,
	params?: SoExplosionRowsParams,
) {
	return api.get<PagedResponse<SoExplosionRow>>(
		`${API_ROUTES.saleOrders.explosionRows(soId, eid)}${toQueryString(params)}`,
	);
}

export function createSoDrafts(
	soId: number,
	eid: number,
	payload: SoDraftsPayload,
) {
	return api.post<DataResponse<SoDraftsResult>, SoDraftsPayload>(
		API_ROUTES.saleOrders.explosionDrafts(soId, eid),
		payload,
	);
}
