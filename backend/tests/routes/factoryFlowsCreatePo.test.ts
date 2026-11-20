/**
 * docs/specs/factory-flows (v1, frozen): spec-documents.md BR-FF-43, 48, 49, 58, 59, 91, 92
 *
 * Backend side of "Create PO": the default supplier and suggested rate that GET /api/pr/getprdetails/:id
 * hands the dialog, the "on PO" link on a line, and the existing POST /api/po/createpo called once per supplier.
 * (BR-FF-49: "no PO is made before the dialog is confirmed" is a screen rule; the backend part is that the
 * read endpoint creates nothing, asserted below.)
 * Written by test-writer from the spec only.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { inArray, like } from "drizzle-orm";
import { createApp } from "../../src/app";
import { db } from "../../src/db/client";
import {
  documentNumberCounters,
  rolePermissions,
  roles,
} from "../../src/db/schemas/01_auth";
import { itemMaster } from "../../src/db/schemas/02_procurement-catalog";
import {
  prPoItemLinks,
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequestItems,
  purchaseRequests,
} from "../../src/db/schemas/02_procurement-purchasing";
import { supplierMaster } from "../../src/db/schemas/02_procurement-suppliers";
import { employees } from "../../src/db/schemas/03_hcm";
import { signAccessToken } from "../../src/lib/token";

const app = createApp();
const P = "test_ffcpo_";
const RUN = `TEST_ffcpo_${Date.now()}`;
let seq = 0;
const uid = () => `${RUN}_${++seq}`;

let empId = 0;
let token = "";
let s1 = 0; // active
let s2 = 0; // active
let s3 = 0; // inactive
const created = {
  pr: [] as number[],
  po: [] as number[],
  item: [] as number[],
};

// biome-ignore lint/suspicious/noExplicitAny: test helper reads arbitrary JSON
type Json = any;
async function call(method: string, path: string, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => null)) as Json;
  return { status: res.status, json };
}

async function mkItem() {
  const [i] = await db
    .insert(itemMaster)
    .values({
      sku: uid(),
      name: `${RUN} item`,
      category: "Raw Material",
      uom: "kg",
    })
    .returning({ id: itemMaster.id });
  created.item.push(i!.id);
  return i!.id;
}

async function mkPastPo(
  supplierId: number,
  itemId: number,
  status: (typeof purchaseOrders.$inferInsert)["status"],
  createdAt: Date,
  ratePaise = 24_500,
) {
  const [po] = await db
    .insert(purchaseOrders)
    .values({
      poNumber: uid(),
      supplierId,
      status,
      createdBy: empId,
      createdAt,
    })
    .returning({ id: purchaseOrders.id });
  created.po.push(po!.id);
  await db.insert(purchaseOrderItems).values({
    poId: po!.id,
    itemId,
    qty: 10,
    unitPricePaise: ratePaise,
    uom: "kg",
  });
  return po!.id;
}

/** Approved PR with one pending line per item; returns PR id and the line ids (same order as items). */
async function mkApprovedPr(itemIds: number[]) {
  const [pr] = await db
    .insert(purchaseRequests)
    .values({
      prNumber: uid(),
      type: "misc",
      requestedBy: empId,
      status: "approved",
      notes: RUN,
    })
    .returning({ id: purchaseRequests.id });
  created.pr.push(pr!.id);
  const lineIds: number[] = [];
  for (const itemId of itemIds) {
    const [l] = await db
      .insert(purchaseRequestItems)
      .values({
        prId: pr!.id,
        itemId,
        requestedQty: 10,
        uom: "kg",
        status: "pending",
      })
      .returning({ id: purchaseRequestItems.id });
    lineIds.push(l!.id);
  }
  return { id: pr!.id, lineIds };
}

const details = async (prId: number) => {
  const r = await call("GET", `/api/pr/getprdetails/${prId}`);
  expect(r.status).toBe(200);
  return r.json.data as Json;
};
const lineFor = (d: Json, itemId: number) =>
  d.items.find((i: Json) => i.itemId === itemId);

