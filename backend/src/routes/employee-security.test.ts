/**
 * docs/specs/auth-setup.md (v9)
 * BR-AUTH-05 refresh token single use; password / login-method change and deactivation revoke it
 * BR-AUTH-13 login and /auth/me return role, permissions, screens
 * BR-AUTH-16 no escalation on any change to an employee (edit, deactivate, QR regenerate)
 * BR-AUTH-19 role held only by inactive employees cannot be deleted (ROLE_HAS_INACTIVE_EMPLOYEES)
 * BR-AUTH-20 employee create / edit / QR regenerate are logged, never with secrets
 *
 * HTTP-level + service-level, real DB. Written by test-writer from the spec only.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, inArray, like } from "drizzle-orm";
import { createApp } from "../app";
import { db } from "../db/client";
import {
  authAuditLog,
  permissions,
  refreshTokens,
  rolePermissions,
  roles,
  screens,
} from "../db/schemas/01_auth";
import { employees } from "../db/schemas/03_hcm";
import { authService } from "../service/authService";

const app = createApp();
const PREFIX = "test_empsec_";
const PASSWORD = "empsec-password-123";

const emp = {} as Record<string, number>;
const token = {} as Record<string, string>;
const roleId = {} as Record<string, number>;

// biome-ignore lint/suspicious/noExplicitAny: loose JSON in test responses
type Json = Record<string, any>;

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
  roleId[name] = r.id;
  return r.id;
}

async function makeUser(
  tag: string,
  rid: number,
  opts: { login?: boolean; active?: boolean } = {},
) {
  const email = `${PREFIX}${tag}@diecast.test`;
  const [e] = await db
    .insert(employees)
    .values({
      name: `TEST_empsec_${tag}`,
      email,
      passwordHash: await Bun.password.hash(PASSWORD),
      roleId: rid,
      isActive: opts.active ?? true,
    })
    .returning({ id: employees.id });
  if (!e) throw new Error("Fixture setup: employee insert failed");
  emp[tag] = e.id;
  if (opts.login !== false && (opts.active ?? true)) {
    token[tag] = (await authService.login(email, PASSWORD)).accessToken;
  }
}

async function call(tag: string, method: string, path: string, body?: unknown) {
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token[tag]}`,
      "content-type": "application/json",
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await app.request(`/api${path}`, init);
  const json = (await res.json().catch(() => ({}))) as Json;
  return { status: res.status, json };
}

async function logsBy(actorTag: string) {
  return db
    .select()
    .from(authAuditLog)
    .where(eq(authAuditLog.actorId, emp[actorTag] as number));
}

async function empRow(tag: string) {
  const [r] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, emp[tag] as number));
  return r;
}

async function tokenCount(tag: string) {
  const rows = await db
    .select({ id: refreshTokens.id })
    .from(refreshTokens)
    .where(eq(refreshTokens.employeeId, emp[tag] as number));
  return rows.length;
}

async function cleanup() {
  const ids = (
    await db
      .select({ id: employees.id })
      .from(employees)
      .where(like(employees.name, "TEST_empsec_%"))
  ).map((e) => e.id);
  if (ids.length > 0) {
    await db.delete(authAuditLog).where(inArray(authAuditLog.actorId, ids));
  }
  await db.delete(employees).where(like(employees.name, "TEST_empsec_%"));
  await db.delete(roles).where(like(roles.name, `${PREFIX}%`));
}

beforeAll(async () => {
  await cleanup();
  const [sa] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, "super-admin"))
    .limit(1);
  if (!sa) throw new Error("Fixture setup: super-admin role missing");

  await makeRole("plain", []);
  await makeRole("empmgr", ["setup.employees.manage", "pr.manage"]);
  await makeRole("wide", ["pr.manage", "grn.correct"]);
  await makeRole("grncorr", ["grn.correct"]);
  await makeRole("inactiveonly", []);

  await makeUser("sa", sa.id);
  await makeUser("sa2", sa.id, { login: false });
  await makeUser("mgr", roleId.empmgr as number);
  await makeUser("wide", roleId.wide as number, { login: false });
  await makeUser("grncorr", roleId.grncorr as number);
  await makeUser("plainuser", roleId.plain as number);
  await makeUser("inactive1", roleId.inactiveonly as number, {
    active: false,
  });
});

afterAll(async () => {
  await cleanup();
});

// ---------------------------------------------------------------------------
describe("BR-AUTH-16 no escalation on edit / deactivate / QR regenerate", () => {
  test("BR-AUTH-16 non-super-admin editing a super-admin (password) -> 403 ROLE_NOT_ASSIGNABLE, password unchanged", async () => {
    const before = await empRow("sa2");
    const { status, json } = await call(
      "mgr",
      "PATCH",
      `/setup/employees/${emp.sa2}`,
      {
        name: "TEST_empsec_sa2",
        roleId: roleId.plain,
        loginMethod: "password",
        password: "takeover-password-1",
      },
    );
    expect(status).toBe(403);
    expect(json.code).toBe("ROLE_NOT_ASSIGNABLE");
    const after = await empRow("sa2");
    expect(after?.passwordHash).toBe(before?.passwordHash);
    expect(after?.roleId).toBe(before?.roleId);
  });

  test("BR-AUTH-16 non-super-admin editing an employee whose role holds keys they lack -> 403 ROLE_NOT_ASSIGNABLE", async () => {
    const before = await empRow("wide");
    const { status, json } = await call(
      "mgr",
      "PATCH",
      `/setup/employees/${emp.wide}`,
      {
        name: "TEST_empsec_wide_renamed",
        roleId: roleId.wide,
        loginMethod: "password",
      },
    );
    expect(status).toBe(403);
    expect(json.code).toBe("ROLE_NOT_ASSIGNABLE");
    expect((await empRow("wide"))?.name).toBe(before?.name as string);
  });

  test("BR-AUTH-16 non-super-admin may edit an employee whose role they could assign (control)", async () => {
    const { status } = await call(
      "mgr",
      "PATCH",
      `/setup/employees/${emp.plainuser}`,
      {
        name: "TEST_empsec_plainuser",
        roleId: roleId.plain,
        loginMethod: "password",
      },
    );
    expect(status).toBe(200);
  });

  test("BR-AUTH-16 super-admin may edit a super-admin (control)", async () => {
    const { status } = await call(
      "sa",
      "PATCH",
      `/setup/employees/${emp.sa2}`,
      {
        name: "TEST_empsec_sa2",
        roleId: (await empRow("sa2"))?.roleId,
        loginMethod: "password",
      },
    );
    expect(status).toBe(200);
  });

  test("BR-AUTH-16 non-super-admin deactivating a super-admin -> 403 ROLE_NOT_ASSIGNABLE, still active", async () => {
    const { status, json } = await call(
      "mgr",
      "DELETE",
      `/setup/employees/${emp.sa2}`,
    );
    expect(status).toBe(403);
    expect(json.code).toBe("ROLE_NOT_ASSIGNABLE");
    expect((await empRow("sa2"))?.isActive).toBe(true);
  });

  test("BR-AUTH-16 non-super-admin deactivating a higher-role employee -> 403 ROLE_NOT_ASSIGNABLE, still active", async () => {
    const { status, json } = await call(
      "mgr",
      "DELETE",
      `/setup/employees/${emp.wide}`,
    );
    expect(status).toBe(403);
    expect(json.code).toBe("ROLE_NOT_ASSIGNABLE");
    expect((await empRow("wide"))?.isActive).toBe(true);
  });

  test("BR-AUTH-16 non-super-admin regenerating QR for a super-admin -> 403 ROLE_NOT_ASSIGNABLE, QR unchanged", async () => {
    const before = await empRow("sa2");
    const { status, json } = await call(
      "mgr",
      "POST",
      `/setup/employees/${emp.sa2}/qr`,
    );
    expect(status).toBe(403);
    expect(json.code).toBe("ROLE_NOT_ASSIGNABLE");
    expect((await empRow("sa2"))?.qrToken).toBe(before?.qrToken ?? null);
  });

  test("BR-AUTH-16 non-super-admin regenerating QR for a higher-role employee -> 403", async () => {
    const { status, json } = await call(
      "mgr",
      "POST",
      `/setup/employees/${emp.wide}/qr`,
    );
    expect(status).toBe(403);
    expect(json.code).toBe("ROLE_NOT_ASSIGNABLE");
  });

  test("BR-AUTH-16 non-super-admin regenerating QR for an assignable-role employee -> 200 with a token (control)", async () => {
    const { status, json } = await call(
      "mgr",
      "POST",
      `/setup/employees/${emp.plainuser}/qr`,
    );
    expect(status).toBe(200);
    expect(typeof json.data.qrToken).toBe("string");
    expect(json.data.qrToken.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
describe("BR-AUTH-20 employee create / edit / QR regenerate are logged without secrets", () => {
  test("BR-AUTH-20 creating an employee adds a log row for the actor, with no password or hash in it", async () => {
    const before = (await logsBy("mgr")).length;
    const { status, json } = await call("mgr", "POST", "/setup/employees", {
      name: "TEST_empsec_created",
      email: `${PREFIX}created@diecast.test`,
      password: "created-secret-pw-1",
      roleId: roleId.plain,
      loginMethod: "password",
    });
    expect(status).toBe(201);
    emp.created = json.data.id;
    const rows = await logsBy("mgr");
    expect(rows.length).toBeGreaterThan(before);
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain("created-secret-pw-1");
    const [created] = await db
      .select({ h: employees.passwordHash })
      .from(employees)
      .where(eq(employees.id, emp.created as number));
    if (created?.h) expect(dump).not.toContain(created.h);
  });

  test("BR-AUTH-20 editing email and changing password adds a log row with the new email and no password value", async () => {
    const before = (await logsBy("sa")).length;
    const newEmail = `${PREFIX}plainuser_new@diecast.test`;
    const { status } = await call(
      "sa",
      "PATCH",
      `/setup/employees/${emp.plainuser}`,
      {
        name: "TEST_empsec_plainuser",
        email: newEmail,
        roleId: roleId.plain,
        loginMethod: "password",
        password: "changed-secret-pw-2",
      },
    );
    expect(status).toBe(200);
    const rows = await logsBy("sa");
    expect(rows.length).toBeGreaterThan(before);
    const dump = JSON.stringify(rows);
    expect(dump).toContain(newEmail);
    expect(dump).not.toContain("changed-secret-pw-2");
    const row = await empRow("plainuser");
    if (row?.passwordHash) expect(dump).not.toContain(row.passwordHash);
  });

  test("BR-AUTH-20 QR regenerate adds a log row for the actor and never contains the raw token", async () => {
    const before = (await logsBy("sa")).length;
    const { status, json } = await call(
      "sa",
      "POST",
      `/setup/employees/${emp.plainuser}/qr`,
    );
    expect(status).toBe(200);
    const raw = json.data.qrToken as string;
    const rows = await logsBy("sa");
    expect(rows.length).toBeGreaterThan(before);
    expect(JSON.stringify(rows)).not.toContain(raw);
  });

  test("BR-AUTH-20 the log is read-only over HTTP (no write verbs on /setup/access-log)", async () => {
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      const { status } = await call("sa", method, "/setup/access-log", {});
      expect([404, 405]).toContain(status);
    }
  });
});

// ---------------------------------------------------------------------------
describe("BR-AUTH-05 refresh tokens", () => {
  test("BR-AUTH-05 a refresh token works once; reuse -> 401", async () => {
    const login = await authService.login(`${PREFIX}sa@diecast.test`, PASSWORD);
    await authService.refresh(login.refreshToken);
    await expect(authService.refresh(login.refreshToken)).rejects.toMatchObject(
      {
        statusCode: 401,
      },
    );
  });

  test("BR-AUTH-05 logout revokes the refresh token -> later refresh 401", async () => {
    const login = await authService.login(`${PREFIX}sa@diecast.test`, PASSWORD);
    await authService.logout(login.refreshToken);
    await expect(authService.refresh(login.refreshToken)).rejects.toMatchObject(
      {
        statusCode: 401,
      },
    );
  });

  test("BR-AUTH-05 concurrent refresh with the same token: exactly one succeeds, the rest 401", async () => {
    const login = await authService.login(`${PREFIX}sa@diecast.test`, PASSWORD);
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => authService.refresh(login.refreshToken)),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    const bad = results.filter((r) => r.status === "rejected");
    expect(ok.length).toBe(1);
    expect(bad.length).toBe(5);
    for (const r of bad) {
      expect((r as PromiseRejectedResult).reason).toMatchObject({
        statusCode: 401,
      });
    }
  });

  test("BR-AUTH-05 a password change revokes that employee's refresh tokens", async () => {
    await makeUser("pwvictim", roleId.plain as number);
    const login = await authService.login(
      `${PREFIX}pwvictim@diecast.test`,
      PASSWORD,
    );
    expect(await tokenCount("pwvictim")).toBeGreaterThan(0);
    const { status } = await call(
      "sa",
      "PATCH",
      `/setup/employees/${emp.pwvictim}`,
      {
        name: "TEST_empsec_pwvictim",
        roleId: roleId.plain,
        loginMethod: "password",
        password: "new-victim-password-9",
      },
    );
    expect(status).toBe(200);
    expect(await tokenCount("pwvictim")).toBe(0);
    await expect(authService.refresh(login.refreshToken)).rejects.toMatchObject(
      {
        statusCode: 401,
      },
    );
  });

  test("BR-AUTH-05 a login-method change revokes that employee's refresh tokens", async () => {
    await makeUser("methvictim", roleId.plain as number);
    const login = await authService.login(
      `${PREFIX}methvictim@diecast.test`,
      PASSWORD,
    );
    expect(await tokenCount("methvictim")).toBeGreaterThan(0);
    const { status } = await call(
      "sa",
      "PATCH",
      `/setup/employees/${emp.methvictim}`,
      {
        name: "TEST_empsec_methvictim",
        roleId: roleId.plain,
        loginMethod: "qr",
      },
    );
    expect(status).toBe(200);
    expect(await tokenCount("methvictim")).toBe(0);
    await expect(authService.refresh(login.refreshToken)).rejects.toMatchObject(
      {
        statusCode: 401,
      },
    );
  });

  test("BR-AUTH-05 deactivation revokes that employee's refresh tokens", async () => {
    await makeUser("deavictim", roleId.plain as number);
    await authService.login(`${PREFIX}deavictim@diecast.test`, PASSWORD);
    expect(await tokenCount("deavictim")).toBeGreaterThan(0);
    const { status } = await call(
      "sa",
      "DELETE",
      `/setup/employees/${emp.deavictim}`,
    );
    expect(status).toBe(200);
    expect((await empRow("deavictim"))?.isActive).toBe(false);
    expect(await tokenCount("deavictim")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe("BR-AUTH-13 login and /auth/me return role, permissions and screens", () => {
  test("BR-AUTH-13 /auth/me for a user with grn.correct lists it, with role name and screens array", async () => {
    const { status, json } = await call("grncorr", "GET", "/auth/me");
    expect(status).toBe(200);
    expect(json.data.role).toBe(`${PREFIX}grncorr`);
    expect(json.data.permissions).toContain("grn.correct");
    expect(Array.isArray(json.data.screens)).toBe(true);
  });

  test("BR-AUTH-13 /auth/me for a user without grn.correct does not list it", async () => {
    const { status, json } = await call("plainuser", "GET", "/auth/me");
    expect(status).toBe(200);
    expect(json.data.permissions).not.toContain("grn.correct");
    expect(json.data.role).toBe(`${PREFIX}plain`);
  });

  test("BR-AUTH-13 login response carries role, permissions and screens", async () => {
    const login = await authService.login(
      `${PREFIX}grncorr@diecast.test`,
      PASSWORD,
    );
    expect(login.user.role).toBe(`${PREFIX}grncorr`);
    expect(login.user.permissions).toContain("grn.correct");
    expect(Array.isArray(login.user.screens)).toBe(true);
  });

  test("BR-AUTH-13 super-admin gets every key and every screen", async () => {
    const { json } = await call("sa", "GET", "/auth/me");
    const allKeys = (
      await db.select({ k: permissions.key }).from(permissions)
    ).map((r) => r.k);
    const allScreens = await db.select({ k: screens.key }).from(screens);
    for (const k of allKeys) expect(json.data.permissions).toContain(k);
    expect(json.data.screens.length).toBe(allScreens.length);
  });

  test("BR-AUTH-13 /auth/me reflects a grant change (permissions come from the DB)", async () => {
    await db
      .insert(rolePermissions)
      .values({ roleId: roleId.plain as number, permissionKey: "grn.correct" });
    try {
      const { invalidateRole } = await import("../lib/auth-middleware");
      invalidateRole(roleId.plain as number);
      const { json } = await call("plainuser", "GET", "/auth/me");
      expect(json.data.permissions).toContain("grn.correct");
    } finally {
      await db
        .delete(rolePermissions)
        .where(
          and(
            eq(rolePermissions.roleId, roleId.plain as number),
            eq(rolePermissions.permissionKey, "grn.correct"),
          ),
        );
      const { invalidateRole } = await import("../lib/auth-middleware");
      invalidateRole(roleId.plain as number);
    }
  });
});

// ---------------------------------------------------------------------------
describe("BR-AUTH-19 role delete blocked by employees", () => {
  test("BR-AUTH-19 role held only by inactive employees -> 409 ROLE_HAS_INACTIVE_EMPLOYEES, role kept", async () => {
    const { status, json } = await call(
      "sa",
      "DELETE",
      `/setup/roles/${roleId.inactiveonly}`,
    );
    expect(status).toBe(409);
    expect(json.code).toBe("ROLE_HAS_INACTIVE_EMPLOYEES");
    const [r] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.id, roleId.inactiveonly as number));
    expect(r).toBeDefined();
  });

  test("BR-AUTH-19 role held by an active employee -> 409 ROLE_HAS_EMPLOYEES", async () => {
    const { status, json } = await call(
      "sa",
      "DELETE",
      `/setup/roles/${roleId.grncorr}`,
    );
    expect(status).toBe(409);
    expect(json.code).toBe("ROLE_HAS_EMPLOYEES");
  });
});
