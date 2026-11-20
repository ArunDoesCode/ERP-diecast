import { db } from "../db/client";
import { type Actor, loadActor } from "../lib/auth-middleware";
import { env } from "../lib/env";
import { UnauthorizedError } from "../lib/errors";
import { hashQrToken } from "../lib/qr-token";
import {
  sha256,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../lib/token";
import { authRepository } from "../repository/authRepository";

const invalidCredentials = () =>
  new UnauthorizedError("Invalid credentials", "INVALID_CREDENTIALS");

/**
 * BR-AUTH-27: a short one-way fingerprint of the employee's credential, carried in the refresh
 * token. Any password change (new salted hash) or login-method change gives a different value,
 * so a refresh token issued before the change no longer matches.
 */
async function credentialVersion(employee: { passwordHash: string | null }) {
  const source = employee.passwordHash ? `pw:${employee.passwordHash}` : "qr";
  return (await sha256(source)).slice(0, 32);
}

const refreshExpiry = () =>
  new Date(Date.now() + env.REFRESH_TOKEN_TTL_SECONDS * 1000);

export const authService = {
  /** BR-AUTH-13: the shape returned by `/auth/me` and login `user`. */
  async getSessionUser(actor: Actor, email: string | null) {
    // #50: only the caller's screens are read, filtered in SQL.
    const screens = await authRepository.listScreensForKeys(
      actor.isSuperAdmin ? null : [...actor.permissions],
    );
    return {
      id: actor.id,
      name: actor.name,
      email,
      role: actor.roleName,
      isSuperAdmin: actor.isSuperAdmin,
      permissions: [...actor.permissions],
      screens,
    };
  },

  /** Tokens + session user for an employee who has just proven who they are. */
  async startSession(employee: {
    id: number;
    name: string;
    email: string | null;
    passwordHash: string | null;
  }) {
    const actor = await loadActor(employee.id);
    if (!actor?.isActive) throw invalidCredentials();

    // Token carries identity only; role and keys are read per request (BR-AUTH-12).
    const payload = { userId: employee.id, userName: employee.name };
    const accessToken = await signAccessToken(payload);
    const refreshToken = await signRefreshToken({
      ...payload,
      cv: await credentialVersion(employee),
    });

    await authRepository.storeRefreshToken({
      employeeId: employee.id,
      tokenHash: await sha256(refreshToken),
      expiresAt: refreshExpiry(),
    });

    return {
      accessToken,
      refreshToken,
      user: await this.getSessionUser(actor, employee.email),
    };
  },

  async login(email: string, password: string) {
    const employee = await authRepository.getEmployeeWithRoleByEmail(email);
    if (!employee?.passwordHash) throw invalidCredentials();

    const isValidPassword = await Bun.password.verify(
      password,
      employee.passwordHash,
    );
    if (!isValidPassword) throw invalidCredentials();

    return this.startSession(employee);
  },

  /**
   * BR-AUTH-29: operator QR login. Only an active QR-method employee whose
   * current QR token matches; every failure is the same 401.
   */
  async qrLogin(rawQrToken: string) {
    const employee = await authRepository.getActiveQrEmployeeByTokenHash(
      await hashQrToken(rawQrToken),
    );
    if (!employee) throw invalidCredentials();
    return this.startSession(employee);
  },

  async refresh(refreshToken: string) {
    // jose throws its own error class for expired/malformed JWTs; normalize to 401.
    const payload = await verifyRefreshToken(refreshToken).catch(() => {
      throw new UnauthorizedError("Refresh token invalid");
    });
    const employeeId = Number(payload.userId);
    const refreshHash = await sha256(refreshToken);

    // BR-AUTH-27: one transaction, employee row locked first. A password reset,
    // login-method change or deactivation locks the same row and revokes every
    // refresh token in its own transaction, so it is ordered strictly before
    // (this token is gone -> 401) or after (it revokes the new token) — a
    // refresh racing it never keeps a session.
    const next = await db.transaction(async (tx) => {
      const employee = await authRepository.lockEmployeeForRefresh(
        employeeId,
        tx,
      );
      if (!employee) return null;

      // Atomic single-use gate (BR-AUTH-05): only the caller whose DELETE
      // removes the row may continue; a concurrent or repeated use gets 401.
      const consumed = await authRepository.consumeRefreshToken(
        refreshHash,
        employeeId,
        tx,
      );
      // Deactivation blocks refresh (BR-AUTH-01/02), and so does a password or login-method
      // change since the token was issued (BR-AUTH-27); the consumed token stays gone.
      const cv = await credentialVersion(employee);
      if (!consumed || !employee.isActive || payload.cv !== cv) return null;

      // New tokens carry the current name.
      const nextPayload = { userId: employee.id, userName: employee.name };
      const accessToken = await signAccessToken(nextPayload);
      const newRefreshToken = await signRefreshToken({ ...nextPayload, cv });
      await authRepository.storeRefreshToken(
        {
          employeeId: employee.id,
          tokenHash: await sha256(newRefreshToken),
          expiresAt: refreshExpiry(),
        },
        tx,
      );
      return { accessToken, refreshToken: newRefreshToken };
    });

    if (!next) throw new UnauthorizedError("Refresh token invalid");
    return next;
  },

  async logout(refreshToken: string) {
    if (!refreshToken) {
      return;
    }

    const refreshHash = await sha256(refreshToken);
    await authRepository.deleteRefreshTokenByHash(refreshHash);
  },
};
