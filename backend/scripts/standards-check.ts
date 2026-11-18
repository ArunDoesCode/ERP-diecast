/**
 * Backend standards check — plan agentic-workflow-v2, guardrails 1.3 and 1.7.
 *
 *   bun scripts/standards-check.ts             report mode: prints findings, exit 0
 *   bun scripts/standards-check.ts --strict    exit 1 when there is any finding
 *   STANDARDS_STRICT=1 bun scripts/...         same as --strict
 *   --strict=rule1,rule2                       exit 1 only for findings of those rules
 *   STANDARDS_STRICT=rule1,rule2               same
 *   --summary                                  counts per rule + top files only
 *
 * Rules (text-based heuristics, no AST — a finding is a pointer, not a proof):
 *   idx-fk        a `.references(` column is not the PK, not unique and not the
 *                 leading column of any index
 *   idx-filter    a column filtered in a repository query (eq / inArray / range)
 *                 is not the leading column of any index
 *                 (a column may carry `// no-index: <tag> <reason>`; tags: audit, tiny,
 *                 covered:<index>, low-card, pk-join; see design/data.md)
 *   raw-ilike     `ilike(` or the word ilike inside a `sql` template outside the shared
 *                 search helper (SEARCH_HELPER); local escapeLike()/likePattern() copies
 *   zod-array     `z.array(` / `.array(` in a request schema without `.max(`
 *   zod-string    `z.string()` in a request schema without `.max(` or a
 *                 bounded format (uuid, email, date, regex, ...)
 *   zod-number    quantity / amount number in a request schema without an upper bound
 *   db-error-409  the shared error handler does not map Postgres 23505 / 23503 to 409
 *   ist-date      "today" worked out from UTC or server-local time outside IST_HELPER
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const SEARCH_HELPER = "src/lib/safe-search.ts";
const IST_HELPER = "src/lib/ist-day.ts";
const ERROR_HANDLER = "src/app.ts";

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

type Finding = { file: string; line: number; rule: string; message: string };
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
      if (name !== "node_modules" && name !== "migrations") walk(full, out);
    } else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out.sort();
}

const rel = (file: string) => relative(ROOT, file).split("\\").join("/");

/** Blanks out comments (same length, newlines kept) so offsets and lines still match. */
function maskComments(src: string): string {
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
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      i += 1;
    } else if (ch === "/" && next === "/") {
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

function lineAt(src: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < src.length; i += 1) {
    if (src[i] === "\n") line += 1;
  }
  return line;
}

/** Index of the bracket that closes the one at `open` (or -1). */
function matchClose(src: string, open: number): number {
  const pairs: Record<string, string> = { "(": ")", "{": "}", "[": "]" };
  const openCh = src[open] ?? "";
  const closeCh = pairs[openCh];
  if (!closeCh) return -1;
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i];
    if (quote) {
      if (ch === "\\") i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === openCh) depth += 1;
    else if (ch === closeCh) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Method names chained after `start` (the index just past the base call). */
