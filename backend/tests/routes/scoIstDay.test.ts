/**
 * HTTP-level tests for the IST-day rule of the subcontracting module:
 * BR-SCO-01 (number period), BR-SCO-03 (expected return date), BR-SCO-09
 * (challan date, default, FY in the number), BR-SCO-11 (due date, days left)
 * - docs/specs/subcontracting.md v4, "Acceptance - IST day".
 *
 * Every "today" is the plant's calendar day in IST (Asia/Kolkata), whatever
 * zone the server runs in. The clock is moved with bun:test setSystemTime;
 * fixtures are made on the real clock first, then the clock is set and the
 * actors log in again (access tokens expire in minutes). Fixtures are
 * TEST_scoist_ prefixed and removed in afterAll; company_settings is saved
 * before and restored after.
 *
 * Date inputs: date-only strings ("2026-10-01") are what a date picker sends
 * and read as that calendar day. Full timestamps are read as the IST day they
 * fall in.
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
import { and, eq, inArray, like } from "drizzle-orm";
import { createApp } from "../../src/app";
import { db } from "../../src/db/client";
import { documentNumberCounters, roles } from "../../src/db/schemas/01_auth";
import {
  inventoryLedger,
  itemMaster,
  locations,
  serviceMaster,
} from "../../src/db/schemas/02_procurement-catalog";
import {
  scoChallanLines,
  scoChallans,
  subcontractingOrderItems,
  subcontractingOrders,
} from "../../src/db/schemas/02_procurement-purchasing";
import {
  supplierMaster,
  supplierServices,
} from "../../src/db/schemas/02_procurement-suppliers";
import { employees } from "../../src/db/schemas/03_hcm";
import { companySettings } from "../../src/db/schemas/04_company";
import { authService } from "../../src/service/authService";

const app = createApp();
const PREFIX = "TEST_scoist_";
const EMAIL_PREFIX = "test_scoist_";
const PASSWORD = "scoist-test-password-123";

// Clock instants (UTC) for the spec's IST examples.
const IST_0200_1_OCT_2026 = "2026-09-30T20:30:00.000Z"; // 02:00 IST, 1 Oct 2026
const IST_0030_1_APR_2027 = "2027-03-31T19:00:00.000Z"; // 00:30 IST, 1 Apr 2027
const IST_2300_31_MAR_2027 = "2027-03-31T17:30:00.000Z"; // 23:00 IST, 31 Mar 2027
const IST_0200_15_AUG_2027 = "2027-08-14T20:30:00.000Z"; // 02:00 IST, 15 Aug 2027

type Actor = { id: number; token: string };
const actors: Record<string, Actor> = {};
const actorEmails: Record<string, string> = {};

let mainStoreId: number;
let createdMainStore = false;
let serviceId: number;
let vendorId: number; // same state as the company (29), registered
let savedCompany: typeof companySettings.$inferSelect | undefined;
let seq = 0;

const createdScoIds: number[] = [];
const vendorIds: number[] = [];

function requireRow<T>(row: T | undefined, what: string): T {
  if (!row) throw new Error(`Fixture setup: ${what} returned no row`);
  return row;
}

function uniq(tag: string) {
  seq += 1;
  return `${PREFIX}${tag}_${Date.now()}_${seq}`;
}

async function makeActor(key: string, roleName: string): Promise<void> {
  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, roleName))
    .limit(1);
  const roleRow = requireRow(role, `role ${roleName}`);
  const email = `${EMAIL_PREFIX}${key}@diecast.test`;
  const [emp] = await db
    .insert(employees)
    .values({
      name: `${PREFIX}${key}`,
      email,
      passwordHash: await Bun.password.hash(PASSWORD),
      roleId: roleRow.id,
      isActive: true,
    })
    .returning({ id: employees.id });
  const { accessToken } = await authService.login(email, PASSWORD);
  actorEmails[key] = email;
  actors[key] = {
    id: requireRow(emp, `employee ${key}`).id,
    token: accessToken,
  };
}

/** Move the clock to `iso` and give every actor a token valid at that time. */
async function setClock(iso: string) {
  setSystemTime(new Date(iso));
  for (const key of Object.keys(actors)) {
    const { accessToken } = await authService.login(
      actorEmails[key] as string,
      PASSWORD,
    );
    (actors[key] as Actor).token = accessToken;
  }
}

