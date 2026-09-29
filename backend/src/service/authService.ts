import { type Actor, loadActor } from "../lib/auth-middleware";
import { env } from "../lib/env";
import { UnauthorizedError } from "../lib/errors";
import {
  sha256,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../lib/token";
import { authRepository } from "../repository/authRepository";

export const authService = {
  /** BR-AUTH-13: the shape returned by `/auth/me` and login `user`. */
  async getSessionUser(actor: Actor, email: string | null) {
    const rows = await authRepository.listScreens();
    const screens = rows
      .filter(
        (r) =>
          actor.isSuperAdmin ||
          r.permissionKey === null ||
          actor.permissions.has(r.permissionKey as never),
      )
      .map(({ key, path, label, menuGroup, sortOrder }) => ({
        key,
        path,
        label,
        menuGroup,
        sortOrder,
      }));
    return {
      id: actor.id,
      name: actor.name,
      email,
      role: actor.roleName,
      permissions: [...actor.permissions],
      screens,
    };
  },

  async login(email: string, password: string) {
    const employee = await authRepository.getEmployeeWithRoleByEmail(email);
    if (!employee || !employee.passwordHash) {
      throw new UnauthorizedError("Invalid credentials", "INVALID_CREDENTIALS");
    }

    const isValidPassword = await Bun.password.verify(
      password,
      employee.passwordHash,
    );
    if (!isValidPassword) {
      throw new UnauthorizedError("Invalid credentials", "INVALID_CREDENTIALS");
    }

    const actor = await loadActor(employee.id);
    if (!actor?.isActive) {
      throw new UnauthorizedError("Invalid credentials", "INVALID_CREDENTIALS");
    }

    // Token carries identity only; role and keys are read per request (BR-AUTH-12).
    const payload = { userId: employee.id, userName: employee.name };
    const accessToken = await signAccessToken(payload);
    const refreshToken = await signRefreshToken(payload);

    await authRepository.storeRefreshToken({
      employeeId: employee.id,
      tokenHash: await sha256(refreshToken),
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_SECONDS * 1000),
    });

    return {
      accessToken,
      refreshToken,
      user: await this.getSessionUser(actor, employee.email),
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

    // Atomic single-use gate (BR-AUTH-05): only the caller whose DELETE removes
    // the row may continue; a concurrent or repeated use gets 401.
    const consumed = await authRepository.consumeRefreshToken(refreshHash);
    if (!consumed) {
      throw new UnauthorizedError("Refresh token invalid");
    }

    // Re-read the employee (BR-AUTH-01/02): deactivation blocks refresh, and the
    // new tokens carry the current name.
    const employee = await authRepository.getActiveEmployeeWithRoleById(
      Number(payload.userId),
    );
    if (!employee) {
      throw new UnauthorizedError("Refresh token invalid");
    }

    // Generate new tokens
    const nextPayload = { userId: employee.id, userName: employee.name };

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
