/**
 * docs/specs/approval-policies.md (v1)
 * BR-APR-01 access            BR-APR-02 header checks       BR-APR-03 chain steps
 * BR-APR-05 auto-approve      BR-APR-06 amount limits       BR-APR-07 one active per slot
 * BR-APR-08 partial edit      BR-APR-09 null clears         BR-APR-10 empty edit
 * BR-APR-11 docType fixed     BR-APR-13 in-flight safe      BR-APR-14 audit stamps
 * BR-APR-15 no sale-order flag BR-APR-16 candidates         BR-APR-18 amount band
 * BR-APR-19 specificity       BR-APR-21 what is matched     BR-APR-22 fallback
 *
 * HTTP-level through createApp(), real DB, real logins. Written by test-writer from the spec only.
 * Not covered here:
 *  - BR-APR-57..60 (form behaviour): frontend, belongs to the manual UI checklist.
 *  - BR-APR-01 "screen shows Create/Edit only to holders": frontend.
 *  - BR-APR-19 "tie: lower policy id wins": unreachable through the API. Two active policies at the
 *    same level would need the same (priority, doc type, category), which BR-APR-07 forbids.
 *  - BR-APR-21 SCO row: the subcontracting order module (M2) does not exist yet.
 *
 * Isolation: other active policies in the DB are switched off in beforeAll and switched back on in
 * afterAll, so matching is decided only by the TEST_aprpol_ policies of each test.
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { eq, inArray, like } from "drizzle-orm";
import { createApp } from "../app";
import { db } from "../db/client";
import {
  documentNumberCounters,
  rolePermissions,
  roles,
} from "../db/schemas/01_auth";
import {
  approvalPolicies,
  approvalRequests,
  approvalTrails,
} from "../db/schemas/02_procurement-approval";
import { itemMaster, machines } from "../db/schemas/02_procurement-catalog";
import {
  poCommunications,
  prPoItemLinks,
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequestItems,
  purchaseRequests,
} from "../db/schemas/02_procurement-purchasing";
import { supplierMaster } from "../db/schemas/02_procurement-suppliers";
import { employees } from "../db/schemas/03_hcm";
import { authService } from "../service/authService";

const app = createApp();
const PREFIX = "test_aprpol_";
const NAME = "TEST_aprpol_";
const PASSWORD = "aprpol-password-123";

const emp = {} as Record<string, number>;
const token = {} as Record<string, string>;
let machineId: number;
let itemId: number;
let supplierId: number;
let deactivatedIds: number[] = [];
let seq = 0;

type Json = Record<string, unknown> & {
  data?: Record<string, unknown>;
  code?: string;
};
const json = async (res: Response): Promise<Json> => (await res.json()) as Json;

function call(
  tag: string | null,
  method: string,
  path: string,
  body?: unknown,
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (tag) headers.Authorization = `Bearer ${token[tag]}`;
  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  return app.request(path, init);
}

async function makeRole(name: string, keys: string[]) {
  const [r] = await db
    .insert(roles)
    .values({ name: `${PREFIX}${name}`, isSystem: false })
    .returning({ id: roles.id });
  if (!r) throw new Error("Fixture setup: role insert failed");
  if (keys.length > 0) {
    await db
      .insert(rolePermissions)
      .values(keys.map((permissionKey) => ({ roleId: r.id, permissionKey })));
  }
  return r.id;
}

async function makeUser(tag: string, roleId: number, login = true) {
  const email = `${PREFIX}${tag}@diecast.test`;
  const [e] = await db
    .insert(employees)
    .values({
      name: `TEST_aprpol_${tag}`,
      email,
      passwordHash: await Bun.password.hash(PASSWORD),
      roleId,
      isActive: true,
    })
    .returning({ id: employees.id });
  if (!e) throw new Error("Fixture setup: employee insert failed");
  emp[tag] = e.id;
  if (login) {
    token[tag] = (await authService.login(email, PASSWORD)).accessToken;
  }
}

const OWNER_STEP = { level: 1, approverType: "role", role: "owner" } as const;

function body(over: Record<string, unknown> = {}) {
  seq += 1;
  return {
    name: `${NAME}p${seq}`,
    priority: 1,
    docType: "pr",
    subDocType: "tooling",
    approvalChain: [OWNER_STEP],
    ...over,
  };
}

const createPolicy = (tag: string, over: Record<string, unknown> = {}) =>
  call(tag, "POST", "/api/approval/createPolicy", body(over));
const patchPolicy = (tag: string, id: number, b: unknown) =>
  call(tag, "PATCH", `/api/approval/updatePolicy/${id}`, b);
const getPolicy = (tag: string, id: number) =>
  call(tag, "GET", `/api/approval/getPolicyDetails/${id}`);

async function createOk(over: Record<string, unknown> = {}) {
  const res = await createPolicy("super", over);
  if (res.status !== 201) {
    throw new Error(
      `Fixture setup: createPolicy -> ${res.status} ${JSON.stringify(await res.json())}`,
    );
  }
  return (await json(res)).data as Record<string, unknown> & { id: number };
}

async function policyRow(id: number) {
  const [r] = await db
    .select()
    .from(approvalPolicies)
    .where(eq(approvalPolicies.id, id));
  return r;
}

/** Insert an active policy straight into the DB (matching tests). Amounts in paise. */
async function insPolicy(o: {
  docType: "pr" | "po" | "sco";
  cat?: string;
  min?: number | null;
  max?: number | null;
  priority: number;
  chain?: unknown[];
  isActive?: boolean;
}): Promise<number> {
  seq += 1;
  const chain = o.chain ?? [OWNER_STEP];
  const [p] = await db
    .insert(approvalPolicies)
    .values({
      name: `${NAME}m${seq}`,
      isActive: o.isActive ?? true,
      priority: o.priority,
      docType: o.docType,
      subDocType: (o.cat ?? "any") as "any",
      minAmountPaise: o.min ?? null,
      maxAmountPaise: o.max ?? null,
      autoApprove: false,
      approvalLevels: chain.length,
      approvalChain: chain as never,
      createdBy: emp.super as number,
      lastUpdatedBy: emp.super as number,
    })
    .returning({ id: approvalPolicies.id });
  if (!p) throw new Error("Fixture setup: policy insert failed");
  return p.id;
}

