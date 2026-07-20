import { and, eq, gt } from "drizzle-orm";

import { db } from "../db/client";
import {
  pages,
  refreshTokens,
  rolePages,
  roles,
} from "../db/schemas/01_auth";
import { employees } from "../db/schemas/03_hcm";

type CreateEmployeeInput = {
  name: string;
  email: string;
  phone?: string;
  roleId: number;
  passwordHash: string;
};

export const authRepository = {
  async getRoleByName(roleName: string) {
    const [role] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, roleName as any))
      .limit(1);
    return role;
  },

  async getEmployeeByEmail(email: string) {
    const [employee] = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.email, email))
      .limit(1);
    return employee;
  },

  async createEmployee(data: CreateEmployeeInput) {
    const [employee] = await db.insert(employees).values(data).returning({
      id: employees.id,
      name: employees.name,
      email: employees.email,
    });
    return employee;
  },

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
