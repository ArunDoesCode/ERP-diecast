/**
 * HTTP-level tests for the company settings change history:
 * BR-SCO-29 (docs/specs/subcontracting.md). Real app against the test DB.
 * Fixtures are TEST_cset_ prefixed and removed in afterAll. The single
 * company_settings row is saved before and restored after.
 *
 * Path chosen (the spec names none): GET /api/company/settings/history, next
 * to GET/PATCH /api/company/settings. Row fields assumed: field, oldValue,
 * newValue, changedByName, changedAt.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray, like, sql } from "drizzle-orm";
import { createApp } from "../../src/app";
import { db } from "../../src/db/client";
import { documentNumberCounters, roles } from "../../src/db/schemas/01_auth";
import { employees } from "../../src/db/schemas/03_hcm";
import { companySettings } from "../../src/db/schemas/04_company";
import { authService } from "../../src/service/authService";

const app = createApp();
const PREFIX = "TEST_cset_";
const EMAIL_PREFIX = "test_cset_";
const PASSWORD = "cset-test-password-123";

type Actor = { id: number; token: string };
const actors: Record<string, Actor> = {};
let savedCompany: typeof companySettings.$inferSelect | undefined;

type HistoryRow = {
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changedByName: string | null;
  changedAt: string;
};

async function makeActor(key: string, roleName: string) {
  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, roleName))
    .limit(1);
  if (!role) throw new Error(`role ${roleName} missing`);
  const email = `${EMAIL_PREFIX}${key}@diecast.test`;
  const [emp] = await db
    .insert(employees)
    .values({
      name: `${PREFIX}${key}`,
      email,
      passwordHash: await Bun.password.hash(PASSWORD),
      roleId: role.id,
      isActive: true,
    })
    .returning({ id: employees.id });
  if (!emp) throw new Error("employee fixture failed");
  const { accessToken } = await authService.login(email, PASSWORD);
  actors[key] = { id: emp.id, token: accessToken };
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
  const res = await app.request(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // biome-ignore lint/suspicious/noExplicitAny: test helper reads arbitrary JSON
  const json = (await res.json().catch(() => null)) as any;
  return { status: res.status, json };
}

const BASE = {
  name: `${PREFIX}Works`,
  address: "1 Plant Road, Pune",
  gstin: "27AAAAA0000A1Z5",
  stateCode: "27",
};

const save = (actor: string, over: Record<string, unknown> = {}) =>
  call(actor, "PATCH", "/company/settings", { ...BASE, ...over });

async function history(actor = "owner") {
  const res = await call(actor, "GET", "/company/settings/history");
  expect(res.status).toBe(200);
  return res.json.data as HistoryRow[];
}

beforeAll(async () => {
  await makeActor("owner", "owner");
  await makeActor("fs", "floor_supervisor");
  await makeActor("operator", "operator");
  const [prior] = await db.select().from(companySettings).limit(1);
  savedCompany = prior;
});

afterAll(async () => {
  const ids = Object.values(actors).map((a) => a.id);
  // Remove history rows made by our actors, wherever the table is called:
  // any non-id integer column of a company_settings* table that holds our ids.
  const tables = await db.execute(
    sql`select table_name from information_schema.tables
        where table_schema = 'public' and table_name like 'company_settings%'
        and table_name <> 'company_settings'`,
  );
  for (const t of tables as unknown as Array<{ table_name: string }>) {
    const cols = await db.execute(
      sql`select column_name from information_schema.columns
          where table_schema = 'public' and table_name = ${t.table_name}
          and data_type = 'integer' and column_name <> 'id'`,
    );
    for (const c of cols as unknown as Array<{ column_name: string }>) {
      await db.execute(
        sql`delete from ${sql.identifier(t.table_name)}
            where ${sql.identifier(c.column_name)} in (${sql.join(
              ids.map((i) => sql`${i}`),
              sql`, `,
            )})`,
      );
    }
  }
  await db.delete(companySettings);
  if (savedCompany) await db.insert(companySettings).values(savedCompany);
  if (ids.length > 0) {
    await db
      .update(documentNumberCounters)
      .set({ createdBy: null })
      .where(inArray(documentNumberCounters.createdBy, ids));
    await db
      .update(documentNumberCounters)
      .set({ lastUpdatedBy: null })
      .where(inArray(documentNumberCounters.lastUpdatedBy, ids));
  }
  await db.delete(employees).where(like(employees.email, `${EMAIL_PREFIX}%`));
});

describe("BR-SCO-29 company settings change history", () => {
  test("BR-SCO-29 owner changes GSTIN -> one row with old value, new value, who and when", async () => {
    expect((await save("owner")).status).toBe(200);
    const before = (await history()).length;
    const t0 = Date.now();
    const res = await save("owner", { gstin: "27BBBBB0000B1Z5" });
    expect(res.status).toBe(200);
    const rows = await history();
    expect(rows.length).toBe(before + 1);
    const row = rows[0] as HistoryRow;
    expect(row.field.toLowerCase()).toContain("gstin");
    expect(row.oldValue).toBe("27AAAAA0000A1Z5");
    expect(row.newValue).toBe("27BBBBB0000B1Z5");
    expect(row.changedByName).toBe(`${PREFIX}owner`);
    const at = new Date(row.changedAt).getTime();
    expect(Math.abs(at - t0)).toBeLessThan(60_000);
  });

  test("BR-SCO-29 saving with no change adds no row", async () => {
    await save("owner", { name: `${PREFIX}Works` });
    const before = await history();
    const res = await save("owner", { name: `${PREFIX}Works` });
    expect(res.status).toBe(200);
    expect((await history()).length).toBe(before.length);
  });

  test("BR-SCO-29 two changed fields in one save add two rows, one per field", async () => {
    await save("owner");
    const before = (await history()).length;
    const res = await save("owner", {
      address: "2 New Road, Pune",
      name: `${PREFIX}Works Ltd`,
    });
    expect(res.status).toBe(200);
    const rows = await history();
    expect(rows.length).toBe(before + 2);
    const fresh = rows.slice(0, 2);
    const fields = fresh.map((r) => r.field.toLowerCase()).sort();
    expect(fields).toEqual(["address", "name"]);
    const addr = fresh.find((r) => r.field.toLowerCase() === "address");
    expect(addr?.oldValue).toBe("1 Plant Road, Pune");
    expect(addr?.newValue).toBe("2 New Road, Pune");
  });

  test("BR-SCO-29 history is newest first", async () => {
    await save("owner", { stateCode: "27" });
    await save("owner", { gstin: "27CCCCC0000C1Z5" });
    await new Promise((r) => setTimeout(r, 20));
    await save("owner", { gstin: "27DDDDD0000D1Z5" });
    const rows = await history();
    expect(rows[0]?.newValue).toBe("27DDDDD0000D1Z5");
    const times = rows.map((r) => new Date(r.changedAt).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  test("BR-SCO-29 floor_supervisor (holds sco.view) can read the history", async () => {
    const res = await call("fs", "GET", "/company/settings/history");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.json.data)).toBe(true);
  });

  test("BR-SCO-29 operator (no sco.view) -> 403", async () => {
    const res = await call("operator", "GET", "/company/settings/history");
    expect(res.status).toBe(403);
  });

  test("BR-SCO-29 no token -> 401", async () => {
    const res = await call(null, "GET", "/company/settings/history");
    expect(res.status).toBe(401);
  });

  test("BR-SCO-29 history rows can't be changed or deleted through the API", async () => {
    for (const method of ["PATCH", "PUT", "DELETE"]) {
      const res = await call("owner", method, "/company/settings/history", {});
      expect([404, 405]).toContain(res.status);
    }
  });
});
