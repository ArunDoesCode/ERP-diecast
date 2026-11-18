/**
 * Pure standards rules (no filesystem) so unit tests can call them.
 * Used by scripts/standards-check.ts. Spec: docs/specs/design-system (BR-DS-01, BR-DS-09).
 */

export type Finding = {
	file: string;
	line: number;
	rule: string;
	message: string;
};

const UI_DIR = "src/components/ui/";

/** Blanks out comments (same length, newlines kept) so offsets and lines still match. */
export function maskComments(src: string): string {
	const out = src.split("");
	let i = 0;
	let quote: string | null = null;
	while (i < src.length) {
		const ch = src[i];
		const next = src[i + 1];
		if (quote) {
			if (ch === "\\") i += 2;
			else {
				if (ch === quote) quote = null;
				i += 1;
			}
			continue;
		}
		if (ch === '"' || ch === "`") {
			// Single quotes are skipped on purpose: JSX text has apostrophes.
			quote = ch;
			i += 1;
		} else if (ch === "/" && next === "/" && src[i - 1] !== ":") {
			while (i < src.length && src[i] !== "\n") {
				out[i] = " ";
				i += 1;
			}
		} else if (ch === "/" && next === "*") {
			while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
				if (src[i] !== "\n") out[i] = " ";
				i += 1;
			}
			out[i] = " ";
			out[i + 1] = " ";
			i += 2;
		} else {
			i += 1;
		}
	}
	return out.join("");
}

const PALETTE =
	/(?<![\w-])(bg|text|border|ring|fill|stroke)-(red|rose|pink|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|slate|gray|zinc|neutral|stone)-\d{2,3}(?![\w])/g;

const MOTION =
	/(?<![\w-])(?:transition|animate|duration)-[\w[\]().%/-]+|(?<![\w.$])motion\.\w+/g;

/**
 * BR-DS-01. `path` is relative to frontend/ with forward slashes, `source` the raw file text.
 * Today: raw palette classes outside src/components/ui/**.
 * TODO (slice A): also flag hex colours outside src/components/ui/** and globals.css.
 */
export function checkPalette(path: string, source: string): Finding[] {
	const found: Finding[] = [];
	if (path.startsWith(UI_DIR)) return found;
	maskComments(source)
		.split("\n")
		.forEach((text, i) => {
			const hits = text.match(PALETTE);
			if (!hits) return;
			found.push({
				file: path,
				line: i + 1,
				rule: "raw-palette",
				message: `raw palette class ${[...new Set(hits)].join(", ")} - use a semantic token (status map / design tokens)`,
			});
		});
	return found;
}

/**
 * BR-DS-09. `allowedFiles` = design/motion-allowlist.json `allowedFiles`.
 * Today: motion class outside ui/** and the allow-list.
 * TODO (slice A): the "checker must flag" list (ease-*, delay-*, duration-N, transition-all,
 * animate-* not allowed, inline transition/animation style, @keyframes outside globals.css), ui included.
 */
export function checkMotion(
	path: string,
	source: string,
	allowedFiles: readonly string[],
): Finding[] {
	const found: Finding[] = [];
	if (path.startsWith(UI_DIR) || allowedFiles.includes(path)) return found;
	maskComments(source)
		.split("\n")
		.forEach((text, i) => {
			const hits = text.match(MOTION);
			if (!hits) return;
			found.push({
				file: path,
				line: i + 1,
				rule: "motion",
				message: `${[...new Set(hits)].join(", ")} used outside src/components/ui and design/motion-allowlist.json`,
			});
		});
	return found;
}
