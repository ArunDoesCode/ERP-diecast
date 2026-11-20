/**
 * docs/specs/design-system/spec.md (v2): BR-DS-01 (palette and hex), BR-DS-09 (motion), BR-DS-28 (sizes).
 * Pure rule functions: paths are relative to frontend/ with "/" separators.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as rulesModule from "../../scripts/standards-rules";
import { checkMotion, checkPalette } from "../../scripts/standards-rules";

const HERE = fileURLToPath(new URL(".", import.meta.url));

const VIEW = "src/app/(protected)/purchase-orders/page.tsx";
const SHARED = "src/components/shared/StatCard.tsx";
const UI = "src/components/ui/dialog.tsx";
const CSS = "src/app/globals.css";
const ALLOWED = [SHARED] as const;

const jsx = (cls: string) =>
	`export const X = () => <div className="${cls}" />;\n`;
const rules = (f: { rule: string }[]) => f.map((x) => x.rule);

describe("BR-DS-01 colour only from tokens", () => {
	for (const cls of [
		"bg-amber-100",
		"text-rose-800",
		"text-emerald-700",
		"border-blue-500",
		"bg-slate-50",
		"hover:bg-red-600",
		"dark:text-zinc-300",
	]) {
		test(`BR-DS-01 flags raw palette class ${cls} in a view`, () => {
			const f = checkPalette(VIEW, jsx(cls));
			expect(f.length).toBeGreaterThanOrEqual(1);
			expect(rules(f)).toContain("raw-palette");
		});
	}

	for (const cls of [
		"bg-success-subtle text-success",
		"bg-card text-foreground",
		"border-border text-muted-foreground",
		"bg-primary text-primary-foreground",
		"text-brand-accent",
		"bg-white",
		"text-black",
	]) {
		test(`BR-DS-01 does not flag token classes: ${cls}`, () => {
			expect(checkPalette(VIEW, jsx(cls))).toEqual([]);
		});
	}

	test("BR-DS-01 reports the line of the offending class", () => {
		const src = `const a = 1;\nconst b = 2;\n${jsx("text-rose-800")}`;
		const f = checkPalette(VIEW, src);
		expect(f[0]?.line).toBe(3);
		expect(f[0]?.file).toBe(VIEW);
	});

	test("BR-DS-01 ignores palette words inside comments", () => {
		const src = `// was bg-amber-100\n/* text-rose-800 */\nexport const X = 1;\n`;
		expect(checkPalette(VIEW, src)).toEqual([]);
	});

	test("BR-DS-01 src/components/ui/** is exempt from the palette rule", () => {
		expect(checkPalette(UI, jsx("bg-amber-100"))).toEqual([]);
	});

	test("BR-DS-01 shared components are not exempt", () => {
		expect(checkPalette(SHARED, jsx("bg-amber-100")).length).toBe(1);
	});

	test("BR-DS-01 flags a hex colour outside ui and globals.css", () => {
		const src = `export const s = { color: "#1a2b3c" };\n`;
		const f = checkPalette(VIEW, src);
		expect(f.length).toBeGreaterThanOrEqual(1);
		expect(rules(f)).toContain("raw-palette");
	});

	test("BR-DS-01 flags a 3-digit hex colour in a class value", () => {
		expect(checkPalette(VIEW, jsx("bg-[#fff]")).length).toBeGreaterThanOrEqual(
			1,
		);
	});

	test("BR-DS-01 hex is allowed in src/components/ui/**", () => {
		expect(
			checkPalette(UI, `export const s = { color: "#1a2b3c" };\n`),
		).toEqual([]);
	});

	test("BR-DS-01 hex is allowed in globals.css", () => {
		expect(checkPalette(CSS, `:root { --x: #1a2b3c; }\n`)).toEqual([]);
	});

	test("BR-DS-01 hex inside a comment is not flagged", () => {
		expect(
			checkPalette(VIEW, `// brand #1a2b3c\nexport const X = 1;\n`),
		).toEqual([]);
	});
});

