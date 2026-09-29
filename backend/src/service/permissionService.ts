import { db } from "../db/client";
import { invalidateRole, isSuperAdminRoleName } from "../lib/auth-middleware";
import { BadRequestError, ForbiddenError, NotFoundError } from "../lib/errors";
import { authAuditRepository } from "../repository/authAuditRepository";
import type { DbExecutor } from "../repository/executor";
import { pageRepository } from "../repository/pageRepository";
import { permissionRepository } from "../repository/permissionRepository";
import { roleRepository } from "../repository/roleRepository";
import type {
  roleGrantsDiffSchemaType,
  roleGrantsSchemaType,
  rolePermissionDiffSchemaType,
} from "../types/setup.types";

type RoleRow = NonNullable<Awaited<ReturnType<typeof roleRepository.findById>>>;

/** The system role that passes every check has no grant list to edit (BR-AUTH-18). */
export function assertRoleGrantsEditable(role: RoleRow) {
  if (isSuperAdminRoleName(role.name)) {
    throw new ForbiddenError(
      "The super-admin role has no grants to edit",
      "SYSTEM_ROLE_PROTECTED",
    );
  }
}

/**
 * Applies a key diff to one role inside the caller's transaction and logs it.
 * Only real changes are written and logged. Returns true when something changed.
 * The caller validates the keys (catalog + grantable) and clears the cache.
 */
export async function applyRoleKeyDiff(
  exec: DbExecutor,
  role: RoleRow,
  added: string[],
  removed: string[],
  actorId: number,
) {
  // Row lock: two admins editing one role take turns, so before/after in the log is right (PERF-5).
  await roleRepository.findByIdForUpdate(role.id, exec);
  const before = await permissionRepository.listKeysByRoleId(role.id, exec);
  const held = new Set(before);
  const toAdd = [...new Set(added)].filter((key) => !held.has(key));
  const toRemove = [...new Set(removed)].filter((key) => held.has(key));
  if (toAdd.length === 0 && toRemove.length === 0) return false;

  await permissionRepository.addKeys(exec, role.id, toAdd, actorId);
  await permissionRepository.removeKeys(exec, role.id, toRemove);
  const after = [
    ...before.filter((key) => !toRemove.includes(key)),
    ...toAdd,
  ].sort();

  await authAuditRepository.insert(exec, {
    actorId,
    action: "role.grants",
    target: `role:${role.id}`,
    before: { role: role.name, keys: before },
    after: { role: role.name, keys: after, added: toAdd, removed: toRemove },
  });
  return true;
}

async function buildGrants(role: RoleRow): Promise<roleGrantsSchemaType> {
  const isSuperAdmin = isSuperAdminRoleName(role.name);
  const [catalog, held] = await Promise.all([
    permissionRepository.listCatalog(),
    permissionRepository.listKeysByRoleId(role.id),
  ]);
  const heldSet = new Set(held);
  return {
    roleId: role.id,
    roleName: role.name,
    isSystem: role.isSystem,
    isSuperAdmin,
    readOnly: isSuperAdmin,
    keys: catalog.map((entry) => ({
      ...entry,
      granted: isSuperAdmin || heldSet.has(entry.key),
    })),
  };
}

export const permissionService = {
  // --- legacy role_pages (removed in S7) ---
  async list() {
    return permissionRepository.listAll();
  },

  async updateForRole(roleId: number, diff: rolePermissionDiffSchemaType) {
    const role = await roleRepository.findById(roleId);
    if (!role) {
      throw new NotFoundError("Role not found");
    }

    const added: number[] = [];
    const deleted: number[] = [];
    for (const moduleDiff of Object.values(diff)) {
      added.push(...moduleDiff.added);
      deleted.push(...moduleDiff.deleted);
    }

    if (added.length > 0) {
      const existingIds = await pageRepository.findExistingIds(added);
      const missing = added.filter((pageId) => !existingIds.has(pageId));
      if (missing.length > 0) {
        throw new BadRequestError(`Invalid pageId(s): ${missing.join(", ")}`);
      }
    }

    await permissionRepository.applyDiff(roleId, added, deleted);
    invalidateRole(roleId);

    return permissionRepository.listByRoleId(roleId);
  },

  // --- key grants (S6) ---
  async getGrants(roleId: number) {
    const role = await roleRepository.findById(roleId);
    if (!role) throw new NotFoundError("Role not found");
    return buildGrants(role);
  },

  async setGrants(
    roleId: number,
    diff: roleGrantsDiffSchemaType,
    actorId: number,
  ) {
    const role = await roleRepository.findById(roleId);
    if (!role) throw new NotFoundError("Role not found");
    assertRoleGrantsEditable(role);

    await assertKeysGrantable(diff.added, diff.removed);
    await db.transaction((tx) =>
      applyRoleKeyDiff(tx, role, diff.added, diff.removed, actorId),
    );
    invalidateRole(roleId);
    return buildGrants(role);
  },
};

/** Keys must exist in the catalog (400 UNKNOWN_KEY); added ones must be grantable (400 KEY_NOT_GRANTABLE). */
export async function assertKeysGrantable(added: string[], removed: string[]) {
  const all = [...new Set([...added, ...removed])];
  const catalog = await permissionRepository.listCatalog();
  const byKey = new Map(catalog.map((entry) => [entry.key, entry]));

  const unknown = all.filter((key) => !byKey.has(key));
  if (unknown.length > 0) {
    throw new BadRequestError(
      `Unknown permission key(s): ${unknown.join(", ")}`,
      "UNKNOWN_KEY",
    );
  }
  const notGrantable = added.filter((key) => !byKey.get(key)?.grantable);
  if (notGrantable.length > 0) {
    throw new BadRequestError(
      `Key(s) cannot be granted to any role: ${notGrantable.join(", ")}`,
      "KEY_NOT_GRANTABLE",
    );
  }
  const both = added.filter((key) => removed.includes(key));
  if (both.length > 0) {
    throw new BadRequestError(
      `Key(s) both added and removed: ${both.join(", ")}`,
    );
  }
}
