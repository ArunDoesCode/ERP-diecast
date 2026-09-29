import { invalidateRole } from "../lib/auth-middleware";
import { BadRequestError, NotFoundError } from "../lib/errors";
import { pageRepository } from "../repository/pageRepository";
import { permissionRepository } from "../repository/permissionRepository";
import { roleRepository } from "../repository/roleRepository";
import type { rolePermissionDiffSchemaType } from "../types/setup.types";

export const permissionService = {
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
};
