/**
 * One map: document status -> label, tone, icon. Spec: docs/specs/design-system (BR-DS-03, BR-DS-04, BR-DS-05).
 */
import {
	type Icon,
	IconAlertTriangle,
	IconArchive,
	IconArrowRight,
	IconCheck,
	IconCircleDashed,
	IconClock,
} from "@tabler/icons-react";

export type Tone =
	| "neutral"
	| "warning"
	| "info"
	| "success"
	| "danger"
	| "closed";

export type StatusDoc =
	| "pr"
	| "prLine"
	| "po"
	| "grn"
	| "grnQa"
	| "sco"
	| "challanDue"
	| "approval";

export type StatusTone = {
	label: string;
	tone: Tone;
	/** Tabler icon component for the tone (shown before the label, aria-hidden). */
	icon: Icon;
};

export type ToneIconMap = Record<Tone, Icon>;

export const TONE_ICONS: ToneIconMap = {
	neutral: IconCircleDashed,
	warning: IconClock,
	info: IconArrowRight,
	success: IconCheck,
	danger: IconAlertTriangle,
	closed: IconArchive,
};

type Entry = readonly [label: string, tone: Tone];

// Null-prototype maps: keys like "constructor" or "__proto__" must read as unknown.
function table(entries: Record<string, Entry>): Record<string, Entry> {
	return Object.assign(Object.create(null), entries);
}

const MAP: Record<StatusDoc, Record<string, Entry>> = Object.assign(
	Object.create(null),
	{
		pr: table({
			draft: ["Draft", "neutral"],
			pending_approval: ["Pending approval", "warning"],
			approved: ["Approved", "success"],
			rejected: ["Rejected", "danger"],
			partial_ordered: ["Partly ordered", "info"],
			fully_ordered: ["Fully ordered", "success"],
			cancelled: ["Cancelled", "closed"],
		}),
		prLine: table({
			pending: ["Pending", "warning"],
			po_draft: ["PO draft", "info"],
			ordered: ["Ordered", "success"],
			cancelled: ["Cancelled", "closed"],
		}),
		po: table({
			draft: ["Draft", "neutral"],
			pending_approval: ["Pending approval", "warning"],
			approved: ["Approved", "success"],
			dispatched: ["Dispatched", "info"],
			partial_received: ["Partly received", "info"],
			fully_received: ["Fully received", "success"],
			invoiced: ["Invoiced", "success"],
			closed: ["Closed", "closed"],
			cancelled: ["Cancelled", "closed"],
		}),
		grn: table({
			draft: ["Draft", "neutral"],
			pending_qa: ["Pending QA", "warning"],
			accepted: ["Accepted", "success"],
			partial_accepted: ["Partly accepted", "warning"],
			rejected: ["Rejected", "danger"],
		}),
		grnQa: table({
			pending: ["Pending", "warning"],
			passed: ["Passed", "success"],
			failed: ["Failed", "danger"],
			waived: ["Waived", "neutral"],
		}),
		sco: table({
			draft: ["Draft", "neutral"],
			pending_approval: ["Pending approval", "warning"],
			require_more_info: ["Sent back", "warning"],
			approved: ["Approved", "success"],
			rejected: ["Rejected", "danger"],
			material_issued: ["Material issued", "info"],
			material_received: ["Material received", "success"],
			closed: ["Closed", "closed"],
			cancelled: ["Cancelled", "closed"],
		}),
		challanDue: table({
			ok: ["On time", "success"],
			warning: ["Due soon", "warning"],
			overdue: ["Overdue", "danger"],
		}),
		approval: table({
			pending_approval: ["Pending approval", "warning"],
			approved: ["Approved", "success"],
			auto_approved: ["Auto-approved", "success"],
			rejected: ["Rejected", "danger"],
			require_more_info: ["Sent back", "warning"],
			partial_ordered: ["Partly ordered", "info"],
			fully_ordered: ["Fully ordered", "success"],
			cancelled: ["Cancelled", "closed"],
		}),
	},
);

const UNKNOWN: StatusTone = {
	label: "Unknown",
	tone: "neutral",
	icon: TONE_ICONS.neutral,
};

/** Label, tone and icon for a status. Unknown or null status -> neutral "Unknown"; never throws. */
export function getStatusTone(
	doc: StatusDoc,
	status: string | null | undefined,
): StatusTone {
	if (typeof status !== "string") return UNKNOWN;
	const entry = MAP[doc]?.[status];
	if (!entry) return UNKNOWN;
	return { label: entry[0], tone: entry[1], icon: TONE_ICONS[entry[1]] };
}