describe("BR-DS-09 motion only in the allow-list", () => {
	test("BR-DS-09 'transition-all duration-500 ease-out' on a card gives three findings", () => {
		const f = checkMotion(
			VIEW,
			jsx("transition-all duration-500 ease-out"),
			ALLOWED,
		);
		expect(f.length).toBe(3);
		expect(new Set(rules(f))).toEqual(new Set(["motion"]));
	});

	test("BR-DS-09 the three findings are on the same line, one per class", () => {
		const f = checkMotion(
			SHARED,
			jsx("transition-all duration-500 ease-out"),
			ALLOWED,
		);
		expect(f.length).toBe(3);
		expect(new Set(f.map((x) => x.message)).size).toBe(3);
	});

	for (const cls of [
		"ease-out",
		"ease-in-out",
		"ease-linear",
		"delay-150",
		"duration-300",
		"duration-[300ms]",
		"transition-all",
		"transition",
		"animate-spin",
		"animate-pulse",
		"animate-bounce",
	]) {
		test(`BR-DS-09 flags banned spelling "${cls}" even in an allow-listed file`, () => {
			const f = checkMotion(SHARED, jsx(`flex ${cls} p-2`), ALLOWED);
			expect(f.length).toBeGreaterThanOrEqual(1);
			expect(rules(f)).toContain("motion");
		});

		test(`BR-DS-09 flags banned spelling "${cls}" also inside src/components/ui/**`, () => {
			const f = checkMotion(UI, jsx(`flex ${cls} p-2`), ALLOWED);
			expect(f.length).toBeGreaterThanOrEqual(1);
		});
	}

	for (const cls of [
		"transition-colors duration-(--motion-fast) ease-standard",
		"transition-opacity duration-(--motion-base)",
		"transition-transform duration-(--motion-fast)",
		"transition-[width] duration-(--motion-slow) ease-standard",
		"animate-skeleton",
		"animate-status-flash",
	]) {
		test(`BR-DS-09 accepts allowed spelling "${cls}" in an allow-listed file`, () => {
			expect(checkMotion(SHARED, jsx(cls), ALLOWED)).toEqual([]);
		});
	}

	test("BR-DS-09 a bare 'transition' is flagged but 'transition-colors' is not", () => {
		expect(checkMotion(SHARED, jsx("transition-colors"), ALLOWED)).toEqual([]);
		expect(checkMotion(SHARED, jsx("transition"), ALLOWED).length).toBe(1);
	});

	test("BR-DS-09 a motion class in a file that is neither ui nor allow-listed is flagged", () => {
		const f = checkMotion(VIEW, jsx("transition-colors"), ALLOWED);
		expect(f.length).toBeGreaterThanOrEqual(1);
		expect(rules(f)).toContain("motion");
	});

	test("BR-DS-09 a skeleton class in a non-allow-listed file is flagged", () => {
		expect(
			checkMotion(VIEW, jsx("animate-skeleton"), ALLOWED).length,
		).toBeGreaterThanOrEqual(1);
	});

	test("BR-DS-09 a file added to the allow-list may use the allowed spellings", () => {
		expect(checkMotion(VIEW, jsx("transition-colors"), [VIEW])).toEqual([]);
	});

	test("BR-DS-09 src/components/ui/** may use enter/exit classes with base and fast durations", () => {
		const cls =
			"animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-(--motion-base) animate-out fade-out-0 zoom-out-95 duration-(--motion-fast)";
		expect(checkMotion(UI, jsx(cls), [])).toEqual([]);
	});

	test("BR-DS-09 enter/exit classes are not allowed outside ui", () => {
		expect(
			checkMotion(SHARED, jsx("animate-in fade-in-0"), ALLOWED).length,
		).toBeGreaterThanOrEqual(1);
	});

	test("BR-DS-09 flags an inline transition style", () => {
		const src = `export const X = () => <div style={{ transition: "opacity 1s" }} />;\n`;
		expect(checkMotion(SHARED, src, ALLOWED).length).toBeGreaterThanOrEqual(1);
	});

	test("BR-DS-09 flags an inline animation style", () => {
		const src = `export const X = () => <div style={{ animation: "spin 1s infinite" }} />;\n`;
		expect(checkMotion(SHARED, src, ALLOWED).length).toBeGreaterThanOrEqual(1);
	});

	test("BR-DS-09 flags @keyframes outside globals.css", () => {
		const css = `@keyframes wiggle { from { opacity: 0 } to { opacity: 1 } }\n`;
		expect(
			checkMotion("src/components/shared/x.css", css, ALLOWED).length,
		).toBeGreaterThanOrEqual(1);
	});

	test("BR-DS-09 @keyframes in globals.css is fine", () => {
		const css = `@keyframes skeleton-sweep { from { opacity: 0 } to { opacity: 1 } }\n`;
		expect(checkMotion(CSS, css, ALLOWED)).toEqual([]);
	});

	test("BR-DS-09 motion words in comments are ignored", () => {
		const src = `// was transition-all duration-500 ease-out\nexport const X = 1;\n`;
		expect(checkMotion(SHARED, src, ALLOWED)).toEqual([]);
	});

	test("BR-DS-09 a file without motion has no findings", () => {
		expect(checkMotion(VIEW, jsx("flex p-2 text-sm"), ALLOWED)).toEqual([]);
	});

	test("BR-DS-09 reports the right line number", () => {
		const src = `const a = 1;\n\n${jsx("ease-out")}`;
		expect(checkMotion(SHARED, src, ALLOWED)[0]?.line).toBe(3);
	});
});

