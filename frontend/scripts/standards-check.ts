/**
 * Frontend standards check — plan agentic-workflow-v2, guardrail 1.4.
 *
 *   bun scripts/standards-check.ts             report mode: prints findings, exit 0
 *   bun scripts/standards-check.ts --strict    exit 1 when there is any finding
 *   STANDARDS_STRICT=1 bun scripts/...         same as --strict
 *   --strict=rule1,rule2                       exit 1 only for findings of those rules
 *   STANDARDS_STRICT=rule1,rule2               same
 *   --summary                                  counts per rule + top files only
 *
 * Rules (text-based heuristics, no AST — a finding is a pointer, not a proof):
 *   mutation-invalidate  a `useMutation(` neither invalidates / updates the query cache
 *                        nor carries a `// no-invalidate: <reason>` comment
 *   raw-palette          raw Tailwind palette class (bg-emerald-100 ...) outside src/components/ui/**
 *   motion               transition-* / animate-* / duration-* / motion.* outside
 *                        src/components/ui/** and design/motion-allowlist.json
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	checkMotion,
	checkPalette,
	type Finding,
	maskComments,
} from "./standards-rules";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const ALLOWLIST = "design/motion-allowlist.json";

// Strict switch: `--strict` / STANDARDS_STRICT=1 = every rule blocks;
// `--strict=rule1,rule2` / STANDARDS_STRICT=rule1,rule2 = only those rules block.
const strictArg = process.argv.find(
	(a) => a === "--strict" || a.startsWith("--strict="),
);
const strictSpec =
	strictArg !== undefined
		? strictArg === "--strict"
			? "1"
			: strictArg.slice("--strict=".length)
		: (process.env.STANDARDS_STRICT ?? "");
const strictAll = strictSpec === "1" || strictSpec === "true";
const strictRules = new Set(
	strictAll || strictSpec === ""
		? []
		: strictSpec.split(",").filter((x) => x.length > 0),
);
const strict = strictAll || strictRules.size > 0;
const blocks = (rule: string) => strictAll || strictRules.has(rule);
const summaryOnly = process.argv.includes("--summary");

const findings: Finding[] = [];
const notes: string[] = [];

function add(file: string, line: number, rule: string, message: string) {
	findings.push({ file, line, rule, message });
}

// ─── helpers ────────────────────────────────────────────────────────────────

function walk(dir: string, out: string[] = []): string[] {
	if (!existsSync(dir)) return out;
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) {
			if (name !== "node_modules") walk(full, out);
		} else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) {
			out.push(full);
		}
	}
	return out.sort();
}

const rel = (file: string) => relative(ROOT, file).split("\\").join("/");

function lineAt(src: string, offset: number): number {
	let line = 1;
	for (let i = 0; i < offset && i < src.length; i += 1) {
		if (src[i] === "\n") line += 1;
	}
	return line;
}

/** Index of the `)` that closes the `(` at `open` (or -1). */
function matchParen(src: string, open: number): number {
	let depth = 0;
	for (let i = open; i < src.length; i += 1) {
		const ch = src[i];
		if (ch === "(") depth += 1;
		else if (ch === ")") {
			depth -= 1;
			if (depth === 0) return i;
		}
	}
	return -1;
}

type SourceFile = { rel: string; raw: string; code: string };
const files: SourceFile[] = walk(SRC).map((path) => {
	const raw = readFileSync(path, "utf8");
	return { rel: rel(path), raw, code: maskComments(raw) };
});

// ─── (a) every mutation invalidates the cache ───────────────────────────────

const CACHE_CALL =
	/\b(invalidateQueries|setQueryData|setQueriesData|refetchQueries|resetQueries|removeQueries)\b/;

