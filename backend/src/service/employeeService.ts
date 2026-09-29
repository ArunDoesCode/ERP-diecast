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
import { authRepository } from "../repository/authRepository";
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
async function assertCanAssign(
  actor: Actor,
  role: RoleRow,
  exec: DbExecutor = db,
) {
  if (actor.isSuperAdmin) return;
  if (isSuperAdminRoleName(role.name)) {
    throw new ForbiddenError(
      "Only a super-admin can assign the super-admin role",
      "ROLE_NOT_ASSIGNABLE",
    );
  }
  const keys = await permissionRepository.listKeysByRoleId(role.id, exec);
  const missing = keys.filter((key) => !actor.permissions.has(key as never));
  if (missing.length > 0) {
    throw new ForbiddenError(
      "You cannot assign a role with keys you do not hold",
      "ROLE_NOT_ASSIGNABLE",
    );
  }
}

/**
 * BR-AUTH-16 (v9): any change to an employee (edit, deactivate, QR regenerate,
 * role change) needs the target's CURRENT role to be one the caller could assign.
 */
const assertCanManageTarget = assertCanAssign;

/**
 * BR-AUTH-17: an active super-admin may not be moved to another role or
 * deactivated when they are the last active one. Call only after
 * `lockTarget`, which holds locks on every active super-admin.
 */
async function assertNotLastActiveAdmin(
  employee: { isActive: boolean },
  role: RoleRow,
  exec: DbExecutor,
) {
  if (!employee.isActive) return;
  if (!isSuperAdminRoleName(role.name)) return;
  const activeCount = await roleRepository.countActiveEmployees(role.id, exec);
  if (activeCount <= 1) {
    throw new ConflictError(
      "Cannot leave the system without an active super-admin",
      "LAST_ADMIN",
    );
  }
}

/**
 * Inside the write transaction: lock all active super-admins (when the target
 * is one) in id order, then the target row, and return its fresh state.
 * Concurrent demotions/deactivations therefore run one after the other and
 * the second sees the first's result (BR-AUTH-17, v9).
 */