async function resetPolicies() {
  await db
    .update(approvalPolicies)
    .set({ isActive: false })
    .where(like(approvalPolicies.name, `${NAME}%`));
}

/** Creates a PR (via the API) of the given type whose estimate is exactly `paise`, then submits it. */
async function submitPr(type: string, paise: number, submitter = "req") {
  await db
    .update(itemMaster)
    .set({ averageCostPaise: paise })
    .where(eq(itemMaster.id, itemId));
  const extra: Record<string, unknown> =
    type === "maintenance"
      ? { assetId: machineId }
      : type === "sale_order"
        ? { saleOrderId: 42 }
        : {};
  const cr = await call("req", "POST", "/api/pr/createpr", {
    type,
    notes: "TEST_aprpol note",
    items: [{ itemId, requestedQty: 1 }],
    ...extra,
  });
  if (cr.status !== 201) {
    throw new Error(`Fixture setup: createpr -> ${cr.status}`);
  }
  const prId = ((await json(cr)).data as { pr: { id: number } }).pr.id;
  const res = await call(submitter, "POST", "/api/approval/submitRequest", {
    docType: "pr",
    docId: prId,
  });
  return { res, prId };
}

async function matchedPolicy(type: string, paise: number) {
  const { res } = await submitPr(type, paise);
  expect(res.status).toBe(201);
  return (await json(res)).data as {
    id: number;
    policyId: number;
    totalLevels: number;
    chainSnapshot: unknown[];
    status: string;
    currentLevel: number;
  };
}

async function cleanup() {
  const ids = (
    await db
      .select({ id: employees.id })
      .from(employees)
      .where(like(employees.email, `${PREFIX}%`))
  ).map((e) => e.id);
  if (ids.length > 0) {
    const reqIds = (
      await db
        .select({ id: approvalRequests.id })
        .from(approvalRequests)
        .where(inArray(approvalRequests.requestedBy, ids))
    ).map((r) => r.id);
    if (reqIds.length > 0) {
      await db
        .delete(approvalTrails)
        .where(inArray(approvalTrails.requestId, reqIds));
      await db
        .delete(approvalRequests)
        .where(inArray(approvalRequests.id, reqIds));
    }
    const poIds = (
      await db
        .select({ id: purchaseOrders.id })
        .from(purchaseOrders)
        .where(eq(purchaseOrders.supplierId, supplierId ?? -1))
    ).map((p) => p.id);
    if (poIds.length > 0) {
      const poItemIds = (
        await db
          .select({ id: purchaseOrderItems.id })
          .from(purchaseOrderItems)
          .where(inArray(purchaseOrderItems.poId, poIds))
      ).map((p) => p.id);
      if (poItemIds.length > 0) {
        await db
          .delete(prPoItemLinks)
          .where(inArray(prPoItemLinks.poItemId, poItemIds));
      }
      await db
        .delete(poCommunications)
        .where(inArray(poCommunications.poId, poIds));
      await db
        .delete(purchaseOrderItems)
        .where(inArray(purchaseOrderItems.poId, poIds));
      await db.delete(purchaseOrders).where(inArray(purchaseOrders.id, poIds));
    }
    const prIds = (
      await db
        .select({ id: purchaseRequests.id })
        .from(purchaseRequests)
        .where(inArray(purchaseRequests.requestedBy, ids))
    ).map((p) => p.id);
    if (prIds.length > 0) {
      await db
        .delete(purchaseRequestItems)
        .where(inArray(purchaseRequestItems.prId, prIds));
      await db
        .delete(purchaseRequests)
        .where(inArray(purchaseRequests.id, prIds));
    }
    await db
      .delete(documentNumberCounters)
      .where(inArray(documentNumberCounters.createdBy, ids));
  }
  await db
    .delete(approvalPolicies)
    .where(like(approvalPolicies.name, `${NAME}%`));
  if (ids.length > 0) {
    // Fallback / system-made rows stamped with a TEST employee.
    await db
      .delete(approvalPolicies)
      .where(inArray(approvalPolicies.createdBy, ids));
  }
  await db.delete(employees).where(like(employees.email, `${PREFIX}%`));
  await db.delete(roles).where(like(roles.name, `${PREFIX}%`));
  await db.delete(supplierMaster).where(like(supplierMaster.name, `${NAME}%`));
  await db.delete(machines).where(like(machines.name, `${NAME}%`));
  await db.delete(itemMaster).where(like(itemMaster.sku, "TEST_APRPOL_%"));
}

beforeAll(async () => {
  await cleanup();
  const active = await db
    .select({ id: approvalPolicies.id })
    .from(approvalPolicies)
    .where(eq(approvalPolicies.isActive, true));
  deactivatedIds = active.map((a) => a.id);
  if (deactivatedIds.length > 0) {
    await db
      .update(approvalPolicies)
      .set({ isActive: false })
      .where(inArray(approvalPolicies.id, deactivatedIds));
  }

  const [it] = await db
    .insert(itemMaster)
    .values({
      sku: "TEST_APRPOL_A",
      name: "TEST_aprpol item",
      category: "Consumable",
      uom: "pcs",
      averageCostPaise: 1000,
      isActive: true,
    })
    .returning({ id: itemMaster.id });
  if (!it) throw new Error("Fixture setup: item failed");
  itemId = it.id;
  const [m] = await db
    .insert(machines)
    .values({ name: `${NAME}machine` })
    .returning({ id: machines.id });
  if (!m) throw new Error("Fixture setup: machine failed");
  machineId = m.id;
  const [s] = await db
    .insert(supplierMaster)
    .values({ name: `${NAME}supplier`, isActive: true })
    .returning({ id: supplierMaster.id });
  if (!s) throw new Error("Fixture setup: supplier failed");
  supplierId = s.id;

  const [sa] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, "super-admin"))
    .limit(1);
  const [ownerRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, "owner"))
    .limit(1);
  if (!sa || !ownerRole) throw new Error("Fixture setup: system roles missing");

  await makeUser("super", sa.id);
  await makeUser("nokeys", await makeRole("nokeys", []));
  await makeUser("viewer", await makeRole("viewer", ["approval.policy.view"]));
  await makeUser(
    "manager",
    await makeRole("manager", ["approval.policy.manage"]),
  );
  await makeUser(
    "req",
    await makeRole("req", ["pr.manage", "po.manage", "pr.link_machine"]),
  );
  await makeUser("ap1", await makeRole("ap1", []));
  await makeUser("ap2", await makeRole("ap2", []));
  // A real approver for role "owner" steps.
  await makeUser("theowner", ownerRole.id, false);
});

