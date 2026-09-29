import { and, eq, gt } from "drizzle-orm";

import { db } from "../db/client";
import {
  pages,
  refreshTokens,
  rolePages,
  rolePermissions,
  roles,
  screens,
} from "../db/schemas/01_auth";
import { employees } from "../db/schemas/03_hcm";

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

  async getPagesByRoleId(roleId: number) {
    const pageRows = await db
      .select({ key: pages.key })
      .from(pages)
      .innerJoin(rolePages, eq(rolePages.pageId, pages.id))
      .where(eq(rolePages.roleId, roleId))
      .orderBy(pages.sortOrder);
    return pageRows.map((p) => p.key);
  },

  async storeRefreshToken(data: {
    employeeId: number;
    tokenHash: string;
    expiresAt: Date;
  }) {
    await db.insert(refreshTokens).values(data);
  },

  async getRefreshTokenByHash(tokenHash: string) {
    const [token] = await db
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.tokenHash, tokenHash),
          gt(refreshTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);
    return token;
  },

  async deleteRefreshToken(tokenId: number) {
    await db.delete(refreshTokens).where(eq(refreshTokens.id, tokenId));
  },

  async deleteRefreshTokenByHash(tokenHash: string) {
    await db
      .delete(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash));
  },
};
