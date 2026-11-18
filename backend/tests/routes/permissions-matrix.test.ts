/**
 * docs/specs/auth-setup.md (v5) BR-AUTH-21: the seed grants reproduce today's
 * API access. Expected allow/deny per seed role = the "today" access (the
 * published API contract) adjusted ONLY by the intended differences the spec
 * lists. Drawn from the spec's "Seed grants" table + BR-AUTH-21 text.
 *
 * allow = anything but 401/403 (the request body is empty/invalid or the id
 * does not exist, so an allowed call ends in 400/404 and changes nothing).
 * Written by test-writer from the spec only.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, like } from "drizzle-orm";
import { createApp } from "../../src/app";
import { db } from "../../src/db/client";
import { roles } from "../../src/db/schemas/01_auth";
import { employees } from "../../src/db/schemas/03_hcm";
import { getRegistry } from "../../src/lib/route-registry";
import { authService } from "../../src/service/authService";

const app = createApp();
const PREFIX = "test_authmx_";
const PASSWORD = "authmx-password-123";

type R = "ow" | "bo" | "fs" | "qa" | "dd" | "sa";
const ROLE_NAME: Record<R, string> = {
  ow: "owner",
  bo: "back_office",
  fs: "floor_supervisor",
  qa: "qa_inspector",
  dd: "die_designer",
  sa: "super-admin",
};
const ALL_ROLES = Object.keys(ROLE_NAME) as R[];

const ID = "2147483000";
const tokens = {} as Record<R, string>;

// [METHOD, contract path, roles allowed after the seed (sa is always added)]
const NONE: R[] = [];
const OW_BO: R[] = ["ow", "bo"];
const OW_BO_FS: R[] = ["ow", "bo", "fs"];
const MATRIX: [string, string, R[]][] = [
  // approval
  ["GET", "/api/approval/getPolicies", OW_BO],
  ["GET", "/api/approval/getPolicyDetails/:id", OW_BO],
  ["POST", "/api/approval/createPolicy", NONE],
  ["PATCH", "/api/approval/updatePolicy/:id", NONE],
  // asset.manage = bo; inventory.* / pr.link_machine per BR-AUTH-21
  ["GET", "/api/asset/machines", ["ow", "bo", "fs"]],
  ["POST", "/api/asset/machines", ["bo"]],
  ["PATCH", "/api/asset/machines/:id", ["bo"]],
  ["GET", "/api/asset/items", OW_BO_FS],
  ["POST", "/api/asset/items", ["bo"]],
  ["PATCH", "/api/asset/items/:id", ["bo"]],
  ["GET", "/api/asset/services", ["bo"]],
  ["POST", "/api/asset/services", ["bo"]],
  ["PATCH", "/api/asset/services/:id", ["bo"]],
  ["GET", "/api/asset/inventory/movements", OW_BO_FS],
  ["POST", "/api/asset/inventory/movements", OW_BO],
  ["GET", "/api/asset/locations", OW_BO_FS], // asset.manage OR inventory.view (auth-setup v10)
  ["POST", "/api/asset/locations", ["bo"]],
  ["PATCH", "/api/asset/locations/:id", ["bo"]],
  // grn
  ["GET", "/api/grn/getgrns", ["ow", "bo", "fs", "qa", "dd"]],
  ["GET", "/api/grn/getgrndetails/:id", ["ow", "bo", "fs", "qa", "dd"]],
  ["POST", "/api/grn/creategrn", OW_BO_FS],
  ["PATCH", "/api/grn/updategrn", OW_BO_FS],
  ["DELETE", "/api/grn/deletegrn/:id", OW_BO_FS],
  ["POST", "/api/grn/:id/lines/:lineId/qa", ["ow", "bo", "qa"]],
  ["POST", "/api/grn/:id/lines/:lineId/bypass", OW_BO], // fs loses bypass
  ["POST", "/api/grn/:id/lines/:lineId/correction", OW_BO],
  // po
  ...(
    [
      ["GET", "/api/po/getpos"],
      ["GET", "/api/po/getpodetails/:id"],
      ["POST", "/api/po/createpo"],
      ["PATCH", "/api/po/updatepo"],
      ["DELETE", "/api/po/deletepo/:id"],
      ["POST", "/api/po/:id/send"],
      ["POST", "/api/po/:id/reminder"],
      ["POST", "/api/po/:id/escalate"],
      ["PATCH", "/api/po/:id/delay"],
      ["POST", "/api/po/:id/confirm"],
      ["POST", "/api/po/:id/invoice"],
      ["POST", "/api/po/:id/close"],
    ] as [string, string][]
  ).map(([m, p]): [string, string, R[]] => [m, p, OW_BO]),
  // pr
  ...(
    [
      ["GET", "/api/pr/getprs"],
      ["GET", "/api/pr/getprdetails/:id"],
      ["POST", "/api/pr/createpr"],
      ["PATCH", "/api/pr/updatepr"],
      ["DELETE", "/api/pr/deletepr/:id"],
    ] as [string, string][]
  ).map(([m, p]): [string, string, R[]] => [m, p, OW_BO_FS]),
  // setup: super-admin only (owner cannot create employees)
  ...(
    [
      ["GET", "/api/setup/modules"],
      ["GET", "/api/setup/employees"],
      ["GET", "/api/setup/employees/search"],
      ["POST", "/api/setup/employees"],
      ["PATCH", "/api/setup/employees/:id"],
      ["DELETE", "/api/setup/employees/:id"],
      ["POST", "/api/setup/employees/:id/qr"],
      ["GET", "/api/setup/roles"],
      ["POST", "/api/setup/roles"],
      ["PATCH", "/api/setup/roles/:id"],
      ["DELETE", "/api/setup/roles/:id"],
    ] as [string, string][]
  ).map(([m, p]): [string, string, R[]] => [m, p, NONE]),
  // supplier: view = ow,bo,fs; manage = bo
  ["GET", "/api/supplier/listSuppliers", OW_BO_FS],
  ["GET", "/api/supplier/:supplierId/detail", OW_BO_FS],
  ["POST", "/api/supplier/createSupplier", ["bo"]],
  ["POST", "/api/supplier/:supplierId/createItem", ["bo"]],
  ["POST", "/api/supplier/:supplierId/createService", ["bo"]],
  ["PATCH", "/api/supplier/updateSupplier/:id", ["bo"]],
  ["PATCH", "/api/supplier/:supplierId/editItem", ["bo"]],
  ["PATCH", "/api/supplier/:supplierId/editService", ["bo"]],
];

// Ambiguous in the spec (which key covers them is not stated) -> not asserted here.
const NOT_ASSERTED = new Set([
  "GET /api/asset/items/:itemId/last-rate",
  "GET /api/supplier/:supplierId/listItems",
  "GET /api/supplier/:supplierId/listServices",
]);

async function statusFor(role: R, method: string, path: string) {
  const url = path.replace(/:[A-Za-z]+/g, ID);
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${tokens[role]}`,
      "content-type": "application/json",
    },
  };
  if (method !== "GET" && method !== "DELETE") init.body = "{}";
  return (await app.request(url, init)).status;
}

beforeAll(async () => {
  await db.delete(employees).where(like(employees.email, `${PREFIX}%`));
  const passwordHash = await Bun.password.hash(PASSWORD);
  for (const r of ALL_ROLES) {
    const [role] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, ROLE_NAME[r]))
      .limit(1);
    if (!role) throw new Error(`Fixture setup: role ${ROLE_NAME[r]} missing`);
    const email = `${PREFIX}${r}@diecast.test`;
    await db.insert(employees).values({
      name: `TEST_authmx_${r}`,
      email,
      passwordHash,
      roleId: role.id,
      isActive: true,
    });
    tokens[r] = (await authService.login(email, PASSWORD)).accessToken;
  }
});

afterAll(async () => {
  await db.delete(employees).where(like(employees.email, `${PREFIX}%`));
});

describe("BR-AUTH-21 seed grants give each seed role the intended API access", () => {
  for (const [method, path, allowed] of MATRIX) {
    test(`BR-AUTH-21 ${method} ${path}`, async () => {
      const expectAllow = new Set<R>([...allowed, "sa"]);
      const wrong: string[] = [];
      for (const r of ALL_ROLES) {
        const status = await statusFor(r, method, path);
        const isAllowed = status !== 401 && status !== 403;
        if (isAllowed !== expectAllow.has(r)) {
          wrong.push(
            `${r}: got ${status}, expected ${expectAllow.has(r) ? "allow" : "403"}`,
          );
        }
      }
      expect(wrong).toEqual([]);
    });
  }

  test("BR-AUTH-21 approval submit/act/trail stay open to every signed-in role", async () => {
    for (const r of ALL_ROLES) {
      const status = await statusFor(
        r,
        "GET",
        "/api/approval/getMyPendingApprovals",
      );
      expect(status).not.toBe(401);
      expect(status).not.toBe(403);
    }
  });

  test("BR-AUTH-21 /auth/me is open to every signed-in role", async () => {
    for (const r of ALL_ROLES) {
      expect(await statusFor(r, "GET", "/api/auth/me")).toBe(200);
    }
  });

  test("BR-AUTH-15 retired page-grant routes are gone: 404 even for super-admin", async () => {
    for (const [m, p] of [
      ["GET", "/api/setup/pages"],
      ["POST", "/api/setup/pages"],
      ["PATCH", "/api/setup/pages/1"],
      ["DELETE", "/api/setup/pages/1"],
      ["GET", "/api/setup/permissions"],
      ["POST", "/api/setup/roles/1/permissions"],
    ] as [string, string][]) {
      expect(await statusFor("sa", m, p)).toBe(404);
    }
  });

  test("BR-AUTH-21 /auth/register is gone: 404 for owner and super-admin", async () => {
    expect(await statusFor("ow", "POST", "/api/auth/register")).toBe(404);
    expect(await statusFor("sa", "POST", "/api/auth/register")).toBe(404);
  });

  test("BR-AUTH-21 every existing role-guarded route is covered by the matrix", () => {
    const covered = new Set(MATRIX.map(([m, p]) => `${m} ${p}`));
    const missing = getRegistry()
      .filter((d) => (d.auth as { type: string }).type === "roles")
      .map((d) => `${d.method} ${d.path}`)
      .filter(
        (k) =>
          !covered.has(k) &&
          !NOT_ASSERTED.has(k) &&
          !k.includes("/auth/register") &&
          !/\/(sco|subcontract)/i.test(k), // new routes, nothing to compare
      );
    expect(missing).toEqual([]);
  });
});

/**
 * docs/specs/api-standards/spec.md (v1) T-3 and BR-STD-42: every route of getRegistry() (= the contract
 * manifest) is guarded by its declared auth type. The public routes are exactly the three auth routes
 * (held below; a fourth needs an owner-approved spec line). GET /health is not in the manifest and is checked
 * on its own.
 */
