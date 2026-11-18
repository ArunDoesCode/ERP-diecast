/**
 * docs/specs/design-system/spec.md (v1): BR-DS-03, BR-DS-04, BR-DS-05, BR-DS-01 (StatusBadge file).
 * Server-rendered to static HTML: no DOM library needed.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { IconAlertTriangle, IconClock } from "@tabler/icons-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { getStatusTone, type StatusDoc } from "@/lib/status-tone";
import { checkPalette } from "../../scripts/standards-rules";

const HERE = fileURLToPath(new URL(".", import.meta.url));

const html = (doc: StatusDoc, status: string | null, className?: string) =>
	renderToStaticMarkup(createElement(StatusBadge, { doc, status, className }));

/** The Tabler icon class name (e.g. icon-tabler-clock) for a given icon component. */
const iconClass = (Icon: typeof IconClock): string => {
	const m = renderToStaticMarkup(createElement(Icon)).match(
		/icon-tabler-[a-z0-9-]+/,
	);
	if (!m) throw new Error("tabler icon class not found");
	return m[0];
};

const svgOf = (markup: string): string => markup.match(/<svg[^>]*>/)?.[0] ?? "";

describe("BR-DS-03 / BR-DS-05 StatusBadge shows label and icon from the map", () => {
	test("BR-DS-05 PO dispatched renders its text label", () => {
		expect(html("po", "dispatched")).toContain("Dispatched");
	});

	test("BR-DS-03 the label equals the map label for every doc/status sampled", () => {
		for (const [doc, status] of [
			["pr", "partial_ordered"],
			["grnQa", "waived"],
			["sco", "require_more_info"],
			["challanDue", "overdue"],
			["approval", "auto_approved"],
		] as Array<[StatusDoc, string]>) {
			expect(html(doc, status)).toContain(getStatusTone(doc, status).label);
		}
	});

	test("BR-DS-05 a badge carries its tone icon: clock for pending approval", () => {
		expect(html("po", "pending_approval")).toContain(iconClass(IconClock));
	});

	test("BR-DS-05 icon is aria-hidden", () => {
		expect(svgOf(html("po", "pending_approval"))).toContain(
			'aria-hidden="true"',
		);
	});

	test("BR-DS-05 icon is 12 px with stroke 2", () => {
		const svg = svgOf(html("po", "dispatched"));
		expect(svg).toContain('width="12"');
		expect(svg).toContain('height="12"');
		expect(svg).toContain('stroke-width="2"');
	});

	test("BR-DS-05 'Pending approval' and 'Dispatched' differ in markup beyond the text (different icon)", () => {
		const a = svgOf(html("po", "pending_approval"));
		const b = svgOf(html("po", "dispatched"));
		expect(a).not.toBe("");
		expect(a).not.toBe(b);
	});

	test("BR-DS-03 the same status renders identically wherever it is used", () => {
		expect(html("po", "dispatched")).toBe(html("po", "dispatched"));
	});

	test("BR-DS-05 closed tone is an outline (border) and not a filled tint", () => {
		const closed = html("po", "closed");
		const success = html("po", "approved");
		expect(closed).toMatch(/\bborder\b/);
		expect(closed).toContain("muted-foreground");
		expect(success).not.toContain("muted-foreground");
	});

	test("BR-DS-05 the label is the badge's accessible text (no aria-label needed)", () => {
		expect(
			html("po", "dispatched")
				.replace(/<[^>]+>/g, "")
				.trim(),
		).toBe("Dispatched");
	});

	test("BR-DS-03 className is applied", () => {
		expect(html("po", "draft", "my-extra-class")).toContain("my-extra-class");
	});

	test("BR-DS-05 danger tone uses the alert-triangle icon", () => {
		expect(html("grn", "rejected")).toContain(iconClass(IconAlertTriangle));
	});
});

describe("BR-DS-04 unknown or missing status", () => {
	test("BR-DS-04 unknown status renders neutral 'Unknown' with an icon, no throw", () => {
		const out = html("po", "on_hold");
		expect(out).toContain("Unknown");
		expect(svgOf(out)).not.toBe("");
	});

	test("BR-DS-04 null status renders 'Unknown'", () => {
		expect(html("po", null)).toContain("Unknown");
	});

	test("BR-DS-04 unknown renders the same as null (both neutral)", () => {
		expect(html("po", "on_hold")).toBe(html("po", null));
	});

	test("BR-DS-04 prototype-key status does not throw", () => {
		expect(() => html("po", "constructor")).not.toThrow();
		expect(html("po", "constructor")).toContain("Unknown");
	});
});

describe("BR-DS-01 StatusBadge file has no raw palette class", () => {
	test("BR-DS-01 StatusBadge.tsx has no raw palette class or hex colour", () => {
		const path = "src/components/shared/StatusBadge.tsx";
		const source = readFileSync(resolve(HERE, "../..", path), "utf8");
		expect(checkPalette(path, source)).toEqual([]);
	});
});
