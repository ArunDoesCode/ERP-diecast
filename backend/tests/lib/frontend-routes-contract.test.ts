import { describe, expect, test } from "bun:test";
import path from "node:path";

import "../../src/routes/index";
import { getRegistry } from "../../src/lib/route-registry";

/**
 * Contract drift check (BL-008): every path the frontend can call in
 * `frontend/src/lib/api/routes.ts` must exist in the backend route registry.
 * Path-only — `API_ROUTES` carries no HTTP method. Function entries are called
 * with a placeholder for each parameter and matched against `:param` segments.
 */
const PLACEHOLDER = "__param__";

/** Known, backlogged mismatches (`key -> path`): backlog id. Never add without a BL item. */
const KNOWN_GAPS: Record<string, string> = {
  "purchaseRequisitions.remove -> /pr/deletepr": "BL-001",
};

type RouteTree = {
  [key: string]: string | RouteTree | ((...args: never[]) => string);
};

function collectPaths(tree: RouteTree, prefix: string[] = []) {
  const out: { key: string; path: string }[] = [];
  for (const [name, value] of Object.entries(tree)) {
    const key = [...prefix, name].join(".");
    if (typeof value === "string") {
      out.push({ key, path: value });
    } else if (typeof value === "function") {
      const args = Array.from({ length: value.length }, () => PLACEHOLDER);
      out.push({ key, path: (value as (...a: string[]) => string)(...args) });
    } else {
      out.push(...collectPaths(value, [...prefix, name]));
    }
  }
  return out;
}

function toMatcher(backendPath: string) {
  const pattern = backendPath
    .split("/")
    .map((segment) =>
      segment.startsWith(":")
        ? "[^/]+"
        : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    )
    .join("/");
  return new RegExp(`^${pattern}$`);
}

describe("frontend API_ROUTES exist in the backend contract (BL-008)", () => {
  test("every frontend path matches a registered backend route", async () => {
    // Dynamic import keeps the frontend file out of the backend tsc program.
    const routesFile = path.resolve(
      import.meta.dir,
      "../../../frontend/src/lib/api/routes.ts",
    );
    const { API_ROUTES } = (await import(routesFile)) as {
      API_ROUTES: RouteTree;
    };

    const matchers = getRegistry().map((d) => toMatcher(d.path));
    const frontendPaths = collectPaths(API_ROUTES);
    expect(frontendPaths.length).toBeGreaterThan(0);

    const missing = frontendPaths
      .filter(({ path: p }) => {
        const full = `/api${p.split("?")[0]}`;
        return !matchers.some((m) => m.test(full));
      })
      .map(({ key, path: p }) => `${key} -> ${p}`);

    const unexpected = missing.filter((entry) => !(entry in KNOWN_GAPS));
    expect(unexpected).toEqual([]);

    // A fixed gap should be removed from KNOWN_GAPS; warn rather than fail so a
    // fix landing on another branch doesn't turn this test red.
    for (const gap of Object.keys(KNOWN_GAPS)) {
      if (!missing.includes(gap)) {
        console.warn(`KNOWN_GAPS entry is fixed, remove it: ${gap}`);
      }
    }
  });
});
