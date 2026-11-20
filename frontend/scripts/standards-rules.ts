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

/** Files where 12 px text (text-xs) is allowed: the badge. */
const BADGE_FILES = new Set([
	"src/components/shared/StatusBadge.tsx",
	"src/components/ui/badge.tsx",
]);

/** Text under 12 px, or text-xs (12 px, badge only). Prefix variants (md:, dark:) are matched too. */
const SMALL_TEXT =
	/(?<![\w-])text-(?:\[(\d+(?:\.\d+)?)(px|rem)\]|xs(?![\w-]))/g;
/** Control height class under 32 px: h-/size-/min-h- 0-7 (also .5 steps, px) or an arbitrary value below 32 px. */
const SMALL_CONTROL =
	/(?<![\w-])(?:min-h|h|size)-(?:(?:[0-7](?:\.5)?|px)(?![\w.-])|\[(\d+(?:\.\d+)?)(px|rem)\])/g;
/** Start of a button, input or select JSX opening tag (a file that is one is checked whole). */
const CONTROL_TAG =
	/<(?:button|input|select|Button|Input|Select\w*)(?![\w.-])/g;
const CONTROL_FILE = /\/(?:button|input|select|toggle|pagination)\.tsx$/;

/** End offset of the JSX opening tag that starts at `start` (skips quotes and `{...}` blocks). */
function tagEnd(src: string, start: number): number {
	let depth = 0;
	let quote = "";
	for (let i = start; i < src.length; i++) {
		const c = src[i];
		if (quote) {
			if (c === quote) quote = "";
		} else if (c === '"' || (depth > 0 && (c === "'" || c === "`"))) quote = c;
		else if (c === "{") depth++;
		else if (c === "}") depth--;
		else if (c === ">" && depth === 0 && src[i - 1] !== "=") return i;
	}
	return src.length;
}

function toPx(value: string, unit: string): number {
	return unit === "rem" ? Number(value) * 16 : Number(value);
}

/**
 * BR-DS-28. Flags text under 12 px (and text-xs outside the badge) and button / input / select
 * heights under 32 px, everywhere under src/ including ui/**.
 */
export function checkSize(path: string, source: string): Finding[] {
	const found: Finding[] = [];
	const badgeOk = BADGE_FILES.has(path);
	const masked = maskComments(source);
	const lineAt = (offset: number) => {
		let n = 1;
		for (let i = 0; i < offset; i++) if (masked[i] === "\n") n++;
		return n;
	};
	masked.split("\n").forEach((text, i) => {
		const small = new Set<string>();
		for (const m of text.matchAll(SMALL_TEXT)) {
			if (m[1] === undefined) {
				if (!badgeOk) small.add(m[0]);
			} else if (toPx(m[1], m[2] ?? "px") < 12) small.add(m[0]);
		}
		if (small.size > 0) {
			found.push({
				file: path,
				line: i + 1,
				rule: "size",
				message: `text ${[...small].join(", ")} - body and labels are 12 px at least (12 px badge only), use text-sm or the type role`,
			});
		}
	});
	const ranges: Array<[number, number]> = CONTROL_FILE.test(path)
		? [[0, masked.length]]
		: [...masked.matchAll(CONTROL_TAG)].map((m) => {
				const start = m.index ?? 0;
				return [start, tagEnd(masked, start)];
			});
	const seen = new Set<number>();
	const whole = CONTROL_FILE.test(path);
	for (const [from, to] of ranges) {
		const part = masked.slice(from, to);
		for (const m of part.matchAll(SMALL_CONTROL)) {
			if (m[1] !== undefined && toPx(m[1], m[2] ?? "px") >= 32) continue;
			// whole control files hold icon sizes (size-4) and separators (h-px) too: only heights count there
			if (whole && (m[0].startsWith("size-") || m[0] === "h-px")) continue;
			const offset = from + (m.index ?? 0);
			if (seen.has(offset)) continue;
			seen.add(offset);
			found.push({
				file: path,
				line: lineAt(offset),
				rule: "size",
				message: `control height ${m[0]} - buttons, inputs and selects are 32 px at least (h-8, h-9, h-10)`,
			});
		}
	}
	return found.sort((x, y) => x.line - y.line);
}

/** The retired floating-label field: its components and its module. */
const FLOATING_FIELD = /\bFloating(?:LabelInput|Label|Input)\b|floating-label/;

/**
 * BR-DS-29. A form field has one look (label above, 36 px); flags any use of the retired
 * floating-label field (component names or the import path). Comments are ignored.
 */
export function checkFieldLook(path: string, source: string): Finding[] {
	const found: Finding[] = [];
	maskComments(source)
		.split("\n")
		.forEach((text, i) => {
			const m = FLOATING_FIELD.exec(text);
			if (m) {
				found.push({
					file: path,
					line: i + 1,
					rule: "field-look",
					message: `${m[0]} - the floating-label field is retired, use <Label htmlFor> above an Input / Select (36 px)`,
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
