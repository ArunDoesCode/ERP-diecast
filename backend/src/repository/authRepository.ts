import { and, eq, gt } from "drizzle-orm";

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

  async getActiveEmployeeWithRoleById(id: number) {
    const [row] = await db
      .select({
        id: employees.id,
        name: employees.name,
        roleId: employees.roleId,
        roleName: roles.name,
      })
      .from(employees)
      .innerJoin(roles, eq(roles.id, employees.roleId))
      .where(and(eq(employees.id, id), eq(employees.isActive, true)))
      .limit(1);
    return row;
  },

  /** Employee + role regardless of active flag (BR-AUTH-12 decides in the caller). */
  async getEmployeeRoleById(id: number) {
    const [row] = await db
      .select({
        id: employees.id,
        name: employees.name,
        email: employees.email,
        isActive: employees.isActive,
        roleId: employees.roleId,
        roleName: roles.name,
        roleIsSystem: roles.isSystem,
      })
      .from(employees)
      .innerJoin(roles, eq(roles.id, employees.roleId))
      .where(eq(employees.id, id))
      .limit(1);
    return row;
  },

  async getPermissionKeysByRoleId(roleId: number) {
    const rows = await db
      .select({ key: rolePermissions.permissionKey })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, roleId));
    return rows.map((r) => r.key);
  },

  async listScreens() {
    return db
      .select({
        key: screens.key,
        path: screens.path,
        label: screens.label,
        menuGroup: screens.menuGroup,
        sortOrder: screens.sortOrder,
        permissionKey: screens.permissionKey,
      })
      .from(screens)
      .orderBy(screens.sortOrder, screens.key);
  },

  async storeRefreshToken(data: {
    employeeId: number;
    tokenHash: string;
    expiresAt: Date;
  }) {
    await db.insert(refreshTokens).values(data);
  },

  /**
   * Atomic single-use gate for rotation (BR-AUTH-05): returns the row only to
   * the one caller whose DELETE actually removed it.
   */
  async consumeRefreshToken(tokenHash: string) {
    const [row] = await db
      .delete(refreshTokens)
      .where(
        and(
          eq(refreshTokens.tokenHash, tokenHash),
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
