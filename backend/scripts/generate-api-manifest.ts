/**
 * Walks the route registry (populated as an import side effect of
 * `mainRouter`) and emits a compact, queryable API contract manifest to
 * `.contracts/api-manifest.json` at the repo root.
 *
 * Usage: `bun run contract:generate` (see package.json).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ZodType } from "zod";
import { z } from "zod";

import { getRegistry } from "../src/lib/route-registry";
import "../src/routes/index";

// ─── JSON Schema → compact type flattener ──────────────────────────────────

type JsonSchemaNode = Record<string, unknown>;
type Compact = string | Record<string, unknown>;

function suffix(required: boolean): string {
  return required ? ".required" : ".optional";
}

function isNullableAnyOf(node: JsonSchemaNode): JsonSchemaNode | undefined {
  const anyOf = node.anyOf;
  if (!Array.isArray(anyOf) || anyOf.length !== 2) {
    return undefined;
  }
  const nullBranch = anyOf.find(
    (branch): branch is JsonSchemaNode =>
      typeof branch === "object" &&
      branch !== null &&
      (branch as JsonSchemaNode).type === "null",
  );
  const otherBranch = anyOf.find(
    (branch): branch is JsonSchemaNode =>
      typeof branch === "object" &&
      branch !== null &&
      (branch as JsonSchemaNode).type !== "null",
  );
  if (nullBranch && otherBranch) {
    return otherBranch;
  }
  return undefined;
}

function compactType(node: unknown, required: boolean): Compact {
  if (node === undefined || node === null || typeof node !== "object") {
    return `unknown${suffix(required)}`;
  }

  const schema = node as JsonSchemaNode;

  // Nullable field: zod v4 emits `anyOf: [{...actual}, {type:"null"}]`.
  const nullableBranch = isNullableAnyOf(schema);
  if (nullableBranch) {
    const inner = compactType(nullableBranch, true);
    if (typeof inner === "string") {
      return inner.replace(/\.required$/, `.nullable${suffix(required)}`);
    }
    return inner;
  }

  if (Array.isArray(schema.enum)) {
    return `enum:${schema.enum.join(",")}${suffix(required)}`;
  }

  if (Array.isArray(schema.anyOf) || Array.isArray(schema.oneOf)) {
    const branches = (schema.anyOf ?? schema.oneOf) as unknown[];
    const compactBranches = branches.map((branch) => compactType(branch, true));
    return `union<${compactBranches.join("|")}>${suffix(required)}`;
  }

  if (schema.type === "object") {
    const properties = (schema.properties ?? {}) as Record<string, unknown>;
    const requiredFields = new Set(
      Array.isArray(schema.required) ? (schema.required as string[]) : [],
    );
    const result: Record<string, unknown> = {};
    for (const [key, propSchema] of Object.entries(properties)) {
      result[key] = compactType(propSchema, requiredFields.has(key));
    }
    return result;
  }

  if (schema.type === "array") {
    const itemsCompact = compactType(schema.items, true);
    const itemsLabel =
      typeof itemsCompact === "string"
        ? itemsCompact.replace(/\.(required|optional)$/, "")
        : "object";
    return `array<${itemsLabel}>${suffix(required)}`;
  }

  if (schema.type === "string") {
    const modifiers: string[] = [];
    if (typeof schema.format === "string") {
      modifiers.push(schema.format);
    }
    if (typeof schema.minLength === "number" && schema.minLength > 0) {
      modifiers.push("nonempty");
    }
    return `string${modifiers.length > 0 ? `.${modifiers.join(".")}` : ""}${suffix(required)}`;
  }

  if (schema.type === "integer" || schema.type === "number") {
    const modifiers: string[] = [];
    const min = schema.minimum ?? schema.exclusiveMinimum;
    if (typeof min === "number" && min >= 0) {
      modifiers.push(
        typeof schema.exclusiveMinimum === "number"
          ? "positive"
          : "nonnegative",
      );
    }
    return `${schema.type}${modifiers.length > 0 ? `.${modifiers.join(".")}` : ""}${suffix(required)}`;
  }

  if (schema.type === "boolean") {
    return `boolean${suffix(required)}`;
  }

  if (schema.type === "null") {
    return `null${suffix(required)}`;
  }

  // No `type` key at all — zod v4 emits an empty `{}` for unrepresentable
  // types (e.g. z.date()/coerce.date() with unrepresentable:"any").
  if (Object.keys(schema).length === 0) {
    return `unrepresentable${suffix(required)}`;
  }

  return `unknown${suffix(required)}`;
}

function toCompactSchema(schema: ZodType | undefined): Compact | undefined {
  if (!schema) {
    return undefined;
  }
  const jsonSchema = z.toJSONSchema(schema, { unrepresentable: "any" });
  return compactType(jsonSchema, true);
}

// ─── Manifest assembly ──────────────────────────────────────────────────────

async function main() {
  const registry = getRegistry();

  const routes = registry.map((descriptor) => ({
    id: `${descriptor.method} ${descriptor.path}`,
    method: descriptor.method,
    path: descriptor.path,
    tags: descriptor.tags,
    summary: descriptor.summary,
    auth: descriptor.auth,
    request: {
      query: toCompactSchema(descriptor.request?.query),
      body: toCompactSchema(descriptor.request?.body),
      params: toCompactSchema(descriptor.request?.params),
    },
    responses: Object.fromEntries(
      Object.entries(descriptor.responses).map(([status, schema]) => [
        status,
        toCompactSchema(schema),
      ]),
    ),
    pagination: descriptor.pagination,
    notes: descriptor.notes,
  }));

  const manifest = {
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    baseUrl: "/api",
    errorEnvelope: {
      success: false,
      message: "string",
      code: "string.optional",
    },
    routes,
  };

  const outDir = path.resolve(import.meta.dir, "..", ".contracts");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "api-manifest.json");
  await writeFile(outPath, JSON.stringify(manifest, null, 2));

  console.log(
    `Wrote ${routes.length} route descriptors to ${path.relative(process.cwd(), outPath)}`,
  );
}

main().catch((error) => {
  console.error("Failed to generate API manifest:", error);
  process.exit(1);
});
