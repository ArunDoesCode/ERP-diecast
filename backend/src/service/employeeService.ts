import { db } from "../db/client";
import {
  type Actor,
  invalidateActor,
  isSuperAdminRoleName,
} from "../lib/auth-middleware";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../lib/errors";
import { generateRawQrToken } from "../lib/qr-token";
import { authAuditRepository } from "../repository/authAuditRepository";
import { employeeRepository } from "../repository/employeeRepository";
import type { DbExecutor } from "../repository/executor";
import { permissionRepository } from "../repository/permissionRepository";
import { roleRepository } from "../repository/roleRepository";
import type {
  employeeInputSchemaType,
  employeeListQuerySchemaType,
  employeeSearchQuerySchemaType,
  employeeUpdateSchemaType,
} from "../types/setup.types";

type RoleRow = NonNullable<Awaited<ReturnType<typeof roleRepository.findById>>>;

/**
 * BR-AUTH-16 no escalation: only super-admin may assign the super-admin role;
 * everyone else may assign a role only if they hold every key it grants.
 */
async function assertCanAssign(actor: Actor, role: RoleRow) {
  if (actor.isSuperAdmin) return;
  if (isSuperAdminRoleName(role.name)) {
    throw new ForbiddenError(
      "Only a super-admin can assign the super-admin role",
      "ROLE_NOT_ASSIGNABLE",
    );
  }
  const keys = await permissionRepository.listKeysByRoleId(role.id);
  const missing = keys.filter((key) => !actor.permissions.has(key as never));
  if (missing.length > 0) {
    throw new ForbiddenError(
      "You cannot assign a role with keys you do not hold",
      "ROLE_NOT_ASSIGNABLE",
    );
  }
}

/**
 * BR-AUTH-17: an active super-admin may not be moved to another role or
 * deactivated when they are the last active one.
 */
async function assertNotLastActiveAdmin(
  employee: { roleId: number; isActive: boolean },
  exec: DbExecutor,
) {
  if (!employee.isActive) return;
  const role = await roleRepository.findById(employee.roleId, exec);
  if (!role || !isSuperAdminRoleName(role.name)) return;
  const activeCount = await roleRepository.countActiveEmployees(role.id, exec);
  if (activeCount <= 1) {
    throw new ConflictError(
      "Cannot leave the system without an active super-admin",
      "LAST_ADMIN",
    );
  }
}

async function roleSnapshot(
  employeeId: number,
  roleId: number,
  exec: DbExecutor,
) {
  const role = await roleRepository.findById(roleId, exec);
  return { employeeId, roleId, roleName: role?.name ?? null };
}

async function loadRole(roleId: number) {
  const role = await roleRepository.findById(roleId);
  if (!role) throw new NotFoundError("Role not found");
  return role;
}