afterAll(async () => {
  if (deactivatedIds.length > 0) {
    await db
      .update(approvalPolicies)
      .set({ isActive: true })
      .where(inArray(approvalPolicies.id, deactivatedIds));
  }
  await cleanup();
});

beforeEach(resetPolicies);

describe("BR-APR-01 access", () => {
  test("BR-APR-01 no login -> 401", async () => {
    expect((await call(null, "GET", "/api/approval/getPolicies")).status).toBe(
      401,
    );
  });

  test("BR-APR-01 user without keys: list, details, create, edit -> 403", async () => {
    const p = await createOk();
    const list = await call("nokeys", "GET", "/api/approval/getPolicies");
    expect(list.status).toBe(403);
    expect((await json(list)).code).toBe("PERMISSION_DENIED");
    expect((await getPolicy("nokeys", p.id)).status).toBe(403);
    expect((await createPolicy("nokeys")).status).toBe(403);
    expect((await patchPolicy("nokeys", p.id, { name: "X" })).status).toBe(403);
  });

  test("BR-APR-01 view-only holder lists and reads (200) but cannot create or edit (403)", async () => {
    const p = await createOk();
    expect(
      (await call("viewer", "GET", "/api/approval/getPolicies")).status,
    ).toBe(200);
    expect((await getPolicy("viewer", p.id)).status).toBe(200);
    expect((await createPolicy("viewer")).status).toBe(403);
    expect((await patchPolicy("viewer", p.id, { name: "X" })).status).toBe(403);
    expect((await policyRow(p.id))?.name).toBe(p.name as string);
  });

  test("BR-APR-01 manage-only holder can also list and view", async () => {
    const p = await createOk();
    expect(
      (await call("manager", "GET", "/api/approval/getPolicies")).status,
    ).toBe(200);
    expect((await getPolicy("manager", p.id)).status).toBe(200);
  });

  test("BR-APR-01 manage holder creates (201) and edits (200)", async () => {
    const res = await createPolicy("manager");
    expect(res.status).toBe(201);
    const id = (await json(res)).data?.id as number;
    expect(
      (await patchPolicy("manager", id, { name: "TEST_aprpol_r" })).status,
    ).toBe(200);
  });
});

describe("BR-APR-02 header checks", () => {
  test("BR-APR-02 empty name -> 400", async () => {
    expect((await createPolicy("super", { name: "" })).status).toBe(400);
  });

  test("BR-APR-02 priority 0 -> 400", async () => {
    expect((await createPolicy("super", { priority: 0 })).status).toBe(400);
  });

  test("BR-APR-02 negative or fractional priority -> 400", async () => {
    expect((await createPolicy("super", { priority: -3 })).status).toBe(400);
    expect((await createPolicy("super", { priority: 1.5 })).status).toBe(400);
  });

  test("BR-APR-02 missing docType or unknown docType -> 400", async () => {
    expect((await createPolicy("super", { docType: undefined })).status).toBe(
      400,
    );
    expect((await createPolicy("super", { docType: "grn" })).status).toBe(400);
  });

  test("BR-APR-02 unknown category -> 400", async () => {
    expect(
      (await createPolicy("super", { subDocType: "gadgets" })).status,
    ).toBe(400);
  });

  test("BR-APR-02 missing category is stored as any", async () => {
    const res = await createPolicy("super", { subDocType: undefined });
    expect(res.status).toBe(201);
    const id = (await json(res)).data?.id as number;
    expect((await policyRow(id))?.subDocType).toBe("any");
  });

  test("BR-APR-02 every listed category is accepted", async () => {
    let p = 0;
    for (const c of [
      "any",
      "sale_order",
      "stock_reorder",
      "maintenance",
      "tooling",
      "subcontracting",
      "misc",
    ]) {
      p += 1;
      const res = await createPolicy("super", { subDocType: c, priority: p });
      expect(res.status).toBe(201);
      expect((await json(res)).data?.subDocType).toBe(c);
    }
  });

  test("BR-APR-02 doc types pr, po and sco are accepted", async () => {
    for (const d of ["pr", "po", "sco"]) {
      expect((await createPolicy("super", { docType: d })).status).toBe(201);
    }
  });
});

