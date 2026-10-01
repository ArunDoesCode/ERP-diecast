import type { StatusBadgeStyle } from "@/lib/pr-status-badge";
import type { ChallanDueStatus, ScoStatus } from "@/types/subcontracting";

export const SCO_STATUS_LABEL: Record<ScoStatus, string> = {
	draft: "Draft",
	pending_approval: "Pending approval",
	approved: "Approved",
	rejected: "Rejected",
	require_more_info: "Sent back",
	material_issued: "Material issued",
	material_received: "Material received",
	closed: "Closed",
	cancelled: "Cancelled",
};

const SCO_STATUS_BADGE_STYLE: Record<ScoStatus, StatusBadgeStyle> = {
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
	rejected: {
		variant: "outline",
		className: "border-rose-300 bg-rose-100 text-rose-800",
	},
	require_more_info: {
		variant: "secondary",
		className: "border-amber-200 bg-amber-100 text-amber-800",
	},
	material_issued: {
		variant: "secondary",
		className: "border-sky-200 bg-sky-100 text-sky-800",
	},
	material_received: {
		variant: "default",
		className: "border-green-200 bg-green-100 text-green-800",
	},
	closed: {
		variant: "default",
		className: "border-green-200 bg-green-100 text-green-800",
	},
	cancelled: {
		variant: "outline",
		className: "border-zinc-300 bg-zinc-300 text-foreground",
	},
};

export function getScoStatusBadgeStyle(status: ScoStatus) {
	return SCO_STATUS_BADGE_STYLE[status];
}

export function formatScoDate(value?: string | null) {
	if (!value) return "-";
	return new Date(value).toLocaleDateString("en-IN", {
		timeZone: "Asia/Kolkata",
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

export const CHALLAN_DUE_BADGE: Record<ChallanDueStatus, StatusBadgeStyle> = {
	ok: {
		variant: "default",
		className: "border-emerald-200 bg-emerald-100 text-emerald-800",
	},
	warning: {
		variant: "secondary",
		className: "border-amber-200 bg-amber-100 text-amber-800",
	},
	overdue: {
		variant: "outline",
		className: "border-rose-300 bg-rose-100 text-rose-800",
	},
};

export function formatDaysLeft(daysLeft: number) {
	if (daysLeft < 0) return `${Math.abs(daysLeft)} days overdue`;
	if (daysLeft === 0) return "Due today";
	return `${daysLeft} days left`;
}
