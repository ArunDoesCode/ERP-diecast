import type { PRStatus } from "@/types/purchase-requisitions";

export type StatusBadgeStyle = {
	variant: "default" | "secondary" | "outline";
	className: string;
};

const PR_STATUS_BADGE_STYLE: Record<PRStatus, StatusBadgeStyle> = {
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
	partial_ordered: {
		variant: "secondary",
		className: "border-sky-200 bg-sky-100 text-sky-800",
	},
	fully_ordered: {
		variant: "default",
		className: "border-green-200 bg-green-100 text-green-800",
	},
	cancelled: {
		variant: "outline",
		className: "border-zinc-300 bg-zinc-300 text-foreground",
	},
};

const FALLBACK_STATUS_BADGE_STYLE: StatusBadgeStyle = {
	variant: "outline",
	className: "border-zinc-300 bg-zinc-100 text-zinc-700",
};

export function getPRStatusBadgeStyle(
	status?: PRStatus | null,
): StatusBadgeStyle {
	if (!status) return FALLBACK_STATUS_BADGE_STYLE;
	return PR_STATUS_BADGE_STYLE[status] ?? FALLBACK_STATUS_BADGE_STYLE;
}

export function humanizeStatusLabel(status?: string | null) {
	if (!status) return "Unknown";
	return status.split("_").join(" ");
}