async function cleanup() {
  if (created.po.length) {
    // POs made through createpo are found by their supplier
    await db.delete(prPoItemLinks).where(
      inArray(
        prPoItemLinks.prItemId,
        (
          await db
            .select({ id: purchaseRequestItems.id })
            .from(purchaseRequestItems)
            .where(inArray(purchaseRequestItems.prId, created.pr))
        ).map((r) => r.id),
      ),
    );
  }
  const madePos = (
    await db
      .select({ id: purchaseOrders.id })
      .from(purchaseOrders)
      .where(inArray(purchaseOrders.supplierId, [s1, s2, s3]))
  ).map((r) => r.id);
  if (madePos.length) {
    await db
      .delete(purchaseOrderItems)
      .where(inArray(purchaseOrderItems.poId, madePos));
    await db.delete(purchaseOrders).where(inArray(purchaseOrders.id, madePos));
  }
  if (created.pr.length) {
    await db
      .delete(purchaseRequestItems)
      .where(inArray(purchaseRequestItems.prId, created.pr));
    await db
      .delete(purchaseRequests)
      .where(inArray(purchaseRequests.id, created.pr));
  }
  if (created.item.length) {
    await db.delete(itemMaster).where(inArray(itemMaster.id, created.item));
  }
  await db.delete(supplierMaster).where(like(supplierMaster.name, `${RUN}%`));
  const mine = (
    await db
      .select({ id: employees.id })
      .from(employees)
      .where(like(employees.email, `${P}%`))
  ).map((e) => e.id);
  if (mine.length) {
    await db
      .update(documentNumberCounters)
      .set({ createdBy: null })
      .where(inArray(documentNumberCounters.createdBy, mine));
    await db
      .update(documentNumberCounters)
      .set({ lastUpdatedBy: null })
      .where(inArray(documentNumberCounters.lastUpdatedBy, mine));
  }
  await db.delete(employees).where(like(employees.email, `${P}%`));
  await db.delete(roles).where(like(roles.name, `${P}%`));
}

beforeAll(async () => {
  await cleanup(); // leftovers of an earlier aborted run
  const [r] = await db
    .insert(roles)
    .values({ name: `${P}buyer`, isSystem: false })
    .returning({ id: roles.id });
  await db.insert(rolePermissions).values(
    ["pr.manage", "po.manage"].map((permissionKey) => ({
      roleId: r!.id,
      permissionKey,
    })),
  );
  const [e] = await db
    .insert(employees)
    .values({
      name: `${RUN}_o`,
      email: `${P}o@diecast.test`,
      roleId: r!.id,
      isActive: true,
    })
    .returning({ id: employees.id });
  empId = e!.id;
  token = await signAccessToken({
    userId: empId,
    userName: `${RUN}_o`,
    role: `${P}buyer`,
    allowedPages: [],
  });
  const mk = async (name: string, isActive = true) => {
    const [s] = await db
      .insert(supplierMaster)
      .values({ name: `${RUN}_${name}`, isActive })
      .returning({ id: supplierMaster.id });
    return s!.id;
  };
  s1 = await mk("Sri Balaji");
  s2 = await mk("Lube Co");
  s3 = await mk("Closed Co", false);
});

afterAll(cleanup);

const DAY = 86_400_000;

