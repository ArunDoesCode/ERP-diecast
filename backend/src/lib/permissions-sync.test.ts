/**
 * docs/specs/auth-setup.md (v6) BR-AUTH-06 (catalog synced from code), BR-AUTH-21 (seed grants),
 * BR-AUTH-24 (a later release's key is held by no role). Contract: syncCatalog / seedGrants in permissions-sync.ts.
 * Fixtures are test_authsync rows; real seed rows that are touched are restored.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, like } from "drizzle-orm";
import { db } from "../db/client";
import {
  authAuditLog,
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
import { seedGrants, syncCatalog } from "./permissions-sync";

const GHOST_KEY = "test_authsync.ghost";
const GHOST_SCREEN = "test_authsync_screen";
const ROLE = "TEST_authsync_role";

async function cleanup() {
  await db.delete(screens).where(like(screens.key, "test_authsync%"));
  await db.delete(permissions).where(like(permissions.key, "test_authsync.%"));
  await db.delete(roles).where(eq(roles.name, ROLE));
  await db
    .delete(authAuditLog)
    .where(like(authAuditLog.target, "%test_authsync%"));
}

beforeAll(async () => {
  await cleanup();
  await syncCatalog();
  await seedGrants();
});
afterAll(cleanup);

describe("BR-AUTH-06 syncCatalog", () => {
  test("BR-AUTH-06 after sync every catalog key and screen is in the DB with code values", async () => {
    await syncCatalog();
    const rows = await db.select().from(permissions);
    for (const k of PERMISSION_KEYS) {
      const row = rows.find((r) => r.key === k);
      expect(row?.label).toBe(PERMISSIONS[k].label);
      expect(row?.description).toBe(PERMISSIONS[k].description);
      expect(row?.grantable).toBe(PERMISSIONS[k].grantable);
    }
    const scr = await db.select().from(screens);
    for (const [k, def] of Object.entries(SCREENS)) {
      const row = scr.find((s) => s.key === k);
      expect(row?.path).toBe(def.path);
      expect(row?.permissionKey).toBe(def.permission);
    }
  });

  test("BR-AUTH-06 sync is idempotent: second run inserts and deletes nothing", async () => {
    await syncCatalog();
    const r = await syncCatalog();
    expect(r.permissions.inserted).toBe(0);
    expect(r.permissions.deleted).toBe(0);
    expect(r.screens.inserted).toBe(0);
    expect(r.screens.deleted).toBe(0);
  });

  test("BR-AUTH-06 a permission edited in the DB is put back to the code label", async () => {
    await db
      .update(permissions)
      .set({ label: "tampered" })
      .where(eq(permissions.key, "grn.correct"));
    await syncCatalog();
    const [row] = await db
      .select()
      .from(permissions)
      .where(eq(permissions.key, "grn.correct"));
    expect(row?.label).toBe("Correct a posted GRN line");
  });

  test("BR-AUTH-06 sync never overwrites a screen's label, order or menu group", async () => {
    await db
      .update(screens)
      .set({ label: "Renamed by admin", sortOrder: 999, menuGroup: "Custom" })
      .where(eq(screens.key, "grn"));
    await syncCatalog();
    const [row] = await db.select().from(screens).where(eq(screens.key, "grn"));
    const d = SCREENS.grn;
    // restore the seed values before asserting
    await db
      .update(screens)
      .set({
        label: d.defaultLabel,
        sortOrder: d.defaultOrder,
        menuGroup: d.defaultMenuGroup,
      })
      .where(eq(screens.key, "grn"));
    expect(row?.label).toBe("Renamed by admin");
    expect(row?.sortOrder).toBe(999);
    expect(row?.menuGroup).toBe("Custom");
  });

  test("BR-AUTH-06 a screen removed from code disappears (row deleted, audit row written)", async () => {
    await db.insert(screens).values({
      key: GHOST_SCREEN,
      path: "/ghost",
      permissionKey: null,
      label: "Ghost",
      sortOrder: 1,
      menuGroup: "X",
    });
    const r = await syncCatalog();
    expect(r.screens.deleted).toBeGreaterThanOrEqual(1);
    expect(
      await db.select().from(screens).where(eq(screens.key, GHOST_SCREEN)),
    ).toEqual([]);
    const audit = await db
      .select()
      .from(authAuditLog)
      .where(like(authAuditLog.target, `%${GHOST_SCREEN}%`));
    expect(audit.length).toBeGreaterThanOrEqual(1);
  });

  test("BR-AUTH-06 a key removed from code is deleted with its grants (audit row written)", async () => {
    const [role] = await db.insert(roles).values({ name: ROLE }).returning();
    await db.insert(permissions).values({
      key: GHOST_KEY,
      module: "test_authsync",
      label: "G",
      description: "G",
    });
    await db
      .insert(rolePermissions)
      .values({ roleId: role?.id as number, permissionKey: GHOST_KEY });
    const r = await syncCatalog();
    expect(r.permissions.deleted).toBeGreaterThanOrEqual(1);
    expect(
      await db.select().from(permissions).where(eq(permissions.key, GHOST_KEY)),
    ).toEqual([]);
    expect(
      await db
        .select()
        .from(rolePermissions)
        .where(eq(rolePermissions.permissionKey, GHOST_KEY)),
    ).toEqual([]);
    const audit = await db
      .select()
      .from(authAuditLog)
      .where(like(authAuditLog.target, `%${GHOST_KEY}%`));
    expect(audit.length).toBeGreaterThanOrEqual(1);
  });
});

describe("BR-AUTH-21 / BR-AUTH-24 seedGrants", () => {
  async function held(roleName: string) {
    const rows = await db
      .select({ k: rolePermissions.permissionKey })
      .from(rolePermissions)
      .innerJoin(roles, eq(roles.id, rolePermissions.roleId))
      .where(eq(roles.name, roleName));
    return rows.map((r) => r.k).sort();
  }

  test("BR-AUTH-21 seeded roles hold exactly the spec seed grants", async () => {
    for (const name of [
      "owner",
      "back_office",
      "floor_supervisor",
      "qa_inspector",
      "die_designer",
    ] as const) {
      expect(await held(name)).toEqual([...SEED_GRANTS[name]].sort());
    }
  });

  test("BR-AUTH-18 super-admin and operator get no rows (bypass / deny by default)", async () => {
    expect(await held("super-admin")).toEqual([]);
    expect(await held("operator")).toEqual([]);
  });

  test("BR-AUTH-21 seed inserts a missing grant and reports the count", async () => {
    const [owner] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, "owner"));
    await db
      .delete(rolePermissions)
      .where(
        and(
          eq(rolePermissions.roleId, owner?.id as number),
          eq(rolePermissions.permissionKey, "grn.correct"),
        ),
      );
    const r = await seedGrants();
    expect(r.inserted).toBe(1);
    expect(await held("owner")).toContain("grn.correct");
  });

  test("BR-AUTH-21 seed is insert-only: an admin-added grant is kept, nothing inserted", async () => {
    const [owner] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, "owner"));
    await db
      .insert(rolePermissions)
      .values({ roleId: owner?.id as number, permissionKey: "asset.manage" });
    try {
      const r = await seedGrants();
      expect(r.inserted).toBe(0);
      expect(await held("owner")).toContain("asset.manage");
    } finally {
      await db
        .delete(rolePermissions)
        .where(
          and(
            eq(rolePermissions.roleId, owner?.id as number),
            eq(rolePermissions.permissionKey, "asset.manage"),
          ),
        );
    }
  });

  test("BR-AUTH-24 a custom role gets no keys from seed", async () => {
    await db.insert(roles).values({ name: ROLE }).onConflictDoNothing();
    await seedGrants();
    expect(await held(ROLE)).toEqual([]);
  });

  test("BR-AUTH-24 a key added in a later release is held by no role after seed", async () => {
    await db.insert(permissions).values({
      key: "test_authsync.later",
      module: "test_authsync",
      label: "L",
      description: "L",
    });
    await seedGrants();
    expect(
      await db
        .select()
        .from(rolePermissions)
        .where(eq(rolePermissions.permissionKey, "test_authsync.later")),
    ).toEqual([]);
  });
});
