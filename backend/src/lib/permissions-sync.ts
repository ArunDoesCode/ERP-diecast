/**
 * Catalog -> DB sync and seed grants (auth-setup BR-AUTH-06, BR-AUTH-21, BR-AUTH-24).
 * Run on app start and by `bun run db:test:prepare`.
 */
import { eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import {
  authAuditLog,
  permissions,
  rolePermissions,
  roles,
  screens,
} from "../db/schemas/01_auth";
import {
  PERMISSIONS,
  type PermissionKey,
  SCREENS,
  type ScreenKey,
  SEED_GRANTS,
  type SeedGrantsFn,
  type SyncCatalogFn,
} from "./permissions";

export const syncCatalog: SyncCatalogFn = async () =>
  db.transaction(async (tx) => {
    const result = {
      permissions: { inserted: 0, updated: 0, deleted: 0 },
      screens: { inserted: 0, updated: 0, deleted: 0 },
    };

    // Permissions: code is the source of truth for every column.
    const dbPerms = await tx.select().from(permissions);
    const permByKey = new Map(dbPerms.map((r) => [r.key, r]));
    for (const key of Object.keys(PERMISSIONS) as PermissionKey[]) {
      const def = PERMISSIONS[key];
      const row = permByKey.get(key);
      if (!row) {
        await tx.insert(permissions).values({ key, ...def });
        result.permissions.inserted++;
      } else if (
        row.module !== def.module ||
        row.label !== def.label ||
        row.description !== def.description ||
        row.grantable !== def.grantable
      ) {
        await tx.update(permissions).set(def).where(eq(permissions.key, key));
        result.permissions.updated++;
      }
    }
    const goneKeys = dbPerms
      .map((r) => r.key)
      .filter((k) => !(k in PERMISSIONS));
    if (goneKeys.length > 0) {
      // Grants go with the key (FK cascade); record it first.
      await tx.insert(authAuditLog).values(
        goneKeys.map((k) => ({
          action: "catalog.permission_removed",
          target: k,
          before: permByKey.get(k) ?? null,
        })),
      );
      await tx.delete(permissions).where(inArray(permissions.key, goneKeys));
      result.permissions.deleted = goneKeys.length;
    }

    // Screens: label / sortOrder / menuGroup belong to the UI after first insert.
    const dbScreens = await tx.select().from(screens);
    const screenByKey = new Map(dbScreens.map((r) => [r.key, r]));
    for (const key of Object.keys(SCREENS) as ScreenKey[]) {
      const def = SCREENS[key];
      const row = screenByKey.get(key);
      if (!row) {
        await tx.insert(screens).values({
          key,
          path: def.path,
          permissionKey: def.permission,
          label: def.defaultLabel,
          sortOrder: def.defaultOrder,
          menuGroup: def.defaultMenuGroup,
        });
        result.screens.inserted++;
      } else if (
        row.path !== def.path ||
        row.permissionKey !== def.permission
      ) {
        await tx
          .update(screens)
          .set({ path: def.path, permissionKey: def.permission })
          .where(eq(screens.key, key));
        result.screens.updated++;
      }
    }
    const goneScreens = dbScreens
      .map((r) => r.key)
      .filter((k) => !(k in SCREENS));
    if (goneScreens.length > 0) {
      await tx.insert(authAuditLog).values(
        goneScreens.map((k) => ({
          action: "catalog.screen_removed",
          target: k,
          before: screenByKey.get(k) ?? null,
        })),
      );
      await tx.delete(screens).where(inArray(screens.key, goneScreens));
      result.screens.deleted = goneScreens.length;
    }

    return result;
  });

/** Insert missing seed grants for roles that exist; never removes or edits (BR-AUTH-21/24). */
export const seedGrants: SeedGrantsFn = async () => {
  // The seed roles are the system roles: protected from rename/delete (BR-AUTH-18).
  await db
    .update(roles)
    .set({ isSystem: true })
    .where(inArray(roles.name, Object.keys(SEED_GRANTS)));
  const roleRows = await db.select().from(roles);
  const idByName = new Map(roleRows.map((r) => [r.name, r.id]));
  const values: { roleId: number; permissionKey: string }[] = [];
  for (const [name, keys] of Object.entries(SEED_GRANTS)) {
    const roleId = idByName.get(name);
    if (roleId === undefined) continue;
    for (const permissionKey of keys) values.push({ roleId, permissionKey });
  }
  if (values.length === 0) return { inserted: 0 };
  const inserted = await db
    .insert(rolePermissions)
    .values(values)
    .onConflictDoNothing()
    .returning({ k: rolePermissions.permissionKey });
  return { inserted: inserted.length };
};
