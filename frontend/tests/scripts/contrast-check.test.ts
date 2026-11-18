/**
 * docs/specs/design-system/spec.md (v1): BR-DS-02. Text pairs >= 4.5:1; field borders, focus
 * rings and chart colours >= 3:1; light and dark.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	type ContrastPair,
	checkContrast,
	contrastRatio,
	type Oklch,
	readTokenPairs,
} from "../../scripts/contrast-check";

const HERE = fileURLToPath(new URL(".", import.meta.url));

const WHITE: Oklch = { l: 1, c: 0, h: 0 };
const BLACK: Oklch = { l: 0, c: 0, h: 0 };
const GREY: Oklch = { l: 0.5, c: 0, h: 0 };

const CSS = readFileSync(resolve(HERE, "../../src/app/globals.css"), "utf8");

const near = (a: Oklch, b: Oklch, eps = 0.003) =>
	Math.abs(a.l - b.l) < eps &&
	Math.abs(a.c - b.c) < eps &&
	Math.abs(a.h - b.h) < 0.5;

const pair = (
	over: Partial<ContrastPair> & Pick<ContrastPair, "foreground" | "background">,
): ContrastPair => ({
	name: "p",
	theme: "light",
	kind: "text",
	...over,
});

describe("BR-DS-02 contrast maths", () => {
	test("BR-DS-02 black on white is 21:1", () => {
		expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 1);
	});

	test("BR-DS-02 the ratio is symmetric", () => {
		expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(
			contrastRatio(BLACK, WHITE),
			6,
		);
	});

	test("BR-DS-02 a colour against itself is 1:1", () => {
		expect(contrastRatio(GREY, GREY)).toBeCloseTo(1, 6);
	});

	test("BR-DS-02 mid-grey (OKLab L 0.5) against white is about 6.0", () => {
		expect(contrastRatio(GREY, WHITE)).toBeCloseTo(6.0, 1);
	});

	test("BR-DS-02 --warning on --warning-subtle (light) is about 5.4 as in the spec example", () => {
		const r = contrastRatio(
			{ l: 0.5, c: 0.11, h: 70 },
			{ l: 0.955, c: 0.05, h: 88 },
		);
		expect(r).toBeGreaterThan(5.2);
		expect(r).toBeLessThan(5.6);
	});
});

describe("BR-DS-02 checkContrast verdicts", () => {
	test("BR-DS-02 text pair at 6:1 passes with required 4.5", () => {
		const [r] = checkContrast([pair({ foreground: GREY, background: WHITE })]);
		expect(r?.required).toBe(4.5);
		expect(r?.pass).toBe(true);
		expect(r?.ratio).toBeCloseTo(6.0, 1);
	});

	test("BR-DS-02 text pair at about 4.2:1 fails (a token edit that drops it is rejected)", () => {
		// L 0.58 grey on white is about 4.3; L 0.6 about 3.9. Pick one clearly under 4.5.
		const r = checkContrast([
			pair({ foreground: { l: 0.6, c: 0, h: 0 }, background: WHITE }),
		])[0];
		expect(r?.ratio).toBeLessThan(4.5);
		expect(r?.pass).toBe(false);
	});

	test("BR-DS-02 ui pair requires only 3:1", () => {
		const r = checkContrast([
			pair({
				kind: "ui",
				foreground: { l: 0.6, c: 0, h: 0 },
				background: WHITE,
			}),
		])[0];
		expect(r?.required).toBe(3);
		expect(r?.ratio).toBeGreaterThan(3);
		expect(r?.pass).toBe(true);
	});

	test("BR-DS-02 ui pair under 3:1 fails", () => {
		const r = checkContrast([
			pair({
				kind: "ui",
				foreground: { l: 0.85, c: 0, h: 0 },
				background: WHITE,
			}),
		])[0];
		expect(r?.pass).toBe(false);
	});

	test("BR-DS-02 one result per pair, in order, each carrying its pair", () => {
		const a = pair({ name: "a", foreground: BLACK, background: WHITE });
		const b = pair({ name: "b", foreground: GREY, background: GREY });
		const out = checkContrast([a, b]);
		expect(out.map((x) => x.pair.name)).toEqual(["a", "b"]);
		expect(out.map((x) => x.pass)).toEqual([true, false]);
	});
});

describe("BR-DS-02 the real globals.css", () => {
	const getPairs = () => readTokenPairs(CSS);

	test("BR-DS-02 covers light and dark, text and ui", () => {
		const pairs = getPairs();
		expect(new Set(pairs.map((p) => p.theme))).toEqual(
			new Set(["light", "dark"]),
		);
		expect(new Set(pairs.map((p) => p.kind))).toEqual(new Set(["text", "ui"]));
	});

	test("BR-DS-02 every text pair and every ui pair passes", () => {
		const pairs = getPairs();
		const failing = checkContrast(pairs).filter((r) => !r.pass);
		expect(
			failing.map(
				(r) => `${r.pair.theme} ${r.pair.name} ${r.ratio.toFixed(2)}`,
			),
		).toEqual([]);
	});

	test("BR-DS-02 each of the five status tones is checked as text on its subtle tint, light and dark", () => {
		const pairs = getPairs();
		const tones: Array<[string, Oklch, Oklch, Oklch, Oklch]> = [
			// name, light fg, light bg, dark fg, dark bg
			[
				"success",
				{ l: 0.5, c: 0.125, h: 150 },
				{ l: 0.95, c: 0.04, h: 152 },
				{ l: 0.8, c: 0.14, h: 152 },
				{ l: 0.29, c: 0.055, h: 152 },
			],
			[
				"warning",
				{ l: 0.5, c: 0.11, h: 70 },
				{ l: 0.955, c: 0.05, h: 88 },
				{ l: 0.83, c: 0.13, h: 82 },
				{ l: 0.31, c: 0.055, h: 75 },
			],
			[
				"info",
				{ l: 0.5, c: 0.11, h: 228 },
				{ l: 0.95, c: 0.03, h: 228 },
				{ l: 0.79, c: 0.1, h: 228 },
				{ l: 0.29, c: 0.05, h: 232 },
			],
			[
				"neutral",
				{ l: 0.45, c: 0.02, h: 250 },
				{ l: 0.94, c: 0.008, h: 250 },
				{ l: 0.78, c: 0.012, h: 250 },
				{ l: 0.29, c: 0.012, h: 250 },
			],
			[
				"danger",
				{ l: 0.53, c: 0.2, h: 27 },
				{ l: 0.955, c: 0.025, h: 25 },
				{ l: 0.76, c: 0.14, h: 22 },
				{ l: 0.29, c: 0.06, h: 22 },
			],
		];
		for (const [name, lf, lb, df, db] of tones) {
			const light = pairs.some(
				(p) =>
					p.theme === "light" &&
					p.kind === "text" &&
					near(p.foreground, lf) &&
					near(p.background, lb),
			);
			const dark = pairs.some(
				(p) =>
					p.theme === "dark" &&
					p.kind === "text" &&
					near(p.foreground, df) &&
					near(p.background, db),
			);
			expect({ name, light, dark }).toEqual({ name, light: true, dark: true });
		}
	});

	test("BR-DS-02 field border (--input), focus ring (--ring) and the five chart colours are checked as ui pairs in both themes", () => {
		const pairs = getPairs();
		const ui = pairs.filter((p) => p.kind === "ui");
		const wants: Array<[string, Oklch, Oklch]> = [
			["input", { l: 0.64, c: 0.015, h: 250 }, { l: 0.56, c: 0.02, h: 250 }],
			["ring", { l: 0.55, c: 0.12, h: 262 }, { l: 0.72, c: 0.1, h: 262 }],
			["chart-1", { l: 0.6, c: 0.12, h: 165 }, { l: 0.86, c: 0.14, h: 165 }],
			["chart-2", { l: 0.4, c: 0.12, h: 252 }, { l: 0.58, c: 0.12, h: 252 }],
			["chart-3", { l: 0.5, c: 0.105, h: 70 }, { l: 0.74, c: 0.13, h: 78 }],
			["chart-4", { l: 0.6, c: 0.13, h: 305 }, { l: 0.78, c: 0.13, h: 305 }],
			["chart-5", { l: 0.4, c: 0.15, h: 10 }, { l: 0.58, c: 0.14, h: 20 }],
		];
		for (const [name, light, dark] of wants) {
			expect({
				name,
				light: ui.some((p) => p.theme === "light" && near(p.foreground, light)),
				dark: ui.some((p) => p.theme === "dark" && near(p.foreground, dark)),
			}).toEqual({ name, light: true, dark: true });
		}
	});

	test("BR-DS-02 lowest text ratio is at least 4.5 in light and in dark", () => {
		const pairs = getPairs();
		const results = checkContrast(pairs).filter((r) => r.pair.kind === "text");
		for (const theme of ["light", "dark"] as const) {
			const min = Math.min(
				...results.filter((r) => r.pair.theme === theme).map((r) => r.ratio),
			);
			expect(min).toBeGreaterThanOrEqual(4.5);
		}
	});

	test("BR-DS-02 lowest ui ratio is at least 3.0 in light and in dark", () => {
		const pairs = getPairs();
		const results = checkContrast(pairs).filter((r) => r.pair.kind === "ui");
		for (const theme of ["light", "dark"] as const) {
			const min = Math.min(
				...results.filter((r) => r.pair.theme === theme).map((r) => r.ratio),
			);
			expect(min).toBeGreaterThanOrEqual(3);
		}
	});

	test("BR-DS-02 a token edit that drops light --warning-subtle contrast is rejected", () => {
		// Make the tint much darker so --warning (L 0.5) on it falls under 4.5.
		const edited = CSS.replace(
			/--warning-subtle:\s*oklch\(0\.955 0\.05 88\)/,
			"--warning-subtle: oklch(0.62 0.05 88)",
		);
		expect(edited).not.toBe(CSS);
		const failing = checkContrast(readTokenPairs(edited)).filter(
			(r) => !r.pass,
		);
		expect(failing.length).toBeGreaterThanOrEqual(1);
		expect(failing.some((r) => r.pair.theme === "light")).toBe(true);
	});

	test("BR-DS-02 a token edit that weakens the light field border below 3:1 is rejected", () => {
		const edited = CSS.replace(
			/--input:\s*oklch\(0\.64 0\.015 250\)/,
			"--input: oklch(0.9 0.015 250)",
		);
		expect(edited).not.toBe(CSS);
		const failing = checkContrast(readTokenPairs(edited)).filter(
			(r) => !r.pass,
		);
		expect(failing.some((r) => r.pair.kind === "ui")).toBe(true);
	});

	test("BR-DS-02 css without the tokens throws instead of passing silently", () => {
		expect(() => readTokenPairs("")).toThrow();
		expect(() => readTokenPairs(":root { --x: 1px; }")).toThrow();
	});
});
