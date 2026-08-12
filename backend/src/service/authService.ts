import { env } from "../lib/env";
import {
  BadRequestError,
  ConflictError,
  UnauthorizedError,
} from "../lib/errors";
import {
  type Role,
  sha256,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../lib/token";
import { authRepository } from "../repository/authRepository";
import type { registerSchemaType } from "../types/auth.types";

export const authService = {
  async register(data: registerSchemaType) {
    // Verify role exists
    const role = await authRepository.getRoleByName(data.role);
    if (!role) {
      throw new BadRequestError("Invalid role");
    }

    // Check email doesn't exist
    const existing = await authRepository.getEmployeeByEmail(data.email);
    if (existing) {
      throw new ConflictError("Email already exists", "EMAIL_EXISTS");
    }

    // Hash password and create employee
    const passwordHash = await Bun.password.hash(data.password);
    const employeeData: {
      name: string;
      email: string;
      phone?: string;
      roleId: number;
      passwordHash: string;
    } = {
      name: data.name,
      email: data.email,
      passwordHash,
      roleId: role.id,
    };
    if (data.phone) {
      employeeData.phone = data.phone;
    }
    const employee = await authRepository.createEmployee(employeeData);

    return employee;
  },

  async login(email: string, password: string) {
    // Get employee with role
    const employee = await authRepository.getEmployeeWithRoleByEmail(email);
    if (!employee || !employee.passwordHash) {
      throw new UnauthorizedError("Invalid credentials", "INVALID_CREDENTIALS");
    }

    // Verify password
    const isValidPassword = await Bun.password.verify(
      password,
      employee.passwordHash,
    );
    if (!isValidPassword) {
      throw new UnauthorizedError("Invalid credentials", "INVALID_CREDENTIALS");
    }

    // Get allowed pages
    const allowedPages = await authRepository.getPagesByRoleId(employee.roleId);

    // Generate tokens
    const payload = {
      userId: employee.id,
      userName: employee.name,
      role: employee.roleName as Role,
      allowedPages,
    };

    const accessToken = await signAccessToken(payload);
    const refreshToken = await signRefreshToken(payload);

    // Store refresh token
    const refreshExpiry = new Date(
      Date.now() + env.REFRESH_TOKEN_TTL_SECONDS * 1000,
    );

    await authRepository.storeRefreshToken({
      employeeId: employee.id,
      tokenHash: await sha256(refreshToken),
      expiresAt: refreshExpiry,
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: employee.id,
        name: employee.name,
        email: employee.email,
        role: employee.roleName,
        allowedPages,
      },
    };
  },

  async refresh(refreshToken: string) {
    // Verify refresh token — jose throws its own error class for
    // expired/malformed JWTs; normalize to a proper 401 instead of
    // letting it fall through to the generic 500 handler.
    const payload = await verifyRefreshToken(refreshToken).catch(() => {
      throw new UnauthorizedError("Refresh token invalid");
    });
    const refreshHash = await sha256(refreshToken);

    // Get stored refresh token
    const token = await authRepository.getRefreshTokenByHash(refreshHash);
    if (!token) {
      throw new UnauthorizedError("Refresh token invalid");
    }

    // Delete old refresh token
    await authRepository.deleteRefreshToken(token.id);

    // Generate new tokens
    const nextPayload = {
      userId: payload.userId,
      userName: payload.userName,
      role: payload.role,
      allowedPages: payload.allowedPages,
    };

    const newAccessToken = await signAccessToken(nextPayload);
    const newRefreshToken = await signRefreshToken(nextPayload);

    // Store new refresh token
    await authRepository.storeRefreshToken({
      employeeId: Number(payload.userId),
      tokenHash: await sha256(newRefreshToken),
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_SECONDS * 1000),
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  },

  async logout(refreshToken: string) {
    if (!refreshToken) {
      return;
    }

    const refreshHash = await sha256(refreshToken);
    await authRepository.deleteRefreshTokenByHash(refreshHash);
  },
};
