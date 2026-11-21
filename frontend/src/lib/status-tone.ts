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
	| "purchaseReturn"
	| "debitNote"
	| "supplierInvoice"
	| "supplierInvoiceMatch"
	| "sco"
	| "bom"
	| "bomNode"
	| "so"
	| "soSnapshot"
	| "customer"
	| "soRowTag"
	| "reorderRun"
	| "reorderItem"
	| "reorderOutcome"
	| "prSource"
	| "challanDue"
	| "approval"
	| "supplier"
	| "item"
	| "machine"
	| "employee"
	| "policy";

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

const ACTIVE = table({
	active: ["Active", "success"],
	inactive: ["Inactive", "closed"],
});

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
		purchaseReturn: table({
			draft: ["Draft", "neutral"],
			posted: ["Posted", "success"],
			cancelled: ["Cancelled", "closed"],
		}),
		debitNote: table({
			issued: ["Issued", "success"],
			cancelled: ["Cancelled", "closed"],
		}),
		supplierInvoice: table({
			draft: ["Draft", "neutral"],
			blocked: ["Blocked", "warning"],
			approved: ["Payable", "success"],
			cancelled: ["Cancelled", "closed"],
			legacy: ["Legacy", "closed"],
			overdue: ["Overdue", "danger"],
		}),
		supplierInvoiceMatch: table({
			ok: ["OK", "success"],
			qty: ["Qty", "danger"],
			price: ["Price", "danger"],
			tax: ["Tax", "danger"],
			tax_rate: ["Tax rate", "danger"],
			total: ["Total", "danger"],
			charge: ["Charge not on PO", "danger"],
			below_po_rate: ["Below PO rate", "info"],
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
		bom: table({
			draft: ["Draft", "neutral"],
			active: ["Active", "success"],
			retired: ["Retired", "closed"],
		}),
		bomNode: table({
			no_bom: ["No BOM", "neutral"],
			inactive: ["Inactive", "closed"],
			loop: ["Loop", "danger"],
		}),
		so: table({
			draft: ["Draft", "neutral"],
			confirmed: ["Confirmed", "info"],
			on_hold: ["On hold", "warning"],
			closed: ["Closed", "closed"],
			cancelled: ["Cancelled", "closed"],
		}),
		soSnapshot: table({
			current: ["Current", "success"],
			out_of_date: ["Out of date", "warning"],
			superseded: ["Superseded", "closed"],
		}),
		customer: ACTIVE,
		soRowTag: table({
			no_bom: ["No BOM", "neutral"],
			buy_as_is: ["Buy as is", "neutral"],
			inactive: ["Inactive item", "closed"],
			loop: ["BOM loop", "danger"],
		}),
		reorderRun: table({
			running: ["Running", "info"],
			done: ["Done", "success"],
			failed: ["Failed", "danger"],
		}),
		reorderItem: table({
			will_be_ordered: ["Will be ordered", "warning"],
			covered: ["Covered", "info"],
			needs_reorder_qty: ["Needs a reorder qty", "warning"],
			ok: ["OK", "success"],
		}),
		reorderOutcome: table({
			raised: ["Raised", "success"],
			needs_reorder_qty: ["Needs a reorder qty", "neutral"],
			invalid_line: ["Invalid line", "neutral"],
			deferred: ["Deferred to next run", "neutral"],
		}),
		prSource: table({
			reorder: ["Reorder", "neutral"],
		}),
		challanDue: table({
			ok: ["On time", "success"],
			warning: ["Due soon", "warning"],
			overdue: ["Overdue", "danger"],
		}),
		supplier: ACTIVE,
		item: ACTIVE,
		machine: ACTIVE,
		employee: ACTIVE,
		policy: ACTIVE,
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
