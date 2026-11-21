/**
 * HTTP-level tests for the customer master of the sale-order module:
 * BR-SO-01, 02, 03, 04 (+ audit of customer changes, BR-SO-52 trailer).
 * Spec: docs/specs/sale-order/spec.md v1. Fixtures are TEST_soc_ prefixed and
 * removed in afterAll.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, inArray, like } from "drizzle-orm";
import { createApp } from "../../src/app";
import { db } from "../../src/db/client";
import {
  documentNumberCounters,
  rolePermissions,
  roles,
} from "../../src/db/schemas/01_auth";
import { employees } from "../../src/db/schemas/03_hcm";
import { customers, salesAuditLog } from "../../src/db/schemas/05_sales";
import { signAccessToken } from "../../src/lib/token";

const app = createApp();
const RUN = `TEST_soc_${Date.now()}`;
let seq = 0;
const uid = () => `${RUN}_${++seq}`;
const EMAIL_PREFIX = "test_soc_";

type Actor = { id: number; token: string; name: string };
const actors: Record<string, Actor> = {};
const customerIds: number[] = [];
const roleIds: number[] = [];

function must<T>(row: T | undefined, what: string): T {
  if (!row) throw new Error(`Fixture setup: ${what} returned no row`);
  return row;
}

async function actorWithRoleId(key: string, roleId: number, roleName: string) {
  const name = `${RUN}_${key}`;
  const [emp] = await db
    .insert(employees)
    .values({
      name,
      email: `${EMAIL_PREFIX}${Date.now()}_${key}@diecast.test`,
      roleId,
      isActive: true,
    })
    .returning({ id: employees.id });
  const id = must(emp, key).id;
  const token = await signAccessToken({
    userId: id,
    userName: name,
    role: roleName,
    allowedPages: [],
  });
  actors[key] = { id, token, name };
}

async function makeActor(key: string, roleName: string) {
  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, roleName))
    .limit(1);
  await actorWithRoleId(key, must(role, roleName).id, roleName);
}

async function makeCustomRole(key: string, keys: string[]) {
  const [r] = await db
    .insert(roles)
    .values({ name: `${RUN}_role_${key}` })
    .returning({ id: roles.id });
  const roleId = must(r, "role").id;
  roleIds.push(roleId);
  await db
    .insert(rolePermissions)
    .values(keys.map((permissionKey) => ({ roleId, permissionKey })));
  await actorWithRoleId(key, roleId, `${RUN}_role_${key}`);
}

async function call(
  actor: string | null,
  method: string,
  path: string,
  body?: unknown,
) {
  const headers: Record<string, string> = {};
  if (actor) headers.Authorization = `Bearer ${actors[actor]?.token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await app.request(`/api/customers${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // biome-ignore lint/suspicious/noExplicitAny: test helper reads arbitrary JSON
  const json = (await res.json().catch(() => null)) as any;
  return { status: res.status, json };
}

const VALID_GSTIN_33 = "33AAAAA0000A1Z5";

const body = (over: Record<string, unknown> = {}) => ({
  name: uid(),
  stateCode: "33",
  address: "Plot 4, Industrial Estate, Hosur",
  ...over,
});

async function mk(over: Record<string, unknown> = {}, actor = "bo") {
  const res = await call(actor, "POST", "", body(over));
  expect(res.status).toBe(201);
  customerIds.push(res.json.data.id);
  return res.json.data as {
    id: number;
    name: string;
    isActive: boolean;
    gstin: string | null;
  };
}

beforeAll(async () => {
  await makeActor("owner", "owner");
  await makeActor("bo", "back_office");
  await makeActor("fs", "floor_supervisor");
  await makeCustomRole("viewer", ["so.view"]);
  await makeCustomRole("custonly", ["customer.manage"]);
});

afterAll(async () => {
  const empRows = await db
    .select({ id: employees.id })
    .from(employees)
    .where(like(employees.email, `${EMAIL_PREFIX}%`));
  const empIds = empRows.map((e) => e.id);
  const strayRows =
    empIds.length > 0
      ? await db
          .select({ id: customers.id })
          .from(customers)
          .where(inArray(customers.createdBy, empIds))
      : [];
  const allCustomerIds = [
    ...new Set([...customerIds, ...strayRows.map((c) => c.id)]),
  ];
  if (allCustomerIds.length > 0) {
    await db
      .delete(salesAuditLog)
      .where(
        and(
          eq(salesAuditLog.targetType, "customer"),
          inArray(salesAuditLog.targetId, allCustomerIds),
        ),
      );
    await db.delete(customers).where(inArray(customers.id, allCustomerIds));
  }
  if (empIds.length > 0) {
    await db
      .update(documentNumberCounters)
      .set({ createdBy: null })
      .where(inArray(documentNumberCounters.createdBy, empIds));
    await db
      .update(documentNumberCounters)
      .set({ lastUpdatedBy: null })
      .where(inArray(documentNumberCounters.lastUpdatedBy, empIds));
    await db.delete(employees).where(inArray(employees.id, empIds));
  }
  if (roleIds.length > 0)
    await db.delete(roles).where(inArray(roles.id, roleIds));
});

describe("BR-SO-01 customer master", () => {
  test("BR-SO-01 create returns the customer, active by default", async () => {
    const c = await mk({ gstin: VALID_GSTIN_33 });
    expect(c.isActive).toBe(true);
    expect(c.gstin).toBe(VALID_GSTIN_33);
  });

  test("BR-SO-01 GSTIN is optional", async () => {
    const c = await mk();
    expect(c.gstin).toBeNull();
  });

  test("BR-SO-01 name unique ignoring case and outer spaces -> 409 CUSTOMER_NAME_EXISTS", async () => {
    const c = await mk();
    const res = await call(
      "bo",
      "POST",
      "",
      body({ name: `  ${c.name.toLowerCase()}  ` }),
    );
    expect(res.status).toBe(409);
    expect(res.json.code).toBe("CUSTOMER_NAME_EXISTS");
  });

  test("BR-SO-01 renaming onto an existing name -> 409 CUSTOMER_NAME_EXISTS", async () => {
    const a = await mk();
    const b = await mk();
    const res = await call("bo", "PATCH", `/${b.id}`, {
      name: a.name.toUpperCase(),
    });
    expect(res.status).toBe(409);
    expect(res.json.code).toBe("CUSTOMER_NAME_EXISTS");
  });

  test("BR-SO-01 GSTIN whose first two digits differ from the state code -> 400", async () => {
    const res = await call(
      "bo",
      "POST",
      "",
      body({ stateCode: "29", gstin: VALID_GSTIN_33 }),
    );
    expect(res.status).toBe(400);
  });

  test("BR-SO-01 GSTIN of the wrong length or format -> 400", async () => {
    for (const gstin of ["33AAAAA0000A1Z", "XXAAAAA0000A1Z5"]) {
      const res = await call("bo", "POST", "", body({ gstin }));
      expect(res.status).toBe(400);
    }
  });

  test("BR-SO-01 lowercase GSTIN is stored upper-case", async () => {
    const c = await mk({ gstin: VALID_GSTIN_33.toLowerCase() });
    expect(c.gstin).toBe(VALID_GSTIN_33);
  });

  test("BR-SO-01 patch can change the GSTIN and null clears it", async () => {
    const c = await mk({ gstin: VALID_GSTIN_33 });
    const cleared = await call("bo", "PATCH", `/${c.id}`, { gstin: null });
    expect(cleared.status).toBe(200);
    expect(cleared.json.data.gstin).toBeNull();
  });

  test("BR-SO-01 patch that moves the state away from the stored GSTIN -> 400", async () => {
    const c = await mk({ gstin: VALID_GSTIN_33 });
    const res = await call("bo", "PATCH", `/${c.id}`, { stateCode: "29" });
    expect(res.status).toBe(400);
  });

  test("BR-SO-01 state, address and name are required", async () => {
    for (const k of ["name", "stateCode", "address"]) {
      const b: Record<string, unknown> = body();
      delete b[k];
      const res = await call("bo", "POST", "", b);
      expect(res.status).toBe(400);
    }
  });

  test("BR-SO-01 a patch with no field is refused", async () => {
    const c = await mk();
    const res = await call("bo", "PATCH", `/${c.id}`, {});
    expect(res.status).toBe(400);
  });
});

describe("BR-SO-02 never deleted, only deactivated", () => {
  test("BR-SO-02 customer can be deactivated and reactivated", async () => {
    const c = await mk();
    const off = await call("bo", "PATCH", `/${c.id}`, { isActive: false });
    expect(off.status).toBe(200);
    expect(off.json.data.isActive).toBe(false);
    const on = await call("bo", "PATCH", `/${c.id}`, { isActive: true });
    expect(on.json.data.isActive).toBe(true);
  });

  test("BR-SO-02 there is no delete route", async () => {
    const c = await mk();
    const res = await call("owner", "DELETE", `/${c.id}`);
    expect([404, 405]).toContain(res.status);
    const still = await call("bo", "GET", `/${c.id}`);
    expect(still.status).toBe(200);
  });

  test("BR-SO-02 list filters by isActive", async () => {
    const c = await mk();
    await call("bo", "PATCH", `/${c.id}`, { isActive: false });
    const act = await call(
      "bo",
      "GET",
      `?isActive=true&q=${encodeURIComponent(c.name)}`,
    );
    expect(act.status).toBe(200);
    expect(act.json.data.some((x: { id: number }) => x.id === c.id)).toBe(
      false,
    );
    const off = await call(
      "bo",
      "GET",
      `?isActive=false&q=${encodeURIComponent(c.name)}`,
    );
    expect(off.json.data.some((x: { id: number }) => x.id === c.id)).toBe(true);
  });

  test("BR-SO-02 unknown customer id -> 404", async () => {
    const res = await call("bo", "GET", "/999999999");
    expect(res.status).toBe(404);
  });
});

describe("BR-SO-03 / BR-SO-04 permissions", () => {
  test("BR-SO-03 holder of only so.view cannot create or edit a customer", async () => {
    const c = await mk();
    const post = await call("viewer", "POST", "", body());
    expect(post.status).toBe(403);
    expect(post.json.code).toBe("PERMISSION_DENIED");
    const patch = await call("viewer", "PATCH", `/${c.id}`, { name: uid() });
    expect(patch.status).toBe(403);
    expect(patch.json.code).toBe("PERMISSION_DENIED");
  });

  test("BR-SO-03 so.view reads list and detail", async () => {
    const c = await mk();
    expect((await call("viewer", "GET", "")).status).toBe(200);
    expect((await call("viewer", "GET", `/${c.id}`)).status).toBe(200);
  });

  test("BR-SO-03 customer.manage alone can read customers", async () => {
    const c = await mk();
    expect((await call("custonly", "GET", "")).status).toBe(200);
    expect((await call("custonly", "GET", `/${c.id}`)).status).toBe(200);
  });

  test("BR-SO-04 floor supervisor (no so.view) is refused 403 PERMISSION_DENIED", async () => {
    const c = await mk();
    const list = await call("fs", "GET", "");
    expect(list.status).toBe(403);
    expect(list.json.code).toBe("PERMISSION_DENIED");
    expect((await call("fs", "GET", `/${c.id}`)).status).toBe(403);
    expect((await call("fs", "POST", "", body())).status).toBe(403);
  });

  test("BR-SO-04 no login -> 401 on every customer route", async () => {
    expect((await call(null, "GET", "")).status).toBe(401);
    expect((await call(null, "GET", "/1")).status).toBe(401);
    expect((await call(null, "POST", "", body())).status).toBe(401);
    expect((await call(null, "PATCH", "/1", { name: "x" })).status).toBe(401);
  });

  test("BR-SO-03 owner may create and edit", async () => {
    const c = await mk({}, "owner");
    const res = await call("owner", "PATCH", `/${c.id}`, {
      address: "New addr",
    });
    expect(res.status).toBe(200);
    expect(res.json.data.address).toBe("New addr");
  });
});

describe("customer audit trail (spec Security: Audit)", () => {
  test("customer create and edit each write an audit row by the actor", async () => {
    const c = await mk();
    await call("bo", "PATCH", `/${c.id}`, { address: "Changed" });
    const rows = await db
      .select()
      .from(salesAuditLog)
      .where(
        and(
          eq(salesAuditLog.targetType, "customer"),
          eq(salesAuditLog.targetId, c.id),
        ),
      );
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const r of rows) expect(r.actorId).toBe(actors.bo?.id as number);
  });

  test("customer deactivation is audited", async () => {
    const c = await mk();
    await call("bo", "PATCH", `/${c.id}`, { isActive: false });
    const rows = await db
      .select()
      .from(salesAuditLog)
      .where(
        and(
          eq(salesAuditLog.targetType, "customer"),
          eq(salesAuditLog.targetId, c.id),
        ),
      );
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
});
