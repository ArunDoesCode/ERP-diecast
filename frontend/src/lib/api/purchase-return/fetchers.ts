import { api } from "@/lib/api/client";
import { API_ROUTES } from "@/lib/api/routes";
import type {
	DataResponse,
	PagedResponse,
	PrtAwaitingParams,
	PrtAwaitingRow,
	PrtCancelledDraft,
	PrtCancelledPosted,
	PrtCancelPayload,
	PrtCreated,
	PrtCreatePayload,
	PrtDetail,
	PrtListMeta,
	PrtListParams,
	PrtListRow,
	PrtPosted,
	PrtPrefill,
	PrtUpdated,
	PrtUpdatePayload,
} from "@/types/purchase-return";

function toQueryString(params?: object) {
	if (!params) return "";
	const entries = Object.entries(params).filter(
		([, value]) => value !== undefined && value !== null && value !== "",
	);
	if (entries.length === 0) return "";
	return `?${new URLSearchParams(entries.map(([key, value]) => [key, String(value)]))}`;
}

export function getPurchaseReturns(params?: PrtListParams) {
	return api.get<PagedResponse<PrtListRow, PrtListMeta>>(
		`${API_ROUTES.purchaseReturns.list}${toQueryString(params)}`,
	);
}

export function getAwaitingReturns(params?: PrtAwaitingParams) {
	return api.get<PagedResponse<PrtAwaitingRow, PrtListMeta>>(
		`${API_ROUTES.purchaseReturns.awaiting}${toQueryString(params)}`,
	);
}

export function getPurchaseReturn(id: number) {
	return api.get<DataResponse<PrtDetail>>(
		API_ROUTES.purchaseReturns.detail(id),
	);
}

export function getReturnPrefill(grnId: number) {
	return api.get<DataResponse<PrtPrefill>>(
		API_ROUTES.purchaseReturns.prefill(grnId),
	);
}

export function createPurchaseReturn(payload: PrtCreatePayload) {
	return api.post<DataResponse<PrtCreated>, PrtCreatePayload>(
		API_ROUTES.purchaseReturns.create,
		payload,
	);
}

export function updatePurchaseReturn(payload: PrtUpdatePayload) {
	return api.patch<DataResponse<PrtUpdated>, PrtUpdatePayload>(
		API_ROUTES.purchaseReturns.update,
		payload,
	);
}

export function cancelReturnDraft(id: number) {
	return api.post<DataResponse<PrtCancelledDraft>>(
		API_ROUTES.purchaseReturns.cancelDraft(id),
	);
}

export function postPurchaseReturn(id: number) {
	return api.post<DataResponse<PrtPosted>>(API_ROUTES.purchaseReturns.post(id));
}

export function cancelPostedReturn(id: number, payload: PrtCancelPayload) {
	return api.post<DataResponse<PrtCancelledPosted>, PrtCancelPayload>(
		API_ROUTES.purchaseReturns.cancel(id),
		payload,
	);
}