describe("BR-FF-91 default supplier of a pending line", () => {
  test("BR-FF-91 the supplier of the newest PO holding the item", async () => {
    const item = await mkItem();
    await mkPastPo(s2, item, "dispatched", new Date(Date.now() - 10 * DAY));
    await mkPastPo(s1, item, "dispatched", new Date(Date.now() - 2 * DAY));
    const pr = await mkApprovedPr([item]);
    const line = lineFor(await details(pr.id), item);
    expect(line.defaultSupplierId).toBe(s1);
    expect(line.defaultSupplierName).toBe(`${RUN}_Sri Balaji`);
  });

  test("BR-FF-91 same created time -> the higher PO id wins", async () => {
    const item = await mkItem();
    const at = new Date(Date.now() - 3 * DAY);
    await mkPastPo(s1, item, "dispatched", at);
    await mkPastPo(s2, item, "dispatched", at); // inserted second -> higher id
    const line = lineFor(await details((await mkApprovedPr([item])).id), item);
    expect(line.defaultSupplierId).toBe(s2);
  });

  test("BR-FF-91 an item only on a cancelled PO has no default supplier", async () => {
    const item = await mkItem();
    await mkPastPo(s1, item, "cancelled", new Date(Date.now() - 2 * DAY));
    const line = lineFor(await details((await mkApprovedPr([item])).id), item);
    expect(line.defaultSupplierId).toBeNull();
    expect(line.defaultSupplierName).toBeNull();
  });

  test("BR-FF-91 a newer cancelled PO is skipped: the older live PO's supplier is the default", async () => {
    const item = await mkItem();
    await mkPastPo(s2, item, "dispatched", new Date(Date.now() - 9 * DAY));
    await mkPastPo(s1, item, "cancelled", new Date(Date.now() - 1 * DAY));
    const line = lineFor(await details((await mkApprovedPr([item])).id), item);
    expect(line.defaultSupplierId).toBe(s2);
  });

  test("BR-FF-91 an inactive supplier is never the default (older PO of an active supplier is used; none -> null)", async () => {
    const item = await mkItem();
    await mkPastPo(s2, item, "dispatched", new Date(Date.now() - 9 * DAY));
    await mkPastPo(s3, item, "dispatched", new Date(Date.now() - 1 * DAY));
    const only = await mkItem();
    await mkPastPo(s3, only, "dispatched", new Date(Date.now() - 1 * DAY));
    const d = await details((await mkApprovedPr([item, only])).id);
    expect(lineFor(d, item).defaultSupplierId).toBe(s2);
    expect(lineFor(d, only).defaultSupplierId).toBeNull();
  });

  test("BR-FF-91 an item on no PO has no default supplier", async () => {
    const item = await mkItem();
    const line = lineFor(await details((await mkApprovedPr([item])).id), item);
    expect(line.defaultSupplierId).toBeNull();
    expect(line.defaultSupplierName).toBeNull();
  });
});

describe("BR-FF-92 suggested rate", () => {
  test("BR-FF-92 the last PO rate is suggested; an item with no rate anywhere has none (null or 0 -> the dialog asks)", async () => {
    const priced = await mkItem();
    await mkPastPo(
      s1,
      priced,
      "dispatched",
      new Date(Date.now() - 2 * DAY),
      24_500,
    );
    const bare = await mkItem();
    const d = await details((await mkApprovedPr([priced, bare])).id);
    expect(lineFor(d, priced).suggestedRatePaise).toBe(24_500);
    expect(lineFor(d, bare).suggestedRatePaise ?? 0).toBe(0);
  });

  test("BR-FF-92 a rate typed in the dialog (30,000 paise) becomes the draft line rate", async () => {
    const item = await mkItem();
    const pr = await mkApprovedPr([item]);
    const r = await call("POST", "/api/po/createpo", {
      supplierId: s2,
      lines: [{ prItemId: pr.lineIds[0], unitPricePaise: 30_000 }],
    });
    expect(r.status).toBe(201);
    expect(r.json.data.items[0].unitPricePaise).toBe(30_000);
  });
});

