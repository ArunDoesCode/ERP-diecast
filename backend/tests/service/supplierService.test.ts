/**
 * Supplier tests (docs/specs/suppliers.md v1): BR-SUP-01..25.
 * Real DB, full HTTP stack via createApp(). Fixtures are TEST_sup_ prefixed
 * and removed in afterAll.
 * Not covered here (PO code, other module): BR-SUP-06 PO copies terms,
 * BR-SUP-07 new PO/SCO for an inactive supplier, BR-SUP-16 po_history and
 * pr_estimate sources.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, ilike, inArray } from "drizzle-orm";
import { createApp } from "../../src/app";
import { db } from "../../src/db/client";
import { roles } from "../../src/db/schemas/01_auth";
import {
  itemMaster,
  serviceMaster,
} from "../../src/db/schemas/02_procurement-catalog";
import {
  supplierHistory,
  supplierItems,
  supplierMaster,
  supplierServices,
} from "../../src/db/schemas/02_procurement-suppliers";
import { employees } from "../../src/db/schemas/03_hcm";
import { signAccessToken } from "../../src/lib/token";

// Seed role names (test data), used to pick which real employee makes the call.
type Role =
  | "owner"
  | "back_office"
  | "floor_supervisor"
  | "qa_inspector"
  | "die_designer"
  | "operator"
  | "super-admin";

const app = createApp();
const RUN = `TEST_sup_${Date.now()}`;
let seq = 0;
const uid = () => `${RUN}_${++seq}`;
let actor = 0;
// The caller's role is read from the employee row (BR-AUTH-12), never from the
// token: each role gets its own real employee on first use. The owner's is actorId.
const roleUsers = new Map<string, number>();
async function userFor(role: string): Promise<number> {
  let id = roleUsers.get(role);
  if (!id) {
    const [r] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, role))
      .limit(1);
    if (!r) throw new Error(`seed role ${role} missing`);
    const [e] = await db
      .insert(employees)
      .values({ name: `${RUN}_u_${role}`, roleId: r.id, isActive: true })
      .returning({ id: employees.id });
    id = e!.id;
    roleUsers.set(role, id);
  }
  return id;
}

const tokens = new Map<string, string>();
async function tokenFor(role: Role) {
  let t = tokens.get(role);
  if (!t) {
    t = await signAccessToken({
      userId: role === "owner" ? actor : await userFor(role),
      userName: `${RUN}_${role}`,
      role,
      allowedPages: [],
    });
    tokens.set(role, t);
  }
  return t;
}
async function callAt(
  base: string,
  method: string,
  path: string,
  role: Role,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const res = await app.request(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await tokenFor(role)}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}
const call = (method: string, path: string, role: Role, body?: unknown) =>
  callAt("/api/supplier", method, path, role, body);
const bo = (method: string, path: string, body?: unknown) =>
  call(method, path, "back_office", body);
// Contract: data = supplier row. Tolerate {supplier} wrapper so other rules stay testable;
// the wrapper itself is asserted in one dedicated test.
const sup = (d: any) => (d?.supplier ?? d) as Record<string, any>;
const msgOf = (j: any) => String(j?.message ?? j?.error?.message ?? "");

const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const rl = () => LETTERS[Math.floor(Math.random() * LETTERS.length)]!;
const rd = () => String(Math.floor(Math.random() * 10));
function newPan() {
  return `${rl()}${rl()}${rl()}${rl()}${rl()}${rd()}${rd()}${rd()}${rd()}${rl()}`;
}
function newGstin(pan = newPan()) {
  return `27${pan}1Z5`;
}

async function mkSupplier(over: Record<string, unknown> = {}) {
  const r = await bo("POST", "/createSupplier", { name: uid(), ...over });
  if (r.status !== 201) {
    throw new Error(
      `fixture supplier failed: ${r.status} ${JSON.stringify(r.json)}`,
    );
  }
  return sup(r.json.data);
}
async function mkItem(over: Record<string, unknown> = {}) {
  const [row] = await db
    .insert(itemMaster)
    .values({
      sku: uid(),
      name: `${RUN} item`,
      category: "Raw Material",
      uom: "kg",
      standardRatePaise: 24000,
      ...over,
    } as any)
    .returning();
  return row!;
}
async function mkService(over: Record<string, unknown> = {}) {
  const [row] = await db
    .insert(serviceMaster)
    .values({
      code: uid(),
      name: `${RUN} svc`,
      defaultUom: "pcs",
      ...over,
    } as any)
    .returning();
  return row!;
}
const addItem = (
  supplierId: number,
  itemId: number,
  over: Record<string, unknown> = {},
) =>
  bo("POST", `/${supplierId}/createItem`, {
    itemId,
    supplierUnitPricePaise: 24500,
    uom: "kg",
    ...over,
  });
const history = async (supplierId: number) =>
  db
    .select()
    .from(supplierHistory)
    .where(eq(supplierHistory.supplierId, supplierId));

beforeAll(async () => {
  const [ownerRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, "owner"))
    .limit(1);
  const [a] = await db
    .insert(employees)
    .values({ name: `${RUN}_actor`, roleId: ownerRole!.id, isActive: true })
    .returning({ id: employees.id });
  actor = a!.id;
});

afterAll(async () => {
  const sups = await db
    .select({ id: supplierMaster.id })
    .from(supplierMaster)
    .where(ilike(supplierMaster.name, `%${RUN}%`));
  const ids = sups.map((s) => s.id);
  if (ids.length) {
    await db
      .delete(supplierHistory)
      .where(inArray(supplierHistory.supplierId, ids));
    await db
      .delete(supplierItems)
      .where(inArray(supplierItems.supplierId, ids));
    await db
      .delete(supplierServices)
      .where(inArray(supplierServices.supplierId, ids));
    await db.delete(supplierMaster).where(inArray(supplierMaster.id, ids));
  }
  await db.delete(itemMaster).where(ilike(itemMaster.sku, `${RUN}%`));
  await db.delete(serviceMaster).where(ilike(serviceMaster.code, `${RUN}%`));
  await db
    .delete(employees)
    .where(inArray(employees.id, [actor, ...roleUsers.values()]));
});

describe("contract shape", () => {
  test("contract: createSupplier 201 data is the supplier row (not wrapped)", async () => {
    const r = await bo("POST", "/createSupplier", { name: uid() });
    expect(r.status).toBe(201);
    expect(typeof r.json.data.id).toBe("number");
    expect(r.json.data.supplier).toBeUndefined();
  });
});

describe("BR-SUP-01 name", () => {
  test("BR-SUP-01 blank name is 400", async () => {
    expect((await bo("POST", "/createSupplier", { name: "   " })).status).toBe(
      400,
    );
  });
  test("BR-SUP-01 duplicate name ignoring case and spaces is 409 with fixed message", async () => {
    const n = uid();
    await mkSupplier({ name: ` ${n} ` });
    const r = await bo("POST", "/createSupplier", { name: n.toLowerCase() });
    expect(r.status).toBe(409);
    expect(msgOf(r.json)).toBe(
      "Supplier name already exists, use a different name",
    );
    expect(
      (await bo("POST", "/createSupplier", { name: `${n}_2` })).status,
    ).toBe(201);
  });
  test("BR-SUP-01 rename to another supplier's name is 409", async () => {
    const a = await mkSupplier();
    const b = await mkSupplier();
    const r = await bo("PATCH", `/updateSupplier/${b.id}`, {
      mode: "master",
      name: ` ${String(a.name).toUpperCase()}`,
    });
    expect(r.status).toBe(409);
  });
});

describe("BR-SUP-02..04 tax ids", () => {
  test("BR-SUP-02 GSTIN saved in capitals; blank GSTIN saved as none", async () => {
    const g = newGstin();
    const s = await mkSupplier({ gstNumber: g.toLowerCase() });
    expect(s.gstNumber).toBe(g);
    const s2 = await mkSupplier({ gstNumber: "" });
    expect(s2.gstNumber).toBeNull();
  });
  test("BR-SUP-02 invalid GSTIN is 400", async () => {
    expect(
      (await bo("POST", "/createSupplier", { name: uid(), gstNumber: "27ABC" }))
        .status,
    ).toBe(400);
  });
  test("BR-SUP-03 duplicate GSTIN ignoring case is 409", async () => {
    const g = newGstin();
    await mkSupplier({ gstNumber: g });
    const r = await bo("POST", "/createSupplier", {
      name: uid(),
      gstNumber: g.toLowerCase(),
    });
    expect(r.status).toBe(409);
    expect(msgOf(r.json)).toBe("Supplier GST number already exists");
  });
  test("BR-SUP-04 blank PAN is filled from GSTIN chars 3-12", async () => {
    const pan = newPan();
    const s = await mkSupplier({ gstNumber: newGstin(pan) });
    expect(s.panNumber).toBe(pan);
  });
  test("BR-SUP-04 PAN saved in capitals; PAN not matching GSTIN is 400; bad PAN format 400", async () => {
    const pan = newPan();
    const s = await mkSupplier({ panNumber: pan.toLowerCase() });
    expect(s.panNumber).toBe(pan);
    const g = newGstin();
    const other = g.slice(2, 12) === "AAACX1111K" ? "AAAAA1111A" : "AAACX1111K";
    const r = await bo("POST", "/createSupplier", {
      name: uid(),
      gstNumber: g,
      panNumber: other,
    });
    expect(r.status).toBe(400);
    expect(
      (await bo("POST", "/createSupplier", { name: uid(), panNumber: "12345" }))
        .status,
    ).toBe(400);
  });
  test("BR-SUP-04 update: PAN must match the stored GSTIN", async () => {
    const s = await mkSupplier({ gstNumber: newGstin() });
    const r = await bo("PATCH", `/updateSupplier/${s.id}`, {
      mode: "master",
      panNumber: "AAACX1111K",
    });
    expect(r.status).toBe(400);
  });
});

describe("BR-SUP-05..06 type, terms, email", () => {
  test("BR-SUP-05 default type raw_material and default terms 0", async () => {
    const s = await mkSupplier();
    expect(s.type).toBe("raw_material");
    expect(s.defaultPaymentTermsDays).toBe(0);
  });
  test("BR-SUP-05 unknown type is 400", async () => {
    expect(
      (await bo("POST", "/createSupplier", { name: uid(), type: "vendor" }))
        .status,
    ).toBe(400);
  });
  test("BR-SUP-06 terms outside 0..365 or fractional are 400; 365 ok", async () => {
    for (const d of [400, -1, 1.5]) {
      expect(
        (
          await bo("POST", "/createSupplier", {
            name: uid(),
            defaultPaymentTermsDays: d,
          })
        ).status,
      ).toBe(400);
    }
    const s = await mkSupplier({ defaultPaymentTermsDays: 365 });
    expect(s.defaultPaymentTermsDays).toBe(365);
  });
  test("BR-SUP-06 invalid email is 400", async () => {
    expect(
      (await bo("POST", "/createSupplier", { name: uid(), email: "abc@" }))
        .status,
    ).toBe(400);
  });
});

describe("BR-SUP-07..09 deactivate, reactivate, edit", () => {
  test("BR-SUP-07 no DELETE route", async () => {
    const s = await mkSupplier();
    const r = await bo("DELETE", `/${s.id}`);
    expect([404, 405]).toContain(r.status);
    expect((await bo("GET", `/${s.id}/detail`)).status).toBe(200);
  });
  test("BR-SUP-07/08 deactivate keeps price list readable; reactivate restores; row flag kept", async () => {
    const s = await mkSupplier();
    const item = await mkItem();
    const row = (await addItem(s.id, item.id)).json.data;
    await bo("PATCH", `/${s.id}/editItem`, {
      supplierItemsId: row.id,
      isActive: false,
    });
    const off = await bo("PATCH", `/updateSupplier/${s.id}`, {
      mode: "master",
      isActive: false,
    });
    expect(off.status).toBe(200);
    expect(sup(off.json.data).isActive).toBe(false);
    const list = await bo("GET", `/${s.id}/listItems`);
    expect(list.status).toBe(200);
    expect(list.json.data.length).toBe(1);
    const on = await bo("PATCH", `/updateSupplier/${s.id}`, {
      mode: "master",
      isActive: true,
    });
    expect(sup(on.json.data).isActive).toBe(true);
    const list2 = await bo("GET", `/${s.id}/listItems`);
    expect(list2.json.data[0].isActive).toBe(false);
  });
  test("BR-SUP-09 edit with no fields is 400", async () => {
    const s = await mkSupplier();
    expect(
      (await bo("PATCH", `/updateSupplier/${s.id}`, { mode: "master" })).status,
    ).toBe(400);
  });
  test("BR-SUP-09 optional fields can be cleared; name cannot", async () => {
    const s = await mkSupplier({
      email: "a@b.com",
      phone: "999",
      contactPerson: "Asha",
      address: "Taloja",
      gstNumber: newGstin(),
    });
    const r = await bo("PATCH", `/updateSupplier/${s.id}`, {
      mode: "master",
      email: "",
      phone: null,
      contactPerson: "",
      address: "",
      gstNumber: null,
    });
    expect(r.status).toBe(200);
    const d = sup(r.json.data);
    expect(d.email).toBeNull();
    expect(d.phone).toBeNull();
    expect(d.contactPerson).toBeNull();
    expect(d.address).toBeNull();
    expect(d.gstNumber).toBeNull();
    expect(
      (
        await bo("PATCH", `/updateSupplier/${s.id}`, {
          mode: "master",
          name: "",
        })
      ).status,
    ).toBe(400);
  });
  test("BR-SUP-09 unknown supplier is 404", async () => {
    expect(
      (
        await bo("PATCH", "/updateSupplier/999999999", {
          mode: "master",
          phone: "1",
        })
      ).status,
    ).toBe(404);
  });
});

describe("BR-SUP-10 history", () => {
  test("BR-SUP-10 supplier field change writes a history row with old and new", async () => {
    const s = await mkSupplier({ phone: "111" });
    await bo("PATCH", `/updateSupplier/${s.id}`, {
      mode: "master",
      phone: "222",
    });
    const rows = await history(s.id);
    const row = rows.find((h) => h.field === "phone");
    expect(row).toBeDefined();
    expect(row!.entity).toBe("supplier");
    expect(row!.oldValue).toBe("111");
    expect(row!.newValue).toBe("222");
    expect(row!.changedBy).toBe(await userFor("back_office"));
  });
  test("BR-SUP-10 price, GST % and active changes write history rows", async () => {
    const s = await mkSupplier();
    const item = await mkItem();
    const row = (await addItem(s.id, item.id, { taxPercentage: 5 })).json.data;
    await bo("PATCH", `/${s.id}/editItem`, {
      supplierItemsId: row.id,
      supplierUnitPricePaise: 25000,
      taxPercentage: 18,
      isActive: false,
    });
    const rows = (await history(s.id)).filter((h) => h.entity === "item");
    const by = (f: string) => rows.find((h) => h.field === f);
    expect(by("supplierUnitPricePaise")?.oldValue).toBe("24500");
    expect(by("supplierUnitPricePaise")?.newValue).toBe("25000");
    expect(by("taxPercentage")).toBeDefined();
    expect(by("isActive")).toBeDefined();
  });
  test("BR-SUP-10 GET history returns newest first and 404 for unknown supplier", async () => {
    const s = await mkSupplier({ phone: "1" });
    await bo("PATCH", `/updateSupplier/${s.id}`, {
      mode: "master",
      phone: "2",
    });
    await bo("PATCH", `/updateSupplier/${s.id}`, {
      mode: "master",
      phone: "3",
    });
    const r = await call("GET", `/${s.id}/history`, "owner");
    expect(r.status).toBe(200);
    const phones = r.json.data.filter((h: any) => h.field === "phone");
    expect(phones[0].newValue).toBe("3");
    expect(phones[0].changedByName).not.toBeUndefined();
    expect((await call("GET", "/999999999/history", "owner")).status).toBe(404);
  });
});

describe("BR-SUP-11..15 price list items", () => {
  test("BR-SUP-11 second row for same item is 409 with fixed message", async () => {
    const s = await mkSupplier();
    const item = await mkItem();
    expect((await addItem(s.id, item.id)).status).toBe(201);
    const r = await addItem(s.id, item.id);
    expect(r.status).toBe(409);
    expect(msgOf(r.json)).toBe("Already on this supplier's price list");
  });
  test("BR-SUP-11 unknown item is 400; unknown supplier is 404", async () => {
    const s = await mkSupplier();
    expect((await addItem(s.id, 999999999)).status).toBe(400);
    const item = await mkItem();
    expect((await addItem(999999999, item.id)).status).toBe(404);
  });
  test("BR-SUP-12 price 0 or fractional is 400", async () => {
    const s = await mkSupplier();
    const item = await mkItem();
    expect(
      (await addItem(s.id, item.id, { supplierUnitPricePaise: 0 })).status,
    ).toBe(400);
    expect(
      (await addItem(s.id, item.id, { supplierUnitPricePaise: 245.5 })).status,
    ).toBe(400);
    expect(
      (await addItem(s.id, item.id, { supplierUnitPricePaise: 24550 })).status,
    ).toBe(201);
  });
  test("BR-SUP-13 GST slab: 18 ok, 17 400, default 0", async () => {
    const s = await mkSupplier();
    const i1 = await mkItem();
    const i2 = await mkItem();
    const i3 = await mkItem();
    expect((await addItem(s.id, i1.id, { taxPercentage: 17 })).status).toBe(
      400,
    );
    expect((await addItem(s.id, i1.id, { taxPercentage: 18 })).status).toBe(
      201,
    );
    const d = await addItem(s.id, i2.id);
    expect(Number(d.json.data.taxPercentage)).toBe(0);
    expect((await addItem(s.id, i3.id, { taxPercentage: 0.25 })).status).toBe(
      201,
    );
  });
  test("BR-SUP-14 uom must equal item uom", async () => {
    const s = await mkSupplier();
    const item = await mkItem({ uom: "kg" });
    expect((await addItem(s.id, item.id, { uom: "ton" })).status).toBe(400);
  });
  test("BR-SUP-14 lead time 0..365 whole days; qty max 3 decimals, 0 = no limit", async () => {
    const s = await mkSupplier();
    const item = await mkItem();
    expect((await addItem(s.id, item.id, { leadTimeDays: 366 })).status).toBe(
      400,
    );
    expect((await addItem(s.id, item.id, { leadTimeDays: 2.5 })).status).toBe(
      400,
    );
    expect((await addItem(s.id, item.id, { qty: 1.2345 })).status).toBe(400);
    expect((await addItem(s.id, item.id, { qty: -1 })).status).toBe(400);
    expect(
      (await addItem(s.id, item.id, { leadTimeDays: 7, qty: 0 })).status,
    ).toBe(201);
  });
  test("BR-SUP-15 inactive row stays in list, flagged inactive", async () => {
    const s = await mkSupplier();
    const item = await mkItem();
    const row = (await addItem(s.id, item.id)).json.data;
    await bo("PATCH", `/${s.id}/editItem`, {
      supplierItemsId: row.id,
      isActive: false,
    });
    const list = await bo("GET", `/${s.id}/listItems`);
    expect(list.json.data[0].isActive).toBe(false);
  });
  test("BR-SUP-11 update via updateSupplier mode item changes price", async () => {
    const s = await mkSupplier();
    const item = await mkItem();
    await addItem(s.id, item.id);
    const r = await bo("PATCH", `/updateSupplier/${s.id}`, {
      mode: "item",
      itemId: item.id,
      supplierUnitPricePaise: 26000,
    });
    expect(r.status).toBe(200);
    const list = await bo("GET", `/${s.id}/listItems`);
    expect(list.json.data[0].supplierUnitPricePaise).toBe(26000);
  });
});

describe("BR-SUP-16 price suggestion", () => {
  const lastRate = (itemId: number, supplierId: number) =>
    callAt(
      "/api/asset",
      "GET",
      `/items/${itemId}/last-rate?supplierId=${supplierId}`,
      "back_office",
    );
  test("BR-SUP-16 active price-list row is used, source supplier_catalog", async () => {
    const s = await mkSupplier();
    const item = await mkItem();
    await addItem(s.id, item.id, { supplierUnitPricePaise: 24500 });
    const r = await lastRate(item.id, s.id);
    expect(r.status).toBe(200);
    expect(r.json.data).toEqual({
      ratePaise: 24500,
      source: "supplier_catalog",
    });
  });
  test("BR-SUP-15/16 inactive row is skipped, falls to item standard rate", async () => {
    const s = await mkSupplier();
    const item = await mkItem({ standardRatePaise: 24000 });
    const row = (
      await addItem(s.id, item.id, { supplierUnitPricePaise: 24500 })
    ).json.data;
    await bo("PATCH", `/${s.id}/editItem`, {
      supplierItemsId: row.id,
      isActive: false,
    });
    const r = await lastRate(item.id, s.id);
    expect(r.json.data).toEqual({ ratePaise: 24000, source: "standard_rate" });
  });
});

describe("BR-SUP-17 create with price list", () => {
  test("BR-SUP-17 items saved with the supplier", async () => {
    const i1 = await mkItem();
    const i2 = await mkItem();
    const r = await bo("POST", "/createSupplier", {
      name: uid(),
      supplierItems: [
        { itemId: i1.id, supplierUnitPricePaise: 100, uom: "kg" },
        { itemId: i2.id, supplierUnitPricePaise: 200, uom: "kg" },
      ],
    });
    expect(r.status).toBe(201);
    const list = await bo("GET", `/${sup(r.json.data).id}/listItems`);
    expect(list.json.data.length).toBe(2);
  });
  test("BR-SUP-17 unknown item rejects whole create, names the id, nothing saved", async () => {
    const i1 = await mkItem();
    const name = uid();
    const r = await bo("POST", "/createSupplier", {
      name,
      supplierItems: [
        { itemId: i1.id, supplierUnitPricePaise: 100, uom: "kg" },
        { itemId: 999999999, supplierUnitPricePaise: 200, uom: "kg" },
      ],
    });
    expect(r.status).toBe(400);
    expect(msgOf(r.json)).toContain("999999999");
    const rows = await db
      .select()
      .from(supplierMaster)
      .where(eq(supplierMaster.name, name));
    expect(rows.length).toBe(0);
  });
  test("BR-SUP-17 repeated item rejects whole create", async () => {
    const i1 = await mkItem();
    const name = uid();
    const r = await bo("POST", "/createSupplier", {
      name,
      supplierItems: [
        { itemId: i1.id, supplierUnitPricePaise: 100, uom: "kg" },
        { itemId: i1.id, supplierUnitPricePaise: 200, uom: "kg" },
      ],
    });
    expect(r.status).toBe(400);
    expect(msgOf(r.json)).toContain(String(i1.id));
    const rows = await db
      .select()
      .from(supplierMaster)
      .where(eq(supplierMaster.name, name));
    expect(rows.length).toBe(0);
  });
});

describe("BR-SUP-18 service rows", () => {
  const addSvc = (
    supplierId: number,
    serviceId: number,
    over: Record<string, unknown> = {},
  ) =>
    bo("POST", `/${supplierId}/createService`, {
      serviceId,
      serviceUnitPricePaise: 4000,
      taxPercentage: 18,
      ...over,
    });
  test("BR-SUP-18 service row saved; duplicate 409; price 0 400; bad GST 400; unknown service 400", async () => {
    const s = await mkSupplier({ type: "service_provider" });
    const svc = await mkService();
    expect((await addSvc(s.id, svc.id)).status).toBe(201);
    const dup = await addSvc(s.id, svc.id);
    expect(dup.status).toBe(409);
    expect(msgOf(dup.json)).toBe("Already on this supplier's price list");
    const svc2 = await mkService();
    expect(
      (await addSvc(s.id, svc2.id, { serviceUnitPricePaise: 0 })).status,
    ).toBe(400);
    expect((await addSvc(s.id, svc2.id, { taxPercentage: 17 })).status).toBe(
      400,
    );
    expect((await addSvc(s.id, 999999999)).status).toBe(400);
    const list = await bo("GET", `/${s.id}/listServices`);
    expect(list.json.data.length).toBe(1);
  });
  test("BR-SUP-18/10 service price change writes history", async () => {
    const s = await mkSupplier();
    const svc = await mkService();
    const row = (await addSvc(s.id, svc.id)).json.data;
    await bo("PATCH", `/${s.id}/editService`, {
      supplierServiceId: row.id,
      serviceUnitPricePaise: 5000,
    });
    const h = (await history(s.id)).find(
      (x) => x.entity === "service" && x.field === "serviceUnitPricePaise",
    );
    expect(h?.oldValue).toBe("4000");
    expect(h?.newValue).toBe("5000");
  });
});

describe("BR-SUP-19..22 batch edit", () => {
  async function setup(n = 3) {
    const s = await mkSupplier();
    const items = [];
    for (let i = 0; i < n; i++) {
      const it = await mkItem();
      const row = (await addItem(s.id, it.id)).json.data;
      items.push({ item: it, row });
    }
    return { s, items };
  }
  test("BR-SUP-19 101 rows is 400 and nothing saved", async () => {
    const { s, items } = await setup(1);
    const rows = Array.from({ length: 101 }, () => ({
      supplierItemsId: items[0]!.row.id,
      supplierUnitPricePaise: 30000,
    }));
    expect((await bo("PATCH", `/${s.id}/editItem`, rows)).status).toBe(400);
    const list = await bo("GET", `/${s.id}/listItems`);
    expect(list.json.data[0].supplierUnitPricePaise).toBe(24500);
  });
  test("BR-SUP-19 100 rows accepted", async () => {
    const { s, items } = await setup(1);
    const rows = Array.from({ length: 100 }, () => ({
      supplierItemsId: items[0]!.row.id,
      supplierUnitPricePaise: 30000,
    }));
    expect((await bo("PATCH", `/${s.id}/editItem`, rows)).status).toBe(200);
  });
  test("BR-SUP-21 all good: 200 with summary and per-row ok", async () => {
    const { s, items } = await setup(2);
    const r = await bo("PATCH", `/${s.id}/editItem`, [
      { supplierItemsId: items[0]!.row.id, supplierUnitPricePaise: 30000 },
      { itemId: items[1]!.item.id, supplierUnitPricePaise: 31000 },
    ]);
    expect(r.status).toBe(200);
    expect(r.json.summary).toEqual({ total: 2, success: 2, failed: 0 });
    expect(r.json.data.map((x: any) => x.success)).toEqual([true, true]);
    expect(r.json.data.map((x: any) => x.index)).toEqual([0, 1]);
  });
  test("BR-SUP-21 single row object accepted", async () => {
    const { s, items } = await setup(1);
    const r = await bo("PATCH", `/${s.id}/editItem`, {
      supplierItemsId: items[0]!.row.id,
      supplierUnitPricePaise: 32000,
    });
    expect(r.status).toBe(200);
  });
  test("BR-SUP-21 one bad row: 400, nothing saved, bad row named", async () => {
    const { s, items } = await setup(2);
    const r = await bo("PATCH", `/${s.id}/editItem`, [
      { supplierItemsId: items[0]!.row.id, supplierUnitPricePaise: 30000 },
      { itemId: 999999999, supplierUnitPricePaise: 31000 },
    ]);
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("BATCH_FAILED");
    expect(r.json.summary).toEqual({ total: 2, success: 1, failed: 1 });
    expect(r.json.data[1].success).toBe(false);
    expect(r.json.data[1].error).toBe("Item not on this supplier");
    const list = await bo("GET", `/${s.id}/listItems`);
    for (const row of list.json.data)
      expect(row.supplierUnitPricePaise).toBe(24500);
    expect(
      (await history(s.id)).filter((h) => h.field === "supplierUnitPricePaise")
        .length,
    ).toBe(0);
  });
  test("BR-SUP-20 both targets fails the row with 'give one target'", async () => {
    const { s, items } = await setup(1);
    const r = await bo("PATCH", `/${s.id}/editItem`, [
      {
        supplierItemsId: items[0]!.row.id,
        itemId: items[0]!.item.id,
        supplierUnitPricePaise: 30000,
      },
    ]);
    expect(r.status).toBe(400);
    expect(r.json.data[0].error).toBe(
      "Give one target: row id or item/service id",
    );
  });
  test("BR-SUP-20 no target fails the row; no field fails the row", async () => {
    const { s, items } = await setup(1);
    const r = await bo("PATCH", `/${s.id}/editItem`, [
      { supplierUnitPricePaise: 30000 },
      { supplierItemsId: items[0]!.row.id },
    ]);
    expect(r.status).toBe(400);
    expect(r.json.data[0].error).toBe(
      "Give one target: row id or item/service id",
    );
    expect(r.json.data[1].error).toBe("Give at least one field to change");
  });
  test("BR-SUP-14/21 uom differing from item's fails the row", async () => {
    const { s, items } = await setup(1);
    const r = await bo("PATCH", `/${s.id}/editItem`, [
      { supplierItemsId: items[0]!.row.id, uom: "ton" },
    ]);
    expect(r.status).toBe(400);
    expect(r.json.data[0].error).toBe("Unit must be the item's unit");
  });
  test("BR-SUP-21 service batch: bad row fails all", async () => {
    const s = await mkSupplier();
    const svc = await mkService();
    const row = (
      await bo("POST", `/${s.id}/createService`, {
        serviceId: svc.id,
        serviceUnitPricePaise: 4000,
      })
    ).json.data;
    const r = await bo("PATCH", `/${s.id}/editService`, [
      { supplierServiceId: row.id, serviceUnitPricePaise: 5000 },
      { serviceId: 999999999, serviceUnitPricePaise: 5000 },
    ]);
    expect(r.status).toBe(400);
    expect(r.json.data[1].error).toBe("Service not on this supplier");
    const list = await bo("GET", `/${s.id}/listServices`);
    expect(list.json.data[0].serviceUnitPricePaise).toBe(4000);
  });
  test("BR-SUP-22 error texts are plain sentences, not database text", async () => {
    const s = await mkSupplier();
    const item = await mkItem();
    await addItem(s.id, item.id);
    const r = await addItem(s.id, item.id);
    expect(msgOf(r.json)).not.toMatch(/duplicate key|violates|constraint/i);
    const n = uid();
    await mkSupplier({ name: n });
    const r2 = await bo("POST", "/createSupplier", { name: n });
    expect(msgOf(r2.json)).not.toMatch(/duplicate key|violates|constraint/i);
  });
});

describe("BR-SUP-23..24 search, paging, status filter", () => {
  test("BR-SUP-23 q matches name, contact, email, phone, GSTIN part, ignoring case", async () => {
    const tag = `Zq${Date.now()}`;
    const g = newGstin();
    const s = await mkSupplier({
      name: `${RUN}_${tag}_name`,
      contactPerson: `${tag}person`,
      email: `${tag.toLowerCase()}@x.com`,
      phone: `${tag}phone`,
      gstNumber: g,
    });
    for (const q of [
      `${tag.toUpperCase()}_NAME`,
      `${tag}person`.toUpperCase(),
      `${tag}@X.COM`,
      `${tag}PHONE`,
      g.slice(4, 12).toLowerCase(),
    ]) {
      const r = await bo(
        "GET",
        `/listSuppliers?q=${encodeURIComponent(q)}&pageSize=100`,
      );
      expect(r.status).toBe(200);
      expect(r.json.data.map((x: any) => x.id)).toContain(s.id);
    }
  });
  test("BR-SUP-23 q matches SKU of a supplied item", async () => {
    const item = await mkItem();
    const s1 = await mkSupplier();
    const s2 = await mkSupplier();
    const s3 = await mkSupplier();
    await addItem(s1.id, item.id);
    await addItem(s2.id, item.id);
    const r = await bo(
      "GET",
      `/listSuppliers?q=${encodeURIComponent(String(item.sku).toLowerCase())}&pageSize=100`,
    );
    const ids = r.json.data.map((x: any) => x.id);
    expect(ids).toContain(s1.id);
    expect(ids).toContain(s2.id);
    expect(ids).not.toContain(s3.id);
  });
  test("BR-SUP-23 pageSize 0 or 101 is 400; default 10", async () => {
    expect((await bo("GET", "/listSuppliers?pageSize=0")).status).toBe(400);
    expect((await bo("GET", "/listSuppliers?pageSize=101")).status).toBe(400);
    const r = await bo("GET", "/listSuppliers");
    expect(r.status).toBe(200);
    expect(r.json.meta.pageSize).toBe(10);
    expect(r.json.data.length).toBeLessThanOrEqual(10);
  });
  test("BR-SUP-23 default sort by name asc; sortDir desc reverses", async () => {
    const tag = uid();
    const a = await mkSupplier({ name: `${tag}_a` });
    const b = await mkSupplier({ name: `${tag}_b` });
    const asc = await bo("GET", `/listSuppliers?q=${tag}`);
    expect(asc.json.data.map((x: any) => x.id)).toEqual([a.id, b.id]);
    const r = await bo(
      "GET",
      `/listSuppliers?q=${tag}&sortBy=name&sortDir=desc`,
    );
    expect(r.json.data.map((x: any) => x.id)).toEqual([b.id, a.id]);
  });
  test("BR-SUP-24 status filter: inactive only, active only, all", async () => {
    const tag = uid();
    const on = await mkSupplier({ name: `${tag}_on` });
    const off = await mkSupplier({ name: `${tag}_off`, isActive: false });
    const ids = async (st: string) =>
      (
        await bo("GET", `/listSuppliers?q=${tag}&status=${st}&pageSize=100`)
      ).json.data.map((x: any) => x.id);
    expect(await ids("inactive")).toEqual([off.id]);
    expect(await ids("active")).toEqual([on.id]);
    expect((await ids("all")).sort()).toEqual([on.id, off.id].sort());
    expect((await bo("GET", `/listSuppliers?q=${tag}`)).json.data.length).toBe(
      2,
    );
    expect((await bo("GET", "/listSuppliers?status=bogus")).status).toBe(400);
    const row = (await bo("GET", `/listSuppliers?q=${tag}_off&status=all`)).json
      .data[0];
    expect(row.isActive).toBe(false);
  });
});

describe("BR-SUP-25 roles", () => {
  test("BR-SUP-25 view roles can list and view; others cannot", async () => {
    const s = await mkSupplier();
    for (const role of [
      "owner",
      "back_office",
      "floor_supervisor",
      "super-admin",
    ] as Role[]) {
      expect((await call("GET", "/listSuppliers", role)).status).toBe(200);
      expect((await call("GET", `/${s.id}/detail`, role)).status).toBe(200);
      expect((await call("GET", `/${s.id}/listItems`, role)).status).toBe(200);
      expect((await call("GET", `/${s.id}/listServices`, role)).status).toBe(
        200,
      );
    }
    for (const role of ["qa_inspector", "operator", "die_designer"] as Role[]) {
      expect((await call("GET", "/listSuppliers", role)).status).toBe(403);
      expect((await call("GET", `/${s.id}/detail`, role)).status).toBe(403);
    }
  });
  test("BR-SUP-25 manage roles: bo and super-admin only; owner and fs get 403 and nothing changes", async () => {
    const s = await mkSupplier({ phone: "1" });
    const item = await mkItem();
    const svc = await mkService();
    for (const role of [
      "owner",
      "floor_supervisor",
      "qa_inspector",
    ] as Role[]) {
      expect(
        (await call("POST", "/createSupplier", role, { name: uid() })).status,
      ).toBe(403);
      expect(
        (
          await call("PATCH", `/updateSupplier/${s.id}`, role, {
            mode: "master",
            phone: "2",
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await call("POST", `/${s.id}/createItem`, role, {
            itemId: item.id,
            supplierUnitPricePaise: 1,
            uom: "kg",
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await call("POST", `/${s.id}/createService`, role, {
            serviceId: svc.id,
            serviceUnitPricePaise: 1,
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await call("PATCH", `/${s.id}/editItem`, role, {
            itemId: item.id,
            isActive: false,
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await call("PATCH", `/${s.id}/editService`, role, {
            serviceId: svc.id,
            isActive: false,
          })
        ).status,
      ).toBe(403);
    }
    const d = await bo("GET", `/${s.id}/detail`);
    expect(d.json.data.phone ?? d.json.data.supplier?.phone).toBe("1");
    expect(
      (await call("POST", "/createSupplier", "super-admin", { name: uid() }))
        .status,
    ).toBe(201);
  });
  test("BR-SUP-25 history needs supplier.view", async () => {
    const s = await mkSupplier();
    expect((await call("GET", `/${s.id}/history`, "qa_inspector")).status).toBe(
      403,
    );
  });
  test("BR-SUP-25 no token is 401", async () => {
    const res = await app.request("/api/supplier/listSuppliers");
    expect(res.status).toBe(401);
  });
});
