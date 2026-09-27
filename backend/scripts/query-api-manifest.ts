/**
 * Reads `.contracts/api-manifest.json` and either prints the full descriptor
 * for an exact route id (`METHOD /path`) or a compact search-result list for
 * a free-text query matched against path/summary/tags.
 *
 * Usage: `bun run contract:query "<route id or search text>"`.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

type ManifestRoute = {
  id: string;
  method: string;
  path: string;
  tags: string[];
  summary: string;
  [key: string]: unknown;
};

type Manifest = {
  version: string;
  baseUrl: string;
  errorEnvelope: unknown;
  routes: ManifestRoute[];
};

async function loadManifest(): Promise<Manifest> {
  const manifestPath = path.resolve(
    import.meta.dir,
    "..",
    ".contracts",
    "api-manifest.json",
  );

  try {
    const raw = await readFile(manifestPath, "utf-8");
    return JSON.parse(raw) as Manifest;
  } catch {
    console.error("Manifest not found. Run: bun run contract:generate");
    process.exit(1);
  }
}

function printUsage() {
  console.log(
    [
      'Usage: bun run contract:query "<route id or search text>"',
      '  Exact route id:  bun run contract:query "GET /api/asset/machines"',
      '  Free-text search: bun run contract:query "purchase order"',
    ].join("\n"),
  );
}

async function main() {
  const query = process.argv[2];

  if (!query) {
    printUsage();
    return;
  }

  const manifest = await loadManifest();
  const normalizedQuery = query.trim().toLowerCase();

  const exactMatch = manifest.routes.find(
    (route) => route.id.toLowerCase() === normalizedQuery,
  );

  if (exactMatch) {
    console.log(JSON.stringify(exactMatch, null, 2));
    return;
  }

  const matches = manifest.routes.filter((route) => {
    const haystack =
      `${route.path} ${route.summary} ${route.tags.join(" ")}`.toLowerCase();
    return haystack.includes(normalizedQuery);
  });

  if (matches.length === 0) {
    console.log(`No routes matched "${query}".`);
    return;
  }

  console.log(
    JSON.stringify(
      matches.map((route) => ({ id: route.id, summary: route.summary })),
      null,
      2,
    ),
  );
}

main();