describe("BR-APR-03 chain steps", () => {
  test("BR-APR-03 levels [1,3] (gap) -> 400", async () => {
    const res = await createPolicy("super", {
      approvalChain: [OWNER_STEP, { ...OWNER_STEP, level: 3 }],
    });
    expect(res.status).toBe(400);
  });

  test("BR-APR-03 levels [1,1] (repeat) -> 400", async () => {
    const res = await createPolicy("super", {
      approvalChain: [OWNER_STEP, OWNER_STEP],
    });
    expect(res.status).toBe(400);
  });

  test("BR-APR-03 levels starting at 2 -> 400", async () => {
    const res = await createPolicy("super", {
      approvalChain: [{ ...OWNER_STEP, level: 2 }],
    });
    expect(res.status).toBe(400);
  });

  test("BR-APR-03 role step without role -> 400", async () => {
    const res = await createPolicy("super", {
      approvalChain: [{ level: 1, approverType: "role" }],
    });
    expect(res.status).toBe(400);
  });

  test("BR-APR-03 role step with an employee -> 400", async () => {
    const res = await createPolicy("super", {
      approvalChain: [{ ...OWNER_STEP, employeeId: emp.ap1 }],
    });
    expect(res.status).toBe(400);
  });

  test("BR-APR-03 specific step without employee -> 400", async () => {
    const res = await createPolicy("super", {
      approvalChain: [{ level: 1, approverType: "specific" }],
    });
    expect(res.status).toBe(400);
  });

  test("BR-APR-03 specific step with a role -> 400", async () => {
    const res = await createPolicy("super", {
      approvalChain: [
        {
          level: 1,
          approverType: "specific",
          employeeId: emp.ap1,
          role: "owner",
        },
      ],
    });
    expect(res.status).toBe(400);
  });

  test("BR-APR-03 valid mixed chain of 2 steps -> 201, approvalLevels 2", async () => {
    const res = await createPolicy("super", {
      approvalChain: [
        OWNER_STEP,
        { level: 2, approverType: "specific", employeeId: emp.ap1 },
      ],
    });
    expect(res.status).toBe(201);
    expect((await json(res)).data?.approvalLevels).toBe(2);
  });

  test("BR-APR-03 client approvalLevels 5 with 2 steps is ignored -> stored 2", async () => {
    const res = await createPolicy("super", {
      approvalLevels: 5,
      approvalChain: [
        OWNER_STEP,
        { ...OWNER_STEP, level: 2, role: "back_office" },
      ],
    });
    expect(res.status).toBe(201);
    const id = (await json(res)).data?.id as number;
    expect((await policyRow(id))?.approvalLevels).toBe(2);
  });

  test("BR-APR-03 edit: chain replaced by 3 steps, approvalLevels follows the chain", async () => {
    const p = await createOk();
    const res = await patchPolicy("super", p.id, {
      approvalLevels: 9,
      approvalChain: [
        OWNER_STEP,
        { ...OWNER_STEP, level: 2 },
        { ...OWNER_STEP, level: 3 },
      ],
    });
    expect(res.status).toBe(200);
    expect((await policyRow(p.id))?.approvalLevels).toBe(3);
  });

  test("BR-APR-03 edit with a gap in levels -> 400, stored chain unchanged", async () => {
    const p = await createOk();
    const res = await patchPolicy("super", p.id, {
      approvalChain: [OWNER_STEP, { ...OWNER_STEP, level: 3 }],
    });
    expect(res.status).toBe(400);
    expect((await policyRow(p.id))?.approvalLevels).toBe(1);
  });
});

describe("BR-APR-05 auto-approve", () => {
  test("BR-APR-05 auto on, chain omitted -> 201, levels 0, empty chain", async () => {
    const res = await createPolicy("super", {
      autoApprove: true,
      approvalChain: undefined,
    });
    expect(res.status).toBe(201);
    const id = (await json(res)).data?.id as number;
    const row = await policyRow(id);
    expect(row?.approvalLevels).toBe(0);
    expect(row?.approvalChain).toEqual([]);
    expect(row?.autoApprove).toBe(true);
  });

  test("BR-APR-05 auto on, empty chain -> 201, levels 0", async () => {
    const res = await createPolicy("super", {
      autoApprove: true,
      approvalChain: [],
      priority: 2,
    });
    expect(res.status).toBe(201);
    expect((await json(res)).data?.approvalLevels).toBe(0);
  });

  test("BR-APR-05 auto off, chain omitted -> 400", async () => {
    expect(
      (await createPolicy("super", { approvalChain: undefined })).status,
    ).toBe(400);
  });

  test("BR-APR-05 auto off (explicit), empty chain -> 400", async () => {
    const res = await createPolicy("super", {
      autoApprove: false,
      approvalChain: [],
    });
    expect(res.status).toBe(400);
  });

  test("BR-APR-05 edit: auto off with the stored chain emptied -> 400", async () => {
    const p = await createOk();
    const res = await patchPolicy("super", p.id, { approvalChain: [] });
    expect(res.status).toBe(400);
    expect((await policyRow(p.id))?.approvalLevels).toBe(1);
  });
});

describe("BR-APR-06 amount limits", () => {
  test("BR-APR-06 negative limit -> 400", async () => {
    expect((await createPolicy("super", { minAmountPaise: -1 })).status).toBe(
      400,
    );
    expect((await createPolicy("super", { maxAmountPaise: -1 })).status).toBe(
      400,
    );
  });

  test("BR-APR-06 fractional paise -> 400", async () => {
    expect((await createPolicy("super", { minAmountPaise: 10.5 })).status).toBe(
      400,
    );
  });

  test("BR-APR-06 max equal to min -> 400", async () => {
    const res = await createPolicy("super", {
      minAmountPaise: 1000,
      maxAmountPaise: 1000,
    });
    expect(res.status).toBe(400);
  });

  test("BR-APR-06 max below min -> 400", async () => {
    const res = await createPolicy("super", {
      minAmountPaise: 2000,
      maxAmountPaise: 1000,
    });
    expect(res.status).toBe(400);
  });

  test("BR-APR-06 only one limit, zero, or none -> 201", async () => {
    expect((await createPolicy("super", { minAmountPaise: 0 })).status).toBe(
      201,
    );
    expect(
      (await createPolicy("super", { subDocType: "misc", maxAmountPaise: 500 }))
        .status,
    ).toBe(201);
    const both = await createPolicy("super", {
      subDocType: "maintenance",
      minAmountPaise: 0,
      maxAmountPaise: 1,
    });
    expect(both.status).toBe(201);
    expect((await json(both)).data?.maxAmountPaise).toBe(1);
  });

  test("BR-APR-06 edit: stored min 50,000 rupees, max set to 10,000 rupees -> 400", async () => {
    const p = await createOk({ minAmountPaise: 5000000 });
    const res = await patchPolicy("super", p.id, { maxAmountPaise: 1000000 });
    expect(res.status).toBe(400);
    expect((await policyRow(p.id))?.maxAmountPaise).toBeNull();
  });

  test("BR-APR-06 edit: stored max, min raised above it -> 400", async () => {
    const p = await createOk({ maxAmountPaise: 1000000 });
    const res = await patchPolicy("super", p.id, { minAmountPaise: 2000000 });
    expect(res.status).toBe(400);
  });

  test("BR-APR-06 edit: valid change against stored value -> 200", async () => {
    const p = await createOk({ minAmountPaise: 1000000 });
    const res = await patchPolicy("super", p.id, { maxAmountPaise: 5000000 });
    expect(res.status).toBe(200);
    const row = await policyRow(p.id);
    expect(row?.minAmountPaise).toBe(1000000);
    expect(row?.maxAmountPaise).toBe(5000000);
  });
});

