import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";

import { db } from "../db/client";
import { permissions, rolePermissions, roles } from "../db/schemas/01_auth";
import type { DbExecutor } from "./executor";

export const permissionRepository = {
  // --- key-based grants (S6, BR-AUTH-07) ---

  /** The whole synced key catalog. */
  async listCatalog() {
    return db
      .select({
        key: permissions.key,
        module: permissions.module,
        label: permissions.label,
        description: permissions.description,
        grantable: permissions.grantable,
      })
      .from(permissions)
      .orderBy(asc(permissions.module), asc(permissions.key));
  },

  /** The catalog with a `held` flag for one role, in one query (#50). */
  async listCatalogForRole(roleId: number) {
    return db
      .select({
        key: permissions.key,
        module: permissions.module,
        label: permissions.label,
        description: permissions.description,
        grantable: permissions.grantable,
        held: sql<boolean>`${rolePermissions.roleId} is not null`,
      })
      .from(permissions)
      .leftJoin(
        rolePermissions,
        and(
          eq(rolePermissions.permissionKey, permissions.key),
          eq(rolePermissions.roleId, roleId),
        ),
      )
      .orderBy(asc(permissions.module), asc(permissions.key));
  },

  async listKeysByRoleId(roleId: number, exec: DbExecutor = db) {
    const rows = await exec
      .select({ key: rolePermissions.permissionKey })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, roleId));
    return rows.map((r) => r.key).sort();
  },

  /** Every (role, key) pair; used to compare a role's keys with the caller's. */
  async listAllRoleKeys() {
    return db
      .select({
        roleId: rolePermissions.roleId,
        key: rolePermissions.permissionKey,
      })
      .from(rolePermissions);
  },

  /** Role ids holding any of the given keys. */
  async listRoleKeysByKeys(keys: string[]) {
    if (keys.length === 0) return [];
    return db
      .select({
        roleId: rolePermissions.roleId,
        key: rolePermissions.permissionKey,
      })
      .from(rolePermissions)
      .where(inArray(rolePermissions.permissionKey, keys));
  },

  /**
   * (role, key) pairs for the given keys, skipping one role by name (the
   * super-admin, which holds every key anyway) — no separate role read (#50).
   */
  async listRoleKeysByKeysExceptRole(keys: string[], exceptRoleName: string) {
    if (keys.length === 0) return [];
    return db
      .select({
        roleId: rolePermissions.roleId,
        key: rolePermissions.permissionKey,
      })
      .from(rolePermissions)
      .innerJoin(roles, eq(roles.id, rolePermissions.roleId))
      .where(
        and(
          inArray(rolePermissions.permissionKey, keys),
          ne(roles.name, exceptRoleName),
        ),
      );
  },

  async addKeys(
    exec: DbExecutor,
    roleId: number,
    keys: string[],
    grantedBy: number,
  ) {
    if (keys.length === 0) return;
    await exec
      .insert(rolePermissions)
      .values(
        keys.map((permissionKey) => ({ roleId, permissionKey, grantedBy })),
      )
      .onConflictDoNothing({
        target: [rolePermissions.roleId, rolePermissions.permissionKey],
      });
  },

  async removeKeys(exec: DbExecutor, roleId: number, keys: string[]) {
    if (keys.length === 0) return;
    await exec
      .delete(rolePermissions)
      .where(
        and(
          eq(rolePermissions.roleId, roleId),
          inArray(rolePermissions.permissionKey, keys),
        ),
      );
  },
};
