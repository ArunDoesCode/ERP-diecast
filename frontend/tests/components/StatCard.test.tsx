/**
 * docs/specs/design-system/spec.md (v1): BR-DS-13 (first paint of StatCard), plus the StatCard
 * name / state table in "Shared components". Count-up animation itself needs a browser (no page
 * hosts a StatCard yet, see e2e note), so only the static first paint is checked here.
 */
import { describe, expect, test } from "bun:test";
import { IconClock } from "@tabler/icons-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StatCard, type StatCardProps } from "@/components/shared/StatCard";

const html = (p: Partial<StatCardProps> = {}) =>
	renderToStaticMarkup(
		createElement(StatCard, { label: "Pending", value: 23, ...p }),
	);
const text = (markup: string) =>
	markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("BR-DS-13 StatCard first paint shows the final value", () => {
	test("BR-DS-13 countUp card: first paint already contains the final value 23", () => {
		expect(text(html({ countUp: true }))).toContain("23");
	});

	test("BR-DS-13 countUp card: first paint does not start from 0", () => {
		expect(text(html({ countUp: true, value: 47 }))).not.toMatch(/\b0\b/);
	});

	test("BR-DS-13 accessible name is '<label>: <value>' (final value for screen readers)", () => {
		const out = html({ countUp: true, href: "/x" });
		expect(out).toMatch(/<a[^>]*>/);
		const name = out.match(/aria-label="([^"]*)"/)?.[1];
		// Either an explicit aria-label or the text content must read "Pending: 23".
		expect(name ?? text(out).replace(/\s*:\s*/, ": ")).toContain("Pending: 23");
	});

	test("BR-DS-13 string values are shown as given and not animated", () => {
		expect(text(html({ value: "4.2 L", countUp: true }))).toContain("4.2 L");
	});
});

describe("StatCard roles and states", () => {
	test("spec: card is a link (a) when href is set", () => {
		const out = html({ href: "/purchase-orders" });
		expect(out).toMatch(/<a[^>]*href="\/purchase-orders"/);
	});

	test("spec: card is a div (not a link) without href", () => {
		expect(html()).not.toMatch(/<a[\s>]/);
	});

	test("spec: 0 is a value, not empty", () => {
		expect(text(html({ value: 0 }))).toContain("0");
	});

	test("spec: loading shows aria-busy and not the value", () => {
		const out = html({ loading: true });
		expect(out).toContain('aria-busy="true"');
		expect(text(out)).not.toContain("23");
	});

	test("spec: error shows an en dash and a 'Try again' button", () => {
		const out = html({ error: true, onRetry: () => {} });
		expect(text(out)).toContain("–");
		expect(text(out)).not.toContain("23");
		expect(out).toMatch(/<button/);
		expect(text(out)).toContain("Try again");
	});

	test("spec: icon prop renders an aria-hidden icon", () => {
		expect(html({ icon: IconClock })).toContain('aria-hidden="true"');
	});

	test("spec: hint is shown", () => {
		expect(text(html({ hint: "since Monday" }))).toContain("since Monday");
	});

	test("BR-DS-01 StatCard carries no raw palette class", () => {
		expect(html({ tone: "warning" })).not.toMatch(
			/\b(bg|text|border)-(red|amber|emerald|rose|blue|green|yellow|orange|slate|gray|zinc|sky)-\d{2,3}\b/,
		);
	});
});