describe("BR-APR-07 one active policy per slot", () => {
  test("BR-APR-07 second active in the same slot -> 409 POLICY_PRIORITY_TAKEN", async () => {
    await createOk();
    const res = await createPolicy("super");
    expect(res.status).toBe(409);
    expect((await json(res)).code).toBe("POLICY_PRIORITY_TAKEN");
  });

  test("BR-APR-07 created inactive in a taken slot -> 201", async () => {
    await createOk();
    const res = await createPolicy("super", { isActive: false });
    expect(res.status).toBe(201);
  });

  test("BR-APR-07 different category, doc type or priority is a different slot", async () => {
    await createOk();
    expect((await createPolicy("super", { subDocType: "misc" })).status).toBe(
      201,
    );
    expect((await createPolicy("super", { docType: "po" })).status).toBe(201);
    expect((await createPolicy("super", { priority: 2 })).status).toBe(201);
  });

  test("BR-APR-07 edit priority into a taken slot -> 409, priority unchanged", async () => {
    await createOk({ priority: 1 });
    const b = await createOk({ priority: 2 });
    const res = await patchPolicy("super", b.id, { priority: 1 });
    expect(res.status).toBe(409);
    expect((await json(res)).code).toBe("POLICY_PRIORITY_TAKEN");
    expect((await policyRow(b.id))?.priority).toBe(2);
  });

  test("BR-APR-07 edit category into a taken slot -> 409", async () => {
    await createOk({ subDocType: "tooling" });
    const b = await createOk({ subDocType: "misc" });
    const res = await patchPolicy("super", b.id, { subDocType: "tooling" });
    expect(res.status).toBe(409);
  });

  test("BR-APR-07 re-activate into a taken slot -> 409, stays inactive", async () => {
    const old = await createOk({ isActive: false });
    await createOk();
    const res = await patchPolicy("super", old.id, { isActive: true });
    expect(res.status).toBe(409);
    expect((await json(res)).code).toBe("POLICY_PRIORITY_TAKEN");
    expect((await policyRow(old.id))?.isActive).toBe(false);
  });

  test("BR-APR-07 retire frees the slot; re-activate works when free", async () => {
    const a = await createOk();
    expect((await patchPolicy("super", a.id, { isActive: false })).status).toBe(
      200,
    );
    const b = await createOk();
    expect(b.id).not.toBe(a.id);
    expect((await patchPolicy("super", b.id, { isActive: false })).status).toBe(
      200,
    );
    expect((await patchPolicy("super", a.id, { isActive: true })).status).toBe(
      200,
    );
  });

  test("BR-APR-07 editing a policy without touching its slot never conflicts with itself", async () => {
    const a = await createOk();
    expect(
      (await patchPolicy("super", a.id, { name: "TEST_aprpol_same" })).status,
    ).toBe(200);
  });
});

describe("BR-APR-08 partial edit", () => {
  test("BR-APR-08 PATCH name only leaves every other field as stored (category not reset to any)", async () => {
    const p = await createOk({
      subDocType: "tooling",
      description: "TEST_aprpol desc",
      priority: 3,
      minAmountPaise: 2500000,
      maxAmountPaise: 10000000,
      approvalChain: [
        OWNER_STEP,
        { ...OWNER_STEP, level: 2, role: "back_office" },
      ],
    });
    const before = await policyRow(p.id);
    const res = await patchPolicy("super", p.id, {
      name: "TEST_aprpol_renamed",
    });
    expect(res.status).toBe(200);
    const after = await policyRow(p.id);
    expect(after?.name).toBe("TEST_aprpol_renamed");
    expect(after?.subDocType).toBe("tooling");
    expect(after?.description).toBe("TEST_aprpol desc");
    expect(after?.priority).toBe(3);
    expect(after?.minAmountPaise).toBe(2500000);
    expect(after?.maxAmountPaise).toBe(10000000);
    expect(after?.approvalLevels).toBe(2);
    expect(after?.approvalChain).toEqual(before?.approvalChain as never);
    expect(after?.autoApprove).toBe(before?.autoApprove as boolean);
    expect(after?.isActive).toBe(true);
    expect(after?.docType).toBe("pr");
  });

  test("BR-APR-08 response shows the full stored policy", async () => {
    const p = await createOk({ subDocType: "maintenance" });
    const res = await patchPolicy("super", p.id, { priority: 4 });
    expect((await json(res)).data?.subDocType).toBe("maintenance");
  });

  test("BR-APR-08 a sent category is applied", async () => {
    const p = await createOk({ subDocType: "tooling" });
    expect(
      (await patchPolicy("super", p.id, { subDocType: "misc" })).status,
    ).toBe(200);
    expect((await policyRow(p.id))?.subDocType).toBe("misc");
  });

  test("BR-APR-08 unknown policy id -> 404", async () => {
    expect((await patchPolicy("super", 999999999, { name: "X" })).status).toBe(
      404,
    );
  });
});

describe("BR-APR-09 null clears", () => {
  test("BR-APR-09 null clears description, min and max", async () => {
    const p = await createOk({
      description: "TEST_aprpol d",
      minAmountPaise: 100,
      maxAmountPaise: 900,
    });
    const res = await patchPolicy("super", p.id, {
      description: null,
      minAmountPaise: null,
      maxAmountPaise: null,
    });
    expect(res.status).toBe(200);
    const row = await policyRow(p.id);
    expect(row?.description).toBeNull();
    expect(row?.minAmountPaise).toBeNull();
    expect(row?.maxAmountPaise).toBeNull();
  });

  test("BR-APR-09 null on max alone removes the upper limit", async () => {
    const p = await createOk({ minAmountPaise: 100, maxAmountPaise: 900 });
    expect(
      (await patchPolicy("super", p.id, { maxAmountPaise: null })).status,
    ).toBe(200);
    const row = await policyRow(p.id);
    expect(row?.maxAmountPaise).toBeNull();
    expect(row?.minAmountPaise).toBe(100);
  });

  for (const field of [
    "name",
    "priority",
    "subDocType",
    "isActive",
    "autoApprove",
    "approvalChain",
  ]) {
    test(`BR-APR-09 null on ${field} -> 400, nothing changed`, async () => {
      const p = await createOk({ subDocType: "misc" });
      const before = await policyRow(p.id);
      const res = await patchPolicy("super", p.id, { [field]: null });
      expect(res.status).toBe(400);
      const after = await policyRow(p.id);
      expect(after?.name).toBe(before?.name as string);
      expect(after?.priority).toBe(before?.priority as number);
      expect(after?.subDocType).toBe("misc");
      expect(after?.isActive).toBe(true);
    });
  }
});

