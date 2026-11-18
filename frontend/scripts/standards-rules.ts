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

/** 3, 4, 6 or 8 digit hex colour literal. */
const HEX =
	/(?<![\w&/#-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;

function isGlobalsCss(path: string): boolean {
	return path.endsWith("globals.css");
}

/**
 * BR-DS-01. `path` is relative to frontend/ with forward slashes, `source` the raw file text.
 * Flags raw palette classes and hex colours outside src/components/ui/** (hex: also not globals.css).
 */
export function checkPalette(path: string, source: string): Finding[] {
	const found: Finding[] = [];
	if (path.startsWith(UI_DIR)) return found;
	const hexOk = isGlobalsCss(path);
	maskComments(source)
		.split("\n")
		.forEach((text, i) => {
			const hits = text.match(PALETTE);
			if (hits) {
				found.push({
					file: path,
					line: i + 1,
					rule: "raw-palette",
					message: `raw palette class ${[...new Set(hits)].join(", ")} - use a semantic token (status map / design tokens)`,
				});
			}
			const hex = hexOk ? null : text.match(HEX);
			if (hex) {
				found.push({
					file: path,
					line: i + 1,
					rule: "raw-palette",
					message: `hex colour ${[...new Set(hex)].join(", ")} - use a semantic token (design tokens)`,
				});
			}
		});
	return found;
}

/** A motion class: transition, ease-*, delay-*, duration-*, animate-*, or a motion.* call. */
const MOTION =
	/(?<![\w.$-])(?:transition(?![\w-]|\s*:)|(?:transition|ease|delay|duration|animate)-[\w[\]().%/,-]+|(?:fade|zoom|slide)-(?:in|out)(?:-[\w[\]().%/,-]+)?)|(?<![\w.$])motion\.\w+/g;

/** Allowed in every file that may hold motion at all. */
const MOTION_OK = new Set([
	"transition-colors",
	"transition-opacity",
	"transition-transform",
	"transition-[width]",
	"duration-(--motion-fast)",
	"duration-(--motion-base)",
	"duration-(--motion-slow)",
	"ease-standard",
	"animate-skeleton",
	"animate-status-flash",
]);

/** Allowed in src/components/ui/** only (dialog, sheet, popover, dropdown, toast enter and exit). */
const MOTION_UI_OK =
	/^(?:animate-(?:in|out)|(?:fade|zoom|slide)-(?:in|out)(?:-[\w[\]().%/,-]+)?)$/;

const INLINE_STYLE = /(?<![\w.$-])(?:transition|animation)\s*:/;
const KEYFRAMES = /@keyframes\b/;

/**
 * BR-DS-09. `allowedFiles` = design/motion-allowlist.json `allowedFiles`.
 * Flags, in every file (ui included): ease-* other than ease-standard, delay-*, duration-N / [..],
 * transition-all and bare transition, animate-* not allowed, inline transition / animation style,
 * @keyframes outside globals.css; and any motion class in a file that is neither ui nor allow-listed.
 */
export function checkMotion(
	path: string,
	source: string,
	allowedFiles: readonly string[],
): Finding[] {
	const found: Finding[] = [];
	if (isGlobalsCss(path)) return found;
	const inUi = path.startsWith(UI_DIR);
	const mayMove = inUi || allowedFiles.includes(path);
	maskComments(source)
		.split("\n")
		.forEach((text, i) => {
			const add = (message: string) =>
				found.push({ file: path, line: i + 1, rule: "motion", message });
			for (const m of new Set(text.match(MOTION) ?? [])) {
				if (!mayMove) {
					add(
						`${m} used outside src/components/ui and design/motion-allowlist.json`,
					);
				} else if (!MOTION_OK.has(m) && !(inUi && MOTION_UI_OK.test(m))) {
					add(
						`${m} is not an allowed motion spelling (spec: Allowed class spellings)`,
					);
				}
			}
			if (INLINE_STYLE.test(text)) {
				add("inline transition / animation style - use the allowed classes");
			}
			if (KEYFRAMES.test(text)) {
				add("@keyframes outside globals.css");
			}
		});
	return found;
}
