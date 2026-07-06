import { ConflictError, ForbiddenError, NotFoundError } from "../lib/errors";
import { roleRepository } from "../repository/roleRepository";
import type {
  roleInputSchemaType,
  roleListQuerySchemaType,
} from "../types/setup.types";

export const roleService = {
  async list(params: roleListQuerySchemaType) {
    const { rows, total } = await roleRepository.list(params);
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? Math.max(total, 1);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return {
      data: rows,
      meta: { page, pageSize, total, totalPages },
    };
  },

  async create(input: roleInputSchemaType, actorId: number) {
    return roleRepository.create(input.name, actorId);
  },

  async update(id: number, input: roleInputSchemaType) {
    const role = await roleRepository.findById(id);
    if (!role) {
      throw new NotFoundError("Role not found");
    }
    if (role.isSystem) {
      throw new ForbiddenError(
        "Cannot modify a system role",
        "SYSTEM_ROLE_PROTECTED",
      );
    }

    const updated = await roleRepository.update(id, input.name);
    if (!updated) {
      throw new NotFoundError("Role not found");
    }
    return updated;
  },

  async remove(id: number) {
    const role = await roleRepository.findById(id);
    if (!role) {
      throw new NotFoundError("Role not found");
    }
    if (role.isSystem) {
      throw new ForbiddenError(
        "Cannot delete a system role",
        "SYSTEM_ROLE_PROTECTED",
      );
    }

    const activeCount = await roleRepository.countActiveEmployees(id);
    if (activeCount > 0) {
      throw new ConflictError(
        `Cannot delete role. ${activeCount} active employees are assigned to it.`,
        "ROLE_HAS_EMPLOYEES",
      );
    }

    await roleRepository.remove(id);
  },
};
