import { api } from "@/lib/api/client";
import { API_ROUTES } from "@/lib/api/routes";
import type {
	ClosePoPayload,
	ConfirmPoPayload,
	LastRateData,
	LastRateResult,
	LogPoCommunicationPayload,
	POCancelResult,
	POCloseResult,
	POCommunicationResult,
	POCommunicationsResult,
	POConfirmResult,
	POCreatePayload,
	POCreateResult,
	PODelayResult,
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
import type {
	ApiResult,
	PaginatedResponse,
} from "@/types/purchase-requisitions";
import type { SupplierItem } from "@/types/suppliers";

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

/** `onDate` (IST day) picks the contract in force on the PO date (BR-RFQ-50). */
export function getItemLastRate(
	itemId: number,
	supplierId: number,
	onDate?: string,
) {
	return api.get<LastRateResult>(
		`${API_ROUTES.assets.itemLastRate(itemId)}${toQueryString({ supplierId, onDate })}`,
	);
}

// The batched last-rates endpoint takes at most 200 ids per call.
const LAST_RATE_CHUNK = 200;

/**
 * Last rates for many items at once, keyed by item id (PERF-01/02): one call per
 * 200 items. Items the backend does not know are omitted (undefined).
 */
export async function getItemsLastRates(
	itemIds: number[],
	supplierId: number,
	onDate?: string,
): Promise<Record<number, LastRateData | undefined>> {
	const ids = [...new Set(itemIds)].sort((a, b) => a - b);
	const chunks: number[][] = [];
	for (let i = 0; i < ids.length; i += LAST_RATE_CHUNK) {
		chunks.push(ids.slice(i, i + LAST_RATE_CHUNK));
	}
	const pages = await Promise.all(
		chunks.map((chunk) =>
			api.get<{
				success: boolean;
				data: (LastRateData & { itemId: number })[];
			}>(
				`${API_ROUTES.assets.itemsLastRates}${toQueryString({
					supplierId,
					itemIds: chunk.join(","),
					onDate,
				})}`,
			),
		),
	);
	const byItem: Record<number, LastRateData | undefined> = {};
	for (const id of ids) byItem[id] = undefined;
	for (const page of pages) {
		for (const { itemId, ...rest } of page.data) byItem[itemId] = rest;
	}
	return byItem;
}

// Ids per call: the supplier item list takes at most 100 ids, one page.
const PRICE_ROW_CHUNK = 100;

/**
 * The supplier's price-list rows for exactly these items (#107, PERF-03): no
 * 100-row cap, whatever the size of the supplier's price list. One call per
 * 100 items.
 */
export async function getSupplierPriceRows(
	supplierId: number,
	itemIds: number[],
): Promise<SupplierItem[]> {
	const ids = [...new Set(itemIds)].sort((a, b) => a - b);
	const chunks: number[][] = [];
	for (let i = 0; i < ids.length; i += PRICE_ROW_CHUNK) {
		chunks.push(ids.slice(i, i + PRICE_ROW_CHUNK));
	}
	const pages = await Promise.all(
		chunks.map((chunk) =>
			api.get<PaginatedResponse<SupplierItem>>(
				`${API_ROUTES.suppliers.listItems(supplierId)}${toQueryString({
					page: 1,
					pageSize: PRICE_ROW_CHUNK,
					itemIds: chunk.join(","),
				})}`,
			),
		),
	);
	return pages.flatMap((page) => page.data);
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
