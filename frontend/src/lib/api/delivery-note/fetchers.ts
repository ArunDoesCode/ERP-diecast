import { api } from "@/lib/api/client";
import { API_ROUTES } from "@/lib/api/routes";
import type {
	DataResponse,
	DnCreatePayload,
	DnDetail,
	DnListMeta,
	DnListParams,
	DnListRow,
	DnPendingMeta,
	DnPendingParams,
	DnPendingRow,
	DnReasonPayload,
	DnSettings,
	DnTransportHistoryRow,
	DnTransportInput,
	DnUpdatePayload,
	PagedResponse,
} from "@/types/delivery-note";
import type { PaginationMeta } from "@/types/suppliers";

function toQueryString(params?: object) {
	if (!params) return "";
	const entries = Object.entries(params).filter(
		([, value]) => value !== undefined && value !== null && value !== "",
	);
	if (entries.length === 0) return "";
	return `?${new URLSearchParams(entries.map(([key, value]) => [key, String(value)]))}`;
}

export function getPendingDispatch(params?: DnPendingParams) {
	return api.get<PagedResponse<DnPendingRow, DnPendingMeta>>(
		`${API_ROUTES.dispatch.pending}${toQueryString(params)}`,
	);
}

export function getDispatchSettings() {
	return api.get<DataResponse<DnSettings>>(API_ROUTES.dispatch.settings);
}

export function getDeliveryNotes(params?: DnListParams) {
	return api.get<PagedResponse<DnListRow, DnListMeta>>(
		`${API_ROUTES.dispatch.notes}${toQueryString(params)}`,
	);
}

export function getDeliveryNote(id: number) {
	return api.get<DataResponse<DnDetail>>(API_ROUTES.dispatch.note(id));
}

export function getTransportHistory(
	id: number,
	params?: { page?: number; pageSize?: number },
) {
	return api.get<PagedResponse<DnTransportHistoryRow, PaginationMeta>>(
		`${API_ROUTES.dispatch.transportHistory(id)}${toQueryString(params)}`,
	);
}

export function createDeliveryNote(payload: DnCreatePayload) {
	return api.post<DataResponse<DnDetail>, DnCreatePayload>(
		API_ROUTES.dispatch.notes,
		payload,
	);
}

export function updateDeliveryNote(id: number, payload: DnUpdatePayload) {
	return api.patch<DataResponse<DnDetail>, DnUpdatePayload>(
		API_ROUTES.dispatch.note(id),
		payload,
	);
}

export function postDeliveryNote(id: number) {
	return api.post<DataResponse<DnDetail>, Record<string, never>>(
		API_ROUTES.dispatch.post(id),
		{},
	);
}

export function cancelDeliveryNoteDraft(id: number, payload: DnReasonPayload) {
	return api.post<DataResponse<DnDetail>, DnReasonPayload>(
		API_ROUTES.dispatch.cancelDraft(id),
		payload,
	);
}

export function cancelDeliveryNote(id: number, payload: DnReasonPayload) {
	return api.post<DataResponse<DnDetail>, DnReasonPayload>(
		API_ROUTES.dispatch.cancel(id),
		payload,
	);
}

export function updateDeliveryNoteTransport(
	id: number,
	payload: DnTransportInput,
) {
	return api.patch<DataResponse<DnDetail>, DnTransportInput>(
		API_ROUTES.dispatch.transport(id),
		payload,
	);
}