async function lockTarget(id: number, tx: DbExecutor) {
  const peek = await employeeRepository.findById(id, tx);
  if (!peek) throw new NotFoundError("Employee not found");
  const role = await roleRepository.findById(peek.roleId, tx);
  if (!role) throw new NotFoundError("Role not found");
  if (isSuperAdminRoleName(role.name)) {
    await employeeRepository.lockActiveByRole(role.id, tx);
  }
  const employee = await employeeRepository.findByIdForUpdate(id, tx);
  if (!employee) throw new NotFoundError("Employee not found");
  if (employee.roleId !== peek.roleId) {
    throw new ConflictError("Employee changed, try again", "CONFLICT");
  }
  return { employee, role };
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

/** Audit view of an employee: never a password, hash or QR token (BR-AUTH-20). */
function employeeAuditView(
  e: {
    id: number;
    name: string;
    email: string | null;
    phone: string | null;
    dailyRatePaise: number | null;
    roleId: number;
  },
  loginMethod: "password" | "qr",
  extra: Record<string, unknown> = {},
) {
  return {
    employeeId: e.id,
    name: e.name,
    email: e.email,
    phone: e.phone,
    dailyRatePaise: e.dailyRatePaise,
    roleId: e.roleId,
    loginMethod,
    ...extra,
  };
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

    if (input.loginMethod === "password" && (!input.email || !input.password)) {
      throw new BadRequestError(
        "email and password are required for password login",
      );
    }

    const isPassword = input.loginMethod === "password";
    const method: "password" | "qr" = isPassword ? "password" : "qr";
    const rawQrToken = isPassword ? undefined : generateRawQrToken();
    const passwordHash =
      isPassword && input.password
        ? await Bun.password.hash(input.password)
        : null;
    const qrToken = rawQrToken ? await Bun.password.hash(rawQrToken) : null;

    const employee = await db.transaction(async (tx) => {
      const row = await employeeRepository.create(
        {
          name: input.name,
          phone: input.phone,
          dailyRatePaise: input.dailyRatePaise,
          roleId: input.roleId,
          email: isPassword ? (input.email ?? null) : null,
          passwordHash,
          qrToken,
          createdBy: actor.id,
        },
        tx,
      );
      await authAuditRepository.insert(tx, {
        actorId: actor.id,
        action: "employee.create",
        target: `employee:${row.id}`,
        after: employeeAuditView(row, method, { roleName: role.name }),
      });
      return row;
    });
    return rawQrToken ? { ...employee, rawQrToken } : employee;
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
    // Early, cheap refusal (before hashing); re-checked under lock below.
    await assertCanManageTarget(actor, await loadRole(existingEmployee.roleId));

    const authState = await employeeRepository.findAuthStateById(id);
    if (!authState) {
      throw new NotFoundError("Employee not found");
    }

    const currentMethod: "password" | "qr" = authState.passwordHash
      ? "password"
      : "qr";

    let patch: Parameters<typeof employeeRepository.update>[1];
    let rawQrToken: string | undefined;
    let passwordChanged = false;

    if (input.loginMethod === "password") {
      const isFlippingToPassword = currentMethod === "qr";
      if (isFlippingToPassword && (!input.email || !input.password)) {
        throw new BadRequestError(
          "email and password are required when switching to password login",
        );
      }
      passwordChanged = Boolean(input.password);

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
    const methodChanged = input.loginMethod !== currentMethod;

    const employee = await db.transaction(async (tx) => {
      const { employee: current, role: currentRole } = await lockTarget(id, tx);
      await assertCanManageTarget(actor, currentRole, tx);

      // An unchanged roleId is not a role change: no BR-AUTH-16/17 check, no role log.
      const roleChanged = current.roleId !== input.roleId;
      if (roleChanged) {
        await assertCanAssign(actor, role, tx);
        await assertNotLastActiveAdmin(current, currentRole, tx);
      }

      const row = await employeeRepository.update(id, patch, tx);
      if (!row) throw new NotFoundError("Employee not found");

      if (passwordChanged || methodChanged) {
        await authRepository.deleteRefreshTokensByEmployee(id, tx);
      }
      await authAuditRepository.insert(tx, {
        actorId: actor.id,
        action: "employee.update",
        target: `employee:${id}`,
        before: employeeAuditView(current, currentMethod),
        after: employeeAuditView(row, input.loginMethod, {
          passwordChanged,
          methodChanged,
        }),
      });
      if (roleChanged) {
        await authAuditRepository.insert(tx, {
          actorId: actor.id,
          action: "employee.role",
          target: `employee:${id}`,
          before: await roleSnapshot(id, current.roleId, tx),
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

    const employee = await db.transaction(async (tx) => {
      const { employee: current, role: currentRole } = await lockTarget(id, tx);
      if (current.roleId === roleId) return current;
      await assertCanManageTarget(actor, currentRole, tx);
      await assertCanAssign(actor, role, tx);
      await assertNotLastActiveAdmin(current, currentRole, tx);

      const row = await employeeRepository.update(id, { roleId }, tx);
      if (!row) throw new NotFoundError("Employee not found");
      await authAuditRepository.insert(tx, {
        actorId: actor.id,
        action: "employee.role",
        target: `employee:${id}`,
        before: await roleSnapshot(id, current.roleId, tx),
        after: { employeeId: id, roleId, roleName: role.name },
      });
      return row;
    });
    invalidateActor(id);
    return employee;
  },

  async remove(id: number, actor: Actor) {
    await db.transaction(async (tx) => {
      const { employee: current, role } = await lockTarget(id, tx);
      await assertCanManageTarget(actor, role, tx);
      await assertNotLastActiveAdmin(current, role, tx);

      const row = await employeeRepository.softDelete(id, tx);
      if (!row) throw new NotFoundError("Employee not found");
      await authRepository.deleteRefreshTokensByEmployee(id, tx);
      await authAuditRepository.insert(tx, {
        actorId: actor.id,
        action: "employee.deactivate",
        target: `employee:${id}`,
        before: { employeeId: id, isActive: current.isActive },
        after: { employeeId: id, isActive: false },
      });
    });
    invalidateActor(id);
  },

  async regenerateQr(id: number, actor: Actor) {
    const authState = await employeeRepository.findAuthStateById(id);
    if (!authState) {
      throw new NotFoundError("Employee not found");
    }

    const rawQrToken = generateRawQrToken();
    const qrToken = await Bun.password.hash(rawQrToken);
    await db.transaction(async (tx) => {
      const { role } = await lockTarget(id, tx);
      await assertCanManageTarget(actor, role, tx);
      await employeeRepository.update(id, { qrToken }, tx);
      // The raw token and its hash are never logged (BR-AUTH-20).
      await authAuditRepository.insert(tx, {
        actorId: actor.id,
        action: "employee.qr",
        target: `employee:${id}`,
        after: { employeeId: id, qrRegenerated: true },
      });
    });
    invalidateActor(id);

    return { qrToken: rawQrToken };
  },
};
