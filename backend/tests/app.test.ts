/**
 * HTTP smoke tests through the real app (middleware + routers + onError),
 * the pattern for future endpoint tests: `createApp().request(path, init)`.
 * The 403 case uses a real DB user: the role comes from the DB (BR-AUTH-12).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { like } from "drizzle-orm";
import { createApp } from "../src/app";
import { db } from "../src/db/client";
import { roles } from "../src/db/schemas/01_auth";
import { employees } from "../src/db/schemas/03_hcm";
import { authService } from "../src/service/authService";

const app = createApp();
const PREFIX = "test_appsmoke_";
const EMAIL = `${PREFIX}empty@diecast.test`;
const PASSWORD = "appsmoke-password-123";

beforeAll(async () => {
  await db.delete(employees).where(like(employees.email, `${PREFIX}%`));
  await db.delete(roles).where(like(roles.name, `${PREFIX}%`));
  const [role] = await db
    .insert(roles)
    .values({ name: `${PREFIX}empty`, isSystem: false })
    .returning({ id: roles.id });
  if (!role) throw new Error("Fixture setup: role insert failed");
  await db.insert(employees).values({
    name: "TEST_appsmoke_empty",
    email: EMAIL,
    passwordHash: await Bun.password.hash(PASSWORD),
    roleId: role.id,
    isActive: true,
  });
});

afterAll(async () => {
  await db.delete(employees).where(like(employees.email, `${PREFIX}%`));
  await db.delete(roles).where(like(roles.name, `${PREFIX}%`));
});

describe("createApp (BL-007)", () => {
  test("GET /health returns ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      data: { status: "ok" },
    });
  });

  test("protected route without a token maps UnauthorizedError to 401 JSON", async () => {
    const res = await app.request("/api/setup/modules");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      success: false,
      message: "Unauthorized",
      code: "UNAUTHORIZED",
    });
  });

  test("BR-AUTH-09 missing permission maps ForbiddenError to 403 PERMISSION_DENIED JSON", async () => {
    const { accessToken } = await authService.login(EMAIL, PASSWORD);
    const res = await app.request("/api/setup/modules", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      success: false,
      code: "PERMISSION_DENIED",
    });
  });
});
