/**
 * docs/specs/auth-setup.md (v6)
 * BR-AUTH-01 refresh issues tokens for the employee's current DB record
 * BR-AUTH-02 inactive employee cannot refresh (401, no tokens)
 * BR-AUTH-09 allowed only if super-admin or the current role holds the route's key; else 403 PERMISSION_DENIED + key
 * BR-AUTH-10 every non-public route declares exactly one key or "any signed-in user"
 * BR-AUTH-12 active flag, role and keys are read on every request (grant changes apply on the next request)
 * BR-AUTH-18 super-admin passes every check; system roles are protected
 * BR-AUTH-24 deny by default: a role with no keys can do nothing but sign in
 *
 * HTTP-level, real DB, through createApp(). Written by test-writer from the spec only.
 * Where a test changes data directly in the DB it then calls the exported cache hooks
 * (invalidateRole / invalidateActor), which the spec says run "on any change" (BR-AUTH-12).
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from "bun:test";
import { and, eq, like } from "drizzle-orm";
import { createApp } from "../../src/app";
import { db } from "../../src/db/client";
import { rolePermissions, roles } from "../../src/db/schemas/01_auth";
import { employees } from "../../src/db/schemas/03_hcm";
import { invalidateActor, invalidateRole } from "../../src/lib/auth-middleware";
import { PERMISSION_KEYS } from "../../src/lib/permissions";
import { getRegistry } from "../../src/lib/route-registry";
import { authService } from "../../src/service/authService";

const app = createApp();
const PREFIX = "test_authperm_";
const PASSWORD = "authperm-password-123";
const ID = "2147483000";

let keeperRoleId: number;
let emptyRoleId: number;
let poRoleId: number;
let ownerRoleId: number;
let backOfficeRoleId: number;
let superAdminRoleId: number;
const emp = {} as Record<string, number>;

async function roleIdOf(name: string) {
  const [row] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, name))
    .limit(1);
  if (!row) throw new Error(`Fixture setup: role '${name}' missing`);
  return row.id;
}

async function makeRole(name: string, keys: string[]) {
  const [r] = await db
    .insert(roles)
    .values({ name: `${PREFIX}${name}`, isSystem: false })
    .returning({ id: roles.id });
  if (!r) throw new Error("Fixture setup: role insert failed");
  if (keys.length > 0) {
    await db
      .insert(rolePermissions)
      .values(keys.map((permissionKey) => ({ roleId: r.id, permissionKey })));
  }
  return r.id;
}

async function makeEmployee(tag: string, roleId: number) {
  const email = `${PREFIX}${tag}@diecast.test`;
  const [e] = await db
    .insert(employees)
    .values({
      name: `TEST_authperm_${tag}`,
      email,
      passwordHash: await Bun.password.hash(PASSWORD),
      roleId,
      isActive: true,
    })
    .returning({ id: employees.id });
  if (!e) throw new Error("Fixture setup: employee insert failed");
  emp[tag] = e.id;
  return email;
}

async function tokenFor(email: string) {
  return (await authService.login(email, PASSWORD)).accessToken;
}

function call(token: string, method: string, path: string) {
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
  };
  if (method !== "GET" && method !== "DELETE") init.body = "{}";
  return app.request(path.replace(/:[A-Za-z]+/g, ID), init);
}

type Denied = { code?: string; key?: string };

let keeperToken: string;
let emptyToken: string;
let superToken: string;

beforeAll(async () => {
  await db.delete(employees).where(like(employees.email, `${PREFIX}%`));
  await db.delete(roles).where(like(roles.name, `${PREFIX}%`));
  ownerRoleId = await roleIdOf("owner");
  backOfficeRoleId = await roleIdOf("back_office");
  superAdminRoleId = await roleIdOf("super-admin");
  keeperRoleId = await makeRole("keeper", ["grn.edit_draft"]);
  emptyRoleId = await makeRole("empty", []);
  poRoleId = await makeRole("po", ["po.manage"]);

  keeperToken = await tokenFor(await makeEmployee("keeper", keeperRoleId));
  emptyToken = await tokenFor(await makeEmployee("empty", emptyRoleId));
  superToken = await tokenFor(await makeEmployee("super", superAdminRoleId));
});

afterAll(async () => {
  await db.delete(employees).where(like(employees.email, `${PREFIX}%`));
  await db.delete(roles).where(like(roles.name, `${PREFIX}%`));
});

describe("BR-AUTH-09 permission check on every API action", () => {
  test("BR-AUTH-09 a role without grn.qa_decide calling the QA action -> 403 PERMISSION_DENIED with the key", async () => {
    const res = await call(
      keeperToken,
      "POST",
      "/api/grn/:id/lines/:lineId/qa",
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as Denied;
    expect(body.code).toBe("PERMISSION_DENIED");
    expect(body.key).toBe("grn.qa_decide");
  });

  test("BR-AUTH-09 a held key is allowed through (not 401/403)", async () => {
    const res = await call(keeperToken, "POST", "/api/grn/creategrn");
    expect([401, 403]).not.toContain(res.status);
  });

  test("BR-AUTH-09 a held key does not open a different key's route", async () => {
    const res = await call(keeperToken, "GET", "/api/grn/getgrns");
    expect(res.status).toBe(403);
    expect(((await res.json()) as Denied).key).toBe("grn.view");
  });

  test("BR-AUTH-09 every key-guarded route answers 403 carrying its own declared key", async () => {
    const wrong: string[] = [];
    for (const d of getRegistry()) {
      if (d.auth.type !== "permission") continue;
      const res = await call(emptyToken, d.method, d.path);
      const body = (await res.json().catch(() => ({}))) as Denied;
      if (
        res.status !== 403 ||
        body.code !== "PERMISSION_DENIED" ||
        body.key !== d.auth.key
      ) {
        wrong.push(
          `${d.method} ${d.path}: ${res.status} ${body.code} ${body.key}`,
        );
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe("BR-AUTH-10 every non-public route declares one key or any-signed-in", () => {
  test("BR-AUTH-10 no route is left on a role-name list", () => {
    const legacy = getRegistry()
      .filter((d) => (d.auth as { type: string }).type === "roles")
      .map((d) => `${d.method} ${d.path}`);
    expect(legacy).toEqual([]);
  });

  test("BR-AUTH-10 each descriptor is public, any-authenticated, or exactly one known key", () => {
    const known = new Set<string>(PERMISSION_KEYS);
    const bad = getRegistry()
      .filter((d) => {
        const a = d.auth as { type: string; key?: unknown };
        if (a.type === "public" || a.type === "any-authenticated") return false;
        return !(
          a.type === "permission" &&
          typeof a.key === "string" &&
          known.has(a.key)
        );
      })
      .map((d) => `${d.method} ${d.path}`);
    expect(bad).toEqual([]);
  });

  test("BR-AUTH-10 only login, refresh and logout are public", () => {
    const pub = getRegistry()
      .filter((d) => d.auth.type === "public")
      .map((d) => `${d.method} ${d.path}`)
      .sort();
    expect(pub).toEqual(
      [
        "POST /api/auth/login",
        "POST /api/auth/logout",
        "POST /api/auth/refresh",
      ].sort(),
    );
  });
});

describe("BR-AUTH-12 changes apply on the next request, without re-login", () => {
  test("BR-AUTH-12 revoking a key -> the same token gets 403 on the next call", async () => {
    const email = await makeEmployee("revoke", poRoleId);
    const token = await tokenFor(email);
    expect((await call(token, "GET", "/api/po/getpos")).status).not.toBe(403);

    await db
      .delete(rolePermissions)
      .where(
        and(
          eq(rolePermissions.roleId, poRoleId),
          eq(rolePermissions.permissionKey, "po.manage"),
        ),
      );
    invalidateRole(poRoleId);

    const res = await call(token, "GET", "/api/po/getpos");
    expect(res.status).toBe(403);
    expect(((await res.json()) as Denied).key).toBe("po.manage");
  });

  test("BR-AUTH-12 granting a key -> the same token is allowed on the next call", async () => {
    const roleId = await makeRole("grantlater", []);
    const token = await tokenFor(await makeEmployee("grantlater", roleId));
    expect((await call(token, "GET", "/api/grn/getgrns")).status).toBe(403);

    await db
      .insert(rolePermissions)
      .values({ roleId, permissionKey: "grn.view" });
    invalidateRole(roleId);

    expect([401, 403]).not.toContain(
      (await call(token, "GET", "/api/grn/getgrns")).status,
    );
  });

  test("BR-AUTH-12 changing the employee's role -> the same token uses the new role's keys", async () => {
    const token = await tokenFor(await makeEmployee("rolechg", emptyRoleId));
    expect((await call(token, "GET", "/api/po/getpos")).status).toBe(403);

    await db
      .update(employees)
      .set({ roleId: ownerRoleId })
      .where(eq(employees.id, emp.rolechg as number));
    invalidateActor(emp.rolechg as number);

    expect([401, 403]).not.toContain(
      (await call(token, "GET", "/api/po/getpos")).status,
    );
  });

  test("BR-AUTH-12 deactivating the employee -> the same token gets 401 on the next call", async () => {
    const token = await tokenFor(await makeEmployee("deact", ownerRoleId));
    expect((await call(token, "GET", "/api/po/getpos")).status).not.toBe(401);

    await db
      .update(employees)
      .set({ isActive: false })
      .where(eq(employees.id, emp.deact as number));
    invalidateActor(emp.deact as number);

    const res = await call(token, "GET", "/api/po/getpos");
    expect(res.status).toBe(401);
  });

  test("BR-AUTH-12 an employee deactivated after login is also 401 on any-signed-in routes", async () => {
    const token = await tokenFor(await makeEmployee("deact2", ownerRoleId));
    await db
      .update(employees)
      .set({ isActive: false })
      .where(eq(employees.id, emp.deact2 as number));
    invalidateActor(emp.deact2 as number);
    expect((await call(token, "GET", "/api/auth/me")).status).toBe(401);
  });
});

describe("BR-AUTH-18 super-admin bypass and protected system roles", () => {
  // Guard the seed rows: if the code under test wrongly allows a rename, put the name back.
  afterEach(async () => {
    await db
      .update(roles)
      .set({ name: "super-admin" })
      .where(eq(roles.id, superAdminRoleId));
    await db
      .update(roles)
      .set({ name: "owner" })
      .where(eq(roles.id, ownerRoleId));
  });

  test("BR-AUTH-18 super-admin holds no grants yet passes a key-guarded route", async () => {
    const grants = await db
      .select()
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, superAdminRoleId));
    expect(grants).toEqual([]);
    const res = await call(superToken, "GET", "/api/setup/roles");
    expect([401, 403]).not.toContain(res.status);
  });

  test("BR-AUTH-18 super-admin passes routes whose keys no role holds", async () => {
    for (const [m, p] of [
      ["GET", "/api/approval/getPolicies"],
      ["POST", "/api/approval/createPolicy"],
      ["GET", "/api/setup/employees"],
    ] as const) {
      const res = await call(superToken, m, p);
      expect([401, 403]).not.toContain(res.status);
    }
  });

  test("BR-AUTH-18 super-admin passes every key-guarded route (never 401/403)", async () => {
    const wrong: string[] = [];
    for (const d of getRegistry()) {
      if (d.auth.type !== "permission") continue;
      const res = await call(superToken, d.method, d.path);
      if (res.status === 401 || res.status === 403) {
        wrong.push(`${d.method} ${d.path}: ${res.status}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  test("BR-AUTH-18 super-admin cannot be renamed -> 403 SYSTEM_ROLE_PROTECTED", async () => {
    const res = await app.request(`/api/setup/roles/${superAdminRoleId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${superToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: `${PREFIX}renamed` }),
    });
    expect(res.status).toBe(403);
    expect(((await res.json()) as Denied).code).toBe("SYSTEM_ROLE_PROTECTED");
    expect(await roleIdOf("super-admin")).toBe(superAdminRoleId);
  });

  test("BR-AUTH-18 super-admin cannot be deleted -> 403 SYSTEM_ROLE_PROTECTED", async () => {
    const res = await call(
      superToken,
      "DELETE",
      `/api/setup/roles/${superAdminRoleId}`,
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as Denied).code).toBe("SYSTEM_ROLE_PROTECTED");
    expect(await roleIdOf("super-admin")).toBe(superAdminRoleId);
  });

  test("BR-AUTH-18 another system role (owner) cannot be renamed -> 403", async () => {
    const res = await app.request(`/api/setup/roles/${ownerRoleId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${superToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: `${PREFIX}owner_renamed` }),
    });
    expect(res.status).toBe(403);
    expect(await roleIdOf("owner")).toBe(ownerRoleId);
  });

  test("BR-AUTH-18 another system role cannot be deleted -> 403", async () => {
    const [sys] = await db
      .insert(roles)
      .values({ name: `${PREFIX}sysrole`, isSystem: true })
      .returning({ id: roles.id });
    const res = await call(superToken, "DELETE", `/api/setup/roles/${sys?.id}`);
    expect(res.status).toBe(403);
    const [still] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.id, sys?.id as number));
    expect(still).toBeDefined();
  });
});

describe("BR-AUTH-24 deny by default", () => {
  test("BR-AUTH-24 a role with no keys is 403 on every key-guarded route", async () => {
    const allowed: string[] = [];
    for (const d of getRegistry()) {
      if (d.auth.type !== "permission") continue;
      const res = await call(emptyToken, d.method, d.path);
      if (res.status !== 403) {
        allowed.push(`${d.method} ${d.path}: ${res.status}`);
      }
    }
    expect(allowed).toEqual([]);
  });

  test("BR-AUTH-24 a role with no keys can still read /auth/me, with no permissions", async () => {
    const res = await call(emptyToken, "GET", "/api/auth/me");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { permissions: string[] } };
    expect(body.data.permissions).toEqual([]);
  });
});

describe("BR-AUTH-01 / BR-AUTH-02 refresh reads the current employee record", () => {
  const R_EMAIL = `${PREFIX}refresh@diecast.test`;
  let ip = 0;
  const cookieOf = (res: Response) =>
    (res.headers.get("set-cookie") ?? "").match(/refresh_token=([^;]+)/)?.[1];
  const loginHttp = (email: string) =>
    app.request("/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": `10.88.0.${++ip}`,
      },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
  const refreshHttp = (token: string) =>
    app.request("/api/auth/refresh", {
      method: "POST",
      headers: { cookie: `refresh_token=${token}` },
    });

  beforeAll(async () => {
    await makeEmployee("refresh", backOfficeRoleId);
  });

  test("BR-AUTH-01 back_office changed to owner, refresh -> /auth/me shows owner and owner's keys", async () => {
    const login = await loginHttp(R_EMAIL);
    expect(login.status).toBe(200);
    const cookie = cookieOf(login) as string;

    await db
      .update(employees)
      .set({ roleId: ownerRoleId })
      .where(eq(employees.id, emp.refresh as number));
    invalidateActor(emp.refresh as number);

    const refreshed = await refreshHttp(cookie);
    expect(refreshed.status).toBe(200);
    const accessToken = (
      (await refreshed.json()) as { data: { accessToken: string } }
    ).data.accessToken;

    const me = await call(accessToken, "GET", "/api/auth/me");
    expect(me.status).toBe(200);
    const data = (
      (await me.json()) as {
        data: { role: string; permissions: string[] };
      }
    ).data;
    expect(data.role).toBe("owner");
    const ownerKeys = (
      await db
        .select({ key: rolePermissions.permissionKey })
        .from(rolePermissions)
        .where(eq(rolePermissions.roleId, ownerRoleId))
    ).map((r) => r.key);
    expect([...data.permissions].sort()).toEqual([...ownerKeys].sort());
  });

  test("BR-AUTH-02 deactivated, refresh -> 401 and no new tokens", async () => {
    await db
      .update(employees)
      .set({ roleId: backOfficeRoleId, isActive: true })
      .where(eq(employees.id, emp.refresh as number));
    invalidateActor(emp.refresh as number);
    const cookie = cookieOf(await loginHttp(R_EMAIL)) as string;

    await db
      .update(employees)
      .set({ isActive: false })
      .where(eq(employees.id, emp.refresh as number));
    invalidateActor(emp.refresh as number);

    const res = await refreshHttp(cookie);
    expect(res.status).toBe(401);
    expect(cookieOf(res)).toBeFalsy();
    const body = (await res.json()) as { data?: { accessToken?: string } };
    expect(body.data?.accessToken).toBeUndefined();
  });
});
