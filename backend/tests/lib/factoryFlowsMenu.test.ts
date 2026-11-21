/**
 * docs/specs/factory-flows/spec-layout.md (v1) BR-FF-100 (default menu), BR-FF-102 (Home at /home),
 * and the "later sync keeps Setup -> Screens edits" half of BR-FF-101.
 * Expected values come from design/data.md "screens" table, not from the code.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../src/db/client";
import { screens } from "../../src/db/schemas/01_auth";
import { SCREENS } from "../../src/lib/permissions";
import { syncCatalog } from "../../src/lib/permissions-sync";

type Def = {
  permission: string | null;
  label: string;
  order: number;
  group: string;
};

// Spec table, in menu order.
const EXPECTED: Record<string, Def> = {
  home: { permission: null, label: "Home", order: 10, group: "General" },
  approvals: {
    permission: null,
    label: "Approvals",
    order: 20,
    group: "General",
  },
  "purchase-requisitions": {
    permission: "pr.manage",
    label: "Requisitions",
    order: 30,
    group: "General",
  },
  "purchase-orders": {
    permission: "po.manage",
    label: "Purchase orders",
    order: 40,
    group: "General",
  },
  grn: {
    permission: "grn.view",
    label: "Goods receipts",
    order: 50,
    group: "General",
  },
  subcontracting: {
    permission: "sco.view",
    label: "Subcontracting",
    order: 60,
    group: "General",
  },
  inventory: {
    permission: "inventory.view",
    label: "Inventory",
    order: 70,
    group: "General",
  },
  suppliers: {
    permission: "supplier.view",
    label: "Suppliers",
    order: 80,
    group: "General",
  },
  "employee-directory": {
    permission: "employees.directory.view",
    label: "Employee directory",
    order: 90,
    group: "Admin",
  },
  setup: {
    permission: "setup.roles.manage",
    label: "Setup",
    order: 100,
    group: "Admin",
  },
};

const catalog = SCREENS as unknown as Record<
  string,
  {
    path: string;
    permission: string | null;
    defaultLabel: string;
    defaultOrder: number;
    defaultMenuGroup: string;
  }
>;

let saved: (typeof screens.$inferSelect)[] = [];

beforeAll(async () => {
  await syncCatalog();
  saved = await db
    .select()
    .from(screens)
    .where(inArray(screens.key, ["inventory", "suppliers"]));
});

afterAll(async () => {
  for (const row of saved) {
    await db.update(screens).set(row).where(eq(screens.key, row.key));
  }
});

describe("BR-FF-100 default menu", () => {
  test("BR-FF-100 the code catalog holds all ten spec screens", () => {
    for (const key of Object.keys(EXPECTED)) {
      expect(catalog[key]).toBeDefined();
    }
  });

  test("BR-FF-100 labels, order and groups follow the spec table", () => {
    for (const [key, want] of Object.entries(EXPECTED)) {
      const got = catalog[key];
      expect(got?.defaultLabel).toBe(want.label);
      expect(got?.defaultOrder).toBe(want.order);
      expect(got?.defaultMenuGroup).toBe(want.group);
    }
  });

  test("BR-FF-100 sorting by order gives Home, Approvals, Requisitions, Purchase orders, Goods receipts, Subcontracting, Inventory, Suppliers, Employee directory, Setup", () => {
    const labels = Object.entries(catalog)
      .filter(([k]) => k in EXPECTED)
      .map(([, d]) => d)
      .sort((a, b) => a.defaultOrder - b.defaultOrder)
      .map((d) => d.defaultLabel);
    expect(labels).toEqual([
      "Home",
      "Approvals",
      "Requisitions",
      "Purchase orders",
      "Goods receipts",
      "Subcontracting",
      "Inventory",
      "Suppliers",
      "Employee directory",
      "Setup",
    ]);
  });

  test("BR-FF-100 each screen still needs its key; Home and Approvals need none", () => {
    for (const [key, want] of Object.entries(EXPECTED)) {
      expect(catalog[key]?.permission).toBe(want.permission);
    }
  });

  test("BR-FF-100 Employee directory and Setup are in group Admin, the other eight in General", () => {
    const admin = Object.entries(catalog)
      .filter(([k, d]) => k in EXPECTED && d.defaultMenuGroup === "Admin")
      .map(([k]) => k)
      .sort();
    expect(admin).toEqual(["employee-directory", "setup"]);
    const general = Object.entries(catalog).filter(
      ([k, d]) => k in EXPECTED && d.defaultMenuGroup === "General",
    );
    expect(general).toHaveLength(8);
  });

  test("BR-FF-100 screens from later modules sit in other groups, not General or Admin", () => {
    for (const [key, d] of Object.entries(catalog)) {
      if (key in EXPECTED) continue;
      expect(["General", "Admin"]).not.toContain(d.defaultMenuGroup);
    }
  });

  test("BR-FF-100 Admin screens sort after every General screen", () => {
    const inGroup = (g: string) =>
      Object.values(catalog)
        .filter((d) => d.defaultMenuGroup === g)
        .map((d) => d.defaultOrder);
    expect(Math.min(...inGroup("Admin"))).toBeGreaterThan(
      Math.max(...inGroup("General")),
    );
  });
});

describe("BR-FF-102 Home at /home", () => {
  test("BR-FF-102 the catalog has screen home at /home and no landing", () => {
    expect(catalog.home?.path).toBe("/home");
    expect(catalog.landing).toBeUndefined();
  });

  test("BR-FF-102 after sync the DB has home at /home and no landing row", async () => {
    await syncCatalog();
    const rows = await db.select().from(screens);
    const home = rows.find((r) => r.key === "home");
    expect(home?.path).toBe("/home");
    expect(home?.permissionKey).toBeNull();
    expect(rows.some((r) => r.key === "landing")).toBe(false);
  });
});

describe("BR-FF-101 later syncs keep Setup -> Screens edits", () => {
  test("BR-FF-101 a renamed, re-ordered, re-grouped screen is left alone by sync", async () => {
    await db
      .update(screens)
      .set({ label: "TEST_ff_Stores", sortOrder: 5, menuGroup: "TEST_ff_top" })
      .where(eq(screens.key, "inventory"));
    await syncCatalog();
    await syncCatalog();
    const [row] = await db
      .select()
      .from(screens)
      .where(eq(screens.key, "inventory"));
    expect(row?.label).toBe("TEST_ff_Stores");
    expect(row?.sortOrder).toBe(5);
    expect(row?.menuGroup).toBe("TEST_ff_top");
  });

  test("BR-FF-101 sync does not move an admin-reordered Suppliers back", async () => {
    await db
      .update(screens)
      .set({ sortOrder: 1 })
      .where(eq(screens.key, "suppliers"));
    await syncCatalog();
    const [row] = await db
      .select()
      .from(screens)
      .where(eq(screens.key, "suppliers"));
    expect(row?.sortOrder).toBe(1);
  });
});
