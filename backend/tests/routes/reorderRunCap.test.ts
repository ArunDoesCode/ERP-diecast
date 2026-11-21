/**
 * Reorder run cap (docs/specs/reorder/spec.md v1): BR-RO-13 more than 500 low
 * items. Real DB, full HTTP stack. Fixtures are TEST_ro_c_ prefixed.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import { eq, inArray, like, or } from "drizzle-orm";
import { createApp } from "../../src/app";
import { db } from "../../src/db/client";
import { documentNumberCounters, roles } from "../../src/db/schemas/01_auth";
import { itemMaster } from "../../src/db/schemas/02_procurement-catalog";
import {
  purchaseRequestItems,
  purchaseRequests,
} from "../../src/db/schemas/02_procurement-purchasing";
import {
  reorderRunItems,
  reorderRuns,
  reorderSettings,
  reorderSettingsHistory,
} from "../../src/db/schemas/02_procurement-reorder";
import { employees } from "../../src/db/schemas/03_hcm";
import { signAccessToken } from "../../src/lib/token";

const app = createApp();
const RUN = `TEST_ro_c_${Date.now()}`;
const TOTAL = 520;
// Shortfall = level (no stock). Higher level = larger shortfall.
const BASE_LEVEL = 50_000_000;

let boId = 0;
let raviId = 0;
let boToken = "";
const itemIds: number[] = [];

async function mkEmployee(tag: string) {
  const [r] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, "back_office"))
    .limit(1);
  const [e] = await db
    .insert(employees)
    .values({ name: `${RUN}_${tag}`, roleId: r!.id, isActive: true })
    .returning({ id: employees.id });
  return e!.id;
}

async function api(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const res = await app.request(path, {
    method,
    headers: {
      Authorization: `Bearer ${boToken}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

beforeAll(async () => {
  boId = await mkEmployee("bo");
  raviId = await mkEmployee("ravi");
  boToken = await signAccessToken({
    userId: boId,
    userName: `${RUN}_bo`,
    role: "back_office",
    allowedPages: [],
  });
  const set = await api("PATCH", "/api/reorder/settings", {
    draftOwnerId: raviId,
  });
  if (set.status !== 200) throw new Error(`fixture owner ${set.status}`);
  const rows = await db
    .insert(itemMaster)
    .values(
      Array.from({ length: TOTAL }, (_, i) => ({
        sku: `${RUN}_${String(i).padStart(4, "0")}`,
        name: `${RUN} item`,
        category: "Raw Material",
        uom: "kg",
        reorderLevel: BASE_LEVEL + i,
        reorderQty: 1,
        standardRatePaise: 1,
      })),
    )
    .returning({ id: itemMaster.id, sku: itemMaster.sku });
  for (const r of rows) itemIds.push(r.id);
});

afterAll(async () => {
  const empIds = [boId, raviId];
  const runIds = (
    await db
      .select({ id: reorderRuns.id })
      .from(reorderRuns)
      .where(inArray(reorderRuns.startedBy, empIds))
  ).map((r) => r.id);
  const prIds = (
    await db
      .select({ id: purchaseRequests.id })
      .from(purchaseRequests)
      .where(
        or(
          inArray(purchaseRequests.requestedBy, empIds),
          runIds.length
            ? inArray(purchaseRequests.reorderRunId, runIds)
            : undefined,
        ),
      )
  ).map((p) => p.id);
  if (runIds.length) {
    await db
      .delete(reorderRunItems)
      .where(inArray(reorderRunItems.runId, runIds));
  }
  if (prIds.length) {
    await db
      .delete(purchaseRequestItems)
      .where(inArray(purchaseRequestItems.prId, prIds));
    await db
      .delete(purchaseRequests)
      .where(inArray(purchaseRequests.id, prIds));
  }
  if (runIds.length) {
    await db.delete(reorderRuns).where(inArray(reorderRuns.id, runIds));
  }
  await db
    .delete(reorderSettingsHistory)
    .where(inArray(reorderSettingsHistory.createdBy, empIds));
  await db
    .update(reorderSettings)
    .set({ enabled: false, runHour: 7, draftOwnerId: null, updatedBy: null })
    .where(eq(reorderSettings.id, 1));
  await db.delete(itemMaster).where(like(itemMaster.sku, `${RUN}%`));
  await db
    .update(documentNumberCounters)
    .set({ createdBy: null })
    .where(inArray(documentNumberCounters.createdBy, empIds));
  await db
    .update(documentNumberCounters)
    .set({ lastUpdatedBy: null })
    .where(inArray(documentNumberCounters.lastUpdatedBy, empIds));
  await db.delete(employees).where(inArray(employees.id, empIds));
});

test("BR-RO-13 520 low items: PR takes the 500 largest shortfalls, the 20 smallest are deferred, the next run raises them", async () => {
  const first = await api("POST", "/api/reorder/check-now", {});
  expect(first.status).toBe(201);
  const run = first.json.data;
  expect(run.state).toBe("done");
  expect(run.pr).not.toBeNull();
  expect(run.itemsRaised).toBe(500);
  expect(run.itemsDeferred).toBeGreaterThanOrEqual(20);

  const lines = await db
    .select({ id: purchaseRequestItems.id })
    .from(purchaseRequestItems)
    .where(eq(purchaseRequestItems.prId, run.pr.id));
  expect(lines.length).toBe(500);

  const det = (await api("GET", `/api/reorder/runs/${run.id}`)).json.data;
  const byItem = new Map<number, any>(det.items.map((x: any) => [x.itemId, x]));
  // items were inserted in ascending level order: index 0 = smallest shortfall
  for (let i = 0; i < 20; i++) {
    expect(byItem.get(itemIds[i]!)?.outcome).toBe("deferred");
  }
  for (let i = 20; i < TOTAL; i++) {
    expect(byItem.get(itemIds[i]!)?.outcome).toBe("raised");
  }

  const second = await api("POST", "/api/reorder/check-now", {});
  expect(second.status).toBe(201);
  const det2 = (await api("GET", `/api/reorder/runs/${second.json.data.id}`))
    .json.data;
  const raised2 = new Set(
    det2.items
      .filter((x: any) => x.outcome === "raised")
      .map((x: any) => x.itemId),
  );
  for (let i = 0; i < 20; i++) expect(raised2.has(itemIds[i])).toBe(true);
});
