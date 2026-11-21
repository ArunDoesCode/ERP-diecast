import { api } from "@/lib/api/client";
import { API_ROUTES } from "@/lib/api/routes";
import type {
	DataResponse,
	PagedResponse,
	StCancelled,
	StCreatePayload,
	StDetail,
	StListParams,
	StListRow,
	StPosted,
	StReversed,
	StReversePayload,
	StSaved,
	StUpdatePayload,
} from "@/types/stock-transfer";

function toQueryString(params?: object) {
	if (!params) return "";
	const entries = Object.entries(params).filter(
		([, value]) => value !== undefined && value !== null && value !== "",
	);
	if (entries.length === 0) return "";
	return `?${new URLSearchParams(entries.map(([key, value]) => [key, String(value)]))}`;
}

export function getStockTransfers(params?: StListParams) {
	return api.get<PagedResponse<StListRow>>(
		`${API_ROUTES.stockTransfers.list}${toQueryString(params)}`,
	);
}

export function getStockTransfer(id: number) {
	return api.get<DataResponse<StDetail>>(API_ROUTES.stockTransfers.detail(id));
}

export function createStockTransfer(payload: StCreatePayload) {
	return api.post<DataResponse<StSaved>, StCreatePayload>(
		API_ROUTES.stockTransfers.create,
		payload,
	);
}

export function updateStockTransfer(id: number, payload: StUpdatePayload) {
	return api.patch<DataResponse<StSaved>, StUpdatePayload>(
		API_ROUTES.stockTransfers.update(id),
		payload,
	);
}

// Cancel and post take a strict empty body.
export function cancelStockTransfer(id: number) {
	return api.post<DataResponse<StCancelled>, Record<string, never>>(
		API_ROUTES.stockTransfers.cancel(id),
		{},
	);
}

export function postStockTransfer(id: number) {
	return api.post<DataResponse<StPosted>, Record<string, never>>(
		API_ROUTES.stockTransfers.post(id),
		{},
	);
}

export function reverseStockTransfer(id: number, payload: StReversePayload) {
	return api.post<DataResponse<StReversed>, StReversePayload>(
		API_ROUTES.stockTransfers.reverse(id),
		payload,
	);
}
