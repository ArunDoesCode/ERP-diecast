import { api } from "@/lib/api/client";
import { API_ROUTES } from "@/lib/api/routes";
import type {
	ClosePoPayload,
	ConfirmPoPayload,
	LastRateResult,
	LogPoCommunicationPayload,
	MarkPoInvoicedPayload,
	POCancelResult,
	POCloseResult,
	POCommunicationResult,
	POCommunicationsResult,
	POConfirmResult,
	POCreatePayload,
	POCreateResult,
	PODelayResult,
	POInvoiceResult,
	POListResult,
	POSendResult,
	POShortCloseResult,
	POUpdatePayload,
	POUpdateResult,
	PurchaseOrderDetailPayload,
	PurchaseOrderListParams,
	ShortClosePoPayload,
	UpdatePoDelayPayload,
} from "@/types/purchase-orders";
import type { ApiResult } from "@/types/purchase-requisitions";

function toQueryString(params?: Record<string, unknown>) {
	if (!params) return "";

	const entries = Object.entries(params).filter(
		([, value]) => value !== undefined && value !== null && value !== "",
	);

	if (entries.length === 0) return "";

	return `?${new URLSearchParams(entries.map(([key, value]) => [key, String(value)]))}`;
}

export function getPurchaseOrders(params?: PurchaseOrderListParams) {
	return api.get<POListResult>(
		`${API_ROUTES.purchaseOrders.list}${toQueryString(params)}`,
	);
}

export function getPurchaseOrderById(poId: number) {
	return api.get<ApiResult<PurchaseOrderDetailPayload>>(
		API_ROUTES.purchaseOrders.detail(poId),
	);
}

export function createPurchaseOrder(payload: POCreatePayload) {
	return api.post<POCreateResult, POCreatePayload>(
		API_ROUTES.purchaseOrders.create,
		payload,
	);
}

export function getItemLastRate(itemId: number, supplierId: number) {
	return api.get<LastRateResult>(
		`${API_ROUTES.assets.itemLastRate(itemId)}${toQueryString({ supplierId })}`,
	);
}

export function updatePurchaseOrder(payload: POUpdatePayload) {
	return api.patch<POUpdateResult, POUpdatePayload>(
		API_ROUTES.purchaseOrders.update,
		payload,
	);
}

export function cancelPurchaseOrder(poId: number, reason: string) {
	return api.delete<POCancelResult, { reason: string }>(
		API_ROUTES.purchaseOrders.remove(poId),
		{ reason },
	);
}

export function sendPurchaseOrder(
	poId: number,
	payload: LogPoCommunicationPayload,
) {
	return api.post<POSendResult, LogPoCommunicationPayload>(
		API_ROUTES.purchaseOrders.send(poId),
		payload,
	);
}

export function sendPurchaseOrderReminder(
	poId: number,
	payload: LogPoCommunicationPayload,
) {
	return api.post<POCommunicationResult, LogPoCommunicationPayload>(
		API_ROUTES.purchaseOrders.reminder(poId),
		payload,
	);
}

export function escalatePurchaseOrder(
	poId: number,
	payload: LogPoCommunicationPayload,
) {
	return api.post<POCommunicationResult, LogPoCommunicationPayload>(
		API_ROUTES.purchaseOrders.escalate(poId),
		payload,
	);
}

export function updatePurchaseOrderDelay(
	poId: number,
	payload: UpdatePoDelayPayload,
) {
	return api.patch<PODelayResult, UpdatePoDelayPayload>(
		API_ROUTES.purchaseOrders.delay(poId),
		payload,
	);
}

export function confirmPurchaseOrder(poId: number, payload: ConfirmPoPayload) {
	return api.post<POConfirmResult, ConfirmPoPayload>(
		API_ROUTES.purchaseOrders.confirm(poId),
		payload,
	);
}

export function markPurchaseOrderInvoiced(
	poId: number,
	payload: MarkPoInvoicedPayload,
) {
	return api.post<POInvoiceResult, MarkPoInvoicedPayload>(
		API_ROUTES.purchaseOrders.invoice(poId),
		payload,
	);
}

export function closePurchaseOrder(poId: number, payload: ClosePoPayload) {
	return api.post<POCloseResult, ClosePoPayload>(
		API_ROUTES.purchaseOrders.close(poId),
		payload,
	);
}

export function shortClosePurchaseOrder(
	poId: number,
	payload: ShortClosePoPayload,
) {
	return api.post<POShortCloseResult, ShortClosePoPayload>(
		API_ROUTES.purchaseOrders.shortClose(poId),
		payload,
	);
}

export function getPurchaseOrderCommunications(poId: number) {
	return api.get<POCommunicationsResult>(
		API_ROUTES.purchaseOrders.communications(poId),
	);
}
