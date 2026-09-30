/**
 * docs/specs/auth-setup.md (v6)
 * BR-AUTH-11 route, service and frontend code checks permission keys only, never role names; the only
 * exceptions are seed data and the single super-admin check inside the permission check itself.
 *
 * Static scan of backend production source plus one behavioural check. Written by test-writer from the spec only.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { like } from "drizzle-orm";
import { createApp } from "../../src/app";
import { db } from "../../src/db/client";
import { rolePermissions, roles } from "../../src/db/schemas/01_auth";
import { employees } from "../../src/db/schemas/03_hcm";
import { authService } from "../../src/service/authService";

const SRC = join(import.meta.dir, "../../src");
const ROLE_NAMES = [
  "super-admin",
  "owner",
  "back_office",
  "floor_supervisor",
  "qa_inspector",
  "die_designer",
  "operator",
];

// Seed data and the one super-admin check inside the permission check itself.
const SEED_FILES = new Set([
  "lib/permissions.ts",
  "lib/permissions-sync.ts",
  "lib/auth-middleware.ts",
]);
const SEED_DIRS = ["db/", "test/"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const productionFiles = walk(SRC)
  .map((p) => relative(SRC, p))
  .filter((p) => p.endsWith(".ts") && !p.endsWith(".test.ts"))
  .filter((p) => !p.startsWith("scenarios/"))
  .filter((p) => !SEED_DIRS.some((d) => p.startsWith(d)))
  .filter((p) => !SEED_FILES.has(p));

describe("BR-AUTH-11 no role names in code", () => {
  test("BR-AUTH-11 scan covers routes, services, controllers and repositories", () => {
    for (const dir of ["routes/", "service/", "controller/", "repository/"]) {
      expect(productionFiles.some((f) => f.startsWith(dir))).toBe(true);
    }
  });

  test("BR-AUTH-11 no seed role name appears as a string literal outside seed data and the permission check", () => {
    const hits: string[] = [];
    for (const f of productionFiles) {
      const lines = readFileSync(join(SRC, f), "utf8").split("\n");
      lines.forEach((line, i) => {
        for (const role of ROLE_NAMES) {
          if (new RegExp(`["'\`]${role}["'\`]`).test(line)) {
            hits.push(`${f}:${i + 1} ${role}`);
          }
        }
      });
    }
    expect(hits).toEqual([]);
  });

  test("BR-AUTH-11 no code decides access from a role-name list (requireRole / *_ROLES constants)", () => {
    const hits: string[] = [];
    for (const f of productionFiles) {
      const text = readFileSync(join(SRC, f), "utf8");
      if (/requireRole\s*\(/.test(text)) hits.push(`${f} requireRole`);
      if (/_ROLES\b/.test(text)) hits.push(`${f} *_ROLES constant`);
    }
    expect(hits).toEqual([]);
  });
});

describe("BR-AUTH-11 access follows keys, not role names", () => {
  const PREFIX = "test_norole_";
  const PASSWORD = "norole-password-123";
  const app = createApp();

  async function clean() {
    await db.delete(employees).where(like(employees.email, `${PREFIX}%`));
    await db.delete(roles).where(like(roles.name, `${PREFIX}%`));
  }
  beforeAll(clean);
  afterAll(clean);

  test("BR-AUTH-11 a custom-named role holding grn.view reads GRNs; one holding only pr.manage does not", async () => {
    const mk = async (tag: string, keys: string[]) => {
      const [r] = await db
        .insert(roles)
        .values({ name: `${PREFIX}${tag}`, isSystem: false })
        .returning({ id: roles.id });
      if (!r) throw new Error("Fixture setup: role insert failed");
      await db
        .insert(rolePermissions)
        .values(keys.map((permissionKey) => ({ roleId: r.id, permissionKey })));
      const email = `${PREFIX}${tag}@diecast.test`;
      await db.insert(employees).values({
        name: `TEST_norole_${tag}`,
        email,
        passwordHash: await Bun.password.hash(PASSWORD),
        roleId: r.id,
        isActive: true,
      });
      return (await authService.login(email, PASSWORD)).accessToken;
    };
    const viewer = await mk("viewer", ["grn.view"]);
    const other = await mk("other", ["pr.manage"]);
    const get = (t: string) =>
      app.request("/api/grn/getgrns", {
        headers: { Authorization: `Bearer ${t}` },
      });
    expect((await get(viewer)).status).toBe(200);
    expect((await get(other)).status).toBe(403);
  });
});
