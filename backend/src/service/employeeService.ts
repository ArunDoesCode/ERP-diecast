import { invalidateActor, loadActor } from "../lib/auth-middleware";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/errors";
import { generateRawQrToken } from "../lib/qr-token";
import { employeeRepository } from "../repository/employeeRepository";
import { roleRepository } from "../repository/roleRepository";
import type {
  employeeInputSchemaType,
  employeeListQuerySchemaType,
  employeeSearchQuerySchemaType,
  employeeUpdateSchemaType,
} from "../types/setup.types";

async function assertNotLastActiveSuperAdmin(
  employeeId: number,
  currentRoleId: number,
) {
  // Super-admin-ness comes from the permission layer's own decision (BR-AUTH-11), not a role name here.
  const current = await loadActor(employeeId);
  if (!current?.isSuperAdmin) {
    return;
  }

  const activeCount = await roleRepository.countActiveEmployees(currentRoleId);
  if (activeCount <= 1) {
    throw new ConflictError(
      "Cannot remove the last active super-admin",
      "LAST_SUPER_ADMIN",
    );
  }
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

  async create(input: employeeInputSchemaType, actorId: number) {
    const role = await roleRepository.findById(input.roleId);
    if (!role) {
      throw new BadRequestError("Invalid roleId");
    }

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
        createdBy: actorId,
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
      createdBy: actorId,
    });
    return { ...employee, rawQrToken };
  },

  async update(id: number, input: employeeUpdateSchemaType) {
    const role = await roleRepository.findById(input.roleId);
    if (!role) {
      throw new BadRequestError("Invalid roleId");
    }

    const existingEmployee = await employeeRepository.findById(id);
    if (!existingEmployee) {
      throw new NotFoundError("Employee not found");
    }

    if (existingEmployee.roleId !== input.roleId) {
      await assertNotLastActiveSuperAdmin(id, existingEmployee.roleId);
    }

    const authState = await employeeRepository.findAuthStateById(id);
    if (!authState) {
      throw new NotFoundError("Employee not found");
    }

    const currentMethod: "password" | "qr" = authState.passwordHash
      ? "password"
      : "qr";

    if (input.loginMethod === "password") {
      const isFlippingToPassword = currentMethod === "qr";
      if (isFlippingToPassword && (!input.email || !input.password)) {
        throw new BadRequestError(
          "email and password are required when switching to password login",
        );
      }

      const employee = await employeeRepository.update(id, {
        name: input.name,
        phone: input.phone,
        dailyRatePaise: input.dailyRatePaise,
        roleId: input.roleId,
        qrToken: null,
        ...(input.email ? { email: input.email } : {}),
        ...(input.password
          ? { passwordHash: await Bun.password.hash(input.password) }
          : {}),
      });
      if (!employee) {
        throw new NotFoundError("Employee not found");
      }
      invalidateActor(id);
      return employee;
    }

    const isFlippingToQr = currentMethod === "password";
    const rawQrToken = isFlippingToQr ? generateRawQrToken() : undefined;

    const employee = await employeeRepository.update(id, {
      name: input.name,
      phone: input.phone,
      dailyRatePaise: input.dailyRatePaise,
      roleId: input.roleId,
      email: null,
      passwordHash: null,
      ...(rawQrToken ? { qrToken: await Bun.password.hash(rawQrToken) } : {}),
    });
    if (!employee) {
      throw new NotFoundError("Employee not found");
    }

    invalidateActor(id);
    return rawQrToken ? { ...employee, rawQrToken } : employee;
  },

  async remove(id: number) {
    const existingEmployee = await employeeRepository.findById(id);
    if (!existingEmployee) {
      throw new NotFoundError("Employee not found");
    }

    await assertNotLastActiveSuperAdmin(id, existingEmployee.roleId);

    const row = await employeeRepository.softDelete(id);
    if (!row) {
      throw new NotFoundError("Employee not found");
    }
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
