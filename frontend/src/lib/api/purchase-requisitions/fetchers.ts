import { api } from "@/lib/api/client";
import { API_ROUTES } from "@/lib/api/routes";
import type {
	ApiResult,
	PaginatedResponse,
	PRCreatePayload,
	PRDeletePayload,
	PRDeleteResult,
	PRLineCancelResult,
	PRUpdatePayload,
	PurchaseRequisition,
	PurchaseRequisitionDetailPayload,
	PurchaseRequisitionListParams,
} from "@/types/purchase-requisitions";

function toQueryString(params?: Record<string, unknown>) {
	if (!params) return "";

	const entries = Object.entries(params).filter(
		([, value]) => value !== undefined && value !== null && value !== "",
	);

	if (entries.length === 0) return "";

	return `?${new URLSearchParams(entries.map(([key, value]) => [key, String(value)]))}`;
}

export function getPurchaseRequisitions(
	params?: PurchaseRequisitionListParams,
) {
	return api.get<PaginatedResponse<PurchaseRequisition>>(
		`${API_ROUTES.purchaseRequisitions.list}${toQueryString(params)}`,
	);
}

export function getPurchaseRequisitionById(prId: number) {
	return api.get<ApiResult<PurchaseRequisitionDetailPayload>>(
		API_ROUTES.purchaseRequisitions.detail(prId),
	);
}

export function createPurchaseRequisition(payload: PRCreatePayload) {
	return api.post<ApiResult<PurchaseRequisition>, PRCreatePayload>(
		API_ROUTES.purchaseRequisitions.create,
		payload,
	);
}

export function updatePurchaseRequisition(payload: PRUpdatePayload) {
	return api.patch<ApiResult<PurchaseRequisition>, PRUpdatePayload>(
		API_ROUTES.purchaseRequisitions.update,
		payload,
	);
}

export function deletePurchaseRequisition(payload: PRDeletePayload) {
	return api.delete<PRDeleteResult, { reason: string }>(
		API_ROUTES.purchaseRequisitions.remove(payload.prId),
		{ reason: payload.reason },
	);
}

export function cancelPurchaseRequisitionLine(
	prId: number,
	lineId: number,
	reason: string,
) {
	return api.post<PRLineCancelResult, { reason: string }>(
		API_ROUTES.purchaseRequisitions.cancelLine(prId, lineId),
		{ reason },
	);
}
