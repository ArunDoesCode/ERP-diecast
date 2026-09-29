/**
 * docs/specs/auth-setup.md (v9)
 * BR-AUTH-17 — No change may leave zero active employees with the super-admin role: 409 LAST_ADMIN.
 *   v9: the check runs inside the write transaction (concurrent changes cannot both pass it).
 *
 * Isolation: the test DB may hold other super-admins; they are made inactive for the duration of
 * this file and restored in afterAll (test database only).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, inArray, like } from "drizzle-orm";
import { createApp } from "../app";
import { db } from "../db/client";
import { authAuditLog, roles } from "../db/schemas/01_auth";
import { employees } from "../db/schemas/03_hcm";
import { invalidateActor } from "../lib/auth-middleware";
import { authService } from "../service/authService";

const app = createApp();
const PREFIX = "test_lastadm_";
const PASSWORD = "lastadm-password-123";

let saRoleId: number;
let ownerRoleId: number;
let parked: number[] = [];
const ids = {} as Record<"a" | "b", number>;
const tok = {} as Record<"a" | "b", string>;

async function cleanup() {
  const rows = await db
    .select({ id: employees.id })
    .from(employees)
    .where(like(employees.email, `${PREFIX}%`));
  if (rows.length > 0) {
    await db.delete(authAuditLog).where(
      inArray(
        authAuditLog.actorId,
        rows.map((r) => r.id),
      ),
    );
  }
  await db.delete(employees).where(like(employees.email, `${PREFIX}%`));
}

async function activeAdmins() {
  return db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.roleId, saRoleId), eq(employees.isActive, true)));
}

async function reset() {
  await db
    .update(employees)
    .set({ isActive: true, roleId: saRoleId })
    .where(inArray(employees.id, [ids.a, ids.b]));
  invalidateActor(ids.a);
  invalidateActor(ids.b);
}

function req(who: "a" | "b", method: string, path: string, body?: unknown) {
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${tok[who]}`,
      "content-type": "application/json",
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  return app.request(`/api/setup${path}`, init);
}

beforeAll(async () => {
  await cleanup();
  const [sa] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, "super-admin"))
    .limit(1);
  const [ow] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, "owner"))
    .limit(1);
  if (!sa || !ow) throw new Error("Fixture setup: seed roles missing");
  saRoleId = sa.id;
  ownerRoleId = ow.id;

  parked = (await activeAdmins()).map((r) => r.id);
  if (parked.length > 0) {
    await db
      .update(employees)
      .set({ isActive: false })
      .where(inArray(employees.id, parked));
    for (const id of parked) invalidateActor(id);
  }

  for (const t of ["a", "b"] as const) {
    const email = `${PREFIX}${t}@diecast.test`;
    const [e] = await db
      .insert(employees)
      .values({
        name: `TEST_lastadm_${t}`,
        email,
        passwordHash: await Bun.password.hash(PASSWORD),
        roleId: saRoleId,
        isActive: true,
      })
      .returning({ id: employees.id });
    if (!e) throw new Error("Fixture setup: employee insert failed");
    ids[t] = e.id;
    tok[t] = (await authService.login(email, PASSWORD)).accessToken;
  }
});

afterAll(async () => {
  await cleanup();
  if (parked.length > 0) {
    await db
      .update(employees)
      .set({ isActive: true })
      .where(inArray(employees.id, parked));
    for (const id of parked) invalidateActor(id);
  }
});

describe("BR-AUTH-17 last super-admin cannot be removed, even concurrently", () => {
  test("BR-AUTH-17 two super-admins deactivate each other at the same time: at least one stays active", async () => {
    for (let i = 0; i < 5; i++) {
      await reset();
      await Promise.all([
        req("a", "DELETE", `/employees/${ids.b}`),
        req("b", "DELETE", `/employees/${ids.a}`),
      ]);
      expect((await activeAdmins()).length).toBeGreaterThanOrEqual(1);
    }
  });

  test("BR-AUTH-17 two super-admins move each other to another role at the same time: at least one stays super-admin", async () => {
    for (let i = 0; i < 5; i++) {
      await reset();
      await Promise.all([
        req("a", "PATCH", `/employees/${ids.b}/role`, { roleId: ownerRoleId }),
        req("b", "PATCH", `/employees/${ids.a}/role`, { roleId: ownerRoleId }),
      ]);
      expect((await activeAdmins()).length).toBeGreaterThanOrEqual(1);
    }
  });

  test("BR-AUTH-17 the losing concurrent call gets 409 LAST_ADMIN (or 401 once its actor is gone), never 5xx", async () => {
    await reset();
    const [r1, r2] = await Promise.all([
      req("a", "DELETE", `/employees/${ids.b}`),
      req("b", "DELETE", `/employees/${ids.a}`),
    ]);
    for (const r of [r1, r2]) expect(r.status).toBeLessThan(500);
    expect([r1.status, r2.status].some((s) => s === 409 || s === 401)).toBe(
      true,
    );
  });
});
