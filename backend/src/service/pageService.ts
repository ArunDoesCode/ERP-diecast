import { db } from "../db/client";
import { invalidateRole, isSuperAdminRoleName } from "../lib/auth-middleware";
import { BadRequestError, ForbiddenError, NotFoundError } from "../lib/errors";
import { authAuditRepository } from "../repository/authAuditRepository";
import { permissionRepository } from "../repository/permissionRepository";
import { roleRepository } from "../repository/roleRepository";
import { screenRepository } from "../repository/screenRepository";
import type {
  screenRolesDiffSchemaType,
  screenSchemaType,
  screenUpdateSchemaType,
} from "../types/setup.types";
import { applyRoleKeyDiff, assertKeysGrantable } from "./permissionService";

type ScreenRow = NonNullable<
  Awaited<ReturnType<typeof screenRepository.findByKey>>
>;

/** Roles holding each screen's key, super-admin never listed (it always sees every screen). */
async function roleIdsByKey(rows: ScreenRow[]) {
  const keys = rows.flatMap((row) =>
    row.permissionKey ? [row.permissionKey] : [],
  );
  const [pairs, allRoles] = await Promise.all([
    permissionRepository.listRoleKeysByKeys(keys),
    roleRepository.listAll(),
  ]);
  const superAdminIds = new Set(
    allRoles.filter((r) => isSuperAdminRoleName(r.name)).map((r) => r.id),
  );
  const byKey = new Map<string, number[]>();
  for (const { roleId, key } of pairs) {
    if (superAdminIds.has(roleId)) continue;
    byKey.set(key, [...(byKey.get(key) ?? []), roleId]);
  }
  return byKey;
}

function toScreen(
  row: ScreenRow,
  byKey: Map<string, number[]>,
): screenSchemaType {
  const roleIds = row.permissionKey
    ? [...(byKey.get(row.permissionKey) ?? [])].sort((a, b) => a - b)
    : [];
  return { ...row, roleIds };
}

async function loadScreen(key: string) {
  const row = await screenRepository.findByKey(key);
  if (!row) throw new NotFoundError("Screen not found");
  return row;
}

async function screenWithRoles(key: string) {
  const row = await loadScreen(key);
  return toScreen(row, await roleIdsByKey([row]));
}

const screenSnapshot = (row: ScreenRow) => ({
  label: row.label,
  sortOrder: row.sortOrder,
  menuGroup: row.menuGroup,
});

export const pageService = {
  // --- screens (S6, BR-AUTH-15) ---
  async listScreens() {
    const rows = await screenRepository.list();
    const byKey = await roleIdsByKey(rows);
    return rows.map((row) => toScreen(row, byKey));
  },

  async updateScreen(
    key: string,
    input: screenUpdateSchemaType,
    actorId: number,
  ) {
    const before = await loadScreen(key);
    const patch = {
      label: input.label,
      sortOrder: input.sortOrder,
      // "" means "no group" (column is NOT NULL, so it is stored as "")
      menuGroup: input.menuGroup,
    };

    await db.transaction(async (tx) => {
      const row = await screenRepository.update(key, patch, tx);
      if (!row) throw new NotFoundError("Screen not found");
      await authAuditRepository.insert(tx, {
        actorId,
        action: "screen.update",
        target: `screen:${key}`,
        before: screenSnapshot(before),
        after: screenSnapshot(row),
      });
    });
    return screenWithRoles(key);
  },

  /** Ticking a role = granting the screen's key, same as the role page (BR-AUTH-15). */
  async setScreenRoles(
    key: string,
    diff: screenRolesDiffSchemaType,
    actorId: number,
  ) {
    const screen = await loadScreen(key);

    const roleIds = [...new Set([...diff.added, ...diff.removed])];
    const rolesById = new Map(
      (await roleRepository.findByIds(roleIds)).map((role) => [role.id, role]),
    );
    for (const id of roleIds) {
      if (!rolesById.has(id)) throw new NotFoundError(`Role ${id} not found`);
    }
    for (const role of rolesById.values()) {
      if (isSuperAdminRoleName(role.name)) {
        throw new ForbiddenError(
          "The super-admin role has no grants to edit",
          "SYSTEM_ROLE_PROTECTED",
        );
      }
    }
    const permissionKey = screen.permissionKey;
    if (!permissionKey) {
      throw new BadRequestError(
        "This screen has no permission key; it is open to every signed-in user",
        "SCREEN_HAS_NO_KEY",
      );
    }
    await assertKeysGrantable([permissionKey], []);

    await db.transaction(async (tx) => {
      // Ascending role id so concurrent edits lock roles in the same order (no deadlock).
      const added = new Set(diff.added);
      const removed = new Set(diff.removed);
      for (const id of [...roleIds].sort((a, b) => a - b)) {
        const role = rolesById.get(id);
        if (!role) continue;
        if (added.has(id)) {
          await applyRoleKeyDiff(tx, role, [permissionKey], [], actorId);
        }
        if (removed.has(id)) {
          await applyRoleKeyDiff(tx, role, [], [permissionKey], actorId);
        }
      }
    });
    for (const id of roleIds) invalidateRole(id);

    return screenWithRoles(key);
  },
};