async function call(
  actor: string | null,
  method: string,
  path: string,
  body?: unknown,
) {
  const headers: Record<string, string> = {};
  if (actor) headers.Authorization = `Bearer ${actors[actor]?.token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await app.request(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // biome-ignore lint/suspicious/noExplicitAny: test helper reads arbitrary JSON
  const json = (await res.json().catch(() => null)) as any;
  return { status: res.status, json };
}

/** The IST calendar day (YYYY-MM-DD) a stored timestamp falls in. */
function istDayOf(value: unknown): string {
  const t = new Date(String(value)).getTime();
  return new Date(t + 330 * 60_000).toISOString().slice(0, 10);
}

/** Back to the real clock, with fresh tokens. */
async function realClock() {
  setSystemTime();
  for (const key of Object.keys(actors)) {
    const { accessToken } = await authService.login(
      actorEmails[key] as string,
      PASSWORD,
    );
    (actors[key] as Actor).token = accessToken;
  }
}

async function makeRaw(stock: number) {
  await realClock();
  const [row] = await db
    .insert(itemMaster)
    .values({
      sku: uniq("raw"),
      name: `${PREFIX}raw`,
      category: "Raw Material",
      uom: "pcs",
      hsnCode: "7616",
    })
    .returning({ id: itemMaster.id });
  const id = requireRow(row, "raw item").id;
  const res = await call("owner", "POST", "/asset/inventory/movements", {
    itemId: id,
    locationId: mainStoreId,
    referenceType: "opening_stock",
    qty: stock,
    unitCostPaise: 1_000,
    reason: "opening",
  });
  if (res.status >= 300) {
    throw new Error(`opening stock failed: ${JSON.stringify(res.json)}`);
  }
  return id;
}

async function makeFinished() {
  const [row] = await db
    .insert(itemMaster)
    .values({
      sku: uniq("fin"),
      name: `${PREFIX}fin`,
      category: "Raw Material",
      uom: "pcs",
    })
    .returning({ id: itemMaster.id });
  return requireRow(row, "finished item").id;
}

function scoBody(
  rawItemId: number,
  finishedItemId: number,
  expectedReturnDate: unknown,
) {
  return {
    vendorId,
    expectedReturnDate,
    lines: [
      {
        rawItemId,
        finishedItemId,
        serviceId,
        rawQtyToIssue: 100,
        expectedReturnQty: 100,
      },
    ],
  };
}

/** Approved SCO with one line of 100 pcs (made on the real clock). */
async function makeApprovedSco() {
  const raw = await makeRaw(5000);
  const fin = await makeFinished();
  setSystemTime();
  const res = await call(
    "bo",
    "POST",
    "/sco/createsco",
    scoBody(raw, fin, new Date(Date.now() + 30 * 86_400_000).toISOString()),
  );
  if (res.status !== 201) {
    throw new Error(`SCO fixture failed: ${JSON.stringify(res.json)}`);
  }
  const scoId = res.json.data.sco.id as number;
  createdScoIds.push(scoId);
  await db
    .update(subcontractingOrders)
    .set({ status: "approved" })
    .where(eq(subcontractingOrders.id, scoId));
  const items = res.json.data.items as Array<{ id: number }>;
  return { raw, scoId, itemId: (items[0] as { id: number }).id };
}

function challan(
  scoId: number,
  itemId: number,
  extra: Record<string, unknown> = {},
  qty = 10,
) {
  return call("bo", "POST", `/sco/${scoId}/challans`, {
    lines: [{ scoItemId: itemId, qty }],
    ...extra,
  });
}

async function challanCount(scoId: number) {
  const rows = await db
    .select({ id: scoChallans.id })
    .from(scoChallans)
    .where(eq(scoChallans.scoId, scoId));
  return rows.length;
}

async function issueRowCount(itemId: number) {
  const rows = await db
    .select({ id: inventoryLedger.id })
    .from(inventoryLedger)
    .where(
      and(
        eq(inventoryLedger.itemId, itemId),
        eq(inventoryLedger.referenceType, "sco_issue"),
      ),
    );
  return rows.length;
}

beforeAll(async () => {
  await makeActor("owner", "owner");
  await makeActor("bo", "back_office");

  const [existing] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.type, "main_store"))
    .orderBy(locations.id)
    .limit(1);
  if (existing) {
    mainStoreId = existing.id;
  } else {
    const [loc] = await db
      .insert(locations)
      .values({ name: `${PREFIX}main_store`, type: "main_store" })
      .returning({ id: locations.id });
    mainStoreId = requireRow(loc, "main store").id;
    createdMainStore = true;
  }

  const [svc] = await db
    .insert(serviceMaster)
    .values({ code: uniq("CNC"), name: `${PREFIX}CNC`, defaultUom: "pcs" })
    .returning({ id: serviceMaster.id });
  serviceId = requireRow(svc, "service").id;

  const [prior] = await db.select().from(companySettings).limit(1);
  savedCompany = prior;
  await db.delete(companySettings);
  await db.insert(companySettings).values({
    id: 1,
    name: `${PREFIX}Diecast Works`,
    address: "1 Plant Road, Pune",
    gstin: "29AABCD1234E1Z5",
    stateCode: "29",
    updatedBy: actors.owner?.id ?? null,
  });

  const [v] = await db
    .insert(supplierMaster)
    .values({
      name: uniq("vendor"),
      type: "service_provider",
      gstNumber: "29TESTL0001A1Z5",
      address: "vendor street, town",
    })
    .returning({ id: supplierMaster.id });
  vendorId = requireRow(v, "vendor").id;
  vendorIds.push(vendorId);
  await db.insert(supplierServices).values({
    supplierId: vendorId,
    serviceId,
    serviceUnitPricePaise: 2_500,
    taxPercentage: 18,
  });
});

afterEach(() => {
  setSystemTime();
});

afterAll(async () => {
  setSystemTime();
  const scoRows = await db
    .select({ id: subcontractingOrders.id })
    .from(subcontractingOrders)
    .where(eq(subcontractingOrders.vendorId, vendorId));
  const scoIds = [...new Set([...createdScoIds, ...scoRows.map((s) => s.id)])];
  if (scoIds.length > 0) {
    const chRows = await db
      .select({ id: scoChallans.id })
      .from(scoChallans)
      .where(inArray(scoChallans.scoId, scoIds));
    const chIds = chRows.map((c) => c.id);
    if (chIds.length > 0) {
      await db
        .delete(scoChallanLines)
        .where(inArray(scoChallanLines.challanId, chIds));
      await db.delete(scoChallans).where(inArray(scoChallans.id, chIds));
    }
  }
  const itemRows = await db
    .select({ id: itemMaster.id })
    .from(itemMaster)
    .where(like(itemMaster.sku, `${PREFIX}%`));
  const itemIds = itemRows.map((i) => i.id);
  if (itemIds.length > 0) {
    await db
      .delete(inventoryLedger)
      .where(inArray(inventoryLedger.itemId, itemIds));
  }
  if (scoIds.length > 0) {
    await db
      .delete(subcontractingOrderItems)
      .where(inArray(subcontractingOrderItems.scoId, scoIds));
    await db
      .delete(subcontractingOrders)
      .where(inArray(subcontractingOrders.id, scoIds));
  }
  if (vendorIds.length > 0) {
    await db
      .delete(locations)
      .where(inArray(locations.linkedVendorId, vendorIds));
    await db
      .delete(supplierServices)
      .where(inArray(supplierServices.supplierId, vendorIds));
    await db
      .delete(supplierMaster)
      .where(inArray(supplierMaster.id, vendorIds));
  }
  await db.delete(serviceMaster).where(like(serviceMaster.code, `${PREFIX}%`));
  await db.delete(itemMaster).where(like(itemMaster.sku, `${PREFIX}%`));
  if (createdMainStore) {
    await db.delete(locations).where(eq(locations.id, mainStoreId));
  }
  await db.delete(companySettings);
  if (savedCompany) await db.insert(companySettings).values(savedCompany);
  const empRows = await db
    .select({ id: employees.id })
    .from(employees)
    .where(like(employees.email, `${EMAIL_PREFIX}%`));
  const empIds = empRows.map((e) => e.id);
  if (empIds.length > 0) {
    await db
      .update(documentNumberCounters)
      .set({ createdBy: null })
      .where(inArray(documentNumberCounters.createdBy, empIds));
    await db
      .update(documentNumberCounters)
      .set({ lastUpdatedBy: null })
      .where(inArray(documentNumberCounters.lastUpdatedBy, empIds));
  }
  await db.delete(employees).where(like(employees.email, `${EMAIL_PREFIX}%`));
});

describe("BR-SCO-03 expected return date uses the IST day", () => {
  async function create(expectedReturnDate: unknown) {
    const raw = await makeRaw(100);
    const fin = await makeFinished();
    await setClock(IST_0200_1_OCT_2026);
    const res = await call(
      "bo",
      "POST",
      "/sco/createsco",
      scoBody(raw, fin, expectedReturnDate),
    );
    if (res.status === 201) createdScoIds.push(res.json.data.sco.id);
    return res;
  }

  test("BR-SCO-03 at 02:00 IST on 1 Oct 2026, expected return 30 Sep 2026 -> 400", async () => {
    const res = await create("2026-09-30");
    expect(res.status).toBe(400);
  });

  test("BR-SCO-03 at 02:00 IST on 1 Oct 2026, expected return 1 Oct 2026 (today in IST) -> 201", async () => {
    const res = await create("2026-10-01");
    expect(res.status).toBe(201);
  });

  test("BR-SCO-03 at 02:00 IST on 1 Oct 2026, expected return 1 Oct 2027 (365 days) -> 201", async () => {
    const res = await create("2027-10-01");
    expect(res.status).toBe(201);
    expect(res.json.data.sco.status).toBe("draft");
  });

  test("BR-SCO-03 at 02:00 IST on 1 Oct 2026, expected return 2 Oct 2027 (366 days) -> 400", async () => {
    const res = await create("2027-10-02");
    expect(res.status).toBe(400);
  });

  test("BR-SCO-03 a timestamp on the IST day before today (23:59 IST, 30 Sep) -> 400", async () => {
    const res = await create("2026-09-30T18:29:00.000Z");
    expect(res.status).toBe(400);
  });

  test("BR-SCO-03 a timestamp at 00:00 IST on 1 Oct (today in IST) -> 201", async () => {
    const res = await create("2026-09-30T18:30:00.000Z");
    expect(res.status).toBe(201);
  });

  test("BR-SCO-03 expected return missing -> 400", async () => {
    const res = await create(undefined);
    expect(res.status).toBe(400);
  });
});

describe("BR-SCO-01 number period follows the IST day", () => {
  test("BR-SCO-01 SCOs made at 23:00 IST on 31 Mar and 00:30 IST on 1 Apr 2027 get different number periods", async () => {
    const raw = await makeRaw(100);
    const fin = await makeFinished();
    const farOut = "2027-12-31";

    await setClock(IST_2300_31_MAR_2027);
    const before = await call(
      "bo",
      "POST",
      "/sco/createsco",
      scoBody(raw, fin, farOut),
    );
    await setClock(IST_0030_1_APR_2027);
    const after = await call(
      "bo",
      "POST",
      "/sco/createsco",
      scoBody(raw, fin, farOut),
    );
    expect(before.status).toBe(201);
    expect(after.status).toBe(201);
    createdScoIds.push(before.json.data.sco.id, after.json.data.sco.id);

    const periodOf = (n: string) => n.replace(/^SCO-/, "").replace(/-\d+$/, "");
    const a = before.json.data.sco.scoNumber as string;
    const b = after.json.data.sco.scoNumber as string;
    expect(a).toMatch(/^SCO-.+-\d+$/);
    expect(b).toMatch(/^SCO-.+-\d+$/);
    expect(periodOf(a)).not.toBe(periodOf(b));
  });
});

describe("BR-SCO-09 challan date uses the IST day", () => {
  test("BR-SCO-09 at 02:00 IST on 1 Oct 2026, challan dated 1 Oct 2026 -> 201 numbered JWC/26-27/…", async () => {
    const { scoId, itemId } = await makeApprovedSco();
    await setClock(IST_0200_1_OCT_2026);
    const res = await challan(scoId, itemId, { challanDate: "2026-10-01" });
    expect(res.status).toBe(201);
    expect(res.json.data.challan.challanNumber).toMatch(/^JWC\/26-27\/\d+$/);
    expect(istDayOf(res.json.data.challan.challanDate)).toBe("2026-10-01");
  });

  test("BR-SCO-09 at 02:00 IST on 1 Oct 2026, challan dated 2 Oct 2026 -> 400 SCO_CHALLAN_DATE_FUTURE, nothing posts", async () => {
    const { raw, scoId, itemId } = await makeApprovedSco();
    await setClock(IST_0200_1_OCT_2026);
    const res = await challan(scoId, itemId, { challanDate: "2026-10-02" });
    expect(res.status).toBe(400);
    expect(res.json.code).toBe("SCO_CHALLAN_DATE_FUTURE");
    expect(await challanCount(scoId)).toBe(0);
    expect(await issueRowCount(raw)).toBe(0);
  });

  test("BR-SCO-09 a timestamp at 23:59 IST on 1 Oct (still today in IST) -> 201", async () => {
    const { scoId, itemId } = await makeApprovedSco();
    await setClock(IST_0200_1_OCT_2026);
    const res = await challan(scoId, itemId, {
      challanDate: "2026-10-01T18:29:00.000Z",
    });
    expect(res.status).toBe(201);
  });

  test("BR-SCO-09 a timestamp at 00:00 IST on 2 Oct (tomorrow in IST) -> 400 SCO_CHALLAN_DATE_FUTURE", async () => {
    const { raw, scoId, itemId } = await makeApprovedSco();
    await setClock(IST_0200_1_OCT_2026);
    const res = await challan(scoId, itemId, {
      challanDate: "2026-10-01T18:30:00.000Z",
    });
    expect(res.status).toBe(400);
    expect(res.json.code).toBe("SCO_CHALLAN_DATE_FUTURE");
    expect(await challanCount(scoId)).toBe(0);
    expect(await issueRowCount(raw)).toBe(0);
  });

  test("BR-SCO-09 at 02:00 IST on 1 Oct 2026, empty challan date -> today in IST, number JWC/26-27/…", async () => {
    const { scoId, itemId } = await makeApprovedSco();
    await setClock(IST_0200_1_OCT_2026);
    const res = await challan(scoId, itemId);
    expect(res.status).toBe(201);
    expect(istDayOf(res.json.data.challan.challanDate)).toBe("2026-10-01");
    expect(res.json.data.challan.challanNumber).toMatch(/^JWC\/26-27\/\d+$/);
  });

  test("BR-SCO-09 at 00:30 IST on 1 Apr 2027, challan dated 1 Apr 2027 -> 201 numbered JWC/27-28/…", async () => {
    const { scoId, itemId } = await makeApprovedSco();
    await setClock(IST_0030_1_APR_2027);
    const res = await challan(scoId, itemId, { challanDate: "2027-04-01" });
    expect(res.status).toBe(201);
    expect(res.json.data.challan.challanNumber).toMatch(/^JWC\/27-28\/\d+$/);
  });

  test("BR-SCO-09 at 00:30 IST on 1 Apr 2027, empty challan date -> JWC/27-28/… (FY follows the IST day)", async () => {
    const { scoId, itemId } = await makeApprovedSco();
    await setClock(IST_0030_1_APR_2027);
    const res = await challan(scoId, itemId);
    expect(res.status).toBe(201);
    expect(res.json.data.challan.challanNumber).toMatch(/^JWC\/27-28\/\d+$/);
    expect(istDayOf(res.json.data.challan.challanDate)).toBe("2027-04-01");
  });

  test("BR-SCO-09 at 00:30 IST on 1 Apr 2027, challan dated 31 Mar 2027 -> 201 numbered JWC/26-27/… (FY from the challan date)", async () => {
    const { scoId, itemId } = await makeApprovedSco();
    await setClock(IST_0030_1_APR_2027);
    const res = await challan(scoId, itemId, { challanDate: "2027-03-31" });
    expect(res.status).toBe(201);
    expect(res.json.data.challan.challanNumber).toMatch(/^JWC\/26-27\/\d+$/);
  });

  test("BR-SCO-09 at 00:30 IST on 1 Apr 2027, challan dated 2 Apr 2027 -> 400 SCO_CHALLAN_DATE_FUTURE", async () => {
    const { scoId, itemId } = await makeApprovedSco();
    await setClock(IST_0030_1_APR_2027);
    const res = await challan(scoId, itemId, { challanDate: "2027-04-02" });
    expect(res.status).toBe(400);
    expect(res.json.code).toBe("SCO_CHALLAN_DATE_FUTURE");
  });
});

describe("BR-SCO-11 due date and days left use the IST day", () => {
  test("BR-SCO-11 challan dated 1 Oct 2026 has return due date 1 Oct 2027", async () => {
    const { scoId, itemId } = await makeApprovedSco();
    await setClock(IST_0200_1_OCT_2026);
    const res = await challan(scoId, itemId, { challanDate: "2026-10-01" });
    expect(res.status).toBe(201);
    expect(istDayOf(res.json.data.challan.returnDueDate)).toBe("2027-10-01");
  });

  test("BR-SCO-11 challan 1 Oct 2026, at 02:00 IST on 15 Aug 2027 -> 47 days left (not 48), warning, in the SCO's challan list", async () => {
    const { scoId, itemId } = await makeApprovedSco();
    await setClock(IST_0200_1_OCT_2026);
    const made = await challan(scoId, itemId, { challanDate: "2026-10-01" });
    expect(made.status).toBe(201);

    await setClock(IST_0200_15_AUG_2027);
    const list = await call("bo", "GET", `/sco/${scoId}/challans`);
    expect(list.status).toBe(200);
    expect(list.json.data).toHaveLength(1);
    expect(list.json.data[0].daysLeft).toBe(47);
    expect(list.json.data[0].dueStatus).toBe("warning");
  });

  test("BR-SCO-11 challan 1 Oct 2026, at 02:00 IST on 15 Aug 2027 -> 47 days left, warning, in the open-challans list", async () => {
    const { scoId, itemId } = await makeApprovedSco();
    await setClock(IST_0200_1_OCT_2026);
    const made = await challan(scoId, itemId, { challanDate: "2026-10-01" });
    expect(made.status).toBe(201);

    await setClock(IST_0200_15_AUG_2027);
    const open = await call("bo", "GET", `/sco/challans/open?scoId=${scoId}`);
    expect(open.status).toBe(200);
    expect(open.json.data).toHaveLength(1);
    expect(open.json.data[0].daysLeft).toBe(47);
    expect(open.json.data[0].dueStatus).toBe("warning");
  });

  test("BR-SCO-11 days left counts whole IST days: 1 Oct 2027 02:00 IST is 0 days left; the day after it is overdue", async () => {
    const { scoId, itemId } = await makeApprovedSco();
    await setClock(IST_0200_1_OCT_2026);
    const made = await challan(scoId, itemId, { challanDate: "2026-10-01" });
    expect(made.status).toBe(201);

    await setClock("2027-09-30T20:30:00.000Z"); // 02:00 IST, 1 Oct 2027
    const due = await call("bo", "GET", `/sco/${scoId}/challans`);
    expect(due.json.data[0].daysLeft).toBe(0);
    expect(due.json.data[0].dueStatus).toBe("warning");

    await setClock("2027-10-01T20:30:00.000Z"); // 02:00 IST, 2 Oct 2027
    const late = await call("bo", "GET", `/sco/${scoId}/challans`);
    expect(late.json.data[0].daysLeft).toBe(-1);
    expect(late.json.data[0].dueStatus).toBe("overdue");
  });

  test("BR-SCO-11 an overdue challan blocks nothing at 02:00 IST: a new challan to the same vendor is ok", async () => {
    const { scoId, itemId } = await makeApprovedSco();
    await setClock(IST_0200_1_OCT_2026);
    const old = await challan(scoId, itemId, { challanDate: "2025-01-01" });
    expect(old.status).toBe(201);
    const fresh = await challan(scoId, itemId, { challanDate: "2026-10-01" });
    expect(fresh.status).toBe(201);
  });
});
