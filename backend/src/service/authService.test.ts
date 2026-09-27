/**
 * BL-018 regression: POST /auth/refresh must re-read the employee's role and
 * allowed pages from the DB, not copy them from the old token — otherwise a
 * role change or deactivation only takes effect after the next full login.
 * Real-DB test (test database, see bunfig.toml preload).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { roles } from "../db/schemas/01_auth";
import { employees } from "../db/schemas/03_hcm";
import { verifyAccessToken } from "../lib/token";
import { authRepository } from "../repository/authRepository";
import { authService } from "./authService";

const EMAIL = "test_bl018_refresh@diecast.test";
const PASSWORD = "bl018-password-123";

let employeeId: number;
let backOfficeRoleId: number;
let ownerRoleId: number;

async function roleId(name: string) {
  const [row] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, name))
    .limit(1);
  if (!row) throw new Error(`Fixture setup: role '${name}' does not exist`);
  return row.id;
}

beforeAll(async () => {
  backOfficeRoleId = await roleId("back_office");
  ownerRoleId = await roleId("owner");
  await db.delete(employees).where(eq(employees.email, EMAIL));
  const [row] = await db
    .insert(employees)
    .values({
      name: "TEST_bl018",
      email: EMAIL,
      passwordHash: await Bun.password.hash(PASSWORD),
      roleId: backOfficeRoleId,
    })
    .returning({ id: employees.id });
  if (!row) throw new Error("Fixture setup: employee insert returned no row");
  employeeId = row.id;
});

afterAll(async () => {
  // refresh_tokens cascade on employee delete
  await db.delete(employees).where(eq(employees.id, employeeId));
});

describe("authService.refresh re-reads role and pages (BL-018)", () => {
  test("a role change applies on the next refresh", async () => {
    const login = await authService.login(EMAIL, PASSWORD);
    expect(login.user.role).toBe("back_office");

    await db
      .update(employees)
      .set({ roleId: ownerRoleId })
      .where(eq(employees.id, employeeId));

    const refreshed = await authService.refresh(login.refreshToken);
    const payload = await verifyAccessToken(refreshed.accessToken);

    expect(payload.role).toBe("owner");
    expect(payload.allowedPages).toEqual(
      await authRepository.getPagesByRoleId(ownerRoleId),
    );
  });

  test("a deactivated employee cannot refresh", async () => {
    await db
      .update(employees)
      .set({ roleId: backOfficeRoleId, isActive: true })
      .where(eq(employees.id, employeeId));
    const login = await authService.login(EMAIL, PASSWORD);

    await db
      .update(employees)
      .set({ isActive: false })
      .where(eq(employees.id, employeeId));

    await expect(authService.refresh(login.refreshToken)).rejects.toMatchObject(
      { statusCode: 401 },
    );
  });
});
