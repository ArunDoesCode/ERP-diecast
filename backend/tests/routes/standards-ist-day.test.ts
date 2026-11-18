/**
 * docs/specs/api-standards/spec.md (v1) "India day"
 * BR-STD-25 PR required-by check compares with the India day (Asia/Kolkata)
 * BR-STD-26 stock-movement date filter takes whole India days
 * (BR-STD-24 is checked by the standards-check rule ist-date, not here.)
 *
 * HTTP-level through createApp(), real DB, server clock set with setSystemTime.
 * Fixture shortcut: the ledger rows are inserted straight with a chosen created_at (a movement cannot be
 * posted in the past through the API). Written by test-writer from the spec only.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  setSystemTime,
  test,
} from "bun:test";
import { eq, inArray, like } from "drizzle-orm";
import { createApp } from "../../src/app";
import { db } from "../../src/db/client";
import {
  authAuditLog,
  documentNumberCounters,
  roles,
} from "../../src/db/schemas/01_auth";
import {
  inventoryLedger,
  itemMaster,
  locations,
} from "../../src/db/schemas/02_procurement-catalog";
import {
  purchaseRequestItems,
  purchaseRequests,
} from "../../src/db/schemas/02_procurement-purchasing";
import { employees } from "../../src/db/schemas/03_hcm";
import { signAccessToken } from "../../src/lib/token";

const app = createApp();
const RUN = Date.now();
const TAG = `TEST_stdist_${RUN}`;
let actorId: number;
let token: string;
let itemId: number;
let locationId: number;
const prIds: number[] = [];

// biome-ignore lint/suspicious/noExplicitAny: loose JSON in test responses
type Json = any;
async function call(method: string, path: string, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: res.status,
    json: (await res.json().catch(() => null)) as Json,
  };
}

/** Set the server clock, then sign a token that is valid at that clock. */
async function freeze(iso: string) {
  setSystemTime(new Date(iso));
  token = await signAccessToken({
    userId: actorId,
    userName: TAG,
    role: "super-admin",
    allowedPages: [],
  });
}

async function createPr(requiredBy: string) {
  const r = await call("POST", "/api/pr/createpr", {
    type: "misc",
    notes: `${TAG} pr`,
    items: [{ itemId, requestedQty: 1, expectedDate: requiredBy }],
  });
  if (r.status === 201) prIds.push(r.json.data.pr.id);
  return r;
}

async function ledgerAt(iso: string, ref: number) {
  const [row] = await db
    .insert(inventoryLedger)
    .values({
      itemId,
      locationId,
      transactionType: "in",
      referenceType: "opening_stock",
      referenceId: ref,
      quantityChange: 1,
      balanceAfter: 1,
      unitCostPaise: 100,
      totalValueChangePaise: 100,
      createdBy: actorId,
      createdAt: new Date(iso),
    })
    .returning({ id: inventoryLedger.id });
  if (!row) throw new Error("Fixture ledger row");
  return row.id;
}

async function listedIds(from: string, to: string) {
  const r = await call(
    "GET",
    `/api/asset/inventory/movements?itemId=${itemId}&fromDate=${from}&toDate=${to}&pageSize=100`,
  );
  expect(r.status).toBe(200);
  return (r.json.data as { id: number }[]).map((x) => x.id);
}

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
      email: `test_stdist_${RUN}@diecast.test`,
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
    .values({ sku: TAG, name: TAG, category: "Raw Material", uom: "kg" })
    .returning({ id: itemMaster.id });
  const [l] = await db
    .insert(locations)
    .values({ name: TAG, type: "finished_goods" })
    .returning({ id: locations.id });
  if (!i || !l) throw new Error("Fixture setup: item/location");
  itemId = i.id;
  locationId = l.id;
});

afterEach(async () => {
  setSystemTime();
  token = await signAccessToken({
    userId: actorId,
    userName: TAG,
    role: "super-admin",
    allowedPages: [],
  });
});

afterAll(async () => {
  setSystemTime();
  await db.delete(inventoryLedger).where(eq(inventoryLedger.itemId, itemId));
  if (prIds.length) {
    await db
      .delete(purchaseRequestItems)
      .where(inArray(purchaseRequestItems.prId, prIds));
    await db
      .delete(purchaseRequests)
      .where(inArray(purchaseRequests.id, prIds));
  }
  await db.delete(itemMaster).where(like(itemMaster.sku, "TEST_stdist_%"));
  await db.delete(locations).where(like(locations.name, "TEST_stdist_%"));
  await db
    .update(documentNumberCounters)
    .set({ createdBy: null })
    .where(eq(documentNumberCounters.createdBy, actorId));
  await db
    .update(documentNumberCounters)
    .set({ lastUpdatedBy: null })
    .where(eq(documentNumberCounters.lastUpdatedBy, actorId));
  await db.delete(authAuditLog).where(eq(authAuditLog.actorId, actorId));
  await db.delete(employees).where(like(employees.name, "TEST_stdist_%"));
});

describe("BR-STD-25 the PR required-by check uses the India day", () => {
  test("BR-STD-25 clock 2026-11-18T20:00:00Z (19 Nov 01:30 IST): required-by 2026-11-18 -> 400 PR_DATE_IN_PAST", async () => {
    await freeze("2026-11-18T20:00:00Z");
    const r = await createPr("2026-11-18");
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("PR_DATE_IN_PAST");
  });

  test("BR-STD-25 same clock: required-by 2026-11-19 -> saved", async () => {
    await freeze("2026-11-18T20:00:00Z");
    const r = await createPr("2026-11-19");
    expect(r.status).toBe(201);
  });
});

describe("BR-STD-26 the movement date filter takes whole India days", () => {
  test("BR-STD-26 movement at 2026-11-18T19:00:00Z (19 Nov 00:30 IST): filter 2026-11-18 -> not listed", async () => {
    const id = await ledgerAt("2026-11-18T19:00:00Z", 1);
    expect(await listedIds("2026-11-18", "2026-11-18")).not.toContain(id);
  });

  test("BR-STD-26 same movement: filter 2026-11-19 -> listed", async () => {
    const id = await ledgerAt("2026-11-18T19:00:00Z", 2);
    expect(await listedIds("2026-11-19", "2026-11-19")).toContain(id);
  });

  test("BR-STD-26 boundary: 18:29:59Z is still the 18th in India, 18:30:00Z is the 19th", async () => {
    const last = await ledgerAt("2026-11-18T18:29:59Z", 3);
    const first = await ledgerAt("2026-11-18T18:30:00Z", 4);
    const on18 = await listedIds("2026-11-18", "2026-11-18");
    expect(on18).toContain(last);
    expect(on18).not.toContain(first);
    const on19 = await listedIds("2026-11-19", "2026-11-19");
    expect(on19).toContain(first);
    expect(on19).not.toContain(last);
  });

  test("BR-STD-26 a range covers whole India days, toDate included", async () => {
    const id = await ledgerAt("2026-11-19T18:00:00Z", 5); // 19 Nov 23:30 IST
    expect(await listedIds("2026-11-18", "2026-11-19")).toContain(id);
  });
});
