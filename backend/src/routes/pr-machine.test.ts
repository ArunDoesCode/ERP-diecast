/**
 * docs/specs/auth-setup.md (v6)
 * BR-AUTH-26 the PR "Machine" field belongs to holders of pr.link_machine, who may also read the
 * active machine list without asset.manage; a PR saved with a machine by anyone else -> 403.
 *
 * HTTP-level, real DB, through createApp(). Written by test-writer from the spec only.
 * "Machine" on a PR is the PR's assetId (the only machine link on a PR).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray, like } from "drizzle-orm";
import { createApp } from "../app";
import { db } from "../db/client";
import {
  documentNumberCounters,
  rolePermissions,
  roles,
} from "../db/schemas/01_auth";
import { itemMaster, machines } from "../db/schemas/02_procurement-catalog";
import {
  purchaseRequestItems,
  purchaseRequests,
} from "../db/schemas/02_procurement-purchasing";
import { employees } from "../db/schemas/03_hcm";
import { authService } from "../service/authService";

const app = createApp();
const PREFIX = "test_prmach_";
const PASSWORD = "prmach-password-123";

const emp = {} as Record<string, number>;
const token = {} as Record<string, string>;
let itemId: number;
let machineId: number;
let otherMachineId: number;
let seededPrId: number;

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

async function makeUser(tag: string, roleId: number) {
  const email = `${PREFIX}${tag}@diecast.test`;
  const [e] = await db
    .insert(employees)
    .values({
      name: `TEST_prmach_${tag}`,
      email,
      passwordHash: await Bun.password.hash(PASSWORD),
      roleId,
      isActive: true,
    })
    .returning({ id: employees.id });
  if (!e) throw new Error("Fixture setup: employee insert failed");
  emp[tag] = e.id;
  token[tag] = (await authService.login(email, PASSWORD)).accessToken;
}

function call(tag: string, method: string, path: string, body?: unknown) {
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token[tag]}`,
      "content-type": "application/json",
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  return app.request(path, init);
}

const prBody = (withMachine: boolean) => ({
  type: "tooling",
  notes: "TEST_prmach note",
  ...(withMachine ? { assetId: machineId } : {}),
  items: [{ itemId, requestedQty: 2 }],
});

async function cleanup() {
  const ids = (
    await db
      .select({ id: employees.id })
      .from(employees)
      .where(like(employees.email, `${PREFIX}%`))
  ).map((e) => e.id);
  if (ids.length > 0) {
    const prs = await db
      .select({ id: purchaseRequests.id })
      .from(purchaseRequests)
      .where(inArray(purchaseRequests.requestedBy, ids));
    const prIds = prs.map((p) => p.id);
    if (prIds.length > 0) {
      await db
        .delete(purchaseRequestItems)
        .where(inArray(purchaseRequestItems.prId, prIds));
      await db
        .delete(purchaseRequests)
        .where(inArray(purchaseRequests.id, prIds));
    }
  }
  if (ids.length > 0) {
    // Numbering counters keep an FK to their first creator; they are recreated on demand.
    await db
      .update(documentNumberCounters)
      .set({ lastUpdatedBy: null })
      .where(inArray(documentNumberCounters.lastUpdatedBy, ids));
    await db
      .delete(documentNumberCounters)
      .where(inArray(documentNumberCounters.createdBy, ids));
  }
  await db.delete(employees).where(like(employees.email, `${PREFIX}%`));
  await db.delete(roles).where(like(roles.name, `${PREFIX}%`));
  await db.delete(machines).where(like(machines.name, "TEST_prmach_%"));
  await db.delete(itemMaster).where(like(itemMaster.sku, "TEST_PRMACH_%"));
}

beforeAll(async () => {
  await cleanup();
  const [it] = await db
    .insert(itemMaster)
    .values({
      sku: "TEST_PRMACH_1",
      name: "TEST_prmach item",
      category: "Consumable",
      uom: "pcs",
    })
    .returning({ id: itemMaster.id });
  const [m] = await db
    .insert(machines)
    .values({ name: "TEST_prmach_machine" })
    .returning({ id: machines.id });
  const [m2] = await db
    .insert(machines)
    .values({ name: "TEST_prmach_machine2" })
    .returning({ id: machines.id });
  if (!it || !m || !m2) throw new Error("Fixture setup failed");
  itemId = it.id;
  machineId = m.id;
  otherMachineId = m2.id;

  await makeUser(
    "linker",
    await makeRole("linker", ["pr.manage", "pr.link_machine"]),
  );
  await makeUser("plain", await makeRole("plain", ["pr.manage"]));
  await makeUser("assetmgr", await makeRole("assetmgr", ["asset.manage"]));
  await makeUser("nokeys", await makeRole("nokeys", []));
  const [sa] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, "super-admin"))
    .limit(1);
  if (!sa) throw new Error("Fixture setup: super-admin role missing");
  await makeUser("super", sa.id);

  const [pr] = await db
    .insert(purchaseRequests)
    .values({
      prNumber: "TEST_PRMACH_PR1",
      type: "tooling",
      requestedBy: emp.plain as number,
      notes: "TEST_prmach seed",
    })
    .returning({ id: purchaseRequests.id });
  if (!pr) throw new Error("Fixture setup: seed PR insert failed");
  seededPrId = pr.id;
});

afterAll(cleanup);

describe("BR-AUTH-26 machine list readable with pr.link_machine", () => {
  test("BR-AUTH-26 holder of pr.link_machine (no asset.manage) reads the machine list", async () => {
    const res = await call("linker", "GET", "/api/asset/machines");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { id: number; name: string }[];
    };
    const mine = body.data.find((x) => x.id === machineId);
    expect(mine?.name).toBe("TEST_prmach_machine");
  });

  test("BR-AUTH-26 holder of asset.manage (no pr.link_machine) still reads the machine list", async () => {
    const res = await call("assetmgr", "GET", "/api/asset/machines");
    expect(res.status).toBe(200);
  });

  test("BR-AUTH-26 holder of pr.manage only cannot read the machine list", async () => {
    const res = await call("plain", "GET", "/api/asset/machines");
    expect(res.status).toBe(403);
  });

  test("BR-AUTH-26 role with no keys cannot read the machine list", async () => {
    const res = await call("nokeys", "GET", "/api/asset/machines");
    expect(res.status).toBe(403);
  });

  test("BR-AUTH-26 pr.link_machine does not open machine writes", async () => {
    const res = await call("linker", "POST", "/api/asset/machines", {
      name: "TEST_prmach_x",
    });
    expect(res.status).toBe(403);
  });
});

describe("BR-AUTH-26 saving a PR with a machine", () => {
  test("BR-AUTH-26 PR saved with a machine by a user without pr.link_machine -> 403", async () => {
    const res = await call("plain", "POST", "/api/pr/createpr", prBody(true));
    expect(res.status).toBe(403);
  });

  test("BR-AUTH-26 403 leaves no PR behind", async () => {
    const before = await db
      .select({ id: purchaseRequests.id })
      .from(purchaseRequests)
      .where(eq(purchaseRequests.requestedBy, emp.plain as number));
    await call("plain", "POST", "/api/pr/createpr", prBody(true));
    const after = await db
      .select({ id: purchaseRequests.id })
      .from(purchaseRequests)
      .where(eq(purchaseRequests.requestedBy, emp.plain as number));
    expect(after.length).toBe(before.length);
  });

  test("BR-AUTH-26 the same user can save a PR without a machine", async () => {
    const res = await call("plain", "POST", "/api/pr/createpr", prBody(false));
    expect(res.status).toBe(201);
  });

  test("BR-AUTH-26 holder of pr.link_machine saves a PR with a machine", async () => {
    const res = await call("linker", "POST", "/api/pr/createpr", prBody(true));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { pr: { id: number } } };
    const [row] = await db
      .select({ assetId: purchaseRequests.assetId })
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, body.data.pr.id));
    expect(row?.assetId).toBe(machineId);
  });

  test("BR-AUTH-26 super-admin saves a PR with a machine", async () => {
    const res = await call("super", "POST", "/api/pr/createpr", prBody(true));
    expect(res.status).toBe(201);
  });

  test("BR-AUTH-26 updating a PR to add a machine without pr.link_machine -> 403", async () => {
    const res = await call("plain", "PATCH", "/api/pr/updatepr", {
      prId: seededPrId,
      assetId: machineId,
    });
    expect(res.status).toBe(403);
    const [row] = await db
      .select({ assetId: purchaseRequests.assetId })
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, seededPrId));
    expect(row?.assetId).toBeNull();
  });

  test("BR-AUTH-26 updating a PR to add a machine with pr.link_machine succeeds", async () => {
    // BR-PR-17: only the requester (or super-admin) may edit, so the linker edits their own PR.
    const [own] = await db
      .insert(purchaseRequests)
      .values({
        prNumber: "TEST_PRMACH_PR2",
        type: "tooling",
        requestedBy: emp.linker as number,
        notes: "TEST_prmach seed linker",
      })
      .returning({ id: purchaseRequests.id });
    if (!own) throw new Error("Fixture setup: linker PR insert failed");
    const res = await call("linker", "PATCH", "/api/pr/updatepr", {
      prId: own.id,
      assetId: machineId,
    });
    expect(res.status).toBe(200);
  });
});

describe("BR-AUTH-26 (v2) key is checked only when the machine is added or changed", () => {
  async function prWithMachine(requester: string, prNumber: string) {
    const [pr] = await db
      .insert(purchaseRequests)
      .values({
        prNumber,
        type: "tooling",
        requestedBy: emp[requester] as number,
        assetId: machineId,
        notes: "TEST_prmach seed with machine",
      })
      .returning({ id: purchaseRequests.id });
    if (!pr) throw new Error("Fixture setup: PR with machine failed");
    return pr.id;
  }
  const machineOf = async (id: number) =>
    (
      await db
        .select({ assetId: purchaseRequests.assetId })
        .from(purchaseRequests)
        .where(eq(purchaseRequests.id, id))
    )[0]?.assetId;

  test("BR-AUTH-26 edit resends the same machine without pr.link_machine -> 200, machine kept", async () => {
    const id = await prWithMachine("plain", "TEST_PRMACH_PR3");
    const res = await call("plain", "PATCH", "/api/pr/updatepr", {
      prId: id,
      assetId: machineId,
      notes: "TEST_prmach edited notes",
    });
    expect(res.status).toBe(200);
    expect(await machineOf(id)).toBe(machineId);
  });

  test("BR-AUTH-26 edit changes to a different machine without pr.link_machine -> 403, machine kept", async () => {
    const id = await prWithMachine("plain", "TEST_PRMACH_PR4");
    const res = await call("plain", "PATCH", "/api/pr/updatepr", {
      prId: id,
      assetId: otherMachineId,
    });
    expect(res.status).toBe(403);
    expect(await machineOf(id)).toBe(machineId);
  });

  test("BR-AUTH-26 edit not mentioning the machine without pr.link_machine -> 200", async () => {
    const id = await prWithMachine("plain", "TEST_PRMACH_PR5");
    const res = await call("plain", "PATCH", "/api/pr/updatepr", {
      prId: id,
      notes: "TEST_prmach only notes",
    });
    expect(res.status).toBe(200);
    expect(await machineOf(id)).toBe(machineId);
  });
});
