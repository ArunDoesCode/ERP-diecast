/**
 * docs/specs/auth-setup.md (v6) BR-AUTH-06, BR-AUTH-21 (seed grants table), BR-AUTH-24.
 * The expected grants below are copied from the spec's "Seed grants" table, not from code.
 * DB-level tests use TEST_authcat_ rows only.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, like } from "drizzle-orm";
import { db } from "../db/client";
import {
  permissions,
  rolePermissions,
  roles,
  screens,
} from "../db/schemas/01_auth";
import {
  PERMISSION_KEYS,
  PERMISSIONS,
  SCREENS,
  SEED_GRANTS,
} from "./permissions";

const ALL = ["ow", "bo", "fs", "qa", "dd"] as const;
type R = (typeof ALL)[number];
const SEED_ROLE: Record<R, keyof typeof SEED_GRANTS> = {
  ow: "owner",
  bo: "back_office",
  fs: "floor_supervisor",
  qa: "qa_inspector",
  dd: "die_designer",
};

// Spec table: key -> seed roles (empty = none / super-admin only).
const SPEC: Record<string, R[]> = {
  "setup.roles.manage": [],
  "setup.employees.manage": [],
  "asset.manage": ["bo"],
  "inventory.adjust": ["ow", "bo"],
  "inventory.view": ["ow", "bo", "fs"],
  "supplier.view": ["ow", "bo", "fs"],
  "supplier.manage": ["bo"],
  "pr.manage": ["ow", "bo", "fs"],
  "pr.link_machine": ["ow", "bo", "fs"],
  "po.manage": ["ow", "bo"],
  "grn.view": ["ow", "bo", "fs", "qa", "dd"],
  "grn.edit_draft": ["ow", "bo", "fs"],
  "grn.qa_decide": ["ow", "bo", "qa"],
  "grn.qa_bypass": ["ow", "bo"],
  "grn.correct": ["ow", "bo"],
  "grn.over_receipt_override": ["ow", "bo"],
  "approval.policy.view": ["ow", "bo"],
  "approval.policy.manage": [],
  "approval.view_all": ["ow", "bo"],
  "employees.directory.view": ["ow"],
  "approval.view_others_pending": [],
  "approval.auto_approve_own": ["ow"],
  "sco.view": ["ow", "bo", "fs", "qa"],
  "sco.manage": ["ow", "bo"],
  "sco.close": ["ow", "bo"],
  "sco.issue_receive": ["ow", "bo", "fs"],
  "sco.qa_decide": ["ow", "bo", "qa"],
  "sco.loss_override": ["ow"],
  "company.manage": ["ow"],
};

describe("BR-AUTH-06 permission catalog defined in code", () => {
  test("BR-AUTH-06 catalog holds exactly the keys of the spec table", () => {
    expect([...(PERMISSION_KEYS as string[])].sort()).toEqual(
      Object.keys(SPEC).sort(),
    );
  });

  test("BR-AUTH-06 every key is <module>.<action> with a label and one-line description", () => {
    for (const key of PERMISSION_KEYS) {
      const p = PERMISSIONS[key];
      expect(key).toMatch(/^[a-z_]+\.[a-z_.]+$/);
      expect(p.label.trim().length).toBeGreaterThan(0);
      expect(p.description.trim().length).toBeGreaterThan(0);
      expect(p.description).not.toContain("\n");
    }
  });

  test("BR-AUTH-06 grn.correct is labelled 'Correct a posted GRN line'", () => {
    expect(PERMISSIONS["grn.correct"].label).toBe("Correct a posted GRN line");
  });

  test("BR-AUTH-07 only setup.roles.manage is not grantable", () => {
    const ungrantable = PERMISSION_KEYS.filter(
      (k) => !PERMISSIONS[k].grantable,
    );
    expect(ungrantable).toEqual(["setup.roles.manage"]);
  });

  test("BR-AUTH-06 each screen has a path and its permission key is in the catalog (or null)", () => {
    for (const [key, scr] of Object.entries(SCREENS)) {
      expect(key.length).toBeGreaterThan(0);
      expect(scr.path.startsWith("/")).toBe(true);
      if (scr.permission !== null)
        expect(PERMISSION_KEYS as string[]).toContain(scr.permission);
    }
  });

  test("BR-AUTH-06 landing and approvals screens need no key; setup needs setup.roles.manage", () => {
    expect(SCREENS.landing.permission).toBeNull();
    expect(SCREENS.approvals.permission).toBeNull();
    expect(SCREENS.setup.permission).toBe("setup.roles.manage");
    expect(SCREENS["employee-directory"].permission).toBe(
      "employees.directory.view",
    );
  });
});

describe("BR-AUTH-21 seed grants equal the spec table", () => {
  for (const r of ALL) {
    test(`BR-AUTH-21 ${SEED_ROLE[r]} holds exactly the spec keys`, () => {
      const expected = Object.entries(SPEC)
        .filter(([, roleList]) => roleList.includes(r))
        .map(([k]) => k)
        .sort();
      expect([...(SEED_GRANTS[SEED_ROLE[r]] as string[])].sort()).toEqual(
        expected,
      );
    });
  }

  test("BR-AUTH-21 super-admin needs no grants (bypass); operator holds none", () => {
    expect(SEED_GRANTS["super-admin"]).toEqual([]);
    expect(SEED_GRANTS.operator).toEqual([]);
  });

  test("BR-AUTH-21 no role holds setup.roles.manage, setup.employees.manage, approval.policy.manage, approval.view_others_pending", () => {
    const held = new Set(Object.values(SEED_GRANTS).flat());
    for (const k of [
      "setup.roles.manage",
      "setup.employees.manage",
      "approval.policy.manage",
      "approval.view_others_pending",
    ]) {
      expect(held.has(k as never)).toBe(false);
    }
  });

  test("BR-AUTH-21 fs loses QA bypass; sco.loss_override is owner only", () => {
    expect(SEED_GRANTS.floor_supervisor).not.toContain("grn.qa_bypass");
    const holders = Object.entries(SEED_GRANTS)
      .filter(([, ks]) => ks.includes("sco.loss_override"))
      .map(([n]) => n);
    expect(holders).toEqual(["owner"]);
  });

  test("BR-AUTH-21 every seeded key exists in the catalog", () => {
    for (const ks of Object.values(SEED_GRANTS))
      for (const k of ks) expect(PERMISSION_KEYS as string[]).toContain(k);
  });
});

describe("BR-AUTH-24 deny by default (storage level)", () => {
  const ROLE = "TEST_authcat_norights";
  const NEWKEY = "test_authcat.newkey";

  beforeAll(async () => {
    await db
      .insert(roles)
      .values({ name: ROLE } as never)
      .onConflictDoNothing();
    await db
      .insert(permissions)
      .values({
        key: NEWKEY,
        module: "test_authcat",
        label: "New key",
        description: "Added later",
      })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await db.delete(permissions).where(like(permissions.key, "test_authcat.%"));
    await db.delete(roles).where(eq(roles.name, ROLE));
  });

  test("BR-AUTH-24 a new role holds no keys", async () => {
    const [r] = await db.select().from(roles).where(eq(roles.name, ROLE));
    const rows = await db
      .select()
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, r!.id));
    expect(rows).toEqual([]);
  });

  test("BR-AUTH-24 a key added to the catalog is held by no role until granted", async () => {
    const rows = await db
      .select()
      .from(rolePermissions)
      .where(eq(rolePermissions.permissionKey, NEWKEY));
    expect(rows).toEqual([]);
  });

  test("BR-AUTH-06 deleting a permission removes its grants and unlinks screens", async () => {
    const key = "test_authcat.cascade";
    const [r] = await db.select().from(roles).where(eq(roles.name, ROLE));
    await db
      .insert(permissions)
      .values({ key, module: "test_authcat", label: "C", description: "C" });
    await db
      .insert(rolePermissions)
      .values({ roleId: r!.id, permissionKey: key });
    await db.insert(screens).values({
      key: "test_authcat_screen",
      path: "/test-authcat",
      permissionKey: key,
      label: "T",
      sortOrder: 1,
      menuGroup: "T",
    });
    await db.delete(permissions).where(eq(permissions.key, key));
    expect(
      await db
        .select()
        .from(rolePermissions)
        .where(eq(rolePermissions.permissionKey, key)),
    ).toEqual([]);
    const [scr] = await db
      .select()
      .from(screens)
      .where(eq(screens.key, "test_authcat_screen"));
    expect(scr!.permissionKey).toBeNull();
    await db.delete(screens).where(eq(screens.key, "test_authcat_screen"));
  });
});