describe("BR-APR-10 empty edit", () => {
  test("BR-APR-10 PATCH {} -> 400", async () => {
    const p = await createOk();
    expect((await patchPolicy("super", p.id, {})).status).toBe(400);
  });

  test("BR-APR-10 min amount alone counts as an updatable field -> 200", async () => {
    const p = await createOk();
    const res = await patchPolicy("super", p.id, { minAmountPaise: 100 });
    expect(res.status).toBe(200);
    expect((await policyRow(p.id))?.minAmountPaise).toBe(100);
  });

  test("BR-APR-10 max amount alone counts as an updatable field -> 200", async () => {
    const p = await createOk();
    expect(
      (await patchPolicy("super", p.id, { maxAmountPaise: 100 })).status,
    ).toBe(200);
  });

  test("BR-APR-10 only unknown fields -> 400", async () => {
    const p = await createOk();
    expect((await patchPolicy("super", p.id, { bogus: 1 })).status).toBe(400);
  });
});

describe("BR-APR-11 doc type fixed, never deleted", () => {
  test("BR-APR-11 PATCH docType -> 400, docType unchanged", async () => {
    const p = await createOk({ docType: "pr" });
    const res = await patchPolicy("super", p.id, { docType: "po" });
    expect(res.status).toBe(400);
    expect((await policyRow(p.id))?.docType).toBe("pr");
  });

  test("BR-APR-11 no delete endpoint: DELETE on a policy path is not served", async () => {
    const p = await createOk();
    for (const path of [
      `/api/approval/updatePolicy/${p.id}`,
      `/api/approval/deletePolicy/${p.id}`,
      `/api/approval/getPolicyDetails/${p.id}`,
    ]) {
      const res = await call("super", "DELETE", path);
      expect([404, 405]).toContain(res.status);
    }
    expect(await policyRow(p.id)).toBeDefined();
  });

  test("BR-APR-11 retired policy keeps its row and stops matching new submissions", async () => {
    const a = await insPolicy({ docType: "pr", cat: "tooling", priority: 1 });
    const res = await patchPolicy("super", a, { isActive: false });
    expect(res.status).toBe(200);
    expect(await policyRow(a)).toBeDefined();
    const r = await matchedPolicy("tooling", 100000);
    expect(r.policyId).not.toBe(a);
  });
});

describe("BR-APR-13 in-flight requests keep their own chain", () => {
  test("BR-APR-13 policy cut from 2 steps to 1, re-prioritised and retired: request still needs 2 approvals", async () => {
    const pid = await insPolicy({
      docType: "pr",
      cat: "misc",
      priority: 1,
      chain: [
        { level: 1, approverType: "specific", employeeId: emp.ap1 },
        { level: 2, approverType: "specific", employeeId: emp.ap2 },
      ],
    });
    const r = await matchedPolicy("misc", 100000);
    expect(r.policyId).toBe(pid);
    expect(r.totalLevels).toBe(2);

    expect(
      (
        await patchPolicy("super", pid, {
          approvalChain: [
            { level: 1, approverType: "specific", employeeId: emp.ap2 },
          ],
        })
      ).status,
    ).toBe(200);
    expect((await patchPolicy("super", pid, { priority: 7 })).status).toBe(200);
    expect((await patchPolicy("super", pid, { isActive: false })).status).toBe(
      200,
    );

    const act = (tag: string) =>
      call(tag, "POST", `/api/approval/actOnRequest/${r.id}`, {
        action: "approve",
        notes: "TEST_aprpol ok",
      });

    // ap2 is step 1 of the edited policy but only step 2 of this request: not allowed yet.
    expect((await act("ap2")).status).toBe(403);

    const first = await act("ap1");
    expect(first.status).toBe(200);
    const mid = (await json(first)).data as {
      status: string;
      currentLevel: number;
    };
    expect(mid.status).toBe("pending_approval");
    expect(mid.currentLevel).toBe(2);

    const second = await act("ap2");
    expect(second.status).toBe(200);
    expect(((await json(second)).data as { status: string }).status).toBe(
      "approved",
    );
  });
});

describe("BR-APR-14 audit stamps", () => {
  test("BR-APR-14 create stamps createdBy and lastUpdatedBy with the creator", async () => {
    const res = await createPolicy("manager");
    const id = (await json(res)).data?.id as number;
    const row = await policyRow(id);
    expect(row?.createdBy).toBe(emp.manager as number);
    expect(row?.lastUpdatedBy).toBe(emp.manager as number);
    expect(row?.lastUpdatedAt).toBeInstanceOf(Date);
  });

  test("BR-APR-14 edit stamps lastUpdatedBy and moves lastUpdatedAt; createdBy stays", async () => {
    const res = await createPolicy("manager");
    const id = (await json(res)).data?.id as number;
    const before = await policyRow(id);
    await Bun.sleep(1100);
    expect(
      (await patchPolicy("super", id, { name: "TEST_aprpol_edited" })).status,
    ).toBe(200);
    const after = await policyRow(id);
    expect(after?.createdBy).toBe(emp.manager as number);
    expect(after?.lastUpdatedBy).toBe(emp.super as number);
    const afterAt = Number(after?.lastUpdatedAt);
    const beforeAt = Number(before?.lastUpdatedAt);
    expect(afterAt).toBeGreaterThan(beforeAt);
  });
});

