/**
 * docs/specs/api-standards/spec.md (v1) "Conflict errors"
 * BR-STD-01 uncaught 23505 -> 409 DUPLICATE_RECORD     BR-STD-02 uncaught 23503 -> 409 LINKED_RECORD
 * BR-STD-03 409 body is fixed text only                BR-STD-04 found anywhere in the cause chain
 * BR-STD-06 other DB errors stay 500                   BR-STD-34 one log line, no values
 * BR-STD-35 transaction rolls back                     BR-STD-36 permission first; public routes never 409
 * (BR-STD-05: the hand-written catches are already asserted by pr-lifecycle BR-PR-19,
 *  approval-requests BR-APR-26 and approval-policies BR-APR-07; not repeated.)
 *
 * Real DB + createApp(). `handleAppError` is the named export of src/app.ts (design/api.md). It does not
 * exist yet, so it is loaded dynamically: these tests are red until the feature is built.
 * Written by test-writer from the spec only.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  spyOn,
  test,
} from "bun:test";
import { eq, inArray, like } from "drizzle-orm";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { Hono } from "hono";
import { createApp } from "../../src/app";
import { db } from "../../src/db/client";
import {
  authAuditLog,
  rolePermissions,
  roles,
} from "../../src/db/schemas/01_auth";
import { employees } from "../../src/db/schemas/03_hcm";
import { signAccessToken } from "../../src/lib/token";

const RUN = Date.now();
const EMAIL_PREFIX = "test_stdconf_";
const PASSWORD = "stdconf-password-123";
const GENERIC_409 = {
  DUPLICATE_RECORD: "This record already exists.",
  LINKED_RECORD:
    "This record is linked to another record that is missing or still in use.",
};

let adminId: number;
let adminToken: string;
let plainId: number;
let plainToken: string;
let backOfficeRoleId: number;
let plainRoleId: number;
let fkRoleId: number;
let fkEmployeeId: number;

type Handler = (err: unknown, c: unknown) => Response | Promise<Response>;
async function loadHandler(): Promise<Handler> {
  const mod = (await import("../../src/app")) as unknown as Record<
    string,
    unknown
  >;
  const h = mod.handleAppError;
  if (typeof h !== "function") {
    throw new Error("src/app.ts does not export handleAppError (BR-STD-01)");
  }
  return h as Handler;
}

/** Error shaped like what the postgres driver throws. */
function pgError(
  code: string,
  extra: Record<string, unknown> = {},
): Error & { code: string } {
  return Object.assign(new Error("driver message"), { code, ...extra });
}
function wrapped(code: string, extra: Record<string, unknown> = {}) {
  return new DrizzleQueryError(
    "insert into employees ...",
    [],
    pgError(code, extra),
  );
}

async function handlerApp(path: string, thrown: unknown) {
  const handler = await loadHandler();
  const app = new Hono();
  app.onError(handler as never);
  app.post(path, () => {
    throw thrown;
  });
  return app;
}

async function post(
  app: {
    request: (p: string, i?: RequestInit) => Response | Promise<Response>;
  },
  path: string,
  token: string | null,
  body?: unknown,
  method = "POST",
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await app.request(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // biome-ignore lint/suspicious/noExplicitAny: loose JSON in test responses
  const json = (await res.json().catch(() => null)) as any;
  return { status: res.status, json };
}

const empBody = (email: string) => ({
  name: `TEST_stdconf_${email}`,
  roleId: backOfficeRoleId,
  loginMethod: "password",
  email,
  password: PASSWORD,
});

const countByEmail = async (email: string) =>
  (await db.select().from(employees).where(eq(employees.email, email))).length;

beforeAll(async () => {
  const [sa] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, "super-admin"));
  const [bo] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, "back_office"));
  if (!sa || !bo) throw new Error("Fixture setup: seed roles missing");
  backOfficeRoleId = bo.id;

  const [plainRole] = await db
    .insert(roles)
    .values({ name: `TEST_stdconf_${RUN}_plain`, isSystem: false })
    .returning({ id: roles.id });
  const [fkRole] = await db
    .insert(roles)
    .values({ name: `TEST_stdconf_${RUN}_fk`, isSystem: false })
    .returning({ id: roles.id });
  if (!plainRole || !fkRole) throw new Error("Fixture setup: role insert");
  plainRoleId = plainRole.id;
  fkRoleId = fkRole.id;

  const mk = async (tag: string, roleId: number) => {
    const [e] = await db
      .insert(employees)
      .values({
        name: `TEST_stdconf_${tag}`,
        email: `${EMAIL_PREFIX}${tag}@diecast.test`,
        passwordHash: await Bun.password.hash(PASSWORD),
        roleId,
        isActive: true,
      })
      .returning({ id: employees.id });
    if (!e) throw new Error("Fixture setup: employee insert");
    return e.id;
  };
  adminId = await mk("admin", sa.id);
  plainId = await mk("plain", plainRoleId);
  fkEmployeeId = await mk("fk", fkRoleId);
  const sign = (id: number, role: string) =>
    signAccessToken({
      userId: id,
      userName: `TEST_stdconf_${id}`,
      role,
      allowedPages: [],
    });
  adminToken = await sign(adminId, "super-admin");
  plainToken = await sign(plainId, "x");
});

