import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "../db/client";
import {
  refreshTokens,
  rolePermissions,
  roles,
  screens,
} from "../db/schemas/01_auth";
import { employees } from "../db/schemas/03_hcm";
import type { DbExecutor } from "./executor";

export const authRepository = {
  async getEmployeeWithRoleByEmail(email: string) {
    const [row] = await db
      .select({
        id: employees.id,
        name: employees.name,
        email: employees.email,
        passwordHash: employees.passwordHash,
        roleId: employees.roleId,
        roleName: roles.name,
      })
      .from(employees)
      .innerJoin(roles, eq(roles.id, employees.roleId))
      .where(and(eq(employees.email, email), eq(employees.isActive, true)))
      .limit(1);
    return row;
  },

  /** BR-AUTH-29: the active QR-method employee whose current QR digest matches. */
  async getActiveQrEmployeeByTokenHash(qrTokenHash: string) {
    const [row] = await db
      .select({
        id: employees.id,
        name: employees.name,
        email: employees.email,
        passwordHash: employees.passwordHash,
      })
      .from(employees)
      .where(
        and(
          eq(employees.qrToken, qrTokenHash),
          eq(employees.isActive, true),
          isNull(employees.passwordHash),
        ),
      )
      .limit(1);
    return row;
  },

  /**
   * BR-AUTH-27: locks the employee row for the refresh rotation, so a password
   * reset, login-method change or deactivation (which lock the same row and
   * revoke every refresh token) is ordered strictly before or after it.
   */
  async lockEmployeeForRefresh(id: number, exec: DbExecutor) {
    const [row] = await exec
      .select({
        id: employees.id,
        name: employees.name,
        isActive: employees.isActive,
        passwordHash: employees.passwordHash,
      })
      .from(employees)
      .where(eq(employees.id, id))
      .limit(1)
      .for("update");
    return row;
  },

  /**
   * Employee + role + the role's keys in one query (BR-AUTH-12; #45), regardless
   * of the active flag (the caller decides).
   */
  async getActorRowById(id: number) {
    const [row] = await db
      .select({
        id: employees.id,
        name: employees.name,
        email: employees.email,
        isActive: employees.isActive,
        roleId: employees.roleId,
        roleName: roles.name,
        keys: sql<
          string[]
        >`coalesce(array_agg(${rolePermissions.permissionKey}) filter (where ${rolePermissions.permissionKey} is not null), '{}')`,
      })
      .from(employees)
      .innerJoin(roles, eq(roles.id, employees.roleId))
      .leftJoin(rolePermissions, eq(rolePermissions.roleId, employees.roleId))
      .where(eq(employees.id, id))
      .groupBy(employees.id, roles.id)
      .limit(1);
    return row;
  },

  /**
   * The screens a caller may open (BR-AUTH-13; #50): filtered in SQL, so
   * `/auth/me` never reads the whole screen table. `keys = null` = every screen
   * (super-admin).
   */
  async listScreensForKeys(keys: string[] | null) {
    const query = db
      .select({
        key: screens.key,
        path: screens.path,
        label: screens.label,
        menuGroup: screens.menuGroup,
        sortOrder: screens.sortOrder,
      })
      .from(screens);
    const filtered =
      keys === null
        ? query
        : query.where(
            keys.length === 0
              ? isNull(screens.permissionKey)
              : or(
                  isNull(screens.permissionKey),
                  inArray(screens.permissionKey, keys),
                ),
          );
    return filtered.orderBy(screens.sortOrder, screens.key);
  },

  async storeRefreshToken(
    data: {
      employeeId: number;
      tokenHash: string;
      expiresAt: Date;
    },
    exec: DbExecutor = db,
  ) {
    await exec.insert(refreshTokens).values(data);
  },

  /**
   * Atomic single-use gate for rotation (BR-AUTH-05): returns the row only to
   * the one caller whose DELETE actually removed it.
   */
  async consumeRefreshToken(
    tokenHash: string,
    employeeId: number,
    exec: DbExecutor = db,
  ) {
    const [row] = await exec
      .delete(refreshTokens)
      .where(
        and(
          eq(refreshTokens.tokenHash, tokenHash),
          eq(refreshTokens.employeeId, employeeId),
          gt(refreshTokens.expiresAt, new Date()),
        ),
      )
      .returning({ id: refreshTokens.id });
    return row;
  },

  /** Revokes every session of one employee (password / method change, deactivation). */
  async deleteRefreshTokensByEmployee(
    employeeId: number,
    exec: DbExecutor = db,
  ) {
    await exec
      .delete(refreshTokens)
      .where(eq(refreshTokens.employeeId, employeeId));
  },

  async deleteRefreshTokenByHash(tokenHash: string) {
    await db
      .delete(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash));
  },
};
