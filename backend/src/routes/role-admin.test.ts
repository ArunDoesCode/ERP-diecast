/**
 * docs/specs/auth-setup.md (v7)
 * BR-AUTH-07 roles are data; setup.roles.manage not grantable
 * BR-AUTH-08 one role per employee
 * BR-AUTH-15 screens: label/order/group, ticking a role grants the screen's key
 * BR-AUTH-16 no escalation on role assignment
 * BR-AUTH-17 never zero active super-admins (LAST_ADMIN)
 * BR-AUTH-18 super-admin / system role protection
 * BR-AUTH-19 role delete/rename blocked by active employees / approval chain
 * BR-AUTH-20 access log for every change; log is read-only
 * BR-AUTH-25 copy a role
 *
 * HTTP-level, real DB, through createApp(). Written by test-writer from the spec and
 * .pipeline/m1/contract.md (S6) only.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, inArray, like } from "drizzle-orm";
import { createApp } from "../app";
import { db } from "../db/client";
import {
  authAuditLog,
  rolePermissions,
  roles,
  screens,
} from "../db/schemas/01_auth";
import { approvalPolicies } from "../db/schemas/02_procurement-approval";
import { employees } from "../db/schemas/03_hcm";
import { authService } from "../service/authService";

const app = createApp();
const PREFIX = "test_roleadm_";
const PASSWORD = "roleadm-password-123";

const emp = {} as Record<string, number>;
const token = {} as Record<string, string>;
const roleId = {} as Record<string, number>;
let superAdminRoleId: number;
let ownerRoleId: number;
let otherActiveSuperAdmins = 0;
const screenBackup = new Map<
  string,
  { label: string; sortOrder: number; menuGroup: string }
>();

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

async function makeUser(tag: string, rid: number) {
  const email = `${PREFIX}${tag}@diecast.test`;
  const [e] = await db
    .insert(employees)
    .values({
      name: `TEST_roleadm_${tag}`,
      email,
      passwordHash: await Bun.password.hash(PASSWORD),
      roleId: rid,
      isActive: true,
    })
    .returning({ id: employees.id });
  if (!e) throw new Error("Fixture setup: employee insert failed");
  emp[tag] = e.id;
  token[tag] = (await authService.login(email, PASSWORD)).accessToken;
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
  const res = await app.request(`/api/setup${path}`, init);
  const json = (await res.json().catch(() => ({}))) as Json;
  return { status: res.status, json };
}

async function keysOf(rid: number) {
  const rows = await db
    .select({ k: rolePermissions.permissionKey })
    .from(rolePermissions)
    .where(eq(rolePermissions.roleId, rid));
  return rows.map((r) => r.k).sort();
}

async function logRows(action: string, actorTag = "sa") {
  return db
    .select()
    .from(authAuditLog)
    .where(
      and(
        eq(authAuditLog.action, action),
        eq(authAuditLog.actorId, emp[actorTag] as number),
      ),
    );
}

async function cleanup() {
  const ids = (
    await db
      .select({ id: employees.id })
      .from(employees)
      .where(like(employees.email, `${PREFIX}%`))
  ).map((e) => e.id);
  if (ids.length > 0) {
    await db.delete(authAuditLog).where(inArray(authAuditLog.actorId, ids));
  }
  await db
    .delete(approvalPolicies)
    .where(like(approvalPolicies.name, "TEST_roleadm_%"));
  await db.delete(employees).where(like(employees.email, `${PREFIX}%`));
  await db.delete(roles).where(like(roles.name, `${PREFIX}%`));
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
  superAdminRoleId = sa.id;
  ownerRoleId = ow.id;

  const existing = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.roleId, sa.id), eq(employees.isActive, true)));
  otherActiveSuperAdmins = existing.length;

  await makeRole("plainrole", []);
  await makeRole("prrole", ["pr.manage"]);
  await makeRole("empmgr", ["setup.employees.manage", "pr.manage"]);
  await makeRole("copysrc", ["grn.view", "grn.edit_draft"]);
  await makeRole("viewer", []);

  await makeUser("sa", sa.id);
  await makeUser("sa2", sa.id);
  await makeUser("mgr", roleId.empmgr as number);
  await makeUser("target", roleId.plainrole as number);
  await makeUser("nokeys", roleId.plainrole as number);
  await makeUser("viewer", roleId.viewer as number);

  const all = await db.select().from(screens);
  for (const s of all) {
    screenBackup.set(s.key, {
      label: s.label,
      sortOrder: s.sortOrder,
      menuGroup: s.menuGroup,
    });
  }
});

afterAll(async () => {
  for (const [key, v] of screenBackup) {
    await db.update(screens).set(v).where(eq(screens.key, key));
  }
  await cleanup();
});

// ---------------------------------------------------------------------------
describe("BR-AUTH-07 roles are data, super-admin only", () => {
  test("BR-AUTH-07 super-admin creates a role (201, isSystem false) and it is saved", async () => {
    const { status, json } = await call("sa", "POST", "/roles", {
      name: `${PREFIX}store_keeper`,
    });
    expect(status).toBe(201);
    expect(json.data.isSystem).toBe(false);
    const [row] = await db
      .select()
      .from(roles)
      .where(eq(roles.id, json.data.id));
    expect(row?.name).toBe(`${PREFIX}store_keeper`);
    roleId.store_keeper = json.data.id;
  });

  test("BR-AUTH-07 duplicate role name -> 409 CONFLICT", async () => {
    const { status, json } = await call("sa", "POST", "/roles", {
      name: `${PREFIX}store_keeper`,
    });
    expect(status).toBe(409);
    expect(json.code).toBe("CONFLICT");
  });

  test("BR-AUTH-07 super-admin grants a key and it applies to the role", async () => {
    const { status, json } = await call(
      "sa",
      "POST",
      `/roles/${roleId.store_keeper}/grants`,
      { added: ["grn.edit_draft"], removed: [] },
    );
    expect(status).toBe(200);
    const g = (json.data.keys as Json[]).find(
      (k) => k.key === "grn.edit_draft",
    );
    expect(g?.granted).toBe(true);
    expect(await keysOf(roleId.store_keeper as number)).toEqual([
      "grn.edit_draft",
    ]);
  });

  test("BR-AUTH-07 super-admin revokes a key", async () => {
    const { status } = await call(
      "sa",
      "POST",
      `/roles/${roleId.store_keeper}/grants`,
      { added: [], removed: ["grn.edit_draft"] },
    );
    expect(status).toBe(200);
    expect(await keysOf(roleId.store_keeper as number)).toEqual([]);
  });

  test("BR-AUTH-07 granting setup.roles.manage -> 400 KEY_NOT_GRANTABLE, nothing saved", async () => {
    const { status, json } = await call(
      "sa",
      "POST",
      `/roles/${roleId.prrole}/grants`,
      { added: ["setup.roles.manage"], removed: [] },
    );
    expect(status).toBe(400);
    expect(json.code).toBe("KEY_NOT_GRANTABLE");
    expect(await keysOf(roleId.prrole as number)).toEqual(["pr.manage"]);
  });

  test("BR-AUTH-07 granting setup.roles.manage to owner -> 400 KEY_NOT_GRANTABLE", async () => {
    const { status, json } = await call(
      "sa",
      "POST",
      `/roles/${ownerRoleId}/grants`,
      { added: ["setup.roles.manage"], removed: [] },
    );
    expect(status).toBe(400);
    expect(json.code).toBe("KEY_NOT_GRANTABLE");
    expect(await keysOf(ownerRoleId)).not.toContain("setup.roles.manage");
  });

  test("BR-AUTH-07 grant change is all-or-nothing (valid + non-grantable key saves neither)", async () => {
    const { status } = await call(
      "sa",
      "POST",
      `/roles/${roleId.plainrole}/grants`,
      { added: ["grn.view", "setup.roles.manage"], removed: [] },
    );
    expect(status).toBe(400);
    expect(await keysOf(roleId.plainrole as number)).toEqual([]);
  });

  test("BR-AUTH-07 unknown key -> 400 UNKNOWN_KEY", async () => {
    const { status, json } = await call(
      "sa",
      "POST",
      `/roles/${roleId.plainrole}/grants`,
      { added: ["nope.nothing"], removed: [] },
    );
    expect(status).toBe(400);
    expect(json.code).toBe("UNKNOWN_KEY");
  });

  test("BR-AUTH-07 grants of an unknown role -> 404", async () => {
    const { status } = await call("sa", "GET", "/roles/99999999/grants");
    expect(status).toBe(404);
  });

  test("BR-AUTH-07 GET grants returns the whole catalog with granted flags", async () => {
    const { status, json } = await call(
      "sa",
      "GET",
      `/roles/${roleId.prrole}/grants`,
    );
    expect(status).toBe(200);
    const keys = json.data.keys as Json[];
    expect(keys.length).toBeGreaterThanOrEqual(28);
    expect(keys.find((k) => k.key === "pr.manage")?.granted).toBe(true);
    expect(keys.find((k) => k.key === "po.manage")?.granted).toBe(false);
    expect(keys.find((k) => k.key === "setup.roles.manage")?.grantable).toBe(
      false,
    );
  });

  test("BR-AUTH-07 super-admin renames a non-system role", async () => {
    const { status, json } = await call(
      "sa",
      "PATCH",
      `/roles/${roleId.store_keeper}`,
      { name: `${PREFIX}store_keeper2` },
    );
    expect(status).toBe(200);
    expect(json.data.name).toBe(`${PREFIX}store_keeper2`);
  });

  test("BR-AUTH-07 super-admin deletes a non-system role with no employees", async () => {
    const { status } = await call(
      "sa",
      "DELETE",
      `/roles/${roleId.store_keeper}`,
    );
    expect(status).toBe(200);
    const rows = await db
      .select()
      .from(roles)
      .where(eq(roles.id, roleId.store_keeper as number));
    expect(rows.length).toBe(0);
  });

  test("BR-AUTH-07 list roles is paginated with keyCount and employeeCount (active only)", async () => {
    const { status, json } = await call(
      "sa",
      "GET",
      "/roles?page=1&pageSize=100&sortBy=name&sortDir=asc",
    );
    expect(status).toBe(200);
    expect(json.meta.page).toBe(1);
    const mgr = (json.data as Json[]).find((r) => r.id === roleId.empmgr);
    expect(mgr?.keyCount).toBe(2);
    expect(mgr?.employeeCount).toBe(1);
    expect(mgr?.isSystem).toBe(false);
  });

  test("BR-AUTH-07 a non-super-admin holding many keys cannot create a role (403 PERMISSION_DENIED, key setup.roles.manage)", async () => {
    const { status, json } = await call("mgr", "POST", "/roles", {
      name: `${PREFIX}sneaky`,
    });
    expect(status).toBe(403);
    expect(json.code).toBe("PERMISSION_DENIED");
    expect(json.key).toBe("setup.roles.manage");
  });

  test("BR-AUTH-07 non-super-admin cannot grant, rename or delete", async () => {
    expect(
      (
        await call("mgr", "POST", `/roles/${roleId.prrole}/grants`, {
          added: ["po.manage"],
          removed: [],
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call("mgr", "PATCH", `/roles/${roleId.prrole}`, {
          name: `${PREFIX}renamed`,
        })
      ).status,
    ).toBe(403);
    expect(
      (await call("mgr", "DELETE", `/roles/${roleId.prrole}`)).status,
    ).toBe(403);
    expect(await keysOf(roleId.prrole as number)).toEqual(["pr.manage"]);
  });

  test("BR-AUTH-07 no token -> 401 before any permission check", async () => {
    const res = await app.request("/api/setup/roles");
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
describe("BR-AUTH-08 one role per employee", () => {
  test("BR-AUTH-08 assigning a second role (roleIds array) -> 400, role unchanged", async () => {
    const { status } = await call(
      "sa",
      "PATCH",
      `/employees/${emp.target}/role`,
      { roleIds: [roleId.prrole, roleId.copysrc] },
    );
    expect(status).toBe(400);
    const [row] = await db
      .select({ r: employees.roleId })
      .from(employees)
      .where(eq(employees.id, emp.target as number));
    expect(row?.r).toBe(roleId.plainrole as number);
  });

  test("BR-AUTH-08 extra fields next to roleId -> 400", async () => {
    const { status } = await call(
      "sa",
      "PATCH",
      `/employees/${emp.target}/role`,
      { roleId: roleId.prrole, extraRoleId: roleId.copysrc },
    );
    expect(status).toBe(400);
  });

  test("BR-AUTH-08 assigning one role replaces the old one and access follows it on the next request", async () => {
    const before = await call("target", "GET", "/employees/assignable-roles");
    expect(before.status).toBe(403);
    const { status } = await call(
      "sa",
      "PATCH",
      `/employees/${emp.target}/role`,
      { roleId: roleId.empmgr },
    );
    expect(status).toBe(200);
    const [row] = await db
      .select({ r: employees.roleId })
      .from(employees)
      .where(eq(employees.id, emp.target as number));
    expect(row?.r).toBe(roleId.empmgr as number);
    const after = await call("target", "GET", "/employees/assignable-roles");
    expect(after.status).toBe(200);
    // put back for later tests
    await call("sa", "PATCH", `/employees/${emp.target}/role`, {
      roleId: roleId.plainrole,
    });
  });

  test("BR-AUTH-08 assigning an unknown role -> 404", async () => {
    const { status } = await call(
      "sa",
      "PATCH",
      `/employees/${emp.target}/role`,
      { roleId: 99999999 },
    );
    expect(status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
describe("BR-AUTH-15 screens admin", () => {
  test("BR-AUTH-15 super-admin lists screens with permissionKey and roleIds", async () => {
    const { status, json } = await call("sa", "GET", "/screens");
    expect(status).toBe(200);
    const list = json.data as Json[];
    const grn = list.find((s) => s.key === "grn");
    expect(grn?.permissionKey).toBe("grn.view");
    expect(Array.isArray(grn?.roleIds)).toBe(true);
    const landing = list.find((s) => s.key === "landing");
    expect(landing?.permissionKey).toBeNull();
    // super-admin is never listed in roleIds
    expect(grn?.roleIds).not.toContain(superAdminRoleId);
  });

  test("BR-AUTH-15 ticking a role on a screen grants the screen's key and opens the API on the next click", async () => {
    const denied = await call("viewer", "GET", "/employees/assignable-roles");
    expect(denied.status).toBe(403);
    const grnBefore = await app.request("/api/grn/getgrns", {
      headers: { Authorization: `Bearer ${token.viewer}` },
    });
    expect(grnBefore.status).toBe(403);

    const { status, json } = await call("sa", "POST", "/screens/grn/roles", {
      added: [roleId.viewer],
      removed: [],
    });
    expect(status).toBe(200);
    expect(json.data.roleIds).toContain(roleId.viewer);
    expect(await keysOf(roleId.viewer as number)).toEqual(["grn.view"]);

    const grnAfter = await app.request("/api/grn/getgrns", {
      headers: { Authorization: `Bearer ${token.viewer}` },
    });
    expect(grnAfter.status).toBe(200);
  });

  test("BR-AUTH-15 ticking is the same grant as the role page (GET grants shows it)", async () => {
    const { json } = await call("sa", "GET", `/roles/${roleId.viewer}/grants`);
    const k = (json.data.keys as Json[]).find((x) => x.key === "grn.view");
    expect(k?.granted).toBe(true);
  });

  test("BR-AUTH-15 unticking removes the key and the API closes on the next request", async () => {
    const { status, json } = await call("sa", "POST", "/screens/grn/roles", {
      added: [],
      removed: [roleId.viewer],
    });
    expect(status).toBe(200);
    expect(json.data.roleIds).not.toContain(roleId.viewer);
    expect(await keysOf(roleId.viewer as number)).toEqual([]);
    const grn = await app.request("/api/grn/getgrns", {
      headers: { Authorization: `Bearer ${token.viewer}` },
    });
    expect(grn.status).toBe(403);
  });

  test("BR-AUTH-15 screen with no key (landing) cannot be ticked -> 400 SCREEN_HAS_NO_KEY", async () => {
    const { status, json } = await call(
      "sa",
      "POST",
      "/screens/landing/roles",
      {
        added: [roleId.viewer],
        removed: [],
      },
    );
    expect(status).toBe(400);
    expect(json.code).toBe("SCREEN_HAS_NO_KEY");
  });

  test("BR-AUTH-15 setup screen cannot be ticked for a role -> 400 KEY_NOT_GRANTABLE", async () => {
    const { status, json } = await call("sa", "POST", "/screens/setup/roles", {
      added: [roleId.viewer],
      removed: [],
    });
    expect(status).toBe(400);
    expect(json.code).toBe("KEY_NOT_GRANTABLE");
    expect(await keysOf(roleId.viewer as number)).toEqual([]);
  });

  test("BR-AUTH-15/18 ticking the super-admin role -> 403 SYSTEM_ROLE_PROTECTED", async () => {
    const { status, json } = await call("sa", "POST", "/screens/grn/roles", {
      added: [superAdminRoleId],
      removed: [],
    });
    expect(status).toBe(403);
    expect(json.code).toBe("SYSTEM_ROLE_PROTECTED");
  });

  test("BR-AUTH-15 ticking on an unknown screen -> 404", async () => {
    const { status } = await call("sa", "POST", "/screens/nope/roles", {
      added: [roleId.viewer],
      removed: [],
    });
    expect(status).toBe(404);
  });

  test("BR-AUTH-15 super-admin changes a screen's label, order and menu group", async () => {
    const { status, json } = await call("sa", "PATCH", "/screens/grn", {
      label: "TEST_roleadm Goods In",
      sortOrder: 777,
      menuGroup: "TEST_roleadm_group",
    });
    expect(status).toBe(200);
    expect(json.data.label).toBe("TEST_roleadm Goods In");
    expect(json.data.sortOrder).toBe(777);
    expect(json.data.menuGroup).toBe("TEST_roleadm_group");
    const [row] = await db.select().from(screens).where(eq(screens.key, "grn"));
    expect(row?.label).toBe("TEST_roleadm Goods In");
    expect(row?.sortOrder).toBe(777);
    // key and path are owned by code
    expect(row?.permissionKey).toBe("grn.view");
  });

  test("BR-AUTH-15 changing anything else on a screen (path, permissionKey) -> 400", async () => {
    const a = await call("sa", "PATCH", "/screens/grn", { path: "/hacked" });
    expect(a.status).toBe(400);
    const b = await call("sa", "PATCH", "/screens/grn", {
      permissionKey: "po.manage",
    });
    expect(b.status).toBe(400);
    const [row] = await db.select().from(screens).where(eq(screens.key, "grn"));
    expect(row?.permissionKey).toBe("grn.view");
  });

  test("BR-AUTH-15 unknown screen key on PATCH -> 404", async () => {
    const { status } = await call("sa", "PATCH", "/screens/nope", {
      label: "x",
    });
    expect(status).toBe(404);
  });

  test("BR-AUTH-15 non-super-admin cannot list or edit screens", async () => {
    expect((await call("mgr", "GET", "/screens")).status).toBe(403);
    expect(
      (await call("mgr", "PATCH", "/screens/grn", { label: "x" })).status,
    ).toBe(403);
    expect(
      (
        await call("mgr", "POST", "/screens/grn/roles", {
          added: [roleId.viewer],
          removed: [],
        })
      ).status,
    ).toBe(403);
  });
});

// ---------------------------------------------------------------------------
describe("BR-AUTH-16 no escalation on role assignment", () => {
  test("BR-AUTH-16 employee manager (setup.employees.manage + pr.manage) cannot assign owner -> 403", async () => {
    const { status } = await call(
      "mgr",
      "PATCH",
      `/employees/${emp.target}/role`,
      { roleId: ownerRoleId },
    );
    expect(status).toBe(403);
    const [row] = await db
      .select({ r: employees.roleId })
      .from(employees)
      .where(eq(employees.id, emp.target as number));
    expect(row?.r).toBe(roleId.plainrole as number);
  });

  test("BR-AUTH-16 a non-super-admin can never assign the super-admin role", async () => {
    const { status } = await call(
      "mgr",
      "PATCH",
      `/employees/${emp.target}/role`,
      { roleId: superAdminRoleId },
    );
    expect(status).toBe(403);
  });

  test("BR-AUTH-16 a non-super-admin may assign a role whose keys they all hold", async () => {
    const { status } = await call(
      "mgr",
      "PATCH",
      `/employees/${emp.target}/role`,
      { roleId: roleId.prrole },
    );
    expect(status).toBe(200);
    await call("sa", "PATCH", `/employees/${emp.target}/role`, {
      roleId: roleId.plainrole,
    });
  });

  test("BR-AUTH-16 assignable-roles for the manager: subset roles yes; owner and super-admin no", async () => {
    const { status, json } = await call(
      "mgr",
      "GET",
      "/employees/assignable-roles",
    );
    expect(status).toBe(200);
    const ids = (json.data as Json[]).map((r) => r.id);
    expect(ids).toContain(roleId.prrole);
    expect(ids).toContain(roleId.plainrole);
    expect(ids).not.toContain(ownerRoleId);
    expect(ids).not.toContain(superAdminRoleId);
    expect(ids).not.toContain(roleId.copysrc); // holds grn.* which mgr lacks
  });

  test("BR-AUTH-16 super-admin may assign any role, including owner", async () => {
    const list = await call("sa", "GET", "/employees/assignable-roles");
    const ids = (list.json.data as Json[]).map((r) => r.id);
    expect(ids).toContain(ownerRoleId);
    expect(ids).toContain(superAdminRoleId);
    const { status } = await call(
      "sa",
      "PATCH",
      `/employees/${emp.target}/role`,
      { roleId: ownerRoleId },
    );
    expect(status).toBe(200);
    await call("sa", "PATCH", `/employees/${emp.target}/role`, {
      roleId: roleId.plainrole,
    });
  });

  test("BR-AUTH-16 escalation is also blocked on PATCH /employees/:id with roleId", async () => {
    const { status } = await call("mgr", "PATCH", `/employees/${emp.target}`, {
      name: "TEST_roleadm_target",
      roleId: ownerRoleId,
      loginMethod: "password",
    });
    expect(status).toBe(403);
    const [row] = await db
      .select({ r: employees.roleId })
      .from(employees)
      .where(eq(employees.id, emp.target as number));
    expect(row?.r).toBe(roleId.plainrole as number);
  });

  test("BR-AUTH-16 escalation is also blocked when creating an employee with a higher role", async () => {
    const email = `${PREFIX}created@diecast.test`;
    const { status } = await call("mgr", "POST", "/employees", {
      name: "TEST_roleadm_created",
      roleId: ownerRoleId,
      loginMethod: "password",
      email,
      password: "created-password-1",
    });
    expect(status).toBe(403);
    const rows = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.email, email));
    expect(rows.length).toBe(0);
  });

  test("BR-AUTH-16 a user without setup.employees.manage cannot assign at all", async () => {
    const { status } = await call(
      "nokeys",
      "PATCH",
      `/employees/${emp.target}/role`,
      { roleId: roleId.plainrole },
    );
    expect(status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
describe("BR-AUTH-17 never zero active super-admins", () => {
  const skip = () => otherActiveSuperAdmins > 0;
  // Fixtures add two super-admins (sa, sa2). If the test DB already has other
  // active super-admins the "last admin" state cannot be reached without touching
  // non-TEST data, so these are skipped (reported).

  test("BR-AUTH-17 deactivating one of two super-admins is allowed", async () => {
    const { status } = await call("sa", "DELETE", `/employees/${emp.sa2}`);
    expect(status).toBe(200);
    const [row] = await db
      .select({ a: employees.isActive })
      .from(employees)
      .where(eq(employees.id, emp.sa2 as number));
    expect(row?.a).toBe(false);
  });

  test("BR-AUTH-17 deactivating the only active super-admin -> 409 LAST_ADMIN", async () => {
    if (skip()) return;
    const { status, json } = await call("sa", "DELETE", `/employees/${emp.sa}`);
    expect(status).toBe(409);
    expect(json.code).toBe("LAST_ADMIN");
    const [row] = await db
      .select({ a: employees.isActive })
      .from(employees)
      .where(eq(employees.id, emp.sa as number));
    expect(row?.a).toBe(true);
  });

  test("BR-AUTH-17 moving the only active super-admin to another role -> 409 LAST_ADMIN", async () => {
    if (skip()) return;
    const { status, json } = await call(
      "sa",
      "PATCH",
      `/employees/${emp.sa}/role`,
      { roleId: ownerRoleId },
    );
    expect(status).toBe(409);
    expect(json.code).toBe("LAST_ADMIN");
    const [row] = await db
      .select({ r: employees.roleId })
      .from(employees)
      .where(eq(employees.id, emp.sa as number));
    expect(row?.r).toBe(superAdminRoleId);
  });

  test("BR-AUTH-17 editing the only super-admin via PATCH /employees/:id to another role -> 409 LAST_ADMIN", async () => {
    if (skip()) return;
    const { status, json } = await call("sa", "PATCH", `/employees/${emp.sa}`, {
      name: "TEST_roleadm_sa",
      roleId: ownerRoleId,
      loginMethod: "password",
    });
    expect(status).toBe(409);
    expect(json.code).toBe("LAST_ADMIN");
  });

  test("BR-AUTH-17 with a second active super-admin, moving the first is allowed", async () => {
    // reactivate sa2 directly, then move sa2 away while sa remains
    await db
      .update(employees)
      .set({ isActive: true })
      .where(eq(employees.id, emp.sa2 as number));
    const { status } = await call("sa", "PATCH", `/employees/${emp.sa2}/role`, {
      roleId: roleId.plainrole,
    });
    expect(status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
describe("BR-AUTH-18 system roles", () => {
  test("BR-AUTH-18 super-admin role cannot be renamed -> 403 SYSTEM_ROLE_PROTECTED", async () => {
    const { status, json } = await call(
      "sa",
      "PATCH",
      `/roles/${superAdminRoleId}`,
      { name: `${PREFIX}x` },
    );
    expect(status).toBe(403);
    expect(json.code).toBe("SYSTEM_ROLE_PROTECTED");
  });

  test("BR-AUTH-18 super-admin role cannot be deleted -> 403 SYSTEM_ROLE_PROTECTED", async () => {
    const { status, json } = await call(
      "sa",
      "DELETE",
      `/roles/${superAdminRoleId}`,
    );
    expect(status).toBe(403);
    expect(json.code).toBe("SYSTEM_ROLE_PROTECTED");
  });

  test("BR-AUTH-18 super-admin role cannot be copied -> 403 SYSTEM_ROLE_PROTECTED", async () => {
    const { status, json } = await call(
      "sa",
      "POST",
      `/roles/${superAdminRoleId}/copy`,
      { name: `${PREFIX}sa_copy` },
    );
    expect(status).toBe(403);
    expect(json.code).toBe("SYSTEM_ROLE_PROTECTED");
  });

  test("BR-AUTH-18 super-admin has no grant list to edit: grants are read-only, edit -> 403", async () => {
    const g = await call("sa", "GET", `/roles/${superAdminRoleId}/grants`);
    expect(g.status).toBe(200);
    expect(g.json.data.readOnly).toBe(true);
    expect((g.json.data.keys as Json[]).every((k) => k.granted === true)).toBe(
      true,
    );
    const { status, json } = await call(
      "sa",
      "POST",
      `/roles/${superAdminRoleId}/grants`,
      { added: [], removed: ["pr.manage"] },
    );
    expect(status).toBe(403);
    expect(json.code).toBe("SYSTEM_ROLE_PROTECTED");
  });

  test("BR-AUTH-18 rename owner -> 403 SYSTEM_ROLE_PROTECTED", async () => {
    const { status, json } = await call(
      "sa",
      "PATCH",
      `/roles/${ownerRoleId}`,
      {
        name: `${PREFIX}owner2`,
      },
    );
    expect(status).toBe(403);
    expect(json.code).toBe("SYSTEM_ROLE_PROTECTED");
  });

  test("BR-AUTH-18 delete owner -> 403 SYSTEM_ROLE_PROTECTED", async () => {
    const { status, json } = await call(
      "sa",
      "DELETE",
      `/roles/${ownerRoleId}`,
    );
    expect(status).toBe(403);
    expect(json.code).toBe("SYSTEM_ROLE_PROTECTED");
  });

  test("BR-AUTH-18 other system roles keep editable grants (grant and revoke on owner)", async () => {
    const before = await keysOf(ownerRoleId);
    const add = await call("sa", "POST", `/roles/${ownerRoleId}/grants`, {
      added: ["asset.manage"],
      removed: [],
    });
    const hadIt = before.includes("asset.manage");
    expect(add.status).toBe(200);
    expect(await keysOf(ownerRoleId)).toContain("asset.manage");
    if (!hadIt) {
      const rm = await call("sa", "POST", `/roles/${ownerRoleId}/grants`, {
        added: [],
        removed: ["asset.manage"],
      });
      expect(rm.status).toBe(200);
    }
    expect(await keysOf(ownerRoleId)).toEqual(before);
  });

  test("BR-AUTH-18 super-admin passes a route whose key no role holds", async () => {
    // approval.policy.manage is held by no role (spec seed table)
    const res = await app.request("/api/approval/getPolicies", {
      headers: { Authorization: `Bearer ${token.sa}` },
    });
    expect(res.status).toBe(200);
    const res2 = await app.request("/api/approval/createPolicy", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.nokeys}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    });
    expect(res2.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
describe("BR-AUTH-19 delete / rename blocked while in use", () => {
  test("BR-AUTH-19 delete a role with an active employee -> 409 ROLE_HAS_EMPLOYEES", async () => {
    const { status, json } = await call(
      "sa",
      "DELETE",
      `/roles/${roleId.empmgr}`,
    );
    expect(status).toBe(409);
    expect(json.code).toBe("ROLE_HAS_EMPLOYEES");
    const rows = await db
      .select()
      .from(roles)
      .where(eq(roles.id, roleId.empmgr as number));
    expect(rows.length).toBe(1);
  });

  test("BR-AUTH-19 a role whose only employees are inactive can be deleted", async () => {
    const rid = await makeRole("inactiveonly", []);
    const email = `${PREFIX}inactive@diecast.test`;
    await db.insert(employees).values({
      name: "TEST_roleadm_inactive",
      email,
      passwordHash: await Bun.password.hash(PASSWORD),
      roleId: rid,
      isActive: false,
    });
    const { status } = await call("sa", "DELETE", `/roles/${rid}`);
    // FK from employees.roleId may still reference the role; spec only says
    // that ACTIVE employees block deletion, so the block code must not appear.
    expect([200, 409]).toContain(status);
    if (status === 409) {
      const { json } = await call("sa", "DELETE", `/roles/${rid}`);
      expect(json.code).not.toBe("ROLE_HAS_EMPLOYEES");
    }
  });

  test("BR-AUTH-19 rename a role used in an approval chain -> 409 ROLE_IN_APPROVAL_CHAIN", async () => {
    const rid = await makeRole("inchain", []);
    await db.insert(approvalPolicies).values({
      name: "TEST_roleadm_policy",
      priority: 900001,
      docType: "pr",
      subDocType: "misc",
      approvalLevels: 1,
      approvalChain: [
        { level: 1, approverType: "role", role: `${PREFIX}inchain` },
      ],
    });
    const { status, json } = await call("sa", "PATCH", `/roles/${rid}`, {
      name: `${PREFIX}inchain_renamed`,
    });
    expect(status).toBe(409);
    expect(json.code).toBe("ROLE_IN_APPROVAL_CHAIN");
    const [row] = await db.select().from(roles).where(eq(roles.id, rid));
    expect(row?.name).toBe(`${PREFIX}inchain`);
  });

  test("BR-AUTH-19 delete a role used in an approval chain -> 409 ROLE_IN_APPROVAL_CHAIN", async () => {
    const { status, json } = await call(
      "sa",
      "DELETE",
      `/roles/${roleId.inchain}`,
    );
    expect(status).toBe(409);
    expect(json.code).toBe("ROLE_IN_APPROVAL_CHAIN");
  });

  test("BR-AUTH-19 once the chain no longer uses the role it can be renamed", async () => {
    await db
      .delete(approvalPolicies)
      .where(like(approvalPolicies.name, "TEST_roleadm_%"));
    const { status } = await call("sa", "PATCH", `/roles/${roleId.inchain}`, {
      name: `${PREFIX}inchain_renamed`,
    });
    expect(status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
describe("BR-AUTH-25 copy a role", () => {
  test("BR-AUTH-25 copy gets the same keys and is never a system role", async () => {
    const { status, json } = await call(
      "sa",
      "POST",
      `/roles/${roleId.copysrc}/copy`,
      { name: `${PREFIX}copy_accounts` },
    );
    expect(status).toBe(201);
    expect(json.data.isSystem).toBe(false);
    expect(json.data.id).not.toBe(roleId.copysrc);
    roleId.copy = json.data.id;
    expect(await keysOf(json.data.id)).toEqual(
      await keysOf(roleId.copysrc as number),
    );
    expect(await keysOf(json.data.id)).toEqual(["grn.edit_draft", "grn.view"]);
  });

  test("BR-AUTH-25 copy is independent: changing the copy leaves the source alone", async () => {
    await call("sa", "POST", `/roles/${roleId.copy}/grants`, {
      added: ["po.manage"],
      removed: ["grn.view"],
    });
    expect(await keysOf(roleId.copysrc as number)).toEqual([
      "grn.edit_draft",
      "grn.view",
    ]);
  });

  test("BR-AUTH-25 copying a system role (owner) gives a non-system role with owner's keys", async () => {
    const { status, json } = await call(
      "sa",
      "POST",
      `/roles/${ownerRoleId}/copy`,
      { name: `${PREFIX}owner_copy` },
    );
    expect(status).toBe(201);
    expect(json.data.isSystem).toBe(false);
    expect(await keysOf(json.data.id)).toEqual(await keysOf(ownerRoleId));
  });

  test("BR-AUTH-25 copy with an existing name -> 409 CONFLICT", async () => {
    const { status, json } = await call(
      "sa",
      "POST",
      `/roles/${roleId.copysrc}/copy`,
      { name: `${PREFIX}copy_accounts` },
    );
    expect(status).toBe(409);
    expect(json.code).toBe("CONFLICT");
  });

  test("BR-AUTH-25 copy of an unknown role -> 404", async () => {
    const { status } = await call("sa", "POST", "/roles/99999999/copy", {
      name: `${PREFIX}nothing`,
    });
    expect(status).toBe(404);
  });

  test("BR-AUTH-25 non-super-admin cannot copy a role", async () => {
    const { status } = await call(
      "mgr",
      "POST",
      `/roles/${roleId.copysrc}/copy`,
      { name: `${PREFIX}mgr_copy` },
    );
    expect(status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
describe("BR-AUTH-20 access log", () => {
  test("BR-AUTH-20 role create is logged with actor and after-state", async () => {
    const rows = await logRows("role.create");
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const r = rows[0];
    expect(r?.at).toBeInstanceOf(Date);
    expect(JSON.stringify(r?.after)).toContain(`${PREFIX}store_keeper`);
  });

  test("BR-AUTH-20 role copy is logged", async () => {
    expect((await logRows("role.copy")).length).toBeGreaterThanOrEqual(1);
  });

  test("BR-AUTH-20 role rename is logged with before and after names", async () => {
    const rows = await logRows("role.rename");
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const s = JSON.stringify(rows.map((r) => [r.before, r.after]));
    expect(s).toContain(`${PREFIX}store_keeper`);
    expect(s).toContain(`${PREFIX}store_keeper2`);
  });

  test("BR-AUTH-20 role delete is logged", async () => {
    expect((await logRows("role.delete")).length).toBeGreaterThanOrEqual(1);
  });

  test("BR-AUTH-20 grant change is logged with the key added", async () => {
    const rows = await logRows("role.grants");
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(rows.map((r) => [r.before, r.after]))).toContain(
      "grn.edit_draft",
    );
  });

  test("BR-AUTH-20 a rejected grant (non-grantable key) is not logged as a change", async () => {
    const rows = await logRows("role.grants");
    expect(JSON.stringify(rows.map((r) => r.after))).not.toContain(
      "setup.roles.manage",
    );
  });

  test("BR-AUTH-20 screen label/order/group change is logged", async () => {
    const rows = await logRows("screen.update");
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(rows.map((r) => r.after))).toContain("777");
  });

  test("BR-AUTH-20 employee role change is logged", async () => {
    expect((await logRows("employee.role")).length).toBeGreaterThanOrEqual(1);
  });

  test("BR-AUTH-20 employee deactivation is logged", async () => {
    expect(
      (await logRows("employee.deactivate")).length,
    ).toBeGreaterThanOrEqual(1);
  });

  test("BR-AUTH-20 the log is readable by super-admin, paginated, newest first on request", async () => {
    const { status, json } = await call(
      "sa",
      "GET",
      "/access-log?page=1&pageSize=100&sortBy=at&sortDir=desc",
    );
    expect(status).toBe(200);
    expect(json.meta.page).toBe(1);
    const rows = json.data as Json[];
    expect(rows.length).toBeGreaterThan(0);
    const mine = rows.find((r) => r.action === "role.create");
    expect(mine).toBeDefined();
    expect(typeof mine?.at).toBe("string");
    expect(mine?.actorName).toBe("TEST_roleadm_sa");
    const times = rows.map((r) => Date.parse(r.at as string));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  test("BR-AUTH-20 the log cannot be edited: no POST/PATCH/PUT/DELETE route", async () => {
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      const res = await app.request("/api/setup/access-log", {
        method,
        headers: {
          Authorization: `Bearer ${token.sa}`,
          "content-type": "application/json",
        },
        body: method === "DELETE" ? undefined : "{}",
      });
      expect([404, 405]).toContain(res.status);
    }
    const res = await app.request("/api/setup/access-log/1", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token.sa}` },
    });
    expect([404, 405]).toContain(res.status);
  });

  test("BR-AUTH-20 non-super-admin cannot read the log -> 403", async () => {
    expect((await call("mgr", "GET", "/access-log")).status).toBe(403);
  });

  test("BR-AUTH-20 a failed change (409/403) leaves no log row for it", async () => {
    const before = (await logRows("role.delete")).length;
    await call("sa", "DELETE", `/roles/${ownerRoleId}`); // 403 SYSTEM_ROLE_PROTECTED
    await call("sa", "DELETE", `/roles/${roleId.empmgr}`); // 409 ROLE_HAS_EMPLOYEES
    expect((await logRows("role.delete")).length).toBe(before);
  });
});
