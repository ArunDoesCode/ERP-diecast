/**
 * Contrast check for design tokens (BR-DS-02). Stubs: bodies land in slice A.
 *   bun scripts/contrast-check.ts   (exit 1 when any pair fails)
 */

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

/** WCAG contrast ratio (1 to 21) between two OKLCH colours. */
export function contrastRatio(_a: Oklch, _b: Oklch): number {
	throw new Error("not implemented");
}

/** Reads token pairs (text and ui, light and dark) from the text of globals.css. */
export function readTokenPairs(_globalsCss: string): ContrastPair[] {
	throw new Error("not implemented");
}

/** Ratio and pass/fail for every pair (text 4.5, ui 3). */
export function checkContrast(
	_pairs: readonly ContrastPair[],
): ContrastResult[] {
	throw new Error("not implemented");
}
