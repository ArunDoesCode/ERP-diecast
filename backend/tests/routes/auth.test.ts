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
import { createApp } from "../../src/app";
import { db } from "../../src/db/client";
import { roles } from "../../src/db/schemas/01_auth";
import { employees } from "../../src/db/schemas/03_hcm";
import { signAccessToken } from "../../src/lib/token";

const app = createApp();
const PREFIX = "test_authhttp_";
const PASSWORD = "authhttp-password-123";
const ACTIVE = `${PREFIX}active@diecast.test`;
const INACTIVE = `${PREFIX}inactive@diecast.test`;
const R1 = `${PREFIX}r1@diecast.test`;
const R2 = `${PREFIX}r2@diecast.test`;
const R3 = `${PREFIX}r3@diecast.test`;
const R4 = `${PREFIX}r4@diecast.test`;
const EMPTY = `${PREFIX}empty@diecast.test`;
const UNKNOWN = `${PREFIX}nobody@diecast.test`;

let emptyRoleId = 0;
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
  await db.delete(roles).where(like(roles.name, `${PREFIX}%`));
  const [empty] = await db
    .insert(roles)
    .values({ name: `${PREFIX}empty`, isSystem: false })
    .returning({ id: roles.id });
  if (!empty) throw new Error("Fixture setup: empty role insert failed");
  emptyRoleId = empty.id;
  const passwordHash = await Bun.password.hash(PASSWORD);
  await db.insert(employees).values([
    {
      name: "TEST_authhttp_empty",
      email: EMPTY,
      passwordHash,
      roleId: emptyRoleId,
      isActive: true,
    },
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
  await db.delete(roles).where(like(roles.name, `${PREFIX}%`));
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

  test("BR-AUTH-23 control: a real signed-in user whose role holds nothing is 403 PERMISSION_DENIED, not 401", async () => {
    const signedIn = await login(EMPTY, PASSWORD);
    const { data } = (await signedIn.json()) as {
      data: { accessToken: string };
    };
    const res = await app.request(PROTECTED, {
      headers: { Authorization: `Bearer ${data.accessToken}` },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "PERMISSION_DENIED" });
  });
});

