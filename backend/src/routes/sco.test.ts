/**
 * HTTP-level tests for Subcontracting Order (SCO) creation, edit, submit,
 * cancel and permissions: BR-SCO-01..06, 20, 21, 23 (docs/specs/subcontracting.md v2).
 * Runs through the real app (middleware + routers + onError) against the test DB.
 * Fixtures are TEST_sco_ prefixed and removed in afterAll.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray, like } from "drizzle-orm";
import { createApp } from "../app";
import { db } from "../db/client";
import { roles } from "../db/schemas/01_auth";
import {
  approvalRequests,
  approvalTrails,
} from "../db/schemas/02_procurement-approval";
import {
  itemMaster,
  serviceMaster,
} from "../db/schemas/02_procurement-catalog";
import {
  subcontractingOrderItems,
  subcontractingOrders,
} from "../db/schemas/02_procurement-purchasing";
import {
  supplierMaster,
  supplierServices,
} from "../db/schemas/02_procurement-suppliers";
import { employees } from "../db/schemas/03_hcm";
import { authService } from "../service/authService";

const app = createApp();
const PREFIX = "TEST_sco_";
const EMAIL_PREFIX = "test_sco_";
const PASSWORD = "sco-test-password-123";

type Actor = { id: number; token: string };
const actors: Record<string, Actor> = {};

let vendorId: number; // service_provider, active
let bothVendorId: number; // type both, active
let rawMaterialVendorId: number;
let inactiveVendorId: number;
let rawItemId: number;
let finishedItemId: number;
let inactiveItemId: number;
let serviceId: number;
let otherServiceId: number; // exists but not on vendor's list
let inactiveServiceId: number; // on vendor's list but inactive

const createdScoIds: number[] = [];

function requireRow<T>(row: T | undefined, what: string): T {
  if (!row) throw new Error(`Fixture setup: ${what} returned no row`);
  return row;
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
  actors[key] = {
    id: requireRow(emp, `employee ${key}`).id,
    token: accessToken,
  };
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
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

function line(overrides: Record<string, unknown> = {}) {
  return {
    rawItemId,
    finishedItemId,
    serviceId,
    rawQtyToIssue: 1000,
    expectedReturnQty: 1000,
    ...overrides,
  };
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    vendorId,
    expectedReturnDate: daysFromNow(30),
    lines: [line()],
    ...overrides,
  };
}

async function createSco(
  actor = "bo",
  overrides: Record<string, unknown> = {},
) {
  const res = await call(actor, "POST", "/sco/createsco", payload(overrides));
  if (res.status === 201) createdScoIds.push(res.json.data.sco.id);
  return res;
}

beforeAll(async () => {
  await makeActor("owner", "owner");
  await makeActor("bo", "back_office");
  await makeActor("bo2", "back_office");
  await makeActor("fs", "floor_supervisor");
  await makeActor("qa", "qa_inspector");

  const insertVendor = async (
    name: string,
    type: "service_provider" | "both" | "raw_material",
    isActive = true,
  ) => {
    const [v] = await db
      .insert(supplierMaster)
      .values({ name: `${PREFIX}${name}`, type, isActive })
      .returning({ id: supplierMaster.id });
    return requireRow(v, `vendor ${name}`).id;
  };
  vendorId = await insertVendor("Sai CNC", "service_provider");
  bothVendorId = await insertVendor("Both Vendor", "both");
  rawMaterialVendorId = await insertVendor("Raw Vendor", "raw_material");
  inactiveVendorId = await insertVendor(
    "Inactive Vendor",
    "service_provider",
    false,
  );
  await insertVendor("Other Vendor", "service_provider");

  const insertItem = async (sku: string, isActive = true) => {
    const [i] = await db
      .insert(itemMaster)
      .values({
        sku: `${PREFIX}${sku}`,
        name: `${PREFIX}${sku}`,
        category: "Raw Material",
        uom: "pcs",
        averageCostPaise: 12_000,
        isActive,
      })
      .returning({ id: itemMaster.id });
    return requireRow(i, `item ${sku}`).id;
  };
  rawItemId = await insertItem("HSG-RC");
  finishedItemId = await insertItem("HSG-MC");
  inactiveItemId = await insertItem("HSG-OLD", false);

  const insertService = async (code: string, isActive = true) => {
    const [s] = await db
      .insert(serviceMaster)
      .values({
        code: `${PREFIX}${code}`,
        name: `${PREFIX}${code}`,
        defaultUom: "pcs",
        isActive,
      })
      .returning({ id: serviceMaster.id });
    return requireRow(s, `service ${code}`).id;
  };
  serviceId = await insertService("CNC");
  otherServiceId = await insertService("PLATING");
  inactiveServiceId = await insertService("HEAT");

  await db.insert(supplierServices).values([
    {
      supplierId: vendorId,
      serviceId,
      serviceUnitPricePaise: 2_500,
      taxPercentage: 18,
    },
    {
      supplierId: vendorId,
      serviceId: inactiveServiceId,
      serviceUnitPricePaise: 900,
      taxPercentage: 18,
      isActive: false,
    },
    {
      supplierId: bothVendorId,
      serviceId,
      serviceUnitPricePaise: 2_500,
      taxPercentage: 18,
    },
    {
      supplierId: rawMaterialVendorId,
      serviceId,
      serviceUnitPricePaise: 2_500,
      taxPercentage: 18,
    },
    {
      supplierId: inactiveVendorId,
      serviceId,
      serviceUnitPricePaise: 2_500,
      taxPercentage: 18,
    },
  ]);
});

afterAll(async () => {
  if (createdScoIds.length > 0) {
    const reqs = await db
      .select({ id: approvalRequests.id })
      .from(approvalRequests)
      .where(inArray(approvalRequests.docId, createdScoIds));
    const reqIds = reqs.map((r) => r.id);
    if (reqIds.length > 0) {
      await db
        .delete(approvalTrails)
        .where(inArray(approvalTrails.requestId, reqIds));
      await db
        .delete(approvalRequests)
        .where(inArray(approvalRequests.id, reqIds));
    }
    await db
      .delete(subcontractingOrderItems)
      .where(inArray(subcontractingOrderItems.scoId, createdScoIds));
    await db
      .delete(subcontractingOrders)
      .where(inArray(subcontractingOrders.id, createdScoIds));
  }
  const vendorRows = await db
    .select({ id: supplierMaster.id })
    .from(supplierMaster)
    .where(like(supplierMaster.name, `${PREFIX}%`));
  const vendorIds = vendorRows.map((v) => v.id);
  if (vendorIds.length > 0) {
    await db
      .delete(supplierServices)
      .where(inArray(supplierServices.supplierId, vendorIds));
    await db
      .delete(supplierMaster)
      .where(inArray(supplierMaster.id, vendorIds));
  }
  await db.delete(serviceMaster).where(like(serviceMaster.code, `${PREFIX}%`));
  await db.delete(itemMaster).where(like(itemMaster.sku, `${PREFIX}%`));
  await db.delete(employees).where(like(employees.email, `${EMAIL_PREFIX}%`));
});

describe("BR-SCO-01 create", () => {
  test("BR-SCO-01 creates a draft owned by the caller with an SCO-<period>-<seq> number", async () => {
    const res = await createSco("bo");
    expect(res.status).toBe(201);
    expect(res.json.success).toBe(true);
    const { sco, items } = res.json.data;
    expect(sco.status).toBe("draft");
    expect(sco.createdBy).toBe(actors.bo?.id);
    expect(sco.scoNumber).toMatch(/^SCO-.+-\d+$/);
    expect(sco.vendorId).toBe(vendorId);
    expect(items).toHaveLength(1);
  });

  test("BR-SCO-01 numbers are never reused", async () => {
    const a = await createSco("bo");
    const b = await createSco("bo");
    expect(a.json.data.sco.scoNumber).not.toBe(b.json.data.sco.scoNumber);
  });

  test("BR-SCO-01 a vendor of type 'both' is accepted", async () => {
    const res = await createSco("bo", { vendorId: bothVendorId });
    expect(res.status).toBe(201);
  });

  test("BR-SCO-01 vendor of type raw_material -> 400", async () => {
    const res = await createSco("bo", { vendorId: rawMaterialVendorId });
    expect(res.status).toBe(400);
    expect(res.json.success).toBe(false);
  });

  test("BR-SCO-01 inactive vendor -> 400", async () => {
    const res = await createSco("bo", { vendorId: inactiveVendorId });
    expect(res.status).toBe(400);
  });

  test("BR-SCO-01 no lines -> 400", async () => {
    const res = await createSco("bo", { lines: [] });
    expect(res.status).toBe(400);
  });

  test("BR-SCO-01 unknown vendor -> 404", async () => {
    const res = await createSco("bo", { vendorId: 999_999_999 });
    expect(res.status).toBe(404);
  });
});

describe("BR-SCO-02 lines", () => {
  test("BR-SCO-02 price and GST are copied from the vendor's service list when omitted", async () => {
    const res = await createSco("bo");
    const item = res.json.data.items[0];
    expect(item.serviceUnitPricePaise).toBe(2_500);
    expect(item.serviceTaxPercentage).toBe(18);
    expect(item.rawQtyToIssue).toBe(1000);
    expect(item.expectedReturnQty).toBe(1000);
  });

  test("BR-SCO-02 price and GST are editable when given explicitly", async () => {
    const res = await createSco("bo", {
      lines: [line({ serviceUnitPricePaise: 3_000, serviceTaxPercentage: 12 })],
    });
    expect(res.status).toBe(201);
    const item = res.json.data.items[0];
    expect(item.serviceUnitPricePaise).toBe(3_000);
    expect(item.serviceTaxPercentage).toBe(12);
  });

  test("BR-SCO-02 same raw and finished item -> 400", async () => {
    const res = await createSco("bo", {
      lines: [line({ finishedItemId: rawItemId })],
    });
    expect(res.status).toBe(400);
  });

  test("BR-SCO-02 inactive raw item -> 400", async () => {
    const res = await createSco("bo", {
      lines: [line({ rawItemId: inactiveItemId })],
    });
    expect(res.status).toBe(400);
  });

  test("BR-SCO-02 inactive finished item -> 400", async () => {
    const res = await createSco("bo", {
      lines: [line({ finishedItemId: inactiveItemId })],
    });
    expect(res.status).toBe(400);
  });

  test("BR-SCO-02 service not on the vendor's list -> 400", async () => {
    const res = await createSco("bo", {
      lines: [line({ serviceId: otherServiceId })],
    });
    expect(res.status).toBe(400);
  });

  test("BR-SCO-02 service on the vendor's list but inactive -> 400", async () => {
    const res = await createSco("bo", {
      lines: [line({ serviceId: inactiveServiceId })],
    });
    expect(res.status).toBe(400);
  });

  test("BR-SCO-02 fractional send qty (10.5) -> 400", async () => {
    const res = await createSco("bo", {
      lines: [line({ rawQtyToIssue: 10.5 })],
    });
    expect(res.status).toBe(400);
  });

  test("BR-SCO-02 fractional return qty -> 400", async () => {
    const res = await createSco("bo", {
      lines: [line({ expectedReturnQty: 0.5 })],
    });
    expect(res.status).toBe(400);
  });

  test("BR-SCO-02 zero send qty -> 400", async () => {
    const res = await createSco("bo", { lines: [line({ rawQtyToIssue: 0 })] });
    expect(res.status).toBe(400);
  });

  test("BR-SCO-02 zero return qty -> 400", async () => {
    const res = await createSco("bo", {
      lines: [line({ expectedReturnQty: 0 })],
    });
    expect(res.status).toBe(400);
  });

  test("BR-SCO-02 unknown item -> 404", async () => {
    const res = await createSco("bo", {
      lines: [line({ rawItemId: 999_999_999 })],
    });
    expect(res.status).toBe(404);
  });
});

describe("BR-SCO-03 expected return date", () => {
  test("BR-SCO-03 date 400 days away -> 400", async () => {
    const res = await createSco("bo", { expectedReturnDate: daysFromNow(400) });
    expect(res.status).toBe(400);
  });

  test("BR-SCO-03 date before today -> 400", async () => {
    const res = await createSco("bo", { expectedReturnDate: daysFromNow(-2) });
    expect(res.status).toBe(400);
  });

  test("BR-SCO-03 date is required -> 400", async () => {
    const res = await call("bo", "POST", "/sco/createsco", {
      vendorId,
      lines: [line()],
    });
    expect(res.status).toBe(400);
  });

  test("BR-SCO-03 a date inside the window is accepted", async () => {
    const res = await createSco("bo", { expectedReturnDate: daysFromNow(300) });
    expect(res.status).toBe(201);
  });
});

describe("BR-SCO-04 value and GST", () => {
  test("BR-SCO-04 1000 x 2,500 paise -> subtotal 25,000 rupees, GST 4,500, total 29,500 (paise)", async () => {
    const res = await createSco("bo");
    const { sco, items } = res.json.data;
    expect(sco.subtotalPaise).toBe(2_500_000);
    expect(sco.taxAmountPaise).toBe(450_000);
    expect(sco.totalAmountPaise).toBe(2_950_000);
    expect(items[0].lineValuePaise).toBe(2_500_000);
    expect(items[0].lineTaxPaise).toBe(450_000);
  });

  test("BR-SCO-04 value is priced on return qty, not send qty", async () => {
    const res = await createSco("bo", {
      lines: [line({ rawQtyToIssue: 2000, expectedReturnQty: 1000 })],
    });
    expect(res.json.data.sco.subtotalPaise).toBe(2_500_000);
  });

  test("BR-SCO-04 value is the sum over lines", async () => {
    const res = await createSco("bo", {
      lines: [line(), line({ expectedReturnQty: 200, rawQtyToIssue: 200 })],
    });
    expect(res.json.data.sco.subtotalPaise).toBe(2_500_000 + 500_000);
    expect(res.json.data.sco.totalAmountPaise).toBe(2_950_000 + 590_000);
  });

  test("BR-SCO-04 details endpoint returns the same totals", async () => {
    const created = await createSco("bo");
    const id = created.json.data.sco.id;
    const res = await call("bo", "GET", `/sco/getscodetails/${id}`);
    expect(res.status).toBe(200);
    expect(res.json.data.sco.totalAmountPaise).toBe(2_950_000);
    expect(res.json.data.items).toHaveLength(1);
  });
});

describe("BR-SCO-05 edit only in draft", () => {
  test("BR-SCO-05 a draft can be edited (lines replaced, totals recomputed)", async () => {
    const created = await createSco("bo");
    const id = created.json.data.sco.id;
    const res = await call("bo", "PATCH", "/sco/updatesco", {
      scoId: id,
      notes: "updated",
      lines: [line({ serviceUnitPricePaise: 3_000 })],
    });
    expect(res.status).toBe(200);
    expect(res.json.data.sco.notes).toBe("updated");
    expect(res.json.data.items).toHaveLength(1);
    expect(res.json.data.sco.subtotalPaise).toBe(3_000_000);
  });

  test("BR-SCO-05 a status key in the edit body -> 400 and status unchanged", async () => {
    const created = await createSco("bo");
    const id = created.json.data.sco.id;
    const res = await call("bo", "PATCH", "/sco/updatesco", {
      scoId: id,
      status: "approved",
    });
    expect(res.status).toBe(400);
    const after = await call("bo", "GET", `/sco/getscodetails/${id}`);
    expect(after.json.data.sco.status).toBe("draft");
  });

  test("BR-SCO-05 editing a submitted (non-draft) SCO -> 409", async () => {
    const created = await createSco("bo");
    const id = created.json.data.sco.id;
    const submit = await call("bo", "POST", `/sco/${id}/submit`);
    expect(submit.status).toBe(200);
    const res = await call("bo", "PATCH", "/sco/updatesco", {
      scoId: id,
      lines: [line({ serviceUnitPricePaise: 9_999 })],
    });
    expect(res.status).toBe(409);
  });

  test("BR-SCO-05 editing an unknown SCO -> 404", async () => {
    const res = await call("bo", "PATCH", "/sco/updatesco", {
      scoId: 999_999_999,
      notes: "x",
    });
    expect(res.status).toBe(404);
  });
});

describe("BR-SCO-06 submit", () => {
  test("BR-SCO-06 the creator submits: result is pending_approval or approved (no chain)", async () => {
    const created = await createSco("bo");
    const id = created.json.data.sco.id;
    const res = await call("bo", "POST", `/sco/${id}/submit`);
    expect(res.status).toBe(200);
    expect(["pending_approval", "approved"]).toContain(
      res.json.data.sco.status,
    );
  });

  test("BR-SCO-06 only the creator submits: another back_office user -> 403, SCO stays draft", async () => {
    const created = await createSco("bo");
    const id = created.json.data.sco.id;
    const res = await call("bo2", "POST", `/sco/${id}/submit`);
    expect(res.status).toBe(403);
    const after = await call("bo", "GET", `/sco/getscodetails/${id}`);
    expect(after.json.data.sco.status).toBe("draft");
  });

  test("BR-SCO-06 submitting twice -> 409", async () => {
    const created = await createSco("bo");
    const id = created.json.data.sco.id;
    await call("bo", "POST", `/sco/${id}/submit`);
    const res = await call("bo", "POST", `/sco/${id}/submit`);
    expect(res.status).toBe(409);
  });

  test("BR-SCO-06 submitting an unknown SCO -> 404", async () => {
    const res = await call("bo", "POST", "/sco/999999999/submit");
    expect(res.status).toBe(404);
  });
});

describe("BR-SCO-20 cancel", () => {
  test("BR-SCO-20 a draft is cancelled with a reason; who, when, why are stored", async () => {
    const created = await createSco("bo");
    const id = created.json.data.sco.id;
    const res = await call("bo", "POST", `/sco/${id}/cancel`, {
      reason: "vendor down",
    });
    expect(res.status).toBe(200);
    const { sco } = res.json.data;
    expect(sco.status).toBe("cancelled");
    expect(sco.cancelReason).toBe("vendor down");
    expect(sco.cancelledBy).toBe(actors.bo?.id);
    expect(sco.cancelledAt).toBeTruthy();
  });

  test("BR-SCO-20 a submitted SCO can be cancelled and its open approval request is cancelled too", async () => {
    const created = await createSco("bo");
    const id = created.json.data.sco.id;
    const submit = await call("bo", "POST", `/sco/${id}/submit`);
    expect(submit.status).toBe(200);
    const res = await call("bo", "POST", `/sco/${id}/cancel`, {
      reason: "vendor down",
    });
    expect(res.status).toBe(200);
    expect(res.json.data.sco.status).toBe("cancelled");
    const open = (
      await db
        .select({
          status: approvalRequests.status,
          docType: approvalRequests.docType,
        })
        .from(approvalRequests)
        .where(eq(approvalRequests.docId, id))
    ).filter((r) => r.docType === "sco" && r.status === "pending_approval");
    expect(open).toHaveLength(0);
  });

  test("BR-SCO-20 missing reason -> 400 SCO_CANCEL_REASON_REQUIRED, draft included", async () => {
    const created = await createSco("bo");
    const id = created.json.data.sco.id;
    const res = await call("bo", "POST", `/sco/${id}/cancel`, {});
    expect(res.status).toBe(400);
    expect(res.json.code).toBe("SCO_CANCEL_REASON_REQUIRED");
    const after = await call("bo", "GET", `/sco/getscodetails/${id}`);
    expect(after.json.data.sco.status).toBe("draft");
  });

  test("BR-SCO-20 reason shorter than 3 chars -> 400", async () => {
    const created = await createSco("bo");
    const id = created.json.data.sco.id;
    const res = await call("bo", "POST", `/sco/${id}/cancel`, { reason: "ab" });
    expect(res.status).toBe(400);
  });

  test("BR-SCO-20 reason longer than 500 chars -> 400", async () => {
    const created = await createSco("bo");
    const id = created.json.data.sco.id;
    const res = await call("bo", "POST", `/sco/${id}/cancel`, {
      reason: "x".repeat(501),
    });
    expect(res.status).toBe(400);
  });

  test("BR-SCO-20 cancelling a cancelled SCO -> 409", async () => {
    const created = await createSco("bo");
    const id = created.json.data.sco.id;
    await call("bo", "POST", `/sco/${id}/cancel`, { reason: "vendor down" });
    const res = await call("bo", "POST", `/sco/${id}/cancel`, {
      reason: "again please",
    });
    expect(res.status).toBe(409);
  });

  test("BR-SCO-20 after material has gone out (material_issued) -> 409, status unchanged", async () => {
    const created = await createSco("bo");
    const id = created.json.data.sco.id;
    // No challan endpoint in this slice: put the fixture in the issued state directly.
    await db
      .update(subcontractingOrders)
      .set({ status: "material_issued" })
      .where(eq(subcontractingOrders.id, id));
    const res = await call("bo", "POST", `/sco/${id}/cancel`, {
      reason: "vendor down",
    });
    expect(res.status).toBe(409);
    const after = await call("bo", "GET", `/sco/getscodetails/${id}`);
    expect(after.json.data.sco.status).toBe("material_issued");
  });

  test("BR-SCO-20 unknown SCO -> 404", async () => {
    const res = await call("bo", "POST", "/sco/999999999/cancel", {
      reason: "vendor down",
    });
    expect(res.status).toBe(404);
  });
});

describe("BR-SCO-21 never deleted", () => {
  test("BR-SCO-21 an SCO cannot be deleted through the API", async () => {
    const created = await createSco("bo");
    const id = created.json.data.sco.id;
    const res = await call("owner", "DELETE", `/sco/${id}`);
    expect(res.status).toBeGreaterThanOrEqual(400);
    const after = await call("bo", "GET", `/sco/getscodetails/${id}`);
    expect(after.status).toBe(200);
  });

  test("BR-SCO-21 a cancelled SCO stays in the register", async () => {
    const created = await createSco("bo");
    const id = created.json.data.sco.id;
    await call("bo", "POST", `/sco/${id}/cancel`, { reason: "vendor down" });
    const res = await call("bo", "GET", `/sco/getscodetails/${id}`);
    expect(res.status).toBe(200);
    expect(res.json.data.sco.status).toBe("cancelled");
  });
});

describe("BR-SCO-23 permissions", () => {
  test("BR-SCO-23 no token -> 401", async () => {
    const res = await call(null, "GET", "/sco/getscos");
    expect(res.status).toBe(401);
  });

  test("BR-SCO-23 floor_supervisor cannot create -> 403, nothing saved", async () => {
    const before = await db
      .select({ id: subcontractingOrders.id })
      .from(subcontractingOrders);
    const res = await call("fs", "POST", "/sco/createsco", payload());
    expect(res.status).toBe(403);
    const after = await db
      .select({ id: subcontractingOrders.id })
      .from(subcontractingOrders);
    expect(after.length).toBe(before.length);
  });

  test("BR-SCO-23 qa_inspector cannot create -> 403", async () => {
    const res = await call("qa", "POST", "/sco/createsco", payload());
    expect(res.status).toBe(403);
  });

  test("BR-SCO-23 floor_supervisor cannot edit -> 403, SCO unchanged", async () => {
    const created = await createSco("bo");
    const id = created.json.data.sco.id;
    const res = await call("fs", "PATCH", "/sco/updatesco", {
      scoId: id,
      notes: "hacked",
    });
    expect(res.status).toBe(403);
    const after = await call("bo", "GET", `/sco/getscodetails/${id}`);
    expect(after.json.data.sco.notes).not.toBe("hacked");
  });

  test("BR-SCO-23 qa_inspector cannot submit -> 403", async () => {
    const created = await createSco("bo");
    const id = created.json.data.sco.id;
    const res = await call("qa", "POST", `/sco/${id}/submit`);
    expect(res.status).toBe(403);
  });

  test("BR-SCO-23 floor_supervisor cannot cancel -> 403, status unchanged", async () => {
    const created = await createSco("bo");
    const id = created.json.data.sco.id;
    const res = await call("fs", "POST", `/sco/${id}/cancel`, {
      reason: "vendor down",
    });
    expect(res.status).toBe(403);
    const after = await call("bo", "GET", `/sco/getscodetails/${id}`);
    expect(after.json.data.sco.status).toBe("draft");
  });

  test("BR-SCO-23 floor_supervisor and qa_inspector can view (sco.view)", async () => {
    const created = await createSco("bo");
    const id = created.json.data.sco.id;
    for (const who of ["fs", "qa", "owner", "bo"]) {
      const list = await call(who, "GET", "/sco/getscos");
      expect(list.status).toBe(200);
      const details = await call(who, "GET", `/sco/getscodetails/${id}`);
      expect(details.status).toBe(200);
    }
  });

  test("BR-SCO-23 owner can create (owner holds sco.manage)", async () => {
    const res = await createSco("owner");
    expect(res.status).toBe(201);
    expect(res.json.data.sco.createdBy).toBe(actors.owner?.id);
  });
});

describe("SCO list", () => {
  test("list filters by status and vendor, and paginates", async () => {
    const created = await createSco("bo", { vendorId: bothVendorId });
    const id = created.json.data.sco.id;
    const res = await call(
      "bo",
      "GET",
      `/sco/getscos?status=draft&vendorId=${bothVendorId}&pageSize=100`,
    );
    expect(res.status).toBe(200);
    expect(res.json.meta.page).toBe(1);
    // biome-ignore lint/suspicious/noExplicitAny: test reads arbitrary JSON
    const ids = res.json.data.map((s: any) => s.id);
    expect(ids).toContain(id);
    // biome-ignore lint/suspicious/noExplicitAny: test reads arbitrary JSON
    for (const s of res.json.data as any[]) {
      expect(s.status).toBe("draft");
      expect(s.vendorId).toBe(bothVendorId);
    }
  });

  test("details of an unknown SCO -> 404", async () => {
    const res = await call("bo", "GET", "/sco/getscodetails/999999999");
    expect(res.status).toBe(404);
  });
});
