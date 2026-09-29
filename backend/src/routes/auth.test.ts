/**
 * docs/specs/auth-setup.md (v5)
 * BR-AUTH-03 login failures are indistinguishable (401 "Invalid credentials")
 * BR-AUTH-04 login limited to 10 attempts / 15 min / client -> 429
 * BR-AUTH-05 refresh token works once; logout revokes it
 * BR-AUTH-23 missing / expired / bad access token -> 401 before any permission check
 *
 * HTTP-level, real DB, through createApp(). Written by test-writer from the spec only.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, like } from "drizzle-orm";
import { SignJWT } from "jose";
import { createApp } from "../app";
import { db } from "../db/client";
import { roles } from "../db/schemas/01_auth";
import { employees } from "../db/schemas/03_hcm";
import { signAccessToken } from "../lib/token";

const app = createApp();
const PREFIX = "test_authhttp_";
const PASSWORD = "authhttp-password-123";
const ACTIVE = `${PREFIX}active@diecast.test`;
const INACTIVE = `${PREFIX}inactive@diecast.test`;
const R1 = `${PREFIX}r1@diecast.test`;
const R2 = `${PREFIX}r2@diecast.test`;
const R3 = `${PREFIX}r3@diecast.test`;
const R4 = `${PREFIX}r4@diecast.test`;
const UNKNOWN = `${PREFIX}nobody@diecast.test`;

let ipCounter = 0;
function freshIp() {
  ipCounter += 1;
  return `10.77.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
}

function login(email: string, password: string, ip = freshIp()) {
  return app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ email, password }),
  });
}

function refreshCookieOf(res: Response) {
  const raw = res.headers.get("set-cookie") ?? "";
  const m = raw.match(/refresh_token=([^;]+)/);
  return m?.[1];
}

function withCookie(path: string, token: string) {
  return app.request(path, {
    method: "POST",
    headers: { cookie: `refresh_token=${token}` },
  });
}

beforeAll(async () => {
  await db.delete(employees).where(like(employees.email, `${PREFIX}%`));
  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, "back_office"))
    .limit(1);
  if (!role) throw new Error("Fixture setup: role back_office missing");
  const passwordHash = await Bun.password.hash(PASSWORD);
  await db.insert(employees).values([
    ...[R1, R2, R3, R4].map((email, i) => ({
      name: `TEST_authhttp_r${i + 1}`,
      email,
      passwordHash,
      roleId: role.id,
      isActive: true,
    })),
    {
      name: "TEST_authhttp_active",
      email: ACTIVE,
      passwordHash,
      roleId: role.id,
      isActive: true,
    },
    {
      name: "TEST_authhttp_inactive",
      email: INACTIVE,
      passwordHash,
      roleId: role.id,
      isActive: false,
    },
  ]);
});

afterAll(async () => {
  await db.delete(employees).where(like(employees.email, `${PREFIX}%`));
});

describe("BR-AUTH-03 login failures look identical", () => {
  test("BR-AUTH-03 wrong password -> 401 Invalid credentials", async () => {
    const res = await login(ACTIVE, "wrong-password");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { message?: string };
    expect(body.message).toBe("Invalid credentials");
  });

  test("BR-AUTH-03 unknown email -> same 401 body as wrong password", async () => {
    const wrong = await login(ACTIVE, "wrong-password");
    const unknown = await login(UNKNOWN, "wrong-password");
    expect(unknown.status).toBe(401);
    expect(await unknown.json()).toEqual(await wrong.json());
  });

  test("BR-AUTH-03 inactive employee with the right password -> same 401 body", async () => {
    const wrong = await login(ACTIVE, "wrong-password");
    const inactive = await login(INACTIVE, PASSWORD);
    expect(inactive.status).toBe(401);
    expect(await inactive.json()).toEqual(await wrong.json());
  });

  test("BR-AUTH-03 active employee with the right password signs in", async () => {
    const res = await login(ACTIVE, PASSWORD);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { accessToken: unknown } };
    expect(typeof body.data.accessToken).toBe("string");
    expect(refreshCookieOf(res)).toBeTruthy();
  });
});

describe("BR-AUTH-04 login rate limit", () => {
  test("BR-AUTH-04 the 11th attempt in the window from one client -> 429", async () => {
    const ip = freshIp();
    for (let i = 0; i < 10; i++) {
      const res = await login(ACTIVE, "wrong-password", ip);
      expect(res.status).toBe(401);
    }
    const eleventh = await login(ACTIVE, "wrong-password", ip);
    expect(eleventh.status).toBe(429);
  });

  test("BR-AUTH-04 the limit is per client: another client is not blocked", async () => {
    const ip = freshIp();
    for (let i = 0; i < 11; i++) await login(ACTIVE, "wrong-password", ip);
    const other = await login(ACTIVE, PASSWORD, freshIp());
    expect(other.status).toBe(200);
  });

  test("BR-AUTH-04 once limited, even correct credentials get 429", async () => {
    const ip = freshIp();
    for (let i = 0; i < 10; i++) await login(ACTIVE, "wrong-password", ip);
    const res = await login(ACTIVE, PASSWORD, ip);
    expect(res.status).toBe(429);
  });
});

describe("BR-AUTH-05 refresh token is single use; logout revokes", () => {
  test("BR-AUTH-05 refreshing rotates: the pre-rotation token then gets 401", async () => {
    const first = refreshCookieOf(await login(R1, PASSWORD));
    expect(first).toBeTruthy();

    const ok = await withCookie("/api/auth/refresh", first as string);
    expect(ok.status).toBe(200);

    const replay = await withCookie("/api/auth/refresh", first as string);
    expect(replay.status).toBe(401);
  });

  test("BR-AUTH-05 the rotated (new) token works once", async () => {
    const first = refreshCookieOf(await login(R2, PASSWORD));
    const ok = await withCookie("/api/auth/refresh", first as string);
    const second = refreshCookieOf(ok);
    expect(second).toBeTruthy();
    const next = await withCookie("/api/auth/refresh", second as string);
    expect(next.status).toBe(200);
  });

  test("BR-AUTH-05 logout revokes the refresh token -> refresh 401", async () => {
    const token = refreshCookieOf(await login(R3, PASSWORD));
    const out = await withCookie("/api/auth/logout", token as string);
    expect(out.status).toBe(200);
    const res = await withCookie("/api/auth/refresh", token as string);
    expect(res.status).toBe(401);
  });

  test("BR-AUTH-05 two sign-ins by one person in the same second both work", async () => {
    const [a, b] = await Promise.all([
      login(R4, PASSWORD),
      login(R4, PASSWORD),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
  });

  test("BR-AUTH-05 refresh with no cookie -> 401", async () => {
    const res = await app.request("/api/auth/refresh", { method: "POST" });
    expect(res.status).toBe(401);
  });
});

describe("BR-AUTH-23 bad access token is 401 before any permission check", () => {
  const PROTECTED = "/api/grn/getgrns";
  const secret = () =>
    new TextEncoder().encode(process.env.ACCESS_TOKEN_SECRET);
  const payload = {
    userId: 1,
    userName: "x",
    role: "operator", // holds nothing: a permission check would say 403
    allowedPages: [] as string[],
  };

  test("BR-AUTH-23 no token -> 401", async () => {
    expect((await app.request(PROTECTED)).status).toBe(401);
  });

  test("BR-AUTH-23 garbage token -> 401", async () => {
    const res = await app.request(PROTECTED, {
      headers: { Authorization: "Bearer not-a-jwt" },
    });
    expect(res.status).toBe(401);
  });

  test("BR-AUTH-23 expired token (valid signature) -> 401, not 403", async () => {
    const now = Math.floor(Date.now() / 1000);
    const expired = await new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt(now - 7200)
      .setExpirationTime(now - 3600)
      .sign(secret());
    const res = await app.request(PROTECTED, {
      headers: { Authorization: `Bearer ${expired}` },
    });
    expect(res.status).toBe(401);
  });

  test("BR-AUTH-23 token signed with the wrong secret -> 401", async () => {
    const forged = await new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(new TextEncoder().encode("x".repeat(48)));
    const res = await app.request(PROTECTED, {
      headers: { Authorization: `Bearer ${forged}` },
    });
    expect(res.status).toBe(401);
  });

  test("BR-AUTH-23 control: a valid token for a role with no grants is 403, not 401", async () => {
    const token = await signAccessToken({
      userId: 1,
      userName: "x",
      role: "operator",
      allowedPages: [],
    });
    const res = await app.request(PROTECTED, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });
});