describe("BR-APR-15 sale-order flag dropped", () => {
  test("BR-APR-15 isSaleOrderLinked true on create is not accepted (400 or ignored, never stored true)", async () => {
    const res = await createPolicy("super", { isSaleOrderLinked: true });
    if (res.status === 201) {
      const id = (await json(res)).data?.id as number;
      expect((await policyRow(id))?.isSaleOrderLinked).not.toBe(true);
    } else {
      expect(res.status).toBe(400);
    }
  });

  test("BR-APR-15 isSaleOrderLinked true on edit is not accepted (400 or ignored, never stored true)", async () => {
    const p = await createOk();
    const res = await patchPolicy("super", p.id, {
      isSaleOrderLinked: true,
      name: "TEST_aprpol_flag",
    });
    if (res.status === 200) {
      expect((await policyRow(p.id))?.isSaleOrderLinked).not.toBe(true);
    } else {
      expect(res.status).toBe(400);
    }
  });

  test("BR-APR-15 flag does not take part in matching; sale_order category does (PR sale_order 30,000 rupees)", async () => {
    const fast = await insPolicy({
      docType: "pr",
      cat: "sale_order",
      max: 5000000,
      priority: 1,
    });
    await insPolicy({ docType: "pr", cat: "any", priority: 1 });
    const r = await matchedPolicy("sale_order", 3000000);
    expect(r.policyId).toBe(fast);
  });
});

describe("BR-APR-16 candidates", () => {
  test("BR-APR-16 PR tooling: PO/any and PR/maintenance policies do not match -> fallback", async () => {
    const po = await insPolicy({ docType: "po", cat: "any", priority: 1 });
    const mnt = await insPolicy({
      docType: "pr",
      cat: "maintenance",
      priority: 1,
    });
    const r = await matchedPolicy("tooling", 100000);
    expect([po, mnt]).not.toContain(r.policyId);
    expect(r.totalLevels).toBe(1);
  });

  test("BR-APR-16 category any matches every PR type", async () => {
    const any = await insPolicy({ docType: "pr", cat: "any", priority: 1 });
    for (const t of ["tooling", "misc", "stock_reorder"]) {
      expect((await matchedPolicy(t, 100000)).policyId).toBe(any);
    }
  });

  test("BR-APR-16 inactive policy is not a candidate", async () => {
    const off = await insPolicy({
      docType: "pr",
      cat: "tooling",
      priority: 1,
      isActive: false,
    });
    const any = await insPolicy({ docType: "pr", cat: "any", priority: 2 });
    expect((await matchedPolicy("tooling", 100000)).policyId).toBe(any);
    expect(off).not.toBe(any);
  });
});

describe("BR-APR-18 amount band", () => {
  test("BR-APR-18 exactly 10,000.00 rupees: band 10k-50k matches, band under 10k does not; 50,000.00 falls in the next band", async () => {
    const under = await insPolicy({
      docType: "pr",
      cat: "misc",
      max: 1000000,
      priority: 1,
    });
    const mid = await insPolicy({
      docType: "pr",
      cat: "misc",
      min: 1000000,
      max: 5000000,
      priority: 2,
    });
    const over = await insPolicy({
      docType: "pr",
      cat: "misc",
      min: 5000000,
      priority: 3,
    });
    expect((await matchedPolicy("misc", 999999)).policyId).toBe(under);
    expect((await matchedPolicy("misc", 1000000)).policyId).toBe(mid);
    expect((await matchedPolicy("misc", 4999999)).policyId).toBe(mid);
    expect((await matchedPolicy("misc", 5000000)).policyId).toBe(over);
    expect((await matchedPolicy("misc", 900000000)).policyId).toBe(over);
  });

  test("BR-APR-18 empty limits mean no limit", async () => {
    const p = await insPolicy({ docType: "pr", cat: "misc", priority: 1 });
    expect((await matchedPolicy("misc", 1000)).policyId).toBe(p);
    expect((await matchedPolicy("misc", 900000000)).policyId).toBe(p);
  });
});

describe("BR-APR-19 most specific match wins", () => {
  test("BR-APR-19 maintenance 5,000 rupees: exact category no limit p2 beats any under 10k p10", async () => {
    const exact = await insPolicy({
      docType: "pr",
      cat: "maintenance",
      priority: 2,
    });
    await insPolicy({ docType: "pr", cat: "any", max: 1000000, priority: 10 });
    expect((await matchedPolicy("maintenance", 500000)).policyId).toBe(exact);
  });

  test("BR-APR-19 level 1 (category + limit) beats level 2 (category, no limit) even at a weaker priority", async () => {
    await insPolicy({ docType: "pr", cat: "misc", priority: 1 });
    const l1 = await insPolicy({
      docType: "pr",
      cat: "misc",
      max: 1000000,
      priority: 50,
    });
    expect((await matchedPolicy("misc", 500000)).policyId).toBe(l1);
  });

  test("BR-APR-19 level 2 (category, no limit) beats level 3 (any + limit)", async () => {
    const l2 = await insPolicy({ docType: "pr", cat: "misc", priority: 99 });
    await insPolicy({ docType: "pr", cat: "any", max: 1000000, priority: 1 });
    expect((await matchedPolicy("misc", 500000)).policyId).toBe(l2);
  });

  test("BR-APR-19 level 3 (any + limit) beats level 4 (any, no limit)", async () => {
    const l3 = await insPolicy({
      docType: "pr",
      cat: "any",
      max: 1000000,
      priority: 50,
    });
    await insPolicy({ docType: "pr", cat: "any", priority: 1 });
    expect((await matchedPolicy("misc", 500000)).policyId).toBe(l3);
  });

  test("BR-APR-19 within a level the lower priority number wins (p10 over p11)", async () => {
    const p10 = await insPolicy({
      docType: "pr",
      cat: "any",
      max: 1000000,
      priority: 10,
    });
    await insPolicy({
      docType: "pr",
      cat: "any",
      min: 0,
      max: 2000000,
      priority: 11,
    });
    expect((await matchedPolicy("misc", 500000)).policyId).toBe(p10);
  });

  test("BR-APR-19 within a level (overlapping bands) the stronger priority wins whatever the insert order", async () => {
    const weak = await insPolicy({
      docType: "pr",
      cat: "tooling",
      min: 0,
      max: 5000000,
      priority: 9,
    });
    const strong = await insPolicy({
      docType: "pr",
      cat: "tooling",
      min: 100,
      max: 9000000,
      priority: 4,
    });
    expect(weak).toBeLessThan(strong);
    expect((await matchedPolicy("tooling", 300000)).policyId).toBe(strong);
  });

  test("BR-APR-19 a more specific policy that does not fit the amount is skipped", async () => {
    await insPolicy({ docType: "pr", cat: "misc", max: 1000000, priority: 1 });
    const fits = await insPolicy({ docType: "pr", cat: "any", priority: 5 });
    expect((await matchedPolicy("misc", 2000000)).policyId).toBe(fits);
  });
});