const PUBLIC_ROUTES = [
  "POST /api/auth/login",
  "POST /api/auth/refresh",
  "POST /api/auth/logout",
];
const KNOWN_AUTH_TYPES = new Set(["public", "any-authenticated", "permission"]);

describe("T-3 / BR-STD-42 every registered route is guarded by its auth type", () => {
  const EMPTY_PREFIX = "test_stdmx_";
  let emptyRoleId: number;
  let emptyToken: string;

  const urlOf = (path: string) => path.replace(/:[A-Za-z]+/g, ID);
  async function hit(d: { method: string; path: string }, token?: string) {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const init: RequestInit = { method: d.method, headers };
    if (d.method !== "GET" && d.method !== "DELETE") init.body = "{}";
    const res = await app.request(urlOf(d.path), init);
    // biome-ignore lint/suspicious/noExplicitAny: loose JSON in test responses
    const json = (await res.json().catch(() => null)) as any;
    return { status: res.status, json };
  }

  beforeAll(async () => {
    await db.delete(employees).where(like(employees.email, `${EMPTY_PREFIX}%`));
    await db.delete(roles).where(like(roles.name, `${EMPTY_PREFIX}%`));
    const [role] = await db
      .insert(roles)
      .values({ name: `${EMPTY_PREFIX}nokeys`, isSystem: false })
      .returning({ id: roles.id });
    if (!role) throw new Error("Fixture setup: role insert");
    emptyRoleId = role.id;
    const email = `${EMPTY_PREFIX}nokeys@diecast.test`;
    await db.insert(employees).values({
      name: "TEST_stdmx_nokeys",
      email,
      passwordHash: await Bun.password.hash(PASSWORD),
      roleId: emptyRoleId,
      isActive: true,
    });
    emptyToken = (await authService.login(email, PASSWORD)).accessToken;
  });

  afterAll(async () => {
    await db.delete(employees).where(like(employees.email, `${EMPTY_PREFIX}%`));
    await db.delete(roles).where(eq(roles.id, emptyRoleId));
  });

  test("T-3 the registry is not empty and holds only the known auth types (BR-AUTH-10)", () => {
    const reg = getRegistry();
    expect(reg.length).toBeGreaterThan(0);
    const unknown = reg
      .filter((d) => !KNOWN_AUTH_TYPES.has((d.auth as { type: string }).type))
      .map(
        (d) => `${d.method} ${d.path} (${(d.auth as { type: string }).type})`,
      );
    expect(unknown).toEqual([]);
  });

  test("BR-STD-42 the public routes are exactly login, refresh and logout", () => {
    const pub = getRegistry()
      .filter((d) => d.auth.type === "public")
      .map((d) => `${d.method} ${d.path}`)
      .sort();
    expect(pub).toEqual([...PUBLIC_ROUTES].sort());
  });

  test("BR-STD-42 GET /health with no token -> 200", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
  });

  test("T-3 every permission route answers 401 with no token", async () => {
    const wrong: string[] = [];
    for (const d of getRegistry().filter((r) => r.auth.type === "permission")) {
      const { status } = await hit(d);
      if (status !== 401) wrong.push(`${d.method} ${d.path}: ${status}`);
    }
    expect(wrong).toEqual([]);
  });

  test("T-3 every any-signed-in route answers 401 with no token", async () => {
    const wrong: string[] = [];
    for (const d of getRegistry().filter(
      (r) => r.auth.type === "any-authenticated",
    )) {
      const { status } = await hit(d);
      if (status !== 401) wrong.push(`${d.method} ${d.path}: ${status}`);
    }
    expect(wrong).toEqual([]);
  });

  test("T-3 every permission route answers 403 PERMISSION_DENIED for a role that holds none of its keys", async () => {
    const wrong: string[] = [];
    for (const d of getRegistry().filter((r) => r.auth.type === "permission")) {
      const { status, json } = await hit(d, emptyToken);
      if (status !== 403 || json?.code !== "PERMISSION_DENIED") {
        wrong.push(`${d.method} ${d.path}: ${status} ${json?.code ?? ""}`);
      }
    }
    expect(wrong).toEqual([]);
  });
});
