/**
 * docs/specs/design-system/spec.md (v1): BR-DS-03, BR-DS-04, BR-DS-24
 * with assumptions.md A-55 (requisition line status on the PO detail screen).
 */
import { describe, expect, test } from "bun:test";
import { IconCircleDashed } from "@tabler/icons-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
	getStatusTone,
	type StatusDoc,
	TONE_ICONS,
	type Tone,
} from "@/lib/status-tone";

const SIX_TONES: Tone[] = [
	"neutral",
	"warning",
	"info",
	"success",
	"danger",
	"closed",
];

const PR_LINE: Array<[string, Tone]> = [
	["pending", "warning"],
	["po_draft", "info"],
	["ordered", "success"],
	["cancelled", "closed"],
];

const DOC = "prLine" as StatusDoc;

describe("BR-DS-03 / A-55 requisition line status goes through the status map", () => {
	for (const [status, tone] of PR_LINE) {
		test(`BR-DS-03 prLine/${status} -> ${tone} with the tone's icon and a real label`, () => {
			const r = getStatusTone(DOC, status);
			expect(r.tone).toBe(tone);
			expect(r.icon).toBe(TONE_ICONS[tone]);
			expect(r.label.trim().length).toBeGreaterThan(0);
			expect(r.label).not.toBe("Unknown");
		});

		test(`BR-DS-03 StatusBadge renders prLine/${status} with the map label and an icon`, () => {
			const label = getStatusTone(DOC, status).label;
			const out = renderToStaticMarkup(
				createElement(StatusBadge, { doc: DOC, status }),
			);
			expect(out).toContain(label);
			expect(out).toContain("<svg");
		});
	}

	test("BR-DS-03 the four line statuses have four different labels", () => {
		const labels = new Set(PR_LINE.map(([s]) => getStatusTone(DOC, s).label));
		expect(labels.size).toBe(4);
	});
});

describe("BR-DS-04 unknown requisition line status", () => {
	for (const status of ["on_hold", "", "constructor", "__proto__", "PENDING"]) {
		test(`BR-DS-04 prLine/"${status}" -> neutral Unknown, no throw`, () => {
			const r = getStatusTone(DOC, status);
			expect(r.label).toBe("Unknown");
			expect(r.tone).toBe("neutral");
			expect(r.icon).toBe(IconCircleDashed);
		});
	}

	test("BR-DS-04 prLine with null/undefined status -> Unknown", () => {
		expect(getStatusTone(DOC, null).label).toBe("Unknown");
		expect(getStatusTone(DOC, undefined).label).toBe("Unknown");
	});

	test("BR-DS-04 a PR-header-only status is Unknown on a line (statuses are per document)", () => {
		expect(getStatusTone(DOC, "pending_approval").label).toBe("Unknown");
	});
});

describe("BR-DS-24 no new tone: requisition lines use only the six existing tones", () => {
	test("BR-DS-24 every prLine status maps to one of the six tones", () => {
		for (const [status] of PR_LINE) {
			expect(SIX_TONES).toContain(getStatusTone(DOC, status).tone);
		}
	});

	test("BR-DS-24 the tone icon set is exactly the six tones", () => {
		expect(Object.keys(TONE_ICONS).sort()).toEqual([...SIX_TONES].sort());
	});
});
