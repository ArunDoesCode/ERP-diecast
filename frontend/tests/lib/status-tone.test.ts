/**
 * docs/specs/design-system/spec.md (v1): BR-DS-03, BR-DS-04, BR-DS-05 (map level).
 * Table below is copied from the spec's "Status -> tone" section.
 */
import { describe, expect, test } from "bun:test";
import {
	IconAlertTriangle,
	IconArchive,
	IconArrowRight,
	IconCheck,
	IconCircleDashed,
	IconClock,
} from "@tabler/icons-react";
import {
	getStatusTone,
	type StatusDoc,
	TONE_ICONS,
	type Tone,
} from "@/lib/status-tone";

type Row = [StatusDoc, string, string, Tone];

const TABLE: Row[] = [
	["pr", "draft", "Draft", "neutral"],
	["pr", "pending_approval", "Pending approval", "warning"],
	["pr", "approved", "Approved", "success"],
	["pr", "rejected", "Rejected", "danger"],
	["pr", "partial_ordered", "Partly ordered", "info"],
	["pr", "fully_ordered", "Fully ordered", "success"],
	["pr", "cancelled", "Cancelled", "closed"],
	["po", "draft", "Draft", "neutral"],
	["po", "pending_approval", "Pending approval", "warning"],
	["po", "approved", "Approved", "success"],
	["po", "dispatched", "Dispatched", "info"],
	["po", "partial_received", "Partly received", "info"],
	["po", "fully_received", "Fully received", "success"],
	["po", "invoiced", "Invoiced", "success"],
	["po", "closed", "Closed", "closed"],
	["po", "cancelled", "Cancelled", "closed"],
	["grn", "draft", "Draft", "neutral"],
	["grn", "pending_qa", "Pending QA", "warning"],
	["grn", "accepted", "Accepted", "success"],
	["grn", "partial_accepted", "Partly accepted", "warning"],
	["grn", "rejected", "Rejected", "danger"],
	["grnQa", "pending", "Pending", "warning"],
	["grnQa", "passed", "Passed", "success"],
	["grnQa", "failed", "Failed", "danger"],
	["grnQa", "waived", "Waived", "neutral"],
	["sco", "draft", "Draft", "neutral"],
	["sco", "pending_approval", "Pending approval", "warning"],
	["sco", "require_more_info", "Sent back", "warning"],
	["sco", "approved", "Approved", "success"],
	["sco", "rejected", "Rejected", "danger"],
	["sco", "material_issued", "Material issued", "info"],
	["sco", "material_received", "Material received", "success"],
	["sco", "closed", "Closed", "closed"],
	["sco", "cancelled", "Cancelled", "closed"],
	["challanDue", "ok", "On time", "success"],
	["challanDue", "warning", "Due soon", "warning"],
	["challanDue", "overdue", "Overdue", "danger"],
	["approval", "pending_approval", "Pending approval", "warning"],
	["approval", "approved", "Approved", "success"],
	["approval", "auto_approved", "Auto-approved", "success"],
	["approval", "rejected", "Rejected", "danger"],
	["approval", "require_more_info", "Sent back", "warning"],
	["approval", "partial_ordered", "Partly ordered", "info"],
	["approval", "fully_ordered", "Fully ordered", "success"],
	["approval", "cancelled", "Cancelled", "closed"],
];

const TONE_ICON_EXPECTED = {
	neutral: IconCircleDashed,
	warning: IconClock,
	info: IconArrowRight,
	success: IconCheck,
	danger: IconAlertTriangle,
	closed: IconArchive,
} as const;

describe("BR-DS-03 one label, tone and icon per status", () => {
	for (const [doc, status, label, tone] of TABLE) {
		test(`BR-DS-03 ${doc}/${status} -> "${label}" (${tone}) with the tone's icon`, () => {
			const r = getStatusTone(doc, status);
			expect(r.label).toBe(label);
			expect(r.tone).toBe(tone);
			expect(r.icon).toBe(TONE_ICON_EXPECTED[tone]);
		});
	}

	test("BR-DS-03 each tone has exactly the spec's Tabler icon", () => {
		for (const tone of Object.keys(TONE_ICON_EXPECTED) as Tone[]) {
			expect(TONE_ICONS[tone]).toBe(TONE_ICON_EXPECTED[tone]);
		}
	});

	test("BR-DS-03 the six tones use six different icons", () => {
		const icons = new Set(Object.values(TONE_ICONS));
		expect(icons.size).toBe(6);
	});

	test("BR-DS-03 same status gives the same result on repeated calls", () => {
		expect(getStatusTone("po", "dispatched")).toEqual(
			getStatusTone("po", "dispatched"),
		);
	});

	test("BR-DS-03 the same status word can differ by document (PR approved vs GRN partial_accepted)", () => {
		expect(getStatusTone("grn", "partial_accepted").tone).toBe("warning");
		expect(getStatusTone("pr", "partial_ordered").tone).toBe("info");
	});
});

describe("BR-DS-03 master-data docs: active is success, inactive is closed (2026-11-19)", () => {
	const DOCS: StatusDoc[] = [
		"supplier",
		"item",
		"machine",
		"employee",
		"policy",
	];
	for (const doc of DOCS) {
		test(`BR-DS-03 ${doc}/active -> success`, () => {
			expect(getStatusTone(doc, "active").tone).toBe("success");
		});
		test(`BR-DS-03 ${doc}/inactive -> closed`, () => {
			expect(getStatusTone(doc, "inactive").tone).toBe("closed");
		});
	}
});

describe("BR-DS-04 unknown or missing status never throws", () => {
	const UNKNOWN: Array<[string, string | null | undefined]> = [
		["not in the map", "on_hold"],
		["null", null],
		["undefined", undefined],
		["empty string", ""],
		["wrong case", "DRAFT"],
		["Object.prototype key", "constructor"],
		["proto key", "__proto__"],
		["toString key", "toString"],
	];

	for (const [name, status] of UNKNOWN) {
		test(`BR-DS-04 ${name} -> neutral "Unknown"`, () => {
			const r = getStatusTone("po", status);
			expect(r.label).toBe("Unknown");
			expect(r.tone).toBe("neutral");
			expect(r.icon).toBe(IconCircleDashed);
		});
	}

	test("BR-DS-04 a status of another document is Unknown (PO 'pending' is not in the PO map)", () => {
		expect(getStatusTone("po", "pending").label).toBe("Unknown");
	});

	test("BR-DS-04 an unknown document key does not throw", () => {
		expect(() =>
			getStatusTone("nope" as unknown as StatusDoc, "draft"),
		).not.toThrow();
		expect(getStatusTone("nope" as unknown as StatusDoc, "draft").label).toBe(
			"Unknown",
		);
	});
});

describe("BR-DS-05 colour is never the only signal (map level)", () => {
	test("BR-DS-05 every mapped status has a non-empty text label and an icon", () => {
		for (const [doc, status] of TABLE) {
			const r = getStatusTone(doc, status);
			expect(r.label.trim().length).toBeGreaterThan(0);
			expect(r.icon).toBeDefined();
		}
	});

	test("BR-DS-05 'Pending approval' (clock) and 'Dispatched' (arrow) differ by icon", () => {
		expect(getStatusTone("po", "pending_approval").icon).not.toBe(
			getStatusTone("po", "dispatched").icon,
		);
	});
});
