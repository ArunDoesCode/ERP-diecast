/**
 * docs/specs/api-standards/spec.md (v1)
 * BR-STD-10 empty term = no filter   BR-STD-38 one character = no filter
 * Covers every list that takes the shared search term (design/api.md "Search", 13 lists).
 * The item list already has its own cases in standards-search.test.ts.
 * Written by test-writer from the spec only.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createApp } from "../../src/app";
import { db } from "../../src/db/client";
import { documentNumberCounters, roles } from "../../src/db/schemas/01_auth";
import { supplierMaster } from "../../src/db/schemas/02_procurement-suppliers";
import { employees } from "../../src/db/schemas/03_hcm";
import { signAccessToken } from "../../src/lib/token";

const app = createApp();
const RUN = Date.now();
const TAG = `TEST_stdshort_${RUN}`;
const EMAIL = `test_stdshort_${RUN}@diecast.test`;

let actorId: number;
let token: string;
let bareSupplierId: number;

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
  // A supplier with NO price-list item: it must stay visible for a 1-character q.
  const s = await call("POST", "/api/supplier/createSupplier", {
    name: `Bare ${TAG}`,
    type: "raw_material",
    defaultPaymentTermsDays: 30,
  });
  if (s.status !== 201) throw new Error(`Fixture supplier: ${s.status}`);
  bareSupplierId = s.json.data.id;
});

afterAll(async () => {
  await db.delete(supplierMaster).where(eq(supplierMaster.id, bareSupplierId));
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

const lists: [string, () => string][] = [
  ["approval policy list", () => "/api/approval/getPolicies"],
  ["asset service list", () => "/api/asset/services"],
  ["asset location list", () => "/api/asset/locations"],
  ["asset stock list", () => "/api/asset/inventory/stock"],
  ["asset machine list", () => "/api/asset/machines"],
  ["GRN list", () => "/api/grn/getgrns"],
  ["PO list", () => "/api/po/getpos"],
  ["PR list", () => "/api/pr/getprs"],
  ["subcontracting order list", () => "/api/sco/getscos"],
  ["supplier list", () => "/api/supplier/listSuppliers"],
  [
    "supplier service list",
    () => `/api/supplier/${bareSupplierId}/listServices`,
  ],
  ["supplier item list", () => `/api/supplier/${bareSupplierId}/listItems`],
];

describe("BR-STD-10 / BR-STD-38 empty or 1-character q is no filter", () => {
  for (const [label, path] of lists) {
    for (const [kind, q] of [
      ["q= (empty)", ""],
      ["q=a (1 character)", "a"],
    ] as const) {
      test(`BR-STD-10/38 ${label} ${kind} -> 200, same total as no q`, async () => {
        const base = await call("GET", `${path()}?pageSize=100`);
        expect(base.status).toBe(200);
        const r = await call("GET", `${path()}?pageSize=100&q=${enc(q)}`);
        expect(r.status).toBe(200);
        expect(r.json.meta.total).toBe(base.json.meta.total);
      });
    }
  }

  test("BR-STD-38 supplier list q=a still shows a supplier with no price-list item", async () => {
    const base = await call("GET", "/api/supplier/listSuppliers?pageSize=100");
    const one = await call(
      "GET",
      "/api/supplier/listSuppliers?pageSize=100&q=a",
    );
    expect(one.status).toBe(200);
    expect(one.json.meta.total).toBe(base.json.meta.total);
    if (base.json.meta.total <= 100) {
      const ids = (one.json.data as { id: number }[]).map((s) => s.id);
      expect(ids).toContain(bareSupplierId);
    }
  });

  test("BR-STD-10 supplier list q= shows the supplier with no price-list item", async () => {
    const r = await call("GET", "/api/supplier/listSuppliers?pageSize=100&q=");
    expect(r.status).toBe(200);
    if (r.json.meta.total <= 100) {
      const ids = (r.json.data as { id: number }[]).map((s) => s.id);
      expect(ids).toContain(bareSupplierId);
    }
  });
});