function chainMethods(
  src: string,
  start: number,
): { methods: string[]; text: string } {
  const methods: string[] = [];
  let i = start;
  for (;;) {
    const m = /^\s*\.\s*(\w+)\s*\(/.exec(src.slice(i, i + 200));
    if (!m) break;
    methods.push(m[1] ?? "");
    const open = i + m[0].length - 1;
    const close = matchClose(src, open);
    if (close < 0) break;
    i = close + 1;
  }
  return { methods, text: src.slice(start, i) };
}

type SourceFile = { path: string; rel: string; raw: string; code: string };
const files: SourceFile[] = walk(SRC).map((path) => {
  const raw = readFileSync(path, "utf8");
  return { path, rel: rel(path), raw, code: maskComments(raw) };
});
const inDir = (dir: string) => files.filter((f) => f.rel.startsWith(dir));

// ─── (a) indexes on foreign keys and filter columns ─────────────────────────

type Column = {
  line: number;
  isFk: boolean;
  selfIndexed: boolean;
  dbName: string;
  startLine: number;
  endLine: number;
  /** text after `// no-index:` (may be ""), null when the column has no exemption comment */
  noIndex: string | null;
  exempt: boolean;
  badExempt: boolean;
};
type Table = {
  file: string;
  varName: string;
  dbName: string;
  columns: Map<string, Column>;
  leading: Set<string>;
};
const tables = new Map<string, Table>();
const indexNames = new Set<string>();
const EXEMPT_TAGS = ["audit", "tiny", "low-card", "pk-join"];
const GROWTH_TABLES = new Set([
  "inventory_ledger",
  "purchase_request_items",
  "purchase_order_items",
  "grn_items",
  "subcontracting_order_items",
  "sco_challan_lines",
  "subcontracting_grn_items",
  "approval_requests",
  "approval_trails",
]);
const exemptCounts: Record<string, number> = {
  audit: 0,
  covered: 0,
  tiny: 0,
  "low-card": 0,
  "pk-join": 0,
};

/** `// no-index:` text on the column's own lines, or on a comment-only line just above. */
function findNoIndex(
  rawLines: string[],
  startLine: number,
  endLine: number,
): string | null {
  const re = /\/\/\s*no-index:(.*)$/;
  for (let l = startLine; l <= endLine; l += 1) {
    const m = re.exec(rawLines[l - 1] ?? "");
    if (m) return (m[1] ?? "").trim();
  }
  const above = rawLines[startLine - 2] ?? "";
  if (/^\s*\/\//.test(above)) {
    const m = re.exec(above);
    if (m) return (m[1] ?? "").trim();
  }
  return null;
}

function parseSchemas() {
  for (const f of inDir("src/db/schemas/")) {
    const rawLines = f.raw.split("\n");
    for (const im of f.code.matchAll(
      /\b(?:uniqueIndex|index)\(\s*["'`]([^"'`]+)["'`]/g,
    )) {
      indexNames.add(im[1] ?? "");
    }
    for (const um of f.code.matchAll(/\bunique\(\s*["'`]([^"'`]+)["'`]/g)) {
      indexNames.add(um[1] ?? "");
    }
    const re = /export const (\w+)\s*=\s*pgTable\(/g;
    for (let m = re.exec(f.code); m; m = re.exec(f.code)) {
      const open = m.index + m[0].length - 1;
      const close = matchClose(f.code, open);
      if (close < 0) continue;
      const colsOpen = f.code.indexOf("{", open);
      const colsClose = matchClose(f.code, colsOpen);
      if (colsOpen < 0 || colsClose < 0 || colsClose > close) continue;
      const dbName = /["'`]([^"'`]+)["'`]/.exec(f.code.slice(open, colsOpen));
      const table: Table = {
        file: f.rel,
        varName: m[1] ?? "",
        dbName: dbName?.[1] ?? m[1] ?? "",
        columns: new Map(),
        leading: new Set(),
      };

      // Column entries = `key: <expr>,` at depth 1 of the columns object.
      let depth = 0;
      let entryStart = colsOpen + 1;
      const body = f.code;
      const flush = (end: number) => {
        const text = body.slice(entryStart, end);
        const key = /^\s*(\w+)\s*:/.exec(text);
        if (key) {
          const keyOffset = entryStart + text.indexOf(key[1] ?? "");
          const colDb =
            /\(\s*["'`]([^"'`]+)["'`]/.exec(text)?.[1] ?? key[1] ?? "";
          // Postgres default names: `<table>_<col>_key` (unique), `<table>_pkey` (PK).
          if (/\.unique\(/.test(text))
            indexNames.add(`${table.dbName}_${colDb}_key`);
          if (/\.primaryKey\(/.test(text))
            indexNames.add(`${table.dbName}_pkey`);
          const startLine = lineAt(body, keyOffset);
          const endLine = lineAt(body, end);
          table.columns.set(key[1] ?? "", {
            line: startLine,
            startLine,
            endLine,
            noIndex: findNoIndex(rawLines, startLine, endLine),
            exempt: false,
            badExempt: false,
            isFk: /\.references\(/.test(text),
            selfIndexed: /\.primaryKey\(|\.unique\(/.test(text),
            dbName: /\(\s*["'`]([^"'`]+)["'`]/.exec(text)?.[1] ?? key[1] ?? "",
          });
        }
        entryStart = end + 1;
      };
      let quote: string | null = null;
      for (let i = colsOpen + 1; i < colsClose; i += 1) {
        const ch = body[i] ?? "";
        if (quote) {
          if (ch === "\\") i += 1;
          else if (ch === quote) quote = null;
          continue;
        }
        if (ch === '"' || ch === "'" || ch === "`") quote = ch;
        else if ("({[".includes(ch)) depth += 1;
        else if (")}]".includes(ch)) depth -= 1;
        else if (ch === "," && depth === 0) flush(i);
      }
      flush(colsClose);

      // Table-level indexes / constraints: the first column listed is the leading one.
      const extras = body.slice(colsClose + 1, close);
      const leadRe =
        /\.on\(\s*(?:\w+)\.(\w+)|columns:\s*\[\s*(?:\w+)\.(\w+)|\.on\(\s*sql`[^`]*?\$\{\s*\w+\.(\w+)\s*\}/g;
      for (let l = leadRe.exec(extras); l; l = leadRe.exec(extras)) {
        const col = l[1] ?? l[2] ?? l[3];
        // `foreignKey({ columns: [...] })` marks an FK, it is not an index.
        const before = extras.slice(Math.max(0, l.index - 40), l.index);
        if (l[2] && /foreignKey\(\s*\{\s*$/.test(before)) {
          const c = table.columns.get(l[2]);
          if (c) c.isFk = true;
          continue;
        }
        if (col) table.leading.add(col);
      }
      tables.set(table.varName, table);
    }
  }
}

function isIndexed(table: Table, col: string): boolean {
  return (
    table.leading.has(col) || (table.columns.get(col)?.selfIndexed ?? false)
  );
}

function checkExemptions() {
  for (const table of tables.values()) {
    const growth = GROWTH_TABLES.has(table.dbName);
    for (const col of table.columns.values()) {
      if (col.noIndex === null) continue;
      const rule = col.isFk ? "idx-fk" : "idx-filter";
      const where = `${table.dbName}.${col.dbName}`;
      const bad = (why: string) => {
        col.badExempt = true;
        add(table.file, col.line, rule, `${where}: // no-index: ${why}`);
      };
      const text = col.noIndex;
      if (text === "") {
        bad("has no tag and no reason");
        continue;
      }
      const cov = /^covered:([\w-]+)/.exec(text);
      const tag = cov
        ? "covered"
        : EXEMPT_TAGS.find((t) => new RegExp(`^${t}(?:\\s|$)`).test(text));
      if (!tag) {
        bad(
          `unknown tag "${text.split(/\s/)[0]}" (use audit, tiny, covered:<index>, low-card, pk-join)`,
        );
      } else if (cov && !indexNames.has(cov[1] ?? "")) {
        bad(`covered:${cov[1]} names an index that does not exist`);
      } else if (
        growth &&
        (tag === "tiny" ||
          tag === "pk-join" ||
          (tag === "audit" && !col.dbName.endsWith("_by")))
      ) {
        bad(`${tag} is refused on growth table ${table.dbName} - add an index`);
      } else {
        col.exempt = true;
        exemptCounts[tag] = (exemptCounts[tag] ?? 0) + 1;
      }
    }
  }
}

function checkIndexes() {
  parseSchemas();
  checkExemptions();
  for (const table of tables.values()) {
    for (const [name, col] of table.columns) {
      if (col.exempt || col.badExempt) continue;
      if (col.isFk && !isIndexed(table, name)) {
        add(
          table.file,
          col.line,
          "idx-fk",
          `${table.dbName}.${col.dbName} is a foreign key with no index (not PK, not unique, not the leading column of an index)`,
        );
      }
    }
  }

  // Filter columns: first place each un-indexed column is filtered on.
  const seen = new Map<string, { f: Finding; uses: number }>();
  const re = /\b(eq|ne|inArray|gt|gte|lt|lte|between)\(\s*(\w+)\.(\w+)\s*,/g;
  for (const f of inDir("src/repository/")) {
    for (let m = re.exec(f.code); m; m = re.exec(f.code)) {
      const table = tables.get(m[2] ?? "");
      const colName = m[3] ?? "";
      const col = table?.columns.get(colName);
      if (!table || !col || isIndexed(table, colName)) continue;
      if (col.exempt || col.badExempt) continue;
      const key = `${table.varName}.${colName}`;
      const hit = seen.get(key);
      if (hit) {
        hit.uses += 1;
        continue;
      }
      seen.set(key, {
        uses: 1,
        f: {
          file: f.rel,
          line: lineAt(f.code, m.index),
          rule: "idx-filter",
          message: `${table.dbName}.${col.dbName} is filtered with ${m[1]}() but is not the leading column of any index`,
        },
      });
    }
  }
  for (const { f, uses } of seen.values()) {
    add(
      f.file,
      f.line,
      f.rule,
      `${f.message} (${uses} filter site${uses > 1 ? "s" : ""})`,
    );
  }
}

// ─── (b) raw ilike ──────────────────────────────────────────────────────────

function checkIlike() {
  const helperExists = existsSync(join(ROOT, SEARCH_HELPER));
  if (!helperExists) {
    const dupes = files.filter((f) => /function escapeLike\(/.test(f.code));
    add(
      SEARCH_HELPER,
      0,
      "raw-ilike",
      `shared search helper does not exist - create safeSearch() here (escapes % _ \\, caps length) and move every ilike( call into it${
        dupes.length
          ? `; local escapeLike() copies today: ${dupes.map((f) => f.rel).join(", ")}`
          : ""
      }`,
    );
  }
  for (const f of files) {
    if (f.rel === SEARCH_HELPER) continue;
    for (const m of f.code.matchAll(
      /\bfunction\s+(escapeLike|likePattern)\b|\bconst\s+(escapeLike|likePattern)\s*=/g,
    )) {
      add(
        f.rel,
        lineAt(f.code, m.index ?? 0),
        "raw-ilike",
        `local ${m[1] ?? m[2]}() copy - use safeSearch() from ${SEARCH_HELPER}`,
      );
    }
    // The word ilike inside a `sql` template (call form is caught below).
    for (const t of f.code.matchAll(/\bsql\s*`/g)) {
      const from = (t.index ?? 0) + t[0].length;
      let to = from;
      while (to < f.code.length && f.code[to] !== "`") {
        to += f.code[to] === "\\" ? 2 : 1;
      }
      for (const w of f.code.slice(from, to).matchAll(/\bilike\b/gi)) {
        add(
          f.rel,
          lineAt(f.code, from + (w.index ?? 0)),
          "raw-ilike",
          `ilike inside a sql template outside ${SEARCH_HELPER} - use safeSearchSql()`,
        );
      }
    }
    const re = /\bilike\(/g;
    for (let m = re.exec(f.code); m; m = re.exec(f.code)) {
      const close = matchClose(f.code, m.index + m[0].length - 1);
      const call = close > 0 ? f.code.slice(m.index, close + 1) : "";
      const lineStart = f.code.lastIndexOf("\n", m.index) + 1;
      // Is the pattern built with a visible escape? (`pattern` variables are looked up in the file.)
      const escaped =
        /escapeLike\(/.test(call) ||
        (/\bpattern\b/.test(call) &&
          /pattern\s*=[^;]*escapeLike\(/.test(f.code.slice(0, lineStart)));
      add(
        f.rel,
        lineAt(f.code, m.index),
        "raw-ilike",
        `raw ilike( outside ${SEARCH_HELPER}${escaped ? "" : " - and the search text is NOT escaped (% and _ act as wildcards)"}`,
      );
    }
  }
}

// ─── (c) Zod bounds on request schemas ──────────────────────────────────────

type Decl = {
  file: SourceFile;
  name: string;
  start: number;
  end: number;
};
const BOUNDED_STRING = new Set([
  "max",
  "length",
  "uuid",
  "email",
  "url",
  "datetime",
  "date",
  "time",
  "regex",
  "ip",
  "cuid",
  "cuid2",
  "ulid",
  "nanoid",
  "jwt",
  "base64",
]);
const BOUNDED_NUMBER = new Set(["max", "lte", "lt"]);
const QUANTITY_KEY =
  /(qty|quantity|amount|paise|price|rate|weight|total|percent)/i;

function checkZod() {
  const scanned = files.filter(
    (f) =>
      /^src\/(types|routes|controller|service|lib)\//.test(f.rel) &&
      f.rel !== "src/lib/env.ts",
  );

  // Top-level declarations: `const X =` / `function X` at column 0, up to the next column-0 word.
  const decls: Decl[] = [];
  const byName = new Map<string, Decl[]>();
  for (const f of scanned) {
    const re = /^(?:export\s+)?(?:const|function)\s+(\w+)/gm;
    const starts: { name: string; at: number }[] = [];
    for (let m = re.exec(f.code); m; m = re.exec(f.code)) {
      starts.push({ name: m[1] ?? "", at: m.index });
    }
    for (const s of starts) {
      const after = /\n(?=[A-Za-z])/.exec(f.code.slice(s.at + 1));
      const end = after ? s.at + 1 + after.index : f.code.length;
      const d: Decl = { file: f, name: s.name, start: s.at, end };
      decls.push(d);
      byName.set(s.name, [...(byName.get(s.name) ?? []), d]);
    }
  }
  const resolveDecl = (name: string, from: SourceFile): Decl | undefined => {
    const list = byName.get(name);
    return list?.find((d) => d.file === from) ?? list?.[0];
  };

  // Request roots: `request: { ... }` in route descriptors and `<schema>.parse(` call sites.
  const ranges: {
    file: SourceFile;
    start: number;
    end: number;
    key: string;
  }[] = [];
  const queue: Decl[] = [];
  const reached = new Set<Decl>();
  const push = (d: Decl | undefined) => {
    if (d && !reached.has(d)) {
      reached.add(d);
      queue.push(d);
    }
  };
  for (const f of scanned) {
    const reqRe = /\brequest:\s*\{/g;
    for (let m = reqRe.exec(f.code); m; m = reqRe.exec(f.code)) {
      const open = m.index + m[0].length - 1;
      const close = matchClose(f.code, open);
      if (close < 0) continue;
      ranges.push({ file: f, start: open, end: close, key: "request" });
      for (const id of f.code.slice(open, close).match(/\b[A-Za-z_]\w*\b/g) ??
        []) {
        push(resolveDecl(id, f));
      }
    }
    const parseRe = /\b(\w+)\s*\.\s*(?:safeParse|parse)(?:Async)?\(/g;
    for (let m = parseRe.exec(f.code); m; m = parseRe.exec(f.code)) {
      const d = resolveDecl(m[1] ?? "", f);
      if (d && /\bz\.|Schema\b/.test(d.file.code.slice(d.start, d.end))) {
        push(d);
      }
    }
  }
  while (queue.length > 0) {
    const d = queue.pop();
    if (!d) break;
    ranges.push({ file: d.file, start: d.start, end: d.end, key: d.name });
    const body = d.file.code.slice(d.start, d.end);
    for (const id of new Set(body.match(/\b[A-Za-z_]\w*\b/g) ?? [])) {
      if (id !== d.name) push(resolveDecl(id, d.file));
    }
  }

  const wrapperBounded = (name: string, from: SourceFile): boolean => {
    const d = resolveDecl(name, from);
    if (!d) return false;
    return /\.(max|lte|lt)\(|<=?\s*[\d\w]/.test(
      d.file.code.slice(d.start, d.end),
    );
  };

  const done = new Set<string>();
  for (const r of ranges) {
    const text = r.file.code.slice(r.start, r.end);

    const arrRe = /(?:\bz\s*\.\s*|\.\s*)array\s*\(/g;
    for (let m = arrRe.exec(text); m; m = arrRe.exec(text)) {
      const at = r.start + m.index;
      const id = `${r.file.rel}:${at}:a`;
      if (done.has(id)) continue;
      done.add(id);
      const open = at + m[0].length - 1;
      const close = matchClose(r.file.code, open);
      const chain = chainMethods(r.file.code, close < 0 ? open + 1 : close + 1);
      if (chain.methods.some((x) => x === "max" || x === "length")) continue;
      const lineStart = r.file.code.lastIndexOf("\n", at) + 1;
      const key =
        /(\w+)\??:\s*[\w.(]*$/.exec(r.file.code.slice(lineStart, at))?.[1] ??
        r.key;
      add(
        r.file.rel,
        lineAt(r.file.code, at),
        "zod-array",
        `${key}: array in a request schema has no .max()`,
      );
    }

    const strRe = /\bz\s*\.\s*(?:coerce\s*\.\s*)?string\(\)/g;
    for (let m = strRe.exec(text); m; m = strRe.exec(text)) {
      const at = r.start + m.index;
      const id = `${r.file.rel}:${at}:s`;
      if (done.has(id)) continue;
      done.add(id);
      const chain = chainMethods(r.file.code, at + m[0].length);
      if (chain.methods.some((x) => BOUNDED_STRING.has(x))) continue;
      const lineStart = r.file.code.lastIndexOf("\n", at) + 1;
      const key =
        /(\w+)\??:\s*[\w.(]*$/.exec(r.file.code.slice(lineStart, at))?.[1] ??
        r.key;
      add(
        r.file.rel,
        lineAt(r.file.code, at),
        "zod-string",
        `${key}: z.string() in a request schema has no .max() (or bounded format)`,
      );
    }

    const numRe = /\bz\s*\.\s*(?:coerce\s*\.\s*)?number\(\)/g;
    for (let m = numRe.exec(text); m; m = numRe.exec(text)) {
      const at = r.start + m.index;
      const id = `${r.file.rel}:${at}:n`;
      if (done.has(id)) continue;
      done.add(id);
      const lineStart = r.file.code.lastIndexOf("\n", at) + 1;
      const prefix = r.file.code.slice(lineStart, at);
      const key = /(\w+)\??:\s*[\w.(]*$/.exec(prefix)?.[1] ?? r.key;
      if (!QUANTITY_KEY.test(key)) continue;
      const chain = chainMethods(r.file.code, at + m[0].length);
      if (chain.methods.some((x) => BOUNDED_NUMBER.has(x))) continue;
      // A hand-written cap: `.refine((v) => v <= 1e9)`.
      if (chain.methods.includes("refine") && /<=?\s*\d/.test(chain.text)) {
        continue;
      }
      const wrapper = /(\w+)\(\s*$/.exec(prefix)?.[1];
      if (wrapper && wrapper !== "z" && wrapperBounded(wrapper, r.file)) {
        continue;
      }
      add(
        r.file.rel,
        lineAt(r.file.code, at),
        "zod-number",
        `${key}: quantity / amount number in a request schema has no upper bound (.max / .lte)`,
      );
    }
  }
  notes.push(
    `zod: ${reached.size} request-side schema declarations checked (reached from route \`request:\` blocks and .parse() call sites); response schemas are skipped.`,
  );
}

// ─── (d) unique / FK violation → 409 ────────────────────────────────────────

function checkDbErrorMapping() {
  const handler = files.find((f) => f.rel === ERROR_HANDLER);
  if (!handler) {
    add(ERROR_HANDLER, 0, "db-error-409", "error handler file not found");
    return;
  }
  // Follow `app.onError(handleAppError)`: the shared handler is a named
  // function; fall back to an inline `onError(` callback.
  const fnAt = handler.code.indexOf("function handleAppError(");
  const at = fnAt >= 0 ? fnAt : handler.code.indexOf("onError(");
  const paramsOpen = at < 0 ? -1 : handler.code.indexOf("(", at);
  const paramsClose =
    paramsOpen < 0 ? -1 : matchClose(handler.code, paramsOpen);
  const open =
    fnAt >= 0 && paramsClose >= 0
      ? handler.code.indexOf("{", paramsClose)
      : paramsOpen;
  const close = open < 0 ? -1 : matchClose(handler.code, open);
  const body = close < 0 ? "" : handler.code.slice(at, close);
  const line = at < 0 ? 0 : lineAt(handler.code, at);
  const has409 = /\b409\b|ConflictError/.test(body);
  const unique = /23505|isUniqueViolation/.test(body) && has409;
  const fk = /23503|isForeignKeyViolation|isFkViolation/.test(body) && has409;
  if (!unique) {
    const local = files.filter(
      (f) =>
        f.rel !== "src/lib/db-errors.ts" && /isUniqueViolation\(/.test(f.code),
    );
    add(
      ERROR_HANDLER,
      line,
      "db-error-409",
      `onError does not map Postgres unique violation 23505 to HTTP 409 (falls through to 500); ${local.length} file(s) catch it by hand with isUniqueViolation()`,
    );
  }
  if (!fk) {
    const helper = files.some((f) => /23503/.test(f.code));
    add(
      ERROR_HANDLER,
      line,
      "db-error-409",
      `onError does not map Postgres FK violation 23503 to HTTP 409${helper ? "" : "; no 23503 helper exists anywhere in src/ (add isForeignKeyViolation to src/lib/db-errors.ts)"}`,
    );
  }
  notes.push(
    `db-error-409: unique 23505 -> 409 in shared handler: ${unique ? "yes" : "NO"}; FK 23503 -> 409: ${fk ? "yes" : "NO"}.`,
  );
}

// ─── (e) IST day rule ───────────────────────────────────────────────────────

function checkDates() {
  const patterns: { re: RegExp; what: string }[] = [
    {
      re: /toISOString\(\)\s*\.\s*(?:slice|substring|substr)\(\s*0\s*,\s*10\s*\)/g,
      what: "toISOString().slice(0, 10) gives the UTC day",
    },
    {
      re: /toISOString\(\)\s*\.\s*split\(\s*["'`]T["'`]\s*\)/g,
      what: 'toISOString().split("T") gives the UTC day',
    },
    {
      re: /\.set(?:UTC)?Hours\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/g,
      what: "setHours(0, 0, 0, 0) gives server-local / UTC midnight",
    },
    {
      re: /new Date\(\)\s*\.\s*(?:toLocaleDateString|toDateString|getDate|getUTCDate)\(/g,
      what: "calendar day read from new Date() in server time",
    },
  ];
  for (const f of files) {
    if (f.rel === IST_HELPER) continue;
    for (const p of patterns) {
      p.re.lastIndex = 0;
      for (let m = p.re.exec(f.code); m; m = p.re.exec(f.code)) {
        add(
          f.rel,
          lineAt(f.code, m.index),
          "ist-date",
          `${p.what} - use istDayKey() / istDayStart() from ${IST_HELPER}`,
        );
      }
    }
  }
}

// ─── run + report ───────────────────────────────────────────────────────────

checkIndexes();
checkIlike();
checkZod();
checkDbErrorMapping();
checkDates();

const RULES = [
  "idx-fk",
  "idx-filter",
  "raw-ilike",
  "zod-string",
  "zod-number",
  "zod-array",
  "db-error-409",
  "ist-date",
];

console.log(
  `backend standards-check (${strictAll ? "strict" : strict ? `strict: ${[...strictRules].join(",")}` : "report"} mode) - ${findings.length} finding(s)\n`,
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
    `${rule.padEnd(14)} ${findings.filter((f) => f.rule === rule).length}`,
  );
}
console.log(`${"total".padEnd(14)} ${findings.length}`);
{
  const total = Object.values(exemptCounts).reduce((a, b) => a + b, 0);
  console.log(
    `\nexempt: ${total} (${["audit", "covered", "tiny", "low-card", "pk-join"]
      .map((t) => `${t} ${exemptCounts[t] ?? 0}`)
      .join(", ")})`,
  );
}

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
