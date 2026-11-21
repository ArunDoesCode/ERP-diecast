/**
 * docs/specs/factory-flows/spec-layout.md (v1) BR-FF-101 + design/data.md "Existing installs":
 * one data migration (a) inserts `home`, (b) rewrites label / sort_order / menu_group of the nine existing
 * keys only where all three still equal the OLD seed values, (c) deletes `landing`.
 *
 * Runs on a scratch database (never diecast_test): all migration folders before the menu migration are applied,
 * old-seed screen rows are inserted (two customised by an admin), then the menu migration runs.
 * The menu migration = the newest migration folder whose SQL mentions '/home'.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const SCRATCH = "diecast_ffmenu_scratch_test";
const MIG_DIR = new URL("../../src/db/migrations", import.meta.url).pathname;
const base = new URL(process.env.DATABASE_URL as string);
const urlOf = (db: string) => {
  const u = new URL(base.toString());
  u.pathname = `/${db}`;
  return u.toString();
};

type Sql = ReturnType<typeof postgres>;
const open = (db: string): Sql =>
  postgres(urlOf(db), { max: 1, onnotice: () => {} });

// Old seed values (the screens as seeded before factory-flows).
const OLD: [string, string, string | null, string, number, string][] = [
  ["landing", "/landing", null, "Landing", 10, "General"],
  ["setup", "/setup", "setup.roles.manage", "Setup", 15, "Admin"],
  [
    "employee-directory",
    "/employee-directory",
    "employees.directory.view",
    "Employee Directory",
    230,
    "Admin",
  ],
  ["suppliers", "/suppliers", "supplier.view", "Suppliers", 140, "Procurement"],
  [
    "purchase-orders",
    "/purchase-orders",
    "po.manage",
    "POs (Purchase Orders)",
    150,
    "Procurement",
  ],
  [
    "purchase-requisitions",
    "/purchase-requisitions",
    "pr.manage",
    "PRs (Purchase Requisitions)",
    160,
    "Procurement",
  ],
  ["grn", "/grn", "grn.view", "GRN (Goods Receipt Note)", 170, "Procurement"],
  ["inventory", "/inventory", "inventory.view", "Inventory", 180, "Inventory"],
  ["approvals", "/approvals", null, "Approvals", 185, "Procurement"],
  [
    "subcontracting",
    "/subcontracting",
    "sco.view",
    "Subcontracting",
    165,
    "Procurement",
  ],
];

const NEW: Record<string, [string, number, string]> = {
  approvals: ["Approvals", 20, "General"],
  "purchase-requisitions": ["Requisitions", 30, "General"],
  "purchase-orders": ["Purchase orders", 40, "General"],
  grn: ["Goods receipts", 50, "General"],
  subcontracting: ["Subcontracting", 60, "General"],
  "employee-directory": ["Employee directory", 90, "Admin"],
  setup: ["Setup", 100, "Admin"],
};

const dirs = readdirSync(MIG_DIR)
  .filter((d) => /^\d+_/.test(d))
  .sort();
const menuDir = [...dirs]
  .reverse()
  .find((d) =>
    readFileSync(join(MIG_DIR, d, "migration.sql"), "utf8").includes("/home"),
  );

async function apply(s: Sql, dir: string) {
  const text = readFileSync(join(MIG_DIR, dir, "migration.sql"), "utf8");
  for (const stmt of text.split("--> statement-breakpoint")) {
    if (stmt.trim()) await s.unsafe(stmt);
  }
}

let s: Sql | undefined;

beforeAll(async () => {
  if (!menuDir) return;
  const admin = open("postgres");
  await admin.unsafe(`DROP DATABASE IF EXISTS ${SCRATCH} WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE ${SCRATCH}`);
  await admin.end({ timeout: 5 });
  const conn = open(SCRATCH);
  s = conn;
  for (const d of dirs.filter((x) => x < menuDir)) await apply(conn, d);
  for (const [key, path, perm, label, order, group] of OLD) {
    if (perm) {
      await conn`INSERT INTO permissions (key, module, label, description) VALUES (${perm}, 'test', ${perm}, 'x') ON CONFLICT DO NOTHING`;
    }
    await conn`INSERT INTO screens (key, path, permission_key, label, sort_order, menu_group)
      VALUES (${key}, ${path}, ${perm}, ${label}, ${order}, ${group})`;
  }
  // admin customised two rows before the update: renamed Inventory; moved Suppliers to the top
  await conn`UPDATE screens SET label = 'Stores' WHERE key = 'inventory'`;
  await conn`UPDATE screens SET sort_order = 1 WHERE key = 'suppliers'`;
  await apply(conn, menuDir);
});

afterAll(async () => {
  if (s) await s.end({ timeout: 5 });
  const admin = open("postgres");
  await admin.unsafe(`DROP DATABASE IF EXISTS ${SCRATCH} WITH (FORCE)`);
  await admin.end({ timeout: 5 });
});

async function row(key: string) {
  if (!s) throw new Error("scratch DB not ready");
  return (await s`SELECT * FROM screens WHERE key = ${key}`)[0];
}

describe("BR-FF-101 menu migration", () => {
  test("BR-FF-101 a data migration for the menu exists", () => {
    expect(menuDir).toBeDefined();
  });

  test("BR-FF-101 untouched rows move to the new default", async () => {
    for (const [key, [label, order, group]] of Object.entries(NEW)) {
      const r = await row(key);
      expect([key, r?.label, r?.sort_order, r?.menu_group]).toEqual([
        key,
        label,
        order,
        group,
      ]);
    }
  });

  test("BR-FF-101 a row an admin renamed (Inventory -> Stores) is left exactly as it was", async () => {
    const r = await row("inventory");
    expect([r?.label, r?.sort_order, r?.menu_group]).toEqual([
      "Stores",
      180,
      "Inventory",
    ]);
  });

  test("BR-FF-101 a row an admin re-ordered (Suppliers to the top) is left exactly as it was", async () => {
    const r = await row("suppliers");
    expect([r?.label, r?.sort_order, r?.menu_group]).toEqual([
      "Suppliers",
      1,
      "Procurement",
    ]);
  });

  test("BR-FF-100 BR-FF-102 the migration inserts home at /home with no key, and removes landing", async () => {
    const home = await row("home");
    expect(home?.path).toBe("/home");
    expect(home?.permission_key).toBeNull();
    expect([home?.label, home?.sort_order, home?.menu_group]).toEqual([
      "Home",
      10,
      "General",
    ]);
    expect(await row("landing")).toBeUndefined();
  });

  test("BR-FF-101 paths and permission keys of the kept rows are unchanged", async () => {
    for (const [key, path, perm] of OLD) {
      if (key === "landing") continue;
      const r = await row(key);
      expect([r?.path, r?.permission_key]).toEqual([path, perm]);
    }
  });
});
