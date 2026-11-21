import { formatDate, formatMoney } from "@/lib/format";

const ACTION_LABELS: Record<string, string> = {
	"so.create": "Created",
	"so.edit": "Edited",
	"so.confirm": "Confirmed",
	"so.hold": "Put on hold",
	"so.resume": "Resumed",
	"so.close": "Closed",
	"so.close_fully_delivered": "Closed, fully delivered",
	"so.reopen": "Reopened",
	"so.cancel": "Cancelled",
	"so.explode": "Exploded",
	"so.drafts_created": "Drafts created",
	"so.delivery_applied": "Delivery applied",
};

const FIELD_LABELS: Record<string, string> = {
	status: "Status",
	reason: "Reason",
	notes: "Notes",
	customerPoNo: "Customer PO",
	customerPoDate: "Customer PO date",
	orderDate: "Order date",
	deliveryDate: "Delivery date",
	totalAmountPaise: "Value",
	lines: "Lines",
	deliveredQty: "Delivered",
	runNo: "Run",
};

/** Keys that mean nothing to the owner. */
const HIDDEN = new Set([
	"id",
	"editVersion",
	"version",
	"updatedAt",
	"createdAt",
	"updatedBy",
	"createdBy",
]);

/** Counters written by an explosion run: noise next to the "Exploded" label. */
const EXPLODE_HIDDEN = new Set(["number", "rowCount", "flaggedCount"]);

export function humanize(text: string) {
	const spaced = text
		.replace(/[._]/g, " ")
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.toLowerCase()
		.trim();
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function actionLabel(action: string) {
	return ACTION_LABELS[action] ?? humanize(action.replace(/^so\./, ""));
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function showValue(key: string, value: unknown): string {
	if (value === null || value === undefined || value === "") return "none";
	if (Array.isArray(value)) {
		return `${value.length} ${value.length === 1 ? "line" : "lines"}`;
	}
	if (typeof value === "object") return "updated";
	if (typeof value === "number" && /Paise$/.test(key)) {
		return formatMoney(value);
	}
	if (typeof value === "string") {
		if (/^\d{4}-\d{2}-\d{2}/.test(value)) return formatDate(value);
		if (/^[a-z]+(_[a-z]+)*$/.test(value)) return humanize(value);
		return value;
	}
	return String(value);
}

export type ActivityChange = { label: string; from: string; to: string };

/** Changed fields only, in plain words (BR-SO-52). Never raw JSON. */
export function activityChanges(
	before: unknown,
	after: unknown,
	action?: string,
): ActivityChange[] {
	const b = asRecord(before) ?? {};
	const a = asRecord(after) ?? {};
	const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
	const out: ActivityChange[] = [];
	for (const key of keys) {
		if (HIDDEN.has(key) || /Id$/.test(key)) continue;
		if (action === "so.explode" && EXPLODE_HIDDEN.has(key)) continue;
		const from = b[key];
		const to = a[key];
		if (JSON.stringify(from) === JSON.stringify(to)) continue;
		if (key === "lines" && Array.isArray(from) && Array.isArray(to)) {
			if (from.length === to.length) {
				out.push({ label: "Lines", from: "edited", to: "edited" });
				continue;
			}
		}
		out.push({
			label: FIELD_LABELS[key] ?? humanize(key),
			from: showValue(key, from),
			to: showValue(key, to),
		});
	}
	return out;
}
