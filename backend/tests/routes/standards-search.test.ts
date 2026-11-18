/**
 * docs/specs/api-standards/spec.md (v1) "Search"
 * BR-STD-08 % _ \ match themselves   BR-STD-09 case-insensitive "contains"   BR-STD-10 empty term = no filter
 * BR-STD-11 term max 100 after trim  BR-STD-12 supplier columns unchanged    BR-STD-37 pattern is bound
 * BR-STD-38 one character = no filter
 * (BR-STD-07 is checked by the standards-check rule raw-ilike, not here.)
 *
 * HTTP-level through createApp(), real DB. Written by test-writer from the spec only.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray, like } from "drizzle-orm";
import { createApp } from "../../src/app";
import { db } from "../../src/db/client";
import { documentNumberCounters, roles } from "../../src/db/schemas/01_auth";
import { itemMaster } from "../../src/db/schemas/02_procurement-catalog";
import {
  purchaseRequestItems,
  purchaseRequests,
} from "../../src/db/schemas/02_procurement-purchasing";
import {
  supplierItems,
  supplierMaster,
} from "../../src/db/schemas/02_procurement-suppliers";
import { employees } from "../../src/db/schemas/03_hcm";
import { signAccessToken } from "../../src/lib/token";

const app = createApp();
const RUN = Date.now();
const TAG = `TEST_stdsearch_${RUN}`;
const EMAIL = `test_stdsearch_${RUN}@diecast.test`;
const digits = String(RUN % 10000).padStart(4, "0");
const GSTIN = `27ABCDE${digits}F1Z5`;

let actorId: number;
let token: string;
const itemIds: Record<string, number> = {};
let supplierId: number;
const prIds: number[] = [];

// biome-ignore lint/suspicious/noExplicitAny: loose JSON in test responses
type Json = any;
async function call(method: string, path: string, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: res.status,
    json: (await res.json().catch(() => null)) as Json,
  };
}
const enc = encodeURIComponent;
const itemList = (q: string) =>
  call("GET", `/api/asset/items?pageSize=100&q=${enc(q)}`);
const names = (json: Json): string[] =>
  (json.data as { name: string }[]).map((r) => r.name);

async function mkItem(key: string, name: string) {
  const r = await call("POST", "/api/asset/items", {
    sku: `${TAG}_${key}`,
    name,
    category: "Raw Material",
    uom: "kg",
    standardRatePaise: 100,
  });
  if (r.status !== 201) throw new Error(`Fixture item ${key}: ${r.status}`);
  itemIds[key] = r.json.data.id;
}

beforeAll(async () => {
  const [sa] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, "super-admin"));
  if (!sa) throw new Error("Fixture setup: super-admin missing");
  const [e] = await db
    .insert(employees)
    .values({ name: TAG, email: EMAIL, roleId: sa.id, isActive: true })
    .returning({ id: employees.id });
  if (!e) throw new Error("Fixture setup: employee");
  actorId = e.id;
  token = await signAccessToken({
    userId: actorId,
    userName: TAG,
    role: "super-admin",
    allowedPages: [],
  });

  await mkItem("pct", `${TAG} 50% flux`);
  await mkItem("plain", `${TAG} 500 flux`);
  await mkItem("bs", `${TAG} a\\b slag`);
  await mkItem("ad", `${TAG} adx`);

  const s = await call("POST", "/api/supplier/createSupplier", {
    name: `Hindalco ${TAG}`,
    type: "raw_material",
    gstNumber: GSTIN,
    contactPerson: `Contact${digits}Person`,
    email: `sales${digits}@hindalco-${RUN}.test`,
    phone: `99${digits}${digits}`,
    defaultPaymentTermsDays: 30,
    supplierItems: [
      {
        itemId: itemIds.pct,
        supplierSku: `SUPSKU${digits}X`,
        supplierUnitPricePaise: 1000,
        uom: "kg",
      },
    ],
  });
  if (s.status !== 201) throw new Error(`Fixture supplier: ${s.status}`);
  supplierId = s.json.data.id;

  const pr = await call("POST", "/api/pr/createpr", {
    type: "misc",
    notes: `${TAG} note`,
    items: [{ itemId: itemIds.pct, requestedQty: 1 }],
  });
  if (pr.status !== 201) throw new Error(`Fixture PR: ${pr.status}`);
  prIds.push(pr.json.data.pr.id);
});

afterAll(async () => {
  if (prIds.length) {
    await db
      .delete(purchaseRequestItems)
      .where(inArray(purchaseRequestItems.prId, prIds));
    await db
      .delete(purchaseRequests)
      .where(inArray(purchaseRequests.id, prIds));
  }
  await db
    .delete(supplierItems)
    .where(eq(supplierItems.supplierId, supplierId));
  await db.delete(supplierMaster).where(eq(supplierMaster.id, supplierId));
  await db.delete(itemMaster).where(like(itemMaster.sku, `${TAG}%`));
  await db
    .update(documentNumberCounters)
    .set({ createdBy: null })
    .where(eq(documentNumberCounters.createdBy, actorId));
  await db
    .update(documentNumberCounters)
    .set({ lastUpdatedBy: null })
    .where(eq(documentNumberCounters.lastUpdatedBy, actorId));
  await db.delete(employees).where(eq(employees.id, actorId));
});

describe("BR-STD-08 % _ and \\ match themselves", () => {
  test("BR-STD-08 q=50% finds only the item holding '50%'", async () => {
    const r = await itemList("50%");
    expect(r.status).toBe(200);
    const n = names(r.json);
    expect(n).toContain(`${TAG} 50% flux`);
    expect(n).not.toContain(`${TAG} 500 flux`);
  });

  test("BR-STD-08 q=__ matches no name without a double underscore", async () => {
    const r = await itemList("__");
    expect(r.status).toBe(200);
    expect(names(r.json).filter((x) => x.startsWith(TAG))).toEqual([]);
  });

  test("BR-STD-08 q=a\\b finds only the name holding a\\b, no SQL error", async () => {
    const r = await itemList("a\\b");
    expect(r.status).toBe(200);
    const mine = names(r.json).filter((x) => x.startsWith(TAG));
    expect(mine).toEqual([`${TAG} a\\b slag`]);
  });

  test("BR-STD-08 PR list q=dr_ft matches nothing (underscore is not a wildcard)", async () => {
    const r = await call("GET", `/api/pr/getprs?q=${enc("dr_ft")}`);
    expect(r.status).toBe(200);
    expect(r.json.meta.total).toBe(0);
  });

  test("BR-STD-08 PR list q=dr%25ft matches nothing (percent is not a wildcard)", async () => {
    const r = await call("GET", `/api/pr/getprs?q=${enc("dr%ft")}`);
    expect(r.status).toBe(200);
    expect(r.json.meta.total).toBe(0);
  });
});

describe("BR-STD-09 case-insensitive, any part of the text", () => {
  test("BR-STD-09 q=hind and q=ALCO both find the supplier 'Hindalco'", async () => {
    for (const q of ["hind", "ALCO"]) {
      const r = await call(
        "GET",
        `/api/supplier/listSuppliers?pageSize=100&q=${enc(q)}`,
      );
      expect(r.status).toBe(200);
      expect((r.json.data as { name: string }[]).map((s) => s.name)).toContain(
        `Hindalco ${TAG}`,
      );
    }
  });
});

describe("BR-STD-10 empty or spaces-only term means no filter", () => {
  test("BR-STD-10 PR list q= and q=%20%20 return the same rows as no q", async () => {
    const base = await call("GET", "/api/pr/getprs?pageSize=100");
    const empty = await call("GET", "/api/pr/getprs?pageSize=100&q=");
    const spaces = await call("GET", "/api/pr/getprs?pageSize=100&q=%20%20");
    expect(empty.status).toBe(200);
    expect(spaces.status).toBe(200);
    expect(empty.json.meta.total).toBe(base.json.meta.total);
    expect(spaces.json.meta.total).toBe(base.json.meta.total);
  });

  test("BR-STD-10 item list q=%20%20 returns the same rows as no q", async () => {
    const base = await call("GET", "/api/asset/items?pageSize=100");
    const spaces = await itemList("   ");
    expect(spaces.status).toBe(200);
    expect(spaces.json.meta.total).toBe(base.json.meta.total);
  });

  test("BR-STD-10 employee name picker keeps its required term: empty q -> 400", async () => {
    const r = await call("GET", "/api/setup/employees/search?q=");
    expect(r.status).toBe(400);
  });
});

describe("BR-STD-11 term longer than 100 characters is refused", () => {
  test("BR-STD-11 100 characters -> 200, 101 -> 400 (item list)", async () => {
    expect((await itemList("a".repeat(100))).status).toBe(200);
    expect((await itemList("a".repeat(101))).status).toBe(400);
  });

  test("BR-STD-11 99 characters with spaces at both ends is trimmed first -> 200", async () => {
    expect((await itemList(`  ${"a".repeat(99)}   `)).status).toBe(200);
  });

  test("BR-STD-11 101 characters -> 400 on the PR and supplier lists too", async () => {
    const long = "b".repeat(101);
    expect((await call("GET", `/api/pr/getprs?q=${long}`)).status).toBe(400);
    expect(
      (await call("GET", `/api/supplier/listSuppliers?q=${long}`)).status,
    ).toBe(400);
  });
});

describe("BR-STD-12 supplier search still covers all six columns", () => {
  const cases: [string, () => string][] = [
    ["name", () => `Hindalco ${TAG}`],
    ["contact person", () => `Contact${digits}Person`],
    ["email", () => `sales${digits}@hindalco-${RUN}`],
    ["phone", () => `99${digits}${digits}`],
    ["GSTIN", () => GSTIN],
    ["supplied item SKU", () => `${TAG}_pct`],
  ];
  for (const [label, term] of cases) {
    test(`BR-STD-12 supplier q matches ${label}`, async () => {
      const r = await call(
        "GET",
        `/api/supplier/listSuppliers?pageSize=100&q=${enc(term())}`,
      );
      expect(r.status).toBe(200);
      expect((r.json.data as { id: number }[]).map((s) => s.id)).toContain(
        supplierId,
      );
    });
  }
});

describe("BR-STD-37 the pattern is a bound parameter", () => {
  test("BR-STD-37 q=x' OR '1'='1 on the supplier list -> 200 with 0 rows, no SQL error", async () => {
    const r = await call(
      "GET",
      `/api/supplier/listSuppliers?q=${enc("x' OR '1'='1")}`,
    );
    expect(r.status).toBe(200);
    expect(r.json.meta.total).toBe(0);
  });
});

describe("BR-STD-38 a one-character term is no filter", () => {
  test("BR-STD-38 item list q=a -> same rows as no q; q=ad -> narrowed", async () => {
    const base = await call("GET", "/api/asset/items?pageSize=100");
    const one = await itemList("a");
    expect(one.status).toBe(200);
    expect(one.json.meta.total).toBe(base.json.meta.total);
    expect(names(one.json)).toContain(`${TAG} 500 flux`);

    const two = await itemList("ad");
    expect(two.status).toBe(200);
    const n = names(two.json);
    expect(n).toContain(`${TAG} adx`);
    expect(n).not.toContain(`${TAG} 500 flux`);
  });
});