// ---- changes of 2026-11-19 (auth-setup.md changelog): BR-AUTH-27..30 ----
const QR = "test_authhttp_qr_";
const adminAuth = async () => {
  const [a] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.email, "admin@diecast.local"));
  if (!a) throw new Error("Fixture: seed admin missing");
  return signAccessToken({
    userId: a.id,
    userName: "admin",
    role: "super-admin",
    allowedPages: [],
  });
};
async function adminCall(method: string, path: string, body?: unknown) {
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${await adminAuth()}`,
      "content-type": "application/json",
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await app.request(`/api${path}`, init);
  return {
    status: res.status,
    json: (await res.json().catch(() => ({}))) as Record<string, any>,
  };
}
async function roleIdOf(name: string) {
  const [r] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, name));
  if (!r) throw new Error(`Fixture: role ${name} missing`);
  return r.id;
}
/** An operator created through the admin API with login method QR; returns id and the raw QR token. */
async function mkQrOperator(tag: string) {
  const created = await adminCall("POST", "/setup/employees", {
    name: `${QR}${tag}`,
    roleId: await roleIdOf("operator"),
    loginMethod: "qr",
  });
  if (created.status !== 201)
    throw new Error(`Fixture: create operator -> ${created.status}`);
  const id = created.json.data.id as number;
  const qr = await adminCall("POST", `/setup/employees/${id}/qr`);
  if (qr.status !== 200) throw new Error(`Fixture: qr -> ${qr.status}`);
  return { id, qrToken: qr.json.data.qrToken as string };
}
function qrLogin(qrToken: unknown, ip = freshIp()) {
  return app.request("/api/auth/qr-login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ qrToken }),
  });
}
async function mkPasswordUser(tag: string) {
  const email = `${PREFIX}${tag}@diecast.test`;
  const [e] = await db
    .insert(employees)
    .values({
      name: `TEST_authhttp_${tag}`,
      email,
      passwordHash: await Bun.password.hash(PASSWORD),
      roleId: await roleIdOf("back_office"),
      isActive: true,
    })
    .returning({ id: employees.id });
  if (!e) throw new Error("Fixture: employee insert failed");
  return { id: e.id, email };
}

afterAll(async () => {
  await db.delete(employees).where(like(employees.name, `${QR}%`));
});

describe("BR-AUTH-27 refresh re-checks the employee inside the rotation", () => {
  test("BR-AUTH-27 password changed after the token was issued -> refresh 401 and no new cookie", async () => {
    const u = await mkPasswordUser("r27pw");
    const token = refreshCookieOf(await login(u.email, PASSWORD)) as string;
    await db
      .update(employees)
      .set({ passwordHash: await Bun.password.hash("a-brand-new-password-1") })
      .where(eq(employees.id, u.id));
    const res = await withCookie("/api/auth/refresh", token);
    expect(res.status).toBe(401);
    expect(refreshCookieOf(res)).toBeUndefined();
  });

  test("BR-AUTH-27 employee deactivated after the token was issued -> refresh 401", async () => {
    const u = await mkPasswordUser("r27off");
    const token = refreshCookieOf(await login(u.email, PASSWORD)) as string;
    await db
      .update(employees)
      .set({ isActive: false })
      .where(eq(employees.id, u.id));
    expect((await withCookie("/api/auth/refresh", token)).status).toBe(401);
  });

  test("BR-AUTH-27 login method changed to QR after the token was issued -> refresh 401", async () => {
    const u = await mkPasswordUser("r27qr");
    const token = refreshCookieOf(await login(u.email, PASSWORD)) as string;
    await db
      .update(employees)
      .set({ passwordHash: null, qrToken: await Bun.password.hash("some-qr") })
      .where(eq(employees.id, u.id));
    expect((await withCookie("/api/auth/refresh", token)).status).toBe(401);
  });

  test("BR-AUTH-27 control: nothing changed -> refresh 200", async () => {
    const u = await mkPasswordUser("r27ok");
    const token = refreshCookieOf(await login(u.email, PASSWORD)) as string;
    expect((await withCookie("/api/auth/refresh", token)).status).toBe(200);
  });

  test("BR-AUTH-27 a refresh racing a password reset never keeps the session", async () => {
    const u = await mkPasswordUser("r27race");
    const token = refreshCookieOf(await login(u.email, PASSWORD)) as string;
    const reset = db
      .update(employees)
      .set({ passwordHash: await Bun.password.hash("another-new-password-2") })
      .where(eq(employees.id, u.id));
    const [, res] = await Promise.all([
      reset,
      withCookie("/api/auth/refresh", token),
    ]);
    // Either order is fine for this call, but after the reset the old token must be dead.
    expect([200, 401]).toContain(res.status);
    const next = refreshCookieOf(res) ?? token;
    expect((await withCookie("/api/auth/refresh", next)).status).toBe(401);
  });
});

describe("BR-AUTH-28 QR credential only for QR-method employees", () => {
  test("BR-AUTH-28 regenerate for a password-method employee -> 400 and no QR token stored", async () => {
    const u = await mkPasswordUser("q28pw");
    const r = await adminCall("POST", `/setup/employees/${u.id}/qr`);
    expect(r.status).toBe(400);
    const [row] = await db
      .select({ qrToken: employees.qrToken })
      .from(employees)
      .where(eq(employees.id, u.id));
    expect(row?.qrToken).toBeNull();
  });

  test("BR-AUTH-28 regenerate for a QR operator -> new token; the old one stops working", async () => {
    const op = await mkQrOperator("regen");
    expect((await qrLogin(op.qrToken)).status).toBe(200);
    const again = await adminCall("POST", `/setup/employees/${op.id}/qr`);
    expect(again.status).toBe(200);
    const fresh = again.json.data.qrToken as string;
    expect(fresh).not.toBe(op.qrToken);
    expect((await qrLogin(op.qrToken)).status).toBe(401);
    expect((await qrLogin(fresh)).status).toBe(200);
  });
});

describe("BR-AUTH-29 POST /api/auth/qr-login", () => {
  test("BR-AUTH-29 valid badge -> 200, accessToken in body, httpOnly refresh cookie, role / permissions / screens", async () => {
    const op = await mkQrOperator("ok");
    const res = await qrLogin(op.qrToken);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(typeof body.data.accessToken).toBe("string");
    expect(body.data.user.role).toBe("operator");
    expect(Array.isArray(body.data.user.permissions)).toBe(true);
    expect(Array.isArray(body.data.user.screens)).toBe(true);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/refresh_token=[^;]+/);
    expect(cookie.toLowerCase()).toContain("httponly");
  });

  test("BR-AUTH-29 answer has the same shape as password login", async () => {
    const op = await mkQrOperator("shape");
    const u = await mkPasswordUser("q29shape");
    const qrBody = (await (await qrLogin(op.qrToken)).json()) as Record<
      string,
      any
    >;
    const pwBody = (await (await login(u.email, PASSWORD)).json()) as Record<
      string,
      any
    >;
    expect(Object.keys(qrBody.data).sort()).toEqual(
      Object.keys(pwBody.data).sort(),
    );
    expect(Object.keys(qrBody.data.user).sort()).toEqual(
      Object.keys(pwBody.data.user).sort(),
    );
  });

  test("BR-AUTH-29 the session from a QR login can be refreshed", async () => {
    const op = await mkQrOperator("refresh");
    const token = refreshCookieOf(await qrLogin(op.qrToken)) as string;
    expect((await withCookie("/api/auth/refresh", token)).status).toBe(200);
  });

  test("BR-AUTH-29 deactivated operator -> 401 Invalid credentials", async () => {
    const op = await mkQrOperator("off");
    await db
      .update(employees)
      .set({ isActive: false })
      .where(eq(employees.id, op.id));
    const res = await qrLogin(op.qrToken);
    expect(res.status).toBe(401);
    expect(((await res.json()) as { message?: string }).message).toBe(
      "Invalid credentials",
    );
  });

  test("BR-AUTH-29 unknown token -> the same 401 body as a wrong password", async () => {
    const wrong = await login(ACTIVE, "wrong-password");
    const res = await qrLogin("not-a-real-badge-token");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual(await wrong.json());
  });

  test("BR-AUTH-29 token of a password-method employee -> 401", async () => {
    const u = await mkPasswordUser("q29pw");
    const raw = "raw-qr-of-a-password-user";
    await db
      .update(employees)
      .set({ qrToken: await Bun.password.hash(raw) })
      .where(eq(employees.id, u.id));
    expect((await qrLogin(raw)).status).toBe(401);
  });

  test("BR-AUTH-29 missing token field -> 400 or 401, never a session", async () => {
    const res = await app.request("/api/auth/qr-login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": freshIp(),
      },
      body: JSON.stringify({}),
    });
    expect([400, 401]).toContain(res.status);
  });

  test("BR-AUTH-29 is public: no Authorization header needed", async () => {
    const op = await mkQrOperator("public");
    expect((await qrLogin(op.qrToken)).status).toBe(200);
  });

  test("BR-AUTH-29 same rate limit as login: the 11th try in the window from one client -> 429", async () => {
    const ip = freshIp();
    for (let i = 0; i < 10; i++) {
      expect((await qrLogin(`bad-badge-${i}`, ip)).status).toBe(401);
    }
    expect((await qrLogin("bad-badge-11", ip)).status).toBe(429);
  });
});

describe("BR-AUTH-30 tokens as the backend hands them out", () => {
  test("BR-AUTH-30 login: access token in the body only; the only cookie is the httpOnly SameSite=Lax refresh token", async () => {
    const u = await mkPasswordUser("t30login");
    const res = await login(u.email, PASSWORD);
    const body = (await res.json()) as Record<string, any>;
    const access = body.data.accessToken as string;
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).not.toContain(access);
    expect(cookie).toMatch(/^refresh_token=/);
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
    expect(cookie.match(/(^|, )[A-Za-z_]+=/g)?.length).toBe(1);
  });

  test("BR-AUTH-30 refresh: new access token in the body, new httpOnly refresh cookie, access token not in a cookie", async () => {
    const u = await mkPasswordUser("t30refresh");
    const token = refreshCookieOf(await login(u.email, PASSWORD)) as string;
    const res = await withCookie("/api/auth/refresh", token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(typeof body.data.accessToken).toBe("string");
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).not.toContain(body.data.accessToken);
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
  });

  test("BR-AUTH-30 refresh after logout -> 401 (the app then shows the login page)", async () => {
    const u = await mkPasswordUser("t30out");
    const token = refreshCookieOf(await login(u.email, PASSWORD)) as string;
    const out = await withCookie("/api/auth/logout", token);
    expect(out.status).toBe(200);
    expect((await withCookie("/api/auth/refresh", token)).status).toBe(401);
  });
});