describe("BR-DS-09 allow-list file", () => {
	const raw = readFileSync(
		resolve(HERE, "../../design/motion-allowlist.json"),
		"utf8",
	);
	const list = JSON.parse(raw) as { allowedFiles: string[] };

	test("BR-DS-09 allow-list contains StatCard.tsx and StatusFlashRow.tsx (spec adds exactly these)", () => {
		expect(list.allowedFiles).toContain("src/components/shared/StatCard.tsx");
		expect(list.allowedFiles).toContain(
			"src/components/shared/StatusFlashRow.tsx",
		);
	});

	test("BR-DS-09 every allow-listed path is relative to frontend/ under src/", () => {
		for (const p of list.allowedFiles) {
			expect(p.startsWith("src/")).toBe(true);
			expect(p.includes("..")).toBe(false);
		}
	});
});

/**
 * BR-DS-28: no text under 12 px (12 px only in the badge); no button (icon-only included), field
 * or select under 32 px high, anywhere under frontend/src/, ui/** included.
 * The spec names the check "size" but not the function: assumed `checkSize(path, source)`
 * returning findings with rule "size", like checkPalette / checkMotion. Namespace import so a
 * missing export fails these tests only.
 */
type Check = (path: string, source: string) => { rule: string; line: number }[];
const checkSize = (path: string, source: string) => {
	const fn = (rulesModule as unknown as { checkSize?: Check }).checkSize;
	if (!fn) throw new Error("checkSize is not exported from standards-rules.ts");
	return fn(path, source);
};
const BADGE = "src/components/shared/StatusBadge.tsx";
const DIALOG = "src/components/ui/dialog.tsx";