afterEach(() => {
  process.env.NODE_ENV = "test";
});

afterAll(async () => {
  const ids = [adminId, plainId, fkEmployeeId];
  await db.delete(authAuditLog).where(inArray(authAuditLog.actorId, ids));
  await db.delete(employees).where(like(employees.email, `${EMAIL_PREFIX}%`));
  await db
    .delete(rolePermissions)
    .where(inArray(rolePermissions.roleId, [plainRoleId, fkRoleId]));
  await db.delete(roles).where(inArray(roles.id, [plainRoleId, fkRoleId]));
});

describe("BR-STD-01 uncaught unique violation answers 409 DUPLICATE_RECORD", () => {
  test("BR-STD-01 (a) the shared handler maps cause.code 23505", async () => {
    const app = await handlerApp(
      "/api/x",
      Object.assign(new Error("boom"), { cause: { code: "23505" } }),
    );
    const { status, json } = await post(app, "/api/x", null);
    expect(status).toBe(409);
    expect(json.code).toBe("DUPLICATE_RECORD");
    expect(json.message).toBe(GENERIC_409.DUPLICATE_RECORD);
  });

  test("BR-STD-01 (b) POST /api/setup/employees twice with one email -> second is 409, one row", async () => {
    const app = createApp();
    const email = `${EMAIL_PREFIX}dup1@diecast.test`;
    const first = await post(
      app,
      "/api/setup/employees",
      adminToken,
      empBody(email),
    );
    expect(first.status).toBe(201);
    const second = await post(
      app,
      "/api/setup/employees",
      adminToken,
      empBody(email),
    );
    expect(second.status).toBe(409);
    expect(second.json.code).toBe("DUPLICATE_RECORD");
    expect(await countByEmail(email)).toBe(1);
  });
});

describe("BR-STD-02 uncaught foreign-key violation answers 409 LINKED_RECORD", () => {
  test("BR-STD-02 (a) the shared handler maps cause.code 23503", async () => {
    const app = await handlerApp(
      "/api/x",
      Object.assign(new Error("boom"), { cause: { code: "23503" } }),
    );
    const { status, json } = await post(app, "/api/x", null);
    expect(status).toBe(409);
    expect(json.code).toBe("LINKED_RECORD");
    expect(json.message).toBe(GENERIC_409.LINKED_RECORD);
  });

  test("BR-STD-02 (b) deleting a role an employee still points to -> 409, role still there", async () => {
    const app = createApp();
    app.delete("/api/test-std/role-fk", async (c) => {
      await db.transaction(async (tx) => {
        await tx.delete(roles).where(eq(roles.id, fkRoleId));
      });
      return c.json({ success: true });
    });
    const { status, json } = await post(
      app,
      "/api/test-std/role-fk",
      adminToken,
      undefined,
      "DELETE",
    );
    expect(status).toBe(409);
    expect(json.code).toBe("LINKED_RECORD");
    const still = await db.select().from(roles).where(eq(roles.id, fkRoleId));
    expect(still.length).toBe(1);
  });
});

describe("BR-STD-03 the 409 body never leaks schema detail", () => {
  test("BR-STD-03 NODE_ENV=development: body has exactly success, message, code and no constraint text", async () => {
    process.env.NODE_ENV = "development";
    const app = await handlerApp(
      "/api/x",
      Object.assign(
        new Error(
          'duplicate key value violates unique constraint "employees_email_key"',
        ),
        {
          cause: pgError("23505", {
            constraint_name: "employees_email_key",
            table_name: "employees",
            detail: "Key (email)=(a@x.in) already exists.",
            message:
              'duplicate key value violates unique constraint "employees_email_key"',
          }),
        },
      ),
    );
    const { status, json } = await post(app, "/api/x", null);
    expect(status).toBe(409);
    expect(Object.keys(json).sort()).toEqual(["code", "message", "success"]);
    expect(json.success).toBe(false);
    const text = JSON.stringify(json);
    expect(text).not.toContain("employees");
    expect(text).not.toContain("_key");
    expect(text).not.toContain("duplicate key");
    expect(text).not.toContain("a@x.in");
  });
});

describe("BR-STD-04 recognised anywhere in the cause chain", () => {
  test("BR-STD-04 DrizzleQueryError whose cause.code is 23503 -> 409 LINKED_RECORD", async () => {
    const app = await handlerApp("/api/x", wrapped("23503"));
    const { status, json } = await post(app, "/api/x", null);
    expect(status).toBe(409);
    expect(json.code).toBe("LINKED_RECORD");
  });

  test("BR-STD-04 isForeignKeyViolation / isUniqueViolation walk the chain", async () => {
    const mod = (await import("../../src/lib/db-errors")) as unknown as Record<
      string,
      (e: unknown) => boolean
    >;
    const fk = mod.isForeignKeyViolation;
    if (typeof fk !== "function") {
      throw new Error("db-errors.ts does not export isForeignKeyViolation");
    }
    expect(fk(wrapped("23503"))).toBe(true);
    expect(fk(wrapped("23505"))).toBe(false);
    expect(mod.isUniqueViolation?.(wrapped("23505"))).toBe(true);
  });
});

