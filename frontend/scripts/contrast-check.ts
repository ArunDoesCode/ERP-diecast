/**
 * Contrast check for design tokens (BR-DS-02): text pairs >= 4.5:1, field borders, focus rings and
 * chart colours >= 3:1 on their surface, light and dark. Reads src/app/globals.css.
 *   bun scripts/contrast-check.ts   (exit 1 when any pair fails)
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type Oklch = { l: number; c: number; h: number };

export type ContrastPair = {
	/** e.g. "--warning on --warning-subtle" */
	name: string;
	theme: "light" | "dark";
	/** "text" needs 4.5:1; "ui" (field border, focus ring, chart colour) needs 3:1 */
	kind: "text" | "ui";
	foreground: Oklch;
	background: Oklch;
};

export type ContrastResult = {
	pair: ContrastPair;
	ratio: number;
	required: 3 | 4.5;
	pass: boolean;
};

/** Relative luminance (WCAG 2) of an OKLCH colour, gamut-clipped to sRGB. */
function luminance({ l, c, h }: Oklch): number {
	const a = c * Math.cos((h * Math.PI) / 180);
	const b = c * Math.sin((h * Math.PI) / 180);
	const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
	const clip = (v: number) => Math.min(1, Math.max(0, v));
	const r = clip(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_);
	const g = clip(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_);
	const bl = clip(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_);
	return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}

/** WCAG contrast ratio (1 to 21) between two OKLCH colours. */
export function contrastRatio(a: Oklch, b: Oklch): number {
	const la = luminance(a);
	const lb = luminance(b);
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const THEME_BLOCK: Record<ContrastPair["theme"], RegExp> = {
	light: /^:root\s*\{([^}]*)\}/m,
	dark: /^\.dark\s*\{([^}]*)\}/m,
};

function declarations(block: string): Map<string, string> {
	const out = new Map<string, string>();
	for (const m of block.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
		out.set(m[1] as string, (m[2] as string).trim());
	}
	return out;
}

function parseOklch(value: string): Oklch | null {
	const m = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(value);
	return m ? { l: Number(m[1]), c: Number(m[2]), h: Number(m[3]) } : null;
}

const TONES = ["success", "warning", "info", "neutral", "destructive"] as const;

/** [foreground token, background token] */
const TEXT_PAIRS: [string, string][] = [
	["foreground", "background"],
	["card-foreground", "card"],
	["popover-foreground", "popover"],
	["primary-foreground", "primary"],
	["secondary-foreground", "secondary"],
	["accent-foreground", "accent"],
	["muted-foreground", "background"],
	["muted-foreground", "card"],
	["muted-foreground", "muted"],
	["muted-foreground", "table-header"],
	["foreground", "table-header"],
	["brand-accent", "background"],
	["brand-accent", "card"],
	["brand-accent-foreground", "brand-accent"],
	["sidebar-foreground", "sidebar"],
	["sidebar-muted", "sidebar"],
	["sidebar-accent-foreground", "sidebar-accent"],
	["sidebar-primary-foreground", "sidebar-primary"],
	...TONES.flatMap((t): [string, string][] => [
		[t, `${t}-subtle`],
		[t, "card"],
		[`${t}-foreground`, t],
	]),
];

const UI_PAIRS: [string, string][] = [
	["input", "background"],
	["input", "card"],
	["ring", "background"],
	["ring", "card"],
	["sidebar-ring", "sidebar"],
	...[1, 2, 3, 4, 5].map((n): [string, string] => [`chart-${n}`, "card"]),
];

/** Reads token pairs (text and ui, light and dark) from the text of globals.css. */
export function readTokenPairs(globalsCss: string): ContrastPair[] {
	const pairs: ContrastPair[] = [];
	for (const theme of ["light", "dark"] as const) {
		const block = THEME_BLOCK[theme].exec(globalsCss);
		if (!block) throw new Error(`globals.css: no ${theme} token block`);
		const raw = declarations(block[1] as string);
		const resolveToken = (name: string): Oklch => {
			let value = raw.get(name);
			for (let hops = 0; value?.startsWith("var(") && hops < 5; hops += 1) {
				value = raw.get(value.slice(6, -1));
			}
			const colour = value ? parseOklch(value) : null;
			if (!colour)
				throw new Error(
					`globals.css: --${name} missing or not oklch (${theme})`,
				);
			return colour;
		};
		const add = (kind: ContrastPair["kind"], list: [string, string][]) => {
			for (const [fg, bg] of list) {
				pairs.push({
					name: `--${fg} on --${bg}`,
					theme,
					kind,
					foreground: resolveToken(fg),
					background: resolveToken(bg),
				});
			}
		};
		add("text", TEXT_PAIRS);
		add("ui", UI_PAIRS);
	}
	return pairs;
}

/** Ratio and pass/fail for every pair (text 4.5, ui 3). */
export function checkContrast(
	pairs: readonly ContrastPair[],
): ContrastResult[] {
	return pairs.map((pair) => {
		const required = pair.kind === "text" ? 4.5 : 3;
		const ratio = contrastRatio(pair.foreground, pair.background);
		return { pair, ratio, required, pass: ratio >= required };
	});
}

if (import.meta.main) {
	const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
	const css = readFileSync(resolve(root, "src/app/globals.css"), "utf8");
	const results = checkContrast(readTokenPairs(css));
	const failing = results.filter((r) => !r.pass);
	for (const r of failing) {
		console.log(
			`FAIL ${r.pair.theme} ${r.pair.kind} ${r.pair.name} ${r.ratio.toFixed(2)} < ${r.required}`,
		);
	}
	for (const theme of ["light", "dark"] as const) {
		for (const kind of ["text", "ui"] as const) {
			const mine = results.filter(
				(r) => r.pair.theme === theme && r.pair.kind === kind,
			);
			const low = mine.reduce((a, b) => (b.ratio < a.ratio ? b : a));
			console.log(
				`${theme} ${kind}: ${mine.length} pairs, lowest ${low.ratio.toFixed(2)} (${low.pair.name})`,
			);
		}
	}
	if (failing.length > 0) {
		console.log(`\ncontrast-check failed: ${failing.length} pair(s).`);
		process.exit(1);
	}
	console.log("\ncontrast-check passed.");
}
