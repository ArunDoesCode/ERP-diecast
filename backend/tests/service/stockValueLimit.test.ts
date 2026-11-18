/**
 * docs/specs/api-standards/spec.md (v1) BR-STD-43 (a): postStock refuses a posting whose resulting item
 * stock value (stock x average cost) is above MAX_STOCK_VALUE_PAISE: 400 AMOUNT_TOO_LARGE, nothing saved.
 *
 * Real DB through the manual-movement endpoint (the stable interface onto postStock).
 * Fixture shortcut: the item row is seeded at 900,000,000 pcs and average cost 10,000,000 paise straight in the DB.
 * Written by test-writer from the spec only.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, like } from "drizzle-orm";
import { createApp } from "../../src/app";
import { db } from "../../src/db/client";
import { authAuditLog, roles } from "../../src/db/schemas/01_auth";
import {
  inventoryLedger,
  itemMaster,
  locations,
} from "../../src/db/schemas/02_procurement-catalog";
import { employees } from "../../src/db/schemas/03_hcm";
import { signAccessToken } from "../../src/lib/token";

const app = createApp();
const RUN = Date.now();
const TAG = `TEST_stdstock_${RUN}`;
let actorId: number;
let token: string;
let itemId: number;
let locationId: number;

// biome-ignore lint/suspicious/noExplicitAny: loose JSON in test responses
type Json = any;
async function post(body: unknown) {
  const res = await app.request("/api/asset/inventory/movements", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return {
    status: res.status,
    json: (await res.json().catch(() => null)) as Json,
  };
}
const ledgerRows = () =>
  db.select().from(inventoryLedger).where(eq(inventoryLedger.itemId, itemId));
const itemRow = async () =>
  (await db.select().from(itemMaster).where(eq(itemMaster.id, itemId)))[0];

beforeAll(async () => {
  const [sa] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, "super-admin"));
  if (!sa) throw new Error("Fixture setup: super-admin missing");
  const [e] = await db
    .insert(employees)
    .values({
      name: TAG,
      email: `test_stdstock_${RUN}@diecast.test`,
      roleId: sa.id,
      isActive: true,
    })
    .returning({ id: employees.id });
  if (!e) throw new Error("Fixture setup: employee");
  actorId = e.id;
  token = await signAccessToken({
    userId: actorId,
    userName: TAG,
    role: "super-admin",
    allowedPages: [],
  });
  const [i] = await db
    .insert(itemMaster)
    .values({
      sku: TAG,
      name: TAG,
      category: "Raw Material",
      uom: "pcs",
      currentStock: 900_000_000,
      averageCostPaise: 10_000_000,
    })
    .returning({ id: itemMaster.id });
  const [l] = await db
    .insert(locations)
    .values({ name: TAG, type: "finished_goods" })
    .returning({ id: locations.id });
  if (!i || !l) throw new Error("Fixture setup: item/location");
  itemId = i.id;
  locationId = l.id;
});

afterAll(async () => {
  await db.delete(inventoryLedger).where(eq(inventoryLedger.itemId, itemId));
  await db.delete(itemMaster).where(like(itemMaster.sku, "TEST_stdstock_%"));
  await db.delete(locations).where(like(locations.name, "TEST_stdstock_%"));
  await db.delete(authAuditLog).where(eq(authAuditLog.actorId, actorId));
  await db.delete(employees).where(eq(employees.id, actorId));
});

describe("BR-STD-43 postStock refuses a stock value above 9e15 paise", () => {
  test("BR-STD-43 stock-in of 1 pc at Rs 1,00,000.00 on 900,000,000 pcs at that cost -> 400 AMOUNT_TOO_LARGE, no ledger row, stock unchanged", async () => {
    const ledgerBefore = (await ledgerRows()).length;
    const r = await post({
      itemId,
      locationId,
      referenceType: "opening_stock",
      qty: 1,
      unitCostPaise: 10_000_000,
      reason: "test stock value limit",
    });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("AMOUNT_TOO_LARGE");
    expect((await ledgerRows()).length).toBe(ledgerBefore);
    expect((await itemRow())?.currentStock).toBe(900_000_000);
    expect((await itemRow())?.averageCostPaise).toBe(10_000_000);
  });
});