describe("BR-DS-28 sizes only from the token tables", () => {
	test("BR-DS-28 a dialog button with h-7 text-xs is reported (spec example)", () => {
		const f = checkSize(DIALOG, jsx("inline-flex h-7 text-xs"));
		expect(f.length).toBeGreaterThanOrEqual(1);
		expect(rules(f)).toContain("size");
	});

	for (const cls of [
		"text-xs",
		"text-[11px]",
		"text-[10px]",
		"text-[0.6875rem]",
	]) {
		test(`BR-DS-28 flags ${cls} outside the badge`, () => {
			expect(rules(checkSize(VIEW, jsx(cls)))).toContain("size");
		});
	}

	test("BR-DS-28 flags text under 12 px inside src/components/ui/**", () => {
		expect(rules(checkSize(DIALOG, jsx("text-[11px]")))).toContain("size");
	});

	test("BR-DS-28 12 px text is allowed in the badge", () => {
		expect(checkSize(BADGE, jsx("text-xs"))).toEqual([]);
	});

	test("BR-DS-28 text under 12 px is flagged even in the badge", () => {
		expect(rules(checkSize(BADGE, jsx("text-[11px]")))).toContain("size");
	});

	for (const cls of [
		"text-sm",
		"text-base",
		"text-lg",
		"text-[14px]",
		"text-[13px]",
	]) {
		test(`BR-DS-28 does not flag ${cls}`, () => {
			expect(checkSize(VIEW, jsx(cls))).toEqual([]);
		});
	}

	for (const cls of ["h-7", "h-6", "h-5", "h-[28px]", "size-7", "size-6"]) {
		test(`BR-DS-28 flags control height ${cls} on a button`, () => {
			const src = `export const X = () => <button className="${cls}" />;\n`;
			expect(rules(checkSize(VIEW, src))).toContain("size");
		});
	}

	test("BR-DS-28 flags an icon-only button at size-7", () => {
		const src = `export const X = () => <Button size="icon" className="size-7"><Icon /></Button>;\n`;
		expect(rules(checkSize(VIEW, src))).toContain("size");
	});

	test("BR-DS-28 flags an input under 32 px high", () => {
		const src = `export const X = () => <input className="h-7 border" />;\n`;
		expect(rules(checkSize(VIEW, src))).toContain("size");
	});

	test("BR-DS-28 flags a select trigger under 32 px high", () => {
		const src = `export const X = () => <SelectTrigger className="h-6" />;\n`;
		expect(rules(checkSize(VIEW, src))).toContain("size");
	});

	for (const cls of ["h-8", "h-9", "h-10", "size-8", "size-9"]) {
		test(`BR-DS-28 accepts ${cls} on a button (32, 36, 40 px)`, () => {
			const src = `export const X = () => <button className="${cls}" />;\n`;
			expect(checkSize(VIEW, src)).toEqual([]);
		});
	}

	test("BR-DS-28 the rule applies under src/components/ui/** too", () => {
		const src = `export const X = () => <button className="h-6" />;\n`;
		expect(rules(checkSize(DIALOG, src))).toContain("size");
	});

	test("BR-DS-28 size words in comments are ignored", () => {
		expect(
			checkSize(VIEW, `// was h-7 text-xs\nexport const X = 1;\n`),
		).toEqual([]);
	});

	test("BR-DS-28 reports the line of the offending class", () => {
		const src = `const a = 1;\nconst b = 2;\n${jsx("text-xs")}`;
		expect(checkSize(VIEW, src)[0]?.line).toBe(3);
	});

	test("BR-DS-28 a clean file has no findings", () => {
		expect(checkSize(VIEW, jsx("flex p-2 text-sm"))).toEqual([]);
	});
	// SPEC-02: the control and its height class can sit on different lines.
	for (const tag of ["Button", "Input", "SelectTrigger", "button", "input"]) {
		for (const cls of ["h-7", "h-6", "h-[28px]", "size-7"]) {
			test(`BR-DS-28 flags <${tag}> with ${cls} on a later line`, () => {
				const src = `export const X = () => (\n\t<${tag}\n\t\tvariant="outline"\n\t\tclassName="flex ${cls} px-2"\n\t/>\n);\n`;
				const f = checkSize(VIEW, src);
				expect(f.length).toBeGreaterThanOrEqual(1);
				expect(rules(f)).toContain("size");
			});
		}
	}

	test("BR-DS-28 flags a multi-line cn() className on a Button", () => {
		const src = `export const X = () => (\n\t<Button\n\t\tclassName={cn(\n\t\t\t"flex",\n\t\t\t"h-7",\n\t\t)}\n\t/>\n);\n`;
		expect(rules(checkSize(VIEW, src))).toContain("size");
	});

	test("BR-DS-28 accepts a multi-line Button at h-9", () => {
		const src = `export const X = () => (\n\t<Button\n\t\tvariant="outline"\n\t\tclassName="flex h-9 px-2"\n\t/>\n);\n`;
		expect(checkSize(VIEW, src)).toEqual([]);
	});

	test("BR-DS-28 a small height on a non-control multi-line element is not flagged", () => {
		const src = `export const X = () => (\n\t<div\n\t\tclassName="flex h-7 px-2"\n\t/>\n);\n`;
		expect(checkSize(VIEW, src)).toEqual([]);
	});

	test("BR-DS-28 a small height on a later control is not hidden by an earlier OK control", () => {
		const src = `export const X = () => (\n\t<>\n\t\t<Button\n\t\t\tclassName="h-9"\n\t\t/>\n\t\t<Button\n\t\t\tclassName="h-7"\n\t\t/>\n\t</>\n);\n`;
		expect(rules(checkSize(VIEW, src))).toContain("size");
	});

	for (const cls of ["h-1", "h-2", "h-3", "h-4", "size-4"]) {
		test(`BR-DS-28 flags control height ${cls} on a button`, () => {
			const src = `export const X = () => <button className="${cls}" />;\n`;
			expect(rules(checkSize(VIEW, src))).toContain("size");
		});
	}
});
