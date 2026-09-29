import { db } from "../db/client";
import {
  type Actor,
  invalidateRole,
  isSuperAdminRoleName,
} from "../lib/auth-middleware";
import { ConflictError, ForbiddenError, NotFoundError } from "../lib/errors";
import { authAuditRepository } from "../repository/authAuditRepository";
import type { DbExecutor } from "../repository/executor";
import { permissionRepository } from "../repository/permissionRepository";
import { roleRepository } from "../repository/roleRepository";
import type {
  roleCopyInputSchemaType,
  roleInputSchemaType,
  roleListQuerySchemaType,
  roleUpdateSchemaType,
} from "../types/setup.types";

function systemRoleProtected(action: string) {
  return new ForbiddenError(
    `Cannot ${action} a system role`,
    "SYSTEM_ROLE_PROTECTED",
  );
}

async function assertNameFree(name: string, exec: DbExecutor) {
  if (await roleRepository.findByName(name, exec)) {
    throw new ConflictError("A role with this name already exists", "CONFLICT");
  }
}

export const roleService = {
  async list(params: roleListQuerySchemaType) {
    const { rows, total } = await roleRepository.list(params);
    const totalPages = Math.max(1, Math.ceil(total / params.pageSize));
    return {
      data: rows.map((row) => ({
        ...row,
        isSuperAdmin: isSuperAdminRoleName(row.name),
      })),
      meta: {
        page: params.page,
        pageSize: params.pageSize,
        total,
        totalPages,
      },
    };
  },

  async create(input: roleInputSchemaType, actor: Actor) {
    return db.transaction(async (tx) => {
      await assertNameFree(input.name, tx);
      const role = await roleRepository.create(input.name, actor.id, tx);
      if (!role) throw new Error("Failed to create role");
      await authAuditRepository.insert(tx, {
        actorId: actor.id,
        action: "role.create",
        target: `role:${role.id}`,
        after: role,
      });
      return role;
    });
  },

  /** New non-system role with the same keys as the source (BR-AUTH-25). */
  async copy(sourceId: number, input: roleCopyInputSchemaType, actor: Actor) {
    const source = await roleRepository.findById(sourceId);
    if (!source) throw new NotFoundError("Role not found");
    if (isSuperAdminRoleName(source.name)) throw systemRoleProtected("copy");

    return db.transaction(async (tx) => {
      await assertNameFree(input.name, tx);
      const role = await roleRepository.create(input.name, actor.id, tx);
      if (!role) throw new Error("Failed to create role");
      const keys = await permissionRepository.listKeysByRoleId(sourceId, tx);
      await permissionRepository.addKeys(tx, role.id, keys, actor.id);
      await authAuditRepository.insert(tx, {
        actorId: actor.id,
        action: "role.copy",
        target: `role:${role.id}`,
        before: { id: source.id, name: source.name },
        after: { ...role, keys },
      });
      return role;
    });
  },

  async update(id: number, input: roleUpdateSchemaType, actor: Actor) {
    const role = await roleRepository.findById(id);
    if (!role) throw new NotFoundError("Role not found");
    if (role.isSystem) throw systemRoleProtected("rename");

    const name = input.name as string;
    if (name === role.name) return role;

    if (await roleRepository.isUsedInApprovalChain(role.name)) {
      throw new ConflictError(
        "Cannot rename a role that an approval chain uses",
        "ROLE_IN_APPROVAL_CHAIN",
      );
    }

    const updated = await db.transaction(async (tx) => {
      await assertNameFree(name, tx);
      const row = await roleRepository.update(id, { name }, tx);
      if (!row) throw new NotFoundError("Role not found");
      await authAuditRepository.insert(tx, {
        actorId: actor.id,
        action: "role.rename",
        target: `role:${id}`,
        before: role,
        after: row,
      });
      return row;
    });
    invalidateRole(id);
    return updated;
  },

  async remove(id: number, actor: Actor) {
    const role = await roleRepository.findById(id);
    if (!role) throw new NotFoundError("Role not found");
    if (role.isSystem) throw systemRoleProtected("delete");

    const activeCount = await roleRepository.countActiveEmployees(id);
    if (activeCount > 0) {
      throw new ConflictError(
        `Cannot delete role. ${activeCount} active employees are assigned to it.`,
        "ROLE_HAS_EMPLOYEES",
      );
    }
    const inactiveCount = await roleRepository.countInactiveEmployees(id);
    if (inactiveCount > 0) {
      throw new ConflictError(
        `Cannot delete role. ${inactiveCount} inactive employees still have it; move them to another role first.`,
        "ROLE_HAS_INACTIVE_EMPLOYEES",
      );
    }
    if (await roleRepository.isUsedInApprovalChain(role.name)) {
      throw new ConflictError(
        "Cannot delete a role that an approval chain uses",
        "ROLE_IN_APPROVAL_CHAIN",
      );
    }

    await db.transaction(async (tx) => {
      const keys = await permissionRepository.listKeysByRoleId(id, tx);
      await roleRepository.remove(id, tx);
      await authAuditRepository.insert(tx, {
        actorId: actor.id,
        action: "role.delete",
        target: `role:${id}`,
        before: { ...role, keys },
      });
    });
    invalidateRole(id);
  },
};
