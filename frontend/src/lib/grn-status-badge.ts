import type { StatusBadgeStyle } from "@/lib/pr-status-badge";
import type { GrnQaStatus, GrnStatus } from "@/types/grn";

const GRN_STATUS_BADGE_STYLE: Record<GrnStatus, StatusBadgeStyle> = {
	draft: {
		variant: "secondary",
		className: "border-amber-200 bg-amber-100 text-amber-800",
	},
	pending_qa: {
		variant: "outline",
		className: "border-slate-300 bg-slate-100 text-foreground",
	},
	accepted: {
		variant: "default",
		className: "border-emerald-200 bg-emerald-100 text-emerald-800",
	},
	rejected: {
		variant: "outline",
		className: "border-rose-300 bg-rose-100 text-rose-800",
	},
	partial_accepted: {
		variant: "secondary",
		className: "border-indigo-200 bg-indigo-100 text-indigo-800",
	},
};

const GRN_QA_STATUS_BADGE_STYLE: Record<GrnQaStatus, StatusBadgeStyle> = {
	pending: {
		variant: "outline",
		className: "border-slate-300 bg-slate-100 text-foreground",
	},
	passed: {
		variant: "default",
		className: "border-emerald-200 bg-emerald-100 text-emerald-800",
	},
	failed: {
		variant: "outline",
		className: "border-rose-300 bg-rose-100 text-rose-800",
	},
	waived: {
		variant: "secondary",
		className: "border-sky-200 bg-sky-100 text-sky-800",
	},
};

const FALLBACK_STATUS_BADGE_STYLE: StatusBadgeStyle = {
	variant: "outline",
	className: "border-zinc-300 bg-zinc-100 text-zinc-700",
};

export function getGrnStatusBadgeStyle(
	status?: GrnStatus | null,
): StatusBadgeStyle {
	if (!status) return FALLBACK_STATUS_BADGE_STYLE;
	return GRN_STATUS_BADGE_STYLE[status] ?? FALLBACK_STATUS_BADGE_STYLE;
}

export function getGrnQaStatusBadgeStyle(
	status?: GrnQaStatus | null,
): StatusBadgeStyle {
	if (!status) return FALLBACK_STATUS_BADGE_STYLE;
	return GRN_QA_STATUS_BADGE_STYLE[status] ?? FALLBACK_STATUS_BADGE_STYLE;
}