describe("BR-FF-48 / BR-FF-49 one draft PO per supplier, never sent", () => {
  test("BR-FF-49 reading the requisition (opening the dialog) makes no PO", async () => {
    const item = await mkItem();
    const pr = await mkApprovedPr([item]);
    const before = await db
      .select({ id: purchaseOrders.id })
      .from(purchaseOrders)
      .where(inArray(purchaseOrders.supplierId, [s1, s2, s3]));
    await details(pr.id);
    const after = await db
      .select({ id: purchaseOrders.id })
      .from(purchaseOrders)
      .where(inArray(purchaseOrders.supplierId, [s1, s2, s3]));
    expect(after.length).toBe(before.length);
  });

  test("BR-FF-48 two suppliers -> two draft POs, each with only its lines; the PR lines now show the PO they are on (BR-FF-43)", async () => {
    const [adc, lube] = [await mkItem(), await mkItem()];
    const pr = await mkApprovedPr([adc, lube]);
    expect(lineFor(await details(pr.id), adc).onPoId).toBeNull();

    const a = await call("POST", "/api/po/createpo", {
      supplierId: s1,
      lines: [{ prItemId: pr.lineIds[0], unitPricePaise: 24_500 }],
    });
    const b = await call("POST", "/api/po/createpo", {
      supplierId: s2,
      lines: [{ prItemId: pr.lineIds[1], unitPricePaise: 30_000 }],
    });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.json.data.po.status).toBe("draft");
    expect(b.json.data.po.status).toBe("draft");
    expect(a.json.data.po.supplierId).toBe(s1);
    expect(a.json.data.items.length).toBe(1);
    expect(b.json.data.items.length).toBe(1);

    const d = await details(pr.id);
    expect(lineFor(d, adc).onPoId).toBe(a.json.data.po.id);
    expect(lineFor(d, adc).onPoNumber).toBe(a.json.data.po.poNumber);
    expect(lineFor(d, lube).onPoId).toBe(b.json.data.po.id);
    expect(d.linkedPos.length).toBe(2);
  });
});

describe("BR-FF-58 one supplier refused, the others stay made", () => {
  test("BR-FF-58 an inactive supplier's PO is refused; the other supplier's draft stays and the refused line stays pending", async () => {
    const [okItem, badItem] = [await mkItem(), await mkItem()];
    const pr = await mkApprovedPr([okItem, badItem]);
    const ok = await call("POST", "/api/po/createpo", {
      supplierId: s1,
      lines: [{ prItemId: pr.lineIds[0], unitPricePaise: 100 }],
    });
    const bad = await call("POST", "/api/po/createpo", {
      supplierId: s3,
      lines: [{ prItemId: pr.lineIds[1], unitPricePaise: 100 }],
    });
    expect(ok.status).toBe(201);
    expect(bad.status).toBeGreaterThanOrEqual(400);
    expect(bad.status).toBeLessThan(500);
    const d = await details(pr.id);
    expect(lineFor(d, badItem).status).toBe("pending");
    expect(lineFor(d, okItem).onPoId).toBe(ok.json.data.po.id);
  });
});

describe("BR-FF-59 a line put on another PO meanwhile", () => {
  test("BR-FF-59 creating a PO for a line that is already on a PO -> 409", async () => {
    const item = await mkItem();
    const pr = await mkApprovedPr([item]);
    const body = {
      supplierId: s1,
      lines: [{ prItemId: pr.lineIds[0], unitPricePaise: 100 }],
    };
    expect((await call("POST", "/api/po/createpo", body)).status).toBe(201);
    expect((await call("POST", "/api/po/createpo", body)).status).toBe(409);
  });

  test("BR-FF-59 two buyers clicking Create PO at once: exactly one 201 and one 409, one PO holds the line", async () => {
    const item = await mkItem();
    const pr = await mkApprovedPr([item]);
    const body = {
      supplierId: s1,
      lines: [{ prItemId: pr.lineIds[0], unitPricePaise: 100 }],
    };
    const res = await Promise.all([
      call("POST", "/api/po/createpo", body),
      call("POST", "/api/po/createpo", body),
    ]);
    expect(res.map((r) => r.status).sort()).toEqual([201, 409]);
    const links = await db
      .select({ id: prPoItemLinks.id })
      .from(prPoItemLinks)
      .where(inArray(prPoItemLinks.prItemId, pr.lineIds));
    expect(links.length).toBe(1);
  });
});