describe("BR-STD-06 other database errors stay 500", () => {
  test("BR-STD-06 23502 not-null violation -> 500 Internal server error, no code", async () => {
    const app = await handlerApp("/api/x", wrapped("23502"));
    const { status, json } = await post(app, "/api/x", null);
    expect(status).toBe(500);
    expect(json.message).toBe("Internal server error");
    expect(json.code).toBeUndefined();
  });
});

describe("BR-STD-34 every mapped 409 is logged once, without values", () => {
  test("BR-STD-34 duplicate email -> one console.warn db-conflict with exactly six fields, no console.error, no value in any argument", async () => {
    const app = createApp();
    const email = `${EMAIL_PREFIX}dup2@diecast.test`;
    await post(app, "/api/setup/employees", adminToken, empBody(email));
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await post(
        app,
        "/api/setup/employees",
        adminToken,
        empBody(email),
      );
      expect(res.status).toBe(409);
      const conflict = warn.mock.calls.filter((c) => c[0] === "db-conflict");
      expect(conflict.length).toBe(1);
      expect(conflict[0]?.[1]).toEqual({
        pgCode: "23505",
        constraint: "employees_email_key",
        table: "employees",
        method: "POST",
        path: "/api/setup/employees",
        actorId: adminId,
      });
      expect(error.mock.calls.length).toBe(0);
      const all = JSON.stringify([...warn.mock.calls, ...error.mock.calls]);
      expect(all).not.toContain(email);
      expect(all).not.toContain("Key (");
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });

  test("BR-STD-34 23503 is logged with console.error, once", async () => {
    const handler = await loadHandler();
    const app = new Hono();
    app.onError(handler as never);
    app.post("/api/x", () => {
      throw wrapped("23503", { constraint_name: "fk_x", table_name: "t" });
    });
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await post(app, "/api/x", null);
      expect(res.status).toBe(409);
      expect(
        error.mock.calls.filter((c) => c[0] === "db-conflict").length,
      ).toBe(1);
      expect(warn.mock.calls.filter((c) => c[0] === "db-conflict").length).toBe(
        0,
      );
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });
});

describe("BR-STD-35 a conflict inside a transaction rolls everything back", () => {
  test("BR-STD-35 duplicate email -> no second employee and no new audit row", async () => {
    const app = createApp();
    const email = `${EMAIL_PREFIX}dup3@diecast.test`;
    await post(app, "/api/setup/employees", adminToken, empBody(email));
    const auditBefore = (
      await db
        .select()
        .from(authAuditLog)
        .where(eq(authAuditLog.actorId, adminId))
    ).length;
    const res = await post(
      app,
      "/api/setup/employees",
      adminToken,
      empBody(email),
    );
    expect(res.status).toBe(409);
    expect(await countByEmail(email)).toBe(1);
    const auditAfter = (
      await db
        .select()
        .from(authAuditLog)
        .where(eq(authAuditLog.actorId, adminId))
    ).length;
    expect(auditAfter).toBe(auditBefore);
  });
});

describe("BR-STD-36 permission first; public routes never answer 409", () => {
  test("BR-STD-36 a role without setup.employees.manage posting the duplicate email -> 403 PERMISSION_DENIED", async () => {
    const app = createApp();
    const email = `${EMAIL_PREFIX}dup4@diecast.test`;
    await post(app, "/api/setup/employees", adminToken, empBody(email));
    const res = await post(
      app,
      "/api/setup/employees",
      plainToken,
      empBody(email),
    );
    expect(res.status).toBe(403);
    expect(res.json.code).toBe("PERMISSION_DENIED");
  });

  test("BR-STD-36 a 23505 thrown on POST /api/auth/login -> 500 Internal server error, no code", async () => {
    const app = await handlerApp(
      "/api/auth/login",
      Object.assign(new Error("boom"), { cause: { code: "23505" } }),
    );
    const { status, json } = await post(app, "/api/auth/login", null);
    expect(status).toBe(500);
    expect(json.message).toBe("Internal server error");
    expect(json.code).toBeUndefined();
  });

  test("BR-STD-36 the same error on POST /api/x -> 409 DUPLICATE_RECORD", async () => {
    const app = await handlerApp(
      "/api/x",
      Object.assign(new Error("boom"), { cause: { code: "23505" } }),
    );
    const { status, json } = await post(app, "/api/x", null);
    expect(status).toBe(409);
    expect(json.code).toBe("DUPLICATE_RECORD");
  });

  test("BR-STD-36 the other public paths (refresh, logout) never answer 409 either", async () => {
    for (const path of ["/api/auth/refresh", "/api/auth/logout"]) {
      const app = await handlerApp(
        path,
        Object.assign(new Error("boom"), { cause: { code: "23503" } }),
      );
      const { status, json } = await post(app, path, null);
      expect(status).toBe(500);
      expect(json.code).toBeUndefined();
    }
  });
});