export const employeeService = {
  async list(params: employeeListQuerySchemaType) {
    const { rows, total } = await employeeRepository.list(params);
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? Math.max(total, 1);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return {
      data: rows,
      meta: { page, pageSize, total, totalPages },
    };
  },

  async search(params: employeeSearchQuerySchemaType) {
    const { rows, total } = await employeeRepository.search(params);
    const totalPages = Math.max(1, Math.ceil(total / params.pageSize));
    return {
      data: rows,
      meta: {
        page: params.page,
        pageSize: params.pageSize,
        total,
        totalPages,
      },
    };
  },

  /** Roles the caller may assign (BR-AUTH-16): super-admin all; others subset roles, never super-admin. */
  async assignableRoles(actor: Actor) {
    const allRoles = await roleRepository.listAll();
    if (actor.isSuperAdmin) {
      return allRoles.map(({ id, name }) => ({ id, name }));
    }
    const pairs = await permissionRepository.listAllRoleKeys();
    const keysByRole = new Map<number, string[]>();
    for (const { roleId, key } of pairs) {
      keysByRole.set(roleId, [...(keysByRole.get(roleId) ?? []), key]);
    }
    return allRoles
      .filter(
        (role) =>
          !isSuperAdminRoleName(role.name) &&
          (keysByRole.get(role.id) ?? []).every((key) =>
            actor.permissions.has(key as never),
          ),
      )
      .map(({ id, name }) => ({ id, name }));
  },

  async create(input: employeeInputSchemaType, actor: Actor) {
    const role = await roleRepository.findById(input.roleId);
    if (!role) {
      throw new BadRequestError("Invalid roleId");
    }
    await assertCanAssign(actor, role);

    if (input.loginMethod === "password") {
      if (!input.email || !input.password) {
        throw new BadRequestError(
          "email and password are required for password login",
        );
      }

      const passwordHash = await Bun.password.hash(input.password);
      const employee = await employeeRepository.create({
        name: input.name,
        phone: input.phone,
        dailyRatePaise: input.dailyRatePaise,
        roleId: input.roleId,
        email: input.email,
        passwordHash,
        qrToken: null,
        createdBy: actor.id,
      });
      return employee;
    }

    const rawQrToken = generateRawQrToken();
    const qrToken = await Bun.password.hash(rawQrToken);
    const employee = await employeeRepository.create({
      name: input.name,
      phone: input.phone,
      dailyRatePaise: input.dailyRatePaise,
      roleId: input.roleId,
      email: null,
      passwordHash: null,
      qrToken,
      createdBy: actor.id,
    });
    return { ...employee, rawQrToken };
  },

  async update(id: number, input: employeeUpdateSchemaType, actor: Actor) {
    const role = await roleRepository.findById(input.roleId);
    if (!role) {
      throw new BadRequestError("Invalid roleId");
    }

    const existingEmployee = await employeeRepository.findById(id);
    if (!existingEmployee) {
      throw new NotFoundError("Employee not found");
    }

    // An unchanged roleId is not a role change: no BR-AUTH-16/17 check, no log.
    const roleChanged = existingEmployee.roleId !== input.roleId;
    if (roleChanged) {
      await assertCanAssign(actor, role);
      await assertNotLastActiveAdmin(existingEmployee, db);
    }

    const authState = await employeeRepository.findAuthStateById(id);
    if (!authState) {
      throw new NotFoundError("Employee not found");
    }

    const currentMethod: "password" | "qr" = authState.passwordHash
      ? "password"
      : "qr";

    let patch: Parameters<typeof employeeRepository.update>[1];
    let rawQrToken: string | undefined;

    if (input.loginMethod === "password") {
      const isFlippingToPassword = currentMethod === "qr";
      if (isFlippingToPassword && (!input.email || !input.password)) {
        throw new BadRequestError(
          "email and password are required when switching to password login",
        );
      }

      patch = {
        name: input.name,
        phone: input.phone,
        dailyRatePaise: input.dailyRatePaise,
        roleId: input.roleId,
        qrToken: null,
        ...(input.email ? { email: input.email } : {}),
        ...(input.password
          ? { passwordHash: await Bun.password.hash(input.password) }
          : {}),
      };
    } else {
      rawQrToken =
        currentMethod === "password" ? generateRawQrToken() : undefined;
      patch = {
        name: input.name,
        phone: input.phone,
        dailyRatePaise: input.dailyRatePaise,
        roleId: input.roleId,
        email: null,
        passwordHash: null,
        ...(rawQrToken ? { qrToken: await Bun.password.hash(rawQrToken) } : {}),
      };
    }

    const employee = await db.transaction(async (tx) => {
      const row = await employeeRepository.update(id, patch, tx);
      if (!row) throw new NotFoundError("Employee not found");
      if (roleChanged) {
        await authAuditRepository.insert(tx, {
          actorId: actor.id,
          action: "employee.role",
          target: `employee:${id}`,
          before: await roleSnapshot(id, existingEmployee.roleId, tx),
          after: { employeeId: id, roleId: row.roleId, roleName: role.name },
        });
      }
      return row;
    });
    invalidateActor(id);
    return rawQrToken ? { ...employee, rawQrToken } : employee;
  },

  /** Give one employee their one role (BR-AUTH-08, 16, 17). */
  async assignRole(id: number, roleId: number, actor: Actor) {
    const existing = await employeeRepository.findById(id);
    if (!existing) throw new NotFoundError("Employee not found");
    const role = await loadRole(roleId);
    if (existing.roleId === roleId) return existing;

    await assertCanAssign(actor, role);
    await assertNotLastActiveAdmin(existing, db);

    const employee = await db.transaction(async (tx) => {
      const row = await employeeRepository.update(id, { roleId }, tx);
      if (!row) throw new NotFoundError("Employee not found");
      await authAuditRepository.insert(tx, {
        actorId: actor.id,
        action: "employee.role",
        target: `employee:${id}`,
        before: await roleSnapshot(id, existing.roleId, tx),
        after: { employeeId: id, roleId, roleName: role.name },
      });
      return row;
    });
    invalidateActor(id);
    return employee;
  },

  async remove(id: number, actor: Actor) {
    const existingEmployee = await employeeRepository.findById(id);
    if (!existingEmployee) {
      throw new NotFoundError("Employee not found");
    }

    await assertNotLastActiveAdmin(existingEmployee, db);

    await db.transaction(async (tx) => {
      const row = await employeeRepository.softDelete(id, tx);
      if (!row) throw new NotFoundError("Employee not found");
      await authAuditRepository.insert(tx, {
        actorId: actor.id,
        action: "employee.deactivate",
        target: `employee:${id}`,
        before: { employeeId: id, isActive: existingEmployee.isActive },
        after: { employeeId: id, isActive: false },
      });
    });
    invalidateActor(id);
  },

  async regenerateQr(id: number) {
    const authState = await employeeRepository.findAuthStateById(id);
    if (!authState) {
      throw new NotFoundError("Employee not found");
    }

    const rawQrToken = generateRawQrToken();
    const qrToken = await Bun.password.hash(rawQrToken);
    await employeeRepository.update(id, { qrToken });

    return { qrToken: rawQrToken };
  },
};
