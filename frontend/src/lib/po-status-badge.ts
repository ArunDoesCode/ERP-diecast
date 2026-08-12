import type { StatusBadgeStyle } from "@/lib/pr-status-badge";
import type { POStatus } from "@/types/purchase-orders";

const PO_STATUS_BADGE_STYLE: Record<POStatus, StatusBadgeStyle> = {
	draft: {
		variant: "secondary",
		className: "border-amber-200 bg-amber-100 text-amber-800",
	},
	pending_approval: {
		variant: "outline",
		className: "border-slate-300 bg-slate-100 text-foreground",
	},
	approved: {
		variant: "default",
		className: "border-emerald-200 bg-emerald-100 text-emerald-800",
	},
	dispatched: {
		variant: "secondary",
		className: "border-sky-200 bg-sky-100 text-sky-800",
	},
	partial_received: {
		variant: "secondary",
		className: "border-indigo-200 bg-indigo-100 text-indigo-800",
	},
	fully_received: {
		variant: "default",
		className: "border-green-200 bg-green-100 text-green-800",
	},
	invoiced: {
		variant: "default",
		className: "border-teal-200 bg-teal-100 text-teal-800",
	},
	closed: {
		variant: "outline",
		className: "border-zinc-300 bg-zinc-100 text-zinc-700",
	},
	cancelled: {
		variant: "outline",
		className: "border-rose-300 bg-rose-100 text-rose-800",
	},
};

const FALLBACK_STATUS_BADGE_STYLE: StatusBadgeStyle = {
	variant: "outline",
	className: "border-zinc-300 bg-zinc-100 text-zinc-700",
};

export function getPOStatusBadgeStyle(
	status?: POStatus | null,
): StatusBadgeStyle {
	if (!status) return FALLBACK_STATUS_BADGE_STYLE;
	return PO_STATUS_BADGE_STYLE[status] ?? FALLBACK_STATUS_BADGE_STYLE;
}

export const PO_TERMINAL_STATUSES = new Set<POStatus>(["cancelled", "closed"]);
export const PO_IN_TRANSIT_STATUSES = new Set<POStatus>([
	"dispatched",
	"partial_received",
]);

const PO_NOT_CANCELLABLE_STATUSES = new Set<POStatus>([
	"fully_received",
	"invoiced",
	"closed",
	"cancelled",
]);

export function canCancelPurchaseOrder(status: POStatus) {
	return !PO_NOT_CANCELLABLE_STATUSES.has(status);
}

export function canMarkPurchaseOrderInvoiced(status: POStatus) {
	return status === "fully_received";
}

export function canClosePurchaseOrder(status: POStatus) {
	return status === "fully_received" || status === "invoiced";
}