describe("BR-APR-21 what is matched", () => {
  test("BR-APR-21 PR is matched on its type and its estimated value", async () => {
    const tool = await insPolicy({
      docType: "pr",
      cat: "tooling",
      min: 1000000,
      priority: 1,
    });
    const other = await insPolicy({ docType: "pr", cat: "any", priority: 1 });
    expect((await matchedPolicy("tooling", 1500000)).policyId).toBe(tool);
    expect((await matchedPolicy("tooling", 500000)).policyId).toBe(other);
  });

  /** Approved PR of `type`, one line qty 1; returns its line id. */
  async function approvedPrLine(type: string): Promise<number> {
    seq += 1;
    const [pr] = await db
      .insert(purchaseRequests)
      .values({
        prNumber: `TEST_APRPOL-PR-${seq}-${Date.now()}`,
        type: type as "tooling",
        status: "approved",
        requestedBy: emp.req as number,
        estimatedAmountPaise: 100,
      })
      .returning({ id: purchaseRequests.id });
    if (!pr) throw new Error("Fixture setup: PR insert failed");
    const [line] = await db
      .insert(purchaseRequestItems)
      .values({ prId: pr.id, itemId, requestedQty: 1, uom: "pcs" })
      .returning({ id: purchaseRequestItems.id });
    if (!line) throw new Error("Fixture setup: PR line insert failed");
    return line.id;
  }

  async function poMatch(
    types: string[],
    unitPricePaise: number,
    gstPercent: number,
  ) {
    const lines = [];
    for (const t of types) {
      lines.push({
        prItemId: await approvedPrLine(t),
        unitPricePaise,
        gstPercent,
      });
    }
    const cr = await call("req", "POST", "/api/po/createpo", {
      supplierId,
      paymentTermsDays: 30,
      lines,
    });
    if (cr.status !== 201) {
      throw new Error(
        `Fixture setup: createpo -> ${cr.status} ${JSON.stringify(await cr.json())}`,
      );
    }
    const poId = ((await json(cr)).data as { po: { id: number } }).po.id;
    const res = await call("req", "POST", "/api/approval/submitRequest", {
      docType: "po",
      docId: poId,
    });
    expect(res.status).toBe(201);
    return (await json(res)).data as { policyId: number };
  }

  test("BR-APR-21 PO from tooling PRs only is matched as tooling", async () => {
    await insPolicy({ docType: "po", cat: "any", priority: 1 });
    const tool = await insPolicy({
      docType: "po",
      cat: "tooling",
      priority: 2,
    });
    expect((await poMatch(["tooling"], 100000, 0)).policyId).toBe(tool);
  });

  test("BR-APR-21 PO from tooling + misc PRs (mixed) is matched as any", async () => {
    const any = await insPolicy({ docType: "po", cat: "any", priority: 1 });
    await insPolicy({ docType: "po", cat: "tooling", priority: 2 });
    await insPolicy({ docType: "po", cat: "misc", priority: 3 });
    expect((await poMatch(["tooling", "misc"], 100000, 0)).policyId).toBe(any);
  });

  test("BR-APR-21 PO of 1,00,000 rupees + 18% GST is matched on 1,18,000 rupees", async () => {
    // subtotal 10,000,000 paise; total incl. GST 11,800,000 paise.
    const inclGst = await insPolicy({
      docType: "po",
      cat: "any",
      min: 11000000,
      max: 12000000,
      priority: 1,
    });
    await insPolicy({
      docType: "po",
      cat: "any",
      min: 9000000,
      max: 11000000,
      priority: 2,
    });
    expect((await poMatch(["tooling"], 10000000, 18)).policyId).toBe(inclGst);
  });
});

describe("BR-APR-22 fallback", () => {
  test("BR-APR-22 no policy matches: one owner step, fallback record is inactive", async () => {
    const r = await matchedPolicy("stock_reorder", 100000);
    expect(r.totalLevels).toBe(1);
    expect(r.chainSnapshot).toHaveLength(1);
    expect(r.chainSnapshot[0]).toMatchObject({
      level: 1,
      approverType: "role",
      role: "owner",
    });
    expect(r.status).toBe("pending_approval");
    const row = await policyRow(r.policyId);
    expect(row?.isActive).toBe(false);
  });

  test("BR-APR-22 the inactive fallback never competes: a real policy still wins over it", async () => {
    await matchedPolicy("stock_reorder", 100000);
    const p = await insPolicy({
      docType: "pr",
      cat: "stock_reorder",
      priority: 1,
      chain: [
        { level: 1, approverType: "specific", employeeId: emp.ap1 },
        { level: 2, approverType: "specific", employeeId: emp.ap2 },
      ],
    });
    const r = await matchedPolicy("stock_reorder", 100000);
    expect(r.policyId).toBe(p);
    expect(r.totalLevels).toBe(2);
  });

  test("BR-APR-22 the fallback record is not listed among active policies", async () => {
    await matchedPolicy("stock_reorder", 100000);
    const res = await call(
      "super",
      "GET",
      "/api/approval/getPolicies?isActive=true&pageSize=100",
    );
    expect(res.status).toBe(200);
    const rows = (await json(res)).data as unknown as { name: string }[];
    expect(rows.filter((x) => x.name.startsWith(NAME))).toHaveLength(0);
  });
});
