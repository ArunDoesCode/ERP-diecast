/**
 * docs/specs/auth-setup.md
 * BR-AUTH-01 — Refreshing a session issues an access token whose `role` and
 *   `allowedPages` are the employee's current role and that role's current
 *   page grants in the database — never values copied from the previous
 *   token.
 * BR-AUTH-02 — An employee who is inactive (isActive = false) at refresh
 *   time cannot refresh: the request is rejected as unauthorised (401) and
 *   no new tokens are issued.
 *
 * Real-DB test (test database, see bunfig.toml preload). Written by
 * test-writer from the spec only (redo of PR #4's coordinator-authored
 * version per .pipeline/bl018-bl022-tests/findings.md#F-01).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createApp } from "../../src/app";
import { db } from "../../src/db/client";
import { roles } from "../../src/db/schemas/01_auth";
import { employees } from "../../src/db/schemas/03_hcm";
import { invalidateActor } from "../../src/lib/auth-middleware";
import { authService } from "../../src/service/authService";

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
      isActive: true,
    })
    .returning({ id: employees.id });
  if (!row) throw new Error("Fixture setup: employee insert returned no row");
  employeeId = row.id;
});

afterAll(async () => {
  // refresh_tokens cascade on employee delete
  await db.delete(employees).where(eq(employees.id, employeeId));
});

describe("authService.refresh — BR-AUTH-01: role/pages come from the DB, not the old token", () => {
  test("a role change made after login is reflected in the next refreshed access token", async () => {
    const login = await authService.login(EMAIL, PASSWORD);
    expect(login.user.role).toBe("back_office");

    await db
      .update(employees)
      .set({ roleId: ownerRoleId })
      .where(eq(employees.id, employeeId));

    invalidateActor(employeeId);

    const refreshed = await authService.refresh(login.refreshToken);
    const me = await createApp().request("/api/auth/me", {
      headers: { Authorization: `Bearer ${refreshed.accessToken}` },
    });
    const data = (
      (await me.json()) as { data: { role: string; permissions: string[] } }
    ).data;

    // Spec v6 BR-AUTH-01: current DB record, shown by /auth/me (role and its keys).
    expect(data.role).toBe("owner");
    expect(data.permissions.length).toBeGreaterThan(0);
  });
});

describe("authService.refresh — BR-AUTH-02: an inactive employee cannot refresh", () => {
  test("a deactivated employee's refresh is rejected as unauthorised and issues no tokens", async () => {
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
