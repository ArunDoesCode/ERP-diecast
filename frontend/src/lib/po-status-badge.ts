import type { POStatus } from "@/types/purchase-orders";

export const PO_TERMINAL_STATUSES = new Set<POStatus>(["cancelled", "closed"]);
export const PO_IN_TRANSIT_STATUSES = new Set<POStatus>([
	"dispatched",
	"partial_received",
]);

// BR-PO-11: cancel only from these; the backend still refuses when a GRN exists.
const PO_CANCELLABLE_STATUSES = new Set<POStatus>([
	"draft",
	"pending_approval",
	"approved",
	"dispatched",
]);

export function canCancelPurchaseOrder(status: POStatus) {
	return PO_CANCELLABLE_STATUSES.has(status);
}

// BR-PO-13
export function canShortClosePurchaseOrder(status: POStatus) {
	return status === "partial_received";
}

/** POs that can take a NEW supplier invoice (BR-SINV-04). "Invoiced" is set by the invoice service and is not billable again. */
export const PO_BILLABLE_STATUSES: ReadonlySet<POStatus> = new Set([
	"partial_received",
	"fully_received",
	"closed",
]);

export function canClosePurchaseOrder(status: POStatus) {
	return status === "fully_received" || status === "invoiced";
}