function checkMutations() {
	let total = 0;
	for (const f of files) {
		const re = /\buseMutation\s*(?:<[^(]*>)?\s*\(/g;
		for (let m = re.exec(f.code); m; m = re.exec(f.code)) {
			const open = m.index + m[0].length - 1;
			const close = matchParen(f.code, open);
			if (close < 0) continue;
			total += 1;
			const call = f.code.slice(m.index, close + 1);
			if (CACHE_CALL.test(call)) continue;

			// One hop: a helper declared in the same file that does the invalidation.
			const viaHelper = [
				...new Set(call.match(/\b[A-Za-z_]\w*(?=\s*\()/g)),
			].some((name) => {
				const decl = new RegExp(
					`(?:function\\s+${name}\\b|const\\s+${name}\\s*=)`,
				).exec(f.code);
				if (!decl) return false;
				const next = /\n(?=[A-Za-z])/.exec(f.code.slice(decl.index + 1));
				const end = next ? decl.index + 1 + next.index : f.code.length;
				return CACHE_CALL.test(f.code.slice(decl.index, end));
			});
			if (viaHelper) continue;

			// Opt-out comment: inside the call, or on the 3 lines above it.
			const line = lineAt(f.code, m.index);
			const rawLines = f.raw.split("\n");
			const endLine = lineAt(f.code, close);
			const window = rawLines.slice(Math.max(0, line - 4), endLine).join("\n");
			if (/\/\/\s*no-invalidate:\s*\S+/.test(window)) continue;

			add(
				f.rel,
				line,
				"mutation-invalidate",
				"useMutation( has no invalidateQueries / setQueryData and no `// no-invalidate: <reason>` comment",
			);
		}
	}
	notes.push(`mutation-invalidate: ${total} useMutation( call(s) checked.`);
}

// ─── (b) raw palette classes ────────────────────────────────────────────────

function runPalette() {
	for (const f of files) findings.push(...checkPalette(f.rel, f.raw));
}

// ─── (c) motion outside the allow-list ──────────────────────────────────────

function runMotion() {
	let allowed: string[] = [];
	const allowPath = join(ROOT, ALLOWLIST);
	if (existsSync(allowPath)) {
		try {
			const parsed: unknown = JSON.parse(readFileSync(allowPath, "utf8"));
			const list =
				typeof parsed === "object" &&
				parsed !== null &&
				"allowedFiles" in parsed
					? parsed.allowedFiles
					: [];
			if (Array.isArray(list)) {
				allowed = list.filter((x): x is string => typeof x === "string");
			}
		} catch {
			add(ALLOWLIST, 0, "motion", "allow-list file is not valid JSON");
		}
	} else {
		add(ALLOWLIST, 0, "motion", "allow-list file is missing");
	}
	for (const f of files) findings.push(...checkMotion(f.rel, f.raw, allowed));
	notes.push(`motion: ${allowed.length} file(s) on the allow-list.`);
}

// ─── run + report ───────────────────────────────────────────────────────────

checkMutations();
runPalette();
runMotion();

const RULES = ["mutation-invalidate", "raw-palette", "motion"];

console.log(
	`frontend standards-check (${strictAll ? "strict" : strict ? `strict: ${[...strictRules].join(",")}` : "report"} mode) - ${findings.length} finding(s)\n`,
);
if (!summaryOnly) {
	for (const rule of RULES) {
		const list = findings
			.filter((f) => f.rule === rule)
			.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
		if (list.length === 0) continue;
		console.log(`## ${rule} (${list.length})`);
		for (const f of list) {
			console.log(`${f.file}:${f.line} ${f.rule} ${f.message}`);
		}
		console.log("");
	}
}
console.log("## Count per rule");
for (const rule of RULES) {
	console.log(
		`${rule.padEnd(20)} ${findings.filter((f) => f.rule === rule).length}`,
	);
}
console.log(`${"total".padEnd(20)} ${findings.length}`);

const perFile = new Map<string, number>();
for (const f of findings) perFile.set(f.file, (perFile.get(f.file) ?? 0) + 1);
console.log("\n## Top files");
for (const [file, n] of [...perFile.entries()]
	.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
	.slice(0, 10)) {
	console.log(`${String(n).padStart(4)}  ${file}`);
}
if (notes.length > 0) {
	console.log("\n## Notes");
	for (const n of notes) console.log(`- ${n}`);
}

const blocking = findings.filter((f) => blocks(f.rule));
if (strict && blocking.length > 0) {
	console.log("\nstandards-check failed (strict mode).");
	process.exit(1);
}
